# Operator-only secret upload. Values never enter command arguments or source files.
param(
  [Parameter(Mandatory=$true)]
  [ValidateSet('STAFF_PIN_HASH','ADMIN_PIN_HASH','TOKEN_SECRET','SQUARE_ACCESS_TOKEN','SQUARE_LOCATION_ID','SQUARE_WEBHOOK_SIGNATURE_KEY','RESEND_API_KEY','EMAIL_FROM','NOTIFY_EMAIL','GITHUB_TOKEN','GOOGLE_PLACES_API_KEY')]
  [string]$Name
)
$ErrorActionPreference = 'Stop'
$apiRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\api'))
$configPath = Join-Path $apiRoot 'wrangler.local.json'
if (-not (Test-Path -LiteralPath $configPath)) { throw 'Run node tools/setup-api.mjs first.' }
if (-not (Get-Command wrangler -ErrorAction SilentlyContinue)) { throw 'Install Wrangler and run wrangler login first. See API-CONNECT.md.' }
$secretValue = $null
try {
  if ($Name -eq 'TOKEN_SECRET') {
    $randomBytes = New-Object byte[] 48
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($randomBytes) } finally { $rng.Dispose() }
    $secretValue = [Convert]::ToBase64String($randomBytes)
  } else {
    $secured = Read-Host "Enter $Name (hidden; passcodes will be hashed)" -AsSecureString
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secured)
    try { $secretValue = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer); $secured.Dispose() }
    if ([string]::IsNullOrWhiteSpace($secretValue)) { throw 'Empty secrets are not allowed.' }
    if ($Name -match '_PIN_HASH$') {
      if ($secretValue.Length -lt 12) { throw 'Use a unique passphrase of at least 12 characters.' }
      $confirm = Read-Host 'Repeat the passphrase' -AsSecureString
      $confirmPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($confirm)
      try { if ($secretValue -cne [Runtime.InteropServices.Marshal]::PtrToStringBSTR($confirmPointer)) { throw 'Passphrases did not match. Nothing uploaded.' } }
      finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($confirmPointer); $confirm.Dispose() }
      $hasher = [Security.Cryptography.SHA256]::Create()
      try { $secretValue = ([BitConverter]::ToString($hasher.ComputeHash([Text.Encoding]::UTF8.GetBytes($secretValue)))).Replace('-','').ToLowerInvariant() }
      finally { $hasher.Dispose() }
    }
  }
  Write-Host "Uploading $Name to the Worker named in api/wrangler.local.json."
  $secretValue | & wrangler secret put $Name --config $configPath
  if ($LASTEXITCODE -ne 0) { throw 'Secret upload failed. Check Wrangler authentication; the value was not saved locally.' }
} finally { $secretValue = $null; $randomBytes = $null }
