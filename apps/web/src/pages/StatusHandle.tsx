import { useEffect, useState } from "react";

export function StatusHandle() {
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    document.documentElement.classList.add("status-handle-window");
    return () =>
      document.documentElement.classList.remove("status-handle-window");
  }, []);
  return (
    <button
      className="status-handle-button"
      aria-label="남은 시간·머니·주문 상태창 열기"
      title="내 PC 상태창 열기"
      disabled={busy}
      onClick={async () => {
        if (busy) return;
        setBusy(true);
        try {
          await window.cafe?.invoke("openOverlay");
        } finally {
          setBusy(false);
        }
      }}
    >
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M16 5 9 12l7 7M9 12H21"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span>내 PC</span>
    </button>
  );
}
