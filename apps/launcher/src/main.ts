import {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  screen,
  safeStorage,
  shell,
  session,
} from "electron";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { spawn, execFile, type ChildProcess } from "node:child_process";
import { X509Certificate } from "node:crypto";
import { isIP } from "node:net";
import { z } from "zod";
import { startServer, localAddresses } from "../../server/src/startup";
import { verifyPassword, createDomain } from "../../server/src/domain";
import { parseConnection, requestApi, type Connection } from "./connection";
import { SessionClock, GameController, ExitGate } from "./runtime";
import type { DeviceState } from "../../../packages/shared/src/contracts";
declare const __APP_ROLE__: "server" | "station";
const ROLE =
  typeof __APP_ROLE__ === "undefined"
    ? process.argv.includes("--server")
      ? "server"
      : "station"
    : __APP_ROLE__;
app.setName(ROLE === "server" ? "PC Club Server" : "PC Club Station");
if (process.env.CAFE_DESKTOP_DATA)
  app.setPath("userData", process.env.CAFE_DESKTOP_DATA);
else app.setPath("userData", join(app.getPath("appData"), "PCClub", ROLE));
const single = app.requestSingleInstanceLock();
if (!single) app.quit();
let main: BrowserWindow | undefined,
  overlay: BrowserWindow | undefined,
  kiosk: BrowserWindow | undefined;
let approvedQuit = false,
  server: Awaited<ReturnType<typeof startServer>> | undefined,
  deviceState: DeviceState | undefined,
  online = false,
  currentGame: string | undefined,
  lastError = "",
  registered = false;
let connection: Connection | undefined,
  token = "",
  gate: ExitGate | undefined,
  recoveryHash = "",
  recoveryAttempts = 0,
  recoveryBlockedUntil = 0;
const clock = new SessionClock();
const children = new Map<number, ChildProcess>();
let stopping = false;
const root = app.isPackaged ? app.getAppPath() : resolve(".");
const webRoot = join(root, "dist/web");
const preload = join(root, "dist/desktop/preload.cjs");
const dataDir = app.getPath("userData");
const configFile = join(dataDir, "station.json");
const durableFile = join(dataDir, "command-state.json");
let consumed: string[] = [];
function saveConfig() {
  writeFileSync(
    configFile,
    JSON.stringify({
      connection,
      encryptedToken: token
        ? safeStorage.encryptString(token).toString("base64")
        : undefined,
      recoveryHash,
      recoveryAttempts,
      recoveryBlockedUntil,
    }),
    { mode: 0o600 },
  );
}
function loadConfig() {
  if (!existsSync(configFile)) return;
  const v = JSON.parse(readFileSync(configFile, "utf8"));
  if (v.connection) connection = parseConnection(v.connection);
  if (v.encryptedToken) {
    if (!safeStorage.isEncryptionAvailable())
      throw Error("Windows 보안 저장소를 사용할 수 없습니다.");
    token = safeStorage.decryptString(Buffer.from(v.encryptedToken, "base64"));
    registered = true;
  }
  recoveryHash = v.recoveryHash || "";
  recoveryAttempts = v.recoveryAttempts || 0;
  recoveryBlockedUntil = v.recoveryBlockedUntil || 0;
  if (existsSync(durableFile))
    consumed = JSON.parse(readFileSync(durableFile, "utf8"));
}
const games = new GameController(
  async (executable, args) => {
    if (process.platform !== "win32")
      throw Error("게임 실행은 Windows PC에서 지원합니다.");
    if (!/^[A-Za-z]:\\.*\.exe$/i.test(executable) || !existsSync(executable))
      throw Error(
        "게임 실행 파일을 찾을 수 없습니다. 관리자에게 경로를 확인해 달라고 요청하세요.",
      );
    return new Promise<number>((yes, no) => {
      const child = spawn(executable, args, {
        shell: false,
        cwd: dirname(executable),
        windowsHide: false,
        stdio: "ignore",
      });
      child.once("error", no);
      child.once("spawn", () => {
        children.set(child.pid!, child);
        yes(child.pid!);
      });
      child.once("exit", () => {
        children.delete(child.pid!);
        currentGame = undefined;
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
    await new Promise<void>((yes, no) => {
      execFile(
        "taskkill.exe",
        ["/PID", String(pid), "/T", "/F"],
        { windowsHide: true, timeout: 10000 },
        (err) => {
          if (err && child.exitCode === null && child.signalCode === null)
            no(Error("게임을 종료하지 못했습니다. 운영자에게 알려 주세요."));
          else {
            children.delete(pid);
            yes();
          }
        },
      );
    });
  },
);
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
    registered,
    configured: !!connection,
    serverUrl: connection?.url,
    online,
    remaining: deviceState?.session ? clock.remaining() : 0,
    currentGame,
    error: lastError,
  };
}
function pushState() {
  for (const w of [main, overlay])
    if (w && !w.isDestroyed()) w.webContents.send("cafe:state", state());
}
async function request(path: string, body?: unknown, key?: string) {
  if (!connection) throw Error("서버 연결 파일을 먼저 선택해 주세요.");
  return requestApi(connection, path, body, token, key);
}
async function stopGame() {
  await games.stop();
  currentGame = undefined;
  pushState();
}
async function quitApproved() {
  await stopGame();
  approvedQuit = true;
  app.quit();
}
async function processCommands() {
  if (!deviceState) return;
  gate ??= new ExitGate(deviceState.device.id);
  for (const c of deviceState.commands) {
    if (consumed.includes(c.id) || !gate.consume(c)) continue;
    try {
      await stopGame();
      await request("/device/commands/" + c.id + "/ack", {
        status: "accepted",
      });
      consumed.push(c.id);
      writeFileSync(durableFile, JSON.stringify(consumed.slice(-500)), {
        mode: 0o600,
      });
      if (c.type === "exit") {
        await quitApproved();
        return;
      }
      if (c.type === "shutdown") {
        if (process.platform !== "win32")
          throw Error("Windows 종료는 Windows PC에서만 지원합니다.");
        await request("/device/end", {});
        await new Promise<void>((yes, no) =>
          execFile(
            "shutdown.exe",
            ["/s", "/t", "5"],
            { windowsHide: true, timeout: 5000 },
            (err) => (err ? no(err) : yes()),
          ),
        );
      }
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
let polling = false;
async function poll() {
  if (!token || !connection || polling) return;
  polling = true;
  try {
    await request("/device/heartbeat", {});
    const next: DeviceState = await request("/device/state");
    const hadSession = deviceState?.session?.id;
    online = true;
    lastError = "";
    deviceState = next;
    if (next.session) clock.sync(next.serverNow, next.session.endAt!);
    if (hadSession && !next.session) {
      await stopGame();
      overlay?.hide();
      main?.show();
      main?.focus();
    }
    await processCommands();
  } catch (e) {
    online = false;
    lastError = "서버 연결을 확인해 주세요. " + (e as Error).message;
  } finally {
    polling = false;
    pushState();
  }
}
function secureWindow(win: BrowserWindow, allow: (url: string) => boolean) {
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (event, url) => {
    if (!allow(url)) event.preventDefault();
  });
  win.webContents.on("will-redirect", (event, url) => {
    if (!allow(url)) event.preventDefault();
  });
  win.webContents.on("will-attach-webview", (e) => e.preventDefault());
}
function makeWindow(extra: Electron.BrowserWindowConstructorOptions = {}) {
  return new BrowserWindow({
    width: 1360,
    height: 900,
    backgroundColor: "#0d1016",
    autoHideMenuBar: true,
    ...extra,
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      ...extra.webPreferences,
    },
  });
}
function openOverlay() {
  if (!registered) return;
  if (!overlay) {
    overlay = makeWindow({
      width: 650,
      height: 800,
      frame: false,
      resizable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      show: false,
    });
    secureWindow(
      overlay,
      (u) => u.startsWith("file://") && u.includes("/dist/web/index.html"),
    );
    void overlay.loadFile(join(webRoot, "index.html"), { hash: "/overlay" });
    overlay.on("close", (e) => {
      if (!approvedQuit) {
        e.preventDefault();
        overlay?.hide();
      }
    });
  }
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const wa = display.workArea;
  overlay.setBounds({
    x: wa.x + Math.max(0, wa.width - 650),
    y: wa.y,
    width: Math.min(650, wa.width),
    height: Math.min(800, wa.height),
  });
  overlay.setAlwaysOnTop(true, "screen-saver");
  overlay.show();
  overlay.focus();
  pushState();
}
function trustServerCertificate(certPem: string, allowedHost: string) {
  const cert = new X509Certificate(certPem);
  session.defaultSession.setCertificateVerifyProc((req, callback) => {
    try {
      const presented = new X509Certificate(req.certificate.data);
      const host = req.hostname;
      const valid =
        host === allowedHost &&
        presented.fingerprint256 === cert.fingerprint256 &&
        Date.parse(cert.validTo) > Date.now() &&
        (isIP(host) ? cert.checkIP(host) : cert.checkHost(host));
      callback(valid ? 0 : -3);
    } catch {
      callback(-3);
    }
  });
}
async function openServer() {
  server = await startServer({
    dataDir: join(dataDir, "server"),
    webRoot,
    port: Number(process.env.CAFE_DESKTOP_PORT || 8443),
  });
  trustServerCertificate(server.tls.cert, "localhost");
  main = makeWindow();
  secureWindow(main, (u) => u.startsWith(server!.url + "/"));
  await main.loadURL(server.url + "/admin");
  main.on("close", (e) => {
    if (!approvedQuit) {
      e.preventDefault();
      void dialog
        .showMessageBox(main!, {
          type: "warning",
          buttons: ["계속 운영", "서버 종료"],
          defaultId: 0,
          cancelId: 0,
          message: "서버를 종료하면 모든 PC의 주문·연장·로그인이 중단됩니다.",
          detail: "진행 중인 이용 시간은 각 PC에서 계속 흐릅니다.",
        })
        .then(async (r) => {
          if (r.response === 1) {
            approvedQuit = true;
            await server!.app.close();
            server!.db.close();
            app.quit();
          }
        });
    }
  });
}
async function openStation() {
  loadConfig();
  main = makeWindow({ fullscreen: true, kiosk: false });
  secureWindow(
    main,
    (u) => u.startsWith("file://") && u.includes("/dist/web/index.html"),
  );
  await main.loadFile(join(webRoot, "index.html"), { hash: "/launcher" });
  main.on("close", (e) => {
    if (!approvedQuit) {
      e.preventDefault();
      if (registered) openOverlay();
      else main?.webContents.send("cafe:state", state());
    }
  });
  main.on("leave-full-screen", () => {
    if (!approvedQuit) main?.setFullScreen(true);
  });
  await poll();
  let hoverStart = 0;
  setInterval(() => {
    if (!registered || overlay?.isVisible()) return;
    const cursor = screen.getCursorScreenPoint(),
      bounds = screen.getDisplayNearestPoint(cursor).bounds;
    const corner =
      cursor.x >= bounds.x + bounds.width - 18 && cursor.y < bounds.y + 18;
    if (corner) {
      hoverStart ||= performance.now();
      if (performance.now() - hoverStart >= 1000) {
        openOverlay();
        hoverStart = 0;
      }
    } else hoverStart = 0;
  }, 100).unref();
  setInterval(() => void poll(), 3000).unref();
  setInterval(() => {
    if (deviceState?.session && clock.remaining() <= 0 && !stopping) {
      stopping = true;
      void stopGame()
        .then(() => {
          deviceState!.session = null;
          overlay?.hide();
          main?.show();
          main?.focus();
        })
        .catch((e) => {
          lastError = e.message;
        })
        .finally(() => {
          stopping = false;
          pushState();
        });
    }
    pushState();
  }, 500).unref();
}
function requireAdminSender(sender: Electron.WebContents) {
  if (ROLE !== "server" || sender !== main?.webContents)
    throw Error("서버 관리자 화면에서만 사용할 수 있습니다.");
  const url = new URL(sender.getURL());
  if (
    url.origin !== server?.url ||
    !(url.hash === "#/admin" || (!url.hash && url.pathname === "/admin"))
  )
    throw Error("관리자 화면에서만 사용할 수 있습니다.");
}
ipcMain.handle("cafe:invoke", async (event, action: string, payload: any) => {
  if (![main?.webContents, overlay?.webContents].includes(event.sender))
    throw Error("신뢰할 수 없는 화면입니다.");
  if (ROLE === "server") {
    requireAdminSender(event.sender);
    if (action === "resetAdmin") {
      const result = await dialog.showMessageBox(main!, {
        type: "warning",
        buttons: ["취소", "관리자 비밀번호 초기화"],
        defaultId: 0,
        cancelId: 0,
        message: "이 서버 PC에서 관리자 비밀번호를 초기화할까요?",
        detail:
          "현재 관리자 로그인은 해제됩니다. 좌석·이용 시간·주문 데이터는 유지됩니다.",
      });
      if (result.response !== 1) return false;
      createDomain(server!.db).resetAdmin();
      await main!.reload();
      return true;
    }
    if (action === "hostInfo")
      return {
        role: "server",
        addresses: localAddresses(),
        port: Number(process.env.CAFE_DESKTOP_PORT || 8443),
        setupToken: createDomain(server!.db).isSetup()
          ? undefined
          : server!.setupToken,
      };
    if (action === "openData") {
      await shell.openPath(join(dataDir, "server"));
      return true;
    }
    if (action === "openKiosk") {
      if (kiosk && !kiosk.isDestroyed()) {
        kiosk.focus();
        return true;
      }
      kiosk = makeWindow({
        fullscreen: true,
        webPreferences: {
          preload: undefined,
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          partition: "kiosk",
        },
      });
      const kioskSession = kiosk.webContents.session;
      const cert = new X509Certificate(server!.tls.cert);
      kioskSession.setCertificateVerifyProc((r, cb) => {
        try {
          cb(
            r.hostname === "localhost" &&
              new X509Certificate(r.certificate.data).fingerprint256 ===
                cert.fingerprint256
              ? 0
              : -3,
          );
        } catch {
          cb(-3);
        }
      });
      secureWindow(kiosk, (u) => u === server!.url + "/kiosk");
      await kiosk.loadURL(server!.url + "/kiosk");
      return true;
    }
    if (action === "exportConnection") {
      const addresses = localAddresses();
      if (!addresses.length)
        throw Error(
          "연결된 네트워크가 없습니다. 먼저 행사장 Wi-Fi 또는 유선 LAN에 연결하세요.",
        );
      const choices = addresses.map(
        (ip) =>
          "https://" + ip + ":" + Number(process.env.CAFE_DESKTOP_PORT || 8443),
      );
      const pick =
        choices.length === 1
          ? 0
          : (
              await dialog.showMessageBox(main!, {
                type: "question",
                message: "사용자 PC와 같은 네트워크의 서버 주소를 선택하세요.",
                buttons: [...choices, "취소"],
                cancelId: choices.length,
              })
            ).response;
      if (pick >= choices.length) return false;
      const c = parseConnection({
        version: 1,
        url: choices[pick],
        cert: server!.tls.cert,
      });
      const file = await dialog.showSaveDialog(main!, {
        title: "PC 연결 파일 저장",
        defaultPath: "Festival-PC-Club.pcclub",
        filters: [{ name: "PC Club 연결 파일", extensions: ["pcclub"] }],
      });
      if (file.canceled || !file.filePath) return false;
      writeFileSync(file.filePath, JSON.stringify(c, null, 2));
      return true;
    }
    throw Error("허용하지 않은 서버 동작입니다.");
  }
  if (action === "hostInfo") return { role: "station" };
  if (action === "state") return state();
  if (action === "quitUnregistered") {
    if (registered) throw Error("관리자 승인이 필요합니다.");
    approvedQuit = true;
    app.quit();
    return true;
  }
  if (action === "importConnection") {
    if (registered) throw Error("PC 등록 후에는 연결 설정을 바꿀 수 없습니다.");
    const file = await dialog.showOpenDialog(main!, {
      properties: ["openFile"],
      filters: [{ name: "PC Club 연결 파일", extensions: ["pcclub"] }],
    });
    if (file.canceled) return state();
    connection = parseConnection(
      JSON.parse(readFileSync(file.filePaths[0], "utf8")),
    );
    await request("/health");
    saveConfig();
    pushState();
    return state();
  }
  if (action === "enroll") {
    if (registered) throw Error("이미 등록된 PC입니다.");
    if (!safeStorage.isEncryptionAvailable())
      throw Error("보안 저장소를 사용할 수 없습니다.");
    if (
      process.platform === "linux" &&
      safeStorage.getSelectedStorageBackend() === "basic_text"
    )
      throw Error(
        "보안 키 저장소를 사용할 수 없습니다. Windows 노트북에서 등록하세요.",
      );
    const input = z.object({ code: z.string().min(1).max(20) }).parse(payload);
    const r = await request("/device/enroll", { code: input.code });
    token = r.token;
    recoveryHash = r.recoveryHash;
    registered = true;
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
      throw Error("비상 코드 입력이 잠겼습니다. 5분 후 다시 시도하세요.");
    if (!verifyPassword(code.trim().toUpperCase(), recoveryHash)) {
      recoveryAttempts++;
      if (recoveryAttempts >= 5) {
        recoveryBlockedUntil = Date.now() + 300_000;
        recoveryAttempts = 0;
      }
      saveConfig();
      throw Error("비상 종료 코드가 다릅니다.");
    }
    await stopGame();
    try {
      if (online) await request("/device/end", {});
    } catch {}
    approvedQuit = true;
    app.quit();
    return true;
  }
  if (!registered) throw Error("먼저 PC를 등록하세요.");
  if (action === "stopGame") {
    await stopGame();
    return true;
  }
  if (!online) throw Error("서버에 연결된 동안만 사용할 수 있습니다.");
  if (action === "login") {
    const p = z.object({ code: z.string().regex(/^\d{10}$/) }).parse(payload);
    const r = await request("/device/login", p);
    await poll();
    return r;
  }
  if (action === "launchGame") {
    if (!deviceState?.session || clock.remaining() <= 0)
      throw Error("이용 시간이 없습니다.");
    const id = z.object({ gameId: z.string() }).parse(payload).gameId;
    const game = deviceState.games.find((g) => g.id === id && g.enabled);
    if (!game) throw Error("등록된 게임이 아닙니다.");
    await games.start(game);
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
    const r = await request(
      action === "purchase" ? "/device/orders" : "/device/extensions",
      body,
      key,
    );
    await poll();
    return r;
  }
  if (action === "requestExit") {
    const r = await request("/device/exit-requests", {});
    await poll();
    return r;
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
  if (!approvedQuit && registered) {
    e.preventDefault();
    openOverlay();
  }
});
app.whenReady().then(async () => {
  if (!single) return;
  mkdirSync(dataDir, { recursive: true });
  try {
    if (ROLE === "server") await openServer();
    else await openStation();
  } catch (e) {
    dialog.showErrorBox(
      "PC Club 시작 오류",
      (e as Error).message + "\n설정 폴더: " + dataDir,
    );
    approvedQuit = true;
    app.quit();
  }
});
app.on("window-all-closed", () => {
  if (approvedQuit || !registered) app.quit();
});
