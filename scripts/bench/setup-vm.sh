#!/bin/bash
# Provision a local QEMU aarch64 + HVF Ubuntu 24.04 VM for the wasm-opt benchmark.
# RUNS ON THE macOS HOST (Apple Silicon). See scripts/bench/README.md.
#
# Subcommands:
#   prepare   download cloud image, build NoCloud seed ISO, copy UEFI vars
#   run       boot the VM (foreground, serial console; ssh on :2222)
#   ssh       ssh into the running VM
#   (none)    = prepare (if needed) then run
#
# Env overrides: VM_CORES (default 10), VM_MEM (default 20G), SSH_PORT (2222),
# VM_DISK (default +30G grow; use VM_DISK=80G for full Docker builds via
# scripts/bench/vm-build.sh — emsdk image + deps + build tree need ~50 GB).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VMDIR="${SCRIPT_DIR}/vm"
CLOUD_INIT="${SCRIPT_DIR}/cloud-init"

VM_CORES="${VM_CORES:-10}"          # Mac has 10 cores; this caps the local sweep
VM_MEM="${VM_MEM:-20G}"             # asyncify peaks ~10-15 GB; leave headroom for macOS
VM_DISK="${VM_DISK:-30G}"           # disk grow beyond the ~3.5 GB cloud image
SSH_PORT="${SSH_PORT:-2222}"
IMG_URL="https://cloud-images.ubuntu.com/releases/24.04/release/ubuntu-24.04-server-cloudimg-arm64.img"

QEMU_SHARE="$(brew --prefix qemu)/share/qemu"
FW_CODE="${QEMU_SHARE}/edk2-aarch64-code.fd"
FW_VARS_SRC="${QEMU_SHARE}/edk2-arm-vars.fd"

BASE_IMG="${VMDIR}/ubuntu-24.04-arm64.img"
DISK="${VMDIR}/disk.qcow2"
SEED="${VMDIR}/seed.iso"
FW_VARS="${VMDIR}/edk2-vars.fd"
PUBKEY="${HOME}/.ssh/id_ed25519.pub"

prepare() {
    mkdir -p "${VMDIR}"
    command -v qemu-system-aarch64 >/dev/null || { echo "Install qemu: brew install qemu" >&2; exit 1; }
    [[ -f "${PUBKEY}" ]] || { echo "No SSH pubkey at ${PUBKEY}" >&2; exit 1; }

    if [[ ! -f "${BASE_IMG}" ]]; then
        echo "Downloading Ubuntu 24.04 arm64 cloud image..."
        curl -fL -o "${BASE_IMG}" "${IMG_URL}"
    fi

    # Fresh working disk each prepare: copy the cloud image and grow it (the
    # cloud image is ~3.5 GB; binaryen + fixture + scratch need more headroom).
    echo "Creating working disk (${DISK}, +${VM_DISK})..."
    cp "${BASE_IMG}" "${DISK}"
    qemu-img resize "${DISK}" "+${VM_DISK}"

    # Writable UEFI vars store (copy of the template).
    cp "${FW_VARS_SRC}" "${FW_VARS}"

    # Build the NoCloud seed ISO (label must be CIDATA), injecting the pubkey.
    echo "Building cloud-init seed ISO..."
    local tmp; tmp="$(mktemp -d)"
    sed "s|__SSH_PUBKEY__|$(cat "${PUBKEY}")|" "${CLOUD_INIT}/user-data" > "${tmp}/user-data"
    cp "${CLOUD_INIT}/meta-data" "${tmp}/meta-data"
    rm -f "${SEED}"
    hdiutil makehybrid -iso -joliet -default-volume-name CIDATA -o "${SEED}" "${tmp}" >/dev/null
    rm -rf "${tmp}"
    echo "Prepared. Boot with: $0 run"
}

run() {
    [[ -f "${DISK}" && -f "${SEED}" && -f "${FW_VARS}" ]] || { echo "Run '$0 prepare' first." >&2; exit 1; }
    echo "Booting VM: ${VM_CORES} vCPU, ${VM_MEM} RAM, ssh -> localhost:${SSH_PORT} (user: bench)"
    echo "First boot runs cloud-init (installs packages); wait ~1-2 min before ssh."
    echo "Quit the serial console with: Ctrl-a x"
    exec qemu-system-aarch64 \
        -machine virt -accel hvf -cpu host \
        -smp "${VM_CORES}" -m "${VM_MEM}" \
        -drive "if=pflash,format=raw,readonly=on,file=${FW_CODE}" \
        -drive "if=pflash,format=raw,file=${FW_VARS}" \
        -drive "if=virtio,format=qcow2,file=${DISK}" \
        -drive "if=virtio,format=raw,file=${SEED}" \
        -netdev "user,id=n0,hostfwd=tcp::${SSH_PORT}-:22" \
        -device virtio-net,netdev=n0 \
        -nographic
}

do_ssh() { exec ssh -p "${SSH_PORT}" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null bench@localhost "$@"; }

case "${1:-}" in
    prepare) prepare ;;
    run)     run ;;
    ssh)     shift; do_ssh "$@" ;;
    "")      [[ -f "${DISK}" && -f "${SEED}" ]] || prepare; run ;;
    *)       echo "Usage: $0 {prepare|run|ssh}" >&2; exit 1 ;;
esac
