# Installation novice - FSAO Iris

Ce guide explique comment installer **FSAO Iris** sur un hôte **Proxmox** en suivant la méthode la plus simple.

> Objectif : permettre à une personne peu à l'aise en informatique de lancer l'installation sans manipuler de clé SSH ni de token GitHub.

## 1. Préparer l'hôte Proxmox

Connectez-vous à l'interface Proxmox, puis ouvrez le **Shell** de l'hôte.

Le script doit être lancé en `root` sur l'hôte Proxmox, pas dans un conteneur.

## 2. Copier le script d'installation

Depuis le dossier où se trouve le dépôt ou après avoir téléchargé les scripts, rendez le script exécutable :

```bash
chmod +x gmao-iris-install.sh
```

## 3. Vérifier les prérequis avant d'installer

Avant de lancer l'installation, exécutez :

```bash
./gmao-iris-install.sh --check
```

Ce mode vérifie notamment :

- que le script est lancé en root ;
- que Proxmox est détecté ;
- que les commandes `pct`, `pveam` et `pvesm` sont disponibles ;
- que le CPU supporte AVX pour MongoDB 7 ;
- qu'un bridge réseau `vmbr` est disponible ;
- que GitHub est joignable ;
- que l'espace disque semble suffisant.

Si le script signale un point bloquant, corrigez-le avant de continuer.

## 4. Lancer l'installation

```bash
./gmao-iris-install.sh
```

## 5. Choisir l'accès au dépôt privé GitHub

Le script affiche :

```text
1) Connexion guidée GitHub automatique - recommandé
2) Clé SSH déjà configurée
3) URL Git personnalisée
4) Archive locale déjà téléchargée
```

Pour un utilisateur novice, choisissez :

```text
1
```

Le script installera GitHub CLI si nécessaire, puis affichera un code et une adresse GitHub.

Depuis votre PC :

1. ouvrez l'adresse affichée ;
2. connectez-vous à GitHub ;
3. validez le code ;
4. revenez dans le terminal Proxmox.

Le script reprend ensuite automatiquement.

## 6. Répondre aux questions principales

Le script demande ensuite :

- la branche GitHub : laisser `main` ;
- le bridge réseau : laisser le choix proposé si vous ne savez pas ;
- le mode réseau : choisir IP statique si vous voulez une adresse fixe ;
- l'ID du conteneur : laisser la valeur proposée ;
- la RAM : laisser `4096` Mo pour un premier test ;
- les CPU cores : laisser `2` pour un premier test ;
- la taille disque : laisser `20` Go minimum ;
- l'email administrateur principal ;
- le mot de passe administrateur ;
- le mot de passe root du conteneur ;
- le mot de passe de documentation API / Swagger.

## 7. Questions optionnelles

### Compte administrateur de secours

Le script peut créer un deuxième compte administrateur.

Pour une installation simple, vous pouvez répondre `n`.

### emergentintegrations

Le script demande si la dépendance optionnelle `emergentintegrations` doit être installée.

Pour une installation simple, vous pouvez répondre `n`.

### Tailscale

Tailscale permet un accès à distance via VPN.

Pour une installation locale simple, vous pouvez répondre `n`.

### URL publique/manuelle

Si vous n'avez pas encore de nom de domaine ou d'accès distant, laissez vide.

## 8. Fin d'installation

À la fin, le script affiche :

- l'URL principale ;
- l'URL locale ;
- l'email administrateur ;
- l'état du backend.

Ouvrez l'URL locale dans votre navigateur.

Exemple :

```text
http://192.168.1.150
```

## 9. En cas d'erreur

Le script affiche un fichier journal, par exemple :

```bash
/tmp/fsao-iris-install-20260715_220000.log
```

Conservez ce fichier pour diagnostiquer l'installation.

## 10. Commandes utiles

Entrer dans le conteneur :

```bash
pct enter <ID_CONTENEUR>
```

Voir les services :

```bash
supervisorctl status
```

Voir les logs backend :

```bash
tail -f /var/log/gmao-iris-backend.err.log
```
