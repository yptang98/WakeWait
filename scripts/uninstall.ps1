param(
  [string]$CodexHome = "",
  [string[]]$SkillsRoot = @(),
  [switch]$KeepOldCliFiles
)

$ErrorActionPreference = "Stop"

function Resolve-SkillRoots {
  $roots = @()
  foreach ($root in $SkillsRoot) {
    if ($root) { $roots += [IO.Path]::GetFullPath($root) }
  }
  if ($roots.Count -eq 0 -and $env:WAKEWAIT_CODEX_SKILLS) {
    $roots += ($env:WAKEWAIT_CODEX_SKILLS -split ';' | Where-Object { $_ } | ForEach-Object { [IO.Path]::GetFullPath($_) })
  }
  if ($roots.Count -eq 0) {
    $homeRoot = if ($CodexHome) { $CodexHome } elseif ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $HOME ".codex" }
    $roots += [IO.Path]::GetFullPath((Join-Path $homeRoot "skills"))
    $roots += [IO.Path]::GetFullPath((Join-Path $HOME ".codex\skills"))
    foreach ($drive in [char[]]([char]'C'..[char]'Z')) {
      $candidate = "$drive`:\codex\skills"
      if (Test-Path $candidate) { $roots += [IO.Path]::GetFullPath($candidate) }
    }
  }
  $roots | Where-Object { $_ } | ForEach-Object { [IO.Path]::GetFullPath($_).TrimEnd('\') } | Sort-Object -Unique
}

foreach ($root in Resolve-SkillRoots) {
  foreach ($skill in @("wakewait", "auto-sleep", "deferred-wait")) {
    $target = Join-Path $root $skill
    if (Test-Path (Join-Path $target ".wakewait-managed")) {
      Remove-Item -LiteralPath $target -Recurse -Force
      Write-Host "[wakewait] removed $target"
    }
  }
}

if (-not $KeepOldCliFiles) {
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

Write-Host "[wakewait] uninstalled skill-only WakeWait. Restart Codex to refresh loaded skills."
