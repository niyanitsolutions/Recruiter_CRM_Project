"""
CRM Real-Time Event Emitter

Fire-and-forget helper that broadcasts business events to all users in a
company room via the ws_manager singleton.

Tenant isolation is enforced at the room level — events are ONLY delivered
to users who share the same company_id.  Company A events never reach Company B.

Usage (from a service or API handler):
    from app.core.crm_events import emit_company_event
    await emit_company_event(company_id, "task.updated", {"id": task_id, ...})
"""

import asyncio
import logging
from typing import Any, Dict

logger = logging.getLogger(__name__)


async def emit_company_event(
    company_id: str,
    event_type: str,
    data: Dict[str, Any],
) -> None:
    """
    Broadcast a real-time event to all WebSocket connections in a company room.

    Never raises — failures are logged and swallowed so they never block
    the calling service operation.

    Args:
        company_id: Tenant identifier — scopes delivery to that company only.
        event_type: Dot-notation event name, e.g. "task.updated", "leave.approved".
        data:       Event payload (must be JSON-serialisable).
    """
    if not company_id:
        return
    try:
        from app.core.ws_manager import ws_manager
        message = {"type": event_type, "data": data, "company_id": company_id}
        delivered = await ws_manager.broadcast_to_company(company_id, message)
        if delivered:
            logger.debug(
                "CRM event emitted | company=%s event=%s recipients=%d",
                company_id, event_type, delivered,
            )
    except Exception as exc:
        logger.warning(
            "CRM event emit failed | company=%s event=%s error=%s",
            company_id, event_type, exc,
        )
