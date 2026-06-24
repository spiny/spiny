#!/usr/bin/env bash
#
# Run Spiny on a connected Android device with Metro fast refresh (debug build).
#
# This compiles the debug variant, installs it, and starts the dev server so the
# app hot-reloads as you edit. Keep the device unlocked and USB debugging on.
#
#   npm run android:dev          # build, install and start Metro
#   npm run android:dev -- --device   # pick a device interactively
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

JAVA_HOME="$(bash "$ROOT/scripts/resolve-jdk17.sh")"
export JAVA_HOME
echo "Using JAVA_HOME=$JAVA_HOME"

if ! command -v adb >/dev/null 2>&1 || [ -z "$(adb devices | sed -n '2p')" ]; then
  echo "warning: no Android device detected by adb. Connect a device with USB debugging enabled." >&2
fi

exec npx expo run:android "$@"
