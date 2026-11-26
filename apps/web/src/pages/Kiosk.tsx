import { LoadingScreen } from "./LoadingScreen";
import { seatPosition } from "./SeatLayout";
import { useEffect, useRef, useState } from "react";
import type { PublicState } from "../../../../packages/shared/src/contracts";
import { api, money, subscribe } from "../api";
import { Brand, ErrorMessage } from "../App";
export function Kiosk() {
  const [state, setState] = useState<PublicState>();
  const [name, setName] = useState("");
  const [studentId, setStudentId] = useState("");
  const [code, setCode] = useState("");
  const [kioskToken, setKioskToken] = useState(
    () => localStorage.getItem("pcclub.kioskToken") || "",
  );
  const [pairCode, setPairCode] = useState("");
  const [result, setResult] = useState<any>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const key = useRef(crypto.randomUUID());
  const codeInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const refresh = () =>
      api<PublicState>("/public/state")
        .then(setState)
        .catch(() =>
          setError("서버에 연결할 수 없습니다. 운영자에게 알려 주세요."),
        );
    void refresh();
    return subscribe(() => void refresh());
  }, []);
  const fresh = () => (key.current = crypto.randomUUID());
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!/^[0-9]{8}$/.test(code)) {
      setError("입장권의 8자리 번호를 입력하거나 스캔해 주세요.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      setResult(
        await api("/tickets/issue", { code, name, studentId }, key.current),
      );
      setName("");
      setStudentId("");
      setCode("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const reset = () => {
    setResult(null);
    fresh();
  };
  useEffect(() => {
    if (!result) return;
    const t = setTimeout(reset, 15000);
    return () => clearTimeout(t);
  }, [result]);
  if (!state)
    return (
      <LoadingScreen error={error} message="키오스크 설정을 불러오고 있습니다." />
    );
  if (!kioskToken)
    return (
      <div className="auth-screen">
        <Brand />
        <section className="panel auth-card">
          <div className="eyebrow">KIOSK PAIRING</div>
          <h1>키오스크 연결</h1>
          <p className="muted">
            운영자가 처음 한 번만 등록합니다. 관리자 → 좌석 / PC → 키오스크 연결
            코드 발급에서 받은 코드를 입력하세요.
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              try {
                const r = await api("/kiosk/enroll", {
                  code: pairCode.trim().toUpperCase(),
                });
                localStorage.setItem("pcclub.kioskToken", r.token);
                setKioskToken(r.token);
                setPairCode("");
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              키오스크 연결 코드
              <input
                value={pairCode}
                onChange={(e) => setPairCode(e.target.value)}
                maxLength={12}
                required
                autoComplete="off"
              />
            </label>
            <ErrorMessage message={error} />
            <button className="primary wide" disabled={busy}>
              키오스크 연결
            </button>
          </form>
        </section>
      </div>
    );
  if (result)
    return (
      <div className="success-screen">
        <div className="success-mark">✓</div>
        <div className="eyebrow">TICKET ACTIVATED</div>
        <h1>입장권이 등록됐어요</h1>
        <div className="ticket ticket-card">
          <span>입장권 번호</span>
          <strong className="ticket-no">{result.id}</strong>
          <p>
            {Math.floor((result.seconds || 0) / 60)}분 · {money(result.coins)}{" "}
            코인
          </p>
          <small>
            빈 PC에 앉아 이 번호를 입력하면 시간이 시작돼요.
            <br />
            피지컬 게임 코인도 이 입장권에 쌓이고, 남은 코인은 환전소에서 간식으로
            바꿀 수 있어요. 나갈 때 입장권을 꼭 반납해 주세요.
          </small>
        </div>
        <button className="primary" onClick={reset}>
          다음 이용자 · 처음으로
        </button>
      </div>
    );
  const free = state.seats.filter(
    (s) => s.enabled && s.online && !s.session,
  ).length;
  return (
    <div className="kiosk">
      <header>
        <Brand />
        <span className="badge">
          <i /> 빈 PC {free}대
        </span>
      </header>
      <main className="kiosk-layout">
        <section>
          <div className="eyebrow">INSERT TICKET · PRESS START</div>
          <h1>
            입장권 받고,
            <br />
            <em>플레이 시작.</em>
          </h1>
          <ol className="kiosk-steps">
            <li>
              <b>01</b> 이름·학번 입력
            </li>
            <li>
              <b>02</b> 운영자에게 받은 입장권 번호 입력
            </li>
            <li>
              <b>03</b> 빈 PC에서 입장권 번호로 입장
            </li>
          </ol>
          <div className="legend seat-legend">
            <span>
              <i className="available" />
              빈자리 {free}
            </span>
            <span>
              <i className="occupied" />
              사용 중{" "}
              {state.seats.filter((s) => s.enabled && s.online && s.session).length}
            </span>
            <span>
              <i />
              준비 중
            </span>
          </div>
          <div
            className="seat-map classroom-seats"
            style={{
              gridTemplateColumns: `repeat(${Math.max(6, ...state.seats.map((s, i) => seatPosition(s, i).col))}, minmax(90px,1fr))`,
            }}
          >
            {state.seats.map((s, i) => {
              const ready = s.enabled && s.online;
              const available = ready && !s.session;
              return (
                <div
                  key={s.id}
                  style={{
                    gridColumn: seatPosition(s, i).col,
                    gridRow: seatPosition(s, i).row,
                  }}
                  className={`seat ${available ? "available" : ready ? "occupied" : "offline"}`}
                >
                  <span className="monitor">▰</span>
                  <strong>PC {s.name}</strong>
                  <small>
                    {!s.enabled || !s.online
                      ? "준비 중"
                      : s.session
                        ? "사용 중"
                        : "비어 있음"}
                  </small>
                </div>
              );
            })}
          </div>
        </section>
        <aside className="panel registration">
          <span className="step">CHECK IN</span>
          <h2>입장 등록</h2>
          <form onSubmit={submit}>
            <label>
              이름
              <input
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  fresh();
                }}
                required
                maxLength={100}
                placeholder="이름"
                autoComplete="off"
              />
            </label>
            <label>
              학번
              <input
                value={studentId}
                onChange={(e) => {
                  setStudentId(e.target.value);
                  fresh();
                }}
                required
                maxLength={30}
                placeholder="학번"
                autoComplete="off"
              />
            </label>
            <label>
              입장권 번호 · 8자리 (스캐너로 찍어도 돼요)
              <input
                ref={codeInput}
                className="code-input"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.replace(/\D/g, "").slice(0, 8));
                  fresh();
                }}
                inputMode="numeric"
                required
                placeholder="00000000"
                autoComplete="off"
              />
            </label>
            <div className="grant">
              <span>
                PC 시간
                <strong>
                  {Math.floor((state.settings.initialSeconds || 0) / 60)}
                  <small> 분</small>
                </strong>
              </span>
              <span>
                시작 코인
                <strong>
                  {money(state.settings.initialMoney || 0)}
                  <small> 코인</small>
                </strong>
              </span>
            </div>
            <p className="fine">
              이름과 학번은 행사 운영에만 사용하며, 입장권 반납 시 삭제됩니다.
            </p>
            <ErrorMessage message={error} />
            <button className="primary wide" disabled={busy}>
              {busy ? "등록하고 있어요…" : "입장권 등록 ↗"}
            </button>
          </form>
        </aside>
      </main>
      <footer>
        PLAY TOGETHER. CODE THE FESTIVAL.
        <span>PC CLUB / {new Date().getFullYear()}</span>
      </footer>
    </div>
  );
}
