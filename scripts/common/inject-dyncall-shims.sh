#!/bin/bash
# Inject dynCall_* shims into Emscripten-generated JS
#
# Emscripten 4.x no longer generates signature-specific dynCall_* functions,
# but the invoke_* wrappers (for C++ exception handling) still call them.
# This script auto-generates shims using getWasmTableEntry() which IS defined.
#
# Usage: inject-dyncall-shims.sh <pcbnew.js>

set -e

JS_FILE="$1"

if [ -z "$JS_FILE" ] || [ ! -f "$JS_FILE" ]; then
    echo "Error: JS file not found: $JS_FILE"
    echo "Usage: $0 <path/to/pcbnew.js>"
    exit 1
fi

echo "Extracting dynCall signatures from $JS_FILE..."

# Extract all unique dynCall_* signatures from the file
# Matches patterns like: dynCall_i, dynCall_ii, dynCall_viijj, etc.
SIGNATURES=$(grep -oE 'dynCall_[a-zA-Z0-9]+' "$JS_FILE" | sort -u | sed 's/dynCall_//')

if [ -z "$SIGNATURES" ]; then
    echo "No dynCall signatures found - nothing to inject"
    exit 0
fi

SIG_COUNT=$(echo "$SIGNATURES" | wc -l | tr -d ' ')
echo "Found $SIG_COUNT unique signatures"

# Generate shim code
SHIM_FILE=$(mktemp)
cat > "$SHIM_FILE" << 'HEADER'

// === dynCall shims for Emscripten exception handling ===
// Auto-generated: maps dynCall_SIG() calls to getWasmTableEntry()
// This fixes "dynCall_* is not defined" errors in Emscripten 4.x
HEADER

for sig in $SIGNATURES; do
    # Count args: signature length - 1 (first char is return type)
    argcount=$((${#sig} - 1))

    # Generate argument list: index, a0, a1, a2, ...
    args="index"
    call_args=""
    for ((i=0; i<argcount; i++)); do
        args="$args, a$i"
        if [ $i -gt 0 ]; then
            call_args="$call_args, "
        fi
        call_args="${call_args}a$i"
    done

    echo "var dynCall_$sig = ($args) => getWasmTableEntry(index)($call_args);" >> "$SHIM_FILE"
done

echo "" >> "$SHIM_FILE"
echo "// === End dynCall shims ===" >> "$SHIM_FILE"

# Find the insertion point: after getWasmTableEntry definition
# The pattern is:
#   var getWasmTableEntry = funcPtr => {
#     ...
#   };
# We insert after the closing `};`

# Find line number of getWasmTableEntry definition
GWTL_LINE=$(grep -n '^var getWasmTableEntry = funcPtr => {' "$JS_FILE" | head -1 | cut -d: -f1)

if [ -z "$GWTL_LINE" ]; then
    echo "Warning: Could not find getWasmTableEntry definition"
    echo "Trying alternate pattern..."
    GWTL_LINE=$(grep -n 'var getWasmTableEntry' "$JS_FILE" | head -1 | cut -d: -f1)
fi

if [ -z "$GWTL_LINE" ]; then
    echo "Error: Could not find getWasmTableEntry in $JS_FILE"
    echo "The shims need to be inserted after getWasmTableEntry is defined"
    rm "$SHIM_FILE"
    exit 1
fi

# Find the closing `};` after getWasmTableEntry (within next 10 lines)
INSERT_LINE=""
for ((i=GWTL_LINE; i<=GWTL_LINE+10; i++)); do
    LINE_CONTENT=$(sed -n "${i}p" "$JS_FILE")
    if [[ "$LINE_CONTENT" == "};" ]]; then
        INSERT_LINE=$i
        break
    fi
done

if [ -z "$INSERT_LINE" ]; then
    echo "Warning: Could not find closing }; for getWasmTableEntry"
    echo "Inserting after line $GWTL_LINE"
    INSERT_LINE=$GWTL_LINE
fi

echo "Injecting shims after line $INSERT_LINE..."

# Create output file with shims inserted
head -n "$INSERT_LINE" "$JS_FILE" > "${JS_FILE}.tmp"
cat "$SHIM_FILE" >> "${JS_FILE}.tmp"
tail -n +$((INSERT_LINE + 1)) "$JS_FILE" >> "${JS_FILE}.tmp"

# Replace original file
mv "${JS_FILE}.tmp" "$JS_FILE"
rm "$SHIM_FILE"

echo "Successfully injected $SIG_COUNT dynCall shims into $JS_FILE"
