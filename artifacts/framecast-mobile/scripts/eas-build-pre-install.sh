#!/usr/bin/env bash
set -euo pipefail

if [[ "${EAS_BUILD_PLATFORM:-}" != "ios" ]]; then
  echo "Skipping iOS-only CMake setup for platform: ${EAS_BUILD_PLATFORM:-unknown}"
  exit 0
fi

if command -v cmake >/dev/null 2>&1; then
  echo "CMake is already installed:"
  cmake --version
  exit 0
fi

if ! command -v brew >/dev/null 2>&1; then
  echo "CMake is required by @dr.pogodin/react-native-static-server, but Homebrew is unavailable." >&2
  exit 1
fi

echo "Installing CMake required by @dr.pogodin/react-native-static-server..."
HOMEBREW_NO_AUTO_UPDATE=1 brew install cmake
cmake --version
