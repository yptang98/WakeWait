param(
  [switch]$KeepState
)

$ErrorActionPreference = "Stop"

function Find-Node {
  $node = Get-Command node -ErrorAction SilentlyContinue
  if ($node) { return $node.Source }
  $bundles = Get-ChildItem "$env:LOCALAPPDATA\Programs\feynman" -Directory -Filter "feynman-*" -ErrorAction SilentlyContinue | Sort-Object Name -Descending
  foreach ($bundle in $bundles) {
    $candidate = Join-Path $bundle.FullName "node\node.exe"
    if (Test-Path $candidate) { return $candidate }
  }
  throw "Node.js was not found. Install Feynman first or install Node.js."
}

$scriptPath = Join-Path $HOME ".wakewait\scripts\uninstall.mjs"
if (-not (Test-Path $scriptPath)) {
  throw "WakeWait uninstall script not found at $scriptPath"
}
$args = @($scriptPath)
if ($KeepState) { $args += "--keep-state" }
& (Find-Node) @args
