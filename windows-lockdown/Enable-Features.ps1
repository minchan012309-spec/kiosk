# Run from elevated Windows PowerShell 5.1. Reboot before Configure-Station.ps1.
#Requires -RunAsAdministrator
$ErrorActionPreference = 'Stop'
foreach ($name in @('Client-EmbeddedShellLauncher', 'Client-KeyboardFilter')) {
    $feature = Get-WindowsOptionalFeature -Online -FeatureName $name
    if ($feature.State -ne 'Enabled') {
        Enable-WindowsOptionalFeature -Online -FeatureName $name -All -NoRestart
    }
}
Write-Host 'Restart Windows, then run Configure-Station.ps1. No account was changed.'
