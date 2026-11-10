# PC Club 무설치형 (Windows x64)

**PC-Club-Portable.zip 하나를 받아 전체 압축 해제하세요.**

```text
Station/
  PC Club Station.exe
  (동봉 파일 전체)
Server/
  PC Club Admin.exe
  (동봉 파일 전체)
사용방법.md
```

학생 게임용 노트북은 `Station/PC Club Station.exe`를, 관리자·키오스크 노트북은 `Server/PC Club Admin.exe`를 실행하세요. Server 폴더는 관리자 프로그램입니다. 클라우드 서버는 Supabase에서 동작합니다. 학생 PC에서는 Station만 실행하면 됩니다.

기존 개별 Admin/Station ZIP도 계속 제공하지만 통합 ZIP 하나로 두 프로그램을 모두 받을 수 있습니다.

ZIP을 **전체 압축 해제**한 다음 `PC Club Admin.exe` 또는 `PC Club Station.exe`를 실행하세요. ZIP 미리보기 안에서 실행하거나 EXE만 꺼내면 실행되지 않습니다. `resources`, DLL 등 동봉 파일을 함께 유지해야 합니다. 설치, Node.js 설치, 로컬 서버 실행은 필요 없습니다. Supabase 최초 SQL/Edge Function 설정과 인터넷 연결은 기존 설치형과 동일하게 필요합니다.

설치형과 기능 및 사용자별 설정 저장 위치가 같습니다. `%APPDATA%\PCClub\server` 또는 `%APPDATA%\PCClub\station`에 설정을 저장하므로 같은 Windows 계정에서 설치형과 무설치형을 전환해도 기존 PC 등록을 사용합니다. 두 버전을 동시에 실행하지 마세요. 관리자 웹 로그인 상태는 앱 데이터에 남을 수 있으므로 공용 관리자 PC에서는 로그아웃하세요.

이 무설치형은 ‘USB에 설정까지 담아 다른 PC로 이동하는 방식’은 아닙니다. 다른 PC·Windows 계정에서는 새로 등록하고 게임 경로를 설정하세요. 기기 토큰은 Windows 암호화 저장소로 보호되므로 설정 폴더를 다른 PC에 복사하지 마세요.

업데이트 시 앱을 완전히 종료하고 새 ZIP을 별도 폴더에 전체 압축 해제해 실행하세요. 앱 폴더를 삭제해도 AppData 설정은 남습니다. 기존 등록을 유지하려면 AppData를 삭제하지 마세요.

Windows 바탕 화면 전환 제한은 별도 `PC-Club-Windows-Lockdown.zip`의 안내를 따릅니다. Shell Launcher를 이미 적용한 경우 등록된 실행 경로가 새 폴더와 일치해야 합니다. 무설치형 자체에는 관리자 권한이 필요 없지만 Windows 기능/정책 적용에는 필요합니다.

게임은 별도 설치가 필요하며 관리자 인증 후 이 PC의 실제 게임 EXE 경로를 선택해야 합니다. 설치형과 무설치형 모두 미서명 프로그램입니다. 실제 행사 Windows 기기의 게임 호환성 검증은 아직 수행하지 않았습니다.
