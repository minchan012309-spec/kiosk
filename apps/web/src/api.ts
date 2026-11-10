export async function api<T = any>(
  path: string,
  body?: unknown,
  key?: string,
): Promise<T> {
  const response = await fetch("/api" + path, {
    method: body === undefined ? "GET" : "POST",
    headers:
      body === undefined
        ? {}
        : {
            "Content-Type": "application/json",
            ...(key ? { "Idempotency-Key": key } : {}),
          },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const value = await response.json();
  if (!response.ok)
    throw Error(value.error?.message || "요청을 처리할 수 없습니다.");
  return value;
}
export function subscribe(callback: () => void) {
  let stopped = false,
    socket: WebSocket,
    timer: ReturnType<typeof setTimeout>;
  const connect = () => {
    socket = new WebSocket(
      location.origin.replace(/^http/, "ws") + "/api/events",
    );
    socket.onmessage = () => callback();
    socket.onclose = () => {
      if (!stopped) timer = setTimeout(connect, 2000);
    };
  };
  connect();
  return () => {
    stopped = true;
    clearTimeout(timer);
    socket?.close();
  };
}
export const money = (n: number) => new Intl.NumberFormat("ko-KR").format(n);
export function duration(ms: number) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(seconds / 3600)).padStart(2, "0")}:${String(Math.floor((seconds % 3600) / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}
