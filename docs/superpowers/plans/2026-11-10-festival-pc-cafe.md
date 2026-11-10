# Festival PC Cafe Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 키오스크 좌석 배정, 게임 런처, 시간·머니·간식, 관리자 제어를 연결하는 행사 시스템을 만든다.

**Architecture:** TypeScript 모노레포에서 서버가 SQLite 트랜잭션과 권한을 책임진다. React 웹은 키오스크·관리자를 제공하고 Electron main은 기기 인증, 게임 프로세스, 전체 화면과 메뉴를 책임진다. 서버 상태 변경은 WebSocket으로 알리고 재연결 시 인증된 전체 상태를 다시 조회한다.

**Tech Stack:** Node.js 22.13 이상, TypeScript, Fastify, SQLite(node:sqlite), ws, Zod, React, Vite, Electron, electron-builder, Vitest, Playwright. Node.js 24 LTS를 개발 기본값으로 사용한다.

**Spec:** `docs/superpowers/specs/2026-11-10-festival-pc-cafe-design.md`

## Global Constraints

- TypeScript, React 기반 화면, Node.js 서버, SQLite 영속 저장, WebSocket 상태 알림을 사용한다.
- 핵심 기능은 외부 인터넷 없이 동작한다.
- Windows 계정·운영체제 잠금은 범위에 포함하지 않는다.
- 현장 관리자 비밀번호 또는 관리자 화면의 원격 승인으로 종료한다.
- LAN에서도 로그인·관리자·기기 통신은 TLS로 보호한다.
- Electron은 renderer의 Node 접근을 끄고 context isolation과 제한된 IPC를 사용한다.
- Windows 검증 전에는 런처의 현장 동작 완료를 주장하지 않는다.
- 현재 격리된 체크아웃을 사용하며 별도 worktree를 만들지 않는다.

## Review Focus

- 네트워크 단절·재시작 시 잔액과 시간이 복구되고 오프라인 구매는 차단되어야 한다(Task 2, 4).
- 중복 터치·동시 요청으로 좌석, 머니, 재고, 환불이 중복 반영되면 안 된다(Task 1, 2).
- renderer·다른 기기·만료 승인으로 게임 실행과 종료 권한을 얻을 수 없어야 한다(Task 2, 4).
- 게임 프로세스 생성·종료 실패 시 다른 프로그램을 종료하거나 성공으로 표시하면 안 된다(Task 4).
- 개인정보와 비밀번호가 공개 상태·로그·브라우저 저장소에 노출되면 안 된다(Task 2, 3).

## File structure and shared contracts

- `packages/shared/src/contracts.ts`: Zod 요청 검증과 SeatView, SessionView, Product, Order, Game, ExitRequest, DeviceCommand 타입.
- `apps/server/src/db.ts`, `domain.ts`: 마이그레이션, 트랜잭션과 업무 규칙.
- `apps/server/src/auth.ts`, `app.ts`, `index.ts`: 인증, HTTP/WebSocket, TLS 시작.
- `apps/web/src/api.ts`, `App.tsx`, `pages/{Kiosk,Admin,Launcher}.tsx`, `styles.css`: 공통 API와 한국어 화면.
- `apps/launcher/src/{main,preload,device,processes,clock}.ts`: Electron 호스트와 좁은 IPC.
- `tests/`: 서버 통합과 브라우저 테스트. 런처 순수 로직 테스트는 런처 소스 옆에 둔다.
- 루트 `package.json`, `package-lock.json`, `tsconfig.json`, `.gitignore`: 재현 가능한 빌드·검증.
- `docs/operations.md`, `docs/windows-checklist.md`, `.env.example`: 배포·인증서·운영·실기 검증 안내.

IDs are UUID strings; amounts and seconds are bounded nonnegative integers. API errors use `{error:{code,message}}`. Every mutation that can spend/refund resources accepts an `Idempotency-Key`; keys are scoped to actor and operation and request-body mismatch returns 409. Store login codes and authentication tokens as hashes. UI timers are display only.

### Task 1: Persistent domain and transactional resource accounting

**Files:** root manifests/config; `packages/shared/src/contracts.ts`; `apps/server/src/{db,domain}.ts`; `apps/server/test/domain.test.ts`.

**Interfaces:** `openDatabase(path: string): DatabaseSync`; `createDomain(db, now:()=>number): Domain`. Domain methods: `reserve(input,key)`, `activate(deviceId,code)`, `purchase(sessionId,productId,key)`, `extend(sessionId,extensionId,key)`, `cancelOrder(orderId,key)`, `adjust(sessionId,seconds,money,key)`, `expire()`, `snapshot(actor)`. Return shared validated views, never database rows.

- [ ] Write domain tests for seat double-booking, reservation expiry, one-time seat-bound login, timer beginning at activation, sold-out/insufficient-balance rejection, exactly-once order/refund/extension, negative adjustment rejection and expiry.
- [ ] Run `npm test -- apps/server/test/domain.test.ts`; confirm tests fail because domain implementation is missing.
- [ ] Add workspace manifests and domain implementations. Schema includes settings, seats, devices, sessions, products, extensions, games, orders, idempotency records and audit events. Use integer units and SQLite transactions. Default policy: 30 minutes, 3000 points, 5-minute reservation; editable by admin. Login codes use cryptographic randomness and 10 digits.
- [ ] Add DB reopen tests preserving active session deadline, paid orders and audit; test repeated key with changed payload gives conflict. Disable reservation on offline/unregistered seats.
- [ ] Run domain suite and type check; require passing assertions rather than zero-test success.
- [ ] Commit `feat: add persistent PC cafe domain and accounting`.

### Task 2: Authenticated server and remote control protocol

**Files:** `apps/server/src/{auth,app,index}.ts`; `apps/server/test/{api,auth,commands}.test.ts`; `.env.example`.

**Interfaces:** `buildApp({db,now,tls}): FastifyInstance`. Routes: `/api/bootstrap`, `/api/admin/login`, `/api/public/state`, `/api/reservations`, `/api/admin/state`, `/api/admin/settings`, `/api/admin/seats`, `/api/admin/products`, `/api/admin/extensions`, `/api/admin/games`, `/api/admin/sessions/:id/adjust`, `/api/admin/sessions/:id/end`, `/api/admin/orders/:id`, `/api/admin/audit`, `/api/admin/personal-data/purge`. Device routes: `/api/admin/devices/enrollment`, `/api/device/enroll`, `/api/device/state`, `/api/device/login`, `/api/device/orders`, `/api/device/extensions`, `/api/device/exit-requests`, `/api/device/exit-password`, `/api/device/commands/:id/ack`; admin routes issue/decide exit and shutdown commands. `/api/events` authenticates before sending role-filtered invalidations.

- [ ] Write HTTP tests proving non-admins cannot read PII or mutate settings, credentials are hashed, bootstrap cannot run twice, enrollment is one-use and cross-seat tokens fail.
- [ ] Run `npm test -- apps/server/test/auth.test.ts apps/server/test/api.test.ts`; observe missing-server failures.
- [ ] Implement scrypt password hashing, timing-safe checks, admin HttpOnly/SameSite session cookies, same-origin mutation checks, bound device bearer tokens, request validation, bounded inputs and rate limiting. Bootstrap requires a locally generated one-time setup token printed only on initial startup; no remote unauthenticated admin creation. Login codes rate-limit per device and IP. Never log credential bodies.
- [ ] Implement CRUD, accounting endpoints, server-side expiry timer and heartbeat-based seat connectivity. Use expiring enrollment and exit requests; one-time command delivery with unique command IDs, acknowledgments and recorded failure. Shutdown acknowledgment means accepted, never confirmed power-off. Register offline recovery code hash on device; disclose plaintext to administrator only during enrollment.
- [ ] Add command tests: approval expires, cannot approve another device, cannot replay consumed command, disconnected PC shows unknown shutdown result, restart does not replay completed commands. Add WebSocket role-redaction/reconnect tests and public snapshot PII tests.
- [ ] Enforce TLS cert/key configuration for non-loopback binding; permit explicit local loopback development only. Test unsafe LAN configuration rejection. Run server tests and type check.
- [ ] Commit `feat: expose authenticated server and device control`.

### Task 3: Connected Korean kiosk, administrator and launcher screens

**Files:** `apps/web/{index.html,vite.config.ts,src/api.ts,src/App.tsx,src/styles.css,src/pages/Kiosk.tsx,src/pages/Admin.tsx,src/pages/Launcher.tsx}`; `tests/browser/flow.spec.ts`.

**Interfaces:** same-origin `api<T>(path,options):Promise<T>` preserves request key across retry; `subscribe(onInvalidation):()=>void` reconnects and refreshes authoritative state. Routes `/kiosk`, `/admin`, `/launcher`. Launcher renderer uses only `window.cafe` bridge, with a deliberately isolated test adapter for browser tests.

- [ ] Write browser tests for reserve→display code, duplicate submit suppression, admin login→policy/product/game editing, order fulfillment/refund, manual adjustment, seat disable and exit approval. Assert public DOM never exposes other visitors' PII.
- [ ] Run browser test to establish missing-UI failure.
- [ ] Build responsive Korean UI: dark PC cafe palette, seat grid, accessible labels, clear selection and status, submit progress, error/retry states and touch-sized buttons. Display configured grant before registration; show login code only for the successful current reservation.
- [ ] Implement admin dashboard with separate confirmed actions for session end and Windows shutdown, order workflow, enrollment/recovery-code display, settings/catalog editors, audit and confirmed PII purge. Keep auth in cookies, not localStorage.
- [ ] Implement launcher registration/login/game library and overlay screens with balance, time, snacks, extension, switch-game warning, local-password and remote-exit requests. Disable purchases while offline and render server validation errors.
- [ ] Run browser suite against temporary DB and deterministic fake clock; verify keyboard navigation, narrow display and repeat reconnect. Run web production build.
- [ ] Commit `feat: build connected kiosk admin and launcher screens`.

### Task 4: Windows Electron runtime and managed game lifecycle

**Files:** `apps/launcher/src/{main,preload,device,processes,clock}.ts`, adjacent unit tests, `apps/launcher/electron-builder.yml`.

**Interfaces:** `GameController.start(game:RegisteredGame):Promise<void>`, `stop():Promise<void>`; `SessionClock.sync(serverNow,endAt):void`, `remaining():number`; bridge exposes `getState`, `enroll`, `login`, `launchGame(gameId)`, `stopGame`, `purchase`, `extend`, `requestExit`, `verifyExitPassword`, `recoverExit`, `onState` only. Renderer never supplies executable paths, shell strings, tokens or command acknowledgments.

- [ ] Write mocked tests for monotonic offline deadline, restart login denial without server, close interception, expired remote approval, wrong emergency code, spawn failure, game switching order, process stop failure and unrelated-process preservation.
- [ ] Run launcher tests; observe missing-module failures.
- [ ] Implement full-screen BrowserWindow, fixed packaged local content, navigation/window-open rejection, validated IPC sender and payload, sandboxed renderer and context-isolated preload. Persist device token using Electron safeStorage; fail clearly if secure storage is unavailable. Store only emergency-code hash and persist retry limits.
- [ ] Implement authenticated main-process API/state reconnect, server-driven session expiry and command acknowledgment. Local-password approval verifies online; emergency code permits local close offline. Close active managed game before authorized app exit; preserve failed-stop status.
- [ ] Implement Windows game start with `spawn(executable,args,{shell:false})` from registered per-device paths. Track owned process tree; use Windows taskkill only for owned process tree. Reject non-Windows destructive adapters. Poll Electron cursor position across displays, open overlay after 1000ms top-right dwell; do not steal focus before dwell. Return to game after closing overlay.
- [ ] Implement separate Windows shutdown adapter invoked only by authenticated fresh command; record command consumed before execution. Unit-test with mock executor, never shut down cloud host.
- [ ] Run launcher tests/type check and package build checks. Generate unsigned Windows portable/installer artifacts where supported; record packaging or signing limitations precisely.
- [ ] Commit `feat: add Windows game launcher and approval controls`.

### Task 5: End-to-end readiness and operator delivery

**Files:** `tests/integration/festival.test.ts`, `docs/operations.md`, `docs/windows-checklist.md`, `README.md`, CI workflow and runtime config as needed.

**Interfaces:** root commands `npm ci`, `npm test`, `npm run typecheck`, `npm run build`, `npm run test:e2e`, `npm run start`, `npm run launcher:dev`, `npm run launcher:dist`.

- [ ] Add end-to-end tests through real HTTP/device clients covering kiosk grant→activation→purchase→extension→fulfillment→manual adjustment→local/remote exit, server restart and lost response retries. Test clock expiry and PII purge without erasing accounting history.
- [ ] Run integration tests, all existing tests, type check, production builds and browser flow. Diagnose failures before claiming completion.
- [ ] Write actual tested install/start commands, TLS certificate generation/trust on Windows without disabling verification, server address/firewall setup, PC enrollment, game paths, password reset requiring local server access, DB backup/restore and emergency recovery guidance.
- [ ] Document Windows hardware checklist including multiple displays, borderless games, child processes, Alt+F4, overlay, network loss, relaunch, both exit approvals, expiry and shutdown. Mark unexecuted hardware checks pending rather than passed.
- [ ] Save tested cloud installation/start instructions in environment configuration if onboarding tooling remains applicable. Do not call draft saving publication.
- [ ] Review changes against spec and Review Focus, fix material findings, rerun affected checks, commit and report verified capabilities, remaining Windows checks and launch instructions.
