$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$baseApk = Join-Path $PSScriptRoot '..\publish\LX-N-X-Music-v1.2.0-foldable-layout-fix-arm64-v8a.apk'
$bundle = Join-Path $PSScriptRoot '..\android\app\build\generated\assets\react\release\index.android.bundle'
$unsigned = Join-Path $PSScriptRoot '..\publish\.pad-controls-centered-unsigned.apk'
$aligned = Join-Path $PSScriptRoot '..\publish\.pad-controls-centered-aligned.apk'
$output = Join-Path $PSScriptRoot '..\publish\LX-N-X-Music-v1.2.0-pad-controls-centered-arm64-v8a.apk'
$tools = 'C:\AndroidDev\android-sdk\build-tools\36.0.0'
$signingProperties = Join-Path $PSScriptRoot '..\android\keystore.properties'

if (!(Test-Path -LiteralPath $baseApk) -or !(Test-Path -LiteralPath $bundle)) {
  throw 'Required base APK or React Native bundle is missing.'
}
Copy-Item -LiteralPath $baseApk -Destination $unsigned -Force
$archive = [System.IO.Compression.ZipFile]::Open($unsigned, [System.IO.Compression.ZipArchiveMode]::Update)
try {
  @($archive.Entries | Where-Object {
    $_.FullName -eq 'assets/index.android.bundle' -or
    ($_.FullName.StartsWith('META-INF/') -and $_.FullName -match '(?i)(\.RSA|\.DSA|\.EC|\.SF|MANIFEST\.MF)$')
  }) | ForEach-Object { $_.Delete() }
  $entry = $archive.CreateEntry('assets/index.android.bundle', [System.IO.Compression.CompressionLevel]::Optimal)
  $destination = $entry.Open()
  $source = [System.IO.File]::OpenRead($bundle)
  try { $source.CopyTo($destination) }
  finally { $source.Dispose(); $destination.Dispose() }
}
finally { $archive.Dispose() }

& (Join-Path $tools 'zipalign.exe') -f -p 4 $unsigned $aligned
if ($LASTEXITCODE -ne 0) { throw 'zipalign failed.' }
$properties = Get-Content -LiteralPath $signingProperties -Raw | ConvertFrom-StringData
$keystore = $properties['MYAPP_UPLOAD_STORE_FILE']
if (![System.IO.Path]::IsPathRooted($keystore)) {
  $keystore = Join-Path (Join-Path $PSScriptRoot '..\android\app') $keystore
}
$env:CODEX_UPLOAD_STORE_PASSWORD = $properties['MYAPP_UPLOAD_STORE_PASSWORD']
$env:CODEX_UPLOAD_KEY_PASSWORD = $properties['MYAPP_UPLOAD_KEY_PASSWORD']
try {
  & (Join-Path $tools 'apksigner.bat') sign --ks $keystore --ks-key-alias $properties['MYAPP_UPLOAD_KEY_ALIAS'] --ks-pass env:CODEX_UPLOAD_STORE_PASSWORD --key-pass env:CODEX_UPLOAD_KEY_PASSWORD --out $output $aligned
}
finally {
  Remove-Item Env:\CODEX_UPLOAD_STORE_PASSWORD, Env:\CODEX_UPLOAD_KEY_PASSWORD -ErrorAction SilentlyContinue
}
if ($LASTEXITCODE -ne 0) { throw 'APK signing failed.' }
& (Join-Path $tools 'zipalign.exe') -c -p 4 $output
if ($LASTEXITCODE -ne 0) { throw 'APK alignment verification failed.' }
& (Join-Path $tools 'apksigner.bat') verify --verbose $output
if ($LASTEXITCODE -ne 0) { throw 'APK signature verification failed.' }

$apk = [System.IO.Compression.ZipFile]::OpenRead($output)
try {
  $names = @($apk.Entries | ForEach-Object FullName)
  if ($names -notcontains 'lib/arm64-v8a/libquickbase64.so') { throw 'The arm64 native library is missing.' }
  $bundleEntry = $apk.GetEntry('assets/index.android.bundle')
  if (!$bundleEntry -or $bundleEntry.Length -ne (Get-Item -LiteralPath $bundle).Length) { throw 'The packaged JS bundle size does not match.' }
  Write-Output "arm64 native library present; JS bundle $($bundleEntry.Length) bytes."
}
finally { $apk.Dispose() }

Remove-Item -LiteralPath $unsigned, $aligned -Force
