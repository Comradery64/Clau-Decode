#!/usr/bin/env bash
# pipeline.sh — end-to-end demo reel build.
#
# Steps:
#   1. Render `before.mp4` from before.tape (VHS)
#   2. Launch `clau-decode --demo` in the background
#   3. Wait for the server to be ready
#   4. Run testreel to record `after.webm`
#   5. Kill clau-decode
#   6. ffmpeg concat → `output/reel.mp4`
#
# Usage:
#   bash pipeline.sh                # full build
#   SKIP_BEFORE=1 bash pipeline.sh  # reuse existing before.mp4
#   SKIP_AFTER=1  bash pipeline.sh  # reuse existing after.webm
#
set -euo pipefail

cd "$(dirname "$0")"
REEL_DIR="$(pwd)"
REPO_DIR="$(cd .. && pwd)"
RECORDER_DIR="${RECORDER_DIR:-$HOME/clau-decode-demo/recorder}"
OUT="$REEL_DIR/output"
mkdir -p "$OUT"

# Make brew's binaries discoverable in non-interactive shells.
if [ -x /opt/homebrew/bin/brew ]; then
  eval "$(/opt/homebrew/bin/brew shellenv)"
fi

log() { printf '\033[36m[reel]\033[0m %s\n' "$*"; }

# ---------------------------------------------------------------------------
# 1. before.mp4
# ---------------------------------------------------------------------------
if [ "${SKIP_BEFORE:-}" = "1" ] && [ -f "$OUT/before.mp4" ]; then
  log "SKIP_BEFORE=1 — reusing $OUT/before.mp4"
else
  log "Rendering before.mp4 (VHS)…"
  bash setup.sh
  vhs .before.rendered.tape
fi

# ---------------------------------------------------------------------------
# 2-5. after.webm
# ---------------------------------------------------------------------------
if [ "${SKIP_AFTER:-}" = "1" ] && [ -f "$OUT/after.webm" ]; then
  log "SKIP_AFTER=1 — reusing $OUT/after.webm"
else
  log "Starting clau-decode --demo on :4242…"
  cd "$REPO_DIR"
  uv run clau-decode --demo "$REPO_DIR/demo-data" --no-open --port 4242 \
    > "$OUT/clau-decode.log" 2>&1 &
  CLAU_PID=$!
  # Ensure we kill the server even if testreel fails.
  trap 'kill "$CLAU_PID" 2>/dev/null || true' EXIT

  log "Waiting for /api/health…"
  for _ in $(seq 1 60); do
    if curl -fsS http://localhost:4242/api/health >/dev/null 2>&1; then
      log "  server up (pid $CLAU_PID)"
      break
    fi
    sleep 0.5
  done
  if ! curl -fsS http://localhost:4242/api/health >/dev/null 2>&1; then
    log "ERROR: clau-decode did not come up within 30s. Check $OUT/clau-decode.log"
    exit 1
  fi

  log "Running testreel…"
  cd "$RECORDER_DIR"
  cp "$REEL_DIR/recording.json" "$RECORDER_DIR/recording.json"
  rm -rf "$RECORDER_DIR/testreel-output"
  npx --no testreel recording.json

  log "Copying outputs to $OUT/"
  # testreel writes a .webm + a manifest + screenshots
  cp "$RECORDER_DIR/testreel-output/"*.webm "$OUT/after.webm"
  cp "$RECORDER_DIR/testreel-output/"*.png   "$OUT/" 2>/dev/null || true
  cp "$RECORDER_DIR/testreel-output/output.json" "$OUT/testreel-manifest.json" 2>/dev/null || true

  log "Stopping clau-decode…"
  kill "$CLAU_PID" 2>/dev/null || true
  wait "$CLAU_PID" 2>/dev/null || true
  trap - EXIT
fi

# ---------------------------------------------------------------------------
# 6. ffmpeg stitch
# ---------------------------------------------------------------------------
log "Stitching before + after → reel.mp4…"
cd "$OUT"
# Both inputs may differ in codec/fps/size. Normalise via filter_complex,
# then concat. yuv420p ensures broad player compatibility.
ffmpeg -y -loglevel error \
  -i before.mp4 \
  -i after.webm \
  -filter_complex "\
    [0:v]scale=1280:720:force_original_aspect_ratio=decrease,\
         pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=#1e1e2e,\
         setsar=1,fps=30,format=yuv420p[v0];\
    [1:v]scale=1280:720:force_original_aspect_ratio=decrease,\
         pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=#1e1e2e,\
         setsar=1,fps=30,format=yuv420p[v1];\
    [v0][v1]concat=n=2:v=1:a=0[outv]" \
  -map "[outv]" -c:v libx264 -preset medium -crf 22 -movflags +faststart \
  reel.mp4

log "Done."
ls -lh "$OUT/"
