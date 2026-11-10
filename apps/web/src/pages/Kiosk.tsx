import { LoadingScreen } from "./LoadingScreen";
import { seatPosition } from "./SeatLayout";
import { useEffect, useRef, useState } from "react";
import type { PublicState } from "../../../../packages/shared/src/contracts";
import { api, money, subscribe } from "../api";
import { Brand, ErrorMessage } from "../App";
export function Kiosk() {
  const [state, setState] = useState<PublicState>();
  const [selected, setSelected] = useState("");
  const [name, setName] = useState("");
  const [studentId, setStudentId] = useState("");
  const [password, setPassword] = useState("");
  const [passwordAgain, setPasswordAgain] = useState("");
  const [kioskToken, setKioskToken] = useState(
    () => localStorage.getItem("pcclub.kioskToken") || "",
  );
  const [pairCode, setPairCode] = useState("");
  const [result, setResult] = useState<any>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const key = useRef(crypto.randomUUID());
  const locked = useRef(false);
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
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (locked.current) return;
    if (!/^[0-9]{4,6}$/.test(password) || password !== passwordAgain) {
      setError("비밀번호는 숫자 4~6자리이며 확인 값과 같아야 합니다.");
      return;
    }
    locked.current = true;
    setBusy(true);
    setError("");
    try {
      setResult(
        await api(
          "/reservations",
          { seatId: selected, name, studentId, password },
          key.current,
        ),
      );
      setName("");
      setStudentId("");
      setPassword("");
      setPasswordAgain("");
      setPassword("");
      setPasswordAgain("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      locked.current = false;
      setBusy(false);
    }
  };
  const reset = () => {
    setResult(null);
    setSelected("");
    setName("");
    setStudentId("");
    setPassword("");
    setPasswordAgain("");
    key.current = crypto.randomUUID();
  };
  useEffect(() => {
    if (!result) return;
    const t = setTimeout(reset, 20000);
    return () => clearTimeout(t);
  }, [result]);
  if (!state)
    return (
      <LoadingScreen
        error={error}
        message="좌석과 키오스크 설정을 불러오고 있습니다."
      />
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
        <div className="eyebrow">READY TO PLAY</div>
        <h1>이용권이 준비됐어요</h1>
        <p>
          PC {state?.seats.find((s) => s.id === selected)?.name}에 로그인 화면이
          자동으로 표시됩니다.
        </p>
        <div className="ticket">
          <span>이용할 자리</span>
          <strong>
            PC {state?.seats.find((s) => s.id === selected)?.name}
          </strong>
          <p>방금 만든 4~6자리 비밀번호로 입장하세요.</p>
          <p>
            {Math.floor(result.seconds / 60)}분 · {money(result.money)} 머니
          </p>
          <small>
            PC에서 비밀번호를 입력하고 입장하는 순간부터 시간이 시작됩니다.
            <br />
            {new Date(result.expiresAt).toLocaleTimeString("ko-KR")}까지
            로그인해 주세요.
          </small>
        </div>
        <button className="primary" onClick={reset}>
          다음 이용자 · 처음으로
        </button>
      </div>
    );
  return (
    <div className="kiosk">
      <header>
        <Brand />
        <span className="badge">
          <i /> 축제 PC방에 오신 걸 환영해요
        </span>
      </header>
      <main className="kiosk-layout">
        <section>
          <div className="eyebrow">TAKE YOUR SEAT</div>
          <h1>
            오늘의 플레이,
            <br />
            <em>여기서 시작.</em>
          </h1>
          <p className="muted">
            빈자리를 고르고 이용권을 받아 주세요.
            <br />
            시간은 PC에서 로그인한 순간부터 시작돼요.
          </p>
          <div className="legend">
            <span>
              <i className="available" />
              이용 가능
            </span>
            <span>
              <i className="occupied" />
              사용 중
            </span>
            <span>
              <i />
              연결 대기 / 사용 중지
            </span>
          </div>
          <div
            className="seat-map classroom-seats"
            style={{
              gridTemplateColumns: `repeat(${Math.max(6, ...(state?.seats.map((s, i) => seatPosition(s, i).col) || []))}, minmax(90px,1fr))`,
            }}
          >
            {state?.seats.length === 0 && (
              <div className="empty">운영자가 좌석을 준비하고 있어요.</div>
            )}
            {state?.seats.map((s, i) => {
              const available = s.enabled && s.online && !s.session;
              return (
                <button
                  key={s.id}
                  style={{
                    gridColumn: seatPosition(s, i).col,
                    gridRow: seatPosition(s, i).row,
                  }}
                  aria-label={`PC ${s.name} ${available ? "이용 가능" : "사용 불가"}`}
                  className={`seat ${available ? "available" : ""} ${selected === s.id ? "selected" : ""}`}
                  disabled={!available}
                  onClick={() => {
                    setSelected(s.id);
                    key.current = crypto.randomUUID();
                  }}
                >
                  <span className="monitor">▰</span>
                  <strong>PC {s.name}</strong>
                  <small>
                    {!s.enabled
                      ? "사용 중지"
                      : !s.online
                        ? "연결 대기"
                        : s.session?.status === "reserved"
                          ? "배정 대기"
                          : s.session
                            ? "사용 중"
                            : "이용 가능"}
                  </small>
                </button>
              );
            })}
          </div>
          <div className="screen-line">PROGRAMMING CLUB · FESTIVAL ARENA</div>
        </section>
        <aside className="panel registration">
          <span className="step">01 / CHECK IN</span>
          <h2>플레이어 등록</h2>
          <p className="muted">이용할 자리와 정보를 확인해 주세요.</p>
          <div className="chosen">
            <span>선택한 좌석</span>
            <strong>
              {selected
                ? "PC " + state?.seats.find((s) => s.id === selected)?.name
                : "좌석을 선택해 주세요"}
            </strong>
          </div>
          <form onSubmit={submit}>
            <label>
              이름
              <input
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  key.current = crypto.randomUUID();
                }}
                required
                maxLength={100}
                placeholder="이름을 입력하세요"
                autoComplete="off"
              />
            </label>
            <label>
              학번
              <input
                value={studentId}
                onChange={(e) => {
                  setStudentId(e.target.value);
                  key.current = crypto.randomUUID();
                }}
                required
                maxLength={30}
                placeholder="학번을 입력하세요"
                autoComplete="off"
              />
            </label>
            <label>
              PC 로그인 비밀번호 · 숫자 4~6자리
              <input
                type="password"
                inputMode="numeric"
                pattern="[0-9]{4,6}"
                minLength={4}
                maxLength={6}
                required
                autoComplete="new-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value.replace(/\D/g, ""));
                  key.current = crypto.randomUUID();
                }}
                placeholder="기억하기 쉬운 비밀번호"
              />
            </label>
            <label>
              비밀번호 확인
              <input
                type="password"
                inputMode="numeric"
                pattern="[0-9]{4,6}"
                minLength={4}
                maxLength={6}
                required
                autoComplete="new-password"
                value={passwordAgain}
                onChange={(e) =>
                  setPasswordAgain(e.target.value.replace(/\D/g, ""))
                }
                placeholder="같은 비밀번호를 한 번 더 입력"
              />
            </label>
            <div className="grant">
              <span>
                기본 지급 시간
                <strong>
                  {Math.floor((state?.settings.initialSeconds || 0) / 60)}
                  <small> 분</small>
                </strong>
              </span>
              <span>
                기본 지급 머니
                <strong>
                  {money(state?.settings.initialMoney || 0)}
                  <small> M</small>
                </strong>
              </span>
            </div>
            <p className="fine">
              이름과 학번은 행사 운영에만 사용되며 행사 종료 후 삭제합니다.
            </p>
            <ErrorMessage message={error} />
            <button
              className="primary wide"
              disabled={!selected || busy || !state}
            >
              {busy ? "이용권을 발급하고 있어요…" : "이용권 발급"}{" "}
              <span aria-hidden="true">↗</span>
            </button>
          </form>
          <small className="muted">
            도움이 필요하면 가까운 운영자에게 말씀해 주세요.
          </small>
        </aside>
      </main>
      <footer>
        PLAY TOGETHER. CODE THE FESTIVAL.
        <span>PC CLUB / {new Date().getFullYear()}</span>
      </footer>
    </div>
  );
}
