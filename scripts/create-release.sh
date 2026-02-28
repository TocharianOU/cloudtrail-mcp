#!/usr/bin/env bash
set -euo pipefail

VERSION=$(node -p "require('./package.json').version")
ARCHIVE="cloudtrail-mcp-v${VERSION}.tar.gz"

echo "Building v${VERSION}..."
npm run build

echo "Creating release archive: ${ARCHIVE}"
tar -czf "${ARCHIVE}" dist logos node_modules LICENSE README.md server.json package.json

echo "Generating checksums..."
sha256sum "${ARCHIVE}" > "${ARCHIVE}.sha256"
sha512sum "${ARCHIVE}" > "${ARCHIVE}.sha512"

echo "Done! Release artifacts:"
ls -lh "${ARCHIVE}" "${ARCHIVE}.sha256" "${ARCHIVE}.sha512"
