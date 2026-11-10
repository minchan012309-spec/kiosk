Unicode true
!include "MUI2.nsh"
!include "x64.nsh"
Name "@PRODUCT@"
InstallDir "$LOCALAPPDATA\Programs\@PRODUCT@"
RequestExecutionLevel user
SetCompressor /SOLID zlib
ShowInstDetails show
ShowUninstDetails show
!define /redef MUI_ICON "@ICON@"
!define /redef MUI_UNICON "@ICON@"
!define MUI_ABORTWARNING
!define MUI_WELCOMEPAGE_TEXT "PC Club 설치를 시작합니다.$\r$\n$\r$\nNode.js 등 별도 개발 도구를 설치할 필요가 없습니다.$\r$\n$\r$\n업데이트 전에 실행 중인 PC Club 프로그램을 종료해 주세요."
!insertmacro MUI_PAGE_WELCOME
!define MUI_PAGE_CUSTOMFUNCTION_LEAVE VerifyInstallDir
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!define MUI_FINISHPAGE_RUN "$INSTDIR\@PRODUCT@.exe"
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "Korean"
!insertmacro MUI_LANGUAGE "English"
Function .onInit
 ${IfNot} ${RunningX64}
  MessageBox MB_ICONSTOP "Windows 10/11 64비트 PC가 필요합니다."
  Abort
 ${EndIf}
FunctionEnd
Function VerifyInstallDir
 IfFileExists "$INSTDIR\*" 0 safe
 IfFileExists "$INSTDIR\.pcclub-@ROLE@" safe 0
 MessageBox MB_ICONSTOP "비어 있는 새 폴더를 선택해 주세요. 기존 PC Club 설치 폴더에는 업데이트할 수 있습니다."
 Abort
 safe:
FunctionEnd
Section "Install"
 SetShellVarContext current
 SetOutPath "$INSTDIR"
 File /r "@SOURCE@/*"
 File /oname=pcclub.ico "@ICON@"
 FileOpen $0 "$INSTDIR\.pcclub-@ROLE@" w
 FileWrite $0 "@PRODUCT@ @VERSION@"
 FileClose $0
 WriteUninstaller "$INSTDIR\Uninstall.exe"
 CreateDirectory "$SMPROGRAMS\@PRODUCT@"
 CreateShortcut "$SMPROGRAMS\@PRODUCT@\@PRODUCT@.lnk" "$INSTDIR\@PRODUCT@.exe" "" "$INSTDIR\pcclub.ico"
 CreateShortcut "$DESKTOP\@PRODUCT@.lnk" "$INSTDIR\@PRODUCT@.exe" "" "$INSTDIR\pcclub.ico"
 WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\PCClub-@ROLE@" "DisplayName" "@PRODUCT@"
 WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\PCClub-@ROLE@" "DisplayVersion" "@VERSION@"
 WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\PCClub-@ROLE@" "Publisher" "PC Club"
 WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\PCClub-@ROLE@" "UninstallString" '$\"$INSTDIR\Uninstall.exe$\"'
 WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\PCClub-@ROLE@" "InstallLocation" "$INSTDIR"
 WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\PCClub-@ROLE@" "NoModify" 1
 WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\PCClub-@ROLE@" "NoRepair" 1
SectionEnd
Section "Uninstall"
 SetShellVarContext current
 IfFileExists "$INSTDIR\.pcclub-@ROLE@" safe 0
 MessageBox MB_ICONSTOP "설치 폴더를 확인할 수 없어 제거를 중단합니다."
 Abort
 safe:
 Delete "$DESKTOP\@PRODUCT@.lnk"
 RMDir /r "$SMPROGRAMS\@PRODUCT@"
 DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\PCClub-@ROLE@"
 RMDir /r "$INSTDIR"
 ; User data in %APPDATA%\PCClub is deliberately retained.
SectionEnd
