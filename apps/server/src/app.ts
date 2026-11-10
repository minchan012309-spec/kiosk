import Fastify, { type FastifyRequest } from "fastify";
import cookie from "@fastify/cookie";
import websocket from "@fastify/websocket";
import serveStatic from "@fastify/static";
import { z, ZodError } from "zod";
import { randomBytes } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { createDomain, AppError, requireThat } from "./domain";
import { existsSync } from "node:fs";
export async function buildApp(opts: {
  db: DatabaseSync;
  setupToken: string;
  now?: () => number;
  webRoot?: string;
  tls?: { key: string; cert: string };
  onChange?: () => void;
}) {
  const d = createDomain(opts.db, opts.now);
  const app = Fastify({
    logger: false,
    bodyLimit: 65536,
    ...(opts.tls ? { https: opts.tls } : {}),
  });
  await app.register(cookie);
  await app.register(websocket);
  const sockets = new Set<any>();
  const notify = () => {
    for (const ws of sockets)
      if (ws.readyState === 1) ws.send('{"type":"invalidate"}');
    opts.onChange?.();
  };
  const limits = new Map<string, { count: number; until: number }>();
  const limit = (r: FastifyRequest, bucket: string, max = 10) => {
    const key = bucket + ":" + r.ip;
    const now = Date.now();
    let l = limits.get(key);
    if (!l || l.until <= now) {
      l = { count: 0, until: now + 60_000 };
      limits.set(key, l);
    }
    requireThat(
      ++l.count <= max,
      "요청이 너무 많습니다. 잠시 후 다시 시도하세요.",
      429,
    );
    if (limits.size > 5000)
      for (const [k, v] of limits) if (v.until <= now) limits.delete(k);
  };
  const b = (r: FastifyRequest) => r.body as any;
  const token = (r: FastifyRequest) => {
    const h = r.headers.authorization;
    requireThat(h?.startsWith("Bearer "), "PC 인증이 필요합니다.", 401);
    return h!.slice(7);
  };
  const key = (r: FastifyRequest) => {
    const k = r.headers["idempotency-key"];
    requireThat(
      typeof k === "string" && k.length > 0,
      "요청 번호가 없습니다.",
      400,
    );
    return k;
  };
  const str = z.string().min(1).max(200);
  const password = z.string().min(1).max(128);
  app.setErrorHandler((e, req, reply) => {
    if (e instanceof ZodError)
      return reply.status(400).send({
        error: { code: "VALIDATION", message: "입력 내용을 확인해 주세요." },
      });
    const status =
      e instanceof AppError ? e.statusCode : (e as any).statusCode || 500;
    return reply.status(status).send({
      error: {
        code: e instanceof AppError ? e.code : "ERROR",
        message:
          status >= 500
            ? "서버 처리 중 문제가 발생했습니다."
            : (e as Error).message,
      },
    });
  });
  app.addHook("onRequest", async (r, reply) => {
    reply
      .header("X-Content-Type-Options", "nosniff")
      .header("Referrer-Policy", "no-referrer")
      .header("Cache-Control", "no-store");
    reply.header(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws: wss:; frame-ancestors 'none'; object-src 'none'",
    );
    if (r.method !== "GET" && r.method !== "HEAD" && r.headers.origin) {
      let origin;
      try {
        origin = new URL(r.headers.origin);
      } catch {
        throw new AppError(403, "ORIGIN", "잘못된 요청 출처입니다.");
      }
      requireThat(
        origin.host === r.headers.host,
        "다른 사이트에서의 요청은 허용하지 않습니다.",
        403,
      );
    }
    if (r.url.startsWith("/api/admin/") && r.url !== "/api/admin/login")
      d.admin(r.cookies.admin || "");
  });
  app.addHook("onResponse", async (r) => {
    if (
      r.method !== "GET" &&
      r.method !== "HEAD" &&
      r.url !== "/api/device/heartbeat"
    )
      notify();
  });
  app.get("/api/health", async () => ({
    ok: true,
    setup: d.isSetup(),
    serverNow: Date.now(),
  }));
  app.get("/api/public/state", async () => d.publicState());
  app.post("/api/bootstrap", async (r, reply) => {
    limit(r, "bootstrap");
    const body = z
      .object({ token: str, password: z.string().min(10).max(128) })
      .parse(b(r));
    requireThat(
      body.token === opts.setupToken,
      "초기 설정 코드를 확인해 주세요.",
      403,
    );
    d.bootstrap(body.password);
    const t = d.login(body.password);
    reply.setCookie("admin", t, {
      httpOnly: true,
      sameSite: "strict",
      secure: !!opts.tls,
      path: "/",
      maxAge: 43200,
    });
    return { ok: true };
  });
  app.post("/api/admin/login", async (r, reply) => {
    limit(r, "admin-login");
    const body = z.object({ password }).parse(b(r));
    const t = d.login(body.password);
    reply.setCookie("admin", t, {
      httpOnly: true,
      sameSite: "strict",
      secure: !!opts.tls,
      path: "/",
      maxAge: 43200,
    });
    return { ok: true };
  });
  app.post("/api/admin/logout", async (r, reply) => {
    d.logout(r.cookies.admin || "");
    reply.clearCookie("admin", { path: "/" });
    return { ok: true };
  });
  app.post("/api/admin/password", async (r) => {
    const body = z
      .object({ old: password, password: z.string().min(10).max(128) })
      .parse(b(r));
    d.changePassword(body.old, body.password);
    return { ok: true };
  });
  app.get("/api/admin/state", async () => d.adminState());
  app.post("/api/admin/settings", async (r) => d.settings(b(r)));
  app.post("/api/admin/seats", async (r) =>
    d.addSeat(z.object({ name: z.string().min(1).max(30) }).parse(b(r)).name),
  );
  app.post("/api/admin/seats/:id", async (r) =>
    d.setSeat(
      (r.params as any).id,
      z.object({ enabled: z.boolean() }).parse(b(r)).enabled,
    ),
  );
  app.post("/api/admin/products", async (r) => d.saveProduct(b(r)));
  app.post("/api/admin/extensions", async (r) => d.saveExtension(b(r)));
  app.post("/api/admin/games", async (r) => d.saveGame(b(r)));
  app.post("/api/admin/devices/enrollment", async (r) =>
    d.enrollment(z.object({ seatId: str }).parse(b(r)).seatId),
  );
  app.post("/api/admin/sessions/:id/adjust", async (r) => {
    const body = z
      .object({ seconds: z.number().int(), money: z.number().int() })
      .parse(b(r));
    return d.adjust((r.params as any).id, body.seconds, body.money, key(r));
  });
  app.post("/api/admin/sessions/:id/end", async (r) =>
    d.endSession((r.params as any).id),
  );
  app.post("/api/admin/orders/:id", async (r) =>
    d.orderStatus(
      (r.params as any).id,
      z
        .object({ status: z.enum(["preparing", "delivered", "cancelled"]) })
        .parse(b(r)).status,
      key(r),
    ),
  );
  app.post("/api/admin/exit-requests/:id", async (r) =>
    d.decideExit(
      (r.params as any).id,
      z.object({ approve: z.boolean() }).parse(b(r)).approve,
    ),
  );
  app.post("/api/admin/devices/:id/shutdown", async (r) => {
    requireThat(b(r)?.confirm === true, "종료 확인이 필요합니다.", 400);
    return d.shutdown((r.params as any).id);
  });
  app.post("/api/admin/personal-data/purge", async () => d.purgePersonalData());
  app.post("/api/reservations", async (r) => {
    limit(r, "reserve", 30);
    return d.reserve(b(r), key(r));
  });
  app.post("/api/device/enroll", async (r) => {
    limit(r, "enroll");
    return d.enroll(z.object({ code: str }).parse(b(r)).code);
  });
  app.post("/api/device/heartbeat", async (r) => d.heartbeat(token(r)));
  app.get("/api/device/state", async (r) => d.deviceState(token(r)));
  app.post("/api/device/login", async (r) => {
    limit(r, "device-login");
    const t = token(r);
    const body = z.object({ code: z.string().regex(/^\d{10}$/) }).parse(b(r));
    return d.activate(t, body.code);
  });
  app.post("/api/device/orders", async (r) =>
    d.purchase(
      token(r),
      z.object({ productId: str }).parse(b(r)).productId,
      key(r),
    ),
  );
  app.post("/api/device/extensions", async (r) =>
    d.extend(
      token(r),
      z.object({ extensionId: str }).parse(b(r)).extensionId,
      key(r),
    ),
  );
  app.post("/api/device/exit-requests", async (r) => d.requestExit(token(r)));
  app.post("/api/device/exit-password", async (r) => {
    limit(r, "exit-password");
    return d.exitPassword(
      token(r),
      z.object({ password }).parse(b(r)).password,
    );
  });
  app.post("/api/device/end", async (r) => {
    d.endDeviceSession(token(r));
    return { ok: true };
  });
  app.post("/api/device/commands/:id/ack", async (r) => {
    const body = z
      .object({
        status: z.enum(["accepted", "failed"]),
        message: z.string().max(200).optional(),
      })
      .parse(b(r));
    return d.ack(token(r), (r.params as any).id, body.status, body.message);
  });
  app.get("/api/events", { websocket: true }, (socket, req) => {
    const origin = req.headers.origin;
    if (origin) {
      try {
        if (new URL(origin).host !== req.headers.host) {
          socket.close(1008);
          return;
        }
      } catch {
        socket.close(1008);
        return;
      }
    }
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.send('{"type":"invalidate"}');
  });
  if (opts.webRoot && existsSync(opts.webRoot)) {
    await app.register(serveStatic, { root: opts.webRoot });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith("/api/"))
        return reply
          .code(404)
          .send({ error: { code: "NOT_FOUND", message: "없는 API입니다." } });
      return reply.sendFile("index.html");
    });
  }
  const timer = setInterval(() => {
    d.expire();
    notify();
  }, 5000);
  timer.unref();
  app.addHook("onClose", async () => {
    clearInterval(timer);
    for (const s of sockets) s.close();
  });
  return app;
}
