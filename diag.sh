#!/bin/bash
# Diagnostic rapide — aucune dépendance Python requise
# Usage : bash /tmp/diag.sh

DOC_ID="6ef06c29-aeee-4495-a803-12ad6988a063"
BACKEND="/opt/gmao-iris/backend"
UPLOADS="$BACKEND/uploads/documents"

echo "=============================================="
echo "DIAGNOSTIC DOCUMENT 404"
echo "ID : $DOC_ID"
echo "=============================================="

# ── 1. Fichier sur le disque ──
echo ""
echo "1. Recherche du fichier sur le disque..."
FOUND=$(find "$UPLOADS" -name "${DOC_ID}*" 2>/dev/null)
if [ -n "$FOUND" ]; then
    echo "   OK FICHIER TROUVE : $FOUND"
    SIZE=$(du -h "$FOUND" | cut -f1)
    echo "   Taille : $SIZE"
else
    echo "   ABSENT : aucun fichier commencant par $DOC_ID dans $UPLOADS"
fi

echo ""
echo "2. Contenu complet de $UPLOADS :"
ls -lh "$UPLOADS" 2>/dev/null || echo "   Dossier introuvable : $UPLOADS"

# ── 2. Chemin backend codé en dur ──
echo ""
echo "3. Test du chemin codé en dur /app/backend :"
OLDPATH="/app/backend/uploads/documents/${DOC_ID}"
if ls /app/backend/uploads/documents/${DOC_ID}* 2>/dev/null; then
    echo "   OK fichier trouvé dans /app/backend"
else
    echo "   ABSENT dans /app/backend (normal si install dans /opt)"
fi

# ── 3. Vérifier la config backend ──
echo ""
echo "4. Verification BACKEND_DIR dans documentations_routes.py :"
grep -n "BACKEND_DIR\|/app/backend" "$BACKEND/documentations_routes.py" 2>/dev/null | head -10
if ! grep -q "BACKEND_DIR" "$BACKEND/documentations_routes.py" 2>/dev/null; then
    echo "   PROBLEME : BACKEND_DIR non present => chemin /app/backend toujours codé en dur"
    echo "   SOLUTION : git pull pour deployer la correction"
else
    echo "   OK : BACKEND_DIR present dans le code"
fi

# ── 4. MongoDB via mongosh si dispo ──
echo ""
echo "5. Requete MongoDB (necessite mongosh)..."
if command -v mongosh &>/dev/null; then
    MONGO_URL=$(grep MONGO_URL "$BACKEND/.env" 2>/dev/null | cut -d'=' -f2)
    DB_NAME=$(grep DB_NAME "$BACKEND/.env" 2>/dev/null | cut -d'=' -f2)
    DB_NAME=${DB_NAME:-gmao_iris}
    mongosh "$MONGO_URL" --quiet --eval "
        db = db.getSiblingDB('$DB_NAME');
        var doc = db.documents.findOne({id: '$DOC_ID'});
        if (doc) {
            print('OK DOCUMENT TROUVE EN BASE');
            print('fichier_url : ' + doc.fichier_url);
            print('fichier_nom : ' + doc.fichier_nom);
        } else {
            print('NON TROUVE en base par id');
            print('Total documents : ' + db.documents.countDocuments());
        }
    " 2>/dev/null
elif command -v mongo &>/dev/null; then
    MONGO_URL=$(grep MONGO_URL "$BACKEND/.env" 2>/dev/null | cut -d'=' -f2)
    DB_NAME=$(grep DB_NAME "$BACKEND/.env" 2>/dev/null | cut -d'=' -f2)
    DB_NAME=${DB_NAME:-gmao_iris}
    mongo "$MONGO_URL" --quiet --eval "
        db = db.getSiblingDB('$DB_NAME');
        var doc = db.documents.findOne({id: '$DOC_ID'});
        if (doc) { print('OK : ' + doc.fichier_url); }
        else { print('NON TROUVE - total: ' + db.documents.count()); }
    " 2>/dev/null
else
    echo "   mongosh/mongo non disponible — verifier manuellement"
fi

# ── 5. Version du code déployé ──
echo ""
echo "6. Derniere modification de documentations_routes.py :"
stat -c "   Modifie le : %y" "$BACKEND/documentations_routes.py" 2>/dev/null

echo ""
echo "=============================================="
echo "FIN DU DIAGNOSTIC"
echo "=============================================="
