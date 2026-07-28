#!/bin/bash
set -euo pipefail

# Preserve only the exact supported Pexels variable for its dedicated validation
# call. Every other child of this installer starts from a process environment in
# which all case variants have been removed.
unset captured_pexels_key
captured_pexels_key="${PEXELS_API_KEY:-}"
shopt -s nocasematch
for environment_name in $(compgen -e); do
  case "$environment_name" in
    PEXELS_API_KEY) unset "$environment_name" ;;
    HYPERFRAMES_NO_TELEMETRY) unset "$environment_name" ;;
  esac
done
shopt -u nocasematch
export HYPERFRAMES_NO_TELEMETRY=1

ROOT_DIR="$(cd -- "$(dirname -- "$0")" && pwd -P)"
APP_DIR="${HOME}/Library/Application Support/erduo-hyperframes-broll"
NODE_BIN="${ERDUO_NODE_BIN:-}"
NODE_VERSION='22.23.1'

finish() {
  incoming_status=$?
  status="${1:-$incoming_status}"
  if [ -t 0 ]; then
    printf '\n'
    if [ "$status" -eq 0 ]; then
      printf '安装流程已结束。请重启 Codex 或 Claude Code。\n'
    else
      printf '安装未完成；上方 action-required 是需要处理的唯一事项。\n'
    fi
    printf '按回车关闭窗口。'
    IFS= read -r _ || true
  fi
  exit "$status"
}
trap finish EXIT

node_major() {
  "$1" -p 'Number(process.versions.node.split(".")[0])' 2>/dev/null || printf '0'
}

ensure_plain_directory() {
  directory="$1"
  if [ -L "$directory" ] || { [ -e "$directory" ] && [ ! -d "$directory" ]; }; then
    printf 'action-required: 安装目录链包含符号链接或非目录。\n' >&2
    return 2
  fi
  if [ ! -d "$directory" ]; then
    mkdir -- "$directory"
  fi
}

safe_cleanup() {
  candidate="${1:-}"
  case "$candidate" in
    "${TMPDIR:-/tmp}"/erduo-node.*|/tmp/erduo-node.*|/private/tmp/erduo-node.*)
      rm -rf -- "$candidate"
      ;;
  esac
}

finish_after_node_cleanup() {
  original_status=$?
  cleanup_status=0
  safe_cleanup "${temp_root:-}" || cleanup_status=$?
  if [ "$original_status" -eq 0 ] && [ "$cleanup_status" -ne 0 ]; then
    original_status="$cleanup_status"
  fi
  finish "$original_status"
}

install_user_node() {
  command -v curl >/dev/null 2>&1 || {
    printf 'action-required: 缺少 curl，无法下载官方 Node.js。\n' >&2
    return 2
  }
  command -v shasum >/dev/null 2>&1 || {
    printf 'action-required: 缺少 shasum，无法验证 Node.js 下载。\n' >&2
    return 2
  }

  machine="$(uname -m)"
  case "$machine" in
    arm64)
      node_arch='arm64'
      expected_sha256='ef28d8fab2c0e4314522d4bb1b7173270aa3937e93b92cb7de79c112ac1fa953'
      ;;
    x86_64)
      node_arch='x64'
      expected_sha256='b8da981b8a0b1241b70249204916da76c63573ddf5814dbd2d1e41069105cb81'
      ;;
    *)
      printf 'action-required: 当前 macOS 架构尚不支持自动 Node.js 引导。\n' >&2
      return 2
      ;;
  esac

  ensure_plain_directory "$HOME"
  ensure_plain_directory "$HOME/Library"
  ensure_plain_directory "$HOME/Library/Application Support"
  ensure_plain_directory "$APP_DIR"
  ensure_plain_directory "$APP_DIR/node"
  ensure_plain_directory "$APP_DIR/node/installs"
  chmod 700 "$APP_DIR" "$APP_DIR/node" "$APP_DIR/node/installs"
  temp_root="$(mktemp -d "${TMPDIR:-/tmp}/erduo-node.XXXXXX")"
  trap finish_after_node_cleanup EXIT
  archive_name="node-v${NODE_VERSION}-darwin-${node_arch}.tar.gz"
  base_url="https://nodejs.org/download/release/v${NODE_VERSION}"
  archive="$temp_root/$archive_name"
  curl --fail --location --silent --show-error \
    --proto '=https' --proto-redir '=https' \
    "$base_url/$archive_name" --output "$archive"
  (
    cd "$temp_root"
    printf '%s  %s\n' "$expected_sha256" "$archive_name" | shasum -a 256 -c -
  )
  tar -xzf "$archive" -C "$temp_root"
  extracted="$temp_root/${archive_name%.tar.gz}"
  [ -x "$extracted/bin/node" ] || {
    printf 'action-required: Node.js 官方包结构不完整。\n' >&2
    return 2
  }
  version="$("$extracted/bin/node" -p 'process.versions.node')"
  [ "$version" = "$NODE_VERSION" ] || {
    printf 'action-required: Node.js 包内版本与固定版本不一致。\n' >&2
    return 2
  }
  install_root="$(mktemp -d "$APP_DIR/node/installs/v${version}-${node_arch}-${expected_sha256}.XXXXXX")"
  chmod 700 "$install_root"
  mv -- "$extracted" "$install_root/runtime"
  printf 'node=%s\narch=%s\nsha256=%s\nstatus=verified-for-this-install-run\n' \
    "$version" "$node_arch" "$expected_sha256" > "$install_root/VERIFIED-SOURCE.txt"
  chmod 600 "$install_root/VERIFIED-SOURCE.txt"
  NODE_BIN="$install_root/runtime/bin/node"
  safe_cleanup "$temp_root"
  temp_root=''
  trap finish EXIT
}

if [ -z "$NODE_BIN" ] && command -v node >/dev/null 2>&1; then
  NODE_BIN="$(command -v node)"
fi

if [ -z "$NODE_BIN" ] || [ ! -x "$NODE_BIN" ] || [ "$(node_major "$NODE_BIN")" -lt 22 ]; then
  printf '正在准备用户级 Node.js 22（不会修改系统 Node 或 shell profile）…\n'
  install_user_node
fi

"$NODE_BIN" "$ROOT_DIR/scripts/install.mjs" --interactive

set +e
if [ -n "$captured_pexels_key" ]; then
  pexels_environment_name='PEXELS_API_KEY'
  export "$pexels_environment_name=$captured_pexels_key"
  "$NODE_BIN" "$ROOT_DIR/scripts/config.mjs" status --json >/dev/null 2>&1
  pexels_status=$?
  unset "$pexels_environment_name"
else
  "$NODE_BIN" "$ROOT_DIR/scripts/config.mjs" status --json >/dev/null 2>&1
  pexels_status=$?
fi
set -e
if [ "$pexels_status" -ne 0 ] && [ -t 0 ]; then
  printf '\nPexels 是固定素材阶段。现在可一次性配置 Key，直接回车可暂时跳过。\n'
  IFS= read -r -s -p 'Pexels API Key: ' PEXELS_KEY
  printf '\n'
  if [ -n "$PEXELS_KEY" ]; then
    printf '%s' "$PEXELS_KEY" | \
      "$NODE_BIN" "$ROOT_DIR/scripts/config.mjs" set-pexels-key --stdin
  else
    printf 'action-required: 首次正式生产前仍需配置 Pexels Key。\n'
  fi
  unset PEXELS_KEY
fi
unset captured_pexels_key
