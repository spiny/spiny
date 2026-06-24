#!/usr/bin/env bash
#
# Resolve a JDK 17 home, required by the Expo / Android Gradle toolchain.
# (Newer JDKs enable native-access restrictions that break the CMake step.)
#
# Order of resolution:
#   1. $SPINY_JDK17_HOME            (explicit override)
#   2. $JAVA_HOME                   (if it is a 17.x JDK)
#   3. common install locations     (~/.local/jdks, /usr/lib/jvm, SDKMAN, brew)
#
# Prints the resolved path on stdout, or exits non-zero with guidance.
set -euo pipefail

is_jdk17() {
  [ -x "$1/bin/javac" ] || return 1
  "$1/bin/javac" -version 2>&1 | grep -q ' 17\.'
}

# 1. explicit override
if [ -n "${SPINY_JDK17_HOME:-}" ] && is_jdk17 "$SPINY_JDK17_HOME"; then
  echo "$SPINY_JDK17_HOME"; exit 0
fi

# 2. current JAVA_HOME
if [ -n "${JAVA_HOME:-}" ] && is_jdk17 "$JAVA_HOME"; then
  echo "$JAVA_HOME"; exit 0
fi

# 3. scan common locations
for d in \
  "$HOME"/.local/jdks/jdk-17* \
  "$HOME"/.sdkman/candidates/java/17* \
  /usr/lib/jvm/*17* \
  /usr/lib/jvm/temurin-17* \
  /Library/Java/JavaVirtualMachines/*17*/Contents/Home \
  "$HOME"/Library/Java/JavaVirtualMachines/*17*/Contents/Home; do
  [ -d "$d" ] || continue
  if is_jdk17 "$d"; then echo "$d"; exit 0; fi
done

cat >&2 <<'EOF'
error: could not find a JDK 17 installation.

Spiny's Android build requires JDK 17. Install Temurin 17, then either:
  - export SPINY_JDK17_HOME=/path/to/jdk-17   (used by Spiny scripts), or
  - export JAVA_HOME=/path/to/jdk-17

Temurin 17: https://adoptium.net/temurin/releases/?version=17
EOF
exit 1
