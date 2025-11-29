#!/bin/bash

# Compare test screenshots with baseline screenshots
# This script compares all PNG files in baseline-screenshots with test-results

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BASELINE_DIR="$PROJECT_ROOT/tests/baseline-screenshots"
TEST_RESULTS_DIR="$PROJECT_ROOT/tests/test-results"

# Check if directories exist
if [ ! -d "$BASELINE_DIR" ]; then
    echo "ERROR: Baseline directory not found: $BASELINE_DIR"
    exit 1
fi

if [ ! -d "$TEST_RESULTS_DIR" ]; then
    echo "ERROR: Test results directory not found: $TEST_RESULTS_DIR"
    exit 1
fi

echo "=== Screenshot Comparison ==="
echo "Baseline:     $BASELINE_DIR"
echo "Test Results: $TEST_RESULTS_DIR"
echo ""

# Counters
total=0
identical=0
different=0
missing_current=0
extra_current=0

# Compare all baseline screenshots
echo "=== Comparing Baseline Screenshots ==="
for baseline in "$BASELINE_DIR"/*.png; do
    filename=$(basename "$baseline")
    current="$TEST_RESULTS_DIR/$filename"
    total=$((total + 1))

    if [ ! -f "$current" ]; then
        echo "MISSING: $filename (not in test results)"
        missing_current=$((missing_current + 1))
        continue
    fi

    # Compare using cmp (byte-by-byte comparison)
    if cmp -s "$baseline" "$current"; then
        identical=$((identical + 1))
        # Only show identical files if verbose
        if [ "$1" = "-v" ] || [ "$1" = "--verbose" ]; then
            echo "IDENTICAL: $filename"
        fi
    else
        different=$((different + 1))

        # Get file sizes
        baseline_size=$(stat -f%z "$baseline" 2>/dev/null || stat -c%s "$baseline")
        current_size=$(stat -f%z "$current" 2>/dev/null || stat -c%s "$current")
        diff_bytes=$((current_size - baseline_size))

        # Calculate percent difference
        if [ "$baseline_size" -gt 0 ]; then
            diff_pct=$(echo "scale=2; ($diff_bytes * 100) / $baseline_size" | bc)
        else
            diff_pct="N/A"
        fi

        echo "DIFFERENT: $filename (baseline: ${baseline_size}B, current: ${current_size}B, diff: ${diff_bytes}B / ${diff_pct}%)"
    fi
done

# Check for extra files in test results not in baseline
echo ""
echo "=== Checking for Extra Screenshots ==="
for current in "$TEST_RESULTS_DIR"/*.png; do
    filename=$(basename "$current")
    baseline="$BASELINE_DIR/$filename"

    if [ ! -f "$baseline" ]; then
        extra_current=$((extra_current + 1))
        current_size=$(stat -f%z "$current" 2>/dev/null || stat -c%s "$current")
        echo "EXTRA: $filename (${current_size}B, not in baseline)"
    fi
done

# Summary
echo ""
echo "=== Summary ==="
echo "Total baseline screenshots: $total"
echo "Identical:                  $identical"
echo "Different:                  $different"
echo "Missing from test results:  $missing_current"
echo "Extra in test results:      $extra_current"

# Exit with error if there are differences
if [ "$different" -gt 0 ] || [ "$missing_current" -gt 0 ]; then
    echo ""
    echo "WARNING: There are differences between baseline and test results!"
    exit 1
else
    echo ""
    echo "SUCCESS: All screenshots match baseline!"
    exit 0
fi
