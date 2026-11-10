# 행사 PC 전용 Windows 계정 설정 (Education / Enterprise)

이 패키지는 기존 PC Club Station 1.1에 Windows Shell Launcher와 Keyboard Filter를 추가하는 **관리자용 설정 파일**입니다. EXE만 설치해서 적용되는 기능은 아닙니다. 실제 행사 노트북에서는 아직 실행하지 않았습니다. 학교 IT 관리자가 먼저 한 대에 적용해야 합니다. Windows 기능 지원 여부는 스크립트가 확인하며, 학교에서 관리하는 기존 키오스크 정책이 있다면 함께 검토해야 합니다.

## 적용 순서

1. 기존 Windows 관리자 계정의 비밀번호와 로그인 가능 여부를 확보합니다. 학생에게 이 비밀번호를 공유하지 않습니다.
2. 설정 → 계정 → 다른 사용자에서 **별도 로컬 표준 사용자** `PCClubGuest`를 만듭니다. 관리자 계정이나 기존 개인 계정을 학생용으로 쓰지 않습니다. 자동 로그인/평문 비밀번호 저장은 설정하지 않습니다.
3. PC Club Station을 설치합니다. 설치된 EXE의 경로를 복사합니다. 이 스크립트는 EXE뿐 아니라 같은 폴더 전체를 `C:\Program Files\PCClub-Event-Station`으로 복사합니다. 관리자 앱 EXE를 선택하지 마세요.
4. **Windows PowerShell 5.1을 관리자 권한**으로 열고 압축 푼 폴더로 이동합니다. 학교 실행 정책이 스크립트를 차단하면 학교 IT 담당자의 승인/서명을 받으세요. 실행 정책을 우회하지 않습니다.

```powershell
.\Enable-Features.ps1
```

5. Windows를 재부팅합니다. 기존 Windows 관리자 계정에서 다시 관리자 PowerShell을 엽니다.

```powershell
.\Configure-Station.ps1 -StudentAccount PCClubGuest -LauncherPath 'C:\실제 설치 경로\PC Club Station.exe'
```

6. 재부팅하고 `PCClubGuest`에 로그인합니다. 이 계정에서 **PC 연결 등록과 게임 경로 설정을 새로 진행**합니다. 다른 Windows 계정의 PC Club 데이터/기기 토큰은 복사하지 않습니다. 게임 파일은 학생 계정이 읽고 실행할 수 있는 위치에 있어야 합니다.
7. 관리자 계정에서 `mmc.exe` → 파일 → 스냅인 추가/제거 → 그룹 정책 개체 편집기 → 추가 → 찾아보기 → 사용자 → `PCClubGuest`를 선택합니다. 사용자 구성 → 관리 템플릿 → 시스템 → Ctrl+Alt+Del 옵션 → **작업 관리자 제거**를 사용으로 설정합니다. 학생 전용 정책인지 확인하고 관리자 전체 정책에는 적용하지 마세요. 이 정책은 스크립트 복구 범위 밖이므로 복구 시 같은 위치에서 ‘구성되지 않음’으로 되돌립니다. 이 단계 없이 작업 관리자 경로가 남습니다.
8. 학생 계정의 Windows 설정 → Bluetooth 및 장치 → 터치패드 → 고급 제스처에서 **세 손가락/네 손가락 탭·모든 방향 살짝 밀기를 ‘없음’**으로 설정합니다. 두 손가락 스크롤, 확대/축소, 클릭은 유지합니다. Windows 10은 장치 → 터치패드에 있습니다. Synaptics/ELAN 등 제조사 드라이버는 해당 제어판에서도 작업 보기/바탕 화면 전환 동작을 꺼야 합니다. 키보드 필터만으로 트랙패드 전환까지 차단됐다고 간주하지 마세요.

## 적용되는 범위와 게임 입력

- 학생 계정의 기본 Windows 바탕 화면 대신 런처가 실행되고, 종료·충돌하면 런처가 다시 실행됩니다. **앱에서 관리자가 종료를 승인해도 Windows 바탕 화면으로 넘어가지 않습니다.** 유지보수는 실제 Windows 관리자 계정에서 합니다.
- 지원되는 Alt+Tab, Alt+Esc, Ctrl+Esc 및 Windows 키의 작업 보기/가상 데스크톱/실행 등 전환 조합을 차단합니다. 지원되지 않는 필터 ID는 경고로 출력합니다. 경고가 있으면 해당 입력이 차단됐다고 간주하지 마세요.
- 개별 문자 키, Ctrl/Shift, 일반 게임 조작, Alt+Enter는 차단 목록에 넣지 않습니다. Alt+F4는 기존 앱의 차단·알림을 유지합니다. **게임이 앞에 떠 있을 때 Alt+F4를 포함한 모든 게임 입력 전달은 게임과 Windows에서 확인해야 합니다.**
- 게임이 차단 목록과 같은 조합을 쓰면 해당 게임 조합도 막힐 수 있습니다. Windows가 처리하는 3·4손가락 제스처도 게임에만 허용한다고 보장할 수 없습니다. 학생 게임은 다른 조합으로 바꾸거나, 필터 목록을 운영자가 조정해야 합니다.
- Keyboard Filter는 기기 수준 기능으로 **다른 비관리자 계정에도 영향을 줄 수 있습니다.** 관리자 예외는 활성화합니다. 기존 필터 설정을 백업하며, 다른 기존 키 제한은 해제하지 않습니다.
- Ctrl+Alt+Delete는 복구용으로 남겨둡니다. 잠금/로그아웃 화면으로 이동할 수 있으나 관리자 비밀번호 없이 관리자 바탕 화면에 들어갈 수는 없습니다. 별도 Windows 정책에서 작업 관리자 실행을 제한하지 않았다면 해당 경로는 남습니다.
- Shell Launcher는 실행된 모든 게임/브라우저/파일 선택창을 통제하는 보안 경계가 아닙니다. 게임 자체가 프로그램이나 Explorer를 실행하는 기능을 제공하면 별도 앱 허용 정책이 필요합니다. 게임 호환성 요구 때문에 AppLocker 일괄 제한이나 장치 전체 입력 차단은 자동 적용하지 않습니다. **모든 탈출 경로 차단을 보장하는 패키지는 아닙니다.**

## 복구

Ctrl+Alt+Delete → 사용자 전환 또는 로그아웃 → 기존 Windows 관리자 계정으로 로그인합니다. 관리자 PowerShell에서:

```powershell
.\Restore-Station.ps1
```

재부팅하면 저장한 Shell Launcher 활성화 상태·변경한 키 필터 상태·관리자 예외를 복구합니다. 사용자와 앱 데이터는 삭제하지 않습니다. 백업은 `C:\ProgramData\PCClub-Lockdown`에 남습니다. 설정 도중 오류가 나도 먼저 복구 스크립트를 실행하세요. Windows 기능 자체는 복구 시 제거하지 않습니다. 수동으로 변경한 터치패드 설정은 학생 계정 설정에서 별도로 되돌립니다.

업데이트된 앱은 원래 설치 위치에 설치되므로, 행사 계정에서 사용하는 Program Files 사본에도 업데이트를 반영해야 합니다. 복구 후 기존 사본 폴더를 운영자가 별도 보관/이동하고 다시 설정하는 방식을 권장합니다.

## Microsoft 문서

- https://learn.microsoft.com/windows/configuration/shell-launcher/
- https://learn.microsoft.com/windows/configuration/shell-launcher/wesl-usersetting
- https://learn.microsoft.com/windows/configuration/keyboard-filter/
- https://learn.microsoft.com/windows/configuration/keyboard-filter/wekf-predefinedkey
- https://learn.microsoft.com/windows/configuration/keyboard-filter/wekf-settings
