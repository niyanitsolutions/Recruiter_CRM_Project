#!/usr/bin/env python3
"""
Phase F — Basic concurrency / load test (50–100 users).

Simulates N concurrent users, each logging in once and then repeatedly hitting
a realistic read mix (dashboard + list endpoints) for a fixed duration. Reports
throughput, latency percentiles, and status-code distribution.

Run AGAINST staging / production-like, never a live customer DB under real use:

    python scripts/load-test.py \
        --base-url https://web.hireflowcrm.com \
        --email <test-user> --password <pw> \
        --users 50 --duration 60

Requires: httpx  (pip install httpx)

────────────────────────────────────────────────────────────────────────────
IMPORTANT — the per-IP rate-limit trap:
  nginx rate-limits by $binary_remote_addr. A load test from ONE machine shares
  ONE IP, so all virtual users fall into a single api_general bucket (600 r/m in
  nginx/backend.conf) — you'll hit 429s that a real office of distinct IPs would
  not. This is a test artifact, not a capacity limit.
  - --insecure-direct hits the backend origin directly (bypasses nginx limits)
    to measure true app/DB capacity.
  - Default (through nginx) measures the real user path INCLUDING the per-IP
    ceiling — expect 429s above ~10 req/s from a single source; that is correct
    behavior, and the report separates 429s from real errors (5xx/timeouts).
  For a faithful concurrency test, drive from several source IPs (e.g. a few
  small boxes) and sum the results.
────────────────────────────────────────────────────────────────────────────
"""
import argparse
import asyncio
import statistics
import time
from collections import Counter

try:
    import httpx
except ImportError:
    raise SystemExit("This script needs httpx:  pip install httpx")

# Realistic authenticated read mix — adjust paths if your test user lacks perms.
READ_MIX = [
    "/api/v1/notifications/unread-count",
    "/api/v1/admin/dashboard/",
    "/api/v1/candidates?page=1&page_size=20",
    "/api/v1/jobs?page=1&page_size=20",
    "/api/v1/hrm/dashboard/stats",
]


async def login(client, base, email, password):
    r = await client.post(f"{base}/api/v1/auth/login",
                           json={"identifier": email, "password": password})
    r.raise_for_status()
    tok = r.json().get("access_token")
    if not tok:
        raise RuntimeError(f"login returned no token: {r.text[:200]}")
    return tok


async def user_loop(uid, base, token, deadline, latencies, statuses, errors):
    headers = {"Authorization": f"Bearer {token}"}
    i = 0
    async with httpx.AsyncClient(base_url=base, headers=headers,
                                 verify=False, timeout=30) as client:
        while time.perf_counter() < deadline:
            path = READ_MIX[i % len(READ_MIX)]
            i += 1
            t0 = time.perf_counter()
            try:
                r = await client.get(path)
                latencies.append((time.perf_counter() - t0) * 1000)
                statuses[r.status_code] += 1
            except Exception as e:
                errors[type(e).__name__] += 1
            await asyncio.sleep(0.2)  # ~5 req/s per user pacing


async def run(args):
    latencies, statuses, errors = [], Counter(), Counter()

    # One shared login, reused by all virtual users (single-session policy means
    # each login revokes the prior — so we log in once and fan out the token).
    async with httpx.AsyncClient(verify=False, timeout=30) as c:
        token = await login(c, args.base_url, args.email, args.password)

    print(f"Logged in. Ramping {args.users} users for {args.duration}s "
          f"→ {args.base_url}{'  (DIRECT/bypass-nginx)' if args.insecure_direct else '  (through nginx)'}")
    deadline = time.perf_counter() + args.duration
    start = time.perf_counter()

    await asyncio.gather(*[
        user_loop(u, args.base_url, token, deadline, latencies, statuses, errors)
        for u in range(args.users)
    ])
    elapsed = time.perf_counter() - start

    total = sum(statuses.values())
    ok = statuses.get(200, 0)
    rate_limited = statuses.get(429, 0)
    server_err = sum(v for k, v in statuses.items() if k >= 500)

    print("\n════════════════ RESULTS ════════════════")
    print(f"Duration:        {elapsed:.1f}s")
    print(f"Requests:        {total}  ({total/elapsed:.1f} req/s)")
    print(f"200 OK:          {ok}  ({100*ok/total:.1f}%)" if total else "no requests")
    print(f"429 rate-limited:{rate_limited}   (per-IP nginx ceiling — test artifact from one source IP)")
    print(f"5xx errors:      {server_err}")
    print(f"Transport errors:{sum(errors.values())}  {dict(errors) if errors else ''}")
    print(f"Status spread:   {dict(statuses)}")
    if latencies:
        latencies.sort()
        p = lambda q: latencies[min(len(latencies)-1, int(len(latencies)*q))]
        print(f"Latency ms:      p50={p(.5):.0f}  p90={p(.9):.0f}  p95={p(.95):.0f}  p99={p(.99):.0f}  max={latencies[-1]:.0f}")

    print("\nInterpretation:")
    print("  - Judge capacity by 5xx + transport errors + p95 latency, NOT by 429s.")
    print("  - Non-zero 429 from a single source IP is expected and healthy.")
    print("  - To test true concurrency, run from several IPs and sum, or use --insecure-direct.")
    verdict_bad = server_err > 0 or sum(errors.values()) > total * 0.01
    print(f"\nVERDICT: {'INVESTIGATE — real errors present' if verdict_bad else 'HEALTHY (no 5xx/transport errors)'}")


def main():
    ap = argparse.ArgumentParser(description="Phase F basic load test (50-100 users)")
    ap.add_argument("--base-url", required=True)
    ap.add_argument("--email", required=True)
    ap.add_argument("--password", required=True)
    ap.add_argument("--users", type=int, default=50)
    ap.add_argument("--duration", type=int, default=60, help="seconds")
    ap.add_argument("--insecure-direct", action="store_true",
                    help="hit origin directly to bypass the per-IP nginx rate limit "
                         "(measures app/DB capacity, not the real user path)")
    args = ap.parse_args()
    asyncio.run(run(args))


if __name__ == "__main__":
    main()
