# SKILL: GMAO FSAO Iris — Assistant de Développement

## Quand utiliser ce skill

Active ce skill automatiquement quand :
- Tu travailles sur des fichiers dans `/app/backend/` ou `/app/frontend/`
- L'utilisateur mentionne GMAO, FSAO Iris, OT, DI, DA, équipements, maintenance
- Tu dois créer une nouvelle route, composant, ou corriger un bug dans ce projet
- Tu fais un déploiement ou une migration de base de données

---

## Contexte du projet

**GMAO FSAO Iris** est une application de Gestion de Maintenance Assistée par Ordinateur (CMMS) complète déployée sur un container LXC Proxmox.

- **Stack** : React 18 (port 3000) + FastAPI (port 8001) + MongoDB (`gmao_iris`)
- **Déploiement** : Container LXC Proxmox Debian 12. Le code vient de GitHub via `git pull`. Pas de Docker.
- **Langue utilisateur** : 🇫🇷 Français — toujours répondre, commenter et committer en français
- **Préférence utilisateur** : Modifications dans le code existant → toujours tester → fournir les commandes SSH de déploiement production

---

## Architecture backend

```
/app/backend/
├── server.py                    # Point d'entrée FastAPI, enregistrement des routers
├── models.py                    # Tous les modèles Pydantic (3800+ lignes)
├── dependencies.py              # get_current_user, get_current_admin_user, require_permission
├── routes/
│   ├── shared.py                # ⭐ Utilitaires communs (voir section dédiée)
│   ├── work_orders.py           # OT (Ordres de Travail)
│   ├── intervention_requests.py # DI (Demandes d'Intervention)
│   ├── improvements.py          # DA + Améliorations
│   ├── equipments.py            # Équipements (parent/enfant)
│   ├── users.py
│   ├── locations.py
│   ├── notifications.py         # Notifications + Web Push (PWA)
│   ├── mongodb_backup.py        # Sauvegardes mongodump (nouvel onglet Import/Export)
│   └── ... (25+ routes)
├── ssh_routes.py                # Terminal SSH WebSocket (PTY)
├── web_push.py                  # Notifications push PWA (pywebpush)
├── mes_service.py               # Module MES temps réel (APScheduler)
├── backup_routes.py             # Sauvegardes JSON/Google Drive (existant)
└── migrate_db.py                # Script migration DB (normalization IDs/dates)
```

---

## ⭐ `routes/shared.py` — À connaître absolument

```python
from routes.shared import (
    db,                    # Motor AsyncIOMotorDatabase
    serialize_doc,         # ⚠️ Obligatoire avant tout retour MongoDB
    NOT_DELETED,           # Filtre documents non supprimés
    find_user_flexible,    # Cherche user par UUID ou ObjectId string
    get_equipment_by_id,   # Retourne {id, nom, parent_id?}
    get_location_by_id,    # Retourne {id, nom}
    get_user_by_id,        # Retourne user dict simplifié
    get_next_work_order_numero, # Compteur atomique (collection counters)
    audit_service,         # Journalisation des actions
)
```

### `serialize_doc(doc)` — Règle CRITIQUE

**Toujours appeler `serialize_doc(doc)` avant de retourner un document MongoDB.**

```python
# ✅ Correct
doc = await db.collection.find_one({"id": some_id})
doc = serialize_doc(doc)
return MyPydanticModel(**doc)

# ❌ INTERDIT — ObjectId non sérialisable → crash 500
doc = await db.collection.find_one({"id": some_id})
return doc
```

`serialize_doc` :
- Convertit `_id` (ObjectId) en `id` string
- Convertit récursivement tous les ObjectId en strings
- Ajoute `dateCreation` si absent
- Ajoute `attachments: []` si absent

### `NOT_DELETED` — Filtre standard

```python
NOT_DELETED = {"deleted_at": {"$in": [None, "", False, 0]}}

# Toujours utiliser pour les requêtes find()
query = {**NOT_DELETED, "statut": "OUVERT"}
async for doc in db.work_orders.find(query):
    ...
```

---

## Architecture frontend

```
/app/frontend/src/
├── services/api.js              # Tous les appels API (axios)
├── utils/config.js              # BACKEND_URL depuis REACT_APP_BACKEND_URL
├── hooks/
│   ├── usePermissions.js        # ⚠️ Fonctions stabilisées avec useCallback (bug boucle infinie corrigé)
│   ├── usePWA.js                # Notifications push PWA
│   └── useImprovementRequests.js
├── pages/                       # Pages principales (routing)
├── components/
│   ├── ui/                      # Shadcn UI (Button, Dialog, Select, Input...)
│   ├── WorkOrders/              # Formulaires OT
│   ├── InterventionRequests/    # Formulaires DI
│   ├── Improvements/            # Formulaires DA/Améliorations
│   ├── Dashboard/               # Widgets, raccourcis, drag & drop
│   └── Common/                  # ConsignePopup, composants partagés
└── public/sw.js                 # Service Worker PWA (notifications background)
```

### Variables d'environnement

```js
// ✅ Frontend — toujours utiliser
import { BACKEND_URL } from '../utils/config';
const API_BASE = `${BACKEND_URL}/api`;

// ✅ Backend — toujours utiliser
MONGO_URL = os.environ.get('MONGO_URL')
DB_NAME   = os.environ.get('DB_NAME', 'gmao_iris')
```

---

## Conventions code

### Backend FastAPI

```python
# Structure type d'un endpoint
@router.get("/ma-route", response_model=List[MonModele], tags=["Ma Section"])
async def get_items(
    current_user: dict = Depends(require_permission("maPermission", "view"))
):
    query = {**NOT_DELETED}
    items = []
    async for item in db.ma_collection.find(query).sort("date_creation", -1):
        item = serialize_doc(item)
        items.append(MonModele(**item))
    return items
```

### Frontend React

```jsx
// Pattern standard Select avec Shadcn
<Select
  value={formData.equipement_id || "none"}
  onValueChange={(value) => setFormData({...formData, equipement_id: value === "none" ? "" : value})}
>
  <SelectTrigger data-testid="mon-select">
    <SelectValue placeholder="Sélectionner..." />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="none">Aucun</SelectItem>
    {items.map(item => <SelectItem key={item.id} value={item.id}>{item.nom}</SelectItem>)}
  </SelectContent>
</Select>

// Toast (utiliser sonner)
import { useToast } from '../hooks/use-toast';
const { toast } = useToast();
toast({ title: 'Succès', description: 'Message' });
toast({ title: 'Erreur', description: 'Message', variant: 'destructive' });
```

### Règle data-testid

Chaque élément interactif ET chaque donnée critique visible par l'utilisateur doit avoir un `data-testid` unique en kebab-case :
```jsx
<Button data-testid="submit-ot-btn">Créer OT</Button>
<div data-testid="ot-statut-badge">{statut}</div>
```

---

## Équipements parent/enfant — Pattern clé

Ce pattern est utilisé dans **OT, DI, DA**. L'implémentation de référence est `WorkOrderFormDialog.jsx`.

```jsx
// 1. Charger les parents seulement
const equipRes = await equipmentsAPI.getParents(); // GET /equipments?parents_only=true

// 2. Charger les enfants à la sélection
const loadChildren = async (parentId) => {
  const res = await equipmentsAPI.getChildren(parentId); // GET /equipments/{id}/children
  setChildEquipments(res.data);
};

// 3. Auto-remplir l'emplacement
useEffect(() => {
  if (formData.equipement_id && equipments.length > 0) {
    const parent = equipments.find(eq => eq.id === formData.equipement_id);
    if (parent?.emplacement_id) {
      setFormData(prev => ({...prev, emplacement_id: parent.emplacement_id}));
    }
    loadChildren(parent.id);
  }
}, [formData.equipement_id, equipments]);

// 4. Submit — l'enfant prime sur le parent
const actualEquipementId = formData.sous_equipement_id || formData.equipement_id || null;

// 5. Mode édition — détecter parent vs enfant
const eqId = workOrder.equipement?.id || '';
let parentEqId = eqId;
let sousEqId = '';
if (workOrder.equipement?.parent_id) {
  parentEqId = workOrder.equipement.parent_id;
  sousEqId = eqId;
}
```

---

## Pièges connus et bugs récurrents

### ⚠️ ObjectId non sérialisable
**Symptôme** : `TypeError: Object of type ObjectId is not JSON serializable` → 500  
**Cause** : Oubli de `serialize_doc()` avant retour  
**Fix** : Toujours `doc = serialize_doc(doc)` avant `MonModele(**doc)`

### ⚠️ Boucle infinie React (Maximum update depth exceeded)
**Symptôme** : Écran blanc ou rechargement infini  
**Cause** : Fonctions créées inline dans `usePermissions.js` utilisées comme dépendances `useEffect`  
**Fix** : Toutes les fonctions dans `usePermissions.js` sont stabilisées avec `useCallback`. Ne jamais créer de nouvelles fonctions inline dans les dépendances d'effets.

### ⚠️ Doublons de numéros OT
**Cause** : Race condition sur le compteur  
**Fix** : Utiliser `get_next_work_order_numero()` (compteur atomique MongoDB, collection `counters`)

### ⚠️ Champ `deleted_at` legacy
**Cause** : Anciennes données ont `deleted_at: ""`, `false`, ou `0` au lieu de `null`  
**Fix** : Toujours utiliser `NOT_DELETED = {"deleted_at": {"$in": [None, "", False, 0]}}`  
**Ne jamais utiliser** : `{"deleted_at": None}` seul

### ⚠️ Datetime après migration DB
**Cause** : Migration DB a converti certains champs datetime en string ISO  
**Fix** : Dans `mes_service.py` et partout : `if isinstance(val, str): val = datetime.fromisoformat(val.replace('Z', '+00:00'))`

### ⚠️ Terminal SSH `/bin/login -f root`
**Cause** : Échoue sur Debian 12 (pam_securetty bloque root sur PTY)  
**Fix actuel** : `ssh_routes.py` utilise `pamela.authenticate()` + `/bin/bash` direct (ne pas revenir à `/bin/login -f`)

---

## Schéma MongoDB clé

```
Collections principales:
- work_orders        : {id:str, numero:str, statut:str, att_materiel_info, att_decision_info, ...}
- improvement_requests: {id:str, status:str, improvement_id:str|null, sous_equipement_id:str|null}
- improvements       : {id:str, numero:str, statut:str, equipement_id:str}
- intervention_requests: {id:str, equipement_id:str, sous_equipement_id:str|null, emplacement_id:str|null}
- equipments         : {id:str, nom:str, parent_id:str|null, emplacement_id:str|null, hasChildren:bool}
- users              : {id:str, email:str, role:str (ADMIN|TECHNICIEN|RESPONSABLE|OPERATEUR)}
- counters           : {_id:"work_order_numero", seq:int}
- web_push_subscriptions: {user_id:str, subscription:{endpoint,keys}, is_active:bool}
- widget_permissions : {widget_id:str, allowed_user_ids:[str]}
- user_preferences   : {user_id:str, preferences:{dashboard_layout:{items:[...]}, menu_categories:[...]}}

IDs : Format UUID string (str) après migration DB du 25 mars 2026
      Les _id restent en ObjectId BSON (serialize_doc s'en occupe)
```

---

## Déploiement production (Proxmox LXC)

L'utilisateur déploie manuellement depuis son serveur Proxmox. **Toujours fournir ces commandes après une modification.**

```bash
# 1. Dans l'interface Emergent → "Save to Github"
# 2. Sur le serveur Proxmox :
cd /chemin/vers/gmao-iris
git pull

# Si nouvelles dépendances Python :
pip install -r backend/requirements.txt

# Si nouvelles dépendances npm :
cd frontend && yarn install && cd ..

# Redémarrer les services
sudo supervisorctl restart backend
# ou backend + frontend si changements React :
sudo supervisorctl restart backend frontend
```

**Règles de déploiement** :
- Ne jamais modifier les ports (backend: 8001, frontend: 3000)
- Ne jamais changer `MONGO_URL` ni `DB_NAME` dans `.env`
- Le hot reload est actif en local — `supervisorctl restart` uniquement pour `.env` ou nouvelles dépendances

---

## Web Push / PWA

```python
# Déclencher une notification push
from web_push import send_web_push_to_user
await send_web_push_to_user(
    user_id="uuid-user",
    title="Titre notification",
    body="Corps du message",
    notification_type="new_consigne",  # ou: work_order_assigned, equipment_alert
    data={"url": "/chat-live"}
)
```

Le Service Worker (`/app/frontend/public/sw.js`) gère l'affichage en arrière-plan et les clics de navigation.

---

## Tests

```bash
# Credentials de test (local)
Admin : buenogy@gmail.com / TestAdmin2026!
Tech  : axel@gmail.com   / TestTech2026!

# Test API rapide
API_URL=$(grep REACT_APP_BACKEND_URL /app/frontend/.env | cut -d '=' -f2)
TOKEN=$(curl -s -X POST "$API_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"buenogy@gmail.com","password":"TestAdmin2026!"}' \
  | python3 -c "import sys,json;print(json.load(sys.stdin).get('access_token',''))")
curl -s "$API_URL/api/work-orders" -H "Authorization: Bearer $TOKEN" | python3 -m json.tool | head -20
```

Rapports de tests précédents : `/app/test_reports/iteration_*.json`

---

## Règles à suivre impérativement

1. **Langue** : Tous les commentaires, messages de commit, réponses → en **français**
2. **serialize_doc** : Obligatoire avant tout retour de document MongoDB
3. **NOT_DELETED** : Toujours utiliser ce filtre dans les requêtes find()
4. **data-testid** : Sur chaque élément interactif et donnée critique
5. **Shadcn UI** : Utiliser les composants de `/app/frontend/src/components/ui/`
6. **Ports** : Ne jamais changer backend (8001) ni frontend (3000)
7. **useCallback** : Stabiliser toutes les fonctions dans les hooks qui servent de dépendances useEffect
8. **pamela** : Ne pas revenir à `/bin/login -f` dans `ssh_routes.py`
9. **Déploiement** : Toujours fournir les commandes SSH Proxmox après modification
