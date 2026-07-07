param(
  [switch]$KeepState
)

$ErrorActionPreference = "Stop"

function Find-Node {
  $node = Get-Command node -ErrorAction SilentlyContinue
  if ($node) { return $node.Source }
  throw "Node.js was not found. Install Node.js 20 or newer, then rerun the WakeWait uninstaller."
}

$scriptPath = Join-Path $HOME ".wakewait\scripts\uninstall.mjs"
if (-not (Test-Path $scriptPath)) {
  throw "WakeWait uninstall script not found at $scriptPath"
}
$args = @($scriptPath)
if ($KeepState) { $args += "--keep-state" }
& (Find-Node) @args
