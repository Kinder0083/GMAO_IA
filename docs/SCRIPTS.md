# Scripts de déploiement - FSAO Iris

Ce document décrit les scripts de déploiement, de mise à jour et de rollback présents à la racine du dépôt.

Les chemins techniques historiques restent volontairement basés sur `gmao-iris` pour ne pas casser les habitudes ou les installations existantes, mais le nom produit affiché est **FSAO Iris**.

## Vue d'ensemble

| Script | Rôle | Cible |
|---|---|---|
| `gmao-iris-install.sh` | Installation complète d'un nouveau conteneur LXC | Hôte Proxmox |
| `gmao-iris-update.sh` | Mise à jour par archive d'une installation existante | Hôte Proxmox |
| `gmao-iris-rollback.sh` | Restauration d'une sauvegarde applicative | Hôte Proxmox |
| `gmao-ssl-gdrive-setup.sh` | HTTPS, Nginx et sauvegarde Google Drive | Conteneur ou post-install selon usage |
| `scripts/audit-cleanup.sh` | Audit rapide des traces sensibles ou obsolètes | Dépôt local |

## 1. `gmao-iris-install.sh`

Script d'installation principal pour une cible **Proxmox LXC / Debian 12**.

### Mode pré-vérification

Avant toute installation :

```bash
./gmao-iris-install.sh --check
```

Ce mode ne crée rien. Il vérifie notamment :

- exécution en root ;
- présence de Proxmox / `pct` ;
- disponibilité des commandes Proxmox essentielles ;
- support CPU AVX pour MongoDB 7 ;
- présence d'un bridge `vmbr` ;
- résolution DNS vers GitHub ;
- espace disque indicatif.

### Rôle du script

Le script réalise :

- création d'un conteneur LXC Debian 12 ;
- installation des dépendances système ;
- installation de Node.js, Python, Nginx, Supervisor et MongoDB ;
- arrêt de l'installation si le CPU ne supporte pas AVX ;
- choix guidé du mode d'accès au dépôt privé GitHub ;
- préparation d'une archive applicative sur l'hôte Proxmox ;
- transfert de cette archive dans le conteneur ;
- génération de `backend/.env` ;
- création interactive du compte administrateur principal ;
- création optionnelle d'un compte administrateur de secours ;
- installation optionnelle de `emergentintegrations` ;
- compilation du frontend ;
- configuration Supervisor ;
- configuration Nginx ;
- ouverture des ports nécessaires via UFW.

### Accès au dépôt privé GitHub

Le script propose quatre modes :

```text
1) Connexion guidée GitHub automatique - recommandé
2) Clé SSH déjà configurée
3) URL Git personnalisée
4) Archive locale déjà téléchargée
```

Le mode recommandé pour un novice est le mode 1. Il installe GitHub CLI si nécessaire, lance une connexion guidée et clone le dépôt depuis l'hôte Proxmox.

## 2. `gmao-iris-update.sh`

Script dédié à la **mise à jour par archive** d'une installation FSAO Iris existante.

### Mode pré-vérification

Avant une mise à jour :

```bash
./gmao-iris-update.sh --check
```

Ce mode ne remplace rien. Il vérifie que l'hôte Proxmox peut lister les conteneurs, joindre GitHub et préparer une mise à jour.

### Rôle du script

Le script réalise :

- sélection du conteneur LXC FSAO Iris existant ;
- choix guidé de la source de mise à jour avec les mêmes quatre méthodes que l'installation ;
- préparation d'une archive applicative sur l'hôte Proxmox ;
- transfert de l'archive dans le conteneur ;
- extraction dans un dossier de staging ;
- restauration des fichiers `backend/.env` et `frontend/.env` existants ;
- installation des dépendances backend ;
- compilation du frontend ;
- arrêt temporaire du backend Supervisor ;
- sauvegarde de l'ancienne installation ;
- bascule du staging vers `/opt/gmao-iris` ;
- redémarrage du backend et rechargement de Nginx.

### Sauvegarde

Avant remplacement, l'ancienne application est déplacée dans :

```bash
/opt/gmao-iris-backups/<timestamp>/app
```

Si la préparation échoue avant la bascule, l'ancienne version reste en place.

## 3. `gmao-iris-rollback.sh`

Script de restauration applicative après une mise à jour.

Il sert à revenir sur une version précédente sauvegardée par `gmao-iris-update.sh`.

Le script :

- liste les conteneurs LXC ;
- détecte le conteneur `gmao-iris` si possible ;
- liste les sauvegardes disponibles ;
- demande quelle sauvegarde restaurer ;
- arrête le backend ;
- conserve la version actuelle dans un dossier `pre-rollback` ;
- restaure la sauvegarde sélectionnée ;
- redémarre le backend ;
- recharge Nginx.

Limite importante : ce rollback restaure les fichiers applicatifs, mais ne restaure pas MongoDB.

## 4. `gmao-ssl-gdrive-setup.sh`

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

## 5. Guides novice

Deux guides complémentaires sont disponibles :

- `docs/INSTALLATION_NOVICE.md` : installation pas à pas ;
- `docs/MISE_A_JOUR_NOVICE.md` : mise à jour et rollback pas à pas.

## 6. Bonnes pratiques avant exécution

Avant tout lancement en environnement réel :

1. exécuter le mode `--check` ;
2. tester d'abord sur un environnement non critique ;
3. conserver les journaux `/tmp/fsao-iris-*.log` ;
4. vérifier que l'hôte Proxmox a accès à Internet ;
5. vérifier que le CPU supporte AVX ;
6. vérifier l'espace disque disponible ;
7. sauvegarder MongoDB avant une mise à jour importante ;
8. conserver une copie de `backend/.env`.

## 7. Limites actuelles

- Les scripts ne réalisent pas encore de migration MongoDB dédiée.
- Le rollback applicatif ne restaure pas la base de données.
- Les tests doivent encore être réalisés sur un vrai hôte Proxmox avant usage en production.
