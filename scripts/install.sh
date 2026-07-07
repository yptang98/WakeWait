#!/usr/bin/env sh
set -eu

version="${WAKEWAIT_VERSION:-v1.0.10}"

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repo_root=$(CDPATH= cd -- "$script_dir/.." && pwd)
if [ ! -f "$repo_root/.codex-plugin/plugin.json" ]; then
  tmp_dir=$(mktemp -d)
  archive="$tmp_dir/wakewait.tar.gz"
  url="https://github.com/yptang98/WakeWait/archive/refs/tags/$version.tar.gz"
  echo "==> Downloading WakeWait $version"
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$url" -o "$archive"
  else
    wget -q "$url" -O "$archive"
  fi
  tar -xzf "$archive" -C "$tmp_dir"
  repo_root=$(find "$tmp_dir" -maxdepth 1 -type d -name 'WakeWait-*' | head -n 1)
fi

copy_skill() {
  target_root="$1"
  source="$repo_root/skills/wakewait"
  target="$target_root/wakewait"
  [ "$(cd "$repo_root/skills" && pwd)" = "$(mkdir -p "$target_root" && cd "$target_root" && pwd)" ] && {
    echo "Refusing to install WakeWait onto its source directory: $target" >&2
    exit 1
  }
  mkdir -p "$target_root"
  for legacy in wakewait auto-sleep deferred-wait; do
    if [ -f "$target_root/$legacy/.wakewait-managed" ]; then
      rm -rf "$target_root/$legacy"
    fi
  done
  rm -rf "$target"
  cp -R "$source" "$target"
  printf 'managed by WakeWait\n' > "$target/.wakewait-managed"
  echo "[wakewait] installed skill to $target_root"
}

roots=""
if [ "${WAKEWAIT_CODEX_SKILLS:-}" ]; then
  roots="$WAKEWAIT_CODEX_SKILLS"
else
  codex_home="${CODEX_HOME:-$HOME/.codex}"
  roots="$codex_home/skills:$HOME/.codex/skills"
  parent_skills="$(cd "$repo_root/.." && pwd)/skills"
  [ -d "$parent_skills" ] && roots="$roots:$parent_skills"
  [ -d /codex/skills ] && roots="$roots:/codex/skills"
  [ -d /workspace/codex/skills ] && roots="$roots:/workspace/codex/skills"
fi

old_ifs="$IFS"
IFS=':'
for root in $roots; do
  [ -n "$root" ] && copy_skill "$root"
done
IFS="$old_ifs"

wake_home="${WAKEWAIT_HOME:-$HOME/.wakewait}"
rm -f "$wake_home/bin/wakewait" "$wake_home/bin/pi-wait-patch" \
  "$wake_home/scripts/wakewait.mjs" "$wake_home/scripts/patch-pi-wait.mjs"
echo "[wakewait] installed skill-only WakeWait. Restart Codex to refresh loaded skills."
