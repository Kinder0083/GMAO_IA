# Scripts de déploiement et de mise à jour - FSAO Iris

Ce document décrit les scripts de déploiement, de mise à jour et de rollback présents dans le dépôt.

Les chemins techniques historiques restent volontairement basés sur `gmao-iris` pour ne pas casser les habitudes ou les installations existantes, mais le nom produit affiché est **FSAO Iris**.

## Vue d'ensemble

| Script / fonction | Rôle | Cible |
|---|---|---|
| Page **Mise à jour** de l'application | Vérifier, préparer, lancer la mise à jour et restaurer une sauvegarde | Interface graphique / conteneur LXC |
| `MAJ_FSAO.sh` | Script exécuté par l'interface pour mettre à jour l'application | Conteneur LXC |
| `gmao-iris-install.sh` | Installation complète d'un nouveau conteneur LXC | Hôte Proxmox |
| `gmao-iris-update.sh` | Mise à jour avancée par archive, conservée en secours | Hôte Proxmox |
| `gmao-iris-rollback.sh` | Restauration avancée par archive, conservée en secours | Hôte Proxmox |
| `gmao-ssl-gdrive-setup.sh` | HTTPS, Nginx et sauvegarde Google Drive | Conteneur ou post-install selon usage |
| `scripts/audit-cleanup.sh` | Audit rapide des traces sensibles ou obsolètes | Dépôt local |

## 1. Flux recommandé : interface graphique

Le flux normal pour un administrateur est la page :

```text
Mise à jour
```

Elle permet de :

1. choisir le dépôt GitHub ;
2. choisir la branche ;
3. tester séparément l'accès API GitHub et l'accès `git fetch` ;
4. lancer une pré-vérification dans le conteneur LXC ;
5. lancer la mise à jour ;
6. suivre les logs ;
7. restaurer une sauvegarde applicative locale si nécessaire.

Le dépôt et la branche configurés dans l'interface sont utilisés pour la détection des mises à jour et pour la mise à jour réellement appliquée.

Pour plus de détails :

```text
docs/MISE_A_JOUR_INTERFACE.md
```

## 2. `MAJ_FSAO.sh`

Script principal de mise à jour exécuté par l'interface graphique dans le conteneur LXC.

### Mode pré-vérification

```bash
./MAJ_FSAO.sh --check
```

Ce mode vérifie notamment :

- les dossiers applicatifs ;
- la présence des commandes nécessaires ;
- l'accès Git au dépôt configuré ;
- l'espace disque disponible.

### Mise à jour

L'interface lance automatiquement :

```bash
./MAJ_FSAO.sh <version> <update_id>
```

Le script réalise :

- activation de la page de maintenance ;
- sauvegarde MongoDB si `mongodump` est disponible ;
- sauvegarde applicative locale ;
- sauvegarde des fichiers `.env` ;
- récupération du code depuis le dépôt et la branche configurés ;
- validation minimale de la branche distante ;
- restauration des fichiers persistants ;
- installation des dépendances ;
- reconstruction frontend ;
- redémarrage backend et rechargement Nginx.

La branche distante doit contenir au minimum :

```text
updates/version.json
backend/
frontend/
MAJ_FSAO.sh
```

Sinon la mise à jour est refusée avant le `git reset --hard`.

## 3. Dépôt privé GitHub

Si le dépôt est privé, le conteneur LXC doit posséder un accès valide.

La page **Mise à jour** affiche :

- API GitHub : OK / erreur ;
- Git fetch / ls-remote : OK / erreur ;
- authentification GitHub détectée ou non.

Deux approches sont possibles :

- authentification GitHub côté backend pour la détection automatique ;
- clé SSH/deploy key en lecture seule pour le `git fetch`.

L'interface ne doit jamais afficher de secret.

## 4. Rollback depuis l'interface

La section **Sauvegardes locales** liste les sauvegardes applicatives créées avant mise à jour.

Le bouton :

```text
Restaurer cette sauvegarde
```

lance une restauration applicative dans le conteneur LXC.

Limite importante : ce rollback restaure les fichiers applicatifs, mais ne restaure pas automatiquement MongoDB.

## 5. `gmao-iris-install.sh`

Script d'installation principal pour une cible **Proxmox LXC / Debian 12**.

Avant toute installation :

```bash
./gmao-iris-install.sh --check
```

Le script réalise notamment :

- création d'un conteneur LXC Debian 12 ;
- installation des dépendances système ;
- installation de Node.js, Python, Nginx, Supervisor et MongoDB ;
- préparation de l'application ;
- génération de `backend/.env` ;
- création interactive du compte administrateur principal ;
- compilation du frontend ;
- configuration Supervisor ;
- configuration Nginx.

## 6. `gmao-iris-update.sh` et `gmao-iris-rollback.sh`

Ces scripts sont conservés comme outils avancés de secours côté hôte Proxmox.

Ils ne sont pas le flux recommandé pour un administrateur novice, car le flux recommandé est désormais l'interface graphique de l'application.

## 7. `gmao-ssl-gdrive-setup.sh`

Script post-installation pour :

- installer ou vérifier Certbot ;
- obtenir un certificat Let's Encrypt ;
- générer une configuration Nginx HTTPS ;
- mettre à jour `backend/.env` ;
- configurer Google Drive pour les sauvegardes ;
- redémarrer et tester le backend.

Le script conserve les chemins techniques historiques :

```bash
/opt/gmao-iris
/etc/nginx/sites-available/gmao-iris
gmao-iris-backend
```

## 8. Guides complémentaires

- `docs/INSTALLATION_NOVICE.md` : installation pas à pas ;
- `docs/MISE_A_JOUR_NOVICE.md` : mise à jour et rollback pas à pas ;
- `docs/MISE_A_JOUR_INTERFACE.md` : fonctionnement de la page Mise à jour.

## 9. Bonnes pratiques avant mise à jour

1. vérifier le dépôt actif ;
2. vérifier la branche active ;
3. tester les accès API GitHub et Git fetch ;
4. lancer la pré-vérification ;
5. lire les logs ;
6. conserver une sauvegarde applicative récente ;
7. sauvegarder MongoDB avant une opération importante.

## 10. Limites actuelles

- Le rollback applicatif ne restaure pas automatiquement MongoDB.
- Les migrations MongoDB dédiées ne sont pas encore gérées par un moteur de migration versionné.
- Le flux doit encore être validé dans ton vrai conteneur LXC avant usage en production.
