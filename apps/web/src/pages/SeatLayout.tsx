import { useRef, useState } from "react";
import type { Seat } from "../../../../packages/shared/src/contracts";

export function seatPosition(seat: Seat, index: number) {
  return {
    row: seat.row ?? Math.floor(index / 6) + 1,
    col: seat.col ?? (index % 6) + 1,
  };
}
export function SeatLayout({
  seats,
  busy,
  save,
}: {
  seats: Seat[];
  busy: boolean;
  save: (payload: any) => Promise<any>;
}) {
  const [draft, setDraft] = useState<Seat[] | null>(null);
  const [columns, setColumns] = useState(8);
  const [rows, setRows] = useState(8);
  const [selected, setSelected] = useState<string>();
  const [message, setMessage] = useState("");
  const drag = useRef<
    { id: string; x: number; y: number; moved: boolean } | undefined
  >(undefined);
  const board = useRef<HTMLDivElement>(null);
  const list = draft ?? seats.map((s, i) => ({ ...s, ...seatPosition(s, i) }));
  const width = Math.max(columns, ...list.map((s) => s.col || 1));
  const height = Math.max(rows, ...list.map((s) => s.row || 1));
  const move = (id: string, row: number, col: number) => {
    const source = list.find((s) => s.id === id);
    if (!source) return;
    const occupant = list.find(
      (s) => s.id !== id && s.row === row && s.col === col,
    );
    setDraft(
      list.map((s) =>
        s.id === id
          ? { ...s, row, col }
          : s.id === occupant?.id
            ? { ...s, row: source.row, col: source.col }
            : s,
      ),
    );
    setMessage("변경한 배치를 저장해 주세요.");
  };
  const reorder = (id: string, delta: number) => {
    const next = [...list],
      index = next.findIndex((s) => s.id === id),
      to = index + delta;
    if (to < 0 || to >= next.length) return;
    [next[index], next[to]] = [next[to], next[index]];
    setDraft(next);
  };
  return (
    <section className="panel layout-editor">
      <h2>교실 자리 배치 · 표시 순서</h2>
      <p className="fine">
        PC를 드래그하거나 PC를 선택한 뒤 빈칸을 누르세요. 다른 PC 위에 놓으면
        서로 자리를 바꿉니다. 배치는 키오스크에도 적용됩니다.
      </p>
      <div className="actions">
        <label>
          가로 칸{" "}
          <input
            type="number"
            min="1"
            max="24"
            value={columns}
            onChange={(e) =>
              setColumns(Math.max(1, Math.min(24, Number(e.target.value) || 1)))
            }
          />
        </label>
        <label>
          세로 칸{" "}
          <input
            type="number"
            min="1"
            max="24"
            value={rows}
            onChange={(e) =>
              setRows(Math.max(1, Math.min(24, Number(e.target.value) || 1)))
            }
          />
        </label>
        <button
          disabled={busy || !list.length}
          onClick={() =>
            setDraft(
              list.map((s, i) => ({
                ...s,
                row: Math.floor(i / columns) + 1,
                col: (i % columns) + 1,
              })),
            )
          }
        >
          순서대로 정렬
        </button>
      </div>
      <div className="layout-scroll">
        <div className="classroom-front">칠판 / 교실 앞</div>
        <div
          className="classroom-board"
          ref={board}
          style={{
            gridTemplateColumns: `repeat(${width}, 76px)`,
            gridTemplateRows: `repeat(${height}, 68px)`,
          }}
          onPointerMove={(e) => {
            const active = drag.current;
            if (
              active &&
              Math.hypot(e.clientX - active.x, e.clientY - active.y) > 7
            )
              active.moved = true;
          }}
          onPointerUp={(e) => {
            const active = drag.current;
            drag.current = undefined;
            if (!active?.moved || !board.current) return;
            const rect = board.current.getBoundingClientRect();
            const col = Math.floor((e.clientX - rect.left) / 82) + 1;
            const row = Math.floor((e.clientY - rect.top) / 74) + 1;
            if (col >= 1 && col <= width && row >= 1 && row <= height)
              move(active.id, row, col);
          }}
          onPointerCancel={() => {
            drag.current = undefined;
          }}
        >
          {Array.from({ length: width * height }, (_, i) => (
            <button
              type="button"
              disabled={busy}
              className="layout-cell"
              key={`cell-${i}`}
              style={{
                gridColumn: (i % width) + 1,
                gridRow: Math.floor(i / width) + 1,
              }}
              aria-label={`${Math.floor(i / width) + 1}행 ${(i % width) + 1}열로 이동`}
              onClick={() => {
                if (selected)
                  move(selected, Math.floor(i / width) + 1, (i % width) + 1);
              }}
            />
          ))}
          {list.map((s) => (
            <button
              type="button"
              key={s.id}
              className={`layout-pc ${selected === s.id ? "selected" : ""}`}
              style={{ gridColumn: s.col, gridRow: s.row }}
              disabled={busy}
              onPointerDown={(e) => {
                if (e.button !== 0) return;
                setSelected(s.id);
                drag.current = {
                  id: s.id,
                  x: e.clientX,
                  y: e.clientY,
                  moved: false,
                };
                e.currentTarget.setPointerCapture(e.pointerId);
              }}
              onClick={() => setSelected(s.id)}
            >
              <span>▰</span>
              <strong>PC {s.name}</strong>
            </button>
          ))}
        </div>
      </div>
      <h3>목록 표시 순서</h3>
      <div className="seat-order-list">
        {list.map((s, i) => (
          <div
            key={s.id}
            className="list-row"
            draggable={!busy}
            onDragStart={(e) =>
              e.dataTransfer.setData("text/pcclub-seat", s.id)
            }
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const id = e.dataTransfer.getData("text/pcclub-seat");
              const from = list.findIndex((x) => x.id === id);
              if (from < 0) return;
              const next = [...list];
              const [item] = next.splice(from, 1);
              next.splice(i, 0, item);
              setDraft(next);
            }}
          >
            <span>
              ⠿ {i + 1}. PC {s.name}
            </span>
            <div className="actions">
              <button
                type="button"
                disabled={busy || i === 0}
                onClick={() => reorder(s.id, -1)}
              >
                ↑
              </button>
              <button
                type="button"
                disabled={busy || i === list.length - 1}
                onClick={() => reorder(s.id, 1)}
              >
                ↓
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="actions">
        <button
          className="primary"
          disabled={busy || !draft}
          onClick={async () => {
            const ok = await save({
              seats: list.map((s) => ({ id: s.id, row: s.row, col: s.col })),
              expectedIds: seats.map((s) => s.id),
            });
            if (ok) {
              setDraft(null);
              setMessage("자리 배치를 저장했습니다.");
            }
          }}
        >
          배치 · 순서 저장
        </button>
        <button
          disabled={busy || !draft}
          onClick={() => {
            setDraft(null);
            setMessage("");
          }}
        >
          변경 취소
        </button>
      </div>
      {message && <p className="notice">{message}</p>}
    </section>
  );
}
