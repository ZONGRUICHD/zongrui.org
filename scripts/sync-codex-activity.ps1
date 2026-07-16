[CmdletBinding()]
param(
  [string]$Endpoint = 'https://api.zongrui.org/api/sync/codex',
  [string]$Token = $env:ZONGRUI_ACTIVITY_SYNC_TOKEN,
  [string]$CredentialPath = (Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'ZongruiActivitySync\token.clixml'),
  [string]$Python = 'python',
  [string]$CodexHome
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($Token)) {
  if (-not (Test-Path -LiteralPath $CredentialPath -PathType Leaf)) {
    throw 'No activity sync token is available.'
  }

  $secureToken = Import-Clixml -LiteralPath $CredentialPath
  $handle = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
  try {
    $Token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($handle)
  }
  finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($handle)
  }
}

$exporter = Join-Path $PSScriptRoot 'export-codex-activity.py'
$exportArguments = @($exporter)
if (-not [string]::IsNullOrWhiteSpace($CodexHome)) {
  $exportArguments += @('--codex-home', $CodexHome)
}

$payload = & $Python @exportArguments
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($payload)) {
  throw 'Codex activity export failed.'
}

$headers = @{ Authorization = "Bearer $Token" }
try {
  $response = Invoke-RestMethod `
    -Uri $Endpoint `
    -Method Post `
    -Headers $headers `
    -UserAgent 'zongrui-activity-sync/1.0' `
    -ContentType 'application/json; charset=utf-8' `
    -Body ([Text.Encoding]::UTF8.GetBytes($payload))
}
finally {
  $Token = $null
  $headers.Clear()
}

if ($response.ok -ne $true) {
  throw 'Activity API did not acknowledge the sync.'
}

Write-Output 'Codex activity sync completed.'
