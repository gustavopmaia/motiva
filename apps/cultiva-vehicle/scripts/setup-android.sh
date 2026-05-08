#!/usr/bin/env bash
# Run once after cloning to generate the Gradle wrapper JAR.
# Requires Gradle 8.8+ to be installed: https://gradle.org/install/
set -e

cd "$(dirname "$0")/../android"

if command -v gradle &>/dev/null; then
    gradle wrapper --gradle-version 8.8
    echo "Gradle wrapper ready."
else
    echo "ERROR: 'gradle' not found. Install it with 'brew install gradle' and re-run."
    exit 1
fi
