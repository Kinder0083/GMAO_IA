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

### Stratégie de déploiement

Le dépôt n'est plus cloné directement dans le conteneur LXC.

La logique actuelle est :

1. cloner le dépôt depuis l'hôte Proxmox ;
2. supprimer le dossier `.git` ;
3. créer une archive `tar.gz` propre ;
4. pousser cette archive dans le conteneur avec `pct push` ;
5. extraire l'application dans `/opt/gmao-iris`.

Cette approche évite de stocker une clé SSH ou un token GitHub dans le conteneur.

### Accès GitHub

Par défaut, le script propose :

```bash
git@github.com:Kinder0083/GMAO_IA.git
```

Pour un dépôt privé, l'hôte Proxmox doit donc disposer d'un accès Git fonctionnel, par exemple via une clé SSH GitHub configurée pour l'utilisateur qui exécute le script.

Aucun token GitHub n'est demandé ni stocké par le script.

### Sécurité

Le script :

- n'affiche pas le mot de passe root du conteneur ;
- ne crée plus de compte admin de secours fixe ;
- ne contient plus de mot de passe admin codé en dur ;
- génère une clé `SECRET_KEY` forte avec `openssl rand -hex 32` ;
- génère une clé `CAMERA_ENCRYPTION_KEY` ;
- crée `backend/.env` avec permissions `600` ;
- laisse les clés IA vides par défaut ;
- demande explicitement si `emergentintegrations` doit être installé.

### Points de vigilance avant exécution

Avant d'exécuter le script :

- vérifier que l'hôte Proxmox a accès au dépôt GitHub ;
- vérifier que le CPU de l'hôte supporte AVX ;
- tester d'abord sur un environnement non critique ;
- choisir une IP disponible si le mode IP statique est utilisé ;
- préparer les mots de passe admin, root LXC et documentation API ;
- vérifier l'espace disque disponible ;
- conserver le backup du script original.

### Backup disponible

Le script original avant refonte est conservé ici :

```bash
backups/gmao-iris-install.sh.backup-2026-07-14
```

## 2. `gmao-ssl-gdrive-setup.sh`

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

## 3. Bonnes pratiques avant exécution

Avant d'exécuter un script :

1. lire le script complet ;
2. vérifier le dépôt ciblé ;
3. sauvegarder MongoDB si une installation existe déjà ;
4. sauvegarder `backend/.env` si une installation existe déjà ;
5. vérifier les mots de passe et clés ;
6. tester sur un environnement non critique ;
7. documenter l'action réalisée.

## 4. Améliorations restantes possibles

- ajouter un mode `--dry-run` ;
- ajouter une vérification post-installation plus complète ;
- ajouter une procédure de rollback automatisée ;
- extraire la configuration Nginx dans un fichier modèle ;
- extraire la configuration Supervisor dans un fichier modèle ;
- ajouter un mode de mise à jour contrôlé par archive.