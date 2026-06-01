#!/bin/bash
# Emit machine-parseable build-progress markers into the log stream.
#
# All build output is captured by logging.sh into logs/<script>/<ts>.log, and
# scripts/build-monitor.sh parses these @KW@ lines to render live progress.
# These are plain printf so they work identically on the host (docker/build.sh)
# and inside `docker compose exec` (build-kicad-target.sh, build-wxuniversal-wasm.sh):
# the container's stdout flows back through build.sh's redirected stdout into the
# same host log, so a single log is the source of truth for the whole build.
#
# Each marker carries an epoch timestamp so the monitor can reconstruct per-stage
# elapsed time even when it attaches mid-build or runs --once on a finished log.
#
# Marker grammar (one per line):
#   @KW@ <epoch> stage  <key>
#   @KW@ <epoch> app    <name> <index> <total>
#   @KW@ <epoch> done
#   @KW@ <epoch> failed <exit_code>
#
# The monitor owns human-readable labels (key -> label), so keys stay terse here.

kw_stage() { printf '@KW@ %s stage %s\n' "$(date +%s)" "$1"; }
kw_app()   { printf '@KW@ %s app %s %s %s\n' "$(date +%s)" "$1" "$2" "$3"; }
kw_done()  { printf '@KW@ %s done\n' "$(date +%s)"; }
kw_fail()  { printf '@KW@ %s failed %s\n' "$(date +%s)" "${1:-1}"; }
