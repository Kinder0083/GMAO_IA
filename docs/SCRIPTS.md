# Scripts de déploiement - FSAO Iris

Ce document décrit les scripts présents à la racine du dépôt et les points de vigilance associés.

## 1. `gmao-iris-install.sh`

Script d'installation principal pour une cible **Proxmox LXC / Debian 12**.

Le nom technique historique du script et des chemins reste `gmao-iris` afin de ne pas casser les habitudes ou installations existantes, mais le nom produit affiché est **FSAO Iris**.

### Rôle du script

Le script réalise les opérations suivantes :

- création d'un conteneur LXC Debian 12 ;
- installation des dépendances système ;
- installation de Node.js, Python, Nginx, Supervisor et MongoDB ;
- arrêt de l'installation si le CPU ne supporte pas AVX, afin d'éviter un fallback MongoDB fragile ;
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

Le script propose quatre modes d'accès :

```text
1) Connexion guidée GitHub automatique - recommandé
2) Clé SSH déjà configurée
3) URL Git personnalisée
4) Archive locale déjà téléchargée
```

#### 1. Connexion guidée GitHub automatique

Mode recommandé pour un utilisateur novice.

Le script :

1. installe `gh` si GitHub CLI n'est pas présent sur l'hôte Proxmox ;
2. lance une connexion guidée avec GitHub ;
3. vérifie l'accès au dépôt ;
4. clone le dépôt depuis l'hôte Proxmox ;
5. prépare l'archive applicative.

L'utilisateur doit uniquement suivre le code affiché dans le terminal et valider la connexion GitHub dans son navigateur.

#### 2. Clé SSH déjà configurée

Mode recommandé si l'hôte Proxmox possède déjà une clé SSH autorisée sur GitHub.

Par défaut, le script propose :

```bash
git@github.com:Kinder0083/GMAO_IA.git
```

Le script teste l'accès avec `git ls-remote` avant de continuer.

#### 3. URL Git personnalisée

Mode avancé permettant de fournir une autre URL Git complète.

Exemples :

```bash
git@github.com:Kinder0083/GMAO_IA.git
https://github.com/Kinder0083/GMAO_IA.git
```

Pour un dépôt privé, l'URL choisie doit être compatible avec l'authentification déjà disponible sur l'hôte Proxmox.

#### 4. Archive locale déjà téléchargée

Mode de secours.

L'utilisateur fournit le chemin complet d'une archive `.tar.gz` déjà présente sur l'hôte Proxmox.

Le script vérifie que l'archive est lisible, puis la transfère directement dans le conteneur.

### Stratégie de déploiement

Le dépôt n'est pas cloné directement dans le conteneur LXC.

La logique actuelle est :

1. obtenir la source applicative depuis l'hôte Proxmox ;
2. supprimer le dossier `.git` si le dépôt a été cloné ;
3. créer une archive `tar.gz` propre ;
4. pousser cette archive dans le conteneur avec `pct push` ;
5. extraire l'application dans `/opt/gmao-iris`.

Cette approche évite de stocker une clé SSH ou un token GitHub dans le conteneur.

### Sécurité

Le script :

- n'affiche pas le mot de passe root du conteneur ;
- ne crée plus de compte admin de secours fixe ;
- ne contient plus de mot de passe admin codé en dur ;
- ne demande aucun token GitHub manuel ;
- ne stocke aucune clé GitHub dans le conteneur ;
- génère une clé `SECRET_KEY` forte avec `openssl rand -hex 32` ;
- génère une clé `CAMERA_ENCRYPTION_KEY` ;
- crée `backend/.env` avec permissions `600` ;
- laisse les clés IA vides par défaut ;
- demande explicitement si `emergentintegrations` doit être installé.

### Points de vigilance avant exécution

Avant d'exécuter le script :

- vérifier que l'hôte Proxmox a accès à Internet ;
- vérifier que le CPU de l'hôte supporte AVX ;
- tester d'abord sur un environnement non critique ;
- choisir une IP disponible si le mode IP statique est utilisé ;
- préparer les mots de passe admin, root LXC et documentation API ;
- si le mode GitHub CLI est utilisé, prévoir un accès au navigateur pour valider la connexion ;
- vérifier l'espace disque disponible ;
- conserver le backup du script original.

## 2. `gmao-iris-update.sh`

Script dédié à la **mise à jour par archive** d'une installation FSAO Iris existante.

Ce script est prévu pour être lancé depuis l'hôte Proxmox, sans recréer le conteneur LXC.

### Rôle du script de mise à jour

Le script réalise les opérations suivantes :

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

### Source de mise à jour

Le script propose :

```text
1) Connexion guidée GitHub automatique - recommandé
2) Clé SSH déjà configurée
3) URL Git personnalisée
4) Archive locale déjà téléchargée
```

Le mode recommandé reste la connexion guidée GitHub automatique avec `gh`, surtout pour un utilisateur novice.

### Sauvegarde et rollback

Avant de remplacer l'application, le script déplace l'installation existante dans :

```bash
/opt/gmao-iris-backups/<timestamp>/app
```

Si la préparation de la nouvelle version échoue pendant le staging, l'ancienne version reste en place.

Après bascule, le script affiche une commande de rollback manuel permettant de restaurer l'ancienne version depuis le dossier de sauvegarde.

### Limites actuelles

Le script ne met pas encore à jour la base MongoDB par migration dédiée.

Les scripts éventuels de migration de schéma devront être ajoutés explicitement si le modèle de données évolue fortement entre deux versions.

## 3. `gmao-ssl-gdrive-setup.sh`

Script post-installation nettoyé pour :

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

Ces chemins sont conservés pour ne pas casser les installations existantes.
