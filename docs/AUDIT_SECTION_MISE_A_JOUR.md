# Audit de la section Mise à jour - FSAO Iris

## 1. Constat

La section **Mise à jour** de l'application existait déjà avant la refonte des scripts de déploiement.

Elle reposait principalement sur trois blocs :

- `backend/update_service.py` ;
- `backend/update_manager.py` ;
- `backend/routes/update_management.py` et `backend/routes/update_routes.py` ;
- `frontend/src/pages/Updates.jsx`.

L'ancienne philosophie était orientée :

- dépôt Git local dans `/opt/gmao-iris` ;
- détection de conflits Git ;
- `git pull` ou rollback Git ;
- lancement d'un ancien script `MAJ_FSAO.sh` ;
- logs de mise à jour relus après redémarrage.

Cette logique n'est plus cohérente avec la nouvelle stratégie retenue.

## 2. Nouvelle stratégie officielle

Depuis la refonte, la stratégie officielle est :

1. lancer les actions lourdes depuis l'hôte Proxmox ;
2. récupérer la source depuis GitHub ou une archive locale ;
3. créer une archive propre sans `.git` ;
4. transférer l'archive dans le conteneur LXC ;
5. préserver les fichiers `.env` ;
6. préparer la nouvelle version en staging ;
7. sauvegarder l'ancienne application ;
8. basculer uniquement après build réussi ;
9. utiliser `gmao-iris-rollback.sh` pour revenir en arrière.

Scripts associés :

```bash
./gmao-iris-install.sh --check
./gmao-iris-install.sh
./gmao-iris-update.sh --check
./gmao-iris-update.sh
./gmao-iris-rollback.sh
```

## 3. Point important : limite technique de l'application

L'application tourne normalement **dans le conteneur LXC**.

Or les scripts `gmao-iris-install.sh`, `gmao-iris-update.sh` et `gmao-iris-rollback.sh` pilotent Proxmox avec `pct`.

Donc, sauf cas particulier où l'API tournerait directement sur l'hôte Proxmox, l'application ne doit pas tenter d'exécuter elle-même ces scripts.

Elle doit plutôt :

- afficher la stratégie de mise à jour ;
- expliquer que l'action se lance depuis l'hôte Proxmox ;
- fournir les commandes exactes ;
- afficher les sauvegardes applicatives disponibles ;
- distinguer rollback applicatif et rollback MongoDB.

## 4. Actions appliquées côté backend

Le fichier `backend/routes/update_routes.py` a été complété avec une passerelle vers le workflow archive Proxmox.

Nouveaux apports :

### `GET /api/updates/deployment-workflow`

Retourne :

- le mode de déploiement courant : `archive_proxmox` ;
- les chemins techniques ;
- les scripts attendus ;
- les commandes recommandées ;
- l'information `can_execute_from_app` ;
- l'information `requires_proxmox_host`.

### `POST /api/updates/archive-precheck`

Si l'API a accès à `pct`, le endpoint peut lancer :

```bash
./gmao-iris-update.sh --check
```

Sinon, il retourne clairement que la pré-vérification doit être exécutée depuis l'hôte Proxmox.

### `GET /api/updates/archive-backups`

Liste les sauvegardes applicatives créées par :

```bash
./gmao-iris-update.sh
```

Chemin recherché :

```bash
/opt/gmao-iris-backups/<timestamp>/app
```

### Adaptation de `GET /api/updates/check`

La réponse inclut maintenant `deployment_workflow`, ce qui permet au frontend d'afficher la stratégie officielle de mise à jour.

### Adaptation de `GET /api/updates/git-history`

Si aucun dépôt Git local n'est présent, le endpoint indique explicitement qu'il s'agit probablement d'un déploiement par archive.

### Adaptation de `POST /api/updates/git-rollback`

Si `.git` est absent, le endpoint ne tente plus un rollback Git et renvoie la commande correcte :

```bash
chmod +x gmao-iris-rollback.sh && ./gmao-iris-rollback.sh
```

## 5. Actions appliquées côté frontend

Le fichier `frontend/src/pages/Updates.jsx` a été adapté au nouveau workflow.

L'interface affiche désormais :

- la version actuelle ;
- la dernière version détectée ;
- le mode de déploiement `archive_proxmox` ;
- un message clair indiquant si l'action doit être lancée depuis l'hôte Proxmox ;
- les commandes copiables pour l'installation, la mise à jour et le rollback applicatif ;
- un bouton de pré-vérification qui appelle `POST /api/updates/archive-precheck` ;
- la sortie du pré-check quand elle est disponible ;
- les sauvegardes applicatives via `GET /api/updates/archive-backups` ;
- les logs serveur ;
- les nouveautés et l'historique de mise à jour.

Les éléments suivants ont été retirés de l'interface principale :

- bouton magique `Mettre à jour maintenant` ;
- dialogue de résolution de conflits Git ;
- historique Git comme chemin principal ;
- rollback Git comme action principale ;
- attente automatique de redémarrage backend après mise à jour.

## 6. Risques identifiés

### Ancien script `MAJ_FSAO.sh`

`backend/update_service.py` cherche encore un script `MAJ_FSAO.sh` pour appliquer une mise à jour.

Cette logique est obsolète avec le workflow archive Proxmox.

Elle doit être remplacée ou neutralisée dans une prochaine passe.

### Dépôt Git local absent

Avec le déploiement par archive, `/opt/gmao-iris/.git` est absent.

Les fonctions de conflit Git, historique Git et rollback Git doivent donc être considérées comme compatibles uniquement avec les anciennes installations.

### Rollback MongoDB vs rollback applicatif

L'ancien endpoint `/api/updates/rollback` restaure MongoDB.

Le nouveau `gmao-iris-rollback.sh` restaure uniquement les fichiers applicatifs.

L'interface distingue maintenant le rollback applicatif, mais l'ancien rollback MongoDB reste présent côté backend pour compatibilité historique.

## 7. Recommandation

La section Mise à jour doit rester un tableau de bord de pilotage et d'assistance, pas un bouton magique qui lance des commandes Proxmox depuis le conteneur.

Pour une installation novice et fiable, le bon flux est :

1. l'application indique qu'une version est disponible ;
2. elle affiche les commandes Proxmox exactes ;
3. l'utilisateur lance la mise à jour depuis l'hôte Proxmox ;
4. l'application relit ensuite l'état, la version et les logs disponibles.

## 8. Prochaine passe conseillée

Neutraliser ou remplacer proprement l'ancienne méthode `UpdateService.apply_update()` qui cherche `MAJ_FSAO.sh`, pour éviter qu'un ancien endpoint ou appel futur puisse relancer la mauvaise logique.
