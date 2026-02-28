#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# Copyright (c) 2024 TocharianOU Contributors
#
# Create a self-contained release archive (includes node_modules) with checksums.
# mcp-host downloads and extracts this; no npm install needed on the target machine.
#
# Usage:
#   ./scripts/create-release.sh
#
# Requirements:
#   - VERSION is read from package.json

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${ROOT_DIR}"

VERSION="$(node -pe "require('./package.json').version")"
ARCHIVE="cloudtrail-mcp-v${VERSION}.tar.gz"
CHECKSUM_FILE="cloudtrail-mcp-v${VERSION}.sha256"
SHA512_FILE="cloudtrail-mcp-v${VERSION}.sha512"
RELEASE_DIR="release-tmp"

echo "Building v${VERSION}..."
npm run build

echo "Preparing self-contained release directory..."
rm -rf "${RELEASE_DIR}"
mkdir -p "${RELEASE_DIR}"

cp -r dist "${RELEASE_DIR}/"
cp -r logos "${RELEASE_DIR}/"
cp package.json "${RELEASE_DIR}/"
cp package-lock.json "${RELEASE_DIR}/"
cp LICENSE "${RELEASE_DIR}/"
cp server.json "${RELEASE_DIR}/"
[ -f README.md ] && cp README.md "${RELEASE_DIR}/"
[ -f NOTICE ]    && cp NOTICE    "${RELEASE_DIR}/"

echo "Installing production dependencies..."
cd "${RELEASE_DIR}"
npm install --production --ignore-scripts --no-optional 2>/dev/null

echo "Cleaning up unnecessary files from node_modules..."
find node_modules -name "*.md"       -type f -delete 2>/dev/null || true
find node_modules -name "*.txt"      -type f -delete 2>/dev/null || true
find node_modules -name "LICENSE*"   -type f -delete 2>/dev/null || true
find node_modules -name ".npmignore" -type f -delete 2>/dev/null || true
find node_modules -name ".gitignore" -type f -delete 2>/dev/null || true
find node_modules -type d -name "test"     -exec rm -rf {} + 2>/dev/null || true
find node_modules -type d -name "tests"    -exec rm -rf {} + 2>/dev/null || true
find node_modules -type d -name "docs"     -exec rm -rf {} + 2>/dev/null || true
find node_modules -type d -name "examples" -exec rm -rf {} + 2>/dev/null || true

cd "${ROOT_DIR}"

echo "Creating archive ${ARCHIVE}..."
tar -czf "${ARCHIVE}" -C "${RELEASE_DIR}" .

echo "Cleaning up temporary directory..."
rm -rf "${RELEASE_DIR}"

echo "Generating checksums..."
shasum -a 256 "${ARCHIVE}" > "${CHECKSUM_FILE}"
shasum -a 512 "${ARCHIVE}" > "${SHA512_FILE}"

echo ""
echo "Release files created:"
echo "  ${ARCHIVE}"
echo "  ${CHECKSUM_FILE}"
echo "  ${SHA512_FILE}"
echo ""
echo "Verification:"
echo "  dist/index.js present: $(tar -tzf "${ARCHIVE}" | grep -c "^./dist/index.js" || echo 0)"
echo "  node_modules present:  $(tar -tzf "${ARCHIVE}" | grep -c "^./node_modules/" | head -1 || echo 0) files"
echo ""
cat "${CHECKSUM_FILE}"
