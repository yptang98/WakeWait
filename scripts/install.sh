#!/usr/bin/env sh
set -eu

version="${WAKEWAIT_VERSION:-v1.0.9}"

find_node() {
  if command -v node >/dev/null 2>&1; then
    command -v node
    return
  fi
  echo "Node.js was not found. Install Node.js 20 or newer, then rerun the WakeWait installer." >&2
  exit 1
}

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

node_bin=$(find_node)
"$node_bin" "$repo_root/scripts/install.mjs" "$@"

wakewait_home="${WAKEWAIT_HOME:-$HOME/.wakewait}"
bin_dir="$wakewait_home/bin"
echo "==> WakeWait CLI launcher: $bin_dir/wakewait"
echo "==> Verify with: \"$bin_dir/wakewait\" status"
