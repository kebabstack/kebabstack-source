# Trust managed deployment @@REVISION@@. Run in 64-bit PowerShell as SYSTEM/Administrator.
# Installer/migration contains an enrolment secret. Do not enable tracing/transcripts containing source.
# Updates are approved and redeployed through MDM; there is no scheduled self-updater.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$Action = '@@ACTION@@'
$TrustHost = '@@HOST@@'
$Version = '@@VERSION@@'
$Secret = '@@SECRET@@'
$Migrate = '@@MIGRATE@@' -eq '1'
$Root = Join-Path $env:ProgramFiles 'KebabStackTrust'
$Binary = Join-Path $Root 'bin\osqueryd.exe'
$Flags = Join-Path $Root 'osquery.flags'
$Command = '"' + $Binary + '" --flagfile="' + $Flags + '"'
$LegacyRoot = Join-Path $env:ProgramFiles 'osquery'
$LegacyTask = 'kebab-stack trust agent update'
$Stage = $null; $Mutex = $null; $Locked = $false
function Fail([string]$Message) { throw "Trust: $Message" }
function Say([string]$Message) { Write-Output "Trust: $Message" }
function Safe-Path([string]$Path) {
  if (Test-Path -LiteralPath $Path) {
    if ((Get-Item -LiteralPath $Path -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { Fail "Refusing redirected path: $Path" }
  }
}
function Owned {
  $p = Join-Path $Root 'owner'
  Safe-Path $p
  return (Test-Path -LiteralPath $p) -and ((Get-Content -LiteralPath $p -Raw).Trim() -ceq "kebabstack-trust-v2:$TrustHost")
}
function Service { return Get-CimInstance Win32_Service -Filter "Name='osqueryd'" }
function Legacy-Present { return [bool](Get-ScheduledTask -TaskName $LegacyTask -ErrorAction SilentlyContinue) }
function Secure-Directory([string]$Path) {
  Safe-Path $Path
  New-Item -ItemType Directory -Force -Path $Path | Out-Null
  $acl = New-Object System.Security.AccessControl.DirectorySecurity
  $acl.SetAccessRuleProtection($true, $false)
  $admin = New-Object System.Security.Principal.SecurityIdentifier('S-1-5-32-544')
  $system = New-Object System.Security.Principal.SecurityIdentifier('S-1-5-18')
  $acl.SetOwner($admin)
  foreach ($sid in @($admin, $system)) {
    $rule = New-Object System.Security.AccessControl.FileSystemAccessRule($sid, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
    $acl.AddAccessRule($rule)
  }
  Set-Acl -LiteralPath $Path -AclObject $acl
}
try {
  $principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { Fail 'Run as SYSTEM/Administrator.' }
  if (-not [Environment]::Is64BitProcess) { Fail 'Run in 64-bit PowerShell. 32-bit PowerShell is not supported.' }
  Safe-Path $Root; Safe-Path (Split-Path $Root)
  $svc = Service
  if ($Action -eq 'audit') {
    if (-not (Owned)) { Fail 'No Trust v2 installation for this server. Use preflight or migration.' }
    if (-not $svc -or $svc.PathName -cne $Command -or $svc.State -ne 'Running') { Fail 'Trust service is missing, stopped or has an unexpected command.' }
    if (Legacy-Present) { Fail 'Legacy updater remains. Complete migration.' }
    foreach ($p in @($Binary, $Flags, (Join-Path $Root 'enroll.secret'))) { Safe-Path $p; if (-not (Test-Path -LiteralPath $p -PathType Leaf)) { Fail 'Trust files are incomplete.' } }
    Say 'Local service is running. Verify fresh checks and the assigned person in Trust.'; exit 0
  }
  if ($Action -eq 'audit-removed') {
    if ((Test-Path -LiteralPath $Root) -or ($svc -and $svc.PathName.Contains($Root)) -or (Legacy-Present)) { Fail 'Trust components remain.' }
    Say 'Trust v2 files and service are absent. Record this result in Trust with the MDM job reference.'; exit 0
  }
  $Mutex = New-Object Threading.Mutex($false, 'Global\KebabStackTrustDeployment')
  $Locked = $Mutex.WaitOne(0)
  if (-not $Locked) { Fail 'Another Trust deployment is running. Retry after it finishes.' }
  if (Test-Path -LiteralPath $Root) {
    if (-not (Owned)) { Fail 'Directory belongs to another deployment. Nothing overwritten.' }
    Get-ChildItem -LiteralPath $Root -Recurse -Force | ForEach-Object { Safe-Path $_.FullName }
  }
  if ($Action -eq 'uninstall') {
    if (-not (Test-Path -LiteralPath $Root)) {
      if (($svc -and $svc.PathName.Contains($Root)) -or (Legacy-Present)) { Fail 'Unexpected or legacy service remains. Review migration instructions.' }
      Say 'Already absent.'; exit 0
    }
    if ($svc -and $svc.PathName -cne $Command) { Fail 'The osqueryd service belongs to another deployment. Nothing removed.' }
    if (Legacy-Present) { Fail 'Complete legacy migration before removal.' }
    if ($svc) {
      Stop-Service -Name osqueryd -ErrorAction Stop
      (Get-Service osqueryd).WaitForStatus('Stopped', [TimeSpan]::FromSeconds(30))
      & sc.exe delete osqueryd | Out-Null
      if ($LASTEXITCODE -ne 0) { Fail 'Could not delete Trust service.' }
    }
    Remove-Item -LiteralPath $Root -Recurse -Force
    Say 'Trust files removed. Run the removal audit before recording completion in Trust.'; exit 0
  }
  if ($Action -notin @('install', 'preflight')) { Fail 'Unknown action.' }
  $legacy = $false
  if ((Legacy-Present) -or ($svc -and $svc.PathName -cne $Command)) {
    if (-not $Migrate) { Fail 'Existing osquery service/updater detected. Use the migration download after reviewing its requirements.' }
    Safe-Path $LegacyRoot
    $legacyFlags = Join-Path $LegacyRoot 'osquery.flags'
    Safe-Path $legacyFlags
    if (-not (Test-Path -LiteralPath $legacyFlags) -or -not ((Get-Content -LiteralPath $legacyFlags) -ccontains "--tls_hostname=$TrustHost")) { Fail 'Legacy agent is not connected to this Trust server.' }
    $allowedLegacy = '"' + (Join-Path $LegacyRoot 'osqueryd\osqueryd.exe') + '" --flagfile="' + $legacyFlags + '"'
    if (-not $svc -or $svc.PathName -cne $allowedLegacy) { Fail 'Legacy service command is not an exact known Trust configuration. Have IT review it; no automatic takeover.' }
    $task = Get-ScheduledTask -TaskName $LegacyTask -ErrorAction Stop
    if ($task.Actions.Count -ne 1 -or -not $task.Actions[0].Arguments.Contains((Join-Path $LegacyRoot 'ks-trust-update.ps1'))) { Fail 'Unexpected legacy task. Nothing changed.' }
    $legacy = $true
  }
  if ($Action -eq 'preflight') { Say 'Prerequisites passed. Download, service start and enrolment still need a pilot installation.'; exit 0 }
  if (-not $Secret) { Fail 'No enrolment secret. Download a new installer.' }
  $arch = [Environment]::GetEnvironmentVariable('PROCESSOR_ARCHITECTURE','Machine')
  if ($arch -eq 'ARM64') { $Url = '@@WIN_ARM_URL@@'; $Sha = '@@WIN_ARM_SHA@@'; $ArchiveRoot = 'osquery-@@VERSION@@.windows_arm64' }
  elseif ($arch -eq 'AMD64') { $Url = '@@WIN_X64_URL@@'; $Sha = '@@WIN_X64_SHA@@'; $ArchiveRoot = 'osquery-@@VERSION@@.windows_x86_64' }
  else { Fail 'Only Windows x64 and ARM64 are supported.' }
  $Stage = Join-Path $env:ProgramFiles ('KebabStackTrust-deploy-' + [Guid]::NewGuid().ToString('N'))
  Secure-Directory $Stage
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  $zip = Join-Path $Stage 'agent.zip'
  Invoke-WebRequest -UseBasicParsing -Uri $Url -OutFile $zip -TimeoutSec 300
  if ((Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant() -cne $Sha) { Fail 'Package SHA-256 mismatch. Current installation unchanged.' }
  Expand-Archive -LiteralPath $zip -DestinationPath (Join-Path $Stage 'unpack')
  $vendor = Join-Path $Stage "unpack\$ArchiveRoot\Program Files\osquery"
  $newBinary = Join-Path $vendor 'osqueryd\osqueryd.exe'
  if ((Get-AuthenticodeSignature -LiteralPath $newBinary).Status -ne 'Valid') { Fail 'osquery executable signature is not valid.' }
  $reported = & $newBinary --version
  if ($LASTEXITCODE -ne 0 -or -not ($reported -match [regex]::Escape($Version))) { Fail 'Binary version check failed.' }
  $health = Invoke-WebRequest -UseBasicParsing -Uri "https://$TrustHost/agent/health" -TimeoutSec 30
  if ($health.Content.Trim() -cne 'trust-agent-v2') { Fail 'Trust backend does not support managed deployment yet.' }
  if ($svc) { Stop-Service osqueryd -ErrorAction Stop; (Get-Service osqueryd).WaitForStatus('Stopped',[TimeSpan]::FromSeconds(30)) }
  if ($legacy) {
    Unregister-ScheduledTask -TaskName $LegacyTask -Confirm:$false
    foreach ($n in @('osquery.flags','enroll.secret','ks-trust-update.ps1')) { $p=Join-Path $LegacyRoot $n; Safe-Path $p; if (Test-Path -LiteralPath $p) { Remove-Item -LiteralPath $p -Force } }
  }
  Secure-Directory $Root
  foreach ($d in @('bin','db','log')) { Secure-Directory (Join-Path $Root $d) }
  [IO.File]::WriteAllText((Join-Path $Root 'owner'), "kebabstack-trust-v2:$TrustHost")
  Copy-Item -LiteralPath $newBinary -Destination $Binary -Force
  Copy-Item -LiteralPath (Join-Path $vendor 'certs\certs.pem') -Destination (Join-Path $Root 'certs.pem') -Force
  [IO.File]::WriteAllText((Join-Path $Root 'enroll.secret'), $Secret)
  $body = @'
@@FLAGS@@
'@
  $body += "`n--enroll_secret_path=$Root\enroll.secret`n--database_path=$Root\db`n--logger_path=$Root\log`n--tls_server_certs=$Root\certs.pem`n"
  [IO.File]::WriteAllText($Flags, $body, [Text.Encoding]::ASCII)
  if ($svc) {
    & sc.exe config osqueryd binPath= $Command start= auto | Out-Null
    if ($LASTEXITCODE -ne 0) { Fail 'Could not configure Trust service.' }
  } else { New-Service -Name osqueryd -DisplayName 'KebabStack Trust' -BinaryPathName $Command -StartupType Automatic | Out-Null }
  Start-Service osqueryd
  (Get-Service osqueryd).WaitForStatus('Running',[TimeSpan]::FromSeconds(30))
  Say "osquery $Version service started. Confirm enrolment, fresh checks and ownership in Trust before wider rollout."
} catch {
  Write-Error -ErrorAction Continue $_.Exception.Message
  exit 1
} finally {
  if ($Stage -and (Test-Path -LiteralPath $Stage)) { Remove-Item -LiteralPath $Stage -Recurse -Force }
  if ($Locked) { $Mutex.ReleaseMutex() }
  if ($Mutex) { $Mutex.Dispose() }
}
