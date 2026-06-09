#!/bin/bash
# o2-config-sweep.sh — replay `wasm-opt -O2` over a PREBUILT asyncified fixture
# under a matrix of allocator / THP / thread configs. RUNS ON THE LINUX CI BOX.
#
# The `-O2` pass (not asyncify) is the ~80-min bottleneck. Its cost on glibc
# Linux is a kernel page-management storm (madvise(MADV_DONTNEED) TLB-shootdowns
# + possibly THP compaction), NOT the optimization work itself — see
# docs/ci-build-slowness-findings.md. This harness isolates that pass and sweeps
# the env knobs that kill the storm, recording /usr/bin/time -v counters (the
# voluntary-context-switch + system-time numbers are the storm's fingerprint)
# plus a near-zero-overhead perf-stat madvise/munmap count to PROVE whether each
# config actually stopped returning memory to the OS.
#
# Usage (on the Linux box, repo root):
#   CONFIGS="baseline mimalloc-retain" CORES=32 DIAGNOSTIC=1 \
#     ./scripts/bench/o2-config-sweep.sh /path/to/eeschema.asyncified.wasm
#
# Env:
#   CONFIGS    space-separated preset names (see config_env below). Run in order;
#              order cheapest-expected first so a timeout still yields data.
#   CORES      BINARYEN_CORES for every cell (default: nproc). Sweep separately.
#   DIAGNOSTIC 1 = around the FIRST config, snapshot /proc/vmstat + /proc/interrupts
#              deltas and take a 60s perf-record kernel-symbol sample (best effort).
#              This attributes the kernel time: TLB-shootdown vs THP-compaction.
#
# Output (under /bench, which is gitignored; the workflow uploads it):
#   bench/o2-results/results.csv         one row per config
#   bench/o2-results/<config>.time       raw /usr/bin/time -v
#   bench/o2-results/<config>.perfstat   raw perf stat (syscall counts)
#   bench/o2-results/diag-*.{vmstat,irq,perf}   diagnostic captures
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "${SCRIPT_DIR}/../.." && pwd)"

FIXTURE="${1:?usage: o2-config-sweep.sh <asyncified-fixture.wasm>}"
CONFIGS="${CONFIGS:-baseline}"
CORES="${CORES:-$(nproc)}"
DIAGNOSTIC="${DIAGNOSTIC:-0}"

if [[ "$(uname -s)" != "Linux" ]]; then
    echo "ERROR: run on the Linux CI box (glibc + x86 TLB shootdowns are the point)." >&2
    exit 1
fi
[[ -f "${FIXTURE}" ]] || { echo "ERROR: fixture not found: ${FIXTURE}" >&2; exit 1; }
command -v /usr/bin/time >/dev/null || { echo "ERROR: apt-get install -y time" >&2; exit 1; }

WASM_OPT="$("${REPO}/scripts/common/get-wasm-opt.sh" 2>/dev/null)"
[[ -x "${WASM_OPT}" ]] || { echo "ERROR: wasm-opt not resolved (${WASM_OPT})" >&2; exit 1; }
echo "wasm-opt: ${WASM_OPT} ($("${WASM_OPT}" --version 2>&1))"

ARCH="$(uname -m)"
JEMALLOC="$(ls /usr/lib/${ARCH}-linux-gnu/libjemalloc.so.2 2>/dev/null | head -1 || true)"
MIMALLOC="$(ls /usr/lib/${ARCH}-linux-gnu/libmimalloc.so* 2>/dev/null | sort | tail -1 || true)"

OUTDIR="${REPO}/bench/o2-results"
mkdir -p "${OUTDIR}"
CSV="${OUTDIR}/results.csv"
echo "config,cores,thp,wall,wall_s,user_s,sys_s,cpu_pct,peak_rss_kb,minor_faults,vol_ctxsw,invol_ctxsw,madvise,munmap,mmap,out_bytes,preload" > "${CSV}"

# Lower perf paranoia so we can count syscall tracepoints unprivileged (keeps
# LD_PRELOAD intact — running perf under sudo would scrub the env). Best effort.
sudo sysctl -w kernel.perf_event_paranoid=-1 >/dev/null 2>&1 || true
PERF=""
if command -v perf >/dev/null 2>&1 && \
   perf stat -e syscalls:sys_enter_madvise -- true >/dev/null 2>&1; then
    PERF="yes"
    echo "perf: syscall counting available"
else
    echo "perf: NOT available — madvise/munmap columns will be NA"
fi

thp_state() { cat /sys/kernel/mm/transparent_hugepage/enabled 2>/dev/null | grep -oP '\[\K[^]]+' || echo "?"; }
set_thp() {  # $1 = never|madvise|always|asis
    [[ "$1" == "asis" ]] && return 0
    echo "$1" | sudo tee /sys/kernel/mm/transparent_hugepage/enabled >/dev/null 2>&1 || \
        echo "WARN: could not set THP enabled=$1" >&2
    echo "$1" | sudo tee /sys/kernel/mm/transparent_hugepage/defrag  >/dev/null 2>&1 || true
}

# Resolve a preset name -> PRELOAD path, THP_WANT, and EXTRA env (array).
# KILL-the-storm presets disable the allocator's page purging (no madvise/munmap
# of freed pages); 128 GB RAM vs ~40 GB peak makes "never return memory" safe.
PRELOAD=""; THP_WANT="asis"; EXTRA=()
config_env() {
    PRELOAD=""; THP_WANT="asis"; EXTRA=()
    case "$1" in
        baseline)                 ;;                                           # glibc default, THP as-is (current CI control)
        glibc-retain)             EXTRA=(MALLOC_TRIM_THRESHOLD_=-1 MALLOC_MMAP_MAX_=0) ;;
        glibc-arenacap)           EXTRA=(MALLOC_ARENA_MAX=4) ;;                # contention-only lever (control)
        jemalloc-default)         PRELOAD="${JEMALLOC}" ;;                     # reproduce the prior ~15% result
        jemalloc-retain)          PRELOAD="${JEMALLOC}"; EXTRA=(MALLOC_CONF=dirty_decay_ms:-1,muzzy_decay_ms:-1,background_thread:true) ;;
        mimalloc-default)         PRELOAD="${MIMALLOC}" ;;
        mimalloc-retain)          PRELOAD="${MIMALLOC}"; EXTRA=(MIMALLOC_PURGE_DELAY=-1 MIMALLOC_ALLOW_THP=0) ;;
        thp-off)                  THP_WANT="never" ;;                          # isolate THP effect on glibc
        thp-off+jemalloc-retain)  THP_WANT="never"; PRELOAD="${JEMALLOC}"; EXTRA=(MALLOC_CONF=dirty_decay_ms:-1,muzzy_decay_ms:-1,background_thread:true) ;;
        thp-off+mimalloc-retain)  THP_WANT="never"; PRELOAD="${MIMALLOC}"; EXTRA=(MIMALLOC_PURGE_DELAY=-1 MIMALLOC_ALLOW_THP=0) ;;
        thp-off+glibc-retain)     THP_WANT="never"; EXTRA=(MALLOC_TRIM_THRESHOLD_=-1 MALLOC_MMAP_MAX_=0) ;;
        *) echo "ERROR: unknown config '$1'" >&2; return 1 ;;
    esac
    if [[ -n "${PRELOAD}" && ! -e "${PRELOAD}" ]]; then
        echo "WARN: preload lib for '$1' not found (${PRELOAD:-<empty>}) — SKIPPING" >&2
        return 2
    fi
}

field() { grep -F "$1" "$2" | tail -1 | sed 's/.*: //' | tr -d ' '; }

run_config() {
    local cfg="$1"
    if ! config_env "${cfg}"; then
        echo "${cfg},${CORES},skip,SKIPPED,,,,,,,,,,,," >> "${CSV}"
        return 0
    fi
    set_thp "${THP_WANT}"
    local thp_now; thp_now="$(thp_state)"

    local timef="${OUTDIR}/${cfg}.time"
    local statf="${OUTDIR}/${cfg}.perfstat"
    local logf="${OUTDIR}/${cfg}.log"
    local outw="/tmp/o2-out-${cfg}.wasm"
    cp "${FIXTURE}" /tmp/o2-in.wasm

    # Build env for the run. LD_PRELOAD injected only when a preset names one.
    local -a runenv=(BINARYEN_CORES="${CORES}" "${EXTRA[@]}")
    [[ -n "${PRELOAD}" ]] && runenv+=("LD_PRELOAD=${PRELOAD}")

    echo ""
    echo "=== ${cfg}  (cores=${CORES}, THP=${thp_now}, preload=${PRELOAD:-<none>}, extra: ${EXTRA[*]:-<none>}) ==="

    # Optional diagnostic capture around the first config (attribute kernel time).
    local diag_pid=""
    if [[ "${DIAGNOSTIC}" == "1" ]]; then
        grep -E 'thp_|compact_|pgfault|pgmajfault|numa_' /proc/vmstat > "${OUTDIR}/diag-${cfg}.vmstat.before" 2>/dev/null || true
        grep -iE 'TLB|^\s*CAL|Function call' /proc/interrupts > "${OUTDIR}/diag-${cfg}.irq.before" 2>/dev/null || true
        # Background sampler: wait for the pass to be deep into the storm, then
        # take a 60s system-wide kernel-symbol sample. Best effort (needs perf).
        if [[ -n "${PERF}" ]]; then
            ( sleep 1200
              p="$(pgrep -n -f 'wasm-opt -O2' || true)"
              [[ -n "$p" ]] && perf record -g -a -o "${OUTDIR}/diag-${cfg}.perf.data" -- sleep 60 >/dev/null 2>&1
              [[ -f "${OUTDIR}/diag-${cfg}.perf.data" ]] && \
                perf report -i "${OUTDIR}/diag-${cfg}.perf.data" --stdio --sort comm,dso,symbol 2>/dev/null \
                  | head -120 > "${OUTDIR}/diag-${cfg}.perf.txt"
            ) & diag_pid=$!
        fi
    fi

    # The measured run. perf stat (counter mode) adds negligible overhead and
    # gives the whole-run madvise/munmap/mmap counts — the direct proof of
    # whether the allocator stopped returning pages.
    local madv="NA" munm="NA" mmp="NA"
    if [[ -n "${PERF}" ]]; then
        /usr/bin/time -v -o "${timef}" \
            perf stat -o "${statf}" \
                -e syscalls:sys_enter_madvise,syscalls:sys_enter_munmap,syscalls:sys_enter_mmap \
                env "${runenv[@]}" "${WASM_OPT}" -O2 /tmp/o2-in.wasm -o "${outw}" \
            > "${logf}" 2>&1
        madv="$(grep -E 'sys_enter_madvise' "${statf}" 2>/dev/null | awk '{gsub(/,/,"",$1); print $1}' | head -1)"
        munm="$(grep -E 'sys_enter_munmap'  "${statf}" 2>/dev/null | awk '{gsub(/,/,"",$1); print $1}' | head -1)"
        mmp="$(grep  -E 'sys_enter_mmap'    "${statf}" 2>/dev/null | awk '{gsub(/,/,"",$1); print $1}' | head -1)"
    else
        /usr/bin/time -v -o "${timef}" \
            env "${runenv[@]}" "${WASM_OPT}" -O2 /tmp/o2-in.wasm -o "${outw}" \
            > "${logf}" 2>&1
    fi
    local rc=$?

    [[ -n "${diag_pid}" ]] && wait "${diag_pid}" 2>/dev/null || true
    if [[ "${DIAGNOSTIC}" == "1" ]]; then
        grep -E 'thp_|compact_|pgfault|pgmajfault|numa_' /proc/vmstat > "${OUTDIR}/diag-${cfg}.vmstat.after" 2>/dev/null || true
        grep -iE 'TLB|^\s*CAL|Function call' /proc/interrupts > "${OUTDIR}/diag-${cfg}.irq.after" 2>/dev/null || true
    fi

    if [[ ${rc} -ne 0 ]]; then
        echo "  FAILED (rc=${rc}) — see ${logf}"; tail -5 "${logf}" || true
        echo "${cfg},${CORES},${thp_now},FAILED,,,,,,,,,,,," >> "${CSV}"
        return 0
    fi

    local wall user sys cpu rss minflt volcsw involcsw wall_s outsz
    wall="$(field 'Elapsed (wall clock) time' "${timef}")"
    user="$(field 'User time (seconds)' "${timef}")"
    sys="$(field 'System time (seconds)' "${timef}")"
    cpu="$(grep -F 'Percent of CPU' "${timef}" | sed 's/.*: //' | tr -d ' ')"
    rss="$(field 'Maximum resident set size' "${timef}")"
    minflt="$(field 'Minor (reclaiming a frame) page faults' "${timef}")"
    volcsw="$(field 'Voluntary context switches' "${timef}")"
    involcsw="$(field 'Involuntary context switches' "${timef}")"
    wall_s="$(awk -F: '{ if (NF==3) print $1*3600+$2*60+$3; else if (NF==2) print $1*60+$2; else print $1 }' <<<"${wall}")"
    outsz="$(stat -c %s "${outw}" 2>/dev/null || echo NA)"

    printf '%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s\n' \
        "${cfg}" "${CORES}" "${thp_now}" "${wall}" "${wall_s}" "${user}" "${sys}" "${cpu}" \
        "${rss}" "${minflt}" "${volcsw}" "${involcsw}" "${madv}" "${munm}" "${mmp}" "${outsz}" "${PRELOAD:-none}" >> "${CSV}"

    echo "  wall=${wall} (${wall_s}s)  user=${user}s sys=${sys}s cpu=${cpu}  rss=${rss}KB"
    echo "  vol_ctxsw=${volcsw}  minor_faults=${minflt}  madvise=${madv} munmap=${munm}  out=${outsz}B"
    rm -f "${outw}" /tmp/o2-in.wasm
}

echo "Fixture: ${FIXTURE} ($(stat -c %s "${FIXTURE}" 2>/dev/null) bytes)"
echo "Configs: ${CONFIGS}   Cores: ${CORES}   THP(initial): $(thp_state)   Diagnostic: ${DIAGNOSTIC}"
for cfg in ${CONFIGS}; do
    run_config "${cfg}"
done

echo ""
echo "=== results (${CSV}) ==="
column -t -s, "${CSV}" || cat "${CSV}"
