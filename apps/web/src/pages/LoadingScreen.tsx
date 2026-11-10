import { useEffect, useState } from "react";
import { Brand, ErrorMessage } from "../App";
import { useBranding } from "../branding";
export function LoadingScreen({
  error = "",
  message = "클라우드와 PC 상태를 불러오고 있습니다.",
}: {
  error?: string;
  message?: string;
}) {
  const { branding } = useBranding();
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), 12000);
    return () => clearTimeout(timer);
  }, []);
  return (
    <div className="loading-screen" role="status" aria-live="polite">
      <Brand />
      {branding.logoUrl && (
        <img
          className="loading-logo"
          src={branding.logoUrl}
          alt={branding.title}
        />
      )}
      <div className="loading-pixels" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <h1>잠시만 기다려 주세요</h1>
      <p>{message}</p>
      <ErrorMessage message={error} />
      {(slow || error) && (
        <>
          <p className="muted">
            인터넷 연결을 확인해 주세요. 다시 불러와도 PC 등록과 이용 기록은
            유지됩니다.
          </p>
          <button onClick={() => location.reload()}>다시 불러오기</button>
        </>
      )}
    </div>
  );
}
