$ErrorActionPreference = 'Stop'

function Assert-Signed([string]$path) {
    $signature = Get-AuthenticodeSignature $path
    Write-Output "$path : $($signature.Status)"
    if ($signature.Status -ne 'Valid') { throw "Invalid signature on $path" }
}

$setups = @(Get-ChildItem 'src-tauri/target/release/bundle/nsis/*-setup.exe')
$packages = @(Get-ChildItem 'src-tauri/target/release/bundle/msi/*.msi')
if ($setups.Count -ne 1 -or $packages.Count -ne 1) { throw 'Expected one NSIS installer and one MSI' }
Assert-Signed $setups[0].FullName
Assert-Signed $packages[0].FullName

$installDir = Join-Path $env:RUNNER_TEMP 'openaec-signing-check'
try {
    $installer = Start-Process $setups[0].FullName -ArgumentList @('/S', "/D=$installDir") -PassThru
    if (-not $installer.WaitForExit(600000)) {
        $installer.Kill()
        throw 'Silent installation timed out'
    }
    if ($installer.ExitCode -ne 0) { throw "Installer exited with $($installer.ExitCode)" }
    Assert-Signed (Join-Path $installDir 'openaec-installer.exe')
    Assert-Signed (Join-Path $installDir 'uninstall.exe')
} finally {
    $uninstaller = Join-Path $installDir 'uninstall.exe'
    if (Test-Path $uninstaller) { Start-Process $uninstaller -ArgumentList '/S' -Wait }
}

$extractDir = Join-Path $env:RUNNER_TEMP 'openaec-msi-signing-check'
try {
    $extract = Start-Process msiexec.exe -ArgumentList @('/a', "`"$($packages[0].FullName)`"", '/qn', "TARGETDIR=`"$extractDir`"") -PassThru -Wait
    if ($extract.ExitCode -ne 0) { throw "MSI extraction exited with $($extract.ExitCode)" }
    $executables = @(Get-ChildItem $extractDir -Recurse -Filter openaec-installer.exe)
    if ($executables.Count -ne 1) { throw 'Expected one application executable in the MSI' }
    Assert-Signed $executables[0].FullName
} finally {
    Remove-Item $extractDir -Recurse -Force -ErrorAction SilentlyContinue
}
