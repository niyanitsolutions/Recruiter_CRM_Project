"""
AWS S3 File Upload Utility — Niyan HireFlow

When AWS_S3_BUCKET_NAME, AWS_ACCESS_KEY_ID, and AWS_SECRET_ACCESS_KEY are all
set in the environment, files are uploaded to S3 and the returned URL is the
public S3 HTTPS URL.

When those variables are absent (local development), the file is saved to the
local UPLOAD_DIR on disk and a relative URL (/uploads/...) is returned — exactly
the same behaviour as before S3 was introduced.

Usage:
    from app.utils.s3 import upload_file
    url = await upload_file(content_bytes, filename, folder="resumes")
    # url → "https://bucket.s3.region.amazonaws.com/resumes/abc.pdf"  (S3)
    # url → "/uploads/resumes/abc.pdf"                                  (local dev)
"""

from __future__ import annotations

import io
import logging
import os
import uuid
from typing import Optional

from app.core.config import settings

logger = logging.getLogger(__name__)

# Allowed MIME types per folder — enforced at upload time
_ALLOWED_TYPES: dict[str, set[str]] = {
    "resumes":   {".pdf", ".doc", ".docx", ".txt"},
    "documents": {".pdf", ".doc", ".docx", ".txt", ".xlsx", ".csv"},
    "profiles":  {".jpg", ".jpeg", ".png", ".webp"},
}

# Max file sizes in bytes — must match the per-route checks in candidates.py /
# hrm_employees.py (both enforce 5 MB for profile photos before calling upload_file)
_MAX_SIZES: dict[str, int] = {
    "resumes":   5 * 1024 * 1024,   # 5 MB
    "documents": 10 * 1024 * 1024,  # 10 MB
    "profiles":  5 * 1024 * 1024,   # 5 MB
}


def _s3_client():
    """Return a boto3 S3 client configured from settings."""
    import boto3  # lazy import — not available in all envs

    return boto3.client(
        "s3",
        region_name=settings.AWS_REGION,
        aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
        aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
    )


async def upload_file(
    content: bytes,
    original_filename: str,
    folder: str = "resumes",
    candidate_id: Optional[str] = None,
) -> str:
    """
    Upload *content* to S3 (production) or local disk (development).

    Args:
        content:           Raw file bytes.
        original_filename: Original file name — used only for the extension.
        folder:            Destination sub-folder ("resumes", "documents", "profiles").
        candidate_id:      Optional prefix in the S3 key / local filename.

    Returns:
        str: Public URL of the stored file.

    Raises:
        ValueError: If the file extension or size is not allowed for the folder.
    """
    _, ext = os.path.splitext((original_filename or "").lower())

    # ── Validate extension ────────────────────────────────────────────────────
    allowed = _ALLOWED_TYPES.get(folder, set())
    if allowed and ext not in allowed:
        raise ValueError(
            f"File type '{ext}' is not allowed in '{folder}'. "
            f"Allowed: {', '.join(sorted(allowed))}"
        )

    # ── Validate size ─────────────────────────────────────────────────────────
    max_bytes = _MAX_SIZES.get(folder, 10 * 1024 * 1024)
    if len(content) > max_bytes:
        raise ValueError(
            f"File size {len(content):,} bytes exceeds the {max_bytes // (1024*1024)} MB limit."
        )

    prefix = f"{candidate_id}_" if candidate_id else ""
    unique_name = f"{prefix}{uuid.uuid4().hex}{ext}"

    # ── S3 upload (production) ────────────────────────────────────────────────
    if settings.s3_enabled():
        return await _upload_to_s3(content, folder, unique_name, ext)

    # ── Local disk fallback (development) ────────────────────────────────────
    return _save_to_local(content, folder, unique_name)


async def upload_bytes(
    key: str,
    content: bytes,
    content_type: str = "application/octet-stream",
) -> str:
    """
    Store raw *content* under an explicit *key* (folder path + filename, e.g.
    "doc-center/generated/<uuid>.pdf") and return its public URL.

    Unlike upload_file(), the caller supplies the full key — used by the
    Document Center, which generates its own deterministic keys. Mirrors
    upload_file()'s storage branching exactly: S3 in production, local disk
    (served at /api/v1/uploads/<key>) in development.

    This function was referenced by document_center_service but never existed,
    so the surrounding `try/except Exception` swallowed the ImportError and
    every generated PDF/DOCX silently failed to persist (pdf_url stayed None).

    Args:
        key:          Full object key including sub-folders and filename+ext.
        content:      Raw file bytes.
        content_type: MIME type for the stored object.

    Returns:
        str: Public URL (S3 HTTPS URL, or /api/v1/uploads/<key> locally).

    Raises:
        ValueError: If the key is empty or contains a path-traversal segment.
    """
    key = (key or "").strip().lstrip("/")
    if not key or ".." in key.split("/"):
        raise ValueError(f"Invalid storage key: {key!r}")

    # ── S3 upload (production) ────────────────────────────────────────────────
    if settings.s3_enabled():
        import asyncio

        def _put() -> None:
            _s3_client().put_object(
                Bucket=settings.AWS_S3_BUCKET_NAME,
                Key=key,
                Body=io.BytesIO(content),
                ContentType=content_type,
            )

        loop = asyncio.get_running_loop()
        await loop.run_in_executor(None, _put)
        url = (
            f"https://{settings.AWS_S3_BUCKET_NAME}"
            f".s3.{settings.AWS_REGION}.amazonaws.com/{key}"
        )
        logger.info("S3 upload_bytes OK: %s", url)
        return url

    # ── Local disk fallback (development) ────────────────────────────────────
    file_path = os.path.join(settings.UPLOAD_DIR, *key.split("/"))
    os.makedirs(os.path.dirname(file_path), exist_ok=True)
    with open(file_path, "wb") as fh:
        fh.write(content)
    url = f"/api/v1/uploads/{key}"
    logger.debug("Local upload_bytes saved: %s", file_path)
    return url


async def _upload_to_s3(content: bytes, folder: str, filename: str, ext: str) -> str:
    """Upload bytes to S3 and return the public HTTPS URL."""
    import asyncio

    s3_key = f"{folder}/{filename}"
    content_type = _ext_to_content_type(ext)

    def _put() -> None:
        _s3_client().put_object(
            Bucket=settings.AWS_S3_BUCKET_NAME,
            Key=s3_key,
            Body=io.BytesIO(content),
            ContentType=content_type,
            # Files are accessible via their S3 URL — ACL not needed when
            # bucket policy grants public-read (as set up in deployment guide).
        )

    # boto3 is synchronous — run in thread pool to avoid blocking the event loop
    loop = asyncio.get_running_loop()
    await loop.run_in_executor(None, _put)

    url = (
        f"https://{settings.AWS_S3_BUCKET_NAME}"
        f".s3.{settings.AWS_REGION}.amazonaws.com/{s3_key}"
    )
    logger.info("S3 upload OK: %s", url)
    return url


def _save_to_local(content: bytes, folder: str, filename: str) -> str:
    """Save bytes to the local uploads directory and return a relative URL.

    Served under the /api/v1 prefix (not bare /uploads) because reverse
    proxies in front of this app (see nginx/nginx.conf) route /api/ to the
    backend but may not have a separate /uploads/ rule deployed — main.py
    mounts StaticFiles at both paths for exactly this reason.
    """
    upload_dir = os.path.join(settings.UPLOAD_DIR, folder)
    os.makedirs(upload_dir, exist_ok=True)
    file_path = os.path.join(upload_dir, filename)
    with open(file_path, "wb") as fh:
        fh.write(content)
    url = f"/api/v1/uploads/{folder}/{filename}"
    logger.debug("Local upload saved: %s", file_path)
    return url


def _ext_to_content_type(ext: str) -> str:
    """Map a lowercase file extension to an HTTP Content-Type."""
    return {
        ".pdf":  "application/pdf",
        ".doc":  "application/msword",
        ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ".txt":  "text/plain",
        ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ".csv":  "text/csv",
        ".jpg":  "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png":  "image/png",
        ".webp": "image/webp",
    }.get(ext, "application/octet-stream")


async def delete_file(url: str) -> bool:
    """
    Delete a previously uploaded file.

    Accepts either:
    - A full S3 URL: https://bucket.s3.region.amazonaws.com/folder/file.pdf
    - A local relative URL: /uploads/folder/file.pdf

    Returns True on success, False if deletion failed or file not found.
    """
    if not url:
        return False

    try:
        if url.startswith("https://") and ".s3." in url and settings.s3_enabled():
            # Extract S3 key from URL
            # Format: https://{bucket}.s3.{region}.amazonaws.com/{key}
            parts = url.split(".amazonaws.com/", 1)
            if len(parts) == 2:
                s3_key = parts[1]
                import asyncio
                loop = asyncio.get_running_loop()
                await loop.run_in_executor(
                    None,
                    lambda: _s3_client().delete_object(
                        Bucket=settings.AWS_S3_BUCKET_NAME, Key=s3_key
                    ),
                )
                logger.info("S3 delete OK: %s", s3_key)
                return True

        elif url.startswith("/api/v1/uploads/") or url.startswith("/uploads/"):
            # Support both the current (/api/v1/uploads/...) and legacy
            # (/uploads/...) URL formats so old records can still be cleaned up.
            rel_path = url.split("/uploads/", 1)[1]
            local_path = os.path.join(settings.UPLOAD_DIR, rel_path)
            if os.path.exists(local_path):
                os.remove(local_path)
                return True

    except Exception as exc:
        logger.warning("File deletion failed for %s: %s", url, exc)

    return False
