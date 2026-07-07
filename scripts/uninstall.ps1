param(
  [switch]$KeepState
)

$ErrorActionPreference = "Stop"

function Find-Node {
  $node = Get-Command node -ErrorAction SilentlyContinue
  if ($node) { return $node.Source }
  throw "Node.js was not found. Install Node.js 20 or newer, then rerun the WakeWait uninstaller."
}

$wakewaitHome = if ($env:WAKEWAIT_HOME) { $env:WAKEWAIT_HOME } else { Join-Path $HOME ".wakewait" }
$scriptPath = Join-Path $wakewaitHome "scripts\uninstall.mjs"
if (-not (Test-Path $scriptPath)) {
  throw "WakeWait uninstall script not found at $scriptPath"
}
$args = @($scriptPath)
if ($KeepState) { $args += "--keep-state" }
& (Find-Node) @args
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
