# Release Process

## Prerequisites

- Node.js ≥ 18
- npm ≥ 9
- `sha256sum` / `sha512sum` available (`brew install coreutils` on macOS)
- GitHub Personal Access Token with `repo` scope

## Creating a Release

### 1. Update the version

```bash
npm version patch   # 1.0.0 → 1.0.1
npm version minor   # 1.0.0 → 1.1.0
npm version major   # 1.0.0 → 2.0.0
```

### 2. Build and package

```bash
./scripts/create-release.sh
```

This produces:
- `cloudtrail-mcp-v<VERSION>.tar.gz` – release archive (includes `node_modules`)
- `cloudtrail-mcp-v<VERSION>.tar.gz.sha256`
- `cloudtrail-mcp-v<VERSION>.tar.gz.sha512`

### 3. Create GitHub Release and upload assets

```bash
VERSION=$(node -p "require('./package.json').version")
ARCHIVE="cloudtrail-mcp-v${VERSION}.tar.gz"
GH_TOKEN="<your-github-token>"
REPO="TocharianOU/cloudtrail-mcp"

# Create release
RELEASE_ID=$(curl -s -X POST \
  -H "Authorization: token ${GH_TOKEN}" \
  -H "Content-Type: application/json" \
  "https://api.github.com/repos/${REPO}/releases" \
  -d "{\"tag_name\":\"v${VERSION}\",\"name\":\"v${VERSION}\",\"body\":\"CloudTrail MCP Server v${VERSION}\"}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")

# Upload archive
curl -s -X POST \
  -H "Authorization: token ${GH_TOKEN}" \
  -H "Content-Type: application/gzip" \
  --data-binary @"${ARCHIVE}" \
  "https://uploads.github.com/repos/${REPO}/releases/${RELEASE_ID}/assets?name=${ARCHIVE}"

# Upload checksums
curl -s -X POST \
  -H "Authorization: token ${GH_TOKEN}" \
  -H "Content-Type: text/plain" \
  --data-binary @"${ARCHIVE}.sha256" \
  "https://uploads.github.com/repos/${REPO}/releases/${RELEASE_ID}/assets?name=${ARCHIVE}.sha256"

curl -s -X POST \
  -H "Authorization: token ${GH_TOKEN}" \
  -H "Content-Type: text/plain" \
  --data-binary @"${ARCHIVE}.sha512" \
  "https://uploads.github.com/repos/${REPO}/releases/${RELEASE_ID}/assets?name=${ARCHIVE}.sha512"
```

### 4. Push git tag

```bash
git add -A && git commit -m "chore: release v${VERSION}"
git tag "v${VERSION}"
git push origin main --tags
```
