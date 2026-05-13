#!/usr/bin/env bash
# setup.sh — Prepare the demo-reel sandbox on the host machine.
#
# Run from this directory (clau-decode/demo-reel):
#   bash setup.sh
#
# Effects (all idempotent):
#   1. fake-home/.claude/projects -> symlink to ../../demo-data/projects
#   2. before.tape gets __FAKE_HOME__ replaced with the absolute path of
#      ./fake-home so VHS can find it.
#
# Designed to be safe to re-run after every clean checkout.
set -euo pipefail

cd "$(dirname "$0")"
REEL_DIR="$(pwd)"
FAKE_HOME="$REEL_DIR/fake-home"
DEMO_DATA="$REEL_DIR/../demo-data/projects"

if [ ! -d "$DEMO_DATA" ]; then
  echo "ERROR: demo data not found at $DEMO_DATA" >&2
  echo "Run 'python demo-data/generate.py' from the repo root first." >&2
  exit 1
fi

# 1. Wire ~/.claude/projects/ inside fake-home to the real demo data.
mkdir -p "$FAKE_HOME/.claude"
PROJECTS_LINK="$FAKE_HOME/.claude/projects"
if [ -L "$PROJECTS_LINK" ] || [ -e "$PROJECTS_LINK" ]; then
  rm -rf "$PROJECTS_LINK"
fi
ln -s "$DEMO_DATA" "$PROJECTS_LINK"
echo "  linked $PROJECTS_LINK -> $DEMO_DATA"

# 2. Render before.tape with the absolute fake-home path.
TAPE_SRC="$REEL_DIR/before.tape"
TAPE_OUT="$REEL_DIR/.before.rendered.tape"
sed "s|__FAKE_HOME__|$FAKE_HOME|g" "$TAPE_SRC" > "$TAPE_OUT"
echo "  rendered $TAPE_OUT (HOME=$FAKE_HOME)"

# 3. Ensure output dir exists.
mkdir -p "$REEL_DIR/output"

echo
echo "Ready. To produce before.mp4:"
echo "    vhs $TAPE_OUT"
