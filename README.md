# PC CLUB · 학교 축제 PC방

**[설치 프로그램 ZIP 다운로드](https://github.com/minchan012309-spec/kiosk/releases/download/v1.0.0/PC-Club-Installers.zip)** · [릴리스 페이지](https://github.com/minchan012309-spec/kiosk/releases/tag/v1.0.0)

화이트·네온 라임 색상과 둥근모꼴·양진체를 사용한 90년대 PC방 스타일입니다. 폰트를 설치 파일에 포함하므로 인터넷 없이 표시됩니다.

Windows 노트북을 연결해 운영하는 축제 PC방 시스템입니다. 좌석 선택, 이용권 발급, PC 로그인부터 시간·머니, 간식 주문, 게임 런처, 관리자 승인 종료를 함께 제공합니다.

## 설치 파일

- `release/server/PC-Club-server-Setup-1.0.0-x64.exe`: 서버·관리자·키오스크용. 운영 노트북 한 대에 설치합니다.
- `release/station/PC-Club-station-Setup-1.0.0-x64.exe`: 이용자 PC용 전체 화면 런처. 각 게임용 노트북에 설치합니다.

Windows 10/11 **64비트**가 필요합니다. Node.js, Python, DB 서버를 별도로 설치하지 않습니다. 게임은 각 PC에 미리 설치해야 합니다. 설치 파일은 코드 서명되지 않았으므로 Windows가 게시자를 확인할 수 없다는 메시지를 표시할 수 있습니다.

## 행사장 첫 설정

1. 모든 노트북을 서로 통신 가능한 같은 네트워크에 연결합니다. 학생용 Wi-Fi가 기기 간 통신을 차단하면 별도 행사 공유기나 유선 LAN이 필요합니다.
2. 서버 프로그램을 열고 관리자 비밀번호를 설정합니다. Windows 방화벽에서 서버 프로그램의 **개인 네트워크** 접근을 허용합니다. 기본 포트는 TCP 8443입니다.
3. **좌석 / PC**에서 PC 번호를 추가합니다. **운영 설정**에서 초기 시간·머니를 조정합니다. 기본값은 30분, 3,000 머니입니다.
4. **운영 설정 → PC 연결 파일 저장**으로 `.pcclub` 파일을 저장해 이용자 PC로 복사합니다. 파일은 서버 주소와 공개 인증서만 담습니다.
5. 각 이용자 PC의 런처에서 연결 파일을 불러오고, 서버의 **PC 등록 코드**를 입력합니다. 표시되는 **비상 종료 코드**를 운영자가 별도로 안전하게 보관합니다.
6. **게임 관리**에서 실제 `.exe` 경로를 등록하고 **상품 / 시간**에서 간식·재고·가격·시간 연장 상품을 등록합니다. PC마다 게임 경로가 다르면 좌석 ID별 경로를 지정합니다.
7. 서버의 **키오스크 화면 열기**를 누릅니다. 학생은 자리 선택 → 이름·학번 입력 → 발급된 번호로 해당 PC에 로그인합니다.

진행 시간은 **PC 로그인 시점**부터 차감됩니다. 화면 오른쪽 위 18px 영역에 마우스를 1초간 두면 게임 중 이용 메뉴가 열립니다. 프로그램 종료는 관리자 비밀번호 또는 원격 승인으로 허용됩니다.

## 검증 범위

서버 자동 테스트, 실제 Chromium 브라우저 통합 흐름, 실제 Electron 서버 첫 실행을 검증합니다. Windows에서 설치·DPAPI 저장소·게임 실행/전환·게임 위 메뉴·Windows 종료가 동작하는지는 행사에 쓸 실제 노트북과 게임에서 [점검표](docs/windows-checklist.md)대로 확인해야 합니다. 독점 전체 화면과 안티치트 게임의 호환성을 보장하지 않습니다. 창 모드 또는 테두리 없는 창 모드를 권장합니다.

이 앱은 전체 화면 프로그램입니다. Windows 자체를 잠그지 않으며 작업 관리자나 시스템 단축키까지 차단하지 않습니다.

## 개발

Node.js 24 LTS를 사용합니다.

```sh
npm ci
npm test
npm run typecheck
npm run build
```

로컬 웹 개발 서버:

```sh
CAFE_DEV=1 npm run dev
```

위 개발 모드는 127.0.0.1:8443에 HTTP로만 엽니다. LAN 배포는 개발 모드 없이 TLS로 실행합니다. 웹 변경 후 `npm run build`가 필요합니다.

```sh
npm run start
npm run server:dev
npm run launcher:dev
npm run dist:win
npm run test:e2e
```

브라우저 테스트는 기본 `/usr/bin/chromium`을 사용합니다. 다른 OS에서는 `CHROMIUM_PATH`를 설치된 Chromium/Chrome 실행 파일로 지정하세요. Electron 실기 테스트 스크립트는 `scripts/desktop-smoke.mjs` 및 `scripts/station-smoke.mjs`입니다. 후자는 Linux에서 X 서버, D-Bus, libsecret 키 저장소를 사용하며 Playwright의 기본 평문 키 저장소 설정을 테스트 진입점에서 되돌립니다.

구조: `apps/server` 중앙 서버 · `apps/web` 한국어 화면 · `apps/launcher` Electron 호스트 · `packages/shared` 타입과 입력 검증.

상세 설정·백업·장애 복구는 [운영 안내](docs/operations.md)를 참고하세요.
