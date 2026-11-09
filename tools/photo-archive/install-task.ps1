# Registers "con1 알폼핀 원본 보관" in Windows Task Scheduler for the signed-in user on this PC:
# every day at 19:00 (run as soon as possible if the PC was off then) and 2 minutes after signing in.
# The window stays hidden (conhost --headless). Run again to update; remove with:
#   Unregister-ScheduledTask -TaskName 'con1 알폼핀 원본 보관' -Confirm:$false
$ErrorActionPreference = 'Stop'
$name = 'con1 알폼핀 원본 보관'
$node = (Get-Command node).Source
$script = Join-Path $PSScriptRoot 'archive.mjs'
$action = New-ScheduledTaskAction -Execute "$env:WINDIR\System32\conhost.exe" -Argument "--headless `"$node`" `"$script`"" -WorkingDirectory $PSScriptRoot
$daily = New-ScheduledTaskTrigger -Daily -At '19:00'
$logon = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
$logon.Delay = 'PT2M'
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RunOnlyIfNetworkAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 2)
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $name -Action $action -Trigger @($daily, $logon) -Settings $settings -Principal $principal -Description '알폼핀 원본을 D:\이도형\알폼핀 체결 사진으로 옮기고 서버에는 2048px 사진만 남깁니다 (tools/photo-archive).' -Force | Out-Null
Get-ScheduledTask -TaskName $name | Select-Object TaskName, State
