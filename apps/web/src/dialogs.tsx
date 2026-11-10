import { useEffect, useRef, useState } from "react";
type Question = { message: string; resolve: (v: boolean) => void };
let receive: ((q: Question) => void) | undefined;
export function confirmInApp(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (!receive) {
      resolve(false);
      return;
    }
    receive({ message, resolve });
  });
}
export function DialogHost() {
  const [queue, setQueue] = useState<Question[]>([]);
  const yes = useRef<HTMLButtonElement>(null);
  const active = queue[0];
  useEffect(() => {
    receive = (q) => setQueue((current) => [...current, q]);
    return () => {
      receive = undefined;
    };
  }, []);
  useEffect(() => {
    if (active) yes.current?.focus();
  }, [active]);
  const finish = (value: boolean) => {
    active?.resolve(value);
    setQueue((current) => current.slice(1));
  };
  if (!active) return null;
  return (
    <div
      className="modal-backdrop app-dialog-backdrop"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          finish(false);
        }
        if (e.key === "Tab") {
          const buttons = e.currentTarget.querySelectorAll("button");
          const first = buttons[0],
            last = buttons[buttons.length - 1];
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last?.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first?.focus();
          }
        }
      }}
    >
      <section
        className="panel modal app-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-confirm-title"
      >
        <div className="dialog-title" id="app-confirm-title">
          ▣ 이용 확인
        </div>
        <p className="dialog-message">{active.message}</p>
        <div className="actions">
          <button onClick={() => finish(false)}>취소</button>
          <button ref={yes} className="primary" onClick={() => finish(true)}>
            확인
          </button>
        </div>
      </section>
    </div>
  );
}
