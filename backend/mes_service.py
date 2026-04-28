"""
Service M.E.S (Manufacturing Execution System)
Gestion des machines de production, calcul de cadence, temps d'arrêt, alertes
"""
import asyncio
import logging
import os
import subprocess
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, List
from bson import ObjectId

logger = logging.getLogger(__name__)


class MESService:
    # Dictionnaire de stockage des équipements par topic pour lookup rapide
    mes_equipments_by_topic: Dict[str, ObjectId] = {}
    
    def __init__(self, db, mqtt_manager=None):
        self.db = db
        self.mqtt_manager = mqtt_manager
        self._subscribed_topics = set()
        self._pending_topics = set()  # Topics en attente si MQTT pas connecté
        
        # Enregistrer ce service comme listener de connexion MQTT
        if mqtt_manager:
            mqtt_manager.add_on_connect_listener(self._on_mqtt_connected)
            logger.info("[MES] Service enregistré comme listener de connexion MQTT")
    
    def _on_mqtt_connected(self):
        """Appelé quand MQTT se (re)connecte - re-souscrire aux topics"""
        logger.info("[MES] 🔌 MQTT connecté, re-souscription aux topics M.E.S....")
        self._resubscribe_all()

    # ==================== MACHINES CRUD ====================

    async def create_machine(self, data: dict) -> dict:
        # Type: "Imp" (impulsion 1/0) ou "cp/min" (cadence directe)
        machine_type = data.get("type", "Imp")
        if machine_type not in ("Imp", "cp/min"):
            machine_type = "Imp"

        # Sub-equipment optionnel
        sub_eq_id = data.get("sub_equipment_id")
        sub_eq_obj = ObjectId(sub_eq_id) if sub_eq_id else None

        machine = {
            "equipment_id": ObjectId(data["equipment_id"]),
            "sub_equipment_id": sub_eq_obj,
            "mqtt_topic": data["mqtt_topic"],
            "type": machine_type,
            "mqtt_topic_state": data.get("mqtt_topic_state", "") if machine_type == "cp/min" else "",
            "sensor_ip": data.get("sensor_ip", ""),
            "theoretical_cadence": float(data.get("theoretical_cadence", 6)),  # cp/min
            "downtime_margin_pct": float(data.get("downtime_margin_pct", 30)),  # %
            "trs_target": float(data.get("trs_target", 85)),  # % objectif TRS
            "production_schedule": {
                "is_24h": bool(data.get("schedule_is_24h", True)),
                "start_hour": int(data.get("schedule_start_hour", 6)),
                "end_hour": int(data.get("schedule_end_hour", 22)),
                "production_days": data.get("schedule_production_days", [0, 1, 2, 3, 4]),  # Mon-Fri
            },
            "alerts": {
                "stopped_minutes": int(data.get("alert_stopped_minutes", 5)),
                "under_cadence": float(data.get("alert_under_cadence", 0)),
                "over_cadence": float(data.get("alert_over_cadence", 0)),
                "daily_target": int(data.get("alert_daily_target", 0)),
                "no_signal_minutes": int(data.get("alert_no_signal_minutes", 10)),
            },
            "email_notifications": {
                "enabled": bool(data.get("email_enabled", False)),
                "recipients": data.get("email_recipients", []),
                "alert_types": data.get("email_alert_types", []),
                "delay_minutes": int(data.get("email_delay_minutes", 5)),
            },
            "active": True,
            "created_at": datetime.now(timezone.utc),
            "last_pulse_at": None,
            "is_running": False,
        }
        result = await self.db.mes_machines.insert_one(machine)
        machine["_id"] = result.inserted_id
        self._subscribe_machine(machine)
        return self._serialize(machine)

    async def update_machine(self, machine_id: str, data: dict) -> dict:
        update = {}
        fields_map = {
            "mqtt_topic": str, "sensor_ip": str,
            "theoretical_cadence": float, "downtime_margin_pct": float, "active": bool,
            "trs_target": float,
            "mqtt_topic_state": str,
        }
        for field, cast in fields_map.items():
            if field in data:
                update[field] = cast(data[field])

        # Type: "Imp" ou "cp/min"
        if "type" in data:
            t = data["type"]
            if t in ("Imp", "cp/min"):
                update["type"] = t
                # Si on repasse en Imp, on vide le topic état
                if t == "Imp":
                    update["mqtt_topic_state"] = ""

        alert_fields = {
            "alert_stopped_minutes": ("alerts.stopped_minutes", int),
            "alert_under_cadence": ("alerts.under_cadence", float),
            "alert_over_cadence": ("alerts.over_cadence", float),
            "alert_daily_target": ("alerts.daily_target", int),
            "alert_no_signal_minutes": ("alerts.no_signal_minutes", int),
        }
        for key, (path, cast) in alert_fields.items():
            if key in data:
                update[path] = cast(data[key])

        # Production schedule fields
        schedule_fields = {
            "schedule_is_24h": ("production_schedule.is_24h", bool),
            "schedule_start_hour": ("production_schedule.start_hour", int),
            "schedule_end_hour": ("production_schedule.end_hour", int),
        }
        for key, (path, cast) in schedule_fields.items():
            if key in data:
                update[path] = cast(data[key])
        if "schedule_production_days" in data:
            update["production_schedule.production_days"] = [int(d) for d in data["schedule_production_days"]]

        # Email notification fields
        email_fields = {
            "email_enabled": ("email_notifications.enabled", bool),
            "email_delay_minutes": ("email_notifications.delay_minutes", int),
        }
        for key, (path, cast) in email_fields.items():
            if key in data:
                update[path] = cast(data[key])
        if "email_recipients" in data:
            update["email_notifications.recipients"] = [str(r).strip() for r in data["email_recipients"] if str(r).strip()]
        if "email_alert_types" in data:
            update["email_notifications.alert_types"] = list(data["email_alert_types"])

        if "equipment_id" in data:
            update["equipment_id"] = ObjectId(data["equipment_id"])

        if "sub_equipment_id" in data:
            sub = data["sub_equipment_id"]
            update["sub_equipment_id"] = ObjectId(sub) if sub else None

        if update:
            await self.db.mes_machines.update_one({"_id": ObjectId(machine_id)}, {"$set": update})

        machine = await self.db.mes_machines.find_one({"_id": ObjectId(machine_id)})
        if machine:
            self._subscribe_machine(machine)
        return self._serialize(machine) if machine else None

    async def delete_machine(self, machine_id: str):
        machine = await self.db.mes_machines.find_one({"_id": ObjectId(machine_id)})
        if machine and self.mqtt_manager:
            for tkey in ("mqtt_topic", "mqtt_topic_state"):
                t = machine.get(tkey)
                if t and t in self._subscribed_topics:
                    self.mqtt_manager.unsubscribe(t)
                    self._subscribed_topics.discard(t)
        await self.db.mes_machines.delete_one({"_id": ObjectId(machine_id)})
        await self.db.mes_pulses.delete_many({"machine_id": ObjectId(machine_id)})
        await self.db.mes_cadence_history.delete_many({"machine_id": ObjectId(machine_id)})
        await self.db.mes_alerts.delete_many({"machine_id": ObjectId(machine_id)})

    async def get_machines(self) -> list:
        machines = await self.db.mes_machines.find().to_list(500)
        result = []
        for m in machines:
            serialized = self._serialize(m)
            eq = await self.db.equipments.find_one({"_id": m.get("equipment_id")}, {"nom": 1})
            serialized["equipment_name"] = eq["nom"] if eq else "Inconnu"
            # Sous-équipement (optionnel)
            sub_id = m.get("sub_equipment_id")
            if sub_id:
                sub = await self.db.equipments.find_one({"_id": sub_id}, {"nom": 1})
                serialized["sub_equipment_name"] = sub["nom"] if sub else None
            else:
                serialized["sub_equipment_name"] = None
            # Type par défaut "Imp" pour rétro-compatibilité
            serialized["type"] = m.get("type", "Imp")
            # Include reference info
            ref_id = m.get("active_reference_id")
            if ref_id:
                ref = await self.db.mes_product_references.find_one({"_id": ref_id}, {"name": 1})
                serialized["active_reference_name"] = ref["name"] if ref else None
            result.append(serialized)
        return result

    async def get_machine(self, machine_id: str) -> Optional[dict]:
        m = await self.db.mes_machines.find_one({"_id": ObjectId(machine_id)})
        if not m:
            return None
        serialized = self._serialize(m)
        eq = await self.db.equipments.find_one({"_id": m.get("equipment_id")}, {"nom": 1})
        serialized["equipment_name"] = eq["nom"] if eq else "Inconnu"
        # Sous-équipement (optionnel)
        sub_id = m.get("sub_equipment_id")
        if sub_id:
            sub = await self.db.equipments.find_one({"_id": sub_id}, {"nom": 1})
            serialized["sub_equipment_name"] = sub["nom"] if sub else None
        else:
            serialized["sub_equipment_name"] = None
        # Type par défaut "Imp" pour rétro-compatibilité
        serialized["type"] = m.get("type", "Imp")
        # Include reference info
        ref_id = m.get("active_reference_id")
        if ref_id:
            ref = await self.db.mes_product_references.find_one({"_id": ref_id}, {"name": 1})
            serialized["active_reference_name"] = ref["name"] if ref else None
        return serialized

    # ==================== PULSE HANDLING ====================

    async def record_pulse(self, machine_id_or_topic: str, value: int = 1):
        """Enregistrer une impulsion (appelé par le callback MQTT)"""
        logger.info(f"[MES] record_pulse appelé: machine_id_or_topic={machine_id_or_topic}, value={value}")
        
        if ObjectId.is_valid(machine_id_or_topic):
            machine = await self.db.mes_machines.find_one({"_id": ObjectId(machine_id_or_topic)})
            logger.info(f"[MES] Recherche par ObjectId: {machine_id_or_topic} -> trouvé: {machine is not None}")
        else:
            machine = await self.db.mes_machines.find_one({"mqtt_topic": machine_id_or_topic, "active": True})
            logger.info(f"[MES] Recherche par topic: {machine_id_or_topic} -> trouvé: {machine is not None}")

        if not machine:
            logger.warning(f"[MES] ⚠️ Aucune machine trouvée pour: {machine_id_or_topic}")
            return
            
        if value != 1:
            logger.info(f"[MES] Valeur ignorée (!=1): {value}")
            return

        now = datetime.now(timezone.utc)
        mid = machine["_id"]
        
        logger.info(f"[MES] 📝 Enregistrement pulse pour machine {mid}...")

        # Store pulse
        await self.db.mes_pulses.insert_one({
            "machine_id": mid,
            "timestamp": now,
        })
        logger.info(f"[MES] ✅ Pulse enregistré dans mes_pulses")

        # Update machine state
        await self.db.mes_machines.update_one(
            {"_id": mid},
            {"$set": {"last_pulse_at": now, "is_running": True}}
        )
        logger.info(f"[MES] ✅ État machine mis à jour (is_running=True)")

    # ==================== METRICS ====================

    async def get_realtime_metrics(self, machine_id: str) -> dict:
        mid = ObjectId(machine_id)
        machine = await self.db.mes_machines.find_one({"_id": mid})
        if not machine:
            return {}

        now = datetime.now(timezone.utc)
        theoretical = machine.get("theoretical_cadence", 6)
        margin_pct = machine.get("downtime_margin_pct", 30)

        # Pulses last 60 seconds -> cp/min
        t_1min = now - timedelta(seconds=60)
        count_1min = await self.db.mes_pulses.count_documents({
            "machine_id": mid, "timestamp": {"$gte": t_1min}
        })

        # Pour les machines de type cp/min, on préfère la valeur de cadence
        # reçue directement plutôt que le comptage des impulsions synthétisées.
        machine_type_for_cad = machine.get("type", "Imp")
        if machine_type_for_cad == "cp/min":
            current_cad = machine.get("current_cadence")
            cad_at = machine.get("current_cadence_at")
            if isinstance(cad_at, str):
                try:
                    cad_at = datetime.fromisoformat(cad_at.replace("Z", "+00:00"))
                except (ValueError, AttributeError):
                    cad_at = None
            if cad_at and cad_at.tzinfo is None:
                cad_at = cad_at.replace(tzinfo=timezone.utc)
            # Cadence considérée valide si reçue dans les 5 dernières minutes
            if current_cad is not None and cad_at and (now - cad_at).total_seconds() <= 300:
                count_1min = round(float(current_cad), 1)
            else:
                count_1min = 0

        # Pulses last hour -> cp/h
        t_1h = now - timedelta(hours=1)
        count_1h = await self.db.mes_pulses.count_documents({
            "machine_id": mid, "timestamp": {"$gte": t_1h}
        })

        # Pulses today (since midnight UTC)
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        count_today = await self.db.mes_pulses.count_documents({
            "machine_id": mid, "timestamp": {"$gte": today_start}
        })

        # Pulses last 24h
        t_24h = now - timedelta(hours=24)
        count_24h = await self.db.mes_pulses.count_documents({
            "machine_id": mid, "timestamp": {"$gte": t_24h}
        })

        # Downtime calculation
        last_pulse = machine.get("last_pulse_at")
        machine_type = machine.get("type", "Imp")
        is_running = False
        downtime_seconds = 0

        # Pour cp/min avec état explicite : utiliser directement le flag is_running de la machine
        if machine_type == "cp/min" and machine.get("state_explicit"):
            is_running = bool(machine.get("is_running", False))
            # downtime courant : calculé depuis state_updated_at si IDLE
            if not is_running:
                state_at = machine.get("state_updated_at")
                if isinstance(state_at, str):
                    try:
                        state_at = datetime.fromisoformat(state_at.replace("Z", "+00:00"))
                    except (ValueError, AttributeError):
                        state_at = None
                if state_at and state_at.tzinfo is None:
                    state_at = state_at.replace(tzinfo=timezone.utc)
                if state_at:
                    downtime_seconds = (now - state_at).total_seconds()
        elif last_pulse:
            # Correction : last_pulse_at peut être une chaîne ISO en DB
            if isinstance(last_pulse, str):
                try:
                    last_pulse = datetime.fromisoformat(last_pulse.replace("Z", "+00:00"))
                except (ValueError, AttributeError):
                    last_pulse = None
            if last_pulse and last_pulse.tzinfo is None:
                last_pulse = last_pulse.replace(tzinfo=timezone.utc)
            expected_interval = 60.0 / theoretical if theoretical > 0 else 10
            threshold = expected_interval * (1 + margin_pct / 100)
            elapsed = (now - last_pulse).total_seconds()
            is_running = elapsed <= threshold
            if not is_running:
                downtime_seconds = elapsed

        # Downtime today (sum of gaps > threshold)
        downtime_today = await self._calc_downtime(mid, today_start, now, theoretical, margin_pct)

        # ==================== ADVANCED TRS (Level 3) ====================
        schedule = machine.get("production_schedule", {})
        is_24h = schedule.get("is_24h", True)
        start_hour = schedule.get("start_hour", 6)
        end_hour = schedule.get("end_hour", 22)
        production_days = schedule.get("production_days", [0, 1, 2, 3, 4])

        # Calculate planned production time today (seconds)
        today_weekday = now.weekday()  # 0=Monday
        if today_weekday not in production_days:
            planned_seconds = 0
        elif is_24h:
            planned_seconds = (now - today_start).total_seconds()
        else:
            prod_start = today_start.replace(hour=start_hour)
            prod_end = today_start.replace(hour=end_hour)
            if now < prod_start:
                planned_seconds = 0
            elif now > prod_end:
                planned_seconds = (prod_end - prod_start).total_seconds()
            else:
                planned_seconds = (now - prod_start).total_seconds()

        # Availability = (Planned - Downtime) / Planned
        if planned_seconds > 0:
            operating_seconds = max(planned_seconds - downtime_today, 0)
            availability = round(operating_seconds / planned_seconds * 100, 1)
        else:
            operating_seconds = 0
            availability = 0

        # Performance = (Actual count / Theoretical count during operating time)
        if theoretical > 0 and operating_seconds > 0:
            theoretical_during_uptime = theoretical * (operating_seconds / 60)
            performance = round(count_today / theoretical_during_uptime * 100, 1) if theoretical_during_uptime > 0 else 0
            performance = min(performance, 100)  # Cap at 100%
        else:
            performance = 0

        # Quality = (Total - Rejects) / Total
        rejects_total = await self.get_rejects_total(mid, today_start, now)
        if count_today > 0:
            good_parts = max(count_today - rejects_total, 0)
            quality = round(good_parts / count_today * 100, 1)
        else:
            quality = 100  # No production = no quality issues

        # TRS = Availability × Performance × Quality (as percentages)
        trs = round((availability / 100) * (performance / 100) * (quality / 100) * 100, 1)

        return {
            "cadence_per_min": count_1min,
            "cadence_per_hour": count_1h,
            "production_today": count_today,
            "production_24h": count_24h,
            "is_running": is_running,
            "downtime_current_seconds": round(downtime_seconds),
            "downtime_today_seconds": round(downtime_today),
            "trs": trs,
            "trs_target": machine.get("trs_target", 85),
            "trs_availability": availability,
            "trs_performance": performance,
            "trs_quality": quality,
            "rejects_today": rejects_total,
            "good_parts_today": max(count_today - rejects_total, 0),
            "theoretical_cadence": theoretical,
            "planned_seconds": round(planned_seconds),
            "operating_seconds": round(operating_seconds),
            "last_pulse_at": last_pulse.isoformat() if last_pulse else None,
        }

    async def _calc_downtime(self, machine_id, start, end, theoretical, margin_pct):
        """Calculate total downtime between start and end"""
        expected_interval = 60.0 / theoretical if theoretical > 0 else 10
        threshold = expected_interval * (1 + margin_pct / 100)

        pulses = await self.db.mes_pulses.find(
            {"machine_id": machine_id, "timestamp": {"$gte": start, "$lte": end}},
            {"timestamp": 1}
        ).sort("timestamp", 1).to_list(100000)

        if not pulses:
            return (end - start).total_seconds()

        total_downtime = 0
        prev_time = start
        for p in pulses:
            ts = p["timestamp"]
            # Correction : timestamp peut être une chaîne ISO en DB
            if isinstance(ts, str):
                try:
                    ts = datetime.fromisoformat(ts.replace("Z", "+00:00"))
                except (ValueError, AttributeError):
                    continue
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=timezone.utc)
            gap = (ts - prev_time).total_seconds()
            if gap > threshold:
                total_downtime += gap
            prev_time = ts

        # Gap after last pulse
        gap = (end - prev_time).total_seconds()
        if gap > threshold:
            total_downtime += gap

        return total_downtime

    # ==================== CADENCE HISTORY ====================

    async def calculate_minute_cadence(self):
        """Called every minute by background task to store cadence history"""
        machines = await self.db.mes_machines.find({"active": True}).to_list(500)
        now = datetime.now(timezone.utc)
        t_1min = now - timedelta(seconds=60)

        for machine in machines:
            mid = machine["_id"]
            mtype = machine.get("type", "Imp")

            if mtype == "cp/min":
                # Pour cp/min, on stocke la dernière cadence reçue (si encore valide)
                current_cad = machine.get("current_cadence")
                cad_at = machine.get("current_cadence_at")
                if isinstance(cad_at, str):
                    try:
                        cad_at = datetime.fromisoformat(cad_at.replace("Z", "+00:00"))
                    except (ValueError, AttributeError):
                        cad_at = None
                if cad_at and cad_at.tzinfo is None:
                    cad_at = cad_at.replace(tzinfo=timezone.utc)
                # Cadence valide si reçue dans la dernière minute (et machine active)
                if current_cad is not None and cad_at and (now - cad_at).total_seconds() <= 90:
                    count = float(current_cad)
                else:
                    count = 0
            else:
                count = await self.db.mes_pulses.count_documents({
                    "machine_id": mid, "timestamp": {"$gte": t_1min, "$lt": now}
                })

            await self.db.mes_cadence_history.insert_one({
                "machine_id": mid,
                "timestamp": now.replace(second=0, microsecond=0),
                "cadence": count,
                "theoretical": machine.get("theoretical_cadence", 0),
            })

            # Check alerts
            await self._check_alerts(machine, count, now)

    async def get_cadence_history(self, machine_id: str, period: str = "6h",
                                  date_from: str = None, date_to: str = None) -> list:
        mid = ObjectId(machine_id)
        now = datetime.now(timezone.utc)

        if period == "custom" and date_from and date_to:
            start = datetime.fromisoformat(date_from.replace("Z", "+00:00"))
            end = datetime.fromisoformat(date_to.replace("Z", "+00:00"))
            use_hourly = (end - start).total_seconds() > 86400
        elif period == "7d":
            start = now - timedelta(days=7)
            end = now
            use_hourly = True
        else:
            hours_map = {"6h": 6, "12h": 12, "24h": 24}
            h = hours_map.get(period, 6)
            start = now - timedelta(hours=h)
            end = now
            use_hourly = False

        if use_hourly:
            # Aggregate by hour
            pipeline = [
                {"$match": {"machine_id": mid, "timestamp": {"$gte": start, "$lte": end}}},
                {"$group": {
                    "_id": {
                        "year": {"$year": "$timestamp"},
                        "month": {"$month": "$timestamp"},
                        "day": {"$dayOfMonth": "$timestamp"},
                        "hour": {"$hour": "$timestamp"},
                    },
                    "cadence": {"$avg": "$cadence"},
                    "theoretical": {"$first": "$theoretical"},
                    "timestamp": {"$first": "$timestamp"},
                }},
                {"$sort": {"_id": 1}},
            ]
            docs = await self.db.mes_cadence_history.aggregate(pipeline).to_list(10000)
            return [{"timestamp": d["timestamp"].isoformat(), "cadence": round(d["cadence"], 1),
                      "theoretical": d.get("theoretical", 0)} for d in docs]
        else:
            docs = await self.db.mes_cadence_history.find(
                {"machine_id": mid, "timestamp": {"$gte": start, "$lte": end}},
                {"_id": 0, "timestamp": 1, "cadence": 1, "theoretical": 1}
            ).sort("timestamp", 1).to_list(100000)
            return [{"timestamp": d["timestamp"].isoformat(), "cadence": d["cadence"],
                      "theoretical": d.get("theoretical", 0)} for d in docs]

    # ==================== ALERTS ====================

    async def _check_alerts(self, machine, current_cadence, now):
        mid = machine["_id"]
        alerts_config = machine.get("alerts", {})

        # Check if we are within production hours
        schedule = machine.get("production_schedule", {})
        is_24h = schedule.get("is_24h", True)
        start_hour = schedule.get("start_hour", 6)
        end_hour = schedule.get("end_hour", 22)
        production_days = schedule.get("production_days", [0, 1, 2, 3, 4])

        today_weekday = now.weekday()
        if today_weekday not in production_days:
            return  # Not a production day, skip alerts

        if not is_24h:
            current_hour = now.hour
            if current_hour < start_hour or current_hour >= end_hour:
                return  # Outside production hours, skip alerts

        # Check stopped
        stopped_min = alerts_config.get("stopped_minutes", 0)
        machine_type_alert = machine.get("type", "Imp")
        last_p = machine.get("last_pulse_at")
        # Correction migration DB : last_pulse_at peut être une chaîne ISO après migration
        if last_p and isinstance(last_p, str):
            try:
                last_p = datetime.fromisoformat(last_p.replace('Z', '+00:00'))
            except (ValueError, TypeError):
                last_p = None
        if last_p and last_p.tzinfo is None:
            last_p = last_p.replace(tzinfo=timezone.utc)

        # Pour cp/min avec état explicite: l'arrêt est basé sur is_running=False et state_updated_at
        if machine_type_alert == "cp/min" and machine.get("state_explicit"):
            if stopped_min > 0 and not machine.get("is_running", True):
                state_at = machine.get("state_updated_at")
                if isinstance(state_at, str):
                    try:
                        state_at = datetime.fromisoformat(state_at.replace('Z', '+00:00'))
                    except (ValueError, TypeError):
                        state_at = None
                if state_at and state_at.tzinfo is None:
                    state_at = state_at.replace(tzinfo=timezone.utc)
                if state_at:
                    elapsed = (now - state_at).total_seconds() / 60
                    if elapsed >= stopped_min:
                        await self._create_alert(machine, "STOPPED",
                            f"Machine à l'arrêt depuis {int(elapsed)} min")
        elif stopped_min > 0 and last_p:
            elapsed = (now - last_p).total_seconds() / 60
            if elapsed >= stopped_min:
                await self._create_alert(machine, "STOPPED",
                    f"Machine à l'arrêt depuis {int(elapsed)} min")

        # Check under cadence
        under = alerts_config.get("under_cadence", 0)
        if under > 0 and current_cadence < under and current_cadence > 0:
            await self._create_alert(machine, "UNDER_CADENCE",
                f"Sous-cadence: {current_cadence} cp/min (seuil: {under})")

        # Check over cadence
        over = alerts_config.get("over_cadence", 0)
        if over > 0 and current_cadence > over:
            await self._create_alert(machine, "OVER_CADENCE",
                f"Sur-cadence: {current_cadence} cp/min (seuil: {over})")

        # Check daily target
        target = alerts_config.get("daily_target", 0)
        if target > 0:
            today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
            count_today = await self.db.mes_pulses.count_documents({
                "machine_id": mid, "timestamp": {"$gte": today_start}
            })
            if count_today >= target:
                await self._create_alert(machine, "TARGET_REACHED",
                    f"Objectif journalier atteint: {count_today}/{target}")

        # Check no signal
        no_signal_min = alerts_config.get("no_signal_minutes", 0)
        if no_signal_min > 0 and last_p:
            elapsed_ns = (now - last_p).total_seconds() / 60
            if elapsed_ns >= no_signal_min:
                await self._create_alert(machine, "NO_SIGNAL",
                    f"Pas de signal depuis {int(elapsed_ns)} min")

        # Check TRS below target
        trs_target = machine.get("trs_target", 0)
        if trs_target > 0:
            metrics = await self.get_realtime_metrics(str(mid))
            current_trs = metrics.get("trs", 0)
            # Only alert if there is actual planned production (avoid false alerts)
            if metrics.get("planned_seconds", 0) > 300 and current_trs < trs_target:
                await self._create_alert(machine, "TRS_BELOW_TARGET",
                    f"TRS sous objectif: {current_trs}% (objectif: {trs_target}%)")

    async def _create_alert(self, machine, alert_type, message):
        """Create an alert and optionally send email notification.
        machine: full machine document (dict)
        """
        machine_id = machine["_id"]
        email_config = machine.get("email_notifications", {})
        delay_minutes = email_config.get("delay_minutes", 5)

        # Don't create duplicate alerts within delay_minutes
        recent = await self.db.mes_alerts.find_one({
            "machine_id": machine_id,
            "type": alert_type,
            "created_at": {"$gte": datetime.now(timezone.utc) - timedelta(minutes=max(delay_minutes, 5))},
        })
        if recent:
            return

        eq_name = "Inconnu"
        eq = await self.db.equipments.find_one({"_id": machine.get("equipment_id")}, {"nom": 1})
        if eq:
            eq_name = eq["nom"]

        alert_doc = {
            "machine_id": machine_id,
            "type": alert_type,
            "message": message,
            "equipment_name": eq_name,
            "read": False,
            "email_sent": False,
            "created_at": datetime.now(timezone.utc),
        }
        await self.db.mes_alerts.insert_one(alert_doc)

        # Send email notification if configured
        if (email_config.get("enabled") and
            email_config.get("recipients") and
            alert_type in email_config.get("alert_types", [])):
            try:
                self._send_alert_email(email_config["recipients"], eq_name, alert_type, message)
                await self.db.mes_alerts.update_one(
                    {"_id": alert_doc["_id"]},
                    {"$set": {"email_sent": True}}
                )
            except Exception as e:
                logger.error(f"[MES] Erreur envoi email alerte: {e}")

    def _send_alert_email(self, recipients, equipment_name, alert_type, message):
        """Send alert email using the existing email service"""
        from email_service import send_email

        alert_labels = {
            "STOPPED": "Arret machine",
            "UNDER_CADENCE": "Sous-cadence",
            "OVER_CADENCE": "Sur-cadence",
            "NO_SIGNAL": "Perte de signal",
            "TARGET_REACHED": "Objectif atteint",
            "TRS_BELOW_TARGET": "TRS sous objectif",
        }
        alert_label = alert_labels.get(alert_type, alert_type)
        now_str = datetime.now(timezone.utc).strftime("%d/%m/%Y %H:%M UTC")

        html = f"""
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
            <div style="background:#1e293b;color:white;padding:16px 24px;border-radius:8px 8px 0 0;">
                <h2 style="margin:0;font-size:18px;">Alerte M.E.S. - {alert_label}</h2>
            </div>
            <div style="padding:24px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px;">
                <table style="width:100%;border-collapse:collapse;">
                    <tr><td style="padding:8px 0;color:#64748b;width:140px;">Machine</td>
                        <td style="padding:8px 0;font-weight:600;">{equipment_name}</td></tr>
                    <tr><td style="padding:8px 0;color:#64748b;">Type</td>
                        <td style="padding:8px 0;"><span style="background:#fef2f2;color:#dc2626;padding:2px 8px;border-radius:4px;font-size:13px;">{alert_label}</span></td></tr>
                    <tr><td style="padding:8px 0;color:#64748b;">Detail</td>
                        <td style="padding:8px 0;">{message}</td></tr>
                    <tr><td style="padding:8px 0;color:#64748b;">Date</td>
                        <td style="padding:8px 0;">{now_str}</td></tr>
                </table>
            </div>
            <p style="text-align:center;color:#94a3b8;font-size:12px;margin-top:16px;">FSAO Iris - Systeme M.E.S.</p>
        </div>
        """
        subject = f"[M.E.S.] {alert_label} - {equipment_name}"

        for recipient in recipients:
            try:
                send_email(recipient.strip(), subject, html)
                logger.info(f"[MES] Email alerte envoye a {recipient}")
            except Exception as e:
                logger.error(f"[MES] Erreur envoi email a {recipient}: {e}")

    async def get_alerts(self, unread_only=False, limit=50) -> list:
        query = {"read": False} if unread_only else {}
        alerts = await self.db.mes_alerts.find(query).sort("created_at", -1).limit(limit).to_list(limit)
        return [self._serialize(a) for a in alerts]

    async def get_unread_alert_count(self) -> int:
        return await self.db.mes_alerts.count_documents({"read": False})

    async def mark_alert_read(self, alert_id: str):
        await self.db.mes_alerts.update_one({"_id": ObjectId(alert_id)}, {"$set": {"read": True}})

    async def mark_all_alerts_read(self):
        await self.db.mes_alerts.update_many({"read": False}, {"$set": {"read": True}})

    async def delete_all_alerts(self):
        """Supprimer toutes les alertes M.E.S."""
        await self.db.mes_alerts.delete_many({})

    # ==================== PING ====================

    async def ping_sensor(self, machine_id: str) -> dict:
        machine = await self.db.mes_machines.find_one({"_id": ObjectId(machine_id)})
        if not machine or not machine.get("sensor_ip"):
            return {"success": False, "message": "IP capteur non configurée"}
        ip = machine["sensor_ip"]
        try:
            result = subprocess.run(
                ["ping", "-c", "3", "-W", "2", str(ip)],
                capture_output=True, text=True, timeout=10
            )
            return {
                "success": result.returncode == 0,
                "ip": ip,
                "message": "Capteur joignable" if result.returncode == 0 else "Capteur injoignable",
                "output": result.stdout[-200:] if result.stdout else result.stderr[-200:]
            }
        except Exception as e:
            return {"success": False, "ip": ip, "message": str(e)}

    # ==================== MQTT SUBSCRIPTION ====================

    def _subscribe_machine(self, machine):
        # Liste des topics à souscrire pour cette machine
        topics = []
        main_topic = machine.get("mqtt_topic")
        if main_topic:
            topics.append(main_topic)
        # Pour le type cp/min, on souscrit aussi au topic d'état
        if machine.get("type") == "cp/min":
            state_topic = machine.get("mqtt_topic_state")
            if state_topic:
                topics.append(state_topic)

        if not topics or not self.mqtt_manager:
            return

        for topic in topics:
            if not self.mqtt_manager.is_connected:
                # MQTT pas encore connecté: mettre en file d'attente
                self._pending_topics.add(topic)
                logger.warning(f"[MES] MQTT non connecté, topic en attente: {topic}")
                continue
            if topic not in self._subscribed_topics:
                result = self.mqtt_manager.subscribe(topic, callback=self._on_mqtt_message)
                if result:
                    self._subscribed_topics.add(topic)
                    self._pending_topics.discard(topic)
                    logger.info(f"[MES] Abonné au topic: {topic}")
                else:
                    self._pending_topics.add(topic)
                    logger.error(f"[MES] Échec abonnement topic: {topic}")

    def _resubscribe_all(self):
        """Re-souscrire à tous les topics (appelé quand MQTT se reconnecte)"""
        all_topics = self._subscribed_topics | self._pending_topics
        logger.info(f"[MES] Re-souscription à {len(all_topics)} topic(s): {list(all_topics)}")
        
        self._subscribed_topics.clear()
        self._pending_topics.clear()
        
        for topic in all_topics:
            if self.mqtt_manager and self.mqtt_manager.is_connected:
                logger.info(f"[MES] Tentative de re-souscription à: {topic}")
                result = self.mqtt_manager.subscribe(topic, callback=self._on_mqtt_message)
                if result:
                    self._subscribed_topics.add(topic)
                    logger.info(f"[MES] ✅ Re-abonné au topic: {topic}")
                else:
                    self._pending_topics.add(topic)
                    logger.error(f"[MES] ❌ Échec re-abonnement topic: {topic}")
            else:
                self._pending_topics.add(topic)
                logger.warning(f"[MES] MQTT non connecté, topic remis en attente: {topic}")

    def _on_mqtt_message(self, topic, payload, qos):
        """Callback MQTT - reçoit les messages des machines M.E.S.
        Signature: (topic: str, payload: str, qos: int) depuis mqtt_manager._on_message
        Note: Ce callback est appelé depuis le thread paho-mqtt, pas le thread principal asyncio

        Le topic peut correspondre à :
          - mqtt_topic (topic principal) : impulsion (Imp) ou cadence directe (cp/min)
          - mqtt_topic_state (uniquement type cp/min) : état explicite ACTIVE/IDLE
        """
        logger.info(f"[MES] 📥 Message MQTT reçu: topic={topic}, payload={payload}, qos={qos}")

        try:
            payload_str = str(payload).strip()
            self._handle_mqtt_message_sync(topic, payload_str)
        except Exception as e:
            logger.error(f"[MES] ❌ Erreur traitement message MQTT: {e}")
            import traceback
            logger.error(traceback.format_exc())

    def _handle_mqtt_message_sync(self, topic: str, payload: str):
        """Routage du message MQTT vers le bon handler selon le topic et le type de machine.
        Exécute en mode synchrone (thread paho-mqtt).
        """
        from pymongo import MongoClient

        mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
        db_name = os.environ.get('DB_NAME', 'gmao_iris')
        mongo_client = MongoClient(mongo_url, serverSelectionTimeoutMS=5000)
        try:
            db_sync = mongo_client[db_name]

            # 1) Recherche machine par topic principal (Imp ou cadence cp/min)
            machine = db_sync.mes_machines.find_one({"mqtt_topic": topic, "active": True})
            if machine:
                mtype = machine.get("type", "Imp")
                if mtype == "cp/min":
                    self._record_direct_cadence_sync(db_sync, machine, payload)
                else:
                    self._record_pulse_machine_sync(db_sync, machine, payload)
                return

            # 2) Recherche machine par topic d'état (cp/min uniquement)
            machine_state = db_sync.mes_machines.find_one({
                "mqtt_topic_state": topic,
                "type": "cp/min",
                "active": True,
            })
            if machine_state:
                self._record_state_sync(db_sync, machine_state, payload)
                return

            logger.warning(f"[MES] ⚠️ Aucune machine trouvée pour le topic: {topic}")
        finally:
            mongo_client.close()

    def _record_pulse_machine_sync(self, db_sync, machine, payload: str):
        """Traite une impulsion (Imp) reçue. Compatible avec l'ancien format."""
        try:
            value = int(float(payload))
        except ValueError:
            logger.warning(f"[MES] ⚠️ Payload Imp non numérique: {payload}")
            return

        if value != 1:
            logger.info(f"[MES] Valeur Imp ignorée (!=1): {value}")
            return

        now = datetime.now(timezone.utc)
        mid = machine["_id"]
        db_sync.mes_pulses.insert_one({"machine_id": mid, "timestamp": now})
        db_sync.mes_machines.update_one(
            {"_id": mid},
            {"$set": {"last_pulse_at": now, "is_running": True}}
        )
        logger.info(f"[MES] ✅ Pulse Imp enregistré pour machine {mid}")

    def _record_direct_cadence_sync(self, db_sync, machine, payload: str):
        """Traite une cadence directe (cp/min) reçue.
        Le payload est un nombre (entier ou décimal) représentant la cadence courante.
        On stocke la valeur sur la machine et on synthétise des impulsions pour
        rester compatible avec les calculs existants.
        """
        try:
            cadence_value = float(payload)
        except ValueError:
            logger.warning(f"[MES] ⚠️ Payload cp/min non numérique: {payload}")
            return

        if cadence_value < 0:
            cadence_value = 0

        now = datetime.now(timezone.utc)
        mid = machine["_id"]

        # Récupère l'horodatage de la dernière cadence reçue pour calculer
        # le nombre d'impulsions à synthétiser depuis la dernière mise à jour.
        last_cad_at = machine.get("current_cadence_at") or machine.get("last_pulse_at")
        if isinstance(last_cad_at, str):
            try:
                last_cad_at = datetime.fromisoformat(last_cad_at.replace("Z", "+00:00"))
            except (ValueError, AttributeError):
                last_cad_at = None
        if last_cad_at and last_cad_at.tzinfo is None:
            last_cad_at = last_cad_at.replace(tzinfo=timezone.utc)

        # Synthétiser des impulsions correspondant aux pièces produites
        # depuis la dernière mise à jour de cadence.
        # Production = cadence (cp/min) * delta_minutes
        # On limite delta à 5 min max pour éviter les "rattrapages" abusifs après une coupure.
        if last_cad_at:
            delta_seconds = (now - last_cad_at).total_seconds()
            delta_seconds = max(0, min(delta_seconds, 300))  # cap 5 min
        else:
            delta_seconds = 60.0  # par défaut, 1 minute

        # Utilise la cadence précédente pour la période écoulée (plus juste)
        prev_cadence = float(machine.get("current_cadence", cadence_value) or cadence_value)
        pulses_to_add = int(round(prev_cadence * delta_seconds / 60.0))

        if pulses_to_add > 0:
            # Distribuer les pulses uniformément sur la période écoulée
            interval = delta_seconds / pulses_to_add if pulses_to_add > 0 else 0
            base_ts = last_cad_at if last_cad_at else (now - timedelta(seconds=delta_seconds))
            docs = [
                {"machine_id": mid, "timestamp": base_ts + timedelta(seconds=interval * (i + 1))}
                for i in range(pulses_to_add)
            ]
            db_sync.mes_pulses.insert_many(docs)

        # Détermine is_running : si l'état n'est pas explicitement contrôlé
        # par mqtt_topic_state, on infère depuis la cadence (>0 = running).
        # Si state_explicit, on conserve l'état déjà défini par le state topic.
        update_fields = {
            "current_cadence": cadence_value,
            "current_cadence_at": now,
            "last_pulse_at": now,
        }
        if not machine.get("state_explicit"):
            update_fields["is_running"] = cadence_value > 0

        db_sync.mes_machines.update_one({"_id": mid}, {"$set": update_fields})
        logger.info(f"[MES] ✅ Cadence cp/min={cadence_value} (pulses synthétisés={pulses_to_add}) pour machine {mid}")

    def _record_state_sync(self, db_sync, machine, payload: str):
        """Traite un message d'état explicite (ACTIVE / IDLE) pour une machine cp/min."""
        state_str = payload.strip().upper()
        if state_str in ("ACTIVE", "RUNNING", "ON", "1", "TRUE"):
            is_running = True
        elif state_str in ("IDLE", "STOPPED", "OFF", "0", "FALSE"):
            is_running = False
        else:
            logger.warning(f"[MES] ⚠️ État inconnu pour cp/min: {payload}")
            return

        now = datetime.now(timezone.utc)
        mid = machine["_id"]
        update = {
            "is_running": is_running,
            "state_explicit": True,
            "state_updated_at": now,
        }
        # Si la machine repasse ACTIVE on met à jour last_pulse_at pour
        # éviter le déclenchement d'alerte "stopped" basée sur le timeout.
        if is_running:
            update["last_pulse_at"] = now

        db_sync.mes_machines.update_one({"_id": mid}, {"$set": update})
        logger.info(f"[MES] ✅ État cp/min mis à jour: {state_str} -> is_running={is_running} pour machine {mid}")


    async def subscribe_all(self):
        """Subscribe to all active machine topics"""
        machines = await self.db.mes_machines.find({"active": True}).to_list(500)
        for m in machines:
            self._subscribe_machine(m)
        logger.info(f"[MES] {len(machines)} machines abonnées MQTT")

    # ==================== PRODUCT REFERENCES ====================

    async def get_product_references(self) -> list:
        refs = await self.db.mes_product_references.find().sort("name", 1).to_list(500)
        return [self._serialize(r) for r in refs]

    async def create_product_reference(self, data: dict) -> dict:
        ref = {
            "name": data["name"].strip(),
            "theoretical_cadence": float(data.get("theoretical_cadence", 6)),
            "downtime_margin_pct": float(data.get("downtime_margin_pct", 30)),
            "trs_target": float(data.get("trs_target", 85)),
            "production_schedule": {
                "is_24h": bool(data.get("schedule_is_24h", True)),
                "start_hour": int(data.get("schedule_start_hour", 6)),
                "end_hour": int(data.get("schedule_end_hour", 22)),
                "production_days": data.get("schedule_production_days", [0, 1, 2, 3, 4]),
            },
            "alerts": {
                "stopped_minutes": int(data.get("alert_stopped_minutes", 5)),
                "under_cadence": float(data.get("alert_under_cadence", 0)),
                "over_cadence": float(data.get("alert_over_cadence", 0)),
                "daily_target": int(data.get("alert_daily_target", 0)),
                "no_signal_minutes": int(data.get("alert_no_signal_minutes", 10)),
            },
            "email_notifications": {
                "enabled": bool(data.get("email_enabled", False)),
                "recipients": data.get("email_recipients", []),
                "alert_types": data.get("email_alert_types", []),
                "delay_minutes": int(data.get("email_delay_minutes", 5)),
            },
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
        }
        result = await self.db.mes_product_references.insert_one(ref)
        ref["_id"] = result.inserted_id
        return self._serialize(ref)

    async def update_product_reference(self, ref_id: str, data: dict) -> dict:
        update = {"updated_at": datetime.now(timezone.utc)}
        simple_fields = {
            "name": str, "theoretical_cadence": float,
            "downtime_margin_pct": float, "trs_target": float,
        }
        for field, cast in simple_fields.items():
            if field in data:
                update[field] = cast(data[field])

        alert_fields = {
            "alert_stopped_minutes": ("alerts.stopped_minutes", int),
            "alert_under_cadence": ("alerts.under_cadence", float),
            "alert_over_cadence": ("alerts.over_cadence", float),
            "alert_daily_target": ("alerts.daily_target", int),
            "alert_no_signal_minutes": ("alerts.no_signal_minutes", int),
        }
        for key, (path, cast) in alert_fields.items():
            if key in data:
                update[path] = cast(data[key])

        schedule_fields = {
            "schedule_is_24h": ("production_schedule.is_24h", bool),
            "schedule_start_hour": ("production_schedule.start_hour", int),
            "schedule_end_hour": ("production_schedule.end_hour", int),
        }
        for key, (path, cast) in schedule_fields.items():
            if key in data:
                update[path] = cast(data[key])
        if "schedule_production_days" in data:
            update["production_schedule.production_days"] = [int(d) for d in data["schedule_production_days"]]

        email_fields = {
            "email_enabled": ("email_notifications.enabled", bool),
            "email_delay_minutes": ("email_notifications.delay_minutes", int),
        }
        for key, (path, cast) in email_fields.items():
            if key in data:
                update[path] = cast(data[key])
        if "email_recipients" in data:
            update["email_notifications.recipients"] = [str(r).strip() for r in data["email_recipients"] if str(r).strip()]
        if "email_alert_types" in data:
            update["email_notifications.alert_types"] = list(data["email_alert_types"])

        await self.db.mes_product_references.update_one({"_id": ObjectId(ref_id)}, {"$set": update})
        doc = await self.db.mes_product_references.find_one({"_id": ObjectId(ref_id)})
        return self._serialize(doc) if doc else None

    async def delete_product_reference(self, ref_id: str):
        # Unlink from any machines using this reference
        await self.db.mes_machines.update_many(
            {"active_reference_id": ObjectId(ref_id)},
            {"$unset": {"active_reference_id": ""}}
        )
        await self.db.mes_product_references.delete_one({"_id": ObjectId(ref_id)})

    async def select_reference_for_machine(self, machine_id: str, ref_id: str) -> dict:
        """Apply a product reference's params to a machine"""
        ref = await self.db.mes_product_references.find_one({"_id": ObjectId(ref_id)})
        if not ref:
            return None

        update = {
            "active_reference_id": ObjectId(ref_id),
            "theoretical_cadence": ref.get("theoretical_cadence", 6),
            "downtime_margin_pct": ref.get("downtime_margin_pct", 30),
            "trs_target": ref.get("trs_target", 85),
            "production_schedule": ref.get("production_schedule", {}),
            "alerts": ref.get("alerts", {}),
            "email_notifications": ref.get("email_notifications", {}),
        }
        await self.db.mes_machines.update_one({"_id": ObjectId(machine_id)}, {"$set": update})
        return await self.get_machine(machine_id)

    # ==================== TRS HISTORY (Weekly) ====================

    async def get_trs_daily_history(self, machine_id: str, days: int = 7) -> list:
        """Get daily TRS values for the last N days"""
        mid = ObjectId(machine_id)
        machine = await self.db.mes_machines.find_one({"_id": mid})
        if not machine:
            return []

        now = datetime.now(timezone.utc)
        theoretical = machine.get("theoretical_cadence", 6)
        margin_pct = machine.get("downtime_margin_pct", 30)
        schedule = machine.get("production_schedule", {})
        is_24h = schedule.get("is_24h", True)
        start_hour = schedule.get("start_hour", 6)
        end_hour = schedule.get("end_hour", 22)
        production_days = schedule.get("production_days", [0, 1, 2, 3, 4])

        results = []
        for i in range(days - 1, -1, -1):
            day_start = (now - timedelta(days=i)).replace(hour=0, minute=0, second=0, microsecond=0)
            day_end = day_start.replace(hour=23, minute=59, second=59)
            if i == 0:
                day_end = now

            day_weekday = day_start.weekday()
            if day_weekday not in production_days:
                results.append({
                    "date": day_start.strftime("%Y-%m-%d"),
                    "trs": None, "availability": None,
                    "performance": None, "quality": None,
                    "production": 0, "rejects": 0,
                    "is_production_day": False,
                })
                continue

            # Planned time for this day
            if is_24h:
                planned = (day_end - day_start).total_seconds()
            else:
                prod_start = day_start.replace(hour=start_hour)
                prod_end = day_start.replace(hour=end_hour)
                if i == 0 and now < prod_end:
                    prod_end = now
                if i == 0 and now < prod_start:
                    planned = 0
                else:
                    planned = max((prod_end - prod_start).total_seconds(), 0)

            count = await self.db.mes_pulses.count_documents({
                "machine_id": mid, "timestamp": {"$gte": day_start, "$lte": day_end}
            })
            downtime = await self._calc_downtime(mid, day_start, day_end, theoretical, margin_pct)
            rejects = await self.get_rejects_total(mid, day_start, day_end)

            if planned > 0:
                operating = max(planned - downtime, 0)
                availability = round(operating / planned * 100, 1)
                if theoretical > 0 and operating > 0:
                    theoretical_during_uptime = theoretical * (operating / 60)
                    performance = round(min(count / theoretical_during_uptime * 100, 100), 1) if theoretical_during_uptime > 0 else 0
                else:
                    performance = 0
                if count > 0:
                    quality = round(max(count - rejects, 0) / count * 100, 1)
                else:
                    quality = 100
                trs = round((availability / 100) * (performance / 100) * (quality / 100) * 100, 1)
            else:
                availability = performance = quality = trs = 0

            results.append({
                "date": day_start.strftime("%Y-%m-%d"),
                "trs": trs, "availability": availability,
                "performance": performance, "quality": quality,
                "production": count, "rejects": rejects,
                "is_production_day": True,
            })

        return results

    # ==================== REJECT REASONS (Admin) ====================

    async def get_reject_reasons(self) -> list:
        reasons = await self.db.mes_reject_reasons.find({"active": True}).sort("label", 1).to_list(500)
        return [self._serialize(r) for r in reasons]

    async def create_reject_reason(self, data: dict) -> dict:
        reason = {
            "label": data["label"].strip(),
            "active": True,
            "created_at": datetime.now(timezone.utc),
        }
        result = await self.db.mes_reject_reasons.insert_one(reason)
        reason["_id"] = result.inserted_id
        return self._serialize(reason)

    async def update_reject_reason(self, reason_id: str, data: dict) -> dict:
        update = {}
        if "label" in data:
            update["label"] = data["label"].strip()
        if "active" in data:
            update["active"] = bool(data["active"])
        if update:
            await self.db.mes_reject_reasons.update_one({"_id": ObjectId(reason_id)}, {"$set": update})
        doc = await self.db.mes_reject_reasons.find_one({"_id": ObjectId(reason_id)})
        return self._serialize(doc) if doc else None

    async def delete_reject_reason(self, reason_id: str):
        await self.db.mes_reject_reasons.delete_one({"_id": ObjectId(reason_id)})

    # ==================== REJECTS (Operator) ====================

    async def declare_reject(self, machine_id: str, data: dict) -> dict:
        reject = {
            "machine_id": ObjectId(machine_id),
            "quantity": int(data["quantity"]),
            "reason": data.get("reason", ""),
            "custom_reason": data.get("custom_reason", ""),
            "operator": data.get("operator", ""),
            "timestamp": datetime.now(timezone.utc),
        }
        result = await self.db.mes_rejects.insert_one(reject)
        reject["_id"] = result.inserted_id
        return self._serialize(reject)

    async def get_rejects(self, machine_id: str, date_from: str = None, date_to: str = None) -> list:
        mid = ObjectId(machine_id)
        now = datetime.now(timezone.utc)
        if date_from and date_to:
            start = datetime.fromisoformat(date_from.replace("Z", "+00:00"))
            end = datetime.fromisoformat(date_to.replace("Z", "+00:00"))
        else:
            start = now.replace(hour=0, minute=0, second=0, microsecond=0)
            end = now
        rejects = await self.db.mes_rejects.find({
            "machine_id": mid,
            "timestamp": {"$gte": start, "$lte": end}
        }).sort("timestamp", -1).to_list(10000)
        return [self._serialize(r) for r in rejects]

    async def get_rejects_total(self, machine_id, start, end) -> int:
        """Get total reject quantity for a machine between start and end"""
        pipeline = [
            {"$match": {"machine_id": machine_id, "timestamp": {"$gte": start, "$lte": end}}},
            {"$group": {"_id": None, "total": {"$sum": "$quantity"}}},
        ]
        result = await self.db.mes_rejects.aggregate(pipeline).to_list(1)
        return result[0]["total"] if result else 0

    async def delete_reject(self, reject_id: str):
        await self.db.mes_rejects.delete_one({"_id": ObjectId(reject_id)})

    # ==================== DATA CLEANUP ====================

    async def cleanup_old_data(self):
        """Remove pulses older than 1 year"""
        cutoff = datetime.now(timezone.utc) - timedelta(days=365)
        r1 = await self.db.mes_pulses.delete_many({"timestamp": {"$lt": cutoff}})
        r2 = await self.db.mes_cadence_history.delete_many({"timestamp": {"$lt": cutoff}})
        if r1.deleted_count or r2.deleted_count:
            logger.info(f"[MES] Nettoyage: {r1.deleted_count} pulses, {r2.deleted_count} cadences supprimés")

    # ==================== REPORTING ====================

    async def get_report_data(self, machine_ids: list, report_type: str, 
                               date_from: str, date_to: str) -> dict:
        """Get aggregated report data for one or more machines"""
        start = datetime.fromisoformat(date_from.replace("Z", "+00:00"))
        end = datetime.fromisoformat(date_to.replace("Z", "+00:00"))
        
        # If no specific machines, get all
        if not machine_ids or machine_ids == ["all"]:
            machines = await self.db.mes_machines.find().to_list(500)
            machine_ids = [str(m["_id"]) for m in machines]
        else:
            machines = []
            for mid in machine_ids:
                m = await self.db.mes_machines.find_one({"_id": ObjectId(mid)})
                if m:
                    machines.append(m)
        
        result = {
            "period": {"from": date_from, "to": date_to},
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "machines": [],
            "summary": {},
        }
        
        total_production = 0
        total_rejects = 0
        total_downtime = 0
        all_trs_values = []
        
        for machine in machines:
            mid = machine["_id"]
            eq = await self.db.equipments.find_one({"_id": machine.get("equipment_id")}, {"nom": 1})
            machine_name = eq["nom"] if eq else "Inconnu"
            
            machine_data = {
                "id": str(mid),
                "name": machine_name,
                "mqtt_topic": machine.get("mqtt_topic", ""),
            }
            
            if report_type in ["trs", "all"]:
                trs_data = await self._get_trs_report_data(mid, machine, start, end)
                machine_data["trs"] = trs_data
                if trs_data.get("trs_values"):
                    all_trs_values.extend([v["trs"] for v in trs_data["trs_values"] if v.get("trs") is not None])
            
            if report_type in ["production", "all"]:
                prod_data = await self._get_production_report_data(mid, start, end)
                machine_data["production"] = prod_data
                total_production += prod_data.get("total", 0)
            
            if report_type in ["stops", "all"]:
                stops_data = await self._get_stops_report_data(mid, machine, start, end)
                machine_data["stops"] = stops_data
                total_downtime += stops_data.get("total_downtime_seconds", 0)
            
            if report_type in ["rejects", "all"]:
                rejects_data = await self._get_rejects_report_data(mid, start, end)
                machine_data["rejects"] = rejects_data
                total_rejects += rejects_data.get("total", 0)
            
            if report_type in ["alerts", "all"]:
                alerts_data = await self._get_alerts_report_data(mid, start, end)
                machine_data["alerts"] = alerts_data
            
            result["machines"].append(machine_data)
        
        # Summary
        result["summary"] = {
            "total_machines": len(machines),
            "total_production": total_production,
            "total_rejects": total_rejects,
            "total_downtime_hours": round(total_downtime / 3600, 2),
            "average_trs": round(sum(all_trs_values) / len(all_trs_values), 1) if all_trs_values else 0,
        }
        
        return result

    async def _get_trs_report_data(self, machine_id, machine, start, end) -> dict:
        """Get TRS data for reporting"""
        theoretical = machine.get("theoretical_cadence", 6)
        margin_pct = machine.get("downtime_margin_pct", 30)
        schedule = machine.get("production_schedule", {})
        is_24h = schedule.get("is_24h", True)
        start_hour = schedule.get("start_hour", 6)
        end_hour = schedule.get("end_hour", 22)
        production_days = schedule.get("production_days", [0, 1, 2, 3, 4])
        
        trs_values = []
        current = start.replace(hour=0, minute=0, second=0, microsecond=0)
        
        while current <= end:
            day_start = current
            day_end = current.replace(hour=23, minute=59, second=59)
            if day_end > end:
                day_end = end
            
            day_weekday = current.weekday()
            if day_weekday not in production_days:
                trs_values.append({
                    "date": current.strftime("%Y-%m-%d"),
                    "trs": None, "availability": None,
                    "performance": None, "quality": None,
                    "is_production_day": False,
                })
                current += timedelta(days=1)
                continue
            
            # Calculate planned time
            if is_24h:
                planned = (day_end - day_start).total_seconds()
            else:
                prod_start = day_start.replace(hour=start_hour)
                prod_end = day_start.replace(hour=end_hour)
                if day_end < prod_end:
                    prod_end = day_end
                planned = max((prod_end - prod_start).total_seconds(), 0)
            
            count = await self.db.mes_pulses.count_documents({
                "machine_id": machine_id, "timestamp": {"$gte": day_start, "$lte": day_end}
            })
            downtime = await self._calc_downtime(machine_id, day_start, day_end, theoretical, margin_pct)
            rejects = await self.get_rejects_total(machine_id, day_start, day_end)
            
            if planned > 0:
                operating = max(planned - downtime, 0)
                availability = round(operating / planned * 100, 1)
                if theoretical > 0 and operating > 0:
                    theoretical_during_uptime = theoretical * (operating / 60)
                    performance = round(min(count / theoretical_during_uptime * 100, 100), 1) if theoretical_during_uptime > 0 else 0
                else:
                    performance = 0
                if count > 0:
                    quality = round(max(count - rejects, 0) / count * 100, 1)
                else:
                    quality = 100
                trs = round((availability / 100) * (performance / 100) * (quality / 100) * 100, 1)
            else:
                availability = performance = quality = trs = 0
            
            trs_values.append({
                "date": current.strftime("%Y-%m-%d"),
                "trs": trs, "availability": availability,
                "performance": performance, "quality": quality,
                "production": count, "rejects": rejects,
                "is_production_day": True,
            })
            current += timedelta(days=1)
        
        # Averages
        prod_days = [v for v in trs_values if v.get("is_production_day") and v.get("trs") is not None]
        return {
            "trs_values": trs_values,
            "average_trs": round(sum(v["trs"] for v in prod_days) / len(prod_days), 1) if prod_days else 0,
            "average_availability": round(sum(v["availability"] for v in prod_days) / len(prod_days), 1) if prod_days else 0,
            "average_performance": round(sum(v["performance"] for v in prod_days) / len(prod_days), 1) if prod_days else 0,
            "average_quality": round(sum(v["quality"] for v in prod_days) / len(prod_days), 1) if prod_days else 0,
        }

    async def _get_production_report_data(self, machine_id, start, end) -> dict:
        """Get production data for reporting"""
        # Daily production
        pipeline = [
            {"$match": {"machine_id": machine_id, "timestamp": {"$gte": start, "$lte": end}}},
            {"$group": {
                "_id": {
                    "year": {"$year": "$timestamp"},
                    "month": {"$month": "$timestamp"},
                    "day": {"$dayOfMonth": "$timestamp"},
                },
                "count": {"$sum": 1},
            }},
            {"$sort": {"_id": 1}},
        ]
        daily = await self.db.mes_pulses.aggregate(pipeline).to_list(1000)
        
        daily_values = []
        for d in daily:
            date_str = f"{d['_id']['year']:04d}-{d['_id']['month']:02d}-{d['_id']['day']:02d}"
            daily_values.append({"date": date_str, "production": d["count"]})
        
        total = await self.db.mes_pulses.count_documents({
            "machine_id": machine_id, "timestamp": {"$gte": start, "$lte": end}
        })
        
        return {
            "total": total,
            "daily_values": daily_values,
            "average_daily": round(total / max(len(daily_values), 1), 1),
        }

    async def _get_stops_report_data(self, machine_id, machine, start, end) -> dict:
        """Get stops/downtime data for reporting"""
        theoretical = machine.get("theoretical_cadence", 6)
        margin_pct = machine.get("downtime_margin_pct", 30)
        
        total_downtime = await self._calc_downtime(machine_id, start, end, theoretical, margin_pct)
        
        # Get stop events from alerts
        stop_alerts = await self.db.mes_alerts.find({
            "machine_id": machine_id,
            "type": {"$in": ["STOPPED", "NO_SIGNAL"]},
            "created_at": {"$gte": start, "$lte": end}
        }).sort("created_at", -1).to_list(1000)
        
        stops = []
        for alert in stop_alerts:
            stops.append({
                "timestamp": alert["created_at"].isoformat(),
                "type": alert["type"],
                "message": alert.get("message", ""),
            })
        
        return {
            "total_downtime_seconds": total_downtime,
            "total_downtime_hours": round(total_downtime / 3600, 2),
            "stop_events": stops,
            "stop_count": len(stops),
        }

    async def _get_rejects_report_data(self, machine_id, start, end) -> dict:
        """Get rejects data for reporting"""
        rejects = await self.db.mes_rejects.find({
            "machine_id": machine_id,
            "timestamp": {"$gte": start, "$lte": end}
        }).sort("timestamp", -1).to_list(10000)
        
        # Group by reason
        by_reason = {}
        for r in rejects:
            reason = r.get("reason") or r.get("custom_reason") or "Sans motif"
            if reason not in by_reason:
                by_reason[reason] = 0
            by_reason[reason] += r.get("quantity", 0)
        
        # Daily rejects
        pipeline = [
            {"$match": {"machine_id": machine_id, "timestamp": {"$gte": start, "$lte": end}}},
            {"$group": {
                "_id": {
                    "year": {"$year": "$timestamp"},
                    "month": {"$month": "$timestamp"},
                    "day": {"$dayOfMonth": "$timestamp"},
                },
                "total": {"$sum": "$quantity"},
            }},
            {"$sort": {"_id": 1}},
        ]
        daily = await self.db.mes_rejects.aggregate(pipeline).to_list(1000)
        
        daily_values = []
        for d in daily:
            date_str = f"{d['_id']['year']:04d}-{d['_id']['month']:02d}-{d['_id']['day']:02d}"
            daily_values.append({"date": date_str, "rejects": d["total"]})
        
        total = sum(r.get("quantity", 0) for r in rejects)
        
        return {
            "total": total,
            "by_reason": [{"reason": k, "quantity": v} for k, v in sorted(by_reason.items(), key=lambda x: -x[1])],
            "daily_values": daily_values,
            "details": [self._serialize(r) for r in rejects[:100]],  # Limit details
        }

    async def _get_alerts_report_data(self, machine_id, start, end) -> dict:
        """Get alerts data for reporting"""
        alerts = await self.db.mes_alerts.find({
            "machine_id": machine_id,
            "created_at": {"$gte": start, "$lte": end}
        }).sort("created_at", -1).to_list(10000)
        
        # Group by type
        by_type = {}
        for a in alerts:
            atype = a.get("type", "UNKNOWN")
            if atype not in by_type:
                by_type[atype] = 0
            by_type[atype] += 1
        
        return {
            "total": len(alerts),
            "by_type": [{"type": k, "count": v} for k, v in sorted(by_type.items(), key=lambda x: -x[1])],
            "details": [self._serialize(a) for a in alerts[:100]],  # Limit details
        }

    # ==================== SCHEDULED REPORTS ====================

    async def get_scheduled_reports(self) -> list:
        """Get all scheduled M.E.S. reports"""
        reports = await self.db.mes_scheduled_reports.find({"active": True}).sort("created_at", -1).to_list(100)
        return [self._serialize(r) for r in reports]

    async def get_scheduled_report(self, report_id: str) -> dict:
        """Get a single scheduled report"""
        report = await self.db.mes_scheduled_reports.find_one({"_id": ObjectId(report_id)})
        return self._serialize(report) if report else None

    async def create_scheduled_report(self, data: dict) -> dict:
        """Create a new scheduled report"""
        report = {
            "name": data.get("name", "Rapport M.E.S."),
            "machine_ids": data.get("machine_ids", ["all"]),
            "report_type": data.get("report_type", "all"),
            "frequency": data.get("frequency", "weekly"),  # daily, weekly, monthly
            "day_of_week": data.get("day_of_week", 0),  # 0=Monday, 6=Sunday (for weekly)
            "day_of_month": data.get("day_of_month", 1),  # 1-28 (for monthly)
            "hour": data.get("hour", 8),  # 0-23
            "minute": data.get("minute", 0),  # 0-59
            "recipients": data.get("recipients", []),
            "format": data.get("format", "pdf"),  # pdf, excel
            "include_charts": data.get("include_charts", True),
            "active": True,
            "last_sent_at": None,
            "created_at": datetime.now(timezone.utc),
            "created_by": data.get("created_by", ""),
        }
        result = await self.db.mes_scheduled_reports.insert_one(report)
        report["_id"] = result.inserted_id
        return self._serialize(report)

    async def update_scheduled_report(self, report_id: str, data: dict) -> dict:
        """Update a scheduled report"""
        update = {}
        fields = ["name", "machine_ids", "report_type", "frequency", "day_of_week", 
                  "day_of_month", "hour", "minute", "recipients", "format", 
                  "include_charts", "active"]
        for field in fields:
            if field in data:
                update[field] = data[field]
        
        if update:
            await self.db.mes_scheduled_reports.update_one(
                {"_id": ObjectId(report_id)}, {"$set": update}
            )
        
        report = await self.db.mes_scheduled_reports.find_one({"_id": ObjectId(report_id)})
        return self._serialize(report) if report else None

    async def delete_scheduled_report(self, report_id: str):
        """Delete a scheduled report"""
        await self.db.mes_scheduled_reports.delete_one({"_id": ObjectId(report_id)})

    async def mark_report_sent(self, report_id: str):
        """Mark a scheduled report as sent"""
        await self.db.mes_scheduled_reports.update_one(
            {"_id": ObjectId(report_id)},
            {"$set": {"last_sent_at": datetime.now(timezone.utc)}}
        )

    # ==================== UTILS ====================

    def _serialize(self, doc):
        if not doc:
            return None
        result = {}
        for k, v in doc.items():
            if k == "_id":
                result["id"] = str(v)
            elif isinstance(v, ObjectId):
                result[k] = str(v)
            elif isinstance(v, datetime):
                result[k] = v.isoformat()
            else:
                result[k] = v
        return result
