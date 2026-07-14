# Sécurité - FSAO Iris

Ce document regroupe les règles minimales à respecter avant toute mise en service de **FSAO Iris** dans un environnement industriel ou préindustriel.

## 1. Variables sensibles

Les fichiers `.env` ne doivent jamais être versionnés dans le dépôt Git.

Le fichier de référence est :

```bash
backend/.env.example
```

Il doit être copié vers :

```bash
backend/.env
```

Toutes les valeurs sensibles doivent ensuite être remplacées.

Variables à traiter en priorité :

- `SECRET_KEY`
- `DOCS_PASS`
- `SMTP_PASSWORD`
- `EMERGENT_LLM_KEY`
- `OPENAI_API_KEY`
- `GOOGLE_API_KEY`
- `ANTHROPIC_API_KEY`
- `GOOGLE_CLIENT_SECRET`
- `VAPID_PRIVATE_KEY`
- `CAMERA_ENCRYPTION_KEY`

## 2. Clé JWT obligatoire

FSAO Iris ne doit pas utiliser de clé JWT par défaut.

Une clé forte doit être générée avant la mise en service :

```bash
openssl rand -hex 32
```

La valeur obtenue doit être placée dans :

```bash
SECRET_KEY=<valeur_generee>
```

Si `SECRET_KEY` est absente ou contient une valeur faible, l'authentification JWT est volontairement bloquée.

## 3. Documentation API

La documentation API est protégée par authentification HTTP Basic.

Les variables suivantes doivent être définies :

```bash
DOCS_USER=admin
DOCS_PASS=<mot_de_passe_fort>
```

Ne jamais conserver un mot de passe générique ou connu publiquement.

## 4. Accès réseau

En production ou préproduction, il est recommandé de :

- exposer l'application uniquement derrière Nginx ;
- utiliser HTTPS avec un certificat valide ;
- limiter l'accès d'administration au réseau interne, au VPN ou à Tailscale ;
- éviter d'exposer MongoDB directement sur Internet ;
- filtrer les ports inutiles au niveau pare-feu.

## 5. Services externes

Les scripts de suivi, analytics ou enregistrement de session externes ne doivent pas être activés par défaut.

Le frontend public ne doit pas charger de scripts tiers non nécessaires au fonctionnement de l'application.

## 6. Sauvegardes

Avant toute mise à jour importante :

- sauvegarder MongoDB ;
- sauvegarder les fichiers joints et uploads ;
- sauvegarder le fichier `backend/.env` ;
- vérifier la possibilité de restauration.

## 7. Comptes utilisateurs

Après installation :

- changer tous les mots de passe initiaux ;
- supprimer les comptes de test inutiles ;
- limiter les droits administrateur ;
- vérifier les rôles et permissions par service.

## 8. Données industrielles

FSAO Iris peut contenir des informations sensibles : équipements, incidents, QHSE, achats, fournisseurs, production, rapports et historiques d'intervention.

Ces données doivent être traitées comme des données internes d'entreprise.

## 9. Checklist avant mise en service

- [ ] `SECRET_KEY` forte définie.
- [ ] `DOCS_PASS` remplacé.
- [ ] Fichier `.env` absent du dépôt Git.
- [ ] HTTPS actif.
- [ ] Sauvegarde MongoDB testée.
- [ ] Accès MongoDB non exposé publiquement.
- [ ] Comptes de test supprimés ou désactivés.
- [ ] Scripts externes non indispensables désactivés.
- [ ] Droits utilisateurs vérifiés.
