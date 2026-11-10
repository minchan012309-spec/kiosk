# Cloud Upgrade Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement directly in the existing cloud checkout. User explicitly asked to avoid further test/review runs.

**Goal:** Supabase 백엔드와 모바일 권한별 운영, 테마/브랜딩, 로컬 게임 경로 선택을 제공한다.
**Architecture:** 웹과 Electron main의 공통 cloud client → Supabase RPC. 관리자 Auth는 Supabase, 기기 인증은 해시 토큰. 계정 생성은 Edge Function. 기존 웹 API 형태를 유지하는 adapter로 화면 변경을 제한한다.
**Tech Stack:** 기존 TypeScript/React/Electron + supabase-js + Postgres/pgcrypto + Edge Functions.
**Spec:** docs/superpowers/specs/2026-11-10-cloud-upgrade.md

## Constraints and review focus
- Publishable 키는 공개 가능하나 service_role은 서버 전용이다.
- 인적사항·게임 경로·기기 토큰이 공개 상태에 노출되면 안 된다.
- 결제·환불·연장·수동 지급은 원자적이고 같은 요청 번호로 재시도 가능해야 한다.
- 마지막 소유자와 권한 승격을 DB에서 보호한다.
- 기기 명령은 기기별·만료·소비 상태로 제어하며 실제 전원 꺼짐을 확인했다고 표시하지 않는다.

## Tasks
- [ ] supabase/migrations/001_club.sql: RLS 상태 저장, 프로필/권한, 안전한 RPC, 이벤트/로고 bucket.
- [ ] supabase/002_first_owner.sql and functions/club-admin/index.ts: 최초 소유자와 서버 전용 계정 생성/재설정.
- [ ] packages/shared/src/cloud.ts and cloud-config.ts; apps/web/src/api.ts: Auth·RPC·Realtime adapter.
- [ ] apps/launcher/src/main.ts: 서버 EXE를 관리 콘솔로 전환, Supabase 기기 등록, 종료 인증, 운영자 잠금 해제와 로컬 파일 선택/진단.
- [ ] apps/web/src/branding.tsx and pages/Admin.tsx, Launcher.tsx: 계정/권한/종료 코드/브랜드 설정, 테마와 모바일 킥.
- [ ] SQL·Edge 배포 안내 및 GitHub Pages/설치 ZIP 1.1.0 게시. SQL 미실행 상태와 Windows 실기 미확인을 구분해 보고.
