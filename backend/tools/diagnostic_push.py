#!/usr/bin/env python3
"""
Script de diagnostic et nettoyage des abonnements Web Push.
A executer sur le serveur de production via SSH.

Usage:
    cd /chemin/vers/votre/app/backend
    python3 tools/diagnostic_push.py          # Diagnostic seul
    python3 tools/diagnostic_push.py --fix    # Diagnostic + nettoyage

Ce script ne modifie rien sans --fix.
"""

import sys
import os
import argparse
from datetime import datetime, timezone
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

MONGO_URL = os.environ.get('MONGO_URL')
DB_NAME = os.environ.get('DB_NAME', 'gmao_iris')

SEP = "=" * 70

def ts():
    return datetime.now(timezone.utc).strftime('%H:%M:%S UTC')

def main():
    parser = argparse.ArgumentParser(description='Diagnostic et nettoyage push notifications')
    parser.add_argument('--fix', action='store_true', help='Appliquer le nettoyage (sans ce flag = lecture seule)')
    args = parser.parse_args()

    if not MONGO_URL:
        print("[ERREUR] MONGO_URL manquant dans le fichier .env")
        sys.exit(1)

    print(SEP)
    print(f"  DIAGNOSTIC WEB PUSH — {ts()}")
    print(f"  Base de donnees: {DB_NAME}")
    print(f"  Mode: {'NETTOYAGE ACTIF (--fix)' if args.fix else 'LECTURE SEULE (ajouter --fix pour corriger)'}")
    print(SEP)

    client = MongoClient(MONGO_URL)
    db = client[DB_NAME]

    # =========================================================
    # 1. CLES VAPID
    # =========================================================
    print("\n[1] CLES VAPID")
    print("-" * 40)
    env_pub = os.environ.get('VAPID_PUBLIC_KEY', '')
    env_priv = os.environ.get('VAPID_PRIVATE_KEY', '')
    db_cfg = db.app_config.find_one({'key': 'vapid_keys'})

    if env_pub:
        print(f"  .env  VAPID_PUBLIC_KEY  : {env_pub[:30]}... ({len(env_pub)} chars)")
    else:
        print("  .env  VAPID_PUBLIC_KEY  : NON DEFINI !")

    if db_cfg:
        db_pub = db_cfg.get('public', '')
        print(f"  DB    public_key        : {db_pub[:30]}... ({len(db_pub)} chars)")
        if env_pub and db_pub and env_pub != db_pub:
            print("  >>> MISMATCH : Les cles .env et DB sont DIFFERENTES !")
            print("      Les anciens abonnements utilisent la cle DB (ancienne).")
        elif env_pub and db_pub and env_pub == db_pub:
            print("  OK : .env et DB identiques")
    else:
        print("  DB    : Aucune cle VAPID en DB (collection app_config)")

    # =========================================================
    # 2. ETAT DES ABONNEMENTS WEB PUSH
    # =========================================================
    print("\n[2] ABONNEMENTS WEB PUSH")
    print("-" * 40)
    all_subs = list(db.web_push_subscriptions.find({}))
    active_subs = [s for s in all_subs if s.get('is_active')]
    inactive_subs = [s for s in all_subs if not s.get('is_active')]

    print(f"  Total         : {len(all_subs)}")
    print(f"  Actifs        : {len(active_subs)}")
    print(f"  Inactifs      : {len(inactive_subs)}")

    if active_subs:
        print("\n  -- Abonnements ACTIFS --")
        for sub in active_subs:
            uid = sub.get('user_id', 'INCONNU')
            browser = sub.get('browser', '?')
            endpoint = sub.get('subscription', {}).get('endpoint', '')[:60]
            created = sub.get('created_at') or sub.get('updated_at', '')
            print(f"    user_id : {uid}")
            print(f"    browser : {browser}")
            print(f"    endpoint: {endpoint}...")
            print(f"    created : {created}")
            print()

    # =========================================================
    # 3. CORRESPONDANCE USERS / ABONNEMENTS
    # =========================================================
    print("\n[3] CORRESPONDANCE UTILISATEURS <-> ABONNEMENTS")
    print("-" * 40)
    users = list(db.users.find({'role': 'ADMIN'}))
    for user in users:
        uid_str = str(user.get('id') or user['_id'])
        email = user.get('email', '?')
        found = any(str(s.get('user_id')) == uid_str for s in all_subs)
        active = any(str(s.get('user_id')) == uid_str and s.get('is_active') for s in all_subs)
        status = "ACTIF" if active else ("INACTIF" if found else "AUCUN ABONNEMENT")
        print(f"  {email:40s} | user_id: {uid_str[:24]} | {status}")

    # =========================================================
    # 4. ERREURS RECENTES (24h)
    # =========================================================
    print("\n[4] ERREURS DE NOTIFICATION RECENTES (24h)")
    print("-" * 40)
    from datetime import timedelta
    since = datetime.now(timezone.utc) - timedelta(hours=24)
    
    try:
        failures = list(db.notification_health_logs.find(
            {'type': 'failed', 'timestamp': {'$gte': since}},
            {'error': 1, 'user_id': 1, 'timestamp': 1, '_id': 0}
        ).sort('timestamp', -1).limit(10))

        successes = db.notification_health_logs.count_documents(
            {'type': 'sent', 'timestamp': {'$gte': since}}
        )
        print(f"  Envois reussis (24h) : {successes}")
        print(f"  Derniers echecs (max 10) :")
        
        error_types = {}
        for f in failures:
            err = f.get('error', '')[:80]
            code = '?'
            if '400' in err:
                code = 'HTTP 400'
                if 'VapidPkHashMismatch' in err:
                    code = 'HTTP 400 VapidPkHashMismatch (Firefox/Edge)'
            elif '401' in err:
                code = 'HTTP 401 Unauthorized (VAPID key mismatch Chrome)'
            elif '410' in err:
                code = 'HTTP 410 Gone (abonnement expire)'
            error_types[code] = error_types.get(code, 0) + 1
        
        for code, count in error_types.items():
            print(f"    {count}x {code}")
    except Exception as e:
        print(f"  Impossible de lire les logs: {e}")

    # =========================================================
    # 5. NETTOYAGE (si --fix)
    # =========================================================
    print("\n[5] NETTOYAGE")
    print("-" * 40)
    if not args.fix:
        print("  Mode lecture seule. Aucune modification effectuee.")
        print("  Pour nettoyer, relancez avec: python3 tools/diagnostic_push.py --fix")
    else:
        print("  Nettoyage en cours...")
        now = datetime.now(timezone.utc)
        
        result = db.web_push_subscriptions.update_many(
            {'is_active': True},
            {'$set': {
                'is_active': False,
                'deactivated_at': now,
                'deactivation_reason': 'manual_ssh_cleanup'
            }}
        )
        print(f"  [OK] {result.modified_count} abonnement(s) marque(s) inactifs")

        # Optionnel: reduire les logs d'erreurs recents pour accelerer la sortie d'erreur
        cleanup_result = db.notification_health_logs.delete_many(
            {'type': 'failed', 'timestamp': {'$gte': since}}
        )
        print(f"  [OK] {cleanup_result.deleted_count} log(s) d'erreur (24h) supprimes")

        print()
        print("  ==> ETAPES SUIVANTES POUR L'UTILISATEUR :")
        print("      1. La boucle d'erreur est maintenant arretee.")
        print("      2. Demandez aux utilisateurs d'aller dans Parametres > Notifications")
        print("         et de cliquer 'Activer les notifications' pour se reabonner.")
        print("      3. Verifiez dans Sante systeme que le statut repasse en OK.")

    print()
    print(SEP)
    print(f"  Diagnostic termine — {ts()}")
    print(SEP)
    client.close()

if __name__ == '__main__':
    main()
