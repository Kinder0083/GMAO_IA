#!/bin/bash
# post-build.sh - A executer apres chaque yarn build
# Met a jour les timestamps dans sw.js et version.json pour forcer le cache-busting

BUILD_DIR="${1:-build}"
TIMESTAMP=$(date +%s)
BUILD_DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

echo "[post-build] Version: $TIMESTAMP ($BUILD_DATE)"

# Mettre a jour version.json
if [ -f "$BUILD_DIR/version.json" ]; then
  sed -i "s/__BUILD_TIMESTAMP__/$TIMESTAMP/g" "$BUILD_DIR/version.json"
  sed -i "s/__BUILD_DATE__/$BUILD_DATE/g" "$BUILD_DIR/version.json"
  echo "[post-build] version.json mis a jour"
fi

# Mettre a jour sw.js avec le timestamp de build
if [ -f "$BUILD_DIR/sw.js" ]; then
  sed -i "s/__BUILD_TIMESTAMP__/$TIMESTAMP/g" "$BUILD_DIR/sw.js"
  echo "[post-build] sw.js mis a jour (version: $TIMESTAMP)"
fi

# Verifier que offline.html est present dans le build
if [ -f "$BUILD_DIR/offline.html" ]; then
  echo "[post-build] offline.html present"
else
  echo "[post-build] ATTENTION: offline.html manquant!"
fi

echo "[post-build] Cache-busting + offline configure avec succes"
