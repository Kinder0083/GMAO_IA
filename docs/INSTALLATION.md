# Installation - FSAO Iris

Ce document décrit l'installation de référence de **FSAO Iris**.

## 1. Cible recommandée

L'installation cible est un conteneur **Proxmox LXC** basé sur **Debian 12**.

Composants attendus :

- backend FastAPI ;
- frontend React ;
- MongoDB ;
- Nginx ;
- Supervisor ;
- Node.js ;
- Python 3 ;
- environnement `.env` propre ;
- sauvegarde configurée.

## 2. Pré-requis

Avant installation :

- disposer d'un serveur Proxmox fonctionnel ;
- prévoir une adresse IP fixe ou une réservation DHCP ;
- prévoir un nom DNS si HTTPS public est nécessaire ;
- préparer les mots de passe et clés nécessaires ;
- générer une clé JWT forte ;
- vérifier l'espace disque disponible.

Génération recommandée pour la clé JWT :

```bash
openssl rand -hex 32
```

## 3. Variables d'environnement

Le modèle de configuration est :

```bash
backend/.env.example
```

Il doit être copié vers :

```bash
backend/.env
```

Puis adapté à l'environnement réel.

Variables minimales obligatoires :

```bash
MONGO_URL=mongodb://localhost:27017
DB_NAME=fsao_iris
SECRET_KEY=<cle_forte>
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=43200
DOCS_USER=admin
DOCS_PASS=<mot_de_passe_fort>
```

## 4. Installation backend

Principe général :

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

Le backend doit ensuite être lancé via Uvicorn ou supervisé par Supervisor.

Exemple :

```bash
uvicorn server:app --host 0.0.0.0 --port 8001
```

## 5. Installation frontend

Principe général :

```bash
cd frontend
npm install
npm run build
```

Le dossier de build peut ensuite être servi par Nginx.

## 6. MongoDB

MongoDB doit être disponible avant le démarrage du backend.

À vérifier :

```bash
systemctl status mongod
```

La base recommandée est :

```bash
fsao_iris
```

## 7. Nginx

Nginx doit servir :

- le frontend React ;
- le reverse proxy vers le backend FastAPI ;
- les websockets si utilisés ;
- HTTPS si configuré.

Points à vérifier :

- redirection HTTP vers HTTPS ;
- taille maximale des uploads ;
- timeout compatible avec les traitements longs ;
- passage correct des headers `Upgrade` et `Connection` pour les websockets.

## 8. Supervisor

Supervisor peut être utilisé pour maintenir les services actifs.

À contrôler :

```bash
supervisorctl status
```

Services typiques :

- backend FSAO Iris ;
- éventuels workers ;
- tâches de sauvegarde ou scripts de surveillance.

## 9. Vérifications après installation

Après installation :

- vérifier l'accès à l'interface web ;
- tester la connexion utilisateur ;
- vérifier l'accès API ;
- vérifier la documentation API protégée ;
- créer un ordre de travail de test ;
- contrôler MongoDB ;
- contrôler les logs backend ;
- vérifier les sauvegardes.

## 10. HTTPS

Pour un environnement exposé hors réseau local, HTTPS est indispensable.

À vérifier :

- certificat valide ;
- renouvellement automatique ;
- redirection HTTP vers HTTPS ;
- accès limité aux interfaces d'administration.

## 11. Après installation

Actions recommandées :

- modifier les mots de passe initiaux ;
- supprimer les comptes de test ;
- contrôler les rôles ;
- paramétrer les sauvegardes ;
- vérifier le plan de restauration ;
- documenter l'adresse d'accès et la procédure de support.
