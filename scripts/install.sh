#!/usr/bin/env sh
set -eu

version="${WAKEWAIT_VERSION:-v2.0.3}"

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
explicit_roots=0
if [ "${WAKEWAIT_CODEX_SKILLS:-}" ]; then
  roots="$WAKEWAIT_CODEX_SKILLS"
  explicit_roots=1
else
  parent_skills="$(cd "$repo_root/.." && pwd)/skills"
  if [ "${CODEX_HOME:-}" ]; then
    roots="$CODEX_HOME/skills"
  elif [ -d "$parent_skills" ]; then
    roots="$parent_skills"
  elif [ -d /codex/skills ]; then
    roots="/codex/skills"
  elif [ -d /workspace/codex/skills ]; then
    roots="/workspace/codex/skills"
  else
    roots="$HOME/.codex/skills"
  fi
fi

is_installed_root() {
  check="$(mkdir -p "$1" && cd "$1" && pwd)"
  old_ifs_inner="$IFS"
  IFS=':'
  for installed in $roots; do
    [ -n "$installed" ] || continue
    installed_abs="$(mkdir -p "$installed" && cd "$installed" && pwd)"
    if [ "$check" = "$installed_abs" ]; then
      IFS="$old_ifs_inner"
      return 0
    fi
  done
  IFS="$old_ifs_inner"
  return 1
}

cleanup_other_roots() {
  parent_skills="$(cd "$repo_root/.." && pwd)/skills"
  candidates="$HOME/.codex/skills:$parent_skills:/codex/skills:/workspace/codex/skills"
  [ "${CODEX_HOME:-}" ] && candidates="$candidates:$CODEX_HOME/skills"
  old_ifs_cleanup="$IFS"
  IFS=':'
  for root in $candidates; do
    [ -n "$root" ] || continue
    [ -d "$root" ] || continue
    [ -L "$root" ] && continue
    is_installed_root "$root" && continue
    for legacy in wakewait auto-sleep deferred-wait; do
      if [ -f "$root/$legacy/.wakewait-managed" ]; then
        rm -rf "$root/$legacy"
        echo "[wakewait] removed managed duplicate from $root/$legacy"
      fi
    done
  done
  IFS="$old_ifs_cleanup"
}

old_ifs="$IFS"
IFS=':'
for root in $roots; do
  [ -n "$root" ] && copy_skill "$root"
done
IFS="$old_ifs"
[ "$explicit_roots" -eq 1 ] || cleanup_other_roots

wake_home="${WAKEWAIT_HOME:-$HOME/.wakewait}"
mkdir -p "$wake_home/scripts"
for name in install.ps1 uninstall.ps1 install.sh uninstall.sh; do
  [ -f "$repo_root/scripts/$name" ] && cp "$repo_root/scripts/$name" "$wake_home/scripts/$name"
done
rm -f "$wake_home/bin/wakewait" "$wake_home/bin/pi-wait-patch" \
  "$wake_home/scripts/wakewait.mjs" "$wake_home/scripts/patch-pi-wait.mjs"
echo "[wakewait] installed WakeWait to one canonical skill root. Restart Codex to refresh loaded skills."
