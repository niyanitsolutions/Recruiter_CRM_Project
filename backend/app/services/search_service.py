"""
Global Search Service (Task 6)

Searches across every major module the caller has permission to view, using
the SAME visibility scoping each module's own list endpoint uses, so search
results never leak data a user couldn't otherwise see.

Ranking (per spec):
  0 — exact start-of-primary-field match
  1 — start-of-secondary-field match, or primary field contains the query
  2 — related match (only a secondary field contains the query)
"""
import re
from typing import Any, Dict, List, Optional

from motor.motor_asyncio import AsyncIOMotorDatabase

MIN_QUERY_LEN = 3
PER_ENTITY_LIMIT = 8
TOTAL_LIMIT = 30


def _rank(query: str, primary: str, secondary: List[str]) -> int:
    q = query.lower()
    p = (primary or "").lower()
    if p.startswith(q):
        return 0
    for s in secondary:
        if (s or "").lower().startswith(q):
            return 1
    if q in p:
        return 1
    return 2


async def _visible_ids_filter(db: AsyncIOMotorDatabase, current_user: dict, module_name: str) -> Optional[Dict[str, Any]]:
    """Returns a {"created_by": {"$in": [...]}} filter fragment, or {} for unrestricted."""
    if current_user.get("role") == "partner":
        return None  # caller decides partner scoping per-entity
    from app.services.user_service import UserService
    user_svc = UserService(db)
    visible_ids = await user_svc.get_visible_user_ids(current_user, module_name=module_name)
    if visible_ids is not None:
        return {"created_by": {"$in": visible_ids}}
    return {}


async def global_search(db: AsyncIOMotorDatabase, current_user: dict, query: str) -> List[Dict[str, Any]]:
    q = (query or "").strip()
    if len(q) < MIN_QUERY_LEN:
        return []

    perms = set(current_user.get("permissions") or [])
    is_admin = bool(current_user.get("is_owner")) or current_user.get("role") == "admin"
    pattern = re.compile(re.escape(q), re.IGNORECASE)

    def has(*perm_codes):
        return is_admin or any(p in perms for p in perm_codes)

    results: List[Dict[str, Any]] = []

    async def add(entity_type: str, label_path: str, collection, mongo_query: dict,
                   primary_field: str, secondary_fields: List[str], to_item):
        try:
            cursor = collection.find(mongo_query).limit(PER_ENTITY_LIMIT * 3)
            docs = await cursor.to_list(length=PER_ENTITY_LIMIT * 3)
        except Exception:
            return
        scored = []
        for d in docs:
            primary = d.get(primary_field) or ""
            secondary = [d.get(f) or "" for f in secondary_fields]
            tier = _rank(q, primary, secondary)
            scored.append((tier, primary.lower(), d))
        scored.sort(key=lambda x: (x[0], x[1]))
        for tier, _, d in scored[:PER_ENTITY_LIMIT]:
            item = to_item(d)
            item["type"] = entity_type
            item["_tier"] = tier
            results.append(item)

    # ── Candidates ──────────────────────────────────────────────────────────
    if has("candidates:view"):
        base = {"is_deleted": False}
        if current_user.get("role") == "partner":
            base["partner_id"] = current_user.get("id")
        else:
            scope = await _visible_ids_filter(db, current_user, "candidates")
            if scope:
                base.update(scope)
        base["$or"] = [
            {"full_name": pattern}, {"email": pattern}, {"mobile": pattern},
        ]
        await add("candidate", "full_name", db.candidates, base, "full_name", ["email", "mobile"],
                   lambda d: {"id": d["_id"], "label": d.get("full_name"), "sub": d.get("email") or d.get("mobile") or "",
                              "path": f"/candidates/{d['_id']}"})

    # ── Jobs ────────────────────────────────────────────────────────────────
    if has("jobs:view"):
        base = {"is_deleted": False}
        if current_user.get("role") == "partner":
            base["visible_to_partners"] = True
        else:
            scope = await _visible_ids_filter(db, current_user, "jobs")
            if scope:
                base.update(scope)
        base["$or"] = [{"title": pattern}, {"client_name": pattern}, {"job_code": pattern}]
        await add("job", "title", db.jobs, base, "title", ["client_name", "job_code"],
                   lambda d: {"id": d["_id"], "label": d.get("title"), "sub": d.get("client_name") or "",
                              "path": f"/jobs/{d['_id']}"})

    # ── Applications ────────────────────────────────────────────────────────
    if has("candidates:view"):
        base = {"is_deleted": False}
        if current_user.get("role") == "partner":
            base["partner_id"] = current_user.get("id")
        else:
            scope = await _visible_ids_filter(db, current_user, "applications")
            if scope:
                base.update(scope)
        base["$or"] = [{"candidate_name": pattern}, {"job_title": pattern}, {"client_name": pattern}]
        await add("application", "candidate_name", db.applications, base, "candidate_name", ["job_title", "client_name"],
                   lambda d: {"id": d["_id"], "label": d.get("candidate_name"),
                              "sub": f"{d.get('job_title','')} — {d.get('client_name','')}".strip(' —'),
                              "path": f"/applications/{d['_id']}"})

    # ── Interviews ──────────────────────────────────────────────────────────
    if has("interviews:view"):
        base = {"is_deleted": False}
        if current_user.get("role") != "partner":
            scope = await _visible_ids_filter(db, current_user, "interviews")
            if scope:
                base.update(scope)
        base["$or"] = [{"candidate_name": pattern}, {"job_title": pattern}, {"client_name": pattern}]
        await add("interview", "candidate_name", db.interviews, base, "candidate_name", ["job_title", "client_name"],
                   lambda d: {"id": d["_id"], "label": d.get("candidate_name"),
                              "sub": d.get("job_title") or "", "path": f"/interviews/{d['_id']}"})

    # ── Clients ─────────────────────────────────────────────────────────────
    if has("clients:view"):
        base = {"is_deleted": False}
        scope = await _visible_ids_filter(db, current_user, "clients")
        if scope:
            base.update(scope)
        base["$or"] = [{"name": pattern}, {"code": pattern}, {"email": pattern}]
        await add("client", "name", db.clients, base, "name", ["code", "email"],
                   lambda d: {"id": d["_id"], "label": d.get("name"), "sub": d.get("code") or "",
                              "path": f"/clients/{d['_id']}"})

    # ── Employees (HRM) ────────────────────────────────────────────────────
    if has("hrm:employees:view"):
        base = {"is_deleted": False}
        base["$or"] = [{"full_name": pattern}, {"employee_code": pattern}, {"email": pattern}]
        await add("employee", "full_name", db.employees, base, "full_name", ["employee_code", "email"],
                   lambda d: {"id": d["_id"], "label": d.get("full_name"), "sub": d.get("employee_code") or "",
                              "path": f"/hrm/employees/{d['_id']}"})

    # ── Users ───────────────────────────────────────────────────────────────
    if has("users:view"):
        base = {"is_deleted": False}
        base["$or"] = [{"full_name": pattern}, {"username": pattern}, {"email": pattern}]
        await add("user", "full_name", db.users, base, "full_name", ["username", "email"],
                   lambda d: {"id": d["_id"], "label": d.get("full_name"), "sub": d.get("email") or "",
                              "path": f"/users/{d['_id']}"})

    # ── Tasks (always self-scoped: creator or assignee) ───────────────────
    if has("tasks:view"):
        user_id = current_user.get("id")
        base = {"is_deleted": False, "$and": [
            {"$or": [{"assigned_to": user_id}, {"created_by": user_id}]},
            {"$or": [{"title": pattern}, {"description": pattern}]},
        ]}
        await add("task", "title", db.tasks, base, "title", [],
                   lambda d: {"id": d["_id"], "label": d.get("title"), "sub": d.get("status") or "",
                              "path": "/tasks"})

    # ── Targets ─────────────────────────────────────────────────────────────
    if has("targets:view"):
        base = {"is_deleted": False, "$or": [{"name": pattern}]}
        await add("target", "name", db.targets, base, "name", [],
                   lambda d: {"id": d["_id"], "label": d.get("name"), "sub": d.get("target_type") or "",
                              "path": "/targets"})

    # ── Interview Pipelines ─────────────────────────────────────────────────
    if has("interview_settings:view", "jobs:view"):
        base = {"is_deleted": False, "$or": [{"name": pattern}, {"job_title": pattern}, {"client_name": pattern}]}
        await add("pipeline", "name", db.pipelines, base, "name", ["job_title", "client_name"],
                   lambda d: {"id": d["_id"], "label": d.get("name") or d.get("job_title"),
                              "sub": d.get("client_name") or "", "path": "/interview-settings"})

    # ── Documents (generated HR documents) ─────────────────────────────────
    if has("docs:view", "hrm:employees:view"):
        base = {"is_deleted": False, "$or": [
            {"document_name": pattern}, {"template_name": pattern}, {"employee_name": pattern},
        ]}
        await add("document", "document_name", db.doc_generated, base, "document_name", ["template_name", "employee_name"],
                   lambda d: {"id": d["_id"], "label": d.get("document_name") or d.get("template_name"),
                              "sub": d.get("employee_name") or "", "path": "/hrm/documents"})

    # ── Final cross-entity ranking: tier first, then alpha by label ────────
    results.sort(key=lambda r: (r["_tier"], (r.get("label") or "").lower()))
    for r in results:
        r.pop("_tier", None)
    return results[:TOTAL_LIMIT]
