#!/bin/bash
DOC_ID="6ef06c29-aeee-4495-a803-12ad6988a063"
B="/opt/gmao-iris/backend"

echo "=== 1. FICHIER SUR DISQUE ==="
find "$B/uploads/documents" -name "${DOC_ID}*" 2>/dev/null && echo "TROUVE" || echo "ABSENT"

echo "=== 2. LISTE UPLOADS ==="
ls "$B/uploads/documents/" 2>/dev/null

echo "=== 3. CODE DEPLOYE ==="
grep -c "BACKEND_DIR" "$B/documentations_routes.py" 2>/dev/null && echo "OK corrige" || echo "PAS corrige - git pull requis"

echo "=== 4. DATE FICHIER ==="
stat -c "%y" "$B/documentations_routes.py" 2>/dev/null

echo "DONE"
