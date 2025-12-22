#!/bin/bash
# Stub wasm-emscripten-finalize that just copies input to output
# The real finalize runs on the host where more RAM is available

# Handle --version query
if [[ "$1" == "--version" ]]; then
    echo "wasm-emscripten-finalize version 121"
    exit 0
fi

# Parse arguments to find input/output files
# wasm-emscripten-finalize <input.wasm> -o <output.wasm> [options]
INPUT=""
OUTPUT=""
PREV_ARG=""

for arg in "$@"; do
    if [ "$PREV_ARG" = "-o" ]; then
        OUTPUT="$arg"
    elif [[ "$arg" != -* ]] && [[ "$arg" == *.wasm ]]; then
        INPUT="$arg"
    fi
    PREV_ARG="$arg"
done

# Copy input to output (no transformation)
if [ -n "$INPUT" ] && [ -n "$OUTPUT" ]; then
    cp "$INPUT" "$OUTPUT"
elif [ -n "$INPUT" ]; then
    # In-place mode: nothing to do
    :
fi

exit 0
