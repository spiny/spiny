#!/usr/bin/env bash
#
# Build a standalone signed release APK and install it on a connected device.
# The app then runs WITHOUT the Metro dev server (real-world install).
#
#   npm run android:release
#
# Environment:
#   SPINY_ANDROID_ARCH   target ABI(s), default "arm64-v8a"
#                        (use "armeabi-v7a,arm64-v8a,x86,x86_64" for all)
#   SPINY_PREBUILD=1     force `expo prebuild` even if android/ already exists
#                        (needed after changing icons, app.json or plugins)
#   SPINY_JDK17_HOME     explicit JDK 17 path (see scripts/resolve-jdk17.sh)
#
# Note: the release variant is signed with the debug keystore for easy local
# installs. Generate a real keystore before publishing to the Play Store.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

ARCH="${SPINY_ANDROID_ARCH:-arm64-v8a}"
JAVA_HOME="$(bash "$ROOT/scripts/resolve-jdk17.sh")"
export JAVA_HOME
echo "Using JAVA_HOME=$JAVA_HOME"
echo "Target ABI(s): $ARCH"

# android/ is gitignored (Expo Continuous Native Generation). Regenerate it when
# missing, or when explicitly requested after a config/icon change.
if [ ! -d android ] || [ "${SPINY_PREBUILD:-0}" = "1" ]; then
  echo "==> expo prebuild -p android"
  npx expo prebuild -p android
fi

echo "==> gradlew :app:installRelease"
cd android
./gradlew :app:installRelease -PreactNativeArchitectures="$ARCH"

echo
echo "Installed. Launch it from the device, or:"
echo "  adb shell monkey -p com.spiny.app -c android.intent.category.LAUNCHER 1"
