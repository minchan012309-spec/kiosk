// Publishable keys are public client identifiers; permissions are enforced in Postgres/Auth.
export const CLOUD_ENABLED = true;
export const SUPABASE_URL = "https://gtvgeqdxcoiplhhufvgg.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_nOw7ig6wnm6FhztExpTGrA_YA6I9Lux";
export const WEB_URL = "https://minchan012309-spec.github.io/kiosk/";
export const PERMISSIONS = [
  ["dashboard.view", "현황 보기"],
  ["visitors.view", "이름·학번 보기"],
  ["time.adjust", "시간 추가·차감"],
  ["money.adjust", "코인 추가·차감 (PC 이용자)"],
  ["tickets.manage", "입장권 생성·삭제·QR 다운로드"],
  ["tickets.issue", "입장권 발급 (입구)"],
  ["tickets.coins", "입장권 코인 지급 (피지컬 부스)"],
  ["tickets.exchange", "환전소 교환·입장권 반납"],
  ["session.end", "이용 종료 / 킥"],
  ["pc.shutdown", "Windows 재부팅"],
  ["exit.approve", "런처 종료 승인"],
  ["orders.manage", "주문 처리·환불"],
  ["catalog.manage", "상품·가격·재고 수정"],
  ["games.manage", "게임 등록·실행 경로 설정"],
  ["seats.manage", "좌석·PC 등록"],
  ["settings.manage", "운영 정책·브랜드·종료 비밀번호 설정"],
  ["audit.view", "활동 기록 보기"],
  ["privacy.purge", "개인정보 삭제"],
] as const;
export const ROLE_PRESETS: Record<string, string[]> = {
  owner: PERMISSIONS.map((p) => p[0]),
  admin: PERMISSIONS.filter((p) => !["privacy.purge"].includes(p[0])).map(
    (p) => p[0],
  ),
  staff: [
    "dashboard.view",
    "orders.manage",
    "exit.approve",
    "tickets.issue",
    "tickets.coins",
    "tickets.exchange",
  ],
  viewer: ["dashboard.view"],
};
export function normalizePermissions(p: string[]) {
  return [
    ...new Set([
      "dashboard.view",
      ...p,
      ...(p.includes("time.adjust") || p.includes("money.adjust")
        ? ["session.adjust"]
        : []),
    ]),
  ];
}
