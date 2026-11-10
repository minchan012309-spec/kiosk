import { confirmInApp as confirm } from "../dialogs";
import {
  AccountsPanel,
  BrandingPanel,
  ExitPasswordsPanel,
} from "./CloudPanels";
import { WEB_URL } from "../../../../packages/shared/src/cloud-config";
import { PendingOperations } from "../../../../packages/shared/src/operations";
import { useEffect, useRef, useState } from "react";
import type {
  AdminState,
  Game,
  Product,
  Extension,
  Settings,
} from "../../../../packages/shared/src/contracts";
import { api, subscribe, money, duration } from "../api";
import { Brand, ErrorMessage } from "../App";
const tabs = [
  "운영 현황",
  "좌석 / PC",
  "주문 관리",
  "상품 / 시간",
  "게임 관리",
  "운영 설정",
  "활동 기록",
  "관리자 / 권한",
  "브랜드 / 테마",
  "종료 비밀번호",
];
const orderLabels: Record<string, string> = {
  received: "접수",
  preparing: "준비 중",
  delivered: "전달 완료",
  cancelled: "취소 / 환불",
};
export function Admin() {
  const [state, setState] = useState<AdminState>();
  const allowed = (p: string) =>
    !!state?.profile &&
    (state.profile.role === "owner" || state.profile.permissions.includes(p));
  const tabPermissions = [
    "dashboard.view",
    "seats.manage",
    "orders.manage",
    "catalog.manage",
    "games.manage",
    "settings.manage",
    "audit.view",
    "accounts.manage",
    "settings.manage",
    "settings.manage",
  ];
  const [logged, setLogged] = useState(false);
  const [needSetup, setNeedSetup] = useState(false);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState(tabs[0]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [host, setHost] = useState<any>();
  const [setupToken, setSetupToken] = useState("");
  const [now, setNow] = useState(Date.now());
  const [editing, setEditing] = useState<any>(null);
  const [adjust, setAdjust] = useState<string>();
  const receivedAt = useRef(performance.now());
  const pendingOperations = useRef(new PendingOperations(sessionStorage));
  const refresh = async () => {
    try {
      const next = await api<AdminState>("/admin/state");
      receivedAt.current = performance.now();
      setState(next);
      setLogged(true);
    } catch {
      setLogged(false);
    }
  };
  useEffect(() => {
    api("/health")
      .then((h) => {
        setNeedSetup(!h.setup);
        if (h.setup) void refresh();
        setReady(true);
      })
      .catch(() => {
        setError("서버에 연결할 수 없습니다.");
        setReady(true);
      });
    window.cafe
      ?.invoke("hostInfo")
      .then((info) => {
        setHost(info);
        if (info?.setupToken) setSetupToken(info.setupToken);
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (!logged) return;
    const unsub = subscribe(() => void refresh());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      unsub();
      clearInterval(timer);
    };
  }, [logged]);
  const run = async (fn: () => Promise<any>) => {
    if (busy) return false;
    setBusy(true);
    setError("");
    try {
      await fn();
      await refresh();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };
  const mutate = (path: string, data: any) =>
    run(() =>
      /\/sessions\/.*\/adjust$|\/orders\//.test(path)
        ? pendingOperations.current.run(path, data, (key) =>
            api(path, data, key),
          )
        : api(path, data, crypto.randomUUID()),
    );
  const login = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      await api(
        needSetup ? "/bootstrap" : "/admin/login",
        needSetup
          ? { token: setupToken, password: data.get("password") }
          : { email: data.get("email"), password: data.get("password") },
      );
      setNeedSetup(false);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (!logged)
    return (
      <div className="auth-screen">
        <Brand />
        <div className="panel auth-card">
          <div className="eyebrow">CONTROL ROOM</div>
          <h1>{needSetup ? "우리 축제 PC방 만들기" : "관리자 로그인"}</h1>
          <p className="muted">
            {needSetup
              ? "처음 한 번만 관리자 비밀번호를 설정해 주세요."
              : "운영자만 접근할 수 있는 공간입니다."}
          </p>
          <form onSubmit={login}>
            {needSetup && (
              <label>
                초기 설정 코드
                <input
                  value={setupToken}
                  onChange={(e) => setSetupToken(e.target.value)}
                  required
                  autoComplete="off"
                />
              </label>
            )}
            <label>
              관리자 이메일
              <input
                name="email"
                type="email"
                required
                autoComplete="username"
                placeholder="owner@example.com"
              />
            </label>
            <label>
              관리자 비밀번호
              <input
                name="password"
                type="password"
                minLength={needSetup ? 10 : 1}
                maxLength={128}
                required
                autoComplete={needSetup ? "new-password" : "current-password"}
              />
            </label>
            {needSetup && (
              <p className="fine">
                10자 이상으로 설정하세요. PC 런처의 현장 종료 승인에도
                사용됩니다.
              </p>
            )}
            <ErrorMessage message={error} />
            <button className="primary wide" disabled={busy || !ready}>
              {busy ? "확인 중…" : needSetup ? "관리자 설정 완료" : "로그인"}
            </button>
          </form>
          <p className="fine">
            처음 설정한다면 SQL 설치와 최초 소유자 계정 등록을 먼저 완료하세요.
            비밀번호를 잊었다면 소유자에게 재설정을 요청하세요.
          </p>
          {host?.role === "server" && !host?.cloud && !needSetup && (
            <button
              className="subtle wide"
              onClick={() =>
                void window.cafe
                  ?.invoke("resetAdmin")
                  .catch((e) => setError(e.message))
              }
            >
              관리자 비밀번호를 잊으셨나요?
            </button>
          )}
        </div>
      </div>
    );
  const active = state?.sessions.filter((s) => s.status === "active") || [];
  const pending =
    state?.exitRequests.filter((x) => x.status === "pending") || [];
  const seatName = (id: string) =>
    state?.seats.find((s) => s.id === id)?.name || "?";
  const catalogSubmit = async (
    e: React.FormEvent<HTMLFormElement>,
    kind: "products" | "extensions" | "games",
  ) => {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    let data: any = {
      ...(editing?.kind === kind ? editing.value : {}),
      name: f.get("name"),
      enabled: f.get("enabled") === "on",
    };
    if (kind === "games") {
      data.description = f.get("description");
      data.executable = f.get("executable");
      try {
        data.args = JSON.parse(String(f.get("args") || "[]"));
        data.paths = JSON.parse(String(f.get("paths") || "{}"));
      } catch {
        setError("인수와 PC별 경로는 올바른 JSON 형식으로 입력해 주세요.");
        return;
      }
    } else {
      data.price = Number(f.get("price"));
      if (kind === "products") data.stock = Number(f.get("stock"));
      else data.seconds = Number(f.get("minutes")) * 60;
    }
    if (await mutate("/admin/" + kind, data)) {
      setEditing(null);
      form.reset();
    }
  };
  return (
    <div className="admin-layout">
      <aside className="sidebar">
        <Brand />
        <div className="eyebrow">OPERATIONS</div>
        <nav>
          {tabs.map(
            (t, i) =>
              allowed(tabPermissions[i]) && (
                <button
                  key={t}
                  className={tab === t ? "active" : ""}
                  onClick={async () => {
                    setTab(t);
                    setEditing(null);
                  }}
                >
                  <span>
                    {["◈", "▦", "▤", "◉", "▷", "⚙", "≡", "♙", "◐", "⌑"][i]}
                  </span>
                  {t}
                  {i === 2 &&
                    state?.orders.some((o) => o.status === "received") && (
                      <i className="dot" />
                    )}
                </button>
              ),
          )}
        </nav>
        <a
          className="kiosk-link"
          href="#/kiosk"
          onClick={(e) => {
            if (host?.role === "server") {
              e.preventDefault();
              void window.cafe
                ?.invoke("openKiosk")
                .catch((e) => setError(e.message));
            }
          }}
        >
          키오스크 화면 열기 ↗
        </a>
        <div className="sidebar-bottom">
          <span className="badge">
            <i /> SUPABASE CLOUD
          </span>
          <button
            onClick={async () => {
              void api("/admin/logout", {}).then(() => setLogged(false));
            }}
          >
            로그아웃
          </button>
        </div>
      </aside>
      <main className="admin-main">
        <header className="page-heading">
          <div>
            <div className="eyebrow">FESTIVAL PC CLUB / ADMIN</div>
            <h1>{tab}</h1>
          </div>
          <span className="muted">{new Date(now).toLocaleString("ko-KR")}</span>
        </header>
        <ErrorMessage message={error} />
        {pending.length > 0 && tab !== tabs[0] && (
          <div className="notice" role="status">
            PC {pending.map((r) => seatName(r.seatId)).join(", ")} · 종료 시도 /
            승인 요청 {pending.length}건
            <button onClick={() => setTab(tabs[0])}>확인하기</button>
          </div>
        )}
        {notice && (
          <div className="notice" role="status">
            {notice}
            <button onClick={() => setNotice("")}>닫기</button>
          </div>
        )}
        {tab === tabs[0] && (
          <>
            <div className="stat-grid">
              <Stat
                label="현재 플레이 중"
                value={String(active.length)}
                unit="명"
              />
              <Stat
                label="온라인 PC"
                value={String(state?.seats.filter((s) => s.online).length || 0)}
                unit="대"
              />
              <Stat
                label="대기 주문"
                value={String(
                  state?.orders.filter((o) =>
                    ["received", "preparing"].includes(o.status),
                  ).length || 0,
                )}
                unit="건"
              />
              <Stat
                label="종료 승인 요청"
                value={String(pending.length)}
                unit="건"
              />
            </div>
            {pending.length > 0 && (
              <section className="panel">
                <h2>런처 종료 승인 요청</h2>
                {pending.map((r) => (
                  <div className="list-row" key={r.id}>
                    <span>
                      <strong>PC {seatName(r.seatId)}</strong>
                      <small>
                        기기에서 프로그램 종료를 요청했습니다.{" "}
                        {(r as any).reason || ""}
                      </small>
                    </span>
                    <div className="actions">
                      <button
                        disabled={busy || !allowed("exit.approve")}
                        onClick={() =>
                          void mutate("/admin/exit-requests/" + r.id, {
                            approve: false,
                          })
                        }
                      >
                        거절
                      </button>
                      <button
                        className="primary"
                        disabled={busy || !allowed("exit.approve")}
                        onClick={() =>
                          void mutate("/admin/exit-requests/" + r.id, {
                            approve: true,
                          })
                        }
                      >
                        종료 승인
                      </button>
                    </div>
                  </div>
                ))}
              </section>
            )}
            <section className="panel">
              <div className="section-title">
                <h2>실시간 이용 현황</h2>
                <span className="muted">서버 기준 자동 갱신</span>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>좌석</th>
                      <th>이용자</th>
                      <th>상태</th>
                      <th>남은 시간</th>
                      <th>머니</th>
                      <th>관리</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state?.sessions
                      .filter((s) => s.status !== "ended")
                      .map((s) => (
                        <tr key={s.id}>
                          <td>
                            <strong>PC {seatName(s.seatId)}</strong>
                          </td>
                          <td>
                            {s.name}
                            <small>{s.studentId}</small>
                          </td>
                          <td>
                            <span className="tag">
                              {s.status === "active"
                                ? "플레이 중"
                                : "로그인 대기"}
                            </span>
                          </td>
                          <td className="mono">
                            {s.endAt
                              ? duration(
                                  s.endAt -
                                    (state.serverNow +
                                      Math.max(
                                        0,
                                        performance.now() - receivedAt.current,
                                      )),
                                )
                              : Math.floor(s.seconds / 60) + "분"}
                          </td>
                          <td>{money(s.money)} M</td>
                          <td>
                            <div className="actions">
                              <button
                                disabled={
                                  !allowed("time.adjust") &&
                                  !allowed("money.adjust")
                                }
                                onClick={() => setAdjust(s.id)}
                              >
                                시간 / 머니
                              </button>
                              <button
                                className="danger"
                                disabled={busy || !allowed("session.end")}
                                onClick={async () => {
                                  if (
                                    await confirm(
                                      "실행 중인 게임이 닫힙니다. 이용을 종료할까요?",
                                    )
                                  )
                                    void mutate(
                                      "/admin/sessions/" + s.id + "/end",
                                      {},
                                    );
                                }}
                              >
                                킥 / 이용 종료
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
                {!state?.sessions.some((s) => s.status !== "ended") && (
                  <Empty>첫 플레이어를 기다리고 있어요.</Empty>
                )}
              </div>
            </section>
          </>
        )}
        {tab === tabs[1] && (
          <>
            <section className="panel">
              <h2>좌석 추가</h2>
              <button
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const r = await api("/admin/kiosks/enrollment", {});
                    setNotice(
                      "키오스크 연결 코드: " +
                        r.code +
                        " · 키오스크 화면에 입력하세요. 10분간 유효합니다.",
                    );
                  })
                }
              >
                키오스크 연결 코드 발급
              </button>
              <form
                className="inline-form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const form = e.currentTarget;
                  const name = new FormData(form).get("name");
                  if (await mutate("/admin/seats", { name })) form.reset();
                }}
              >
                <label>
                  새 좌석 이름
                  <input
                    name="name"
                    placeholder="예: 01"
                    maxLength={30}
                    required
                  />
                </label>
                <button className="primary" disabled={busy}>
                  좌석 추가
                </button>
              </form>
            </section>
            <div className="pc-grid">
              {state?.seats.map((s) => (
                <section className="panel pc-card" key={s.id}>
                  <div className="section-title">
                    <h2>PC {s.name}</h2>
                    <span className={`tag ${s.online ? "green" : ""}`}>
                      {s.online ? "온라인" : "오프라인"}
                    </span>
                  </div>
                  <p className="muted">
                    {!s.enabled
                      ? "사용 중지"
                      : s.session
                        ? "배정 / 이용 중"
                        : "빈자리"}
                  </p>
                  <div className="actions">
                    <button
                      disabled={busy || !!s.session}
                      onClick={() =>
                        void run(async () => {
                          const r = await api("/admin/devices/enrollment", {
                            seatId: s.id,
                          });
                          setNotice(
                            `PC ${s.name} 등록 코드: ${r.code} · 10분 안에 해당 PC 런처에 입력하세요.`,
                          );
                        })
                      }
                    >
                      PC 등록 코드
                    </button>
                    <button
                      disabled={busy}
                      onClick={() =>
                        void mutate("/admin/seats/" + s.id, {
                          enabled: !s.enabled,
                        })
                      }
                    >
                      {s.enabled ? "사용 중지" : "사용 허용"}
                    </button>
                  </div>
                  <button
                    className="danger wide"
                    disabled={
                      busy ||
                      !allowed("pc.shutdown") ||
                      !s.online ||
                      !s.deviceId
                    }
                    onClick={async () => {
                      if (
                        await confirm(
                          `PC ${s.name}의 Windows를 종료합니다. 저장하지 않은 데이터가 사라질 수 있습니다. 진행할까요?`,
                        )
                      )
                        void mutate(
                          "/admin/devices/" + s.deviceId + "/shutdown",
                          { confirm: true },
                        );
                    }}
                  >
                    Windows 종료
                  </button>
                </section>
              ))}
            </div>
            <section className="panel">
              <h2>최근 원격 명령</h2>
              {state?.commands
                .slice(-10)
                .reverse()
                .map((c) => (
                  <div className="list-row" key={c.id}>
                    <span>
                      {c.type === "shutdown" ? "Windows 종료" : "런처 종료"}
                      <small>{c.id.slice(0, 8)}</small>
                    </span>
                    <span className="tag">
                      {c.status === "accepted"
                        ? "PC가 명령 접수 (전원 꺼짐 확인 아님)"
                        : c.status === "pending"
                          ? "응답 대기"
                          : c.status === "expired"
                            ? "응답 없음 / 만료"
                            : "실행 실패"}{" "}
                      {c.message}
                    </span>
                  </div>
                ))}
            </section>
          </>
        )}
        {tab === tabs[2] && (
          <section className="panel">
            <h2>간식 주문</h2>
            {!state?.orders.length && <Empty>아직 주문이 없어요.</Empty>}
            {state?.orders
              .slice()
              .reverse()
              .map((o) => (
                <div className="list-row" key={o.id}>
                  <div className="order-icon">▧</div>
                  <span className="grow">
                    <strong>{o.name}</strong>
                    <small>
                      PC {seatName(o.seatId)} · {money(o.price)} M ·{" "}
                      {new Date(o.createdAt).toLocaleTimeString("ko-KR")}
                    </small>
                  </span>
                  <span className="tag">{orderLabels[o.status]}</span>
                  <div className="actions">
                    {o.status === "received" && (
                      <button
                        className="primary"
                        disabled={busy}
                        onClick={() =>
                          void mutate("/admin/orders/" + o.id, {
                            status: "preparing",
                          })
                        }
                      >
                        준비 시작
                      </button>
                    )}
                    {o.status === "preparing" && (
                      <button
                        className="primary"
                        disabled={busy}
                        onClick={() =>
                          void mutate("/admin/orders/" + o.id, {
                            status: "delivered",
                          })
                        }
                      >
                        전달 완료
                      </button>
                    )}
                    {o.status !== "cancelled" && (
                      <button
                        disabled={busy}
                        onClick={async () => {
                          if (
                            await confirm(
                              "주문을 취소하고 머니와 재고를 복구할까요?",
                            )
                          )
                            void mutate("/admin/orders/" + o.id, {
                              status: "cancelled",
                            });
                        }}
                      >
                        취소 / 환불
                      </button>
                    )}
                  </div>
                </div>
              ))}
          </section>
        )}
        {tab === tabs[3] && (
          <div className="two-columns">
            {(["products", "extensions"] as const).map((kind) => (
              <section className="panel" key={kind}>
                <h2>{kind === "products" ? "간식 상품" : "시간 연장 상품"}</h2>
                {(kind === "products"
                  ? state?.products
                  : state?.extensions
                )?.map((p) => (
                  <div className="list-row" key={p.id}>
                    <span>
                      <strong>
                        {p.name}
                        {!p.enabled ? " · 판매 중지" : ""}
                      </strong>
                      <small>
                        {money(p.price)} M ·{" "}
                        {"stock" in p
                          ? `재고 ${p.stock}`
                          : `${p.seconds / 60}분`}
                      </small>
                    </span>
                    <button onClick={() => setEditing({ kind, value: p })}>
                      수정
                    </button>
                  </div>
                ))}
                <form
                  key={editing?.kind === kind ? editing.value.id : kind}
                  onSubmit={(e) => void catalogSubmit(e, kind)}
                >
                  <h3>
                    {editing?.kind === kind ? "상품 수정" : "새 상품 추가"}
                  </h3>
                  <label>
                    상품명
                    <input
                      name="name"
                      required
                      maxLength={100}
                      defaultValue={
                        editing?.kind === kind ? editing.value.name : ""
                      }
                    />
                  </label>
                  <div className="two-columns">
                    <label>
                      가격 (머니)
                      <input
                        name="price"
                        type="number"
                        min="0"
                        max="1000000"
                        required
                        defaultValue={
                          editing?.kind === kind ? editing.value.price : 1000
                        }
                      />
                    </label>
                    {kind === "products" ? (
                      <label>
                        재고
                        <input
                          name="stock"
                          type="number"
                          min="0"
                          max="1000000"
                          required
                          defaultValue={
                            editing?.kind === kind ? editing.value.stock : 20
                          }
                        />
                      </label>
                    ) : (
                      <label>
                        연장 시간 (분)
                        <input
                          name="minutes"
                          type="number"
                          min="1"
                          max="1440"
                          required
                          defaultValue={
                            editing?.kind === kind
                              ? editing.value.seconds / 60
                              : 10
                          }
                        />
                      </label>
                    )}
                  </div>
                  <label className="check">
                    <input
                      type="checkbox"
                      name="enabled"
                      defaultChecked={
                        editing?.kind === kind ? editing.value.enabled : true
                      }
                    />
                    판매 중
                  </label>
                  <div className="actions">
                    <button className="primary" disabled={busy}>
                      저장
                    </button>
                    {editing?.kind === kind && (
                      <button type="button" onClick={() => setEditing(null)}>
                        수정 취소
                      </button>
                    )}
                  </div>
                </form>
              </section>
            ))}
          </div>
        )}
        {tab === tabs[4] && (
          <div className="two-columns">
            <section className="panel">
              <h2>등록된 게임</h2>
              {!state?.games.length && (
                <Empty>게임 실행 파일을 등록해 주세요.</Empty>
              )}
              {state?.games.map((g) => (
                <div className="list-row" key={g.id}>
                  <span>
                    <strong>
                      ▷ {g.name}
                      {!g.enabled ? " · 숨김" : ""}
                    </strong>
                    <small className="path">
                      {g.executable || "기본 경로 없음"}
                    </small>
                  </span>
                  <button
                    onClick={() => setEditing({ kind: "games", value: g })}
                  >
                    수정
                  </button>
                </div>
              ))}
            </section>
            <section className="panel">
              <h2>{editing?.kind === "games" ? "게임 수정" : "게임 등록"}</h2>
              <form
                key={editing?.value?.id || "game"}
                onSubmit={(e) => void catalogSubmit(e, "games")}
              >
                <label>
                  게임 이름
                  <input
                    name="name"
                    required
                    defaultValue={editing?.value?.name || ""}
                  />
                </label>
                <label>
                  설명
                  <input
                    name="description"
                    maxLength={200}
                    defaultValue={editing?.value?.description || ""}
                  />
                </label>
                <label>
                  실행 파일 경로
                  <input
                    name="executable"
                    placeholder="C:\Games\MyGame\game.exe"
                    defaultValue={editing?.value?.executable || ""}
                  />
                </label>
                <p className="fine">
                  게임을 설치한 Windows PC의 실제 경로를 입력하세요.
                  바로가기(.lnk) 대신 실행 파일(.exe)을 선택하세요.
                </p>
                <label>
                  실행 인수 (JSON 배열)
                  <input
                    name="args"
                    defaultValue={JSON.stringify(editing?.value?.args || [])}
                  />
                </label>
                <label>
                  PC별 경로 (좌석 ID → 경로, JSON)
                  <textarea
                    name="paths"
                    defaultValue={JSON.stringify(
                      editing?.value?.paths || {},
                      null,
                      2,
                    )}
                  />
                </label>
                <details>
                  <summary>좌석 ID 확인</summary>
                  {state?.seats.map((s) => (
                    <p className="fine" key={s.id}>
                      PC {s.name}: {s.id}
                    </p>
                  ))}
                </details>
                <label className="check">
                  <input
                    name="enabled"
                    type="checkbox"
                    defaultChecked={editing?.value?.enabled ?? true}
                  />
                  런처에 표시
                </label>
                <button className="primary" disabled={busy}>
                  게임 저장
                </button>
                {editing && (
                  <button type="button" onClick={() => setEditing(null)}>
                    수정 취소
                  </button>
                )}
              </form>
            </section>
          </div>
        )}
        {tab === tabs[5] && (
          <div className="two-columns">
            <section className="panel">
              <h2>기본 이용 정책</h2>
              {state && (
                <form
                  key={state.settings.title}
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    void mutate("/admin/settings", {
                      title: f.get("title"),
                      initialSeconds: Number(f.get("minutes")) * 60,
                      initialMoney: Number(f.get("money")),
                      reservationSeconds: Number(f.get("reservation")) * 60,
                    });
                  }}
                >
                  <label>
                    행사 이름
                    <input
                      name="title"
                      required
                      defaultValue={state.settings.title}
                    />
                  </label>
                  <label>
                    초기 지급 시간 (분)
                    <input
                      name="minutes"
                      type="number"
                      min="1"
                      max="1440"
                      required
                      defaultValue={state.settings.initialSeconds / 60}
                    />
                  </label>
                  <label>
                    초기 지급 머니
                    <input
                      name="money"
                      type="number"
                      min="0"
                      max="1000000"
                      required
                      defaultValue={state.settings.initialMoney}
                    />
                  </label>
                  <label>
                    배정 후 로그인 제한 (분)
                    <input
                      name="reservation"
                      type="number"
                      min="1"
                      max="60"
                      required
                      defaultValue={state.settings.reservationSeconds / 60}
                    />
                  </label>
                  <button className="primary" disabled={busy}>
                    운영 정책 저장
                  </button>
                  <p className="fine">
                    변경 사항은 이후 발급하는 이용권부터 적용됩니다.
                  </p>
                </form>
              )}
            </section>
            <div>
              <section className="panel">
                <h2>PC 연결 설정</h2>
                {host?.role === "server" && !host?.cloud ? (
                  <>
                    <p>
                      아래 연결 파일을 사용자 PC로 복사하고 런처에서 불러오세요.
                      공개 인증서만 포함됩니다.
                    </p>
                    {host.addresses?.map((ip: string) => (
                      <p className="mono" key={ip}>
                        https://{ip}:{host.port}
                      </p>
                    ))}
                    <button
                      onClick={() =>
                        void window.cafe
                          ?.invoke("exportConnection")
                          .then(() =>
                            setNotice("연결 파일 저장을 완료했습니다."),
                          )
                          .catch((e) => setError(e.message))
                      }
                    >
                      PC 연결 파일 저장
                    </button>
                    <button
                      onClick={() => void window.cafe?.invoke("openData")}
                    >
                      데이터 폴더 열기
                    </button>
                  </>
                ) : (
                  <p className="muted">
                    Supabase에 직접 연결합니다. PC 런처에는 좌석 등록 코드만
                    입력하세요. 폰 관리자 주소: {WEB_URL}#/admin
                  </p>
                )}
              </section>
              <section className="panel">
                <h2>비밀번호 변경</h2>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    void mutate("/admin/password", {
                      old: f.get("old"),
                      password: f.get("new"),
                    });
                  }}
                >
                  <label>
                    현재 비밀번호
                    <input
                      name="old"
                      type="password"
                      required
                      autoComplete="current-password"
                    />
                  </label>
                  <label>
                    새 비밀번호
                    <input
                      name="new"
                      type="password"
                      required
                      minLength={10}
                      maxLength={128}
                      autoComplete="new-password"
                    />
                  </label>
                  <button disabled={busy}>비밀번호 변경 후 로그아웃</button>
                </form>
              </section>
              <section className="panel">
                <h2>행사 종료 후 개인정보 삭제</h2>
                <p className="muted">
                  종료된 이용권의 이름·학번을 삭제합니다. 이용 중인 세션과
                  머니·주문 기록은 유지됩니다.
                </p>
                <button
                  className="danger"
                  disabled={busy}
                  onClick={async () => {
                    if (
                      await confirm(
                        "종료된 이용권의 이름·학번을 영구 삭제할까요?",
                      )
                    )
                      void mutate("/admin/personal-data/purge", {});
                  }}
                >
                  종료된 이용자 정보 삭제
                </button>
              </section>
            </div>
          </div>
        )}
        {tab === tabs[6] && (
          <section className="panel">
            <h2>최근 활동 기록</h2>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>시간</th>
                    <th>작업</th>
                    <th>대상</th>
                    <th>내용</th>
                  </tr>
                </thead>
                <tbody>
                  {state?.audit.map((a, i) => (
                    <tr key={i}>
                      <td>{new Date(a.at).toLocaleString("ko-KR")}</td>
                      <td>{a.action}</td>
                      <td className="mono">{a.target.slice(0, 8)}</td>
                      <td>{a.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
        {tab === tabs[7] && state && allowed("accounts.manage") && (
          <AccountsPanel state={state} busy={busy} run={run} mutate={mutate} />
        )}
        {tab === tabs[8] && state && allowed("settings.manage") && (
          <BrandingPanel state={state} busy={busy} run={run} mutate={mutate} />
        )}
        {tab === tabs[9] && state && allowed("settings.manage") && (
          <ExitPasswordsPanel
            state={state}
            busy={busy}
            mutate={mutate}
            run={run}
          />
        )}
        {adjust && (
          <div className="modal-backdrop">
            <section className="panel modal">
              <h2>시간 / 머니 조정</h2>
              <p className="muted">추가는 양수, 차감은 음수로 입력하세요.</p>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  if (
                    await mutate("/admin/sessions/" + adjust + "/adjust", {
                      seconds: Number(f.get("minutes")) * 60,
                      money: Number(f.get("money")),
                    })
                  )
                    setAdjust(undefined);
                }}
              >
                <label>
                  시간 변경 (분)
                  <input
                    name="minutes"
                    type="number"
                    min="-1440"
                    max="1440"
                    defaultValue={0}
                    required
                  />
                </label>
                <label>
                  머니 변경
                  <input
                    name="money"
                    type="number"
                    min="-1000000"
                    max="1000000"
                    defaultValue={0}
                    required
                  />
                </label>
                <div className="actions">
                  <button type="button" onClick={() => setAdjust(undefined)}>
                    닫기
                  </button>
                  <button className="primary" disabled={busy}>
                    변경 적용
                  </button>
                </div>
              </form>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
function Stat({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit: string;
}) {
  return (
    <section className="panel stat">
      <span>{label}</span>
      <strong>
        {value}
        <small>{unit}</small>
      </strong>
    </section>
  );
}
function Empty({ children }: { children: React.ReactNode }) {
  return <div className="empty">{children}</div>;
}
