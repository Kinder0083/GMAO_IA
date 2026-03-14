# FSAO Iris

Application de Fonctionnement des Services Assistee par Ordinateur (FSAO) complete et auto-hebergee.

**Version :** 1.10.0
**Concepteur :** Greg
**Derniere mise a jour :** Mars 2026

---

## Presentation

FSAO Iris est une application web full-stack concue pour gerer l'ensemble du cycle de maintenance industrielle et du fonctionnement des services : ordres de travail, equipements, maintenance preventive, inventaire, surveillance, M.E.S., cameras, chat en temps reel, et bien plus. Elle integre une couche d'**intelligence artificielle** pour l'analyse automatique des donnees QHSE. Elle se deploie sur un serveur Proxmox LXC en une commande et dispose d'un systeme de mise a jour integre.

---

## Fonctionnalites principales

### Intelligence Artificielle (IA)

FSAO Iris integre des fonctionnalites d'IA generative (Gemini Pro) pour automatiser et enrichir les processus QHSE.

#### IA - Checklists et Maintenance
- **Generation automatique de checklists** : Upload d'un document technique, l'IA genere un template de checklist complet
- **Generation automatique de programmes de maintenance** : Upload d'une documentation constructeur, l'IA genere un plan de maintenance preventive
- **Analyse IA des non-conformites** : Analyse l'historique des executions de checklists pour detecter les patterns recurrents, tendances negatives et equipements a risque
- **Creation d'ordres de travail curatifs en 1 clic** : Depuis les resultats de l'analyse IA, creation automatique d'OT pour les actions correctives suggerees
- **Alertes email automatiques** : Envoi automatique d'emails aux responsables de service quand des patterns critiques sont detectes

#### IA - Presqu'accidents
- **Analyse des causes racines** : Methode 5 Pourquoi + diagramme Ishikawa generes automatiquement par l'IA a partir de la description de l'incident, avec suggestion d'actions preventives et evaluation severite/recurrence
- **Detection d'incidents similaires** : Lors de la creation d'un presqu'accident, l'IA recherche automatiquement les incidents similaires dans l'historique pour capitaliser sur les actions deja entreprises
- **Analyse IA des tendances** : Analyse globale de tous les presqu'accidents pour identifier les patterns recurrents, zones a risque, predictions de risques futurs, avec envoi d'alertes email aux responsables
- **Rapport de synthese QHSE** : Generation automatique d'un rapport structure (resume executif, KPIs, analyse par service, top risques, plan d'action) pret pour presentation en reunion QHSE, avec option d'impression

#### IA - Historique Achat
- **Analyse IA des achats** : Analyse automatique de l'historique des achats pour identifier les tendances de depenses, fournisseurs les plus sollicites, categories d'achat recurrentes et optimisations possibles
- **Archives IA** : Consultation de l'historique de toutes les analyses IA effectuees sur les achats, avec possibilite de comparer les resultats dans le temps
- Acces depuis le module "Historique Achat" via les boutons "Analyse IA" et "Archives IA"

#### IA - Arbre des Causes (Analyse d'Accidents)
- **Analyse structuree des accidents** : Module complet d'analyse des accidents de maintenance en 5 phases guidees par l'IA
- **Methode QQOQCP** : Questionnement structure (Quoi, Qui, Ou, Quand, Comment, Pourquoi) avec suggestions IA
- **Methode des 5 Pourquoi** : Iterations successives pour identifier la cause racine, avec guidage IA et detection automatique de la cause fondamentale
- **Diagramme d'Ishikawa (5M)** : Analyse par les 5 familles de causes (Main d'oeuvre, Materiel, Methodes, Milieu, Matieres) avec diagramme visuel interactif et analyse IA
- **Grille ALARM** : Analyse des facteurs contributifs (Patient, Taches, Individu, Equipe, Environnement, Organisation, Contexte) avec classification IA
- **Generation d'actions correctives** : L'IA propose des actions correctives et preventives a partir de l'analyse complete, avec creation directe d'Ordres de Travail, de Maintenances Preventives ou de Checklists
- **Modele IA configurable** : Choix du modele d'IA (GPT-5.2, GPT-4o, Gemini, Claude) dans les Parametres speciaux
- Acces depuis le menu "Arbre des Causes" dans la sidebar

#### IA - Assistant (Adria)
- Assistant IA conversationnel integre (personnalisable : nom, genre, modele LLM)
- **Memoire de conversation** : Adria se souvient du contexte des echanges precedents
- **Contexte enrichi** : Requetes dynamiques vers les donnees FSAO (OT, equipements, alertes, inventaire) pour des reponses factuelles
- **Creation d'OT par IA** : "Cree un OT urgent pour reparer la pompe P-001" - Adria cree l'OT automatiquement avec titre, description, priorite, categorie et equipement lie
- **Auto-assignation intelligente** : Lors de la creation d'un OT, Adria assigne automatiquement l'OT a l'utilisateur connecte. Si un nom de technicien est specifie ("assigne-le a Axel"), l'IA resout le nom et assigne au bon utilisateur
- **Modification d'OT par IA** : "Ajoute la description suivante a l'OT 5864 : essais tirage personnel" ou "Passe l'OT #5801 en priorite haute" - Adria modifie l'OT existant (description, priorite, statut, equipement, assignation, categorie). La recherche d'OT priorise le numero exact avant l'ID ou le titre
- **Cloture d'OT par IA** : "Termine l'OT Bioci 1, ca a pris 2h, j'ai change le filtre" - Adria cloture l'OT en une seule commande : ajout du temps passe, enregistrement des pieces utilisees (avec deduction stock automatique), commentaire de cloture, passage au statut TERMINE
- **Creation de Widgets IA** : "Cree un camembert des OT par priorite" - Adria genere et cree des widgets sur le Dashboard Service
- **Support des formules mathematiques** : "Cree une jauge taux resolution = OT termines / total * 100" - L'IA genere les sources de donnees et les formules ($references, IF, ROUND, SUM, AVG)
- **Automatisations IA** : Configuration de regles automatiques en langage naturel (alertes capteurs, rappels maintenance, escalades, seuils inventaire)
- Historique des conversations IA accessible depuis le module "Historique IA"

#### IA - Tableau de Bord
- **Tableau de bord IA unifie** avec 5 onglets : Tendances, Ordres de Travail, Capteurs, Surveillance, Automatisations
- **Notifications push** : Alertes temps reel quand une automatisation se declenche (capteur, seuil, etc.)
- **Diagnostic IA** : Analyse des causes probables et recommandations pour chaque OT
- **Resume IA** : Synthese automatique des interventions
- **Anomalies capteurs** : Detection predictive par analyse de l'historique des mesures

### Consignations LOTO (Lockout/Tagout)
- Workflow de consignation en 4 etapes : Demande → Consignation → Intervention → Deconsignation
- **Cadenas multiples** : plusieurs utilisateurs peuvent poser leur cadenas sur une meme consignation. L'equipement n'est deconsigne que lorsque le dernier cadenas est retire
- **Points d'isolation** : definition des points d'isolation avec type (vanne, disjoncteur, etc.) et localisation
- **Signatures electroniques** : signature manuscrite + code PIN pour chaque etape du workflow
- **Suppression reservee aux administrateurs** : seuls les admins peuvent supprimer une consignation (statuts Demande/Annule/Deconsigne) avec confirmation
- **Journalisation complete** : toutes les operations LOTO (creation, consignation, cadenas, deconsignation, suppression) sont enregistrees dans le journal d'audit
- **Liaison OT/MP/Amelioration** : possibilite de lier une consignation a un ordre de travail, une maintenance preventive ou une amelioration, avec remplissage automatique de l'equipement, du motif et de la duree prevue
- **Icone cadenas cliquable** : dans les listes d'OT, d'ameliorations et de maintenance preventive, une icone cadenas coloree indique le statut LOTO et permet de naviguer vers la page LOTO
- **Mise a jour temps reel** : les icones cadenas se mettent a jour automatiquement via WebSocket
- **Filtres avances** : filtrage par periode (mois, annee, personnalisee) et par equipement (liste deroulante alphabetique) avec compteur de resultats
- **Types d'energie** : electrique, hydraulique, pneumatique, thermique, chimique, mecanique

### Ordres de travail
- Creation, assignation, suivi et historique complet
- Gestion des priorites, statuts et temps (estime vs reel)
- Pieces jointes multiples (photos, videos, documents jusqu'a 25 Mo)
- **Glisser-deposer (drag & drop)** : zone de depot visuelle avec feedback (bordure en pointilles, surbrillance bleue au survol) pour ajouter des fichiers par simple glisser-deposer depuis le bureau, en plus des boutons "Parcourir" et "Appareil photo"
- **Miniatures des pieces jointes** : affichage des miniatures d'images directement dans les formulaires de creation, modification et visualisation des ordres de travail. Les images protegees sont chargees via des blob URLs authentifies
- **Previsualisation des pieces jointes** : ouverture directe des fichiers (PDF, images, videos) dans le navigateur sans telechargement force
- **Galerie de pieces jointes** : miniatures cliquables avec lightbox plein ecran (navigation clavier, support images/PDF/videos/texte)
- Filtrage avance par date, periode, statut, priorite
- Templates d'ordres de travail reutilisables
- Bons de travail generables en PDF

### Equipements
- Inventaire complet avec structure hierarchique (parent/enfant)
- Suivi de l'etat operationnel, historique des maintenances
- Gestion des garanties, couts et compteurs (metres)
- Vues en liste et en arborescence
- **QR Codes** : Generation de QR codes et d'etiquettes imprimables pour chaque equipement. Le scan d'un QR code mene a une page publique affichant les informations de l'equipement et des actions rapides configurables (creation d'OT, signalement, demande, etc.). Les actions sont gerees depuis l'interface d'administration (Parametres > Actions QR)
- **Creation de Demande d'Intervention publique via QR Code** : Les utilisateurs non authentifies (operateurs, sous-traitants) peuvent creer une Demande d'Intervention directement depuis la page QR d'un equipement, via un formulaire mobile epure. Les photos peuvent etre jointes par glisser-deposer, appareil photo ou galerie. Une notification email est automatiquement envoyee aux responsables maintenance avec des boutons d'action "Convertir en OT" et "Refuser" integres

### Maintenance preventive
- Planification recurrente (hebdomadaire, mensuel, trimestriel, annuel)
- Planning visuel (calendrier Gantt)
- Checklists de maintenance, alertes automatiques
- Execution immediate possible

### Inventaire et achats
- Gestion des pieces detachees et alertes de stock bas
- Suivi des fournisseurs et des couts
- Demandes d'achat avec workflow de validation
- Historique des achats avec statistiques par utilisateur et par mois

### Surveillance et securite
- Plan de surveillance avec suivi des controles periodiques (onglets par annee, generation automatique des controles recurrents)
- **Correspondance intelligente** : L'IA analyse les rapports de controle et met a jour les controles existants au lieu de creer des doublons. Calcul automatique de l'ecart (jours) entre date prevue et date de realisation
- **Correspondance manuelle** : En cas d'ambiguite, l'utilisateur peut confirmer ou creer un nouveau controle
- Rapports de surveillance (3 modes : cartes, tableau, graphiques) avec filtrage par annee et KPIs (taux de realisation, ecart moyen, respect des delais)
- Export PDF et Excel des rapports de surveillance
- Gestion des presqu'accidents avec formulaire enrichi (7 sections : identification, description, personnes, evaluation risque, equipement, actions, pieces jointes)
- Champs presqu'accidents : categorie d'incident, equipement lie FSAO, mesures immediates, type lesion potentielle, temoins, conditions, facteurs contributifs
- Integration cameras (snapshots, alertes via Frigate/MQTT)
- Autorisations particulieres (formulaires et suivi)

### M.E.S. (Manufacturing Execution System)
- Suivi de production en temps reel
- Calcul automatique de cadence (par minute, via scheduler)
- Rapports M.E.S. planifies

### Progressive Web App (PWA)
- **Installation sur l'ecran d'accueil** : FSAO Iris peut etre installe comme une application native
  - **Android** : Via le navigateur Chrome, bouton "Ajouter a l'ecran d'accueil" ou banniere d'installation automatique
  - **iOS** : Via Safari, bouton Partager → "Sur l'ecran d'accueil"
- **Notifications push navigateur** (Web Push via VAPID/pywebpush) : alertes automatiques envoyees sur les appareils mobiles et desktop lors de l'assignation d'un OT, changement de statut, panne equipement ou message prive
- **Fonctionnement hors-ligne partiel** : cache intelligent des ressources statiques via Service Worker
- **Mise a jour automatique et cache-busting** : le Service Worker detecte les nouvelles versions et met a jour le cache. Un fichier `version.json` est mis a jour a chaque build. Un hook React (`useVersionCheck`) verifie periodiquement ce fichier (toutes les 5 minutes + au retour sur l'onglet) et declenche un rechargement automatique de la page si une nouvelle version est detectee, eliminant le besoin de `CTRL+MAJ+F5`

### Interface mobile responsive
- **Header adaptatif** : les icones secondaires (backup, cameras, M.E.S., alertes MQTT, surveillance, inventaire) sont masquees sur mobile pour ne garder que les icones essentielles (chat, echeances, notifications, OT, profil)
- **Sidebar overlay** : sur les ecrans mobiles (< 768px), la sidebar se transforme en panneau superpose avec un fond sombre, au lieu de pousser le contenu
- **Menu hamburger** : icone standard pour ouvrir/fermer la sidebar sur mobile
- **Viewport optimise iOS** : support de `viewport-fit=cover` et prevention du defilement horizontal

### Navigation intelligente depuis le header (deep-linking)
- **Cloche multi-badges** : L'icone cloche du header affiche 3 badges colores independants :
  - **Rouge** : nombre d'ordres de travail en attente (statut EN_ATTENTE)
  - **Violet** : nombre d'ameliorations en attente
  - **Vert** : nombre de maintenances preventives echues (date depassee)
  - Cliquer sur la cloche ouvre un menu deroulant avec acces direct a chaque categorie, avec le filtre pre-applique
- **Clic sur les badges du header** : redirige vers la page correspondante avec des filtres pre-appliques
  - Icone echeances (calendrier) → page correspondante filtree sur les elements en retard
  - Icone surveillance (oeil) → plan de surveillance filtre sur les controles en retard
  - Icone inventaire (package) → inventaire filtre sur les articles en alerte
- **Ouverture directe** : les notifications in-app permettent d'ouvrir directement un OT specifique

### Journal des modifications ("Quoi de neuf ?")
- Panneau lateral accessible depuis l'icone "Sparkles" dans le header
- Badge "NEW" signalant les nouvelles versions non lues
- Interface d'administration pour gerer les versions et leurs entrees (Parametres > Changelog)
- Systeme de feedback utilisateur (pouce haut/bas) sur chaque version
- Statistiques de vote visibles pour l'administrateur
- La version affichee sur la page de connexion est automatiquement synchronisee avec le dernier numero de version du changelog

### Communication et collaboration
- Chat en temps reel (WebSocket) avec previsualisation des fichiers joints
- Tableau d'affichage collaboratif (Whiteboard, WebSocket)
- Consignes inter-equipes avec acquittement
- Notifications temps reel pour les ordres de travail et equipements
- **Notifications push mobile** : via PWA (Web Push VAPID) pour navigateurs et via Expo Push Service pour l'application mobile native
- **Nettoyage automatique des tokens push** : verification periodique des accuses de reception Expo et desactivation des tokens invalides

### Rapports et analytics
- Tableaux de bord en temps reel
- Dashboard personnalisable avec widgets custom
- **Dashboard Service par onglets** : 9 onglets independants (ADV, LOGISTIQUE, PRODUCTION, QHSE, MAINTENANCE, LABO, INDUS, DIRECTION, AUTRE), chacun avec ses propres widgets personnalises, preference d'onglet sauvegardee par utilisateur
- **Widgets connectes aux donnees reelles** : endpoint `/api/dashboard/widget-data` fournissant 10 metriques en temps reel (OT en cours, taux completion, MTTR, stock alerte, etc.)
- **Widgets personnalises avec sources Excel** : upload de fichier Excel local (.xlsx, .xls, .csv) ou connexion a un serveur Samba/reseau
- **Pre-visualisation interactive Excel** : apres upload, grille type tableur avec lettres de colonnes (A, B, C...) et numeros de lignes, modes de selection Cellule/Colonne pour remplir automatiquement les references, onglets pour fichiers multi-feuilles
- **Constructeur visuel de formules** : interface drag-and-click remplacant la saisie manuelle, avec chips cliquables pour les sources ($Source1, $Source2), boutons operateurs (+, -, *, /, %), palette de fonctions par categorie (Math: SUM/AVG/MIN/MAX/ROUND, Logique: IF/IFERROR, Pourcentage: PERCENTAGE/GROWTH_RATE), apercu avec coloration syntaxique et evaluation en temps reel (debounce 600ms)
- Statistiques detaillees et analyse des couts
- Exports PDF, Excel, CSV (admin)
- Rapports hebdomadaires automatiques par email

### Import / Export et sauvegardes
- Import/export de 63 modules (selecteur par 12 categories)
- Export complet en ZIP (data.xlsx + fichiers uploades)
- Import ZIP pour restauration complete
- Sauvegardes automatiques planifiees (quotidien/hebdo/mensuel)
- Destinations : local, Google Drive, ou les deux
- Nettoyage automatique (retention 1 a 5 backups)
- Verification d'integrite des archives ZIP
- Historique avec telechargement, notifications email
- Icone de statut dans le header (vert = backup recent)

### Gestion des utilisateurs et roles
- 10+ roles preconfigures : Administrateur, Technicien, Responsable Maintenance, Chef de Production, Responsable QHSE, etc.
- Permissions granulaires par module (view, edit, delete) - **48 modules** configurables
- **Modules recents** : Consignations LOTO, Contrats, Dashboard Service, Formation, Autorisations Particulieres
- **Modules IA** : Tableau de bord IA, Automatisations IA, Widgets IA (Adria) - configurables par role
- **Migration automatique** : endpoint `/api/roles/migrate-permissions` pour ajouter les permissions manquantes aux roles existants
- Gestion des equipes, services et responsables hierarchiques
- Planning de disponibilite
- Preferences utilisateur personnalisees

### IoT et capteurs
- Dashboard IoT avec visualisation des capteurs
- Integration MQTT (publication/souscription, logs)
- Collecte automatique de donnees capteurs et compteurs

### Documentation et journal
- Gestion documentaire avec explorateur de fichiers
- Manuel integre avec chapitres
- Journal d'activite complet (audit)

### Systeme de mise a jour
- Detection automatique des nouvelles versions (comparaison commit Git)
- Mise a jour en un clic depuis l'interface admin
- Avertissement broadcast a tous les utilisateurs connectes avant MAJ
- Script post-update automatique (dependances + rebuild frontend)
- Messages d'erreur detailles en cas d'echec (etape exacte identifiee)
- Historique des mises a jour avec erreurs et avertissements visibles
- Endpoint de diagnostic `/api/qr/check-deps` pour verifier les dependances

### Autres
- Demandes d'arret de maintenance avec workflow email
- Demandes d'amelioration avec suivi
- Demandes d'intervention avec pieces jointes, glisser-deposer, conversion en OT et transfert automatique des photos
- **KPI Demandes d'Intervention sur le Dashboard** : indicateurs en temps reel affichant le nombre de DI en attente et le temps de reponse moyen, mis a jour automatiquement
- Acces SSH distant depuis l'interface (admin)
- Configuration Tailscale depuis l'interface web
- Gestion des fuseaux horaires

### Visite guidee personnalisee par profil
- A la premiere connexion, une visite guidee interactive presente les modules de l'application
- La visite est **automatiquement adaptee au profil** (service) de l'utilisateur connecte :
  - **Maintenance** : Equipements, Ordres de travail, Maintenance preventive, Planning, Inventaire, Demandes d'intervention
  - **Production** : M.E.S., Planning, Ordres de travail, Demandes d'intervention, Compteurs, Presqu'accidents
  - **QHSE** : Presqu'accidents + IA, Rapport Presqu'accidents, Analytics Checklists, Plan de Surveillance, Documentations, Contrats
  - **Logistique / ADV** : Inventaire, Demandes d'achat, Fournisseurs, Equipements, Historique Achat
  - **Direction / Admin** : Dashboard Service, Rapports, Gestion d'equipe, Utilisateurs, Rapport Presqu'accidents, Rapports Hebdomadaires
  - **Generique** (aucun service defini) : Equipements, Ordres de travail, Planning, Presqu'accidents, Rapports
- Les etapes communes (menu, dashboard, notifications, chat, assistant IA) sont presentes pour tous les profils
- Les textes de chaque etape sont adaptes au metier de l'utilisateur
- La visite peut etre relancee a tout moment depuis les parametres

---

## Architecture technique

```
fsao-iris/
├── backend/                    # API FastAPI (Python 3.11+)
│   ├── server.py               # Point d'entree principal (~9000 lignes)
│   ├── models.py               # Modeles Pydantic
│   ├── auth.py                 # Authentification JWT + bcrypt
│   ├── dependencies.py         # Dependances FastAPI (auth guards)
│   ├── *_routes.py             # 35+ modules de routes API
│   ├── custom_widgets_routes.py # Widgets personnalises (templates, upload Excel, preview, formules)
│   ├── formula_engine.py       # Moteur de formules (SUM, AVG, IF, PERCENTAGE, etc.)
│   ├── ai_maintenance_routes.py # IA : checklists, maintenance, non-conformites
│   ├── ai_presqu_accident_routes.py # IA : causes racines, incidents similaires, tendances, rapport QHSE
│   ├── *_service.py            # 16 services metier
│   ├── websocket_manager.py    # Chat WebSocket
│   ├── realtime_manager.py     # Notifications temps reel
│   ├── notifications.py        # Notifications push mobile (Expo)
│   ├── whiteboard_manager.py   # Tableau d'affichage WebSocket
│   ├── mqtt_manager.py         # Integration MQTT
│   ├── backup_service.py       # Sauvegardes auto (local + Google Drive)
│   ├── backup_routes.py        # API sauvegardes + OAuth Google Drive
│   ├── import_export_routes.py # Import/export 63 modules
│   ├── update_service.py       # Mises a jour depuis GitHub
│   ├── migrations/             # Scripts de migration DB
│   ├── uploads/                # Fichiers uploades
│   └── .env                    # Configuration (voir ci-dessous)
│
├── frontend/                   # Application React 19
│   ├── src/
│   │   ├── pages/              # 66 pages
│   │   ├── components/         # Composants reutilisables
│   │   │   ├── ui/             # Shadcn/UI
│   │   │   ├── chat/           # Chat temps reel
│   │   │   ├── Common/         # Composants communs (AIChatWidget, adriaCommandHandlers)
│   │   │   └── Surveillance/   # Plan de surveillance (ManualMatchDialog, SurveillanceAIExtract)
│   │   └── hooks/              # Hooks React personnalises
│   ├── public/                 # Assets statiques
│   ├── nginx.conf              # Config Nginx production
│   └── package.json            # Dependances (React 19, Tailwind, etc.)
│
├── gmao-iris-install.sh        # Script installation Proxmox (complet)
├── gmao-ssl-gdrive-setup.sh    # Script post-install SSL + Google Drive
├── updates/                    # Metadonnees de version
│   └── version.json
├── CHANGELOG.md                # Notes de version
└── README.md                   # Ce fichier
```

### Stack technique

| Couche      | Technologie                                     |
|-------------|--------------------------------------------------|
| Frontend    | React 19, Shadcn/UI, Tailwind CSS, Lucide Icons |
| Backend     | FastAPI (Python 3.11+), Uvicorn                  |
| Base de donnees | MongoDB 7.0+                                |
| Temps reel  | WebSocket (chat, whiteboard, notifications)      |
| Scheduler   | APScheduler (backups, rapports, M.E.S.)          |
| Auth        | JWT + bcrypt                                     |
| Serveur web | Nginx (reverse proxy, SSL, static files)         |
| Process     | Supervisor                                       |
| Notifications | Web Push (VAPID/pywebpush) + Expo Push          |
| PWA         | Service Worker, manifest.json, installation mobile |
| Deploiement | Proxmox LXC (Debian 12)                         |
| IA          | Emergent LLM (Gemini 2.5 Flash) - assistant Adria, analyse QHSE, generation documents |

---

## Installation

### Installation Proxmox LXC (recommandee)

Le script d'installation cree automatiquement un container LXC Debian 12 avec tout le necessaire.

**Depuis le serveur Proxmox (host) :**

```bash
bash gmao-iris-install.sh
```

Le script interactif vous demandera :
- Token GitHub (acces au depot prive)
- Configuration reseau (IP statique ou DHCP)
- Identifiants administrateur
- Mode d'acces distant (URL manuelle, Tailscale, ou local uniquement)

**Ce qui est installe automatiquement :**
- MongoDB 7.0, Node.js 20, Python 3.11+, Nginx, Supervisor
- Build complet du frontend (yarn)
- Environnement virtuel Python avec toutes les dependances
- Comptes administrateurs, services configures et demarres
- Hooks Git pour mise a jour automatique des dependances

### Post-installation : SSL + Google Drive

Apres l'installation, executez le script de configuration SSL et Google Drive **dans le container LXC** :

```bash
sudo bash gmao-ssl-gdrive-setup.sh
```

Ce script interactif :
1. Demande votre nom de domaine (ex: `fsaoiris.duckdns.org`)
2. Verifie la resolution DNS
3. Installe Certbot et genere un certificat SSL Let's Encrypt
4. Configure Nginx avec HTTPS (redirection HTTP, proxy API, WebSocket)
5. Met a jour le `.env` backend (URLs HTTPS, Google Drive)
6. Configure le renouvellement automatique du certificat
7. Redemarre les services et teste la connexion

### Installation Docker (alternative)

```bash
git clone https://github.com/Kinder0083/GMAO.git
cd GMAO
docker-compose up -d
```

**Acces :**
- Frontend : `http://localhost:3000`
- API : `http://localhost:8001`
- Documentation API : `http://localhost:8001/docs`

---

## Configuration

### Variables d'environnement backend (`backend/.env`)

```env
# Base de donnees
MONGO_URL=mongodb://localhost:27017
DB_NAME=gmao_iris

# Securite
SECRET_KEY=<cle_generee_openssl_rand_hex_32>

# URLs (adapter a votre domaine)
FRONTEND_URL=https://votre-domaine.com
BACKEND_URL=https://votre-domaine.com
APP_URL=https://votre-domaine.com

# SMTP (emails)
SMTP_SERVER=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=votre-email@gmail.com
SMTP_PASSWORD=<mot_de_passe_application>
SMTP_SENDER_EMAIL=votre-email@gmail.com
SMTP_FROM_NAME=FSAO Iris
SMTP_USE_TLS=true

# Google Drive (optionnel - pour sauvegardes cloud)
GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxx
GOOGLE_DRIVE_REDIRECT_URI=https://votre-domaine.com/api/backup/drive/callback

# IA (assistant chat)
EMERGENT_LLM_KEY=sk-emergent-xxxx

# Notifications Push PWA (Web Push VAPID)
VAPID_PUBLIC_KEY=<cle_publique_VAPID>
VAPID_PRIVATE_KEY=<cle_privee_VAPID>
VAPID_CLAIMS_EMAIL=mailto:votre-email@domaine.com

# Cameras (optionnel)
CAMERA_ENCRYPTION_KEY=<cle_generee>

# Documentation API
DOCS_USER=admin
DOCS_PASS=<mot_de_passe>
```

### Configuration Google Drive

Pour utiliser Google Drive comme destination de sauvegarde :

**Etape 1 : Creer un projet Google Cloud**
1. Allez sur [Google Cloud Console](https://console.cloud.google.com)
2. Creez un nouveau projet (ou selectionnez un projet existant)
3. Notez le **numero du projet** (visible dans les parametres du projet)

**Etape 2 : Activer l'API Google Drive (OBLIGATOIRE)**
1. Dans le menu lateral, allez dans **APIs & Services > Bibliotheque**
2. Recherchez **"Google Drive API"**
3. Cliquez dessus puis cliquez sur **"Activer"** (Enable)
4. **Attendez 1-2 minutes** pour que l'activation se propage

> **IMPORTANT :** Sans cette etape, vous obtiendrez une erreur `HttpError 403 - accessNotConfigured` lors de l'upload vers Google Drive. Lien direct pour activer : `https://console.developers.google.com/apis/api/drive.googleapis.com/overview?project=VOTRE_NUMERO_PROJET`

**Etape 3 : Configurer l'ecran de consentement OAuth**
1. Allez dans **APIs & Services > Ecran de consentement OAuth**
2. Choisissez **"Externe"** comme type d'utilisateur
3. Remplissez les champs obligatoires (nom de l'application, email de contact)
4. Dans les **Scopes**, ajoutez : `https://www.googleapis.com/auth/drive.file`
5. Dans **Utilisateurs test**, ajoutez votre adresse email Google
6. Publiez ou gardez en mode test (suffisant pour usage interne)

**Etape 4 : Creer les identifiants OAuth 2.0**
1. Allez dans **APIs & Services > Identifiants**
2. Cliquez sur **"Creer des identifiants" > "ID client OAuth"**
3. Type d'application : **Application Web**
4. Nom : `FSAO Iris` (ou autre)
5. **URI de redirection autorisee** : ajoutez exactement :
   ```
   https://votre-domaine.com/api/backup/drive/callback
   ```
6. Copiez le **Client ID** et le **Client Secret** generes

**Etape 5 : Configurer le backend**
1. Renseignez les variables dans `backend/.env` :
   ```env
   GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=GOCSPX-xxxx
   GOOGLE_DRIVE_REDIRECT_URI=https://votre-domaine.com/api/backup/drive/callback
   ```
2. Redemarrez le backend :
   ```bash
   supervisorctl restart gmao-iris-backend
   ```

**Etape 6 : Connecter depuis l'application**
1. Dans FSAO Iris : **Import/Export > Sauvegardes Automatiques**
2. Cliquez sur **"Connecter Google Drive"**
3. Autorisez l'acces dans la fenetre Google
4. Vous devriez voir le statut **"Connecte"** en vert

**Comportement des sauvegardes Google Drive :**
- Les sauvegardes sont automatiquement stockees dans un dossier **"Backup FSAO"** sur Google Drive
- Le dossier est cree automatiquement s'il n'existe pas
- Vous pouvez egalement uploader manuellement un backup existant vers Google Drive via l'icone d'upload dans l'historique des sauvegardes

### Checklist rapide Google Drive

| Etape | Verification |
|-------|-------------|
| API Google Drive activee | Console Google > APIs & Services > Bibliotheque > Google Drive API > **Activee** |
| Ecran de consentement configure | Console Google > APIs & Services > Ecran de consentement > **Configure** |
| Identifiants OAuth crees | Console Google > APIs & Services > Identifiants > **ID client OAuth present** |
| URI de redirection correcte | L'URI dans Google Cloud = `GOOGLE_DRIVE_REDIRECT_URI` dans `.env` |
| Variables `.env` renseignees | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_DRIVE_REDIRECT_URI` |
| Backend redemarre | `supervisorctl restart gmao-iris-backend` apres modification du `.env` |
| Connexion dans l'app | Import/Export > Sauvegardes Automatiques > **Connecte (vert)** |

---

## Utilisation

### Comptes par defaut (apres installation Proxmox)

1. **Compte administrateur** : defini pendant l'installation
2. **Compte de secours** : `buenogy@gmail.com` / `Admin2024!`

> Changez ou supprimez le compte de secours en production.

### Endpoints API principaux

| Methode | Endpoint | Description |
|---------|----------|-------------|
| POST | `/api/auth/login` | Authentification |
| GET | `/api/auth/me` | Profil utilisateur |
| GET | `/api/work-orders` | Ordres de travail |
| PUT | `/api/work-orders/{id}` | Modifier un OT (statut, assignation, description...) |
| GET | `/api/equipments` | Equipements |
| GET | `/api/preventive-maintenance` | Maintenance preventive |
| GET | `/api/inventory` | Inventaire |
| POST | `/api/export/{module}` | Export donnees (admin) |
| POST | `/api/import/{module}` | Import donnees (admin) |
| GET | `/api/backup/schedules` | Planifications de sauvegarde |
| POST | `/api/backup/run` | Sauvegarde manuelle |
| POST | `/api/backup/drive/upload/{id}` | Upload manuel d'un backup vers Google Drive |
| GET | `/api/backup/drive/connect` | Connexion OAuth Google Drive |
| GET | `/api/backup/drive/status` | Statut connexion Google Drive |
| GET | `/api/version` | Version de l'application (dynamique depuis changelog) |
| GET | `/api/bell-counts` | Compteurs cloche header (OT, ameliorations, preventif) |
| GET | `/api/releases` | Journal des modifications (changelog) |
| POST | `/api/releases` | Ajouter une version au changelog (admin) |
| POST | `/api/releases/{id}/vote` | Voter (pouce haut/bas) sur une version |
| GET | `/api/qr/equipment/{id}/image` | Generer le QR code d'un equipement (PNG) |
| GET | `/api/qr/equipment/{id}/label` | Generer une etiquette QR imprimable (PNG) |
| GET | `/api/qr/page/{id}` | Donnees page publique QR d'un equipement |
| GET | `/api/qractions` | Actions rapides configurees pour les pages QR |
| GET | `/api/qr/check-deps` | Diagnostic des dependances QR |
| POST | `/api/updates/broadcast-warning` | Avertissement avant MAJ |
| POST | `/api/ai/chat` | Chat avec l'assistante IA Adria |
| POST | `/api/ai/checklist/generate-from-doc` | IA : generer checklist depuis document |
| POST | `/api/ai/maintenance/generate-from-doc` | IA : generer plan maintenance depuis document |
| POST | `/api/ai-maintenance/analyze-nonconformities` | IA : analyser non-conformites checklists |
| POST | `/api/ai-maintenance/create-curative-wos` | IA : creer OT curatifs |
| POST | `/api/ai-presqu-accident/analyze-root-causes` | IA : analyse causes racines (5 Pourquoi + Ishikawa) |
| POST | `/api/ai-presqu-accident/find-similar` | IA : detection incidents similaires |
| POST | `/api/ai-presqu-accident/analyze-trends` | IA : analyse tendances presqu'accidents |
| POST | `/api/ai-presqu-accident/generate-report` | IA : rapport synthese QHSE |
| POST | `/api/surveillance/create-batch-from-ai` | Correspondance intelligente Plan de Surveillance |
| POST | `/api/surveillance/confirm-match` | Confirmation manuelle d'une correspondance |
| GET | `/api/surveillance/rapport-stats` | KPIs du rapport de surveillance |
| POST | `/api/qr/public/intervention-request` | Creation d'une DI publique (sans authentification) depuis le QR code |
| POST | `/api/qr/public/intervention-request/{id}/attachments` | Ajout de pieces jointes a une DI publique |
| GET | `/api/stats/intervention-requests` | Statistiques et KPIs des demandes d'intervention (en attente, temps de reponse) |
| GET | `/api/intervention-requests/{id}/attachments/{att_id}` | Telecharger une piece jointe de DI (authentifie) |
| GET | `/api/work-orders/{id}/attachments/{att_id}` | Telecharger une piece jointe d'OT (authentifie) |
| GET | `/api/loto/` | Liste des consignations LOTO |
| POST | `/api/loto/` | Creer une consignation LOTO |
| GET | `/api/loto/{id}` | Detail d'une consignation |
| DELETE | `/api/loto/{id}` | Supprimer une consignation (admin) |
| POST | `/api/loto/{id}/workflow` | Action workflow (consigner, deconsigner...) |
| POST | `/api/loto/{id}/cadenas` | Poser ou retirer un cadenas |
| GET | `/api/loto/stats` | Statistiques des consignations |
| GET | `/api/loto/by-linked` | Consignations par entite liee |
| POST | `/api/push-notifications/register` | Enregistrer un token push (mobile) |
| DELETE | `/api/push-notifications/unregister` | Desactiver un token push |
| POST | `/api/push-notifications/test` | Envoyer une notification push de test |
| GET | `/api/dashboard/widget-data` | Donnees temps reel pour les widgets du dashboard principal |
| GET | `/api/custom-widgets?service={name}` | Widgets personnalises filtres par service |
| GET | `/api/custom-widgets/tpl/list` | Templates de widgets predefinis |
| POST | `/api/custom-widgets/tpl/{id}/create` | Creer un widget depuis un template |
| POST | `/api/custom-widgets/upload/excel` | Upload de fichier Excel local (.xlsx, .xls, .csv) |
| POST | `/api/custom-widgets/preview/excel-local/{id}` | Pre-visualisation interactive d'un fichier Excel uploade |
| POST | `/api/custom-widgets/test/formula` | Tester une formule avec des valeurs de test |
| GET | `/api/roles/services/list` | Liste des services pour les onglets du Dashboard Service |
| POST | `/api/roles/migrate-permissions` | Migration des permissions manquantes pour roles existants |
| PATCH | `/api/users/me/preferences` | Sauvegarder les preferences utilisateur (onglet actif, etc.) |
| WS | `/ws/chat/` | Chat temps reel |
| WS | `/ws/whiteboard/` | Tableau d'affichage |
| WS | `/api/ws/realtime/{entity}` | Notifications temps reel |

Documentation Swagger complete : `https://votre-domaine.com/docs` (identifiants dans `.env`)

---

## Administration

### Commandes Proxmox

```bash
# Entrer dans le container
pct enter <CTID>

# Statut des services
supervisorctl status
systemctl status mongod
systemctl status nginx

# Logs backend
tail -f /var/log/gmao-iris-backend.err.log
tail -f /var/log/gmao-iris-backend.out.log

# Redemarrer le backend
supervisorctl restart gmao-iris-backend

# Tester et redemarrer Nginx
nginx -t && systemctl reload nginx

# Mise a jour manuelle
cd /opt/gmao-iris && ./update.sh
```

### Sauvegardes

**Via l'interface (recommande) :**
- Import/Export > Sauvegardes Automatiques
- Planifier des backups quotidiens/hebdomadaires/mensuels
- Destinations : local, Google Drive, ou les deux
- Les heures des planifications utilisent le fuseau horaire configure dans Parametres > Fuseau horaire
- Upload manuel vers Google Drive : cliquez sur l'icone d'upload a cote d'un backup dans l'historique
- Les fichiers sont stockes dans le dossier **"Backup FSAO"** sur Google Drive
- Icone disquette dans le header : **vert** = backup recent reussi, **rouge** = echec, **gris** = aucun ou ancien

**Via la ligne de commande :**
```bash
# Backup MongoDB
mongodump --db gmao_iris --out /backup/fsao-$(date +%Y%m%d)

# Snapshot Proxmox (depuis le host)
vzdump <CTID> --mode snapshot --compress zstd
```

### SSL / Certificat

```bash
# Verifier le certificat
certbot certificates

# Renouveler manuellement
certbot renew

# Le renouvellement automatique est configure via cron ou certbot.timer
```

---

## Depannage

### Backend ne demarre pas

```bash
# Verifier les logs
tail -50 /var/log/gmao-iris-backend.err.log

# Verifier MongoDB
systemctl status mongod

# Reinstaller les dependances
cd /opt/gmao-iris/backend
source venv/bin/activate
pip install -r requirements.txt
pip install emergentintegrations --extra-index-url https://d33sy5i8bnduwe.cloudfront.net/simple/
supervisorctl restart gmao-iris-backend
```

### Erreur 502 Bad Gateway

```bash
# Verifier que le backend tourne
supervisorctl status gmao-iris-backend

# Redemarrer
supervisorctl restart gmao-iris-backend
sleep 5
nginx -t && systemctl reload nginx
```

### Impossible de se connecter

```bash
cd /opt/gmao-iris/backend
source venv/bin/activate

# Lister les utilisateurs
python3 -c "
from pymongo import MongoClient
import os
from dotenv import load_dotenv
load_dotenv()
client = MongoClient(os.environ['MONGO_URL'])
db = client[os.environ.get('DB_NAME', 'gmao_iris')]
for user in db.users.find():
    print(f\"Email: {user['email']}, Role: {user['role']}, Statut: {user.get('statut','?')}\")
"
```

### Google Drive : erreur de connexion

Si le callback OAuth echoue, le message d'erreur s'affiche dans un toast sur la page Import/Export.
Causes frequentes :
- **redirect_uri_mismatch** : L'URI dans Google Cloud Console ne correspond pas a `GOOGLE_DRIVE_REDIRECT_URI` dans le `.env`
- **invalid_grant** : Le code d'autorisation a expire (reessayez)
- **Packages manquants** : Verifiez que `google-auth-oauthlib` est installe (`pip list | grep google`)

### Google Drive : erreur lors de l'upload (403)

Si l'upload vers Google Drive echoue avec une erreur `HttpError 403 - accessNotConfigured` :
1. **L'API Google Drive n'est pas activee** dans votre projet Google Cloud
2. Allez sur : `https://console.developers.google.com/apis/api/drive.googleapis.com/overview?project=VOTRE_NUMERO_PROJET`
3. Cliquez sur **"Activer"**
4. Attendez **1-2 minutes** puis reessayez
5. Si vous venez d'activer l'API, il peut falloir jusqu'a 5 minutes pour la propagation

### Sauvegardes planifiees ne se declenchent pas

Si les backups planifies ne s'executent pas a l'heure prevue :
1. **Verifiez le fuseau horaire** : Parametres > Fuseau Horaire. Le scheduler utilise ce fuseau pour determiner l'heure de declenchement
2. **Verifiez les logs** : `tail -100 /var/log/gmao-iris-backend.err.log | grep Backup`
3. Vous devriez voir : `[Backup] Fuseau horaire configure: GMT+X` au demarrage
4. **Redemarrez le backend** apres avoir modifie le fuseau horaire : `supervisorctl restart gmao-iris-backend`

### PWA : Banniere d'installation absente

Si la banniere d'installation de la PWA n'apparait pas :
1. **HTTPS obligatoire** : La PWA necessite une connexion HTTPS (via Tailscale Funnel, Let's Encrypt, etc.)
2. **Navigateur compatible** : Chrome (Android), Safari (iOS). Firefox ne supporte pas l'installation PWA
3. **Deja installe ?** : Si l'application est deja installee, la banniere ne s'affiche plus
4. **Cache** : Videz le cache du navigateur (`Ctrl+Shift+Delete` ou parametres Safari)
5. **Sur iOS** : Il n'y a pas de banniere automatique. Utilisez le bouton Partager → "Sur l'ecran d'accueil"

### PWA : Notifications push non recues

Si les notifications push ne fonctionnent pas :
1. **Verifiez les cles VAPID** dans `backend/.env` (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_CLAIMS_EMAIL`)
2. **HTTPS obligatoire** : Les notifications Web Push ne fonctionnent qu'en HTTPS
3. **Autorisez les notifications** : Le navigateur doit avoir autorise les notifications pour le site
4. **Verifiez l'abonnement** : Dans Parametres > Notifications, verifiez que l'abonnement push est actif
5. **Cache Service Worker** : Si le SW est ancien, videz le cache et rechargez. Le versionnement du cache dans `sw.js` force les mises a jour
6. **Generez de nouvelles cles VAPID** si necessaire :
   ```bash
   cd /opt/gmao-iris/backend
   source venv/bin/activate
   python3 -c "from py_vapid import Vapid; v = Vapid(); v.generate_keys(); print('Public:', v.public_key); print('Private:', v.private_key)"
   ```

---

## Collections MongoDB

| Collection | Description |
|------------|-------------|
| `users` | Utilisateurs et permissions |
| `work_orders` | Ordres de travail |
| `equipments` | Equipements (hierarchie parent/enfant) |
| `preventive_maintenance` | Plans de maintenance preventive |
| `inventory` | Pieces et stock |
| `locations` | Emplacements |
| `vendors` | Fournisseurs |
| `backup_schedules` | Planifications de sauvegarde |
| `backup_history` | Historique des sauvegardes |
| `backup_status` | Statut derniere sauvegarde |
| `drive_credentials` | Tokens OAuth Google Drive |
| `surveillance_plans` | Plans de surveillance |
| `presqu_accidents` | Presqu'accidents (enrichi: categorie, equipement, lesion, facteurs, temoins, conditions) |
| `improvement_requests` | Demandes d'amelioration |
| `loto_consignations` | Consignations LOTO (workflow, cadenas, signatures) |
| `purchase_requests` | Demandes d'achat |
| `releases` | Journal des modifications (changelog, feedback) |
| `qractions` | Actions rapides pour pages QR (label, url, icone, auth) |
| `chat_messages` | Messages de chat |
| `consignes` | Consignes inter-equipes |
| `documentations` | Documents |
| `sensors` | Capteurs IoT |
| `ai_analysis_history` | Historique des analyses IA (causes racines, tendances, rapports) |
| `ai_pa_archives` | Archives des analyses IA presqu'accidents |
| `custom_widgets` | Widgets personnalises par service |
| `uploaded_excel_files` | Fichiers Excel uploades pour les widgets |
| `notifications` | Notifications in-app (inclut alertes IA critiques) |
| `device_tokens` | Tokens push pour notifications mobiles (Expo) |
| ... | Et 40+ autres collections |

---

## Developpement

### Frontend

```bash
cd frontend
yarn install
yarn start     # Serveur dev sur http://localhost:3000
```

### Backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn server:app --reload --port 8001
```

---

## Licence

Ce projet est sous licence Proprietaire.

## Support

- Documentation API : `/docs` (Swagger) ou `/redoc`
- Logs : `/var/log/gmao-iris-backend.err.log`
- Issues : GitHub

---

**Developpe par Greg**
**Version 1.10.0 - Mars 2026**
