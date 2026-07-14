# Scripts de déploiement - FSAO Iris

Ce document décrit les scripts présents à la racine du dépôt et les points de vigilance associés.

## 1. `gmao-iris-install.sh`

Script d'installation principal pour une cible Proxmox LXC / Debian 12.

Objectif historique :

- créer un conteneur LXC ;
- installer MongoDB, Node.js, Python, Nginx et Supervisor ;
- cloner le dépôt GitHub ;
- créer le fichier `backend/.env` ;
- créer les comptes administrateurs ;
- compiler le frontend ;
- configurer Nginx et Supervisor.

### Points de vigilance

Ce script est volumineux et doit être relu prudemment avant exécution en production ou préproduction.

Points à contrôler avant utilisation :

- dépôt GitHub par défaut ;
- nom de la base MongoDB ;
- génération de `SECRET_KEY` ;
- absence de clé API codée en dur ;
- absence de compte administrateur de secours avec mot de passe fixe ;
- cohérence des chemins `/opt/gmao-iris` ;
- cohérence du service Supervisor `gmao-iris-backend` ;
- configuration Nginx ;
- sauvegarde avant mise à jour.

### Décision de nettoyage

Le script doit rester compatible avec les anciennes installations utilisant encore les chemins techniques `gmao-iris`. Le nom produit affiché doit cependant être **FSAO Iris**.

Une passe de refonte complète du script est recommandée avant toute nouvelle installation propre.

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
3. sauvegarder MongoDB ;
4. sauvegarder `backend/.env` ;
5. vérifier les mots de passe et clés ;
6. tester sur un environnement non critique ;
7. documenter l'action réalisée.

## 4. À faire avant industrialisation complète

- séparer les chemins techniques des noms affichés ;
- rendre le dépôt par défaut configurable proprement ;
- supprimer toute valeur sensible codée en dur ;
- remplacer les comptes de secours fixes par une création interactive ;
- ajouter un mode `--dry-run` ;
- ajouter une journalisation plus claire ;
- ajouter une vérification post-installation automatisée ;
- prévoir une procédure de rollback.
