# FSAO Iris - GMAO (Gestion de la Maintenance Assistée par Ordinateur)

## Problème original
Application CMMS/GMAO complète pour la gestion de la maintenance industrielle, développée avec React/FastAPI/MongoDB.

## Personas utilisateurs
- **Administrateurs** : Gestion complète (équipements, utilisateurs, rapports, configuration)
- **Techniciens** : Exécution des ordres de travail, suivi des interventions
- **Managers** : Supervision, rapports, analyses

## Architecture technique
- **Frontend** : React, Tailwind CSS, Shadcn UI, jsPDF
- **Backend** : FastAPI (Python) - Architecture modulaire avec 22+ fichiers de routes core + 51 modules externes
- **Base de données** : MongoDB (Motor async)
- **Temps réel** : WebSockets (realtime_manager)
- **Intégrations** : OpenAI/Emergent LLM Key, Web Push PWA (VAPID)

## Tâches complétées
- [x] Edition/Suppression des entrées de temps dans les OT (Admin only) + audit
- [x] Edition/Suppression des commentaires dans les OT (Admin only) + audit
- [x] Filtres de période fonctionnels sur page Rapports & Analytiques
- [x] Refactoring massif de server.py (13000 → 1740 lignes)
- [x] Section Architecture Backend & Services dans Santé Système
- [x] Correction dropdown Equipement OT/DI (parent/sous-equipement)
- [x] **Export PDF et Impression des OT** :
  - Bouton "Export PDF" : génère et télécharge un PDF avec jsPDF
  - Bouton imprimante : ouvre le dialogue d'impression du navigateur
  - Contenu : en-tête logo FSAO + numéro OT, titre, description, dates, temps estimé, emplacement, équipement, rapport détaillé (commentaires), pièces jointes, photos adaptées
  - Photos en grande taille, débordement sur page 2 si nécessaire
  - Pied de page avec numéro OT et pagination

## Backlog
- **(P3)** Tester le script de mise à jour `MAJ_FSAO.sh`
- En attente des consignes utilisateur

## Credentials de test
- Admin: buenogy@gmail.com / TestAdmin2026!
