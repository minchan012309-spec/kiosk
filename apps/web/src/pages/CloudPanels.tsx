import { confirmInApp as confirm } from "../dialogs";
import { useState } from "react";
import { api } from "../api";
import { cloud } from "../../../../packages/shared/src/cloud";
import {
  PERMISSIONS,
  ROLE_PRESETS,
  normalizePermissions,
  WEB_URL,
} from "../../../../packages/shared/src/cloud-config";
type Props = {
  state: any;
  busy: boolean;
  run: (fn: () => Promise<any>) => Promise<boolean>;
  mutate: (path: string, payload: any) => Promise<boolean>;
};
export function AccountsPanel({ state, busy, run, mutate }: Props) {
  const [editing, setEditing] = useState<any>();
  const [role, setRole] = useState("staff");
  const [permissions, setPermissions] = useState<string[]>(ROLE_PRESETS.staff);
  const [error, setError] = useState("");
  const reset = () => {
    setEditing(undefined);
    setRole("staff");
    setPermissions(ROLE_PRESETS.staff);
  };
  return (
    <div className="two-columns">
      <section className="panel">
        <h2>관리자 계정</h2>
        <p className="muted">
          계정마다 로그인 비밀번호와 권한을 따로 설정합니다. 소유자만 계정을
          관리할 수 있습니다.
        </p>
        {state.accounts?.map((a: any) => (
          <div className="list-row" key={a.id}>
            <span>
              <strong>{a.display_name}</strong>
              <small>
                {a.email} · {a.role} · {a.active ? "활성" : "비활성"}
              </small>
            </span>
            <button
              onClick={async () => {
                setEditing(a);
                setRole(a.role);
                setPermissions(a.permissions || []);
              }}
            >
              권한 수정
            </button>
          </div>
        ))}
      </section>
      <section className="panel">
        <h2>{editing ? "계정 수정" : "계정 추가"}</h2>
        <form
          key={editing?.id || "new"}
          onSubmit={async (e) => {
            e.preventDefault();
            setError("");
            const f = new FormData(e.currentTarget);
            const data = {
              display_name: f.get("display_name"),
              email: editing?.email || f.get("email"),
              role,
              permissions: normalizePermissions(permissions),
              active: f.get("active") === "on",
            };
            const ok = editing
              ? await mutate("/admin/accounts/save", {
                  ...data,
                  id: editing.id,
                })
              : await run(() =>
                  api("/admin/accounts/create", {
                    ...data,
                    password: f.get("password"),
                  }),
                );
            if (ok) reset();
          }}
        >
          <label>
            관리자 이름
            <input
              name="display_name"
              required
              maxLength={100}
              defaultValue={editing?.display_name || ""}
            />
          </label>
          <label>
            로그인 이메일
            <input
              name="email"
              type="email"
              required
              readOnly={!!editing}
              defaultValue={editing?.email || ""}
              autoComplete="off"
            />
          </label>
          {!editing && (
            <label>
              계정 비밀번호
              <input
                name="password"
                type="password"
                required
                minLength={10}
                maxLength={128}
                autoComplete="new-password"
              />
            </label>
          )}
          <label>
            역할
            <select
              value={role}
              onChange={(e) => {
                setRole(e.target.value);
                setPermissions(ROLE_PRESETS[e.target.value]);
              }}
            >
              <option value="owner">소유자 · 모든 권한 / 계정 관리</option>
              <option value="admin">관리자 · 개별 권한 선택</option>
              <option value="staff">운영 스태프 · 개별 권한 선택</option>
              <option value="viewer">조회 전용 · 개별 권한 선택</option>
            </select>
          </label>
          {role === "owner" ? (
            <p className="notice">
              소유자는 모든 권한을 가집니다. 마지막 소유자는 비활성화할 수
              없습니다.
            </p>
          ) : (
            <fieldset className="permission-grid">
              <legend>허용할 기능</legend>
              {PERMISSIONS.map(([p, label]) => (
                <label className="check" key={p}>
                  <input
                    type="checkbox"
                    disabled={p === "dashboard.view"}
                    checked={permissions.includes(p)}
                    onChange={(e) =>
                      setPermissions(
                        e.target.checked
                          ? [...permissions, p]
                          : permissions.filter((x) => x !== p),
                      )
                    }
                  />
                  {label}
                </label>
              ))}
            </fieldset>
          )}
          <label className="check">
            <input
              name="active"
              type="checkbox"
              defaultChecked={editing?.active ?? true}
            />
            로그인·운영 권한 활성화
          </label>
          <div className="actions">
            <button className="primary" disabled={busy}>
              계정 저장
            </button>
            {editing && (
              <button type="button" onClick={reset}>
                새 계정 추가
              </button>
            )}
          </div>
          {error && <p className="error">{error}</p>}
        </form>
        {editing && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const password = new FormData(form).get("password");
              if (await confirm("선택한 계정의 비밀번호를 변경할까요?")) {
                if (
                  await run(() =>
                    api("/admin/accounts/reset-password", {
                      id: editing.id,
                      password,
                    }),
                  )
                )
                  form.reset();
              }
            }}
          >
            <h3>선택한 계정 비밀번호 재설정</h3>
            <label>
              새 비밀번호
              <input
                name="password"
                type="password"
                required
                minLength={10}
                maxLength={128}
                autoComplete="new-password"
              />
            </label>
            <button disabled={busy}>비밀번호 재설정</button>
          </form>
        )}
      </section>
    </div>
  );
}
export function BrandingPanel({ state, busy, run, mutate }: Props) {
  const [logo, setLogo] = useState<string | null>(null);
  return (
    <div className="two-columns">
      <section className="panel">
        <h2>이름 / 로고 / 기본 화면 모드</h2>
        <form
          key={state.settings.title}
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void mutate("/admin/settings", {
              ...state.settings,
              title: f.get("title"),
              subtitle: f.get("subtitle"),
              defaultTheme: f.get("theme"),
              logoUrl: logo ?? state.settings.logoUrl ?? "",
            });
          }}
        >
          <label>
            서비스 이름
            <input
              name="title"
              required
              maxLength={100}
              defaultValue={state.settings.title}
            />
          </label>
          <label>
            부제 / 동아리 이름
            <input
              name="subtitle"
              maxLength={100}
              defaultValue={state.settings.subtitle || "FESTIVAL EDITION"}
            />
          </label>
          <label>
            기본 테마
            <select
              name="theme"
              defaultValue={state.settings.defaultTheme || "light"}
            >
              <option value="light">라이트</option>
              <option value="dark">다크</option>
              <option value="system">기기 설정에 맞춤</option>
            </select>
          </label>
          <p className="fine">
            각 PC와 폰에서 직접 선택한 화면 모드는 그대로 유지됩니다.
          </p>
          {(logo ?? state.settings.logoUrl) && (
            <img
              className="logo-preview"
              src={logo ?? state.settings.logoUrl}
              alt="로고 미리보기"
            />
          )}
          <label>
            로고 업로드 · PNG/JPG/WebP, 2MB 이하
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                void run(async () => {
                  if (
                    file.size > 2097152 ||
                    !["image/png", "image/jpeg", "image/webp"].includes(
                      file.type,
                    )
                  )
                    throw Error("PNG/JPG/WebP 이미지 2MB 이하를 선택하세요.");
                  const ext =
                    file.type === "image/png"
                      ? "png"
                      : file.type === "image/webp"
                        ? "webp"
                        : "jpg";
                  const path = crypto.randomUUID() + "." + ext;
                  const { error } = await cloud.storage
                    .from("club-branding")
                    .upload(path, file, {
                      contentType: file.type,
                      upsert: false,
                    });
                  if (error)
                    throw Error(
                      "로고 업로드에 실패했습니다. SQL 설치와 이미지 업로드 권한을 확인하세요.",
                    );
                  setLogo(
                    cloud.storage.from("club-branding").getPublicUrl(path).data
                      .publicUrl,
                  );
                });
              }}
            />
          </label>
          <div className="actions">
            <button type="button" onClick={() => setLogo("")}>
              기본 로고 사용
            </button>
            <button className="primary" disabled={busy}>
              브랜드 설정 저장
            </button>
          </div>
        </form>
      </section>
      <section className="panel">
        <h2>폰에서 관리자 화면 열기</h2>
        <p className="muted">
          폰 브라우저에서 아래 주소로 접속하고 관리자 계정으로 로그인하세요.
          권한에 따라 이용 현황 확인, 킥, 시간·머니 조정, 주문 처리, 종료 승인이
          가능합니다.
        </p>
        <a
          className="mobile-url"
          href={WEB_URL + "#/admin"}
          target="_blank"
          rel="noreferrer"
        >
          {WEB_URL}#/admin ↗
        </a>
        <p className="fine">
          GitHub Pages 게시와 Supabase SQL 설치 후 사용할 수 있습니다. 인터넷
          연결이 필요합니다.
        </p>
        <h3>화면 모드 / 폰트</h3>
        <p>
          아래 화면 모드 버튼으로 라이트·다크·자동 모드를 선택할 수 있습니다.
          제목과 본문·숫자에는 둥근모꼴을 주로 사용하고 서비스 로고에 양진체를
          사용합니다.
        </p>
      </section>
    </div>
  );
}
export function ExitPasswordsPanel({ state, busy, mutate }: Props) {
  return (
    <div className="two-columns">
      <section className="panel">
        <h2>종료 승인 비밀번호 목록</h2>
        <p className="muted">
          관리자 로그인 계정과 별개입니다. 현장에서 런처 종료를 승인할 여러
          비밀번호를 등록할 수 있습니다. 원문은 다시 표시하지 않습니다.
        </p>
        {state.exitPasswords?.map((p: any) => (
          <div className="list-row" key={p.id}>
            <span>
              {p.label}
              <small>{p.active ? "사용 중" : "폐기됨"}</small>
            </span>
            {p.active && (
              <button
                className="danger"
                disabled={busy}
                onClick={async () => {
                  if (
                    await confirm(
                      "이 종료 비밀번호를 더 이상 사용하지 못하게 할까요?",
                    )
                  )
                    void mutate("/admin/exit-passwords/" + p.id, {});
                }}
              >
                폐기
              </button>
            )}
          </div>
        ))}
      </section>
      <section className="panel">
        <h2>종료 승인 비밀번호 추가</h2>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const f = new FormData(form);
            if (
              await mutate("/admin/exit-passwords", {
                label: f.get("label"),
                password: f.get("password"),
              })
            )
              form.reset();
          }}
        >
          <label>
            구분 이름
            <input
              name="label"
              required
              maxLength={100}
              placeholder="예: 오전 운영팀"
            />
          </label>
          <label>
            종료 승인 비밀번호
            <input
              name="password"
              type="password"
              required
              minLength={6}
              maxLength={128}
              autoComplete="new-password"
            />
          </label>
          <button className="primary" disabled={busy}>
            추가
          </button>
        </form>
        <p className="fine">
          온라인 종료 승인은 이 비밀번호 중 하나로 처리합니다. 인터넷 장애
          시에는 PC 등록 때 발급한 기기별 비상 종료 코드를 사용하세요.
        </p>
      </section>
    </div>
  );
}
