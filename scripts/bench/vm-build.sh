#!/bin/bash
# Run a real docker/build.sh build INSIDE the local QEMU Linux VM, as a cheap
# stand-in for the Hetzner CI runner (Linux + Docker + the same scripts), so CI
# orchestration changes can be verified without burning a Hetzner slot.
# RUNS ON THE macOS HOST. The guest is aarch64 under HVF — near-native speed,
# a correct *functional* proxy for CI but NOT an x86 performance proxy.
#
# Usage:
#   ./scripts/bench/vm-build.sh [build.sh args...]
#     default args: calculator --build-deps
#
# Examples:
#   ./scripts/bench/vm-build.sh                                  # cold calculator build
#   KICAD_PIPELINE=1 ./scripts/bench/vm-build.sh calculator,pl_editor   # pipeline smoke test
#
# Prereqs (one-time):
#   VM_DISK=80G ./scripts/bench/setup-vm.sh prepare   # 80G: emsdk image + deps + build tree
#   ./scripts/bench/setup-vm.sh run                   # boot in another terminal, wait for cloud-init
#
# Env: SSH_PORT (2222), KICAD_PIPELINE/KICAD_PIPELINE_JOBS (forwarded to the guest),
#      VM_BUILD_JOBS (compile -j inside the guest; default = guest nproc).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

SSH_PORT="${SSH_PORT:-2222}"
GUEST="bench@localhost"
GUEST_DIR="kicad-wasm"
SSH_OPTS=(-p "${SSH_PORT}" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null)

vssh() { ssh "${SSH_OPTS[@]}" "${GUEST}" "$@"; }

if ! vssh true 2>/dev/null; then
    echo "ERROR: VM not reachable on localhost:${SSH_PORT}." >&2
    echo "Boot it first: ./scripts/bench/setup-vm.sh run  (wait ~2 min for cloud-init)" >&2
    exit 1
fi

# Wait until cloud-init finished installing Docker (first boot takes a few min).
echo "Waiting for cloud-init to finish (installs Docker on first boot)..."
vssh "cloud-init status --wait >/dev/null 2>&1 || true"
vssh "docker info >/dev/null 2>&1" || {
    echo "ERROR: Docker not usable in the guest. Re-run setup-vm.sh prepare with the" >&2
    echo "updated cloud-init (installs docker-ce) and boot a fresh VM." >&2
    exit 1
}

# Sync the working tree (incl. submodule content, no .git) into the guest.
# Same exclude set as build.sh's container-sync, plus the VM images themselves.
echo "Syncing repo to ${GUEST}:~/${GUEST_DIR} ..."
rsync -az --delete \
    -e "ssh ${SSH_OPTS[*]}" \
    --exclude="build-wasm" \
    --exclude="output" \
    --exclude=".git" \
    --exclude="logs" \
    --exclude=".idea" \
    --exclude="node_modules" \
    --exclude="tools/emsdk" \
    --exclude="scripts/bench/vm" \
    --exclude="tests/test-results" \
    --exclude="tests/playwright-report" \
    "${PROJECT_ROOT}/" "${GUEST}:${GUEST_DIR}/"

BUILD_ARGS=("$@")
[ ${#BUILD_ARGS[@]} -eq 0 ] && BUILD_ARGS=(calculator --build-deps)
# Append a guest-sized -j unless the caller already passed one.
JOBS_FLAG='-j "${JOBS}"'
[[ " ${BUILD_ARGS[*]} " == *" -j "* ]] && JOBS_FLAG=""

# Guest-side env:
# - COMPOSE_PROJECT_NAME: no .git in the guest tree, so build.sh can't derive a
#   branch name — pin the project name explicitly.
# - KICAD_DOCKER_CPUS/MEM: the compose dev-Mac caps (10 CPU / 32G) point at a
#   guest that may have fewer cores and definitely has less RAM; size to guest.
# - KICAD_NO_MONITOR/KICAD_LOG_NESTED: no TTY dashboard over ssh, stream output.
REMOTE_CMD=$(cat <<EOF
set -e
cd ${GUEST_DIR}
GUEST_CORES=\$(nproc)
GUEST_MEM_G=\$(awk '/MemTotal/{printf "%d", \$2/1024/1024 - 3}' /proc/meminfo)
export COMPOSE_PROJECT_NAME=kicad-wasm-vm
export KICAD_DOCKER_CPUS=\${GUEST_CORES}
export KICAD_DOCKER_MEM=\${GUEST_MEM_G}G
export KICAD_NO_MONITOR=1 KICAD_LOG_NESTED=1
export KICAD_PIPELINE=${KICAD_PIPELINE:-0} KICAD_PIPELINE_JOBS=${KICAD_PIPELINE_JOBS:-2}
JOBS=${VM_BUILD_JOBS:-\$GUEST_CORES}
echo "=== VM build: \$(uname -m), \${GUEST_CORES} cores, docker mem \${KICAD_DOCKER_MEM}, -j \${JOBS}, args: ${BUILD_ARGS[*]} ==="
time ./docker/build.sh ${BUILD_ARGS[*]} ${JOBS_FLAG}
ls -lh output/
EOF
)

START=$(date +%s)
vssh "${REMOTE_CMD}"
END=$(date +%s)
echo ""
echo "=== VM build wall time: $(( (END - START) / 60 ))m $(( (END - START) % 60 ))s (args: ${BUILD_ARGS[*]}) ==="
