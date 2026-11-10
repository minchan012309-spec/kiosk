# PC CLUB 1.1 · Supabase 축제 PC방

**[설치 프로그램 ZIP](https://github.com/minchan012309-spec/kiosk/releases/download/v1.1.0/PC-Club-Installers.zip)** · **[SQL·Edge Function 설정 파일](https://github.com/minchan012309-spec/kiosk/releases/download/v1.1.0/Supabase-Setup.zip)**

**[폰 / 관리자 웹](https://minchan012309-spec.github.io/kiosk/#/admin)** · **[키오스크 웹](https://minchan012309-spec.github.io/kiosk/#/kiosk)**

폰 웹을 처음 사용하려면 GitHub 저장소 Settings → Pages → Source를 **GitHub Actions**로 설정해야 합니다.

로컬 서버 없이 Supabase로 좌석·시간·머니·주문을 연결합니다. 먼저 [Supabase 최초 설정](docs/SUPABASE-SETUP-KO.md)에 따라 SQL·최초 소유자·계정 관리 Edge Function을 등록하세요.

- 대기 화면 → 키오스크 이름·학번·4~6자리 비밀번호 등록 → 해당 PC 로그인 화면 자동 표시 → 비밀번호 입장 시 타이머 시작.
- 게임 실행·전환, 프로그램 안 주문 팝업, 시간 연장, 만료 시 게임 종료·감사 잠금 화면.
- 관리자 여러 계정·개별 권한, 여러 현장 종료 비밀번호, 폰에서 상태 확인·킥·주문·종료 승인.
- Alt+F4 차단과 관리자 알림. 인터넷 장애 때 기기별 비상 종료 코드 지원.
- 화이트/다크/자동 모드, 네온 라임·픽셀 폰트, 서비스 이름·로고 설정.
- 각 PC에서 관리자 인증 후 게임 `.exe`를 직접 골라 로컬 실행 경로 지정.
- Electron 기본 아이콘을 레트로 CRT 아이콘으로 교체. Windows 빌드에서 EXE 리소스·바로가기·작업표시줄 아이콘 적용.

관리 노트북에는 Admin 설치 파일, 사용자 노트북에는 Station 설치 파일을 사용합니다. 게임은 각각 설치해야 합니다. 최초 Supabase 설정은 별도입니다. 실제 Windows 실기 동작과 Supabase SQL 적용 완료를 주장하지 않습니다.

## 개발 / 배포

Node.js 24 LTS로 `npm ci`, `npm run build`, `npm run dist:win`을 실행합니다. GitHub의 Publish PC Club ZIP 작업이 Windows 설치 파일과 SQL 묶음을 게시하고 Pages 작업이 관리자 웹을 게시합니다. 추가 테스트는 사용자의 요청에 따라 이번 게시에서 실행하지 않습니다.

`apps/web` React 화면 · `apps/launcher` Windows Electron 호스트 · `packages/shared` 공통 타입/클라우드 adapter · `supabase` SQL/Edge Function.

`apps/server`는 1.0 로컬 서버의 이전 코드이며 1.1 설치 프로그램은 이를 실행하지 않습니다. 1.0 SQLite 데이터 자동 이전은 제공하지 않습니다.

### Education / Enterprise 행사 계정

Windows 바탕 화면 전환을 제한하려면 [Windows 설정·복구 안내](windows-lockdown/README-KO.md)를 추가 적용하세요. 앱 설치와 별개의 Windows 관리자 설정이며, 게임과 같은 입력의 선택적 허용에는 제한이 있습니다. 실제 Windows 적용 검증은 아직 하지 않았습니다.

### 무설치형 Windows ZIP

[관리자·키오스크용](https://github.com/minchan012309-spec/kiosk/releases/download/v1.1.0/PC-Club-Admin-Portable.zip) · [학생 PC용](https://github.com/minchan012309-spec/kiosk/releases/download/v1.1.0/PC-Club-Station-Portable.zip)

전체 압축 해제 후 폴더 안 EXE를 실행하세요. [무설치 사용 안내](docs/PORTABLE-KO.md). 설정은 기존과 같이 Windows 사용자 AppData에 저장됩니다.
