import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./cloud-config";
export function makeCloudClient(persist = false) {
  return createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      persistSession: persist,
      autoRefreshToken: persist,
      detectSessionInUrl: persist,
    },
    realtime: { params: { eventsPerSecond: 3 } },
  });
}
export const cloud = makeCloudClient(typeof window !== "undefined");
function message(error: any) {
  const text = error?.message || "클라우드 요청에 실패했습니다.";
  if (
    error?.code === "PGRST202" ||
    text.includes("Could not find the function")
  )
    return "Supabase SQL 설치가 필요합니다. 배포 안내의 001_club.sql을 먼저 실행하세요.";
  return text;
}
export async function cloudRequest(
  path: string,
  body?: any,
  deviceToken?: string,
  key?: string,
  client: SupabaseClient = cloud,
): Promise<any> {
  if (path === "/health") return { ok: true, setup: true, cloud: true };
  if (path === "/admin/login") {
    const { error } = await client.auth.signInWithPassword({
      email: body.email,
      password: body.password,
    });
    if (error) throw Error(message(error));
    try {
      return await cloudRequest(
        "/admin/state",
        undefined,
        undefined,
        undefined,
        client,
      );
    } catch (e) {
      await client.auth.signOut({ scope: "local" });
      throw e;
    }
  }
  if (path === "/admin/logout") {
    await client.auth.signOut({ scope: "local" });
    return { ok: true };
  }
  if (path === "/admin/password") {
    const {
      data: { user },
    } = await client.auth.getUser();
    if (!user?.email) throw Error("로그인이 필요합니다.");
    const { error: check } = await client.auth.signInWithPassword({
      email: user.email,
      password: body.old,
    });
    if (check) throw Error("현재 비밀번호가 다릅니다.");
    const { error } = await client.auth.updateUser({ password: body.password });
    if (error) throw Error(message(error));
    await client.auth.signOut({ scope: "local" });
    return { ok: true };
  }
  if (
    path === "/admin/accounts/create" ||
    path === "/admin/accounts/reset-password"
  ) {
    const { data, error } = await client.functions.invoke("club-admin", {
      body: {
        ...body,
        action: path.endsWith("/create") ? "create" : "reset-password",
      },
    });
    if (error) {
      let detail = "계정 관리 Edge Function 배포를 확인하세요.";
      try {
        const payload = await (error as any).context.json();
        detail = payload.error || detail;
      } catch {}
      throw Error(detail);
    }
    if (data?.error) throw Error(data.error);
    return data;
  }
  const { data, error } = await client.rpc("club_call", {
    p_action: path,
    p_payload: body || {},
    p_token: deviceToken || null,
    p_request_id: key || null,
  });
  if (error) throw Error(message(error));
  if (data?.error) throw Error(data.error);
  return data;
}
export async function authorizeCloudOperator(email: string, password: string) {
  const client = makeCloudClient();
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw Error("관리자 이메일과 비밀번호를 확인하세요.");
  try {
    const { data, error: permissionError } = await client.rpc("club_can", {
      p_permission: "games.manage",
    });
    if (permissionError || data !== true)
      throw Error("게임 경로 설정 권한이 없습니다.");
    return true;
  } finally {
    await client.auth.signOut({ scope: "local" });
  }
}
export function cloudSubscribe(callback: () => void) {
  const channel = cloud
    .channel("pc-club-" + crypto.randomUUID())
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "club_events" },
      callback,
    )
    .subscribe();
  const timer = setInterval(callback, 15000);
  return () => {
    clearInterval(timer);
    void cloud.removeChannel(channel);
  };
}
