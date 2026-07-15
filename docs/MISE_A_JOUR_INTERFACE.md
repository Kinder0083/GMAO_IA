# Mise a jour depuis l'interface FSAO Iris

Ce guide decrit le fonctionnement de la page **Mise a jour** de FSAO Iris.

L'objectif est simple : un administrateur doit pouvoir verifier, preparer, lancer et, si necessaire, restaurer une mise a jour directement depuis l'interface graphique de l'application.

## Principe general

La mise a jour normale se fait dans le conteneur LXC applicatif.

```text
Interface FSAO Iris
  -> Backend FastAPI
  -> MAJ_FSAO.sh dans le LXC
  -> GitHub + build backend/frontend + redemarrage services
```

Aucune action de mise a jour applicative normale ne doit etre lancee depuis l'hote Proxmox.

## Depot et branche configurables

La page **Mise a jour** contient une section :

```text
Parametrage du depot de mise a jour
```

Elle permet de modifier :

- utilisateur ou organisation GitHub ;
- nom du depot ;
- branche ;
- URL Git optionnelle.

Cette configuration est utilisee a la fois pour :

- detecter automatiquement les mises a jour ;
- tester les acces ;
- lancer `MAJ_FSAO.sh` ;
- choisir la branche vraiment installee lors de la mise a jour.

Exemple d'organisation conseillee :

```text
main     : version stable
develop  : version de test
preprod  : version candidate
```

Avant chaque mise a jour, l'interface affiche le depot, la branche et le dernier commit distant afin d'eviter toute erreur de branche.

## Tests d'acces

La page affiche deux controles separes.

### API GitHub

Utilisee pour detecter automatiquement les mises a jour et lire le dernier commit de la branche configuree.

### Git fetch / ls-remote

Utilise par `MAJ_FSAO.sh` pour recuperer le code source depuis le LXC.

Les deux controles doivent idealement etre au vert avant de lancer la mise a jour.

## Depot prive

Si le depot GitHub est prive, le LXC doit posseder un acces valide au depot.

Deux approches sont recommandees :

1. une authentification GitHub cote backend pour permettre la detection automatique ;
2. une cle SSH de deploiement en lecture seule pour permettre le `git fetch`.

L'interface ne doit jamais afficher de secret. Elle indique seulement si une methode d'authentification est detectee et si l'acces fonctionne.

## Mise a jour

Le bouton **Mettre a jour maintenant** lance le flux suivant :

1. avertissement des utilisateurs connectes ;
2. sauvegarde MongoDB si l'outil est disponible ;
3. sauvegarde applicative locale ;
4. sauvegarde des fichiers persistants `.env` ;
5. verification de la branche distante ;
6. synchronisation du code ;
7. restauration des fichiers persistants ;
8. reconstruction backend/frontend ;
9. redemarrage des services.

Le script refuse d'appliquer une branche qui ne contient pas au minimum :

```text
updates/version.json
backend/
frontend/
MAJ_FSAO.sh
```

## Rollback applicatif

La section **Sauvegardes locales** liste les sauvegardes creees avant mise a jour.

Pour chaque sauvegarde applicative, l'interface propose :

```text
Restaurer cette sauvegarde
```

Ce rollback restaure les fichiers applicatifs et redemarre les services si necessaire.

Important : le rollback applicatif ne restaure pas automatiquement MongoDB. Les sauvegardes MongoDB restent separees.

## Bonnes pratiques

Avant de lancer une mise a jour :

1. verifier le depot actif ;
2. verifier la branche active ;
3. cliquer sur **Tester les acces** ;
4. cliquer sur **Pre-verifier** ;
5. lire les messages d'alerte ;
6. lancer la mise a jour ;
7. verifier les logs ;
8. conserver la derniere sauvegarde applicative fonctionnelle.
