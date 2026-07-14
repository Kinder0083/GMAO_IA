# Mise à jour novice - FSAO Iris

Ce guide explique comment mettre à jour **FSAO Iris** sans recréer le conteneur Proxmox.

La mise à jour se fait par archive : le dépôt est récupéré depuis l'hôte Proxmox, une archive propre est préparée, puis l'application est remplacée dans le conteneur uniquement après un build réussi.

## 1. Pré-vérifier avant de mettre à jour

Depuis le shell de l'hôte Proxmox :

```bash
chmod +x gmao-iris-update.sh
./gmao-iris-update.sh --check
```

Ce mode vérifie :

- que Proxmox est détecté ;
- que les conteneurs LXC sont listables ;
- que GitHub est joignable ;
- que les commandes nécessaires sont disponibles ;
- que l'espace disque semble correct.

## 2. Lancer la mise à jour

```bash
./gmao-iris-update.sh
```

Le script liste les conteneurs LXC et propose l'ID du conteneur `gmao-iris` s'il le trouve.

## 3. Choisir la source de mise à jour

Le script propose :

```text
1) Connexion guidée GitHub automatique - recommandé
2) Clé SSH déjà configurée
3) URL Git personnalisée
4) Archive locale déjà téléchargée
```

Pour un utilisateur novice, choisir :

```text
1
```

Le script utilise GitHub CLI pour vous guider dans la connexion GitHub.

## 4. Ce que fait le script

Le script :

1. prépare une archive propre de la nouvelle version ;
2. transfère cette archive dans le conteneur ;
3. extrait la nouvelle version dans un dossier de staging ;
4. recopie les fichiers `.env` existants ;
5. installe les dépendances backend ;
6. reconstruit le frontend ;
7. arrête temporairement le backend ;
8. sauvegarde l'ancienne application ;
9. remplace l'application par la nouvelle version ;
10. redémarre le backend ;
11. recharge Nginx.

## 5. Sauvegarde automatique

Avant remplacement, l'ancienne application est déplacée dans :

```bash
/opt/gmao-iris-backups/<date_heure>/app
```

Exemple :

```bash
/opt/gmao-iris-backups/20260715_223000/app
```

## 6. Rollback simple

Si la nouvelle version pose problème, utilisez le script de rollback :

```bash
chmod +x gmao-iris-rollback.sh
./gmao-iris-rollback.sh
```

Le script :

- liste les sauvegardes disponibles ;
- demande laquelle restaurer ;
- arrête le backend ;
- restaure l'ancienne application ;
- redémarre le backend ;
- recharge Nginx.

## 7. Limite importante

Le rollback restaure les fichiers applicatifs, mais ne restaure pas la base MongoDB.

Si une future version modifie fortement la structure des données, il faudra prévoir une procédure de migration et de sauvegarde MongoDB dédiée.

## 8. En cas d'erreur

Les scripts affichent un journal, par exemple :

```bash
/tmp/fsao-iris-update-20260715_230000.log
/tmp/fsao-iris-rollback-20260715_231500.log
```

Conservez ces fichiers pour le diagnostic.
