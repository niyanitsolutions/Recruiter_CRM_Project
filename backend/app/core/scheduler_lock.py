"""
Scheduler leader election.

The app runs with multiple uvicorn workers (see backend/Dockerfile), and the
FastAPI lifespan executes once per worker process. Without coordination, every
background scheduler (subscription reminders, session cleanup, HRM auto
punch-out, tenant cleanup, subscription queue) runs N times — duplicate
reminder emails, duplicate sweeps, and racing tenant-deletion jobs.

This module elects exactly ONE worker as the scheduler leader using a Redis
lock (SET NX EX). The leader starts the scheduler tasks and renews the lock;
if the leader dies, the lock expires and a standby worker takes over within
LEADER_TTL seconds — so schedulers also survive worker crashes/recycles.

Failure mode: if Redis is unavailable, we fall back to running the schedulers
in this worker (the pre-election behavior) rather than not running them at
all — duplicated reminders are recoverable, silently-skipped payroll/tenant
sweeps are not.
"""

import asyncio
import json
import logging
import os
import socket
import uuid
from datetime import datetime, timezone
from typing import Awaitable, Callable, Dict, List, Tuple

from app.core.redis import get_redis

logger = logging.getLogger(__name__)

LEADER_KEY = "scheduler:leader"
LEADER_TTL = 90          # seconds before an un-renewed lock lapses
RENEW_INTERVAL = 30      # leader renews / standbys retry this often

# Leader-written health snapshot: which instance leads + per-task state.
# TTL is generous vs RENEW_INTERVAL so one missed tick doesn't blank it, but a
# dead leader's stale report disappears within ~2.5 ticks. Consumed by /ready.
HEALTH_KEY = "scheduler:health"
HEALTH_TTL = 150

# (name, coroutine factory) — factories so tasks can be (re)created on takeover
LoopSpec = Tuple[str, Callable[[], Awaitable]]


class SchedulerLeader:
    """Owns the scheduler tasks for this process while it holds the Redis lock."""

    def __init__(self, loops: List[LoopSpec], one_shots: List[LoopSpec] | None = None):
        self._loops = loops
        self._one_shots = one_shots or []
        self._instance_id = f"{socket.gethostname()}:{os.getpid()}:{uuid.uuid4().hex[:8]}"
        self._loop_tasks: Dict[str, asyncio.Task] = {}
        self._oneshot_tasks: Dict[str, asyncio.Task] = {}
        self._is_leader = False
        self._degraded = False  # running without Redis coordination

    # ── task lifecycle ────────────────────────────────────────────────────────

    @property
    def _tasks(self) -> List[asyncio.Task]:
        """All owned tasks (loops + one-shots) — used by shutdown and tests."""
        return list(self._loop_tasks.values()) + list(self._oneshot_tasks.values())

    def _start_tasks(self) -> None:
        for name, factory in self._one_shots:
            self._oneshot_tasks[name] = asyncio.create_task(factory(), name=f"sched-once:{name}")
        for name, factory in self._loops:
            self._loop_tasks[name] = asyncio.create_task(factory(), name=f"sched:{name}")
        logger.info(
            "[scheduler] %s started %d loop(s) + %d one-shot(s) as leader",
            self._instance_id, len(self._loops), len(self._one_shots),
        )

    async def _stop_tasks(self) -> None:
        tasks = self._tasks
        for t in tasks:
            t.cancel()
        for t in tasks:
            try:
                await t
            except (asyncio.CancelledError, Exception):
                pass
        self._loop_tasks = {}
        self._oneshot_tasks = {}

    async def _maintain_tasks(self, redis) -> None:
        """Leader-only, once per tick: restart crashed loops and publish a
        health snapshot to Redis for the /ready probe.

        The scheduler loops all catch their own exceptions, so a task ending is
        exceptional (a bug or truly fatal error) — before this, a crashed loop
        stayed dead until the next deploy with zero symptoms. Now it is
        restarted and the crash is loud in the logs and in the health snapshot.
        One-shots are reported but never restarted.
        """
        health: Dict[str, str] = {}

        for name, factory in self._loops:
            t = self._loop_tasks.get(name)
            if t is not None and not t.done():
                health[name] = "running"
                continue
            if t is not None and not t.cancelled() and t.exception() is not None:
                logger.error(
                    "[scheduler] loop '%s' crashed (%s) — restarting",
                    name, t.exception(),
                )
                health[name] = f"restarted after crash: {t.exception()}"
            else:
                health[name] = "restarted"
            self._loop_tasks[name] = asyncio.create_task(factory(), name=f"sched:{name}")

        for name, _factory in self._one_shots:
            t = self._oneshot_tasks.get(name)
            if t is None:
                continue
            key = f"once:{name}"
            if not t.done():
                health[key] = "running"
            elif t.cancelled():
                health[key] = "cancelled"
            elif t.exception() is not None:
                health[key] = f"failed: {t.exception()}"
            else:
                health[key] = "completed"

        if redis is not None:
            try:
                await redis.setex(HEALTH_KEY, HEALTH_TTL, json.dumps({
                    "leader": self._instance_id,
                    "ts": datetime.now(timezone.utc).isoformat(),
                    "tasks": health,
                }, default=str))
            except Exception as exc:
                logger.warning("[scheduler] health publish failed: %s", exc)

    # ── election loop ─────────────────────────────────────────────────────────

    async def run(self) -> None:
        """Main election loop — start as a lifespan task, cancel on shutdown."""
        try:
            while True:
                await self._tick()
                await asyncio.sleep(RENEW_INTERVAL)
        except asyncio.CancelledError:
            await self._release()
            raise

    async def _tick(self) -> None:
        redis = get_redis()

        if redis is None:
            # No Redis — run schedulers here (previous single-source behavior).
            # Every worker will do the same, which duplicates work but never
            # silently skips it. Logged once.
            if not self._is_leader:
                logger.warning(
                    "[scheduler] Redis unavailable — running schedulers without "
                    "leader election (may duplicate across workers)"
                )
                self._is_leader = True
                self._degraded = True
                self._start_tasks()
            else:
                # Still restart crashed loops in degraded mode (no publish)
                await self._maintain_tasks(None)
            return

        try:
            if self._degraded:
                # Redis came back after a degraded start. Keep running only if
                # we can claim the lock; otherwise stand down to end duplication.
                acquired = await redis.set(LEADER_KEY, self._instance_id, nx=True, ex=LEADER_TTL)
                if acquired:
                    self._degraded = False
                    logger.info("[scheduler] %s upgraded degraded run to leadership", self._instance_id)
                else:
                    holder = await redis.get(LEADER_KEY)
                    if holder != self._instance_id:
                        logger.info("[scheduler] %s standing down (leader=%s)", self._instance_id, holder)
                        await self._stop_tasks()
                        self._is_leader = False
                        self._degraded = False
                return

            if not self._is_leader:
                acquired = await redis.set(LEADER_KEY, self._instance_id, nx=True, ex=LEADER_TTL)
                if acquired:
                    self._is_leader = True
                    self._start_tasks()
                    await self._maintain_tasks(redis)
            else:
                holder = await redis.get(LEADER_KEY)
                if holder == self._instance_id:
                    await redis.expire(LEADER_KEY, LEADER_TTL)
                    await self._maintain_tasks(redis)
                else:
                    # Lock lost (expiry + takeover) — stop our copies immediately.
                    logger.warning(
                        "[scheduler] %s lost leadership to %s — stopping tasks",
                        self._instance_id, holder,
                    )
                    await self._stop_tasks()
                    self._is_leader = False
        except Exception as exc:
            # Transient Redis error: if we are leader, keep running (a brief
            # renewal gap is preferable to stopping schedulers); the TTL gives
            # a bounded takeover window if we actually died.
            logger.warning("[scheduler] election tick error (state kept): %s", exc)

    async def _release(self) -> None:
        """On shutdown: stop tasks and release the lock if we hold it."""
        await self._stop_tasks()
        if not self._is_leader or self._degraded:
            return
        redis = get_redis()
        if redis is None:
            return
        try:
            holder = await redis.get(LEADER_KEY)
            if holder == self._instance_id:
                await redis.delete(LEADER_KEY)
                logger.info("[scheduler] %s released leadership on shutdown", self._instance_id)
        except Exception as exc:
            logger.warning("[scheduler] lock release failed (will lapse via TTL): %s", exc)
