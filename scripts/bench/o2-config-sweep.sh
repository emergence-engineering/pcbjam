#!/bin/bash
# o2-config-sweep.sh — replay wasm-opt over a PREBUILT asyncified fixture under a
# matrix of {Binaryen version, optimization passes, thread count, allocator/THP}.
# RUNS ON THE LINUX CI BOX.
#
# WHY: the on-box diagnostic (docs/ci-build-slowness-findings.md) proved the
# ~80-min `-O2` cost is ~90% FUTEX LOCK CONTENTION inside wasm-opt (Binaryen's
# global type mutex), NOT the allocator and NOT memory management (madvise=0,
# THP compaction=0, identical under glibc and mimalloc). So the levers that can
# move wall-clock are: a NEWER Binaryen (the devs cut this contention after our
# pinned v121) and FEWER threads (less lock contention) — plus reducing the -O2
# work itself (lighter passes). Allocator/THP are dead ends, kept only as controls.
#
# CONFIG NAME GRAMMAR:  <preset>[@<cores>]
#   preset sets Binaryen version + passes + allocator/THP (see config_env).
#   optional @<cores> overrides BINARYEN_CORES for that one cell (sweep threads).
#   e.g. "v130-O2@8" = Binaryen 130, -O2, 8 threads.
#
# TWO MODES:
#   CAP_SECONDS=0 (default): run to completion → true wall-clock + output size.
#   CAP_SECONDS>0: WINDOWED sample — the lock storm is steady-state, so measure
#     it over a [60s, CAP-30s] window and kill the pass. Reports, per cell:
#       win_sysfrac   = system CPU fraction in the window (lock contention; LOWER better)
#       win_usercores = REAL-work cores in the window (progress rate; HIGHER better
#                       → predicts shorter wall for the same pass set)
#       win_tlb       = TLB-shootdown interrupts in the window
#     ~CAP/60 min per cell, so the whole matrix fits one CI run.
#
# Usage: CONFIGS="baseline v130-O2 baseline@8" CAP_SECONDS=600 \
#          ./scripts/bench/o2-config-sweep.sh <asyncified.wasm>
# Env: CONFIGS, CORES (default nproc), CAP_SECONDS (default 0), DIAGNOSTIC (1 =
#      perf kernel-symbol sample, full mode). Output under /bench/o2-results/.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "${SCRIPT_DIR}/../.." && pwd)"

FIXTURE="${1:?usage: o2-config-sweep.sh <asyncified-fixture.wasm>}"
CONFIGS="${CONFIGS:-baseline}"
CORES_DEFAULT="${CORES:-$(nproc)}"
CAP_SECONDS="${CAP_SECONDS:-0}"
DIAGNOSTIC="${DIAGNOSTIC:-0}"

[[ "$(uname -s)" == "Linux" ]] || { echo "ERROR: run on the Linux CI box." >&2; exit 1; }
[[ -f "${FIXTURE}" ]] || { echo "ERROR: fixture not found: ${FIXTURE}" >&2; exit 1; }
command -v /usr/bin/time >/dev/null || { echo "ERROR: apt-get install -y time" >&2; exit 1; }

ARCH="$(uname -m)"
WASM_OPT_121="$("${REPO}/scripts/common/get-wasm-opt.sh" 2>/dev/null)"   # pinned v121
JEMALLOC="$(ls /usr/lib/${ARCH}-linux-gnu/libjemalloc.so.2 2>/dev/null | head -1 || true)"
MIMALLOC="$(ls /usr/lib/${ARCH}-linux-gnu/libmimalloc.so* 2>/dev/null | sort | tail -1 || true)"

OUTDIR="${REPO}/bench/o2-results"; mkdir -p "${OUTDIR}"
CSV="${OUTDIR}/results.csv"
echo "config,cores,ver,flags,thp,mode,wall,wall_s,user_s,sys_s,vol_ctxsw,win_sysfrac,win_usercores,win_tlb,madvise,out_bytes,preload" > "${CSV}"

sudo sysctl -w kernel.perf_event_paranoid=-1 >/dev/null 2>&1 || true
PERF=""; command -v perf >/dev/null 2>&1 && perf stat -e syscalls:sys_enter_madvise -- true >/dev/null 2>&1 && PERF="yes"
echo "perf syscall counting: ${PERF:-NO}"
CLK="$(getconf CLK_TCK 2>/dev/null || echo 100)"

# Resolve (download+cache) a standalone wasm-opt for a Binaryen version. 121 = the
# pinned one from get-wasm-opt.sh; anything else is fetched from GitHub releases.
get_wasm_opt_ver() {
    local ver="$1"
    if [[ -z "$ver" || "$ver" == "121" ]]; then echo "${WASM_OPT_121}"; return 0; fi
    local dir="${REPO}/build-wasm/tools/binaryen-${ver}" bin="${REPO}/build-wasm/tools/binaryen-${ver}/bin/wasm-opt"
    if [[ ! -x "$bin" ]]; then
        local url="https://github.com/WebAssembly/binaryen/releases/download/version_${ver}/binaryen-version_${ver}-${ARCH}-linux.tar.gz"
        mkdir -p "${REPO}/build-wasm/tools"
        echo "  downloading Binaryen v${ver}..." >&2
        curl -fsSL -o "/tmp/binaryen-${ver}.tgz" "$url" || { echo "  ERR: download v${ver} failed ($url)" >&2; return 1; }
        tar -xzf "/tmp/binaryen-${ver}.tgz" -C "${REPO}/build-wasm/tools" || return 1
        mv "${REPO}/build-wasm/tools/binaryen-version_${ver}" "$dir" 2>/dev/null || true
    fi
    [[ -x "$bin" ]] && echo "$bin" || return 1
}

snap_cpu() { awk '/^cpu /{u=$2;s=$4;t=0;for(i=2;i<=NF;i++)t+=$i;print u,s,t}' /proc/stat; }
snap_tlb() { awk '/TLB/{for(i=2;i<=NF;i++)if($i~/^[0-9]+$/)s+=$i}END{print s+0}' /proc/interrupts; }
snap_vm()  { awk '/^compact_stall /{c=$2}/^thp_fault_alloc /{t=$2}END{print c+0,t+0}' /proc/vmstat; }
thp_state(){ grep -oP '\[\K[^]]+' /sys/kernel/mm/transparent_hugepage/enabled 2>/dev/null || echo "?"; }
set_thp()  { [[ "$1" == "asis" ]] && return 0
    echo "$1"|sudo tee /sys/kernel/mm/transparent_hugepage/enabled >/dev/null 2>&1 || true
    echo "$1"|sudo tee /sys/kernel/mm/transparent_hugepage/defrag  >/dev/null 2>&1 || true; }

# preset -> BIN_VER, OPTARGS (pass list), PRELOAD, THP_WANT, EXTRA env
BIN_VER=""; OPTARGS=(); PRELOAD=""; THP_WANT="asis"; EXTRA=()
LIGHT=(--flatten --simplify-locals --coalesce-locals --reorder-locals --vacuum)
config_env() {
    BIN_VER="121"; OPTARGS=(-O2); PRELOAD=""; THP_WANT="asis"; EXTRA=()
    case "$1" in
        baseline)        ;;                                   # v121 -O2 (current CI = control)
        v130-O2)         BIN_VER="130" ;;                     # newer Binaryen, same passes — lock fixed?
        v130-O1)         BIN_VER="130"; OPTARGS=(-O1) ;;
        v121-O1)         OPTARGS=(-O1) ;;                      # lighter passes (less work)
        v130-light)      BIN_VER="130"; OPTARGS=("${LIGHT[@]}") ;;
        v121-light)      OPTARGS=("${LIGHT[@]}") ;;
        mimalloc-retain) PRELOAD="${MIMALLOC}"; EXTRA=(MIMALLOC_PURGE_DELAY=-1 MIMALLOC_ALLOW_THP=0) ;;  # control (proven dead)
        thp-off)         THP_WANT="never" ;;                  # control (proven dead)
        *) echo "ERROR: unknown preset '$1'" >&2; return 1 ;;
    esac
    if [[ -n "${PRELOAD}" && ! -e "${PRELOAD}" ]]; then echo "WARN: preload for '$1' missing — SKIP" >&2; return 2; fi
}

field() { grep -F "$1" "$2" 2>/dev/null | tail -1 | sed 's/.*: //' | tr -d ' '; }

run_config() {
    local cfg="$1" base cores
    base="${cfg%@*}"; if [[ "$cfg" == *"@"* ]]; then cores="${cfg##*@}"; else cores="${CORES_DEFAULT}"; fi
    if ! config_env "${base}"; then echo "${cfg},${cores},,,skip,skip,SKIPPED,,,,,,,,,," >> "${CSV}"; return 0; fi

    local wopt; wopt="$(get_wasm_opt_ver "${BIN_VER}")" || {
        echo "  cannot resolve Binaryen v${BIN_VER} — SKIP"; echo "${cfg},${cores},${BIN_VER},,skip,skip,SKIP-NOBIN,,,,,,,,,," >> "${CSV}"; return 0; }
    set_thp "${THP_WANT}"; local thp_now; thp_now="$(thp_state)"
    local flags="${OPTARGS[*]}"
    local timef="${OUTDIR}/${cfg//[@ ]/_}.time" statf="${OUTDIR}/${cfg//[@ ]/_}.perfstat" logf="${OUTDIR}/${cfg//[@ ]/_}.log"
    local outw="/tmp/o2-out.wasm"
    cp "${FIXTURE}" /tmp/o2-in.wasm
    local -a runenv=(BINARYEN_CORES="${cores}" "${EXTRA[@]}"); [[ -n "${PRELOAD}" ]] && runenv+=("LD_PRELOAD=${PRELOAD}")

    echo ""; echo "=== ${cfg}  (binaryen=$("${wopt}" --version 2>&1 | grep -oE '[0-9]+' | head -1), flags='${flags}', cores=${cores}, THP=${thp_now}, preload=${PRELOAD:-none}, extra=${EXTRA[*]:-none}) ==="

    local mode="full" wall wall_s user sys volcsw sysf usercores tlbd madv outsz
    sysf=NA; usercores=NA; tlbd=NA; madv=NA

    if [[ "${CAP_SECONDS}" -gt 0 ]]; then
        mode="cap${CAP_SECONDS}"
        ( /usr/bin/time -v -o "${timef}" timeout "${CAP_SECONDS}" env "${runenv[@]}" "${wopt}" "${OPTARGS[@]}" /tmp/o2-in.wasm -o "${outw}" > "${logf}" 2>&1 ) &
        local rp=$!
        sleep 60
        local cu0 cs0 ct0 tlb0; read -r cu0 cs0 ct0 <<<"$(snap_cpu)"; tlb0="$(snap_tlb)"
        local win=$(( CAP_SECONDS>120 ? CAP_SECONDS-90 : 30 )); sleep "${win}"
        local cu1 cs1 ct1 tlb1; read -r cu1 cs1 ct1 <<<"$(snap_cpu)"; tlb1="$(snap_tlb)"
        wait "${rp}" 2>/dev/null || true
        local dtot=$((ct1-ct0)) dsys=$((cs1-cs0)) duser=$((cu1-cu0))
        sysf="$(awk -v s=${dsys} -v t=${dtot} 'BEGIN{print (t>0)?sprintf("%.2f",s/t):"NA"}')"
        usercores="$(awk -v u=${duser} -v c=${CLK} -v w=${win} 'BEGIN{print (w>0)?sprintf("%.2f",(u/c)/w):"NA"}')"
        tlbd=$((tlb1-tlb0)); wall="cap@${CAP_SECONDS}"; wall_s="${CAP_SECONDS}"
    else
        if [[ -n "${PERF}" ]]; then
            /usr/bin/time -v -o "${timef}" perf stat -o "${statf}" -e syscalls:sys_enter_madvise,syscalls:sys_enter_munmap \
                env "${runenv[@]}" "${wopt}" "${OPTARGS[@]}" /tmp/o2-in.wasm -o "${outw}" > "${logf}" 2>&1
            madv="$(grep -E 'sys_enter_madvise' "${statf}" 2>/dev/null | awk '{gsub(/,/,"",$1);print $1}' | head -1)"
        else
            /usr/bin/time -v -o "${timef}" env "${runenv[@]}" "${wopt}" "${OPTARGS[@]}" /tmp/o2-in.wasm -o "${outw}" > "${logf}" 2>&1
        fi
        if [[ $? -ne 0 ]]; then echo "  FAILED"; tail -4 "${logf}"; echo "${cfg},${cores},${BIN_VER},${flags// /+},${thp_now},full,FAILED,,,,,,,,,," >> "${CSV}"; return 0; fi
        wall="$(field 'Elapsed (wall clock) time' "${timef}")"
        wall_s="$(awk -F: '{if(NF==3)print $1*3600+$2*60+$3;else if(NF==2)print $1*60+$2;else print $1}' <<<"${wall}")"
    fi

    user="$(field 'User time (seconds)' "${timef}")"; sys="$(field 'System time (seconds)' "${timef}")"
    volcsw="$(field 'Voluntary context switches' "${timef}")"; outsz="$(stat -c %s "${outw}" 2>/dev/null || echo NA)"
    printf '%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s\n' \
        "${cfg}" "${cores}" "${BIN_VER}" "${flags// /+}" "${thp_now}" "${mode}" "${wall}" "${wall_s}" \
        "${user}" "${sys}" "${volcsw}" "${sysf}" "${usercores}" "${tlbd}" "${madv}" "${outsz}" "${PRELOAD:-none}" >> "${CSV}"
    echo "  mode=${mode} wall=${wall} user=${user}s sys=${sys}s vol_ctxsw=${volcsw} out=${outsz}B"
    echo "  WINDOW sys_frac=${sysf} (lock contention)  user_cores=${usercores} (real-work rate)  tlb=${tlbd}  madvise=${madv}"
    rm -f "${outw}" /tmp/o2-in.wasm
}

echo "Fixture: ${FIXTURE} ($(stat -c %s "${FIXTURE}" 2>/dev/null) bytes)"
echo "Configs: ${CONFIGS}  CORES_DEFAULT=${CORES_DEFAULT}  CAP_SECONDS=${CAP_SECONDS}  THP(init)=$(thp_state)"
for cfg in ${CONFIGS}; do run_config "${cfg}"; done
echo ""; echo "=== results (${CSV}) ==="; column -t -s, "${CSV}" || cat "${CSV}"
