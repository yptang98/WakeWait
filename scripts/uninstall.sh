#!/usr/bin/env sh
set -eu

remove_skill() {
  target_root="$1"
  for skill in wakewait auto-sleep deferred-wait; do
    target="$target_root/$skill"
    if [ -f "$target/.wakewait-managed" ]; then
      rm -rf "$target"
      echo "[wakewait] removed $target"
    fi
  done
}

roots=""
if [ "${WAKEWAIT_CODEX_SKILLS:-}" ]; then
  roots="$WAKEWAIT_CODEX_SKILLS"
else
  codex_home="${CODEX_HOME:-$HOME/.codex}"
  roots="$codex_home/skills:$HOME/.codex/skills"
  [ -d /codex/skills ] && roots="$roots:/codex/skills"
  [ -d /workspace/codex/skills ] && roots="$roots:/workspace/codex/skills"
fi

old_ifs="$IFS"
IFS=':'
for root in $roots; do
  [ -n "$root" ] && remove_skill "$root"
done
IFS="$old_ifs"

wake_home="${WAKEWAIT_HOME:-$HOME/.wakewait}"
rm -f "$wake_home/bin/wakewait" "$wake_home/bin/pi-wait-patch" \
  "$wake_home/scripts/wakewait.mjs" "$wake_home/scripts/patch-pi-wait.mjs"
echo "[wakewait] uninstalled WakeWait skill and bundled shell scripts. Restart Codex to refresh loaded skills."
