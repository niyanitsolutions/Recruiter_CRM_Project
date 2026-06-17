"""
Global Search API (Task 6)
"""
from fastapi import APIRouter, Depends, Query

from app.core.dependencies import get_current_user, get_company_db
from app.services.search_service import global_search, MIN_QUERY_LEN

router = APIRouter(prefix="/search", tags=["Global Search"])


@router.get("/global")
async def search_global(
    q: str = Query("", min_length=0),
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
):
    """
    Search across every module the caller has permission to view.
    Requires at least MIN_QUERY_LEN characters; returns [] otherwise
    (never an error, so the frontend can call this on every keystroke).
    """
    if len(q.strip()) < MIN_QUERY_LEN:
        return {"success": True, "data": [], "min_chars": MIN_QUERY_LEN}

    results = await global_search(db, current_user, q)
    return {"success": True, "data": results, "min_chars": MIN_QUERY_LEN}
