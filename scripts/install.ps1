param(
  [string]$Version = "v2.0.3",
  [string]$CodexHome = "",
  [string[]]$SkillsRoot = @()
)

$ErrorActionPreference = "Stop"

function Resolve-SkillRoots {
  param([string]$RepoRoot)

  $roots = @()
  foreach ($root in $SkillsRoot) {
    if ($root) { $roots += [IO.Path]::GetFullPath($root) }
  }
  if ($roots.Count -eq 0 -and $env:WAKEWAIT_CODEX_SKILLS) {
    $roots += ($env:WAKEWAIT_CODEX_SKILLS -split ';' | Where-Object { $_ } | ForEach-Object { [IO.Path]::GetFullPath($_) })
  }
  if ($roots.Count -eq 0) {
    if ($CodexHome -or $env:CODEX_HOME) {
      $homeRoot = if ($CodexHome) { $CodexHome } else { $env:CODEX_HOME }
      $roots += [IO.Path]::GetFullPath((Join-Path $homeRoot "skills"))
    }
    $sibling = Join-Path (Split-Path $RepoRoot -Parent) "skills"
    if ($roots.Count -eq 0 -and (Test-Path $sibling)) {
      $roots += [IO.Path]::GetFullPath($sibling)
    }
    if ($roots.Count -eq 0) {
      foreach ($drive in [char[]]([char]'C'..[char]'Z')) {
        $candidate = "$drive`:\codex\skills"
        if (Test-Path $candidate) {
          $roots += [IO.Path]::GetFullPath($candidate)
          break
        }
      }
    }
    if ($roots.Count -eq 0) {
      $roots += [IO.Path]::GetFullPath((Join-Path $HOME ".codex\skills"))
    }
  }

  $sourceSkills = [IO.Path]::GetFullPath((Join-Path $RepoRoot "skills")).TrimEnd('\')
  $roots |
    Where-Object { $_ } |
    ForEach-Object { [IO.Path]::GetFullPath($_).TrimEnd('\') } |
    Where-Object { $_ -ine $sourceSkills } |
    Sort-Object -Unique
}

function Get-KnownSkillRoots {
  param([string]$RepoRoot)
  $roots = @()
  if ($CodexHome) { $roots += Join-Path $CodexHome "skills" }
  if ($env:CODEX_HOME) { $roots += Join-Path $env:CODEX_HOME "skills" }
  $roots += Join-Path $HOME ".codex\skills"
  $sibling = Join-Path (Split-Path $RepoRoot -Parent) "skills"
  if (Test-Path $sibling) { $roots += $sibling }
  foreach ($drive in [char[]]([char]'C'..[char]'Z')) {
    $candidate = "$drive`:\codex\skills"
    if (Test-Path $candidate) { $roots += $candidate }
  }
  $sourceSkills = [IO.Path]::GetFullPath((Join-Path $RepoRoot "skills")).TrimEnd('\')
  $roots |
    Where-Object { $_ } |
    ForEach-Object { [IO.Path]::GetFullPath($_).TrimEnd('\') } |
    Where-Object { $_ -ine $sourceSkills } |
    Sort-Object -Unique
}

function Copy-ManagedSkill {
  param([string]$RepoRoot, [string]$TargetRoot)

  $source = Join-Path $RepoRoot "skills\wakewait"
  $target = Join-Path $TargetRoot "wakewait"
  if ([IO.Path]::GetFullPath($source).TrimEnd('\') -ieq [IO.Path]::GetFullPath($target).TrimEnd('\')) {
    throw "Refusing to install WakeWait onto its source directory: $target"
  }
  New-Item -ItemType Directory -Force -Path $TargetRoot | Out-Null
  foreach ($legacy in @("wakewait", "auto-sleep", "deferred-wait")) {
    $legacyPath = Join-Path $TargetRoot $legacy
    if (Test-Path (Join-Path $legacyPath ".wakewait-managed")) {
      Remove-Item -LiteralPath $legacyPath -Recurse -Force
    }
  }
  if (Test-Path $target) {
    Remove-Item -LiteralPath $target -Recurse -Force
  }
  New-Item -ItemType Directory -Force -Path $target | Out-Null
  Get-ChildItem -LiteralPath $source -Force | Copy-Item -Destination $target -Recurse -Force
  Set-Content -Path (Join-Path $target ".wakewait-managed") -Value "managed by WakeWait" -Encoding UTF8
  if (-not (Test-Path (Join-Path $target "SKILL.md"))) {
    throw "WakeWait install failed: $target does not contain SKILL.md"
  }
  Write-Host "[wakewait] installed skill to $TargetRoot"
}

function Cleanup-OtherManagedSkills {
  param([string]$RepoRoot, [string[]]$InstalledRoots)
  $installed = @{}
  foreach ($root in $InstalledRoots) {
    $installed[[IO.Path]::GetFullPath($root).TrimEnd('\').ToLowerInvariant()] = $true
  }
  foreach ($root in Get-KnownSkillRoots $RepoRoot) {
    $key = [IO.Path]::GetFullPath($root).TrimEnd('\').ToLowerInvariant()
    if ($installed.ContainsKey($key)) { continue }
    $rootItem = Get-Item -LiteralPath $root -ErrorAction SilentlyContinue
    if ($rootItem -and $rootItem.Target) { continue }
    foreach ($legacy in @("wakewait", "auto-sleep", "deferred-wait")) {
      $path = Join-Path $root $legacy
      if (Test-Path (Join-Path $path ".wakewait-managed")) {
        Remove-Item -LiteralPath $path -Recurse -Force
        Write-Host "[wakewait] removed managed duplicate from $path"
      }
    }
  }
}

function Cleanup-OldCli {
  $wakeHome = if ($env:WAKEWAIT_HOME) { $env:WAKEWAIT_HOME } else { Join-Path $HOME ".wakewait" }
  foreach ($path in @(
    (Join-Path $wakeHome "bin\wakewait.cmd"),
    (Join-Path $wakeHome "bin\pi-wait-patch.cmd"),
    (Join-Path $wakeHome "bin\wakewait"),
    (Join-Path $wakeHome "bin\pi-wait-patch"),
    (Join-Path $wakeHome "scripts\wakewait.mjs"),
    (Join-Path $wakeHome "scripts\patch-pi-wait.mjs")
  )) {
    if (Test-Path $path) { Remove-Item -LiteralPath $path -Force }
  }
}

function Install-UninstallScripts {
  param([string]$RepoRoot)
  $wakeHome = if ($env:WAKEWAIT_HOME) { $env:WAKEWAIT_HOME } else { Join-Path $HOME ".wakewait" }
  $target = Join-Path $wakeHome "scripts"
  New-Item -ItemType Directory -Force -Path $target | Out-Null
  foreach ($name in @("install.ps1", "uninstall.ps1", "install.sh", "uninstall.sh")) {
    $source = Join-Path $RepoRoot "scripts\$name"
    if (Test-Path $source) {
      Copy-Item -LiteralPath $source -Destination (Join-Path $target $name) -Force
    }
  }
}

$repoRoot = $null
if ($PSScriptRoot) {
  $candidate = Resolve-Path (Join-Path $PSScriptRoot "..") -ErrorAction SilentlyContinue
  if ($candidate -and (Test-Path (Join-Path $candidate.Path ".codex-plugin\plugin.json"))) {
    $repoRoot = $candidate.Path
  }
}
if (-not $repoRoot) {
  $tmp = Join-Path ([IO.Path]::GetTempPath()) ("wakewait-install-" + [guid]::NewGuid().ToString("N"))
  New-Item -ItemType Directory -Path $tmp | Out-Null
  $zipPath = Join-Path $tmp "wakewait.zip"
  $url = "https://github.com/yptang98/WakeWait/archive/refs/tags/$Version.zip"
  Write-Host "==> Downloading WakeWait $Version"
  Invoke-WebRequest -Uri $url -OutFile $zipPath
  Expand-Archive -Path $zipPath -DestinationPath $tmp
  $repoRoot = (Get-ChildItem $tmp -Directory | Select-Object -First 1).FullName
}

$explicitRoots = ($SkillsRoot.Count -gt 0 -or [bool]$env:WAKEWAIT_CODEX_SKILLS)
$targetRoots = @(Resolve-SkillRoots $repoRoot)
foreach ($root in $targetRoots) {
  Copy-ManagedSkill -RepoRoot $repoRoot -TargetRoot $root
}
if (-not $explicitRoots) {
  Cleanup-OtherManagedSkills -RepoRoot $repoRoot -InstalledRoots $targetRoots
}
foreach ($root in $targetRoots) {
  if (-not (Test-Path (Join-Path $root "wakewait\SKILL.md"))) {
    Copy-ManagedSkill -RepoRoot $repoRoot -TargetRoot $root
  }
}
Install-UninstallScripts $repoRoot
Cleanup-OldCli
Write-Host "[wakewait] installed WakeWait to one canonical skill root. Restart Codex to refresh loaded skills."
