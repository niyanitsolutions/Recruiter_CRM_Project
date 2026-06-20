"""
CRM Real-Time WebSocket Endpoint

Provides tenant-isolated real-time updates for business events:
  - Task create / update / delete
  - HRM leave, WFH, shift, attendance
  - Recruitment candidates, jobs, interviews
  - CRM clients, partners
  - Dashboard KPI refresh triggers
  - Notification badge updates

Connection flow:
  1. Client connects to /api/v1/crm/ws?token=<access_token>
  2. Server verifies the JWT (same key as REST endpoints).
  3. Server joins the user to their company room.
  4. Server sends pings every 30 s to keep the connection alive.
  5. On disconnect the user leaves the room automatically.

Authentication: access_token via query param (same as the session WS).
The token is verified on connect; if invalid the connection is closed immediately.
"""

import asyncio
import json
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query

from app.core.ws_manager import ws_manager
from app.core.security import verify_access_token

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/crm", tags=["CRM WebSocket"])

_PING_INTERVAL = 30  # seconds between server-sent pings


@router.websocket("/ws")
async def crm_websocket(
    websocket: WebSocket,
    token: str = Query(..., description="Access token for authentication"),
):
    """
    CRM real-time WebSocket.
    Tenant-isolated: each company has its own broadcast room.
    """
    # ── Auth ─────────────────────────────────────────────────────────────────
    payload = None
    try:
        payload = verify_access_token(token)
    except Exception:
        pass

    if not payload:
        await websocket.close(code=4001, reason="Unauthorized")
        return

    user_id    = payload.get("sub", "")
    company_id = payload.get("company_id", "")
    full_name  = payload.get("full_name", "")
    role       = payload.get("role", "")

    if not user_id or not company_id:
        await websocket.close(code=4001, reason="Missing user or company context")
        return

    # ── Connect & join company room ───────────────────────────────────────────
    await ws_manager.connect(user_id, websocket)
    ws_manager.join_room(user_id, company_id)
    logger.info(
        "CRM WS connected | user=%s company=%s role=%s name=%s",
        user_id, company_id, role, full_name,
    )

    try:
        # Send a welcome handshake so the client knows the connection is live
        await websocket.send_json({
            "type": "connected",
            "data": {
                "user_id": user_id,
                "company_id": company_id,
                "server_time": datetime.now(timezone.utc).isoformat(),
            },
        })

        # Main loop: keepalive pings + listen for client-sent messages
        while True:
            try:
                # Wait for a client message with a timeout equal to the ping interval.
                # If no message arrives within the interval, send a ping and loop.
                data = await asyncio.wait_for(
                    websocket.receive_text(),
                    timeout=_PING_INTERVAL,
                )
                # Handle optional client-sent messages (e.g. pong, ack)
                try:
                    msg = json.loads(data)
                    if msg.get("type") == "ping":
                        await websocket.send_json({
                            "type": "pong",
                            "ts": datetime.now(timezone.utc).isoformat(),
                        })
                except Exception:
                    pass

            except asyncio.TimeoutError:
                # Send keepalive ping
                try:
                    await websocket.send_json({
                        "type": "ping",
                        "ts": datetime.now(timezone.utc).isoformat(),
                    })
                except Exception:
                    break

    except WebSocketDisconnect:
        pass
    except Exception as exc:
        logger.debug("CRM WS error | user=%s error=%s", user_id, exc)
    finally:
        ws_manager.leave_room(user_id, company_id)
        ws_manager.disconnect(user_id, websocket)
        logger.info("CRM WS disconnected | user=%s company=%s", user_id, company_id)
