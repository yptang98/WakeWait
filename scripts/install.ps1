param(
  [string]$Version = "v0",
  [string]$Root = "",
  [switch]$NoCodexSkills,
  [switch]$NoFeynmanSkills
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

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..") -ErrorAction SilentlyContinue
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
if ($NoFeynmanSkills) { $args += "--no-feynman-skills" }
& $nodeExe @args
