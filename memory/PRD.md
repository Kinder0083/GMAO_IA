# FSAO Iris - GMAO (Gestion de la Maintenance Assistée par Ordinateur)

## Problème original
Application CMMS/GMAO complète pour la gestion de la maintenance industrielle, développée avec React/FastAPI/MongoDB.

## Architecture technique
- **Frontend** : React, Tailwind CSS, Shadcn UI, jsPDF
- **Backend** : FastAPI (Python) - Architecture modulaire (22+ modules core + 51 externes)
- **Base de données** : MongoDB (Motor async)
- **Temps réel** : WebSockets (realtime_manager)

## Tâches complétées
- [x] Edition/Suppression temps et commentaires OT (Admin only) + audit
- [x] Filtres de période page Rapports & Analytiques
- [x] Refactoring massif server.py (13000 -> 1740 lignes)
- [x] Section Architecture Backend dans Santé Système
- [x] Correction dropdown Equipement OT/DI (parent/sous-equipement)
- [x] Export PDF et Impression OT individuels (dans le dialog)
- [x] **Export PDF et Impression groupés** :
  - Boutons "Export PDF" + icône imprimante dans le header de la page OT
  - Mode sélection avec checkboxes sur chaque OT
  - Barre flottante : "Tout sélectionner" / "Tout désélectionner" / "Annuler" / "Valider"
  - Génération d'un seul PDF avec tous les OT sélectionnés (un par page)
  - Chaque OT : logo FSAO + numéro, titre, description, dates, commentaires, pièces jointes, photos

## Backlog
- **(P3)** Tester le script de mise à jour `MAJ_FSAO.sh`
- En attente des consignes utilisateur

## Credentials de test
- Admin: buenogy@gmail.com / TestAdmin2026!
