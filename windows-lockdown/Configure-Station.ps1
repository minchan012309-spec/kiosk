#Requires -RunAsAdministrator
[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$StudentAccount,
    [Parameter(Mandatory=$true)][string]$LauncherPath
)
$ErrorActionPreference = 'Stop'
$ns = 'root/standardcimv2/embedded'
$backupDir = Join-Path $env:ProgramData 'PCClub-Lockdown'
$backupFile = Join-Path $backupDir 'backup.json'
$user = Get-LocalUser -Name $StudentAccount
$sid = $user.SID.Value
if (-not $user.Enabled) { throw 'Enable the dedicated student account first.' }
$admins = Get-LocalGroup -SID 'S-1-5-32-544'
if (Get-LocalGroupMember $admins | Where-Object { $_.SID.Value -eq $sid }) {
    throw 'Student account must be a standard user, never an administrator.'
}
if ($sid -eq [Security.Principal.WindowsIdentity]::GetCurrent().User.Value) {
    throw 'Run from a separate Windows administrator account.'
}
if (Test-Path $backupFile) { throw "Existing backup: $backupFile. Restore before configuring again." }
$source = Get-Item -LiteralPath $LauncherPath
if ($source.Extension -ne '.exe') { throw 'Select the installed PC Club Station EXE.' }
# Copy the complete Electron folder outside the operator private user profile.
$target = Join-Path $env:ProgramFiles 'PCClub-Event-Station'
if (Test-Path $target) { throw "Destination already exists: $target. Preserve it and investigate first." }
$shell = Get-CimClass -Namespace $ns -ClassName WESL_UserSetting
$enabled = Invoke-CimMethod -CimClass $shell -MethodName IsEnabled
$existing = Invoke-CimMethod -CimClass $shell -MethodName GetCustomShell -Arguments @{Sid=$sid}
if ($existing.Shell) { throw 'This student account already has a custom shell. Ask your Windows administrator to integrate it.' }
$adminBypass = Get-CimInstance -Namespace $ns -ClassName WEKF_Settings | Where-Object Name -eq 'DisableKeyboardFilterForAdministrators'
if (-not $adminBypass) { throw 'Keyboard Filter settings unavailable. Enable features and reboot first.' }
# Select only known OS navigation combinations. Do not block Ctrl, Alt, Shift,
# individual letters, Alt+Enter, Alt+F4 (the app handles it), or Ctrl+Alt+Delete.
$wanted = @('Alt+Tab','Alt+Esc','Ctrl+Esc','Win+Tab','Win+D','Win+M','Win+R','Win+E','Win+X',
    'Win+Ctrl+D','Win+Ctrl+F4','Win+Ctrl+Left','Win+Ctrl+Right')
$keys = @(Get-CimInstance -Namespace $ns -ClassName WEKF_PredefinedKey)
function Normalize-Key([string]$id) { (($id.ToLowerInvariant() -split '\+' | Sort-Object) -join '+') }
$normalized = @($wanted | ForEach-Object { Normalize-Key $_ })
$selected = @($keys | Where-Object { (Normalize-Key $_.Id) -in $normalized })
$found = @($selected | ForEach-Object { Normalize-Key $_.Id })
$missing = @($wanted | Where-Object { (Normalize-Key $_) -notin $found })
New-Item -ItemType Directory -Path $backupDir | Out-Null
# Restrict backup modification to SYSTEM and Windows administrators.
& icacls.exe $backupDir /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Could not protect backup folder.' }
@{
    Sid=$sid; Account=$StudentAccount; ShellEnabled=[bool]$enabled.Enabled
    AdminBypass=[string]$adminBypass.Value; Target=$target
    Keys=@($selected | ForEach-Object { @{Id=$_.Id; Enabled=[bool]$_.Enabled} })
} | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $backupFile -Encoding UTF8
try {
    New-Item -ItemType Directory -Path $target | Out-Null
    Copy-Item -Path (Join-Path $source.DirectoryName '*') -Destination $target -Recurse
    $exe = Join-Path $target $source.Name
    $adminBypass | Set-CimInstance -Property @{Value='true'} | Out-Null
    foreach ($key in $selected) { $key | Set-CimInstance -Property @{Enabled=$true} | Out-Null }
    $result = Invoke-CimMethod -CimClass $shell -MethodName SetCustomShell -Arguments @{
        Sid=$sid; Shell=('"' + $exe + '"'); DefaultAction=[uint32]0
        CustomReturnCodes=[int32[]]@(); CustomReturnCodesAction=[int32[]]@()
    }
    if ($result.ReturnValue -ne 0) { throw "SetCustomShell failed: $($result.ReturnValue)" }
    $result = Invoke-CimMethod -CimClass $shell -MethodName SetEnabled -Arguments @{Enabled=$true}
    if ($result.ReturnValue -ne 0) { throw "SetEnabled failed: $($result.ReturnValue)" }
} catch {
    Write-Warning "Partial configuration. Run Restore-Station.ps1 before retrying. Backup: $backupFile"
    throw
}
Write-Host 'Configured. Restart Windows and sign in to the student account. Pair the station in that account.'
Write-Host 'Configure three/four-finger touchpad actions to Nothing in the STUDENT account; see README-KO.md.'
if ($missing.Count) { Write-Warning ('Unsupported filter IDs (NOT blocked): ' + ($missing -join ', ')) }
Write-Host 'Approved app exit restarts the launcher. Use Ctrl+Alt+Delete to switch to the Windows administrator for maintenance.'
