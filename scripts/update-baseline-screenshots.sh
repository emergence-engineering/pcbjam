#!/bin/bash
# Update baseline screenshots from test results

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TESTS_DIR="$SCRIPT_DIR/../tests"
SOURCE_DIR="$TESTS_DIR/test-results"
DEST_DIR="$TESTS_DIR/baseline-screenshots"

if [ ! -d "$SOURCE_DIR" ]; then
    echo "Error: test-results directory not found at $SOURCE_DIR"
    echo "Run 'npm test' first to generate screenshots"
    exit 1
fi

mkdir -p "$DEST_DIR"

count=$(ls -1 "$SOURCE_DIR"/*.png 2>/dev/null | wc -l)
if [ "$count" -eq 0 ]; then
    echo "No screenshots found in $SOURCE_DIR"
    exit 1
fi

echo "Copying $count screenshots to baseline..."
cp "$SOURCE_DIR"/*.png "$DEST_DIR/"

echo "Updated baseline screenshots:"
ls -1 "$DEST_DIR"/*.png | wc -l
echo "screenshots in $DEST_DIR"
