"""
Rate limiter — shared slowapi Limiter instance.
Attach SlowAPIMiddleware in main.py and use @limiter.limit() on endpoints.
"""
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address, default_limits=[])
