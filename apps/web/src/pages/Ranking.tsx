import { useRef, useState } from "react";
import type { AdminState } from "../../../../packages/shared/src/contracts";
import { money } from "../api";
import { useBranding } from "../branding";

const mask = (name: string) =>
  name.length <= 1
    ? name
    : name.length === 2
      ? name[0] + "*"
      : name[0] + "*".repeat(name.length - 2) + name[name.length - 1];

export function RankingPanel({ state }: { state: AdminState }) {
  const { branding } = useBranding();
  const board = useRef<HTMLDivElement>(null);
  const [hide, setHide] = useState(true);
  const [size, setSize] = useState(10);
  const list = (state.tickets || [])
    .filter((t) => t.status === "issued")
    .sort((a, b) => (b.coins || 0) - (a.coins || 0) || (a.issuedAt || 0) - (b.issuedAt || 0))
    .slice(0, size);
  const top = list[0]?.coins || 1;
  const label = (n?: string, id?: string) =>
    n ? (hide ? mask(n) : n) : "플레이어 " + (id || "").slice(-4);
  return (
    <div className="ranking-page">
      <div className="actions">
        <button className="primary" onClick={() => void board.current?.requestFullscreen?.()}>
          ⛶ 전자칠판 전체 화면
        </button>
        <label className="check">
          <input type="checkbox" checked={hide} onChange={(e) => setHide(e.target.checked)} />
          이름 가운데 가리기
        </label>
        <label className="check">
          표시
          <select value={size} onChange={(e) => setSize(Number(e.target.value))}>
            {[5, 10, 15].map((n) => (
              <option key={n} value={n}>
                TOP {n}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="ranking-board" ref={board}>
        <header>
          <span>{branding.title}</span>
          <h1>
            COIN <em>RANKING</em>
          </h1>
          <small>● LIVE · 코인 부자 순위</small>
        </header>
        {!list.length && <p className="ranking-empty">아직 등록된 플레이어가 없어요. INSERT COIN!</p>}
        <ol>
          {list.map((t, i) => (
            <li key={t.id} className={`rank-${i + 1}`}>
              <b className="rank-no">{i < 3 ? ["🥇", "🥈", "🥉"][i] : i + 1}</b>
              <span className="rank-name">{label(t.name, t.id)}</span>
              <span className="rank-bar">
                <i style={{ width: `${Math.max(4, ((t.coins || 0) / top) * 100)}%` }} />
              </span>
              <strong className="rank-coins">
                {money(t.coins || 0)}
                <small> 코인</small>
              </strong>
            </li>
          ))}
        </ol>
        <footer>피지컬 게임에 참여하고 코인을 모아 순위에 올라 보세요! · 남은 코인은 환전소에서 간식으로</footer>
      </div>
    </div>
  );
}
