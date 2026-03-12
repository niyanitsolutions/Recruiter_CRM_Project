"""
Gunicorn Configuration — Production
Used as an alternative to plain uvicorn when you need process management.

Start with:
    gunicorn app.main:app -c gunicorn.conf.py

Note: The Dockerfile currently uses uvicorn directly which is fine for most loads.
Switch to gunicorn + uvicorn workers for higher concurrency needs.
"""

import multiprocessing

# ─── Worker Config ─────────────────────────────────────────────────────────────

# For async FastAPI apps, use UvicornWorker
worker_class = "uvicorn.workers.UvicornWorker"

# Recommended: 2–4 x CPU cores
# Keep at 2 for t3.small (2 vCPU, 2GB RAM) to avoid OOM
workers = 2

# Threads per worker (UvicornWorker ignores this — kept for reference)
threads = 1

# ─── Network ───────────────────────────────────────────────────────────────────

bind = "0.0.0.0:8000"
backlog = 2048

# ─── Timeouts ──────────────────────────────────────────────────────────────────

timeout = 120          # Worker timeout (seconds) — increase for long reports
graceful_timeout = 30  # Time to finish in-flight requests on shutdown
keepalive = 5          # Keep-alive connection timeout

# ─── Logging ───────────────────────────────────────────────────────────────────

accesslog = "-"        # stdout
errorlog = "-"         # stdout
loglevel = "info"
access_log_format = '%(h)s %(l)s %(u)s %(t)s "%(r)s" %(s)s %(b)s "%(f)s" "%(a)s" %(D)sμs'

# ─── Process Management ────────────────────────────────────────────────────────

# Restart workers after N requests to prevent memory leaks
max_requests = 1000
max_requests_jitter = 100   # Randomise restart to avoid thundering herd

# Gracefully reload on SIGHUP
reload = False   # Set True only in development

# ─── Security ──────────────────────────────────────────────────────────────────

limit_request_line = 4094
limit_request_fields = 100
limit_request_field_size = 8190
