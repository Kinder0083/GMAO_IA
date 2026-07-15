# Audit de la section Mise à jour - FSAO Iris

## 1. Correction importante

La stratégie retenue pour la mise à jour applicative est désormais clarifiée :

> **La mise à jour doit rester pilotable depuis l'interface graphique de FSAO Iris et s'exécuter dans le conteneur LXC applicatif.**

Aucune action normale de mise à jour applicative ne doit nécessiter une intervention sur l'hôte Proxmox.

Les scripts de création ou d'administration Proxmox peuvent rester utiles pour une installation neuve ou une maintenance avancée, mais ils ne doivent pas remplacer le bouton de mise à jour graphique de l'application.

## 2. Ancienne situation

La section **Mise à jour** existait déjà avant la refonte.

Elle reposait principalement sur :

- `backend/update_service.py` ;
- `backend/update_manager.py` ;
- `backend/routes/update_management.py` ;
- `backend/routes/update_routes.py` ;
- `frontend/src/pages/Updates.jsx` ;
- le script racine `MAJ_FSAO.sh`.

L'ancien fonctionnement était orienté interface graphique, mais plusieurs points étaient à améliorer :

- dépôt Git encore pointé vers `GMAO` au lieu de `GMAO_IA` ;
- base MongoDB encore parfois codée en dur `gmao_iris` ;
- sauvegardes applicatives insuffisamment explicites ;
- pré-vérification absente ou incomplète ;
- restauration `.env` fragile ;
- chemin venv parfois incohérent ;
- confusion entre rollback applicatif, rollback MongoDB et rollback Git ;
- messages utilisateur insuffisamment clairs.

## 3. Stratégie officielle retenue

La stratégie officielle de mise à jour est :

1. l'administrateur ouvre la page **Mise à jour** dans l'application ;
2. il clique sur **Vérifier** ;
3. il clique sur **Pré-vérifier** pour valider les prérequis du LXC ;
4. il clique sur **Mettre à jour maintenant** ;
5. le backend lance `MAJ_FSAO.sh` dans le conteneur LXC ;
6. le script prévient les utilisateurs, active la maintenance, sauvegarde MongoDB, sauvegarde l'application, récupère le code depuis GitHub, restaure les `.env`, reconstruit backend/frontend, redémarre les services ;
7. l'interface suit les logs et relit le résultat.

Flux attendu :

```text
Interface FSAO Iris
        ↓
Backend FastAPI dans le LXC
        ↓
MAJ_FSAO.sh dans le LXC
        ↓
GitHub + build + supervisor/nginx
```

## 4. Actions appliquées côté script

`MAJ_FSAO.sh` a été rétabli comme script central de mise à jour applicative dans le LXC.

Améliorations appliquées :

- ajout du mode `--check` ;
- dépôt par défaut corrigé vers `Kinder0083/GMAO_IA` ;
- lecture de `DB_NAME` depuis `backend/.env`, avec fallback `fsao_iris` ;
- support d'un accès GitHub via `GITHUB_TOKEN`, `gh auth` ou URL Git déjà configurée ;
- sauvegarde MongoDB locale ;
- sauvegarde applicative locale dans `backend/../backups` ;
- sauvegarde et restauration des fichiers `.env` ;
- build frontend avec restauration de l'ancien build en cas d'échec ;
- redémarrage applicatif via `supervisorctl` et rechargement NGINX ;
- écriture du résultat dans `/var/log/gmao-iris-update-result.json` ;
- aucune commande `pct` ;
- aucune action sur l'hôte Proxmox.

## 5. Actions appliquées côté backend

`backend/routes/update_routes.py` a été réaligné sur le modèle LXC.

Endpoints utiles :

### `GET /api/updates/deployment-workflow`

Retourne le workflow courant :

- mode `lxc_in_app` ;
- exécution depuis l'interface graphique ;
- chemin du script `MAJ_FSAO.sh` ;
- notes sur l'accès GitHub requis dans le conteneur.

### `POST /api/updates/precheck`

Lance :

```bash
bash MAJ_FSAO.sh --check
```

directement dans le LXC.

### `GET /api/updates/app-backups`

Liste les sauvegardes locales créées dans :

```bash
/opt/gmao-iris/backups
```

### `POST /api/updates/apply`

Déjà fourni par `backend/routes/update_management.py`, il reste le point d'entrée principal appelé par l'interface.

Il déclenche :

```bash
bash MAJ_FSAO.sh <version> <update_id>
```

via `backend/update_service.py`.

## 6. Actions appliquées côté frontend

`frontend/src/pages/Updates.jsx` a été corrigé pour redevenir une interface graphique de mise à jour.

L'interface affiche maintenant :

- version actuelle ;
- dernière version détectée ;
- mode `lxc_in_app` ;
- bouton **Vérifier** ;
- bouton **Pré-vérifier** ;
- bouton **Mettre à jour maintenant** ;
- suivi de lancement ;
- logs serveur ;
- sauvegardes locales ;
- nouveautés ;
- historique des mises à jour.

Les commandes Proxmox affichées précédemment ont été retirées du flux principal.

## 7. Point de vigilance restant

Le dépôt étant privé, le conteneur LXC doit avoir un accès GitHub valide.

Solutions compatibles :

- variable `GITHUB_TOKEN` dans `backend/.env` ;
- GitHub CLI déjà authentifié dans le LXC ;
- URL SSH avec clé configurée dans le LXC ;
- URL Git personnalisée via `GITHUB_URL`.

Pour un utilisateur novice, la suite logique sera d'ajouter dans l'interface une page de configuration guidée de l'accès GitHub, avec test d'accès et stockage contrôlé des paramètres nécessaires.

## 8. Recommandation

La page **Mise à jour** doit rester un bouton d'exploitation simple, mais elle doit être accompagnée de contrôles robustes :

1. pré-check obligatoire ou fortement conseillé ;
2. message clair si l'accès GitHub est absent ;
3. logs lisibles ;
4. sauvegardes visibles ;
5. distinction entre sauvegarde applicative et sauvegarde MongoDB ;
6. possibilité future de configurer GitHub directement depuis l'interface.
