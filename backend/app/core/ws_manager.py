"""
WebSocket Connection Manager

In-memory registry that maps a user_id to their active WebSocket connections.
Multiple connections per user are supported (same user, multiple tabs/devices).

Thread-safety note: FastAPI runs in a single async event loop, so a plain dict
is safe here.  For multi-worker deployments, replace with Redis pub/sub.
"""

import asyncio
import logging
from typing import Dict, List, Optional
from fastapi import WebSocket

logger = logging.getLogger(__name__)


class WSConnectionManager:
    def __init__(self) -> None:
        # user_id → list of active WebSocket connections
        self._connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, user_id: str, ws: WebSocket) -> None:
        """Accept a WebSocket handshake and register the connection."""
        await ws.accept()
        if user_id not in self._connections:
            self._connections[user_id] = []
        self._connections[user_id].append(ws)
        logger.debug("WS connected | user=%s | total=%d", user_id, len(self._connections[user_id]))

    def disconnect(self, user_id: str, ws: WebSocket) -> None:
        """Remove a specific WebSocket from the registry."""
        conns = self._connections.get(user_id, [])
        if ws in conns:
            conns.remove(ws)
        if not conns:
            self._connections.pop(user_id, None)
        logger.debug("WS disconnected | user=%s", user_id)

    def is_connected(self, user_id: str) -> bool:
        """Return True if the user has at least one live connection."""
        return bool(self._connections.get(user_id))

    async def send_to_user(self, user_id: str, message: dict) -> bool:
        """
        Push a JSON message to every connection belonging to user_id.
        Stale / closed connections are silently removed.
        Returns True if at least one send succeeded.
        """
        conns = self._connections.get(user_id, [])[:]
        if not conns:
            return False

        succeeded = False
        stale: List[WebSocket] = []

        for ws in conns:
            try:
                await ws.send_json(message)
                succeeded = True
            except Exception:
                stale.append(ws)

        # Clean up stale connections
        for ws in stale:
            self.disconnect(user_id, ws)

        return succeeded

    async def broadcast(self, message: dict) -> None:
        """Send a message to ALL connected users (admin use only)."""
        tasks = [
            self.send_to_user(uid, message)
            for uid in list(self._connections.keys())
        ]
        await asyncio.gather(*tasks, return_exceptions=True)

    def connected_user_ids(self) -> List[str]:
        """Return a list of all user IDs with active connections."""
        return list(self._connections.keys())

    def connection_count(self, user_id: Optional[str] = None) -> int:
        """Return connection count for a user, or total if user_id is None."""
        if user_id:
            return len(self._connections.get(user_id, []))
        return sum(len(v) for v in self._connections.values())


# Module-level singleton — imported by all endpoints
ws_manager = WSConnectionManager()
