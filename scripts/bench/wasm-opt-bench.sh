#!/bin/bash
# wasm-opt allocator/core benchmark — RUNS INSIDE THE LINUX VM.
#
# Times the host-side wasm-opt/asyncify pass (scripts/common/apply-asyncify.sh)
# over a prebuilt eeschema .wasm across a matrix of {glibc, jemalloc} x core
# counts, to find why the step is slow on glibc CI and what BINARYEN_CORES helps.
#
# Why this isolates the right thing: wasm-opt/asyncify is a standalone pass over
# an already-compiled .wasm (see docker/build.sh:194). We never compile KiCad
# here — we just replay the optimizer over a fixture built once on the host.
#
# Usage (in the VM, from the repo root):
#   ./scripts/bench/wasm-opt-bench.sh [fixture.wasm]
# Env:
#   CORES="1 4 8 10"   core counts to sweep (BINARYEN_CORES)
#   ALLOCS="glibc jemalloc"
#   STRACE=1           also run a syscall-count pass per allocator at max cores
#
# Output: a CSV table on stdout (also tee'd to bench/results.csv) plus per-cell
# logs under bench/results/ (each holds apply-asyncify's own per-pass `time -v`).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "${SCRIPT_DIR}/../.." && pwd)"

FIXTURE="${1:-${REPO}/bench/eeschema.finalized.wasm}"
CORES="${CORES:-1 4 8 10}"
ALLOCS="${ALLOCS:-glibc jemalloc}"
OUTDIR="${REPO}/bench/results"
CSV="${REPO}/bench/results.csv"

if [[ ! -f "${FIXTURE}" ]]; then
    echo "ERROR: fixture not found: ${FIXTURE}" >&2
    echo "Create it on the host (see scripts/bench/README.md) and scp it in." >&2
    exit 1
fi
if [[ "$(uname -s)" != "Linux" ]]; then
    echo "ERROR: run this inside the Linux VM (glibc is the point); host is $(uname -s)." >&2
    exit 1
fi
command -v /usr/bin/time >/dev/null || { echo "ERROR: install GNU time (apt-get install -y time)" >&2; exit 1; }

mkdir -p "${OUTDIR}"
echo "cores,alloc,wall_clock,wall_s,peak_rss_kb,preload" > "${CSV}"

# Convert GNU time's "Elapsed (wall clock)" field ([h:]m:ss[.ss]) to seconds.
to_seconds() {
    awk -F: '{ if (NF==3) print $1*3600+$2*60+$3; else if (NF==2) print $1*60+$2; else print $1 }'
}

run_cell() {
    local cores="$1" alloc="$2"
    local logf="${OUTDIR}/${alloc}-c${cores}.log"
    local timef="${OUTDIR}/${alloc}-c${cores}.time"

    cp "${FIXTURE}" /tmp/bench-in.wasm

    # glibc baseline forces no preload; jemalloc leaves WASM_OPT_PRELOAD unset so
    # apply-asyncify.sh auto-detects the system libjemalloc.
    local -a env_prefix=(BINARYEN_CORES="${cores}")
    if [[ "${alloc}" == "glibc" ]]; then
        env_prefix+=(WASM_OPT_PRELOAD=none)
    fi

    echo ">>> ${alloc}  BINARYEN_CORES=${cores}" >&2
    if ! env "${env_prefix[@]}" /usr/bin/time -v -o "${timef}" \
            "${REPO}/scripts/common/apply-asyncify.sh" /tmp/bench-in.wasm /tmp/bench-out.wasm \
            >"${logf}" 2>&1; then
        echo "    FAILED (see ${logf})" >&2
        echo "${cores},${alloc},FAILED,,," >> "${CSV}"
        return 0
    fi

    local wall maxrss preload wall_s
    wall=$(grep -F "Elapsed (wall clock)" "${timef}" | awk '{print $NF}')
    maxrss=$(grep -F "Maximum resident set size" "${timef}" | awk '{print $NF}')
    preload=$(grep -m1 -F "LD_PRELOAD=" "${logf}" | sed 's/.*LD_PRELOAD=//' | tr -d ' ')
    wall_s=$(printf '%s' "${wall}" | to_seconds)
    echo "    wall=${wall} (${wall_s}s)  peakRSS=${maxrss}KB  preload=${preload}" >&2
    echo "${cores},${alloc},${wall},${wall_s},${maxrss},${preload}" >> "${CSV}"
}

for c in ${CORES}; do
    for a in ${ALLOCS}; do
        run_cell "${c}" "${a}"
    done
done

# Optional: confirm the futex storm collapses with jemalloc. strace -c adds heavy
# overhead, so this is a separate, single-pass-per-allocator measurement at the
# highest core count, not part of the timing matrix above.
if [[ "${STRACE:-0}" == "1" ]]; then
    command -v strace >/dev/null || { echo "strace not installed; skipping" >&2; STRACE=0; }
fi
if [[ "${STRACE:-0}" == "1" ]]; then
    maxc="$(echo ${CORES} | tr ' ' '\n' | sort -n | tail -1)"
    WASM_OPT="$("${REPO}/scripts/common/get-wasm-opt.sh" 2>/dev/null)"
    for a in ${ALLOCS}; do
        cp "${FIXTURE}" /tmp/bench-in.wasm
        local_preload=""
        [[ "${a}" == "jemalloc" ]] && local_preload="$(ls /usr/lib/$(uname -m)-linux-gnu/libjemalloc.so.2 2>/dev/null || true)"
        echo ">>> strace ${a} (asyncify pass, BINARYEN_CORES=${maxc})" >&2
        env BINARYEN_CORES="${maxc}" ${local_preload:+LD_PRELOAD=${local_preload}} \
            strace -f -c -e trace=futex,mmap,munmap -o "${OUTDIR}/strace-${a}.txt" \
            "${WASM_OPT}" --asyncify /tmp/bench-in.wasm -o /tmp/bench-out.wasm \
            >"${OUTDIR}/strace-${a}.log" 2>&1 || echo "    strace ${a} failed (see log)" >&2
    done
    echo "strace summaries: ${OUTDIR}/strace-*.txt" >&2
fi

echo ""
echo "=== results (${CSV}) ==="
column -t -s, "${CSV}"
