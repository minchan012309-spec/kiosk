import { useState } from "react";
export function GameSettings({
  state,
  call,
  busy,
}: {
  state: any;
  call: (action: string, payload?: any) => Promise<any>;
  busy: boolean;
}) {
  const [notice, setNotice] = useState("");
  return (
    <section className="game-settings">
      <h3>이 PC 게임 경로 설정</h3>
      <p className="fine">
        게임을 이 노트북에 설치한 뒤 실제 실행 파일(.exe)을 선택하세요. 관리
        PC의 경로와 다를 수 있습니다.
      </p>
      {!state.operatorUnlocked ? (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget,
              f = new FormData(form);
            const ok = await call("adminUnlock", {
              email: f.get("email"),
              password: f.get("password"),
            });
            if (ok) {
              form.reset();
              setNotice("5분 동안 이 PC의 게임 경로를 설정할 수 있습니다.");
            }
          }}
        >
          <label>
            게임 설정 권한이 있는 관리자 이메일
            <input name="email" type="email" required autoComplete="off" />
          </label>
          <label>
            관리자 계정 비밀번호
            <input
              name="password"
              type="password"
              required
              maxLength={128}
              autoComplete="off"
            />
          </label>
          <button disabled={busy || !state.online}>
            게임 경로 설정 잠금 해제
          </button>
        </form>
      ) : (
        <>
          {state.games?.map((g: any) => (
            <div className="list-row" key={g.id}>
              <span>
                <strong>{g.name}</strong>
                <small className="path">
                  {state.localGamePaths?.[g.id] ||
                    g.executable ||
                    "아직 실행 파일을 선택하지 않았습니다."}
                </small>
              </span>
              <button
                disabled={busy}
                onClick={() =>
                  void call("configureGame", { gameId: g.id }).then((r) => {
                    if (r) setNotice("실행 파일을 저장했습니다: " + r.path);
                  })
                }
              >
                이 PC 실행 파일 선택
              </button>
            </div>
          ))}
          {!state.games?.length && (
            <p className="muted">
              먼저 관리자 웹의 게임 관리에서 게임을 등록하세요.
            </p>
          )}
        </>
      )}
      {notice && <p className="notice">{notice}</p>}
    </section>
  );
}
