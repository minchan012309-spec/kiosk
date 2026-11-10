import { useBranding } from "../branding";
import { useEffect, useState } from "react";
import { Brand, ErrorMessage } from "../App";
export function Standby({
  state,
  thanks,
  children,
}: {
  state: any;
  thanks: boolean;
  children: React.ReactNode;
}) {
  const { branding } = useBranding();
  const [logoFailed, setLogoFailed] = useState(false);
  useEffect(() => setLogoFailed(false), [branding.logoUrl]);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className={"standby-screen " + (thanks ? "standby-thanks" : "")}>
      <header>
        <Brand />
        <span className="badge">PC {state.device?.seatName || "--"}</span>
      </header>
      <main>
        {branding.logoUrl && !logoFailed ? (
          <img
            className="standby-logo"
            src={branding.logoUrl}
            alt={branding.title}
            onError={() => setLogoFailed(true)}
          />
        ) : (
          <div className="pixel-pc">
            <span>▰</span>
            <i />
          </div>
        )}
        <div className="eyebrow">
          {thanks ? "SESSION COMPLETE" : "WAITING FOR PLAYER"}
        </div>
        <h1>
          {thanks
            ? "이용해 주셔서 감사합니다"
            : "다음 플레이어를 기다리고 있어요"}
        </h1>
        <p>
          {thanks
            ? "이용 시간이 종료되어 화면이 잠겼습니다."
            : "키오스크에서 자리를 고르고 이름·학번·비밀번호를 등록해 주세요."}
        </p>
        <p className="muted">
          {thanks
            ? "잠시 후 대기 화면으로 돌아갑니다. 다시 이용하려면 키오스크에서 등록해 주세요."
            : "등록이 끝나면 이 PC에 로그인 화면이 자동으로 나타납니다."}
        </p>
        <div className="standby-clock">
          {new Date(now).toLocaleTimeString("ko-KR", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </div>
        <span className={state.online ? "green-text" : "danger-text"}>
          {state.online ? "● CLOUD CONNECTED" : "● 클라우드 연결 대기"}
        </span>
        <ErrorMessage message={state.error || ""} />
      </main>
      <footer>
        <details>
          <summary>운영자 메뉴</summary>
          <section className="panel">{children}</section>
        </details>
        <span className="fine">PLAY TOGETHER · CODE THE FESTIVAL</span>
      </footer>
    </div>
  );
}
