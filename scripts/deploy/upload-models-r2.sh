#!/usr/bin/env bash
# Bulk-upload a publish-models.ts LOCAL layout to the R2 CDN via rclone.
#
# Why not the cdn-store r2 driver: it shells one `wrangler r2 object put` per
# object, fine for the ~900 objects of publish-libs but hopeless for the ~47k
# content-addressed model blobs. rclone over R2's S3 API moves them in minutes
# with concurrent streams, and per-invocation --header-upload flags reproduce
# the exact HTTP metadata the r2 driver would have set (all blobs share one
# header set, all manifests another — that's what makes this split possible).
#
# Prereqs:
#   1. `npx tsx scripts/deploy/publish-models.ts --model-tag <tag> \
#        --models-src <kicad-packages3D checkout> --driver local --out <dir>`
#      (default brotli — DO NOT pass --compress none for the live CDN)
#   2. An R2 API token with S3 auth (dash → R2 → Manage API tokens → object
#      read+write on the bucket), exported as:
#        CLOUDFLARE_ACCOUNT_ID   (the account hash in the R2 endpoint)
#        R2_S3_ACCESS_KEY_ID
#        R2_S3_SECRET_ACCESS_KEY
#
# Usage:
#   scripts/deploy/upload-models-r2.sh <local-out-dir> <tag> [bucket]
#
# Idempotent: rclone copy skips objects whose size already matches (blobs are
# content-addressed, so same-key ⇒ same bytes); manifests are tiny re-puts.

set -euo pipefail

OUT_DIR="${1:?usage: upload-models-r2.sh <local-out-dir> <tag> [bucket]}"
TAG="${2:?usage: upload-models-r2.sh <local-out-dir> <tag> [bucket]}"
BUCKET="${3:-pcbjam-cdn}"
PREFIX="libs/kicad-models"

: "${CLOUDFLARE_ACCOUNT_ID:?export CLOUDFLARE_ACCOUNT_ID (R2 endpoint account hash)}"
: "${R2_S3_ACCESS_KEY_ID:?export R2_S3_ACCESS_KEY_ID (R2 API token, S3 auth)}"
: "${R2_S3_SECRET_ACCESS_KEY:?export R2_S3_SECRET_ACCESS_KEY}"

[ -f "$OUT_DIR/$PREFIX/$TAG/manifest.json" ] \
  || { echo "no $PREFIX/$TAG/manifest.json under $OUT_DIR — wrong dir or tag?" >&2; exit 1; }

# Config-file-less rclone: the :s3: backend picks these up from the environment.
export RCLONE_S3_PROVIDER=Cloudflare
export RCLONE_S3_ENDPOINT="https://${CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com"
export RCLONE_S3_ACCESS_KEY_ID="$R2_S3_ACCESS_KEY_ID"
export RCLONE_S3_SECRET_ACCESS_KEY="$R2_S3_SECRET_ACCESS_KEY"
export RCLONE_S3_NO_CHECK_BUCKET=true   # token may lack bucket-create rights

DEST=":s3:${BUCKET}/${PREFIX}"
IMMUTABLE="public, max-age=31536000, immutable, no-transform"
COMMON=(--transfers 32 --checkers 32 --s3-chunk-size 16M --stats 30s --stats-one-line)

echo "== blobs (brotli, content-addressed, immutable) =="
rclone copy "${COMMON[@]}" \
  --header-upload "Content-Type: application/octet-stream" \
  --header-upload "Content-Encoding: br" \
  --header-upload "Cache-Control: ${IMMUTABLE}" \
  --exclude "registry.json" \
  "$OUT_DIR/$PREFIX/blobs" "$DEST/blobs"

echo "== per-lib + top manifests (json, immutable) =="
rclone copy "${COMMON[@]}" \
  --header-upload "Content-Type: application/json" \
  --header-upload "Cache-Control: ${IMMUTABLE}" \
  "$OUT_DIR/$PREFIX/$TAG" "$DEST/$TAG"

echo "== blob registry (publish-time index, no-store) =="
rclone copyto \
  --header-upload "Content-Type: application/json" \
  --header-upload "Cache-Control: no-store" \
  "$OUT_DIR/$PREFIX/blobs/registry.json" "$DEST/blobs/registry.json"

echo "== verify =="
rclone lsl "$DEST/$TAG/manifest.json"
echo "done: https://cdn.pcbjam.com/${PREFIX}/${TAG}/manifest.json"
