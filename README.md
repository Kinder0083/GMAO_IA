# FSAO Iris

**FSAO Iris** est une application web full-stack auto-hébergée dédiée au fonctionnement des services industriels, à la maintenance, à la QHSE et au suivi de production.

- **Nom officiel :** FSAO Iris
- **Version :** 1.12.0
- **Concepteur :** Greg
- **Dernière mise à jour fonctionnelle :** Avril 2026
- **Déploiement cible :** Proxmox LXC / Debian 12

---

## 1. Présentation

FSAO Iris centralise les processus opérationnels d'un service industriel : ordres de travail, équipements, maintenance préventive, demandes d'intervention, inventaire, achats, consignations LOTO, QHSE, plan de surveillance, presqu'accidents, M.E.S., capteurs IoT, caméras et tableaux de bord.

L'application intègre également des fonctions d'intelligence artificielle pour aider à analyser les données de maintenance et de QHSE, générer des synthèses, exploiter les historiques et assister les utilisateurs dans certaines actions métier.

L'objectif du projet est de fournir une plateforme interne unique, exploitable sur un serveur local ou distant, adaptée aux besoins réels d'un environnement industriel.

---

## 2. Périmètre fonctionnel

### Maintenance industrielle

- Création, suivi et clôture des ordres de travail.
- Gestion des priorités, statuts, temps estimés et temps réels.
- Assignation par utilisateur ou par service.
- Pièces jointes, photos, documents, vidéos et prévisualisation.
- Bons de travail générables.
- Modèles d'ordres de travail réutilisables.

### Équipements

- Inventaire des équipements industriels.
- Hiérarchie parent / sous-équipement.
- Historique des interventions.
- Suivi des états opérationnels.
- Gestion des garanties, compteurs et coûts.
- QR codes et actions rapides depuis le terrain.

### Maintenance préventive

- Planification récurrente.
- Checklists de maintenance.
- Planning visuel.
- Alertes et exécutions planifiées.
- Génération assistée par IA de programmes de maintenance à partir de documents techniques.

### QHSE et sécurité

- Gestion des presqu'accidents.
- Analyse des causes racines.
- Méthodes 5 Pourquoi, Ishikawa, QQOQCP et arbre des causes.
- Plan de surveillance et rapports associés.
- Gestion des autorisations particulières.
- Rapports QHSE assistés par IA.

### Consignations LOTO

- Workflow de consignation en plusieurs étapes.
- Points d'isolation par énergie : électrique, hydraulique, pneumatique, thermique, chimique ou mécanique.
- Cadenas multiples.
- Signatures électroniques.
- Journalisation complète des opérations.
- Liaison possible avec les OT, maintenances préventives et actions d'amélioration.

### Inventaire, achats et fournisseurs

- Gestion des pièces détachées.
- Alertes de stock bas.
- Fournisseurs et historique d'achats.
- Demandes d'achat avec workflow de validation.
- Analyse IA de l'historique d'achat.

### M.E.S. et IoT

- Suivi de production en temps réel.
- Architecture ESP32 / MQTT orientée edge-computing.
- Cadence machine, états de production et compteurs cumulés.
- Agrégations MongoDB par minute, jour et poste.
- Rapports de production et indicateurs 3x8.
- Dashboard capteurs et logs MQTT.

### Collaboration et exploitation

- Chat temps réel.
- Tableau d'affichage / whiteboard.
- Notifications push PWA.
- Sauvegardes locales et Google Drive.
- Mise à jour applicative depuis l'interface admin.
- Journal d'activité et audit.

---

## 3. Intelligence artificielle

FSAO Iris intègre un assistant IA nommé **Adria** ainsi que plusieurs fonctions IA spécialisées :

- génération de checklists à partir de documents techniques ;
- génération de plans de maintenance préventive ;
- analyse des non-conformités et tendances récurrentes ;
- aide à l'analyse des presqu'accidents ;
- génération de rapports de synthèse QHSE ;
- analyse de l'historique d'achat ;
- aide à la création, modification et clôture d'ordres de travail ;
- création de widgets et indicateurs de tableau de bord.

Les modèles et clés IA doivent être configurés dans l'environnement applicatif avant utilisation.

---

## 4. Stack technique

| Couche | Technologie |
|---|---|
| Frontend | React 19, Tailwind CSS, Shadcn/UI, Lucide Icons |
| Backend | FastAPI, Python 3.11+, Uvicorn |
| Base de données | MongoDB 7.0+ |
| Temps réel | WebSocket, Socket.IO selon modules |
| Planification | APScheduler |
| Authentification | JWT, bcrypt |
| Reverse proxy | Nginx |
| Supervision process | Supervisor |
| Notifications | Web Push / VAPID, Expo Push |
| IoT | MQTT, ESP32, capteurs et compteurs |
| Déploiement principal | Proxmox LXC Debian 12 |

---

## 5. Architecture du dépôt

```text
.
├── backend/                    # API FastAPI, services métier, routes, migrations
│   ├── server.py               # Point d'entrée principal de l'API
│   ├── models.py               # Modèles de données
│   ├── auth.py                 # Authentification
│   ├── routes/                 # Routes modulaires extraites
│   ├── migrations/             # Scripts de migration base de données
│   └── uploads/                # Fichiers uploadés en exploitation locale
│
├── frontend/                   # Application React
│   ├── src/pages/              # Pages applicatives
│   ├── src/components/         # Composants réutilisables
│   ├── public/                 # Assets statiques et PWA
│   └── package.json            # Dépendances frontend
│
├── docs/                       # Documentation installation, sécurité, exploitation
├── updates/                    # Métadonnées de version et mise à jour
├── gmao-iris-install.sh        # Script d'installation Proxmox LXC historique
├── gmao-ssl-gdrive-setup.sh    # Script SSL + Google Drive nettoyé
├── CHANGELOG.md                # Historique des versions
└── README.md                   # Présentation du projet
```

---

## 6. Documentation

Les documents principaux sont regroupés dans `docs/` :

| Document | Rôle |
|---|---|
| `docs/INSTALLATION.md` | Procédure d'installation de référence |
| `docs/SECURITE.md` | Règles de sécurité minimales avant mise en service |
| `docs/EXPLOITATION.md` | Bonnes pratiques d'exploitation, sauvegarde, mise à jour et restauration |
| `docs/SCRIPTS.md` | Description des scripts et points de vigilance |

---

## 7. Installation recommandée

L'installation recommandée se fait sur un serveur **Proxmox** via un container **LXC Debian 12**.

Depuis l'hôte Proxmox :

```bash
bash gmao-iris-install.sh
```

Le script prépare l'environnement applicatif, installe les dépendances système, configure les services principaux et déploie FSAO Iris.

Après installation, la configuration SSL et Google Drive peut être lancée depuis le container LXC :

```bash
sudo bash gmao-ssl-gdrive-setup.sh
```

> Remarque : la procédure Docker ne doit être considérée comme supportée que si un fichier `docker-compose.yml` maintenu est présent dans le dépôt.

---

## 8. Configuration minimale

La configuration principale se fait via le fichier `backend/.env`.

Variables importantes :

```env
MONGO_URL=mongodb://localhost:27017
DB_NAME=fsao_iris
SECRET_KEY=<cle_secrete_jwt>
DOCS_USER=admin
DOCS_PASS=<mot_de_passe_fort>
FRONTEND_URL=https://votre-domaine.com
BACKEND_URL=https://votre-domaine.com
APP_URL=https://votre-domaine.com
SMTP_SERVER=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=votre-email@gmail.com
SMTP_PASSWORD=<mot_de_passe_application>
SMTP_SENDER_EMAIL=votre-email@gmail.com
SMTP_FROM_NAME=FSAO Iris
EMERGENT_LLM_KEY=<cle_ia_si_utilisee>
VAPID_PUBLIC_KEY=<cle_publique_vapid>
VAPID_PRIVATE_KEY=<cle_privee_vapid>
```

Les fichiers `.env`, clés privées, certificats et identifiants OAuth ne doivent jamais être versionnés.

---

## 9. Exploitation

En exploitation, les points essentiels à surveiller sont :

- disponibilité de MongoDB ;
- état des services backend, frontend, Nginx et Supervisor ;
- espace disque disponible pour les uploads et sauvegardes ;
- validité du certificat SSL ;
- état des sauvegardes locales et Google Drive ;
- logs applicatifs ;
- cohérence des données MongoDB ;
- connectivité MQTT si les modules IoT / M.E.S. sont utilisés.

---

## 10. Sécurité

Avant une mise en production, vérifier au minimum :

- génération d'une vraie `SECRET_KEY` ;
- mots de passe administrateur uniques ;
- configuration HTTPS ;
- restriction des accès SSH et admin ;
- sauvegardes régulières ;
- absence de secrets dans le dépôt ;
- revue des scripts externes chargés côté frontend ;
- droits utilisateurs et rôles adaptés à l'organisation.

---

## 11. Notes de version

La version de référence actuelle du projet est :

```text
FSAO Iris 1.12.0
```

Les détails fonctionnels sont suivis dans `CHANGELOG.md` et dans `updates/version.json`.

---

## 12. Statut du projet

FSAO Iris est un projet applicatif industriel avancé, orienté usage interne, amélioration continue et digitalisation des processus maintenance/QHSE/production.

Le dépôt `GMAO_IA` sert de dépôt de travail et d'amélioration autour de FSAO Iris.
