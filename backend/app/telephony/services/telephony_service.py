"""
Telephony Service — tenant-facing runtime entry point.

This is the ONLY module Recruitment/HRM call buttons and the tenant-facing
API route should import. It reads master_db.telephony_settings for the
tenant's active provider, routes through the Provider Factory, and writes
company_db.telephony_call_logs / telephony_sync_logs.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException

from app.core.crm_events import emit_company_event
from app.telephony.services.provider_factory import get_provider
from app.telephony.services.telephony_settings_service import TelephonySettingsService
from app.telephony.utils.webhook_normalizer import normalize_webhook, verify_signature

CALL_LOGS_COLLECTION = "telephony_call_logs"
WEBHOOKS_COLLECTION = "telephony_webhooks"
SYNC_LOGS_COLLECTION = "telephony_sync_logs"
FAVORITES_COLLECTION = "telephony_favorites"
DISPOSITIONS_COLLECTION = "telephony_disposition_options"
PRESENCE_COLLECTION = "telephony_agent_presence"

_ACTIVE_STATUSES = {"initiated", "incoming_call", "answered", "on_hold"}
_MISSED_STATUSES = {"missed", "no-answer", "failed", "busy"}
_PRESENCE_STATUSES = {"available", "busy", "on_call", "wrap_up", "break", "offline"}
_SYSTEM_DERIVED_PRESENCE = {"on_call", "wrap_up", "offline"}  # never user-settable directly
_DEFAULT_DISPOSITIONS = [
    "Interested", "Not Interested", "Call Back Later", "Wrong Number",
    "Busy", "No Answer", "Interview Scheduled", "Offer Discussed", "Joined",
]


async def _notify_owner(master_db, company_db, company_id: str, notify_coro_name: str, /, **kwargs) -> None:
    """Best-effort notification to the tenant owner — the one recipient we
    can always resolve without inventing an agent-assignment concept that
    doesn't exist in this codebase. Never raises; a notification failure
    must never block a telephony operation."""
    try:
        tenant = await master_db.tenants.find_one({"company_id": company_id}, {"owner._id": 1})
        owner_id = str((tenant or {}).get("owner", {}).get("_id", ""))
        if not owner_id:
            return
        from app.services.notification_service import NotificationService
        fn = getattr(NotificationService(company_db), notify_coro_name)
        await fn(company_id=company_id, user_id=owner_id, **kwargs)
    except Exception:
        pass


def _serialize_log(doc: dict) -> dict:
    """JSON-safe copy of a call-log document for WebSocket broadcast
    (emit_company_event requires JSON-serialisable payloads)."""
    out = dict(doc)
    for key in ("created_at", "updated_at"):
        if isinstance(out.get(key), datetime):
            out[key] = out[key].isoformat()
    return out


class TelephonyService:

    @staticmethod
    async def get_status(master_db, company_id: str) -> dict:
        cfg = await TelephonySettingsService.get_runtime_config(master_db, company_id)
        if not cfg:
            return {"enabled": False, "provider": None}
        return {"enabled": True, "provider": cfg["provider"]}

    @staticmethod
    async def get_capabilities(master_db, company_id: str) -> dict:
        """Capability truth table for the tenant's active provider — the
        frontend uses this to decide what call-control UI to render instead
        of hardcoding provider checks. Empty dict if telephony is disabled."""
        cfg = await TelephonySettingsService.get_runtime_config(master_db, company_id)
        if not cfg:
            return {}
        provider = get_provider(cfg["provider"], cfg["credentials"])
        return provider.get_capabilities()

    @staticmethod
    async def _require_config(master_db, company_id: str) -> dict:
        cfg = await TelephonySettingsService.get_runtime_config(master_db, company_id)
        if not cfg:
            raise HTTPException(status_code=400, detail="Telephony is not enabled for this tenant.")
        return cfg

    @staticmethod
    async def make_call(
        master_db, company_db, company_id: str, user_id: str, to: str,
        *, from_number: Optional[str] = None, candidate_id: Optional[str] = None,
        employee_id: Optional[str] = None, client_id: Optional[str] = None,
    ) -> dict:
        cfg = await TelephonyService._require_config(master_db, company_id)
        provider = get_provider(cfg["provider"], cfg["credentials"])
        result = await provider.make_outbound_call(
            to=to, from_=from_number or "", caller_id=cfg["credentials"].get("caller_id"),
        )

        now = datetime.now(timezone.utc)
        log_doc = {
            "_id": str(uuid.uuid4()),
            "tenant_id": company_id,
            "company_id": company_id,
            "provider": cfg["provider"],
            "call_id": result.get("call_id"),
            "caller": from_number or cfg["credentials"].get("caller_id"),
            "receiver": to,
            "candidate_id": candidate_id,
            "employee_id": employee_id,
            "client_id": client_id,
            "status": result.get("status", "initiated"),
            "direction": "outbound",
            "duration": None,
            "recording_url": None,
            "initiated_by": user_id,
            "notes": None,
            "created_at": now,
            "updated_at": now,
        }
        await company_db[CALL_LOGS_COLLECTION].insert_one(log_doc)
        await TelephonyService._log_sync(company_db, company_id, cfg["provider"], "make_call", bool(result.get("success")), result)
        await emit_company_event(company_id, "telephony.call_updated", _serialize_log(log_doc))

        if result.get("success"):
            try:
                await TelephonyService.set_presence(company_db, company_id, user_id, "on_call", system=True)
            except Exception:
                pass

        # Best-effort "provider offline" signal — a connectivity-shaped
        # failure message (not a normal call outcome like busy/no-answer).
        if not result.get("success"):
            msg = str(result.get("message") or "").lower()
            if any(kw in msg for kw in ("cannot reach", "connect", "timeout", "unreachable", "refused")):
                await _notify_owner(
                    master_db, company_db, company_id, "notify_provider_offline",
                    provider=cfg["provider"], message=f"{cfg['provider']} appears unreachable: {result.get('message')}",
                )
        return {**result, "log_id": log_doc["_id"]}

    @staticmethod
    async def _call_control(
        capability: str, adapter_method_name: str,
        master_db, company_db, company_id: str, call_id: str,
        *, extra: Optional[dict] = None, target: Optional[str] = None,
    ) -> dict:
        """Shared implementation for hangup/hold/resume/mute/unmute/transfer.
        Checks the active provider's capability BEFORE calling the adapter —
        an unsupported operation is rejected with a clear 400, never
        attempted against a possibly-nonexistent endpoint."""
        cfg = await TelephonyService._require_config(master_db, company_id)
        provider = get_provider(cfg["provider"], cfg["credentials"])
        caps = provider.get_capabilities()
        if not caps.get(capability):
            raise HTTPException(
                status_code=400,
                detail=f"'{capability}' is not supported by {cfg['provider']}'s official API for this tenant's active provider.",
            )
        method = getattr(provider, adapter_method_name)
        if target is not None:
            result = await method(call_id, target, extra=extra)
        else:
            result = await method(call_id, extra=extra)

        # Reflect the call-control action in the stored log (where it maps
        # cleanly onto a field) and always broadcast so any mounted softphone/
        # popup reflects the new state immediately via the WebSocket channel.
        status_updates = {"hangup": "call_ended", "hold": "on_hold", "resume": "answered"}
        if result.get("success"):
            now = datetime.now(timezone.utc)
            update: dict = {"updated_at": now}
            if capability in status_updates:
                update["status"] = status_updates[capability]
            elif capability == "mute":
                update["muted"] = True
            elif capability == "unmute":
                update["muted"] = False
            await company_db[CALL_LOGS_COLLECTION].update_one(
                {"call_id": call_id, "company_id": company_id}, {"$set": update},
            )
            updated_doc = await company_db[CALL_LOGS_COLLECTION].find_one({"call_id": call_id, "company_id": company_id})
            await emit_company_event(
                company_id, "telephony.call_updated",
                _serialize_log(updated_doc) if updated_doc else {"call_id": call_id, "action": capability},
            )
            if capability == "hangup" and updated_doc and updated_doc.get("initiated_by"):
                # Wrap-up: brief system-derived presence window after a call
                # ends, until the agent sets their own status again (e.g. via
                # the disposition dialog) or picks up another call.
                try:
                    await TelephonyService.set_presence(company_db, company_id, updated_doc["initiated_by"], "wrap_up", system=True)
                except Exception:
                    pass
        return result

    @staticmethod
    async def hangup(master_db, company_db, company_id: str, call_id: str, *, extra: Optional[dict] = None) -> dict:
        return await TelephonyService._call_control("hangup", "hang_up", master_db, company_db, company_id, call_id, extra=extra)

    @staticmethod
    async def hold(master_db, company_db, company_id: str, call_id: str, *, extra: Optional[dict] = None) -> dict:
        return await TelephonyService._call_control("hold", "hold", master_db, company_db, company_id, call_id, extra=extra)

    @staticmethod
    async def resume(master_db, company_db, company_id: str, call_id: str, *, extra: Optional[dict] = None) -> dict:
        return await TelephonyService._call_control("resume", "resume", master_db, company_db, company_id, call_id, extra=extra)

    @staticmethod
    async def mute(master_db, company_db, company_id: str, call_id: str, *, extra: Optional[dict] = None) -> dict:
        return await TelephonyService._call_control("mute", "mute", master_db, company_db, company_id, call_id, extra=extra)

    @staticmethod
    async def unmute(master_db, company_db, company_id: str, call_id: str, *, extra: Optional[dict] = None) -> dict:
        return await TelephonyService._call_control("unmute", "unmute", master_db, company_db, company_id, call_id, extra=extra)

    @staticmethod
    async def transfer(master_db, company_db, company_id: str, call_id: str, target: str, *, extra: Optional[dict] = None) -> dict:
        return await TelephonyService._call_control("transfer", "transfer", master_db, company_db, company_id, call_id, extra=extra, target=target)

    @staticmethod
    async def list_call_logs(
        company_db, company_id: str, *, candidate_id: Optional[str] = None,
        employee_id: Optional[str] = None, client_id: Optional[str] = None, limit: int = 50,
    ) -> list[dict]:
        query: dict = {"company_id": company_id}
        if candidate_id:
            query["candidate_id"] = candidate_id
        if employee_id:
            query["employee_id"] = employee_id
        if client_id:
            query["client_id"] = client_id
        cursor = company_db[CALL_LOGS_COLLECTION].find(query).sort("created_at", -1).limit(limit)
        return [doc async for doc in cursor]

    @staticmethod
    async def get_recording(master_db, company_db, company_id: str, call_id: str) -> dict:
        cfg = await TelephonyService._require_config(master_db, company_id)
        provider = get_provider(cfg["provider"], cfg["credentials"])
        result = await provider.fetch_call_recording(call_id)
        if result.get("success") and (result.get("data") or {}).get("recording_url"):
            await company_db[CALL_LOGS_COLLECTION].update_one(
                {"call_id": call_id, "company_id": company_id},
                {"$set": {"recording_url": result["data"]["recording_url"], "updated_at": datetime.now(timezone.utc)}},
            )
            log_doc = await company_db[CALL_LOGS_COLLECTION].find_one({"call_id": call_id, "company_id": company_id})
            recipient = (log_doc or {}).get("initiated_by")
            try:
                from app.services.notification_service import NotificationService
                if recipient:
                    await NotificationService(company_db).notify_recording_ready(company_id=company_id, user_id=recipient, call_id=call_id)
                else:
                    await _notify_owner(master_db, company_db, company_id, "notify_recording_ready", call_id=call_id)
            except Exception:
                pass
        return result

    @staticmethod
    async def record_webhook(
        master_db, company_db, company_id: str, provider_slug: str,
        raw_body: bytes, payload: dict, headers: dict,
    ) -> dict:
        """Store the raw event for audit, then normalize + upsert into call logs.
        Always stores the raw event first — even if the tenant's config has since
        changed — so nothing is silently dropped (spec: "Store raw webhook events
        for auditing and troubleshooting")."""
        now = datetime.now(timezone.utc)
        await company_db[WEBHOOKS_COLLECTION].insert_one({
            "_id": str(uuid.uuid4()),
            "tenant_id": company_id,
            "company_id": company_id,
            "provider": provider_slug,
            "payload": payload,
            "headers": {k: v for k, v in headers.items() if k.lower() != "authorization"},
            "received_at": now,
        })

        cfg = await TelephonySettingsService.get_runtime_config(master_db, company_id)
        if not cfg or cfg["provider"] != provider_slug:
            return {"stored": True, "normalized": False, "reason": "provider not active for tenant"}

        # Generic shared-secret check — the fallback every provider adapter's
        # verify_webhook_signature() docstring promises for providers that don't
        # sign requests. Providers with real signature support (e.g. Twilio) are
        # checked below as well; both must pass when a secret is configured.
        configured_secret = cfg["credentials"].get("webhook_secret")
        if configured_secret:
            supplied = headers.get("x-webhook-secret") or headers.get("X-Webhook-Secret")
            if not supplied:
                from urllib.parse import parse_qs, urlparse
                query = parse_qs(urlparse(headers.get("_request_url", "")).query)
                supplied = (query.get("secret") or [None])[0]
            if supplied != configured_secret:
                await _notify_owner(
                    master_db, company_db, company_id, "notify_webhook_failure",
                    provider=provider_slug, reason="shared secret mismatch",
                )
                return {"stored": True, "normalized": False, "reason": "shared secret verification failed"}

        if not verify_signature(provider_slug, cfg["credentials"], raw_body, headers):
            await _notify_owner(
                master_db, company_db, company_id, "notify_webhook_failure",
                provider=provider_slug, reason="signature verification failed",
            )
            return {"stored": True, "normalized": False, "reason": "signature verification failed"}

        event = await normalize_webhook(provider_slug, cfg["credentials"], payload, headers)

        call_id = event.get("provider_call_id")
        if call_id:
            update: dict = {"status": event.get("status"), "updated_at": now}
            if event.get("duration") is not None:
                update["duration"] = event["duration"]
            if event.get("recording_url"):
                update["recording_url"] = event["recording_url"]
            if event.get("from"):
                update["caller"] = event["from"]
            if event.get("to"):
                update["receiver"] = event["to"]

            # Phase 4 SLA metrics need a fixed "first answered" timestamp,
            # separate from `updated_at` (which is overwritten by every
            # subsequent status change, e.g. hold/resume/hangup) — set once,
            # never overwritten on a later "answered" transition (e.g. after
            # a resume-from-hold).
            if (event.get("status") or "").lower() == "answered":
                existing = await company_db[CALL_LOGS_COLLECTION].find_one(
                    {"call_id": call_id, "company_id": company_id}, {"answered_at": 1},
                )
                if not existing or not existing.get("answered_at"):
                    update["answered_at"] = now

            await company_db[CALL_LOGS_COLLECTION].update_one(
                {"call_id": call_id, "company_id": company_id},
                {
                    "$set": update,
                    "$setOnInsert": {
                        "_id": str(uuid.uuid4()),
                        "tenant_id": company_id,
                        "company_id": company_id,
                        "provider": provider_slug,
                        "call_id": call_id,
                        "direction": event.get("direction"),
                        "candidate_id": None,
                        "employee_id": None,
                        "client_id": None,
                        "created_at": now,
                    },
                },
                upsert=True,
            )
            updated_doc = await company_db[CALL_LOGS_COLLECTION].find_one({"call_id": call_id, "company_id": company_id})
            if updated_doc:
                await emit_company_event(company_id, "telephony.call_updated", _serialize_log(updated_doc))

            if event.get("event_type") == "incoming_call":
                await _notify_owner(
                    master_db, company_db, company_id, "notify_incoming_call",
                    caller=event.get("from") or "Unknown", provider=provider_slug,
                )
            elif (event.get("status") or "").lower() in _MISSED_STATUSES and event.get("direction") != "outbound":
                await _notify_owner(
                    master_db, company_db, company_id, "notify_missed_call",
                    caller=event.get("from") or "Unknown",
                )
        return {"stored": True, "normalized": True, "event_type": event.get("event_type")}

    @staticmethod
    async def list_active_calls(company_db, company_id: str, *, minutes: int = 30) -> list[dict]:
        """Calls still 'live' (not ended/failed/missed) and touched recently —
        used by the softphone/global widget to recover in-progress call state
        on mount (e.g. after a page refresh) without a dedicated session store."""
        from datetime import timedelta
        cutoff = datetime.now(timezone.utc) - timedelta(minutes=minutes)
        cursor = company_db[CALL_LOGS_COLLECTION].find({
            "company_id": company_id,
            "status": {"$in": list(_ACTIVE_STATUSES)},
            "updated_at": {"$gte": cutoff},
        }).sort("updated_at", -1)
        return [doc async for doc in cursor]

    @staticmethod
    async def update_call_notes(company_db, company_id: str, call_id: str, notes: str) -> dict:
        """Writes only to telephony_call_logs.notes — a field already part of
        the Phase 1 schema. Never touches candidate/employee records."""
        result = await company_db[CALL_LOGS_COLLECTION].update_one(
            {"call_id": call_id, "company_id": company_id},
            {"$set": {"notes": notes, "updated_at": datetime.now(timezone.utc)}},
        )
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Call not found.")
        return {"success": True, "call_id": call_id, "notes": notes}

    @staticmethod
    async def get_dashboard_stats(company_db, company_id: str) -> dict:
        """Today's call stats, aggregated read-only from telephony_call_logs.
        No new collection, no write."""
        from datetime import timedelta
        now = datetime.now(timezone.utc)
        start_of_day = now.replace(hour=0, minute=0, second=0, microsecond=0)

        today_logs = [doc async for doc in company_db[CALL_LOGS_COLLECTION].find({
            "company_id": company_id, "created_at": {"$gte": start_of_day},
        })]

        total = len(today_logs)
        answered = sum(1 for d in today_logs if d.get("status") in ("answered", "call_ended") and d.get("duration"))
        missed = sum(1 for d in today_logs if d.get("status") in ("missed", "no-answer", "failed", "busy"))
        outgoing = sum(1 for d in today_logs if d.get("direction") == "outbound")
        incoming = sum(1 for d in today_logs if d.get("direction") == "inbound")
        durations = [d["duration"] for d in today_logs if isinstance(d.get("duration"), (int, float))]
        avg_duration = round(sum(durations) / len(durations), 1) if durations else 0

        active_cutoff = now - timedelta(minutes=30)
        active_count = await company_db[CALL_LOGS_COLLECTION].count_documents({
            "company_id": company_id, "status": {"$in": list(_ACTIVE_STATUSES)},
            "updated_at": {"$gte": active_cutoff},
        })

        return {
            "total_calls": total, "answered": answered, "missed": missed,
            "outgoing": outgoing, "incoming": incoming, "avg_duration": avg_duration,
            "active_calls": active_count,
            "success_rate": round((answered / total) * 100, 1) if total else 0,
        }

    @staticmethod
    async def lookup_caller(company_db, phone: str) -> Optional[dict]:
        """Read-only identity lookup for the incoming-call popup badge —
        never writes to candidates/hrm_employees, mirrors the existing
        read-only cross-collection lookup pattern in auth_service.py."""
        if not phone:
            return None
        candidate = await company_db["candidates"].find_one(
            {"mobile": phone, "is_deleted": {"$ne": True}}, {"full_name": 1},
        )
        if candidate:
            return {"type": "candidate", "id": str(candidate["_id"]), "name": candidate.get("full_name", "")}
        employee = await company_db["hrm_employees"].find_one(
            {"phone": phone, "is_deleted": {"$ne": True}}, {"full_name": 1},
        )
        if employee:
            return {"type": "employee", "id": str(employee["_id"]), "name": employee.get("full_name", "")}
        return None

    # ── Favorites ────────────────────────────────────────────────────────────

    @staticmethod
    async def list_favorites(company_db, company_id: str, user_id: str) -> list[dict]:
        cursor = company_db[FAVORITES_COLLECTION].find(
            {"company_id": company_id, "user_id": user_id},
        ).sort("created_at", -1)
        return [doc async for doc in cursor]

    @staticmethod
    async def add_favorite(
        company_db, company_id: str, user_id: str, phone: str, name: str,
        *, candidate_id: Optional[str] = None, employee_id: Optional[str] = None,
        group: Optional[str] = None,
    ) -> dict:
        doc = {
            "_id": str(uuid.uuid4()), "company_id": company_id, "user_id": user_id,
            "phone": phone, "name": name, "candidate_id": candidate_id, "employee_id": employee_id,
            "group": group,
            "created_at": datetime.now(timezone.utc),
        }
        await company_db[FAVORITES_COLLECTION].insert_one(doc)
        return doc

    @staticmethod
    async def frequently_called(company_db, company_id: str, user_id: str, *, limit: int = 10) -> list[dict]:
        """Computed on the fly from call-log history — not stored, per the
        Phase 3 plan (avoids a redundant, driftable counter collection)."""
        pipeline = [
            {"$match": {"company_id": company_id, "initiated_by": user_id, "receiver": {"$ne": None}}},
            {"$group": {"_id": "$receiver", "count": {"$sum": 1}, "last_called": {"$max": "$created_at"}}},
            {"$sort": {"count": -1}},
            {"$limit": limit},
        ]
        return [doc async for doc in company_db[CALL_LOGS_COLLECTION].aggregate(pipeline)]

    # ── Dispositions ─────────────────────────────────────────────────────────

    @staticmethod
    async def get_disposition_options(company_db, company_id: str) -> list[dict]:
        cursor = company_db[DISPOSITIONS_COLLECTION].find({"company_id": company_id}).sort("label", 1)
        options = [doc async for doc in cursor]
        if options:
            return options
        # Seed with the spec's default list on first use — no migration needed.
        now = datetime.now(timezone.utc)
        docs = [{"_id": str(uuid.uuid4()), "company_id": company_id, "label": label, "created_at": now} for label in _DEFAULT_DISPOSITIONS]
        await company_db[DISPOSITIONS_COLLECTION].insert_many(docs)
        return docs

    @staticmethod
    async def add_disposition_option(company_db, company_id: str, label: str) -> dict:
        doc = {"_id": str(uuid.uuid4()), "company_id": company_id, "label": label, "created_at": datetime.now(timezone.utc)}
        await company_db[DISPOSITIONS_COLLECTION].insert_one(doc)
        return doc

    @staticmethod
    async def remove_disposition_option(company_db, company_id: str, option_id: str) -> dict:
        result = await company_db[DISPOSITIONS_COLLECTION].delete_one({"_id": option_id, "company_id": company_id})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Disposition option not found.")
        return {"success": True}

    @staticmethod
    async def set_disposition(company_db, company_id: str, call_id: str, disposition: str) -> dict:
        """Stores the disposition on the call log ONLY — per spec, never
        touches candidate.status or any Recruitment/HRM document."""
        result = await company_db[CALL_LOGS_COLLECTION].update_one(
            {"call_id": call_id, "company_id": company_id},
            {"$set": {"disposition": disposition, "updated_at": datetime.now(timezone.utc)}},
        )
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Call not found.")
        return {"success": True, "call_id": call_id, "disposition": disposition}

    # ── Missed calls / callback tracking ───────────────────────────────────────

    @staticmethod
    async def list_missed_calls(company_db, company_id: str, *, callback_status: Optional[str] = None, limit: int = 100) -> list[dict]:
        query: dict = {"company_id": company_id, "direction": "inbound", "status": {"$in": list(_MISSED_STATUSES)}}
        if callback_status:
            query["callback_status"] = callback_status
        cursor = company_db[CALL_LOGS_COLLECTION].find(query).sort("created_at", -1).limit(limit)
        return [doc async for doc in cursor]

    @staticmethod
    async def set_callback_status(company_db, company_id: str, call_id: str, status: str) -> dict:
        result = await company_db[CALL_LOGS_COLLECTION].update_one(
            {"call_id": call_id, "company_id": company_id},
            {"$set": {"callback_status": status, "updated_at": datetime.now(timezone.utc)}},
        )
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Call not found.")
        return {"success": True, "call_id": call_id, "callback_status": status}

    # ── Recordings ───────────────────────────────────────────────────────────

    @staticmethod
    async def list_recordings(company_db, company_id: str, *, search: Optional[str] = None, limit: int = 100) -> list[dict]:
        query: dict = {"company_id": company_id, "recording_url": {"$ne": None}}
        if search:
            query["$or"] = [{"caller": {"$regex": search, "$options": "i"}}, {"receiver": {"$regex": search, "$options": "i"}}]
        cursor = company_db[CALL_LOGS_COLLECTION].find(query).sort("created_at", -1).limit(limit)
        return [doc async for doc in cursor]

    # ── Supervisor / analytics / agent performance ─────────────────────────────

    @staticmethod
    async def get_supervisor_summary(company_db, company_id: str) -> dict:
        stats = await TelephonyService.get_dashboard_stats(company_db, company_id)
        live = await TelephonyService.list_active_calls(company_db, company_id)
        active_agents = len({d["initiated_by"] for d in live if d.get("initiated_by")})
        calls_waiting = sum(1 for d in live if d.get("status") in ("ringing", "incoming_call"))

        pipeline = [
            {"$match": {"company_id": company_id}},
            {"$group": {"_id": "$provider", "count": {"$sum": 1}}},
        ]
        by_provider = {doc["_id"]: doc["count"] async for doc in company_db[CALL_LOGS_COLLECTION].aggregate(pipeline)}

        return {
            **stats,
            "live_calls": len(live),
            "active_agents": active_agents,
            "calls_waiting": calls_waiting,
            "calls_by_provider": by_provider,
        }

    @staticmethod
    async def get_analytics(company_db, company_id: str, *, period: str = "daily") -> dict:
        """period: hourly | daily | weekly | monthly — read-only aggregation
        over telephony_call_logs. `hourly` looks at the last 24h; the rest
        look at the last 30/90/365 days respectively, kept small on purpose
        (this is a productivity view, not a full BI export)."""
        from datetime import timedelta
        now = datetime.now(timezone.utc)
        window = {"hourly": timedelta(hours=24), "daily": timedelta(days=30), "weekly": timedelta(days=90), "monthly": timedelta(days=365)}.get(period, timedelta(days=30))
        date_format = {"hourly": "%Y-%m-%dT%H:00", "daily": "%Y-%m-%d", "weekly": "%Y-W%V", "monthly": "%Y-%m"}.get(period, "%Y-%m-%d")

        pipeline = [
            {"$match": {"company_id": company_id, "created_at": {"$gte": now - window}}},
            {"$group": {
                "_id": {"$dateToString": {"format": date_format, "date": "$created_at"}},
                "total": {"$sum": 1},
                "answered": {"$sum": {"$cond": [{"$eq": ["$status", "answered"]}, 1, 0]}},
                "missed": {"$sum": {"$cond": [{"$in": ["$status", list(_MISSED_STATUSES)]}, 1, 0]}},
                "avg_duration": {"$avg": "$duration"},
            }},
            {"$sort": {"_id": 1}},
        ]
        series = [doc async for doc in company_db[CALL_LOGS_COLLECTION].aggregate(pipeline)]

        provider_pipeline = [
            {"$match": {"company_id": company_id, "created_at": {"$gte": now - window}}},
            {"$group": {"_id": "$provider", "total": {"$sum": 1}, "answered": {"$sum": {"$cond": [{"$eq": ["$status", "answered"]}, 1, 0]}}}},
        ]
        provider_comparison = [doc async for doc in company_db[CALL_LOGS_COLLECTION].aggregate(provider_pipeline)]

        return {"period": period, "series": series, "provider_comparison": provider_comparison}

    @staticmethod
    async def get_agent_performance(company_db, company_id: str) -> list[dict]:
        """Grouped by initiated_by (outbound calls only) — there is no
        call-routing/agent-assignment concept for inbound calls in this
        system, so inbound calls are intentionally excluded rather than
        mis-attributed to a random agent."""
        pipeline = [
            {"$match": {"company_id": company_id, "direction": "outbound", "initiated_by": {"$ne": None}}},
            {"$group": {
                "_id": "$initiated_by",
                "total_calls": {"$sum": 1},
                "answered": {"$sum": {"$cond": [{"$eq": ["$status", "answered"]}, 1, 0]}},
                "missed": {"$sum": {"$cond": [{"$in": ["$status", list(_MISSED_STATUSES)]}, 1, 0]}},
                "total_talk_time": {"$sum": {"$ifNull": ["$duration", 0]}},
                "avg_duration": {"$avg": "$duration"},
                "last_active": {"$max": "$created_at"},
            }},
            {"$sort": {"total_calls": -1}},
        ]
        rows = [doc async for doc in company_db[CALL_LOGS_COLLECTION].aggregate(pipeline)]
        for r in rows:
            r["success_rate"] = round((r["answered"] / r["total_calls"]) * 100, 1) if r["total_calls"] else 0
            r["user_id"] = r.pop("_id")
        return rows

    # ── Provider health (Super Admin, on-demand — no background polling) ──────

    @staticmethod
    async def get_provider_health(master_db, company_db, company_id: str) -> dict:
        cfg = await TelephonySettingsService.get_runtime_config(master_db, company_id)
        if not cfg:
            return {"enabled": False, "provider": None, "connection": None}

        provider = get_provider(cfg["provider"], cfg["credentials"])
        caps = provider.get_capabilities()
        connection = await provider.validate_connection()

        from datetime import timedelta
        cutoff = datetime.now(timezone.utc) - timedelta(hours=24)

        last_sync_doc = await company_db[SYNC_LOGS_COLLECTION].find_one(
            {"company_id": company_id}, sort=[("created_at", -1)],
        )
        error_count_24h = await company_db[SYNC_LOGS_COLLECTION].count_documents({
            "company_id": company_id, "success": False, "created_at": {"$gte": cutoff},
        })
        last_webhook_doc = await company_db[WEBHOOKS_COLLECTION].find_one(
            {"company_id": company_id}, sort=[("received_at", -1)],
        )
        webhook_count_24h = await company_db[WEBHOOKS_COLLECTION].count_documents({
            "company_id": company_id, "received_at": {"$gte": cutoff},
        })

        return {
            "enabled": True,
            "provider": cfg["provider"],
            "connection": connection,
            "last_sync_at": last_sync_doc.get("created_at") if last_sync_doc else None,
            "error_count_24h": error_count_24h,
            "last_webhook_at": last_webhook_doc.get("received_at") if last_webhook_doc else None,
            "webhook_count_24h": webhook_count_24h,
            # Only meaningful for token-based providers (Tata Smartflo, Ozonetel) —
            # we don't track a live token/expiry anywhere, so this is honestly
            # reported as unavailable rather than fabricated.
            "token_expiry": "not tracked" if caps.get("token_refresh") else "not applicable",
            "rate_limit_warnings": "not available — no live rate-limit telemetry from any provider adapter",
        }

    # ── Live Agent Presence (Phase 4) ───────────────────────────────────────
    # Reuses app.services.presence_service.get_online_user_ids as the single
    # source of truth for "is this session actually online right now" —
    # this module only adds the richer telephony-specific sub-states
    # (available/busy/on_call/wrap_up/break) on top, and always defers to
    # the real online check so a user who's truly gone (closed laptop,
    # expired session) can never stay stuck showing "Available".

    @staticmethod
    async def set_presence(company_db, company_id: str, user_id: str, status: str, *, system: bool = False) -> dict:
        """`system=True` marks an auto-transition (on_call/wrap_up/offline)
        driven by call state rather than a user clicking a status button —
        callers gate user-initiated changes to the non-system-derived subset
        (available/busy/break) at the API layer."""
        if status not in _PRESENCE_STATUSES:
            raise HTTPException(status_code=400, detail=f"Unknown presence status '{status}'.")
        if not system and status in _SYSTEM_DERIVED_PRESENCE:
            raise HTTPException(status_code=400, detail=f"'{status}' is set automatically by call activity, not chosen directly.")
        now = datetime.now(timezone.utc)
        await company_db[PRESENCE_COLLECTION].update_one(
            {"_id": user_id},
            {"$set": {"_id": user_id, "company_id": company_id, "user_id": user_id, "status": status, "updated_at": now}},
            upsert=True,
        )
        await emit_company_event(company_id, "telephony.presence_updated", {"user_id": user_id, "status": status, "updated_at": now.isoformat()})
        return {"success": True, "user_id": user_id, "status": status}

    @staticmethod
    async def get_team_presence(company_db, company_id: str) -> list[dict]:
        from app.services.presence_service import get_online_user_ids
        online_ids = await get_online_user_ids(company_id)

        docs = [doc async for doc in company_db[PRESENCE_COLLECTION].find({"company_id": company_id})]
        by_user = {d["user_id"]: d for d in docs}

        # Every truly-online user appears even if they've never set a
        # telephony status yet (defaults to "available"); every stored
        # status for a user who ISN'T truly online is forced to "offline"
        # — this is the cross-check the plan calls for.
        result = []
        seen = set()
        for uid in online_ids:
            stored = by_user.get(uid)
            result.append({"user_id": uid, "status": (stored or {}).get("status") or "available", "updated_at": (stored or {}).get("updated_at")})
            seen.add(uid)
        for uid, d in by_user.items():
            if uid in seen:
                continue
            result.append({"user_id": uid, "status": "offline", "updated_at": d.get("updated_at")})
        return result

    @staticmethod
    async def get_own_presence(company_db, company_id: str, user_id: str) -> dict:
        doc = await company_db[PRESENCE_COLLECTION].find_one({"_id": user_id, "company_id": company_id})
        return {"user_id": user_id, "status": (doc or {}).get("status") or "available", "updated_at": (doc or {}).get("updated_at")}

    # ── SLA metrics (Phase 4) ────────────────────────────────────────────────

    @staticmethod
    async def get_sla_metrics(company_db, company_id: str) -> dict:
        """Read-only aggregation over telephony_call_logs — response/pickup
        time uses the `answered_at` field (set once, see record_webhook),
        so calls that predate this phase simply won't contribute a pickup
        time (no fabricated numbers for old data)."""
        from datetime import timedelta
        now = datetime.now(timezone.utc)
        start_of_day = now.replace(hour=0, minute=0, second=0, microsecond=0)
        window_query = {"company_id": company_id, "created_at": {"$gte": now - timedelta(days=30)}}

        logs = [doc async for doc in company_db[CALL_LOGS_COLLECTION].find(window_query)]
        total = len(logs)
        inbound = [d for d in logs if d.get("direction") == "inbound"]
        missed_inbound = [d for d in inbound if d.get("status") in _MISSED_STATUSES]

        pickup_times = []
        for d in logs:
            if d.get("answered_at") and d.get("created_at"):
                delta = (d["answered_at"] - d["created_at"]).total_seconds()
                if delta >= 0:
                    pickup_times.append(delta)

        callback_slas = []
        for d in logs:
            if d.get("callback_status") == "completed" and d.get("updated_at") and d.get("created_at"):
                delta = (d["updated_at"] - d["created_at"]).total_seconds()
                if delta >= 0:
                    callback_slas.append(delta)

        resolution_times = []
        for d in logs:
            if d.get("status") == "call_ended" and d.get("disposition") and d.get("updated_at") and d.get("created_at"):
                delta = (d["updated_at"] - d["created_at"]).total_seconds()
                if delta >= 0:
                    resolution_times.append(delta)

        def _avg(vals):
            return round(sum(vals) / len(vals), 1) if vals else None

        return {
            "window_days": 30,
            "total_calls": total,
            "avg_pickup_time_seconds": _avg(pickup_times),
            "pickup_sample_size": len(pickup_times),
            "missed_rate_pct": round((len(missed_inbound) / len(inbound)) * 100, 1) if inbound else 0,
            "abandon_rate_pct": round((len(missed_inbound) / len(inbound)) * 100, 1) if inbound else 0,
            "avg_callback_sla_seconds": _avg(callback_slas),
            "callback_sample_size": len(callback_slas),
            "avg_resolution_time_seconds": _avg(resolution_times),
            "resolution_sample_size": len(resolution_times),
        }

    # ── Department analytics (Phase 4) — read-only join, no new collection ───

    @staticmethod
    async def get_department_analytics(company_db, company_id: str) -> list[dict]:
        pipeline = [
            {"$match": {"company_id": company_id, "initiated_by": {"$ne": None}}},
            {"$group": {
                "_id": "$initiated_by",
                "total": {"$sum": 1},
                "answered": {"$sum": {"$cond": [{"$eq": ["$status", "answered"]}, 1, 0]}},
                "missed": {"$sum": {"$cond": [{"$in": ["$status", list(_MISSED_STATUSES)]}, 1, 0]}},
                "avg_duration": {"$avg": "$duration"},
            }},
            {"$lookup": {"from": "users", "localField": "_id", "foreignField": "_id", "as": "user"}},
            {"$unwind": {"path": "$user", "preserveNullAndEmptyArrays": True}},
            {"$lookup": {"from": "departments", "localField": "user.department_id", "foreignField": "_id", "as": "dept"}},
            {"$unwind": {"path": "$dept", "preserveNullAndEmptyArrays": True}},
            {"$group": {
                "_id": {"$ifNull": ["$dept.name", "Unassigned"]},
                "total": {"$sum": "$total"},
                "answered": {"$sum": "$answered"},
                "missed": {"$sum": "$missed"},
                "avg_duration": {"$avg": "$avg_duration"},
            }},
            {"$sort": {"total": -1}},
        ]
        rows = [doc async for doc in company_db[CALL_LOGS_COLLECTION].aggregate(pipeline)]
        for r in rows:
            r["department"] = r.pop("_id")
            r["success_rate"] = round((r["answered"] / r["total"]) * 100, 1) if r["total"] else 0
        return rows

    # ── Callback reassignment (Phase 4 "Callback Queue") ───────────────────────

    @staticmethod
    async def reassign_call(company_db, company_id: str, call_id: str, assigned_to: str) -> dict:
        result = await company_db[CALL_LOGS_COLLECTION].update_one(
            {"call_id": call_id, "company_id": company_id},
            {"$set": {"assigned_to": assigned_to, "updated_at": datetime.now(timezone.utc)}},
        )
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Call not found.")
        return {"success": True, "call_id": call_id, "assigned_to": assigned_to}

    # ── Recording review metadata (Phase 4) — never touches the provider's
    # actual recording, only CRM-side additive fields on the call log ───────

    @staticmethod
    async def set_recording_review(
        company_db, company_id: str, call_id: str, *,
        favorited: Optional[bool] = None, bookmarked: Optional[bool] = None,
        tags: Optional[list[str]] = None, comment: Optional[str] = None, user_id: Optional[str] = None,
    ) -> dict:
        update: dict = {"updated_at": datetime.now(timezone.utc)}
        if favorited is not None:
            update["is_favorited"] = favorited
        if bookmarked is not None:
            update["is_bookmarked"] = bookmarked
        if tags is not None:
            update["tags"] = tags
        ops: dict = {"$set": update}
        if comment:
            ops["$push"] = {"review_comments": {"text": comment, "user_id": user_id, "created_at": datetime.now(timezone.utc)}}
        result = await company_db[CALL_LOGS_COLLECTION].update_one({"call_id": call_id, "company_id": company_id}, ops)
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Call not found.")
        return {"success": True, "call_id": call_id}

    # ── Advanced search (Phase 4) — telephony collections only ─────────────────

    @staticmethod
    async def search_telephony(company_db, company_id: str, query: str, *, limit: int = 30) -> dict:
        if not query or not query.strip():
            return {"calls": [], "dispositions": []}
        rx = {"$regex": query, "$options": "i"}
        calls_cursor = company_db[CALL_LOGS_COLLECTION].find({
            "company_id": company_id,
            "$or": [{"caller": rx}, {"receiver": rx}, {"notes": rx}, {"tags": rx}, {"disposition": rx}],
        }).sort("created_at", -1).limit(limit)
        calls = [doc async for doc in calls_cursor]

        dispositions = [
            doc async for doc in company_db[DISPOSITIONS_COLLECTION].find({"company_id": company_id, "label": rx})
        ]
        return {"calls": calls, "dispositions": dispositions}

    # ── Wallboard / capability center (Phase 4 — compose existing data) ────────

    @staticmethod
    async def get_wallboard_snapshot(master_db, company_db, company_id: str) -> dict:
        summary = await TelephonyService.get_supervisor_summary(company_db, company_id)
        presence = await TelephonyService.get_team_presence(company_db, company_id)
        agents = await TelephonyService.get_agent_performance(company_db, company_id)
        top_performers = sorted(agents, key=lambda a: a.get("total_calls", 0), reverse=True)[:5]
        return {
            **summary,
            "agents_online": len(presence),
            "agents_available": sum(1 for p in presence if p["status"] == "available"),
            "agents_busy": sum(1 for p in presence if p["status"] in ("busy", "on_call")),
            "top_performers": top_performers,
        }

    @staticmethod
    async def get_capability_center(master_db, company_db, company_id: str) -> dict:
        caps = await TelephonyService.get_capabilities(master_db, company_id)
        health = await TelephonyService.get_provider_health(master_db, company_db, company_id)
        return {"capabilities": caps, "health": health}

    # ── Queue / live monitoring (Phase 4) — capability-gated pass-through ──────
    # Same pattern as _call_control: check capability BEFORE calling the
    # adapter, so an unsupported operation is rejected cleanly (400) rather
    # than attempted against a nonexistent endpoint. Currently no provider
    # declares these capabilities True (see base_provider.py), so these
    # routes are unreachable via the UI today — they exist for a future
    # provider adapter to light up without any other code changing.

    @staticmethod
    async def _require_capability(master_db, company_id: str, capability: str):
        cfg = await TelephonyService._require_config(master_db, company_id)
        provider = get_provider(cfg["provider"], cfg["credentials"])
        if not provider.get_capabilities().get(capability):
            raise HTTPException(status_code=400, detail=f"'{capability}' is not supported by {cfg['provider']}'s official API.")
        return provider

    @staticmethod
    async def get_queue_list(master_db, company_id: str) -> dict:
        provider = await TelephonyService._require_capability(master_db, company_id, "queue_management")
        return await provider.get_queue_list()

    @staticmethod
    async def get_queue_members(master_db, company_id: str, queue_id: str) -> dict:
        provider = await TelephonyService._require_capability(master_db, company_id, "queue_management")
        return await provider.get_queue_members(queue_id)

    @staticmethod
    async def listen_to_call(master_db, company_id: str, call_id: str) -> dict:
        provider = await TelephonyService._require_capability(master_db, company_id, "call_listen")
        return await provider.listen(call_id)

    @staticmethod
    async def whisper_to_call(master_db, company_id: str, call_id: str) -> dict:
        provider = await TelephonyService._require_capability(master_db, company_id, "call_whisper")
        return await provider.whisper(call_id)

    @staticmethod
    async def barge_into_call(master_db, company_id: str, call_id: str) -> dict:
        provider = await TelephonyService._require_capability(master_db, company_id, "call_barge")
        return await provider.barge(call_id)

    @staticmethod
    async def remove_favorite(company_db, company_id: str, user_id: str, favorite_id: str) -> dict:
        result = await company_db[FAVORITES_COLLECTION].delete_one(
            {"_id": favorite_id, "company_id": company_id, "user_id": user_id},
        )
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Favorite not found.")
        return {"success": True}

    @staticmethod
    async def _log_sync(company_db, company_id: str, provider: str, action: str, success: bool, raw: dict) -> None:
        await company_db[SYNC_LOGS_COLLECTION].insert_one({
            "_id": str(uuid.uuid4()),
            "tenant_id": company_id,
            "company_id": company_id,
            "provider": provider,
            "action": action,
            "success": success,
            "raw": raw,
            "created_at": datetime.now(timezone.utc),
        })
