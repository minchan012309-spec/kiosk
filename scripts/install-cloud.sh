#!/usr/bin/env bash
set -euo pipefail
cd /workspace/kiosk
export XDG_CACHE_HOME="$PWD/.data/cache"
export ELECTRON_GET_USE_PROXY=1
export GLOBAL_AGENT_HTTPS_PROXY="${HTTPS_PROXY:-}"
export GLOBAL_AGENT_HTTP_PROXY="${HTTP_PROXY:-}"
npm ci
npm run build
npm test
