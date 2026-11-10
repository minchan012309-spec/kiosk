#Requires -RunAsAdministrator
$ErrorActionPreference = 'Stop'
$ns = 'root/standardcimv2/embedded'
$file = Join-Path $env:ProgramData 'PCClub-Lockdown/backup.json'
$backup = Get-Content -LiteralPath $file -Raw | ConvertFrom-Json
$shell = Get-CimClass -Namespace $ns -ClassName WESL_UserSetting
$result = Invoke-CimMethod -CimClass $shell -MethodName RemoveCustomShell -Arguments @{Sid=[string]$backup.Sid}
if ($result.ReturnValue -ne 0) { throw "RemoveCustomShell failed: $($result.ReturnValue)" }
$result = Invoke-CimMethod -CimClass $shell -MethodName SetEnabled -Arguments @{Enabled=[bool]$backup.ShellEnabled}
if ($result.ReturnValue -ne 0) { throw "SetEnabled failed: $($result.ReturnValue)" }
foreach ($old in $backup.Keys) {
    Get-CimInstance -Namespace $ns -ClassName WEKF_PredefinedKey |
        Where-Object Id -eq $old.Id | Set-CimInstance -Property @{Enabled=[bool]$old.Enabled} | Out-Null
}
Get-CimInstance -Namespace $ns -ClassName WEKF_Settings |
    Where-Object Name -eq 'DisableKeyboardFilterForAdministrators' |
    Set-CimInstance -Property @{Value=[string]$backup.AdminBypass} | Out-Null
Move-Item -LiteralPath $file -Destination ($file + '.' + (Get-Date -Format yyyyMMddHHmmss) + '.restored')
Write-Host 'Restored saved shell/filter settings. Restart Windows. Student account, app files, and data were preserved.'
