/**
 * Données de la grille ALARM industrielle
 * 7 phases × 3 services × 10 items = 210 cases à cocher
 * Chaque item a un tooltip issu du Guide Animateur ALARM
 */

export const ALARM_PHASES = [
  {
    id: 'materiel_produit',
    numero: 1,
    titre: 'Materiel et Produit',
    services: [
      {
        id: 'production',
        label: 'Production',
        hasObservations: true,
        items: [
          { id: 'produit_non_conforme', label: 'Produit non conforme', tooltip: 'Le produit ne respecte pas les criteres qualite.' },
          { id: 'dimensions_atypiques', label: 'Dimensions atypiques', tooltip: 'Taille ou poids inhabituel pour la ligne.' },
          { id: 'produit_dangereux', label: 'Produit dangereux', tooltip: 'Produit corrosif, toxique ou inflammable.' },
          { id: 'temperature_haute', label: 'Temperature haute', tooltip: 'Produit trop chaud pour etre manipule.' },
          { id: 'fragilite_chocs', label: 'Fragilite aux chocs', tooltip: 'Produit se casse au moindre mouvement.' },
          { id: 'defaut_matiere', label: 'Defaut de matiere', tooltip: 'La matiere premiere est defectueuse.' },
          { id: 'emballage_inadapte', label: 'Emballage inadapte', tooltip: 'Le contenant ne protege pas assez.' },
          { id: 'melange_instable', label: 'Melange instable', tooltip: "Le produit change d'etat imprevu." },
          { id: 'visibilite_reduite', label: 'Visibilite reduite', tooltip: 'On ne voit pas bien le produit circuler.' },
          { id: 'propriete_abrasive', label: 'Propriete abrasive', tooltip: 'Le produit use prematurement les outils.' },
        ]
      },
      {
        id: 'maintenance',
        label: 'Maintenance',
        items: [
          { id: 'equipement_ancien', label: 'Equipement ancien', tooltip: 'Machine en fin de vie ou obsolete.' },
          { id: 'panne_repetitive', label: 'Panne repetitive', tooltip: 'Probleme qui revient sans cesse au meme endroit.' },
          { id: 'acces_difficile', label: 'Acces difficile', tooltip: 'Zone de travail trop etroite ou haute.' },
          { id: 'fluides_pression', label: 'Fluides sous pression', tooltip: "Presence d'air ou d'huile sous pression." },
          { id: 'securites_retirees', label: 'Securites retirees', tooltip: "Bouton d'arret ou carter enleve." },
          { id: 'pieces_usees', label: 'Pieces usees', tooltip: 'Composants mecaniques au-dela de leur vie.' },
          { id: 'bruit_vibrations', label: 'Bruit ou vibrations', tooltip: 'Signes de fatigue mecanique grave.' },
          { id: 'energie_presente', label: 'Energie presente', tooltip: 'Courant ou pression non coupes.' },
          { id: 'appareil_mesure_hs', label: 'Appareil mesure HS', tooltip: 'Sondes ou capteurs qui donnent de fausses infos.' },
          { id: 'modification_non_dite', label: 'Modification non dite', tooltip: 'Bricolage technique non note sur le plan.' },
        ]
      },
      {
        id: 'logistique',
        label: 'Logistique',
        items: [
          { id: 'charge_instable', label: 'Charge instable', tooltip: 'La palette risque de basculer.' },
          { id: 'emballage_abime', label: 'Emballage abime', tooltip: 'Le carton ou le film est dechire.' },
          { id: 'etiquetage_faux', label: 'Etiquetage faux', tooltip: 'Mauvaises informations sur le produit.' },
          { id: 'hors_gabarit', label: 'Hors gabarit', tooltip: 'Produit trop large pour les allees ou camions.' },
          { id: 'gravite_decale', label: 'Gravite decale', tooltip: "Poids mal reparti sur l'engin." },
          { id: 'risque_fuite', label: 'Risque de fuite', tooltip: "Liquide ou gaz qui s'echappe du colis." },
          { id: 'palette_non_conforme', label: 'Palette non conforme', tooltip: 'La palette bois est cassee ou inadaptee.' },
          { id: 'encombrement_log', label: 'Encombrement', tooltip: "Trop de marchandises pour l'espace disponible." },
          { id: 'date_limite_depassee', label: 'Date limite depassee', tooltip: 'Produit perime ou proche de la limite.' },
          { id: 'erreur_reference', label: 'Erreur de reference', tooltip: 'Le code article ne correspond pas au produit.' },
        ]
      }
    ]
  },
  {
    id: 'individu',
    numero: 2,
    titre: "Individu (L'acteur)",
    services: [
      {
        id: 'production',
        label: 'Production',
        hasObservations: true,
        items: [
          { id: 'pas_autorisation', label: "Pas d'autorisation", tooltip: "L'operateur n'est pas qualifie pour ce poste." },
          { id: 'fatigue_fin_service', label: 'Fatigue fin service', tooltip: 'Baisse de vigilance apres 7h de travail.' },
          { id: 'stress_cadence', label: 'Stress de cadence', tooltip: 'Pression pour produire plus vite.' },
          { id: 'barriere_langue', label: 'Barriere langue', tooltip: 'Difficulte a lire les consignes de securite.' },
          { id: 'sante_malaise', label: 'Sante ou malaise', tooltip: 'Probleme medical soudain de la personne.' },
          { id: 'exces_confiance', label: 'Exces de confiance', tooltip: "L'habitude fait oublier les risques." },
          { id: 'formation_oubliee', label: 'Formation oubliee', tooltip: 'La formation securite date de trop longtemps.' },
          { id: 'inattention', label: 'Inattention', tooltip: "Moment d'absence ou distraction." },
          { id: 'manque_polyvalence', label: 'Manque polyvalence', tooltip: 'La personne ne connait pas assez la machine.' },
          { id: 'vetements_amples', label: 'Vetements amples', tooltip: 'Risque de happement par les machines.' },
        ]
      },
      {
        id: 'maintenance',
        label: 'Maintenance',
        items: [
          { id: 'habilitation_echue', label: 'Habilitation echue', tooltip: "Le permis electrique n'est plus a jour." },
          { id: 'manque_experience', label: 'Manque experience', tooltip: 'Technicien nouveau sur ce modele de machine.' },
          { id: 'protections_absentes', label: 'Protections absentes', tooltip: 'Pas de casque, gants ou lunettes.' },
          { id: 'risque_inconnu', label: 'Risque inconnu', tooltip: 'Danger specifique non identifie avant.' },
          { id: 'travail_hauteur', label: 'Travail en hauteur', tooltip: "Risque de chute depuis une echelle ou passerelle." },
          { id: 'stress_arret_machine', label: 'Stress arret machine', tooltip: 'Pression pour reparer et relancer la production.' },
          { id: 'erreur_diagnostic', label: 'Erreur diagnostic', tooltip: 'On a repare la mauvaise piece.' },
          { id: 'distance_securite', label: 'Distance securite', tooltip: 'Trop pres des parties mobiles.' },
          { id: 'travailleur_isole', label: 'Travailleur isole', tooltip: "Personne seule sans systeme d'alerte." },
          { id: 'energies_inconnues', label: 'Energies inconnues', tooltip: "On ne sait pas ou couper l'eau ou le gaz." },
        ]
      },
      {
        id: 'logistique',
        label: 'Logistique',
        items: [
          { id: 'certificat_conduite', label: 'Certificat conduite', tooltip: "Le permis de conduire l'engin n'est plus valide." },
          { id: 'baisse_vigilance', label: 'Baisse de vigilance', tooltip: 'Endormissement ou manque de concentration.' },
          { id: 'vitesse_excessive', label: 'Vitesse excessive', tooltip: 'Le cariste roule trop vite pour la zone.' },
          { id: 'zone_flux_ignoree', label: 'Zone flux ignoree', tooltip: 'Passage dans une zone interdite aux engins.' },
          { id: 'manutention_lourde', label: 'Manutention lourde', tooltip: 'Dos fatigue par le port de charges.' },
          { id: 'formation_gerbage', label: 'Formation gerbage', tooltip: 'Erreur en levant ou posant une palette.' },
          { id: 'prise_medicaments', label: 'Prise medicaments', tooltip: 'Traitement medical qui rend somnolent.' },
          { id: 'precipitation', label: 'Precipitation', tooltip: 'Vouloir finir le chargement trop vite.' },
          { id: 'logiciel_non_connu', label: 'Logiciel non connu', tooltip: 'Mauvaise utilisation de la scannette.' },
          { id: 'probleme_vue_ouie', label: 'Probleme vue ouie', tooltip: "Le cariste n'a pas vu ou entendu le danger." },
        ]
      }
    ]
  },
  {
    id: 'tache',
    numero: 3,
    titre: 'Tache (Mode operatoire)',
    services: [
      {
        id: 'production',
        label: 'Production',
        hasObservations: true,
        items: [
          { id: 'pas_procedure', label: 'Pas de procedure', tooltip: "On travaille sans mode d'emploi ecrit." },
          { id: 'mode_degrade', label: 'Mode degrade actif', tooltip: 'Machine qui tourne sans ses protections.' },
          { id: 'outil_inadapte', label: 'Outil inadapte', tooltip: "Le tournevis ou la cle n'est pas la bonne." },
          { id: 'reglage_imprecis', label: 'Reglage imprecis', tooltip: 'Mauvais parametrage de la machine.' },
          { id: 'cycle_trop_rapide', label: 'Cycle trop rapide', tooltip: "La machine va plus vite que l'humain." },
          { id: 'mauvaise_posture', label: 'Mauvaise posture', tooltip: 'Le poste de travail fait mal au dos.' },
          { id: 'controle_non_fait', label: 'Controle non fait', tooltip: 'Le test de qualite a ete oublie.' },
          { id: 'signalisation_nulle', label: 'Signalisation nulle', tooltip: 'Pas de panneau pour prevenir du danger.' },
          { id: 'tache_complexe', label: 'Tache complexe', tooltip: 'Le travail demande trop de concentration.' },
          { id: 'automatisme_panne', label: 'Automatisme en panne', tooltip: "Le robot ne s'arrete plus tout seul." },
        ]
      },
      {
        id: 'maintenance',
        label: 'Maintenance',
        items: [
          { id: 'pas_consignation', label: 'Pas de consignation', tooltip: "L'energie n'a pas ete verrouillee par cadenas." },
          { id: 'schema_absent', label: 'Schema absent', tooltip: 'Le plan electrique manque.' },
          { id: 'outil_manquant', label: 'Outil manquant', tooltip: "L'outil specifique n'est pas la." },
          { id: 'pas_mode_emploi', label: "Pas de mode emploi", tooltip: 'On ne sait pas comment reparer.' },
          { id: 'risque_non_analyse', label: 'Risque non analyse', tooltip: "On n'a pas reflechi aux dangers avant." },
          { id: 'calibrage_non_fait', label: 'Calibrage non fait', tooltip: 'Reglage de precision oublie.' },
          { id: 'piece_non_conforme', label: 'Piece non conforme', tooltip: 'La piece neuve est differente.' },
          { id: 'pas_test_final', label: 'Pas de test final', tooltip: "On n'a pas verifie si tout marchait." },
          { id: 'acces_nacelle', label: 'Acces nacelle', tooltip: "Echelle utilisee au lieu d'une nacelle." },
          { id: 'zone_non_nettoyee', label: 'Zone non nettoyee', tooltip: 'Huile ou vis laissee par terre.' },
        ]
      },
      {
        id: 'logistique',
        label: 'Logistique',
        items: [
          { id: 'plan_circulation', label: 'Plan circulation', tooltip: "Le sens de circulation n'a pas ete suivi." },
          { id: 'chargement_mal_fait', label: 'Chargement mal fait', tooltip: 'Marchandise mal rangee dans le camion.' },
          { id: 'erreur_scannage', label: 'Erreur de scannage', tooltip: 'Mauvais code barre enregistre.' },
          { id: 'filmage_trop_faible', label: 'Filmage trop faible', tooltip: "La palette s'effondre car mal filmee." },
          { id: 'securite_quai', label: 'Securite de quai', tooltip: "La barriere de quai n'est pas mise." },
          { id: 'calage_camion_oubli', label: 'Calage camion oubli', tooltip: "Le camion a avance pendant qu'on chargeait." },
          { id: 'dechargement', label: 'Dechargement', tooltip: 'Vitesse excessive lors de la descente.' },
          { id: 'gestion_retours', label: 'Gestion des retours', tooltip: 'Produit abime remis en stock par erreur.' },
          { id: 'chemin_preparation', label: 'Chemin preparation', tooltip: "Le preparateur fait trop d'allers-retours." },
          { id: 'rupture_stock', label: 'Rupture de stock', tooltip: 'Manque de consommables pour travailler.' },
        ]
      }
    ]
  },
  {
    id: 'equipe',
    numero: 4,
    titre: 'Equipe (Communication)',
    services: [
      {
        id: 'production',
        label: 'Production',
        hasObservations: true,
        items: [
          { id: 'releve_mal_faite', label: 'Releve mal faite', tooltip: "L'equipe d'apres n'a pas eu les infos." },
          { id: 'pas_entraide', label: "Pas d'entraide", tooltip: "Personne n'aide celui qui est deborde." },
          { id: 'consignes_contraires', label: 'Consignes contraires', tooltip: 'Deux chefs disent des choses differentes.' },
          { id: 'chef_absent', label: 'Chef absent', tooltip: 'Pas de responsable pour decider.' },
          { id: 'presqu_accident_tu', label: "Presqu'accident tu", tooltip: "Un petit incident n'a pas ete signale." },
          { id: 'conflit_collegue', label: 'Conflit collegue', tooltip: "Mauvaise ambiance qui bloque l'info." },
          { id: 'anomalie_non_dite', label: 'Anomalie non dite', tooltip: "On a vu un bug mais on n'a rien dit." },
          { id: 'accueil_nouveau_rate', label: 'Accueil nouveau rate', tooltip: 'Le nouveau est laisse seul sans aide.' },
          { id: 'tableau_bord_vide', label: 'Tableau de bord vide', tooltip: 'Les chiffres de securite ne sont pas ecrits.' },
          { id: 'manque_dialogue', label: 'Manque de dialogue', tooltip: 'On ne se parle pas pendant le travail.' },
        ]
      },
      {
        id: 'maintenance',
        label: 'Maintenance',
        items: [
          { id: 'pas_coordination', label: 'Pas de coordination', tooltip: 'Deux techniciens se genent mutuellement.' },
          { id: 'prod_non_prevenue', label: 'Prod non prevenue', tooltip: 'La prod relance la machine trop tot.' },
          { id: 'rapport_non_ecrit', label: 'Rapport non ecrit', tooltip: "On ne sait pas ce qui a ete fait hier." },
          { id: 'pas_aide_technique', label: 'Pas aide technique', tooltip: "Le specialiste n'est pas venu aider." },
          { id: 'diagnostic_non_dit', label: 'Diagnostic non dit', tooltip: "On a trouve la panne mais on ne l'explique pas." },
          { id: 'pas_supervision', label: 'Pas de supervision', tooltip: 'Pas de controle du travail fini.' },
          { id: 'manque_solidarite', label: 'Manque solidarite', tooltip: 'Chacun travaille dans son coin.' },
          { id: 'langage_confus', label: 'Langage confus', tooltip: 'Mots techniques mal compris.' },
          { id: 'redemarrage_non_dit', label: 'Redemarrage non dit', tooltip: "On n'a pas prevenu avant de rallumer." },
          { id: 'expert_non_appele', label: 'Expert non appele', tooltip: 'On aurait du appeler le constructeur.' },
        ]
      },
      {
        id: 'logistique',
        label: 'Logistique',
        items: [
          { id: 'dialogue_chauffeur', label: 'Dialogue chauffeur', tooltip: 'Le chauffeur externe ne comprend pas les consignes.' },
          { id: 'info_zone_manque', label: 'Info zone manque', tooltip: "On ne sait pas qu'une zone est interdite." },
          { id: 'palette_cassee_tue', label: 'Palette cassee tue', tooltip: 'On a range une palette cassee sans le dire.' },
          { id: 'pas_briefing', label: 'Pas de briefing', tooltip: "Pas de reunion d'info le matin." },
          { id: 'urgence_non_dite', label: 'Urgence non dite', tooltip: 'Une commande urgente cree de la panique.' },
          { id: 'zone_pieton_ignoree', label: 'Zone pieton ignoree', tooltip: 'Un cariste a frole un pieton.' },
          { id: 'erreur_preparation', label: 'Erreur preparation', tooltip: 'On a envoye le mauvais colis.' },
          { id: 'coordination_quai', label: 'Coordination quai', tooltip: 'Le bureau et le quai ne se parlent pas.' },
          { id: 'stress_pic_activite', label: 'Stress pic activite', tooltip: "Trop de travail d'un coup." },
          { id: 'obstacle_sol', label: 'Obstacle au sol', tooltip: "On n'a pas prevenu qu'un objet genait." },
        ]
      }
    ]
  },
  {
    id: 'environnement',
    numero: 5,
    titre: 'Environnement de travail',
    services: [
      {
        id: 'production',
        label: 'Production',
        hasObservations: true,
        items: [
          { id: 'eclairage_faible', label: 'Eclairage faible', tooltip: 'On ne voit pas assez clair pour travailler.' },
          { id: 'bruit_trop_fort', label: 'Bruit trop fort', tooltip: "On n'entend pas les alarmes." },
          { id: 'fumees_poussieres', label: 'Fumees poussieres', tooltip: 'Respiration difficile ou manque de vue.' },
          { id: 'sol_glissant', label: 'Sol glissant', tooltip: "Risque de chute sur de l'huile ou de l'eau." },
          { id: 'allees_bouchees', label: 'Allees bouchees', tooltip: 'Obstacles dans les passages.' },
          { id: 'chaleur_excessive', label: 'Chaleur excessive', tooltip: 'Fatigue due a la temperature haute.' },
          { id: 'vibrations_sol', label: 'Vibrations sol', tooltip: 'Les pieds ou les mains tremblent trop.' },
          { id: 'encombrement_env', label: 'Encombrement', tooltip: 'Pas assez de place autour de soi.' },
          { id: 'acces_arret_urgence', label: 'Acces Arret Urgence', tooltip: 'On ne peut pas atteindre le bouton rouge.' },
          { id: 'rangement_5s', label: 'Rangement (5S)', tooltip: "Le desordre provoque l'accident." },
        ]
      },
      {
        id: 'maintenance',
        label: 'Maintenance',
        items: [
          { id: 'zone_tres_etroite', label: 'Zone tres etroite', tooltip: 'Impossible de bouger les bras pour reparer.' },
          { id: 'pluie_vent', label: 'Pluie ou vent', tooltip: "Conditions difficiles a l'exterieur." },
          { id: 'temperature_extreme', label: 'Temperature extreme', tooltip: 'Froid intense ou chaleur de four.' },
          { id: 'eclairage_machine', label: 'Eclairage machine', tooltip: "On ne voit pas l'interieur du carter." },
          { id: 'risque_explosion', label: 'Risque explosion', tooltip: 'Presence de poussieres ou gaz inflammables.' },
          { id: 'bruit_ambiant', label: 'Bruit ambiant', tooltip: 'On ne peut pas communiquer par la voix.' },
          { id: 'hauteur_limitee', label: 'Hauteur limitee', tooltip: 'On se cogne la tete en intervenant.' },
          { id: 'sol_instable', label: 'Sol instable', tooltip: 'La nacelle penche ou tremble.' },
          { id: 'proprete_manque', label: 'Proprete manque', tooltip: 'Trop de graisse ou de salete.' },
          { id: 'odeurs_suspectes', label: 'Odeurs suspectes', tooltip: 'Gaz ou produit chimique qui fuit.' },
        ]
      },
      {
        id: 'logistique',
        label: 'Logistique',
        items: [
          { id: 'sol_trous', label: 'Sol avec trous', tooltip: 'Le chariot tressaille et lache la charge.' },
          { id: 'allees_stock_pleines', label: 'Allees stock pleines', tooltip: 'Plus de place pour circuler normalement.' },
          { id: 'co_activite', label: 'Co-activite', tooltip: 'Camions, caristes et pietons melanges.' },
          { id: 'froid_stockage', label: 'Froid (stockage)', tooltip: 'Gel qui rend les mains engourdies.' },
          { id: 'courants_air', label: "Courants d'air", tooltip: 'Portes de quai laissees ouvertes.' },
          { id: 'zone_sombre', label: 'Zone sombre', tooltip: 'Impossible de lire les etiquettes.' },
          { id: 'dechets_sol', label: 'Dechets au sol', tooltip: 'Plastiques de filmage qui se prennent dans les roues.' },
          { id: 'marquage_efface', label: 'Marquage efface', tooltip: 'On ne sait plus ou rouler.' },
          { id: 'allee_trop_etroite', label: 'Allee trop etroite', tooltip: 'Le chariot frotte contre les racks.' },
          { id: 'visibilite_angle', label: 'Visibilite angle', tooltip: 'Pas de miroir pour voir arriver les autres.' },
        ]
      }
    ]
  },
  {
    id: 'organisation',
    numero: 6,
    titre: 'Organisation et Management',
    services: [
      {
        id: 'production',
        label: 'Production',
        hasObservations: true,
        items: [
          { id: 'pression_quotas', label: 'Pression quotas', tooltip: 'On demande plus que ce qui est possible.' },
          { id: 'effectif_manque', label: 'Effectif manque', tooltip: 'Il manque des collegues sur la ligne.' },
          { id: 'securite_secondaire', label: 'Securite secondaire', tooltip: "On nous dit 'va vite' avant 'fais attention'." },
          { id: 'manager_absent', label: 'Manager absent', tooltip: 'Le chef ne voit pas les problemes reels.' },
          { id: 'pauses_sautees', label: 'Pauses sautees', tooltip: "On travaille trop longtemps sans s'arreter." },
          { id: 'manque_formation_org', label: 'Manque formation', tooltip: 'On ne sait pas utiliser la nouvelle machine.' },
          { id: 'pas_indicateurs', label: 'Pas indicateurs', tooltip: 'On ne sait pas si on travaille bien.' },
          { id: 'alerte_ignoree', label: 'Alerte ignoree', tooltip: "On a signale un danger mais rien n'a change." },
          { id: 'planning_instable', label: 'Planning instable', tooltip: 'On change de poste sans prevenir.' },
          { id: 'culture_securite', label: 'Culture securite', tooltip: "La securite n'est pas importante ici." },
        ]
      },
      {
        id: 'maintenance',
        label: 'Maintenance',
        items: [
          { id: 'pas_budget', label: 'Pas de budget', tooltip: 'On ne peut pas acheter les bonnes pieces.' },
          { id: 'retard_entretien', label: 'Retard entretien', tooltip: 'La machine aurait du etre revisee il y a un mois.' },
          { id: 'temps_court', label: 'Temps court', tooltip: "On nous donne 1h pour un travail de 3h." },
          { id: 'astreinte_mal_faite', label: 'Astreinte mal faite', tooltip: "Le technicien de nuit n'a pas les outils." },
          { id: 'sous_traitant_seul', label: 'Sous-traitant seul', tooltip: 'Le prestataire travaille sans regles.' },
          { id: 'documentation_nulle', label: 'Documentation nulle', tooltip: 'Pas de classeur de bord de la machine.' },
          { id: 'materiel_use', label: 'Materiel use', tooltip: 'On travaille avec des outils casses.' },
          { id: 'temps_prepa_oublie', label: 'Temps prepa oublie', tooltip: "On n'a pas compte le temps de mise en securite." },
          { id: 'pas_investissement', label: 'Pas investissement', tooltip: "On n'achete jamais de nouvelles machines." },
          { id: 'pas_audit_securite', label: 'Pas audit securite', tooltip: 'On ne verifie jamais les cadenas de securite.' },
        ]
      },
      {
        id: 'logistique',
        label: 'Logistique',
        items: [
          { id: 'planning_irrealiste', label: 'Planning irrealiste', tooltip: 'Trop de camions pour le nombre de quais.' },
          { id: 'interimaire_seul', label: 'Interimaire seul', tooltip: "Le nouveau n'est pas accompagne." },
          { id: 'rotation_stock', label: 'Rotation stock', tooltip: 'On deplace les produits sans cesse.' },
          { id: 'engin_inadapte', label: 'Engin inadapte', tooltip: 'Le chariot est trop petit pour la charge.' },
          { id: 'pas_controle', label: 'Pas de controle', tooltip: 'Personne ne regarde comment on roule.' },
          { id: 'flux_mal_gere', label: 'Flux mal gere', tooltip: 'Les entrees et sorties se croisent.' },
          { id: 'accueil_chauffeur', label: 'Accueil chauffeur', tooltip: "Le chauffeur attend trop et s'enerve." },
          { id: 'tri_dechets_oublie', label: 'Tri dechets oublie', tooltip: 'Les bennes debordent.' },
          { id: 'entretien_engin', label: 'Entretien engin', tooltip: 'Pas de revision des freins des engins.' },
          { id: 'contrats_precaires', label: 'Contrats precaires', tooltip: 'Le personnel change trop souvent.' },
        ]
      }
    ]
  },
  {
    id: 'institutionnel',
    numero: 7,
    titre: 'Institutionnel (Contexte)',
    services: [
      {
        id: 'production',
        label: 'Production',
        hasObservations: true,
        items: [
          { id: 'norme_client', label: 'Norme client', tooltip: 'Le client exige un produit parfait tres vite.' },
          { id: 'delais_livraison', label: 'Delais de livraison', tooltip: 'Le camion attend le produit pour partir.' },
          { id: 'pression_argent', label: 'Pression argent', tooltip: 'On veut reduire les couts a tout prix.' },
          { id: 'audit_imminent', label: 'Audit imminent', tooltip: 'On range tout juste avant une inspection.' },
          { id: 'image_entreprise', label: 'Image entreprise', tooltip: "Peur qu'un accident se sache a l'exterieur." },
          { id: 'crise_secteur', label: 'Crise du secteur', tooltip: 'Moins de travail donc peur pour son emploi.' },
          { id: 'technologie_change', label: 'Technologie change', tooltip: "Nouvelle machine qu'on ne maitrise pas." },
          { id: 'norme_electrique', label: 'Norme electrique', tooltip: '' },
          { id: 'reglement_interieur', label: 'Reglement interieur', tooltip: "Regles de l'usine tres strictes." },
          { id: 'accords_entreprise', label: 'Accords entreprise', tooltip: 'Changements dans les contrats de travail.' },
          { id: 'directives_siege', label: 'Directives siege', tooltip: "Ordres qui viennent d'en haut sans connaitre le terrain." },
        ]
      },
      {
        id: 'maintenance',
        label: 'Maintenance',
        items: [
          { id: 'controle_legal', label: 'Controle legal', tooltip: "Visite obligatoire de l'organisme de controle." },
          { id: 'norme_ecologique', label: 'Norme ecologique', tooltip: "Interdiction d'utiliser certains produits chimiques." },
          { id: 'directive_machine', label: 'Directive machine', tooltip: 'Nouvelle loi sur la securite des robots.' },
          { id: 'accidents_nombreux', label: 'Accidents nombreux', tooltip: "L'assurance demande des comptes." },
          { id: 'inspection_travail', label: 'Inspection travail', tooltip: "L'inspecteur peut fermer l'usine." },
          { id: 'rupture_fournisseur', label: 'Rupture fournisseur', tooltip: 'On ne trouve plus les pieces a cause de la guerre.' },
          { id: 'permis_electrique', label: 'Permis electrique', tooltip: 'Norme sur les armoires electriques.' },
          { id: 'obligation_resultat', label: 'Obligation resultat', tooltip: 'On doit reparer, peu importe le danger.' },
          { id: 'risque_penal', label: 'Risque penal', tooltip: 'Le patron risque la prison.' },
          { id: 'veille_lois', label: 'Veille des lois', tooltip: 'Il faut lire toutes les nouvelles lois.' },
        ]
      },
      {
        id: 'logistique',
        label: 'Logistique',
        items: [
          { id: 'regle_sociale', label: 'Regle sociale', tooltip: 'Temps de conduite obligatoires a respecter.' },
          { id: 'certification', label: 'Certification', tooltip: "Besoin d'un label pour vendre le produit." },
          { id: 'cout_carburant', label: 'Cout du carburant', tooltip: 'Pression pour charger plus les camions.' },
          { id: 'loi_emballages', label: 'Loi emballages', tooltip: 'Interdiction de certains plastiques.' },
          { id: 'douanes_export', label: 'Douanes export', tooltip: 'Blocage des camions a la frontiere.' },
          { id: 'manque_chauffeurs', label: 'Manque chauffeurs', tooltip: 'On ne trouve personne pour livrer.' },
          { id: 'nuit_dimanche', label: 'Nuit ou dimanche', tooltip: 'On fatigue car on travaille en decale.' },
          { id: 'protocole_site', label: 'Protocole site', tooltip: 'Regles specifiques pour entrer sur le site.' },
          { id: 'taxe_carbone', label: 'Taxe carbone', tooltip: 'Pression pour polluer moins.' },
          { id: 'regle_securite_inst', label: 'Regle de securite', tooltip: "Le reglement de securite interne de l'entrepot." },
        ]
      }
    ]
  }
];
