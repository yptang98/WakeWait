param(
  [string]$Version = "v1",
  [string]$Root = "",
  [switch]$NoCodexSkills,
  [switch]$NoPatch
)

$ErrorActionPreference = "Stop"

function Find-Node {
  $node = Get-Command node -ErrorAction SilentlyContinue
  if ($node) { return $node.Source }
  throw "Node.js was not found. Install Node.js 20 or newer, then rerun the WakeWait installer."
}

$repoRoot = $null
if ($PSScriptRoot) {
  $repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..") -ErrorAction SilentlyContinue
}
$workDir = $null
if ($repoRoot -and (Test-Path (Join-Path $repoRoot ".codex-plugin\plugin.json"))) {
  $workDir = $repoRoot.Path
} else {
  $tmp = Join-Path ([IO.Path]::GetTempPath()) ("wakewait-install-" + [guid]::NewGuid().ToString("N"))
  New-Item -ItemType Directory -Path $tmp | Out-Null
  $zipPath = Join-Path $tmp "wakewait.zip"
  $url = "https://github.com/yptang98/WakeWait/archive/refs/tags/$Version.zip"
  Write-Host "==> Downloading WakeWait $Version"
  Invoke-WebRequest -Uri $url -OutFile $zipPath
  Expand-Archive -Path $zipPath -DestinationPath $tmp
  $workDir = (Get-ChildItem $tmp -Directory | Select-Object -First 1).FullName
}

$nodeExe = Find-Node
$args = @((Join-Path $workDir "scripts\install.mjs"))
if ($Root) { $args += @("--root", $Root) }
if ($NoCodexSkills) { $args += "--no-codex-skills" }
if ($NoPatch) { $args += "--no-patch" }
& $nodeExe @args
