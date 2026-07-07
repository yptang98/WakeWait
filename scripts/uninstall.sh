#!/usr/bin/env sh
set -eu

find_node() {
  if command -v node >/dev/null 2>&1; then
    command -v node
    return
  fi
  for candidate in "$HOME"/.local/share/feynman/feynman-*/node/node; do
    if [ -x "$candidate" ]; then
      printf '%s\n' "$candidate"
      return
    fi
  done
  echo "Node.js was not found. Install Feynman first or install Node.js." >&2
  exit 1
}

script_path="$HOME/.wakewait/scripts/uninstall.mjs"
if [ ! -f "$script_path" ]; then
  echo "WakeWait uninstall script not found at $script_path" >&2
  exit 1
fi

node_bin=$(find_node)
"$node_bin" "$script_path" "$@"
