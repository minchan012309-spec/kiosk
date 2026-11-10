import {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  screen,
  globalShortcut,
  safeStorage,
  shell,
} from "electron";
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  statSync,
} from "node:fs";
import { join, resolve, dirname, win32 } from "node:path";
import { spawn, execFile, type ChildProcess } from "node:child_process";
import { compareSync } from "bcryptjs";
import { z } from "zod";
import {
  cloudRequest,
  authorizeCloudOperator,
} from "../../../packages/shared/src/cloud";
import {
  SUPABASE_URL,
  WEB_URL,
} from "../../../packages/shared/src/cloud-config";
import { SessionClock, GameController, ExitGate } from "./runtime";
import type { DeviceState } from "../../../packages/shared/src/contracts";
declare const __APP_ROLE__: "server" | "station";
const ROLE =
  typeof __APP_ROLE__ === "undefined"
    ? process.argv.includes("--server")
      ? "server"
      : "station"
    : __APP_ROLE__;
app.setName(ROLE === "server" ? "PC Club Admin" : "PC Club Station");
if (process.platform === "win32")
  app.setAppUserModelId("school.pcclub." + ROLE);
app.setPath(
  "userData",
  process.env.CAFE_DESKTOP_DATA || join(app.getPath("appData"), "PCClub", ROLE),
);
const single = app.requestSingleInstanceLock();
if (!single) app.quit();
const root = app.isPackaged ? app.getAppPath() : resolve("."),
  webRoot = join(root, "dist/web"),
  dataDir = app.getPath("userData"),
  configFile = join(dataDir, "cloud-station.json");
let main: BrowserWindow | undefined,
  overlay: BrowserWindow | undefined,
  kiosk: BrowserWindow | undefined,
  approvedQuit = false;
let token = "",
  recoveryHash = "",
  lastSessionId: string | null = null,
  pendingEnd: string | null = null,
  recoveryAttempts = 0,
  recoveryBlockedUntil = 0;
let localGamePaths: Record<string, string> = {},
  operatorUntil = 0,
  deviceState: DeviceState | undefined,
  online = false,
  currentGame: string | undefined,
  lastError = "",
  lastStopError = "",
  polling = false,
  stopping = false;
let shortcutWarning = "";
let thankYouUntil = 0,
  closeAttemptAt = 0,
  closeNotice = "",
  pendingClose = false;
let serverNow = Date.now(),
  serverReceived = performance.now(),
  gate: ExitGate | undefined,
  consumed: string[] = [];
const clock = new SessionClock(),
  children = new Map<number, ChildProcess>();
const trustedNow = () => serverNow + performance.now() - serverReceived;
function saveConfig() {
  writeFileSync(
    configFile,
    JSON.stringify({
      projectUrl: SUPABASE_URL,
      encryptedToken: token
        ? safeStorage.encryptString(token).toString("base64")
        : undefined,
      recoveryHash,
      recoveryAttempts,
      recoveryBlockedUntil,
      lastSessionId,
      pendingEnd,
      localGamePaths,
      consumed: consumed.slice(-500),
      pendingClose,
    }),
    { mode: 0o600 },
  );
}
function loadConfig() {
  if (!existsSync(configFile)) return;
  const c = JSON.parse(readFileSync(configFile, "utf8"));
  if (c.projectUrl !== SUPABASE_URL) return;
  localGamePaths = c.localGamePaths || {};
  recoveryHash = c.recoveryHash || "";
  recoveryAttempts = c.recoveryAttempts || 0;
  recoveryBlockedUntil = c.recoveryBlockedUntil || 0;
  lastSessionId = c.lastSessionId || null;
  pendingEnd = c.pendingEnd || null;
  consumed = c.consumed || [];
  pendingClose = !!c.pendingClose;
  if (c.encryptedToken) {
    if (!safeStorage.isEncryptionAvailable())
      throw Error("Windows 보안 저장소를 사용할 수 없습니다.");
    token = safeStorage.decryptString(Buffer.from(c.encryptedToken, "base64"));
  }
}
function executablePath(input: string) {
  let path = input.trim().replace(/^"(.*)"$/, "$1");
  path = path.replace(/%([^%]+)%/g, (full, name) => {
    const key = Object.keys(process.env).find(
      (k) => k.toLowerCase() === String(name).toLowerCase(),
    );
    return key ? process.env[key] || full : full;
  });
  if (!win32.isAbsolute(path) || !path.toLowerCase().endsWith(".exe"))
    throw Error(
      "Windows 실행 파일(.exe)의 전체 경로가 필요합니다. 관리자 설정에서 파일을 직접 선택하세요.",
    );
  path = win32.normalize(path);
  if (!existsSync(path) || !statSync(path).isFile())
    throw Error(
      `이 PC에 실행 파일이 없습니다: ${path}\n게임을 먼저 설치한 뒤 관리자 설정 → 이 PC 게임 경로에서 실행 파일을 선택하세요.`,
    );
  return path;
}
const games = new GameController(
  async (path, args) => {
    if (process.platform !== "win32")
      throw Error("게임 실행은 Windows PC에서 지원합니다.");
    const executable = executablePath(path);
    return new Promise<number>((yes, no) => {
      const child = spawn(executable, args, {
        shell: false,
        cwd: dirname(executable),
        windowsHide: false,
        stdio: "ignore",
      });
      child.once("error", (e) =>
        no(Error("게임 시작에 실패했습니다: " + e.message)),
      );
      child.once("spawn", () => {
        children.set(child.pid!, child);
        yes(child.pid!);
      });
      child.once("exit", () => {
        children.delete(child.pid!);
        if (!children.size) currentGame = undefined;
        pushState();
      });
    });
  },
  async (pid) => {
    const child = children.get(pid);
    if (!child || child.exitCode !== null || child.signalCode !== null) {
      children.delete(pid);
      return;
    }
    await new Promise<void>((yes, no) =>
      execFile(
        "taskkill.exe",
        ["/PID", String(pid), "/T", "/F"],
        { windowsHide: true, timeout: 10000 },
        (error) => {
          if (error && child.exitCode === null && child.signalCode === null)
            no(Error("게임 종료에 실패했습니다. 운영자에게 알려 주세요."));
          else {
            children.delete(pid);
            yes();
          }
        },
      ),
    );
  },
);
const request = (path: string, body?: unknown, key?: string) =>
  cloudRequest(path, body, token, key);
function state() {
  return {
    ...(deviceState || {
      device: undefined,
      session: null,
      products: [],
      extensions: [],
      games: [],
      orders: [],
      commands: [],
      exitRequests: [],
      serverNow: Date.now(),
    }),
    cloud: true,
    phase:
      performance.now() < thankYouUntil
        ? "thanks"
        : deviceState?.session
          ? "active"
          : deviceState?.reservation
            ? "login"
            : "idle",
    closeAttemptAt,
    closeNotice,
    registered: !!token,
    configured: true,
    serverUrl: SUPABASE_URL,
    online,
    remaining: deviceState?.session ? clock.remaining() : 0,
    currentGame,
    error: lastStopError || lastError || shortcutWarning,
    operatorUnlocked: operatorUntil > Date.now(),
    localGamePaths,
  };
}
function pushState() {
  for (const w of [main, overlay])
    if (w && !w.isDestroyed()) w.webContents.send("cafe:state", state());
}
async function stopGame() {
  try {
    await games.stop();
    currentGame = undefined;
    lastStopError = "";
  } catch (e) {
    lastStopError = "게임 종료를 재시도하고 있습니다. " + (e as Error).message;
    throw e;
  } finally {
    pushState();
  }
}
async function handleCommands() {
  if (!deviceState) return;
  gate ??= new ExitGate(deviceState.device.id, trustedNow);
  for (const c of deviceState.commands) {
    if (consumed.includes(c.id) || !gate.consume(c)) continue;
    try {
      await stopGame();
      if (c.type === "shutdown" && process.platform !== "win32")
        throw Error("Windows PC에서만 종료할 수 있습니다.");
      await request("/device/commands/" + c.id + "/ack", {
        status: "accepted",
      });
      consumed.push(c.id);
      saveConfig();
      if (c.type === "exit") {
        approvedQuit = true;
        app.quit();
        return;
      }
      await new Promise<void>((yes, no) =>
        execFile(
          "shutdown.exe",
          ["/s", "/t", "5"],
          { windowsHide: true, timeout: 5000 },
          (error) => (error ? no(error) : yes()),
        ),
      );
      approvedQuit = true;
      app.quit();
      return;
    } catch (e) {
      lastError = (e as Error).message;
      try {
        await request("/device/commands/" + c.id + "/ack", {
          status: "failed",
          message: lastError,
        });
      } catch {}
      pushState();
    }
  }
}
async function poll() {
  if (!token || polling) return;
  polling = true;
  try {
    await request("/device/heartbeat", {});
    if (pendingClose) {
      await request("/device/exit-requests", {
        reason: "Alt+F4 또는 종료 시도 차단",
      });
      pendingClose = false;
      saveConfig();
      closeNotice = "종료 시도를 차단하고 관리자에게 알림을 보냈습니다.";
    }
    if (pendingEnd) {
      await request("/device/end", { sessionId: pendingEnd });
      pendingEnd = null;
      lastSessionId = null;
      saveConfig();
    }
    const next: DeviceState = await request("/device/state");
    const had = deviceState?.session?.id;
    const previousReservation = deviceState?.reservation?.id;
    serverNow = next.serverNow;
    serverReceived = performance.now();
    deviceState = next;
    online = true;
    lastError = "";
    if (next.session) clock.sync(next.serverNow, next.session.endAt!);
    if (lastSessionId !== (next.session?.id || null)) {
      lastSessionId = next.session?.id || null;
      saveConfig();
    }
    if (next.reservation && next.reservation.id !== previousReservation) {
      main?.show();
      main?.focus();
    }
    if (had && !next.session) {
      thankYouUntil = performance.now() + 8000;
      main?.setAlwaysOnTop(true);
      main?.show();
      main?.focus();
      overlay?.hide();
      await stopGame();
      overlay?.hide();
      main?.show();
      main?.focus();
    }
    await handleCommands();
  } catch (e) {
    online = false;
    lastError = "클라우드 연결을 확인해 주세요. " + (e as Error).message;
  } finally {
    polling = false;
    pushState();
  }
}
function makeWindow(extra: Electron.BrowserWindowConstructorOptions = {}) {
  const w = new BrowserWindow({
    width: 1360,
    height: 900,
    backgroundColor: "#f6f8f2",
    icon: join(root, "dist/icon.png"),
    autoHideMenuBar: true,
    ...extra,
    webPreferences: {
      preload: join(root, "dist/desktop/preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      ...extra.webPreferences,
    },
  });
  w.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  w.webContents.on("will-navigate", (e, url) => {
    if (!url.startsWith("file://") || !url.includes("/dist/web/index.html"))
      e.preventDefault();
  });
  w.webContents.on("will-attach-webview", (e) => e.preventDefault());
  return w;
}
async function openKiosk() {
  if (kiosk && !kiosk.isDestroyed()) {
    kiosk.focus();
    return;
  }
  kiosk = makeWindow({
    fullscreen: true,
    webPreferences: {
      preload: undefined,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      partition: "cloud-kiosk",
    },
  });
  await kiosk.loadFile(join(webRoot, "index.html"), { hash: "/kiosk" });
}
function openOverlay() {
  if (!token) return;
  if (!overlay) {
    overlay = makeWindow({
      width: 670,
      height: 820,
      frame: false,
      resizable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      show: false,
    });
    void overlay.loadFile(join(webRoot, "index.html"), { hash: "/overlay" });
    overlay.on("close", (e) => {
      if (!approvedQuit) {
        e.preventDefault();
        overlay?.hide();
      }
    });
  }
  const wa = screen.getDisplayNearestPoint(
    screen.getCursorScreenPoint(),
  ).workArea;
  overlay.setBounds({
    x: wa.x + Math.max(0, wa.width - 670),
    y: wa.y,
    width: Math.min(670, wa.width),
    height: Math.min(820, wa.height),
  });
  overlay.setAlwaysOnTop(true, "screen-saver");
  overlay.show();
  overlay.focus();
  pushState();
}
function installExitShortcut() {
  if (
    process.platform === "win32" &&
    token &&
    !globalShortcut.isRegistered("Alt+F4")
  ) {
    const ok = globalShortcut.register("Alt+F4", () => blockedClose("Alt+F4"));
    if (!ok)
      shortcutWarning =
        "Alt+F4 전역 차단을 등록하지 못했습니다. 다른 단축키 프로그램을 종료하고 런처를 다시 실행하세요.";
  }
}
function blockedClose(reason: string) {
  if (!token || Date.now() - closeAttemptAt < 1500) return;
  closeAttemptAt = Date.now();
  pendingClose = true;
  closeNotice = reason + "를 차단했습니다. 관리자에게 알림을 전달합니다.";
  try {
    saveConfig();
  } catch {
    lastError = "종료 시도 알림을 저장하지 못했습니다. 운영자에게 알려 주세요.";
  }
  openOverlay();
  pushState();
  if (online)
    void request("/device/exit-requests", { reason })
      .then(() => {
        pendingClose = false;
        saveConfig();
        closeNotice = "종료 시도를 차단하고 관리자에게 알림을 보냈습니다.";
        pushState();
      })
      .catch(() => {
        closeNotice =
          "종료를 차단했습니다. 연결이 복구되면 관리자에게 알림을 보냅니다.";
        pushState();
      });
}
async function start() {
  mkdirSync(dataDir, { recursive: true });
  if (ROLE === "server") {
    main = makeWindow();
    await main.loadFile(join(webRoot, "index.html"), { hash: "/admin" });
    return;
  }
  loadConfig();
  installExitShortcut();
  main = makeWindow({ fullscreen: true });
  await main.loadFile(join(webRoot, "index.html"), { hash: "/launcher" });
  main.on("close", (e) => {
    if (!approvedQuit) {
      e.preventDefault();
      if (token) blockedClose("창 닫기 시도");
    }
  });
  main.webContents.on("before-input-event", (event, input) => {
    if (input.alt && input.key === "F4") {
      event.preventDefault();
      blockedClose("Alt+F4");
    }
  });
  main.on("leave-full-screen", () => {
    if (!approvedQuit) main?.setFullScreen(true);
  });
  void poll();
  let hoverStart = 0;
  setInterval(() => {
    if (!token || overlay?.isVisible()) return;
    const cursor = screen.getCursorScreenPoint(),
      b = screen.getDisplayNearestPoint(cursor).bounds;
    if (cursor.x >= b.x + b.width - 18 && cursor.y < b.y + 18) {
      hoverStart ||= performance.now();
      if (performance.now() - hoverStart >= 1000) {
        openOverlay();
        hoverStart = 0;
      }
    } else hoverStart = 0;
  }, 100).unref();
  setInterval(() => void poll(), 3000).unref();
  setInterval(() => {
    if (
      ((deviceState?.session && clock.remaining() <= 0) ||
        (!deviceState?.session && games.running)) &&
      !stopping
    ) {
      stopping = true;
      if (deviceState?.session && clock.remaining() <= 0) {
        deviceState.session = null;
        thankYouUntil = performance.now() + 8000;
        main?.setAlwaysOnTop(true);
        main?.show();
        main?.focus();
        overlay?.hide();
      }
      void stopGame()
        .then(() => {
          if (deviceState) deviceState.session = null;
          thankYouUntil = performance.now() + 8000;
          overlay?.hide();
          main?.show();
          main?.focus();
        })
        .catch(() => {})
        .finally(() => {
          stopping = false;
          pushState();
        });
    }
    pushState();
  }, 500).unref();
}
ipcMain.handle("cafe:invoke", async (event, action: string, payload: any) => {
  if (
    ![main?.webContents, overlay?.webContents].includes(event.sender) ||
    event.senderFrame !== event.sender.mainFrame
  )
    throw Error("허용하지 않은 화면입니다.");
  if (action === "hostInfo")
    return {
      role: ROLE,
      cloud: true,
      projectUrl: SUPABASE_URL,
      webUrl: WEB_URL,
    };
  if (ROLE === "server") {
    if (action === "openKiosk") {
      await openKiosk();
      return true;
    }
    if (action === "openWeb") {
      await shell.openExternal(WEB_URL + "#/admin");
      return true;
    }
    if (action === "openData") {
      await shell.openPath(dataDir);
      return true;
    }
    throw Error("클라우드 관리 콘솔에서 지원하지 않는 동작입니다.");
  }
  if (action === "state") return state();
  if (action === "quitUnregistered") {
    if (token) throw Error("관리자 승인이 필요합니다.");
    approvedQuit = true;
    app.quit();
    return true;
  }
  if (action === "enroll") {
    if (token) throw Error("이미 등록된 PC입니다.");
    if (
      !safeStorage.isEncryptionAvailable() ||
      (process.platform === "linux" &&
        safeStorage.getSelectedStorageBackend() === "basic_text")
    )
      throw Error(
        "보안 저장소를 사용할 수 없습니다. Windows 노트북에서 등록하세요.",
      );
    const p = z.object({ code: z.string().min(1).max(20) }).parse(payload);
    const r = await request("/device/enroll", p);
    token = r.token;
    recoveryHash = r.recoveryHash;
    installExitShortcut();
    saveConfig();
    await poll();
    return { state: state(), recoveryCode: r.recoveryCode };
  }
  if (action === "closeOverlay") {
    overlay?.hide();
    return true;
  }
  if (action === "recoverExit") {
    const code = z
      .object({ code: z.string().min(1).max(128) })
      .parse(payload).code;
    if (Date.now() < recoveryBlockedUntil)
      throw Error("5회 오입력으로 잠겼습니다. 5분 후 다시 시도하세요.");
    if (!compareSync(code.trim().toUpperCase(), recoveryHash)) {
      recoveryAttempts++;
      if (recoveryAttempts >= 5) {
        recoveryAttempts = 0;
        recoveryBlockedUntil = Date.now() + 300000;
      }
      saveConfig();
      throw Error("비상 종료 코드가 다릅니다.");
    }
    await stopGame();
    if (lastSessionId) {
      pendingEnd = lastSessionId;
      saveConfig();
      try {
        if (online) {
          await request("/device/end", { sessionId: pendingEnd });
          pendingEnd = null;
          lastSessionId = null;
          saveConfig();
        }
      } catch {}
    }
    approvedQuit = true;
    app.quit();
    return true;
  }
  if (!token) throw Error("먼저 PC를 등록하세요.");
  if (action === "adminUnlock") {
    const p = z
      .object({
        email: z.string().email(),
        password: z.string().min(1).max(128),
      })
      .parse(payload);
    await authorizeCloudOperator(p.email, p.password);
    operatorUntil = Date.now() + 300000;
    pushState();
    return true;
  }
  if (action === "configureGame") {
    if (operatorUntil <= Date.now())
      throw Error("게임 경로 설정을 위해 관리자 인증이 필요합니다.");
    const id = z.object({ gameId: z.string() }).parse(payload).gameId;
    if (!deviceState?.games.some((g) => g.id === id))
      throw Error("등록된 게임이 아닙니다.");
    const file = await dialog.showOpenDialog(main!, {
      title: "이 PC에 설치된 게임 실행 파일 선택",
      properties: ["openFile"],
      filters: [{ name: "Windows 실행 파일", extensions: ["exe"] }],
    });
    if (file.canceled) return null;
    localGamePaths[id] = executablePath(file.filePaths[0]);
    saveConfig();
    pushState();
    return { path: localGamePaths[id] };
  }
  if (action === "stopGame") {
    await stopGame();
    return true;
  }
  if (!online) throw Error("클라우드 연결 중에만 사용할 수 있습니다.");
  if (action === "login") {
    if (pendingEnd || (!deviceState?.session && games.running))
      throw Error("이전 이용 종료를 처리 중입니다.");
    const p = z
      .object({ password: z.string().regex(/^[0-9]{4,6}$/) })
      .parse(payload);
    const result = await request("/device/login", p);
    main?.setAlwaysOnTop(false);
    thankYouUntil = 0;
    await poll();
    return result;
  }
  if (action === "launchGame") {
    if (!deviceState?.session || clock.remaining() <= 0)
      throw Error("이용 시간이 없습니다.");
    const id = z.object({ gameId: z.string() }).parse(payload).gameId;
    const game = deviceState.games.find((g) => g.id === id && g.enabled);
    if (!game) throw Error("등록된 게임이 아닙니다.");
    await games.start({
      ...game,
      executable: localGamePaths[id] || game.executable,
    });
    currentGame = id;
    overlay?.hide();
    pushState();
    return true;
  }
  if (action === "purchase" || action === "extend") {
    const p =
      action === "purchase"
        ? z
            .object({ productId: z.string(), key: z.string().uuid() })
            .parse(payload)
        : z
            .object({ extensionId: z.string(), key: z.string().uuid() })
            .parse(payload);
    const { key, ...body } = p;
    const result = await request(
      action === "purchase" ? "/device/orders" : "/device/extensions",
      body,
      key,
    );
    await poll();
    return result;
  }
  if (action === "requestExit") {
    const result = await request("/device/exit-requests", {});
    await poll();
    return result;
  }
  if (action === "exitPassword") {
    const p = z.object({ password: z.string().min(1).max(128) }).parse(payload);
    await request("/device/exit-password", p);
    await poll();
    return true;
  }
  throw Error("허용하지 않은 동작입니다.");
});
app.on("second-instance", () => {
  main?.show();
  main?.focus();
});
app.on("before-quit", (e) => {
  if (ROLE === "station" && token && !approvedQuit) {
    e.preventDefault();
    blockedClose("프로그램 종료 시도");
  }
});
app.on("will-quit", () => globalShortcut.unregisterAll());
app.on("window-all-closed", () => {
  if (ROLE === "server" || approvedQuit || !token) app.quit();
});
app.whenReady().then(async () => {
  if (!single) return;
  try {
    await start();
  } catch (e) {
    console.error("PC Club startup:", (e as Error).message);
    dialog.showErrorBox("PC Club 시작 오류", (e as Error).message);
    approvedQuit = true;
    app.quit();
  }
});
