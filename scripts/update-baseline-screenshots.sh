#!/bin/bash
# Update baseline screenshots from test results
# Only copies:
#   - NEW screenshots (not in baseline)
#   - Screenshots with SIGNIFICANT differences (>5% size change) when --all flag used
#
# Usage:
#   ./update-baseline-screenshots.sh          # Only copy NEW screenshots
#   ./update-baseline-screenshots.sh --all    # Copy new + significantly different

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TESTS_DIR="$SCRIPT_DIR/../tests"
SOURCE_DIR="$TESTS_DIR/test-results"
DEST_DIR="$TESTS_DIR/baseline-screenshots"

COPY_ALL=0
THRESHOLD=5  # Percent threshold for "significant" difference

if [ "$1" = "--all" ]; then
    COPY_ALL=1
    echo "Mode: Copy NEW + SIGNIFICANTLY DIFFERENT screenshots"
else
    echo "Mode: Copy NEW screenshots only (use --all to include significant changes)"
fi

if [ ! -d "$SOURCE_DIR" ]; then
    echo "Error: test-results directory not found at $SOURCE_DIR"
    echo "Run 'npm test' first to generate screenshots"
    exit 1
fi

mkdir -p "$DEST_DIR"

new_count=0
updated_count=0

for src_file in "$SOURCE_DIR"/*.png; do
    [ -f "$src_file" ] || continue

    filename=$(basename "$src_file")
    dest_file="$DEST_DIR/$filename"

    if [ ! -f "$dest_file" ]; then
        # NEW: Screenshot doesn't exist in baseline
        echo "NEW: $filename"
        cp "$src_file" "$dest_file"
        ((new_count++))
    elif [ $COPY_ALL -eq 1 ]; then
        # Check if significantly different
        src_size=$(stat -f%z "$src_file" 2>/dev/null || stat -c%s "$src_file")
        dest_size=$(stat -f%z "$dest_file" 2>/dev/null || stat -c%s "$dest_file")

        if [ "$dest_size" -eq 0 ]; then
            diff_pct=100
        else
            diff=$((src_size - dest_size))
            diff=${diff#-}  # Absolute value
            diff_pct=$((diff * 100 / dest_size))
        fi

        if [ "$diff_pct" -ge "$THRESHOLD" ]; then
            echo "UPDATED ($diff_pct% diff): $filename"
            cp "$src_file" "$dest_file"
            ((updated_count++))
        fi
    fi
done

echo ""
echo "=== Summary ==="
echo "New screenshots added: $new_count"
if [ $COPY_ALL -eq 1 ]; then
    echo "Significantly changed: $updated_count"
fi
echo "Total in baseline: $(ls -1 "$DEST_DIR"/*.png 2>/dev/null | wc -l | tr -d ' ')"
