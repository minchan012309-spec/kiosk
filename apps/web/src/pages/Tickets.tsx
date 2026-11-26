import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import JsBarcode from "jsbarcode";
import { zipSync, strToU8 } from "fflate";
import jsQR from "jsqr";
import type {
  AdminState,
  Ticket,
} from "../../../../packages/shared/src/contracts";
import { api, money } from "../api";
import { confirmInApp as confirm } from "../dialogs";

type Props = {
  state: AdminState;
  busy: boolean;
  run: (fn: () => Promise<any>) => Promise<boolean>;
  allowed: (p: string) => boolean;
};

async function qrSvg(code: string) {
  return QRCode.toString(code, {
    type: "svg",
    margin: 1,
    errorCorrectionLevel: "M",
    color: { dark: "#ffffffff", light: "#00000000" },
  });
}
function barcodeSvg(code: string, showNumber: boolean) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  JsBarcode(el, code, {
    format: "CODE128",
    background: "transparent",
    lineColor: "#ffffff",
    displayValue: showNumber,
    font: "monospace",
    fontSize: 18,
    margin: 0,
    height: 80,
  });
  return new XMLSerializer().serializeToString(el);
}

function Scanner({ onCode }: { onCode: (c: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let stream: MediaStream | undefined;
    let raf = 0;
    let stopped = false;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    const tick = () => {
      const v = video.current;
      if (stopped || !v) return;
      if (v.readyState >= 2 && v.videoWidth) {
        const w = 480,
          h = Math.round((v.videoHeight / v.videoWidth) * w);
        canvas.width = w;
        canvas.height = h;
        ctx.drawImage(v, 0, 0, w, h);
        const hit = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, {
          inversionAttempts: "attemptBoth",
        });
        const digits = hit?.data.trim();
        if (digits && /^[0-9]{8}$/.test(digits)) {
          navigator.vibrate?.(80);
          onCode(digits);
          return;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: "environment" }, audio: false })
      .then((s) => {
        stream = s;
        if (video.current) {
          video.current.srcObject = s;
          void video.current.play();
        }
        raf = requestAnimationFrame(tick);
      })
      .catch(() =>
        setError("카메라를 열 수 없어요. 브라우저 카메라 권한을 허용하세요."),
      );
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);
  return (
    <div className="scanner">
      <video ref={video} playsInline muted />
      <i className="scanner-frame" />
      {error && <p className="danger-text">{error}</p>}
    </div>
  );
}

export function TicketsPanel({ state, busy, run, allowed }: Props) {
  const tickets = state.tickets || [];
  const [code, setCode] = useState("");
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [scan, setScan] = useState(false);
  const [count, setCount] = useState(50);
  const [showNumber, setShowNumber] = useState(true);
  const [reason, setReason] = useState(
    () => localStorage.getItem("pcclub.booth") || "",
  );
  const [custom, setCustom] = useState("");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [filter, setFilter] = useState("");
  const [zipping, setZipping] = useState(false);
  const issued = tickets.filter((t) => t.status === "issued");
  const lookup = async (c = code) => {
    if (!/^[0-9]{8}$/.test(c)) return;
    setCode(c);
    setCart({});
    await run(async () => setTicket(await api("/admin/tickets/lookup", { code: c })));
  };
  const act = (path: string, body: any) =>
    run(async () => {
      await api(path, { code: ticket!.id, ...body }, crypto.randomUUID());
      setTicket(await api("/admin/tickets/lookup", { code: ticket!.id }));
    });
  const download = async (list: Ticket[]) => {
    if (!list.length) return;
    setZipping(true);
    try {
      const files: Record<string, Uint8Array> = {
        "tickets.csv": strToU8(
          "number\n" + list.map((t) => t.id).join("\n") + "\n",
        ),
      };
      for (const t of list) {
        files[`qr/${t.id}.svg`] = strToU8(await qrSvg(t.id));
        files[`barcode/${t.id}.svg`] = strToU8(barcodeSvg(t.id, showNumber));
      }
      const blob = new Blob([zipSync(files, { level: 6 }) as BlobPart], {
        type: "application/zip",
      });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `pcclub-tickets-${list.length}.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } finally {
      setZipping(false);
    }
  };
  const cartTotal = state.products.reduce(
    (sum, p) => sum + (cart[p.id] || 0) * p.price,
    0,
  );
  const shown = tickets
    .filter((t) => !filter || t.id.includes(filter) || t.name?.includes(filter))
    .slice(0, 200);
  return (
    <div className="tickets-page">
      <div className="ticket-stats">
        <span>
          전체 <strong>{tickets.length}</strong>
        </span>
        <span>
          사용 중 <strong>{issued.length}</strong>
        </span>
        <span>
          대기 <strong>{tickets.length - issued.length}</strong>
        </span>
        <span>
          풀린 코인{" "}
          <strong>{money(issued.reduce((a, t) => a + (t.coins || 0), 0))}</strong>
        </span>
      </div>

      <section className="panel scan-panel">
        <div className="eyebrow">SCAN TICKET</div>
        <h2>입장권 찍기</h2>
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            void lookup();
          }}
        >
          <label>
            입장권 번호
            <input
              className="code-input"
              value={code}
              inputMode="numeric"
              placeholder="00000000"
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, "").slice(0, 8);
                setCode(v);
                if (v.length === 8) void lookup(v);
              }}
            />
          </label>
          <button type="button" className="primary" onClick={() => setScan(!scan)}>
            {scan ? "카메라 닫기" : "📷 QR 스캔"}
          </button>
        </form>
        {scan && (
          <Scanner
            onCode={(c) => {
              setScan(false);
              void lookup(c);
            }}
          />
        )}

        {ticket && (
          <div className="ticket-detail">
            <div className="ticket-head">
              <div>
                <small>입장권</small>
                <strong className="ticket-no">{ticket.id}</strong>
                <span className={`tag ${ticket.status === "issued" ? "on" : ""}`}>
                  {ticket.status === "issued" ? "사용 중" : "미발급 · 대기"}
                </span>
              </div>
              <div className="coin-big">
                <small>남은 코인</small>
                <strong>{money(ticket.coins || 0)}</strong>
              </div>
            </div>
            {ticket.status === "issued" && (
              <p className="muted">
                {ticket.name || "비공개"} {ticket.studentId}
                {ticket.session
                  ? ` · PC ${ticket.session.seatName} 이용 중`
                  : ` · 남은 PC 시간 ${Math.floor((ticket.seconds || 0) / 60)}분`}
              </p>
            )}

            {ticket.status === "ready" && allowed("tickets.issue") && (
              <form
                className="inline-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void act("/admin/tickets/issue", {
                    name: f.get("name"),
                    studentId: f.get("studentId"),
                  });
                }}
              >
                <label>
                  이름
                  <input name="name" required maxLength={100} />
                </label>
                <label>
                  학번
                  <input name="studentId" required maxLength={30} />
                </label>
                <button className="primary" disabled={busy}>
                  발급
                </button>
              </form>
            )}

            {ticket.status === "issued" && allowed("tickets.coins") && (
              <div className="award">
                <h3>코인 지급</h3>
                <label>
                  부스 이름 (기록용)
                  <input
                    value={reason}
                    maxLength={40}
                    placeholder="예) 농구 던지기"
                    onChange={(e) => {
                      setReason(e.target.value);
                      try {
                        localStorage.setItem("pcclub.booth", e.target.value);
                      } catch {}
                    }}
                  />
                </label>
                <div className="quick-coins">
                  {[1, 3, 5, 10, 20].map((n) => (
                    <button
                      key={n}
                      disabled={busy}
                      onClick={() => void act("/admin/tickets/award", { coins: n, reason })}
                    >
                      +{n}
                    </button>
                  ))}
                </div>
                <form
                  className="inline-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const n = Number(custom);
                    if (n) void act("/admin/tickets/award", { coins: n, reason });
                    setCustom("");
                  }}
                >
                  <label>
                    직접 입력 (차감은 -)
                    <input
                      value={custom}
                      inputMode="numeric"
                      onChange={(e) => setCustom(e.target.value.replace(/[^0-9-]/g, ""))}
                    />
                  </label>
                  <button disabled={busy || !Number(custom)}>지급</button>
                </form>
              </div>
            )}

            {ticket.status === "issued" && allowed("tickets.exchange") && (
              <div className="exchange">
                <h3>환전소 · 간식 교환</h3>
                {state.products.map((p) => (
                  <div className="list-row" key={p.id}>
                    <span>
                      {p.name} <small className="muted">· {money(p.price)}코인 · 재고 {p.stock}</small>
                    </span>
                    <span className="stepper">
                      <button
                        disabled={!cart[p.id]}
                        onClick={() => setCart({ ...cart, [p.id]: (cart[p.id] || 0) - 1 })}
                      >
                        −
                      </button>
                      <b>{cart[p.id] || 0}</b>
                      <button
                        disabled={(cart[p.id] || 0) >= p.stock}
                        onClick={() => setCart({ ...cart, [p.id]: (cart[p.id] || 0) + 1 })}
                      >
                        +
                      </button>
                    </span>
                  </div>
                ))}
                <button
                  className="primary wide"
                  disabled={busy || !cartTotal || cartTotal > (ticket.coins || 0)}
                  onClick={async () => {
                    if (!(await confirm(`${money(cartTotal)} 코인을 사용해 교환할까요?`))) return;
                    const items = Object.entries(cart)
                      .filter(([, q]) => q > 0)
                      .map(([productId, qty]) => ({ productId, qty }));
                    if (await act("/admin/tickets/exchange", { items })) setCart({});
                  }}
                >
                  {cartTotal > (ticket.coins || 0)
                    ? "코인이 부족해요"
                    : `${money(cartTotal)} 코인 교환`}
                </button>
              </div>
            )}

            {ticket.status === "issued" && allowed("tickets.exchange") && (
              <button
                className="danger wide"
                disabled={busy}
                onClick={async () => {
                  if (
                    !(await confirm(
                      `입장권 ${ticket.id}을 반납하고 초기화할까요?${ticket.coins ? `\n남은 ${money(ticket.coins)} 코인은 사라집니다.` : ""}${ticket.session ? "\nPC 이용도 종료됩니다." : ""}`,
                    ))
                  )
                    return;
                  await act("/admin/tickets/return", {});
                }}
              >
                반납 · 초기화 (재사용)
              </button>
            )}

            {!!ticket.log?.length && (
              <details>
                <summary>코인 기록 {ticket.log.length}건</summary>
                {ticket.log
                  .slice()
                  .reverse()
                  .map((l, i) => (
                    <div className="list-row" key={i}>
                      <span>
                        {new Date(l.at).toLocaleTimeString("ko-KR")} · {l.reason || "-"}
                      </span>
                      <b className={l.delta > 0 ? "green-text" : "danger-text"}>
                        {l.delta > 0 ? "+" : ""}
                        {money(l.delta)}
                      </b>
                    </div>
                  ))}
              </details>
            )}
          </div>
        )}
      </section>

      {allowed("tickets.manage") && (
        <section className="panel">
          <div className="eyebrow">PRINT TICKETS</div>
          <h2>입장권 만들기 · QR/바코드 다운로드</h2>
          <p className="muted">
            8자리 번호가 무작위로 만들어져요. SVG는 배경 투명 · 흰색 코드라서 어두운 티켓
            디자인 위에 바로 올릴 수 있어요. (ZIP 안에 qr/, barcode/ 폴더와 번호 목록
            CSV)
          </p>
          <div className="inline-form">
            <label>
              새로 만들 장수
              <input
                type="number"
                min={1}
                max={500}
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
              />
            </label>
            <button
              className="primary"
              disabled={busy || count < 1 || count > 500}
              onClick={() =>
                void run(() =>
                  api("/admin/tickets/generate", { count }, crypto.randomUUID()),
                )
              }
            >
              {count}장 만들기
            </button>
          </div>
          <label className="check">
            <input
              type="checkbox"
              checked={showNumber}
              onChange={(e) => setShowNumber(e.target.checked)}
            />
            바코드 아래 숫자 표시
          </label>
          <div className="actions">
            <button disabled={zipping || !tickets.length} onClick={() => void download(tickets)}>
              {zipping ? "만드는 중…" : `전체 ${tickets.length}장 SVG 다운로드`}
            </button>
          </div>
        </section>
      )}

      <section className="panel">
        <h2>입장권 목록</h2>
        <input
          placeholder="번호 또는 이름 검색"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <div className="ticket-list">
          {shown.map((t) => (
            <button key={t.id} className={t.status} onClick={() => void lookup(t.id)}>
              <b>{t.id}</b>
              <small>
                {t.status === "issued" ? `${t.name || "사용 중"} · ${money(t.coins)}코인` : "대기"}
              </small>
            </button>
          ))}
        </div>
        {allowed("tickets.manage") && tickets.some((t) => t.status === "ready") && (
          <button
            className="danger"
            disabled={busy}
            onClick={async () => {
              if (!(await confirm("대기 중(미발급) 입장권을 모두 삭제할까요? 이미 인쇄했다면 쓸 수 없게 됩니다.")))
                return;
              void run(() =>
                api(
                  "/admin/tickets/delete",
                  { codes: tickets.filter((t) => t.status === "ready").map((t) => t.id) },
                  crypto.randomUUID(),
                ),
              );
            }}
          >
            미발급 입장권 모두 삭제
          </button>
        )}
      </section>
    </div>
  );
}
