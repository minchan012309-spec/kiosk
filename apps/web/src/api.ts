import {
  cloudRequest,
  cloudSubscribe,
} from "../../../packages/shared/src/cloud";
export async function api<T = any>(
  path: string,
  body?: unknown,
  key?: string,
): Promise<T> {
  return cloudRequest(
    path,
    body,
    path === "/reservations"
      ? localStorage.getItem("pcclub.kioskToken") || undefined
      : undefined,
    key,
  );
}
export const subscribe = cloudSubscribe;
export const money = (n: number) => new Intl.NumberFormat("ko-KR").format(n);
export function duration(ms: number) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(seconds / 3600)).padStart(2, "0")}:${String(Math.floor((seconds % 3600) / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}
