#!/bin/bash
# Stub wasm-opt that does nothing
# This allows Emscripten to generate Asyncify JS runtime without running the actual transformation
# The real wasm-opt --asyncify is run on the host where more RAM is available

# Handle --version query from Emscripten
if [[ "$1" == "--version" ]]; then
    echo "wasm-opt version 121 (version_121)"
    exit 0
fi

# Find the output file argument (-o)
OUTPUT=""
INPUT=""
PREV_ARG=""

for arg in "$@"; do
    if [ "$PREV_ARG" = "-o" ]; then
        OUTPUT="$arg"
    elif [[ "$arg" != -* ]] && [ -f "$arg" ]; then
        INPUT="$arg"
    fi
    PREV_ARG="$arg"
done

# If we have both input and output, copy input to output
if [ -n "$INPUT" ] && [ -n "$OUTPUT" ] && [ "$INPUT" != "$OUTPUT" ]; then
    cp "$INPUT" "$OUTPUT"
fi

# Exit successfully so Emscripten thinks wasm-opt ran
exit 0
