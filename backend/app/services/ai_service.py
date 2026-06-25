"""
Centralized AI Provider Service.

All AI-powered features (resume parsing, ATS scoring, Excel column mapping)
call this service instead of calling provider APIs directly.

The active provider is loaded from master_db.ai_provider_config at request time,
enabling live provider switching without server restart or code changes.
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
from abc import ABC, abstractmethod
from typing import Any, Optional

from fastapi import HTTPException

logger = logging.getLogger(__name__)

# ─── Collection / document identifiers ───────────────────────────────────────

_COLLECTION = "ai_provider_config"
_DOC_ID = "global"

# ─── Supported providers ──────────────────────────────────────────────────────

SUPPORTED_PROVIDERS = ["gemini", "openai", "claude", "deepseek", "azure_openai", "openrouter", "custom"]

PROVIDER_MODELS: dict[str, list[str]] = {
    "gemini": ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-pro", "gemini-1.5-flash"],
    "openai": ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo", "o1", "o1-mini"],
    "claude": [
        "claude-opus-4-8",
        "claude-sonnet-4-6",
        "claude-haiku-4-5-20251001",
        "claude-3-5-sonnet-20241022",
        "claude-3-5-haiku-20241022",
        "claude-sonnet-4-5-20251001",
    ],
    "deepseek": ["deepseek-chat", "deepseek-reasoner"],
    "azure_openai": [],   # deployment-based — user enters deployment name
    "openrouter": [],     # user enters model path
    "custom": [],         # user enters model string
}

# ─── Prompts ──────────────────────────────────────────────────────────────────

_RESUME_PARSE_PROMPT = """Parse this resume and return a JSON object with exactly this structure.
Return ONLY the raw JSON — no explanation, no markdown, no code fences.

{{
  "full_name": "",
  "email": "",
  "phone": "",
  "location": "",
  "linkedin": "",
  "current_role": "",
  "total_experience_years": 0,
  "skills": [],
  "education": [
    {{
      "degree": "",
      "field_of_study": "",
      "institution": "",
      "year_from": "",
      "year_to": "",
      "score": "",
      "score_type": ""
    }}
  ],
  "experience": [
    {{
      "company_name": "",
      "job_title": "",
      "start_date": "",
      "end_date": "",
      "is_current": false,
      "description": ""
    }}
  ]
}}

Rules:
- degree: full degree name (e.g. "Bachelor of Technology", "Master of Business Administration")
- field_of_study: specialization/branch (e.g. "Computer Science", "Finance")
- institution: college or university name
- year_from / year_to: 4-digit year strings (e.g. "2018", "2022")
- score: numeric value as string (e.g. "8.5" or "78")
- score_type: "CGPA" or "Percentage" — infer from context
- start_date / end_date: "YYYY-MM" format if known, else ""
- is_current: true if candidate is currently working at this company
- If a field cannot be determined, use "" for strings, 0 for numbers, [] for arrays, false for booleans
- total_experience_years: numeric (e.g. 3.5 for 3 years 6 months)
- skills: flat list of skill name strings

Resume text:
{resume_text}"""

_ATS_SCORE_PROMPT = """Analyze this resume against the job description and return a JSON ATS score report.
Return ONLY the raw JSON — no explanation, no markdown, no code fences.

{{
  "ats_score": 0,
  "keyword_match_score": 0,
  "experience_match_score": 0,
  "skills_match_score": 0,
  "education_match_score": 0,
  "matched_keywords": [],
  "missing_keywords": [],
  "matched_skills": [],
  "missing_skills": [],
  "recommendations": [],
  "summary": ""
}}

Rules:
- All scores are integers from 0 to 100
- ats_score: overall weighted score
- keyword_match_score: job description keyword coverage in resume
- experience_match_score: experience level alignment
- skills_match_score: technical skills match percentage
- education_match_score: education requirements match
- matched_keywords: important JD keywords found in resume
- missing_keywords: important JD keywords not found in resume
- matched_skills: required skills found in resume
- missing_skills: required skills not found in resume
- recommendations: 3-5 actionable improvement suggestions as strings
- summary: 2-3 sentence overall assessment

Job Description:
{job_description}

Resume:
{resume_text}"""

_EXCEL_COLUMN_MAP_PROMPT = """You are a data mapping assistant. Map these spreadsheet column headers to the standard fields for a {entity_type} record.
Return ONLY the raw JSON — no explanation, no markdown, no code fences.

Return a JSON object where:
- keys are the original column headers (exactly as provided)
- values are the matching standard field name, or null if no reasonable match

Standard {entity_type} fields:
{standard_fields}

Column headers to map:
{headers}

Rules:
- Use only the standard field names listed above as values
- Set value to null if no reasonable match exists
- Consider common abbreviations, synonyms, and variations (e.g. "Mobile" → "phone", "Org" → "company_name")
- Prioritize semantic meaning over exact text matching"""

_STANDARD_FIELDS: dict[str, list[str]] = {
    "candidate": [
        "first_name", "last_name", "email", "phone", "location", "city", "state", "country",
        "current_company", "current_designation", "total_experience_years", "notice_period",
        "expected_ctc", "current_ctc", "skills", "linkedin", "source", "notes",
        "gender", "date_of_birth", "nationality",
    ],
    "job": [
        "job_title", "department", "employment_type", "experience_min", "experience_max",
        "skills_required", "job_location", "salary_min", "salary_max", "job_description",
        "openings", "hiring_manager", "status", "client_name", "priority",
    ],
    "client": [
        "company_name", "contact_person", "email", "phone", "website", "industry",
        "address", "city", "state", "country", "pincode", "gst_number", "notes",
        "status", "account_manager",
    ],
}

# ─── JSON helpers ─────────────────────────────────────────────────────────────

def _clean_json(text: str) -> str:
    """Strip accidental markdown code fences that some models add."""
    text = text.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        end = len(lines) - 1
        # Remove trailing fence
        if lines[end].strip() in ("```", "```json"):
            lines = lines[:end]
        # Remove leading fence
        lines = lines[1:]
        text = "\n".join(lines).strip()
    return text


def _parse_json(text: str) -> dict:
    cleaned = _clean_json(text)
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError as exc:
        raise ValueError(f"Provider returned invalid JSON: {exc}. Raw (first 400 chars): {cleaned[:400]}")


def _normalize_resume(parsed: dict) -> dict:
    """Split full_name and apply field defaults."""
    full_name = (parsed.get("full_name") or "").strip()
    parts = full_name.split(maxsplit=1) if full_name else []
    first_name = parts[0] if parts else parsed.get("first_name", "")
    last_name = parts[1] if len(parts) > 1 else parsed.get("last_name", "")

    return {
        "first_name": first_name,
        "last_name": last_name,
        "full_name": full_name,
        "email": parsed.get("email", ""),
        "phone": parsed.get("phone", ""),
        "location": parsed.get("location", ""),
        "linkedin": parsed.get("linkedin", ""),
        "current_role": parsed.get("current_role", ""),
        "total_experience_years": parsed.get("total_experience_years", 0),
        "skills": parsed.get("skills", []),
        "education": parsed.get("education", []),
        "experience": parsed.get("experience", []),
    }


# ─── Base adapter ─────────────────────────────────────────────────────────────

class BaseAIAdapter(ABC):
    @abstractmethod
    async def call(self, prompt: str, config: dict) -> str:
        """Send prompt to provider, return raw text response."""

    async def test_connection(self, config: dict) -> dict:
        start = time.monotonic()
        try:
            response = await self.call("Reply with the single word: OK", config)
            latency_ms = int((time.monotonic() - start) * 1000)
            return {
                "success": True,
                "provider": config.get("provider"),
                "model": config.get("model"),
                "latency_ms": latency_ms,
                "response_preview": (response or "")[:100],
                "message": "Connection successful",
            }
        except HTTPException as exc:
            return {"success": False, "provider": config.get("provider"), "model": config.get("model"), "message": exc.detail}
        except Exception as exc:
            return {"success": False, "provider": config.get("provider"), "model": config.get("model"), "message": str(exc)}


# ─── Claude adapter ───────────────────────────────────────────────────────────

class ClaudeAdapter(BaseAIAdapter):
    async def call(self, prompt: str, config: dict) -> str:
        try:
            import anthropic
        except ImportError:
            raise HTTPException(status_code=503, detail="anthropic package is not installed. Run: pip install anthropic")

        api_key = config.get("api_key", "")
        if not api_key:
            raise HTTPException(status_code=503, detail="Claude API key is not configured.")

        client = anthropic.AsyncAnthropic(api_key=api_key)
        try:
            message = await client.messages.create(
                model=config.get("model", "claude-sonnet-4-5-20251001"),
                max_tokens=config.get("max_tokens", 2048),
                messages=[{"role": "user", "content": prompt}],
            )
            return message.content[0].text
        except anthropic.AuthenticationError:
            raise HTTPException(status_code=401, detail="Claude API key is invalid or expired.")
        except anthropic.RateLimitError:
            raise HTTPException(status_code=429, detail="Claude API rate limit exceeded. Please try again later.")
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"Claude API error: {exc}")


# ─── Gemini adapter (direct REST — no deprecated SDK) ────────────────────────
#
# Uses httpx against the Gemini REST API directly.
# The old google-generativeai SDK used gRPC transport which triggered 403s on
# newer models (gemini-2.5-*) even with a valid API key.  Direct REST + API-key
# query-param auth is the correct path for server-side non-OAuth access.

class GeminiAdapter(BaseAIAdapter):
    _BASE = "https://generativelanguage.googleapis.com/v1beta"
    _GENERATE_URL = _BASE + "/models/{model}:generateContent"
    _LIST_URL     = _BASE + "/models"

    # ── Helpers ───────────────────────────────────────────────────────────────

    @staticmethod
    def _clean_key(raw: str) -> str:
        """Strip all whitespace / newline chars that would corrupt the key."""
        return raw.strip()

    @staticmethod
    def _safe_key_prefix(key: str) -> str:
        return key[:6] + "******" if len(key) >= 6 else "******"

    @staticmethod
    def _extract_error(resp_json: dict) -> tuple[int, str]:
        """Return (google_error_code, message) from a non-200 response body."""
        err = resp_json.get("error", {})
        return err.get("code", 0), err.get("message", "")

    # ── Primary call ──────────────────────────────────────────────────────────

    async def call(self, prompt: str, config: dict) -> str:
        api_key = self._clean_key(config.get("api_key") or "")
        if not api_key:
            raise HTTPException(status_code=503, detail="Gemini API key is not configured.")

        model   = (config.get("model") or "gemini-2.0-flash").strip()
        timeout = int(config.get("timeout") or 30)

        logger.info(
            "gemini_call model=%s endpoint=%s timeout=%ds key_prefix=%s prompt_len=%d",
            model, self._GENERATE_URL.format(model=model),
            timeout, self._safe_key_prefix(api_key), len(prompt),
        )

        payload: dict[str, Any] = {
            "contents": [{"role": "user", "parts": [{"text": prompt}]}],
            "generationConfig": {
                "temperature": float(config.get("temperature") or 0.3),
                "maxOutputTokens": int(config.get("max_tokens") or 2048),
            },
        }
        top_p = config.get("top_p")
        if top_p is not None:
            payload["generationConfig"]["topP"] = float(top_p)

        url = self._GENERATE_URL.format(model=model)

        async with httpx.AsyncClient(timeout=timeout) as client:
            try:
                resp = await client.post(
                    url,
                    json=payload,
                    params={"key": api_key},
                    headers={"Content-Type": "application/json"},
                )
            except httpx.TimeoutException:
                raise HTTPException(status_code=504, detail=f"Gemini API timed out after {timeout}s.")
            except Exception as exc:
                raise HTTPException(status_code=502, detail=f"Gemini network error: {exc}")

        logger.info("gemini_response status=%d model=%s", resp.status_code, model)

        if resp.status_code == 200:
            return self._parse_content(resp.json(), model)

        # ── Error path ────────────────────────────────────────────────────────
        try:
            body = resp.json()
        except Exception:
            body = {}

        g_code, g_msg = self._extract_error(body)
        logger.error(
            "gemini_error http=%d google_code=%s message=%s",
            resp.status_code, g_code, g_msg,
        )
        self._raise_for_status(resp.status_code, g_code, g_msg, model)

    # ── Response parser ───────────────────────────────────────────────────────

    @staticmethod
    def _parse_content(data: dict, model: str) -> str:
        try:
            return data["candidates"][0]["content"]["parts"][0]["text"]
        except (KeyError, IndexError):
            # Safety-blocked or empty response
            finish = ""
            try:
                finish = data["candidates"][0].get("finishReason", "")
            except Exception:
                pass
            raise HTTPException(
                status_code=502,
                detail=f"Gemini ({model}) returned no text content. finishReason={finish!r}.",
            )

    # ── Error classifier ──────────────────────────────────────────────────────

    @staticmethod
    def _raise_for_status(http: int, g_code: int, g_msg: str, model: str) -> None:
        detail: str
        if http == 400:
            detail = f"Gemini bad request: {g_msg}"
        elif http == 401:
            detail = "Gemini API key is invalid or expired."
        elif http == 403:
            detail = (
                f"Gemini access denied (403). {g_msg}\n\n"
                "Verify: API key is correct, Generative Language API is enabled in "
                "Google Cloud Console, billing is active, and the key has no IP restrictions."
            )
        elif http == 404:
            detail = (
                f"Gemini model '{model}' not found. "
                "Check the model name in AI Provider Management."
            )
        elif http == 429:
            detail = "Gemini API quota exceeded. Please retry in a moment."
        else:
            detail = f"Gemini API error {http}: {g_msg}"
        raise HTTPException(status_code=http if http in (400, 401, 403, 404, 429) else 502, detail=detail)

    # ── Test connection (full: list models + generate) ────────────────────────

    async def test_connection(self, config: dict) -> dict:
        api_key = self._clean_key(config.get("api_key") or "")
        if not api_key:
            return {"success": False, "provider": "gemini", "message": "API key is not configured."}

        model   = (config.get("model") or "gemini-2.0-flash").strip()
        timeout = int(config.get("timeout") or 30)
        steps: dict[str, Any] = {}
        start = time.monotonic()

        # Step 1 — API key format
        steps["api_key_valid"] = bool(api_key)
        logger.info("gemini_test step=api_key prefix=%s", self._safe_key_prefix(api_key))

        # Step 2 — Authenticate / list models
        async with httpx.AsyncClient(timeout=timeout) as client:
            try:
                lr = await client.get(self._LIST_URL, params={"key": api_key})
                if lr.status_code == 200:
                    models = [m.get("name", "").split("/")[-1] for m in lr.json().get("models", [])]
                    steps["list_models"] = True
                    steps["available_models"] = models[:10]
                    logger.info("gemini_test step=list_models count=%d", len(models))
                else:
                    try:
                        _, g_msg = self._extract_error(lr.json())
                    except Exception:
                        g_msg = lr.text[:200]
                    steps["list_models"] = False
                    steps["list_models_error"] = g_msg
                    return {
                        "success": False, "provider": "gemini", "model": model,
                        "latency_ms": int((time.monotonic() - start) * 1000),
                        "message": f"Authentication failed ({lr.status_code}): {g_msg}",
                        "steps": steps,
                    }
            except Exception as exc:
                steps["list_models"] = False
                steps["list_models_error"] = str(exc)
                return {
                    "success": False, "provider": "gemini", "model": model,
                    "latency_ms": int((time.monotonic() - start) * 1000),
                    "message": f"Could not reach Gemini API: {exc}",
                    "steps": steps,
                }

        # Step 3 — Generate content
        test_config = {**config, "api_key": api_key, "model": model,
                       "max_tokens": 16, "temperature": 0.0}
        try:
            text = await self.call("Reply only with the word: OK", test_config)
            steps["generate_content"] = True
            steps["generate_preview"] = (text or "")[:50]
            logger.info("gemini_test step=generate_content ok preview=%r", steps["generate_preview"])
        except HTTPException as exc:
            steps["generate_content"] = False
            steps["generate_error"] = exc.detail
            return {
                "success": False, "provider": "gemini", "model": model,
                "latency_ms": int((time.monotonic() - start) * 1000),
                "message": exc.detail,
                "steps": steps,
            }

        latency_ms = int((time.monotonic() - start) * 1000)
        logger.info("gemini_test success model=%s latency_ms=%d", model, latency_ms)
        return {
            "success": True, "provider": "gemini", "model": model,
            "latency_ms": latency_ms,
            "response_preview": steps["generate_preview"],
            "message": "Connection successful",
            "steps": steps,
        }


# ─── OpenAI adapter ───────────────────────────────────────────────────────────

class OpenAIAdapter(BaseAIAdapter):
    def _client(self, config: dict):
        try:
            import openai  # type: ignore
        except ImportError:
            raise HTTPException(status_code=503, detail="openai package is not installed. Run: pip install openai")
        kwargs: dict[str, Any] = {"api_key": config.get("api_key", "")}
        if config.get("organization_id"):
            kwargs["organization"] = config["organization_id"]
        if config.get("project_id"):
            kwargs["project"] = config["project_id"]
        return openai.AsyncOpenAI(**kwargs)

    async def call(self, prompt: str, config: dict) -> str:
        if not config.get("api_key"):
            raise HTTPException(status_code=503, detail="OpenAI API key is not configured.")
        client = self._client(config)
        try:
            resp = await client.chat.completions.create(
                model=config.get("model", "gpt-4o-mini"),
                messages=[{"role": "user", "content": prompt}],
                max_tokens=config.get("max_tokens", 2048),
                temperature=config.get("temperature", 0.3),
            )
            return resp.choices[0].message.content or ""
        except Exception as exc:
            err = str(exc)
            if "401" in err or "invalid_api_key" in err.lower():
                raise HTTPException(status_code=401, detail="OpenAI API key is invalid.")
            raise HTTPException(status_code=502, detail=f"OpenAI API error: {exc}")


# ─── DeepSeek adapter (OpenAI-compatible) ─────────────────────────────────────

class DeepSeekAdapter(BaseAIAdapter):
    async def call(self, prompt: str, config: dict) -> str:
        try:
            import openai  # type: ignore
        except ImportError:
            raise HTTPException(status_code=503, detail="openai package is not installed. Run: pip install openai")
        if not config.get("api_key"):
            raise HTTPException(status_code=503, detail="DeepSeek API key is not configured.")
        client = openai.AsyncOpenAI(api_key=config["api_key"], base_url="https://api.deepseek.com/v1")
        try:
            resp = await client.chat.completions.create(
                model=config.get("model", "deepseek-chat"),
                messages=[{"role": "user", "content": prompt}],
                max_tokens=config.get("max_tokens", 2048),
                temperature=config.get("temperature", 0.3),
            )
            return resp.choices[0].message.content or ""
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"DeepSeek API error: {exc}")


# ─── Azure OpenAI adapter ─────────────────────────────────────────────────────

class AzureOpenAIAdapter(BaseAIAdapter):
    async def call(self, prompt: str, config: dict) -> str:
        try:
            import openai  # type: ignore
        except ImportError:
            raise HTTPException(status_code=503, detail="openai package is not installed. Run: pip install openai")
        if not config.get("api_key"):
            raise HTTPException(status_code=503, detail="Azure OpenAI API key is not configured.")
        if not config.get("azure_endpoint"):
            raise HTTPException(status_code=503, detail="Azure OpenAI endpoint is not configured.")
        client = openai.AsyncAzureOpenAI(
            api_key=config["api_key"],
            azure_endpoint=config["azure_endpoint"],
            api_version=config.get("api_version", "2024-02-15-preview"),
        )
        try:
            resp = await client.chat.completions.create(
                model=config.get("model", "gpt-4o"),
                messages=[{"role": "user", "content": prompt}],
                max_tokens=config.get("max_tokens", 2048),
                temperature=config.get("temperature", 0.3),
            )
            return resp.choices[0].message.content or ""
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"Azure OpenAI API error: {exc}")


# ─── OpenRouter adapter (OpenAI-compatible) ───────────────────────────────────

class OpenRouterAdapter(BaseAIAdapter):
    async def call(self, prompt: str, config: dict) -> str:
        try:
            import openai  # type: ignore
        except ImportError:
            raise HTTPException(status_code=503, detail="openai package is not installed. Run: pip install openai")
        if not config.get("api_key"):
            raise HTTPException(status_code=503, detail="OpenRouter API key is not configured.")
        client = openai.AsyncOpenAI(api_key=config["api_key"], base_url="https://openrouter.ai/api/v1")
        try:
            resp = await client.chat.completions.create(
                model=config.get("model", "openai/gpt-4o-mini"),
                messages=[{"role": "user", "content": prompt}],
                max_tokens=config.get("max_tokens", 2048),
                temperature=config.get("temperature", 0.3),
            )
            return resp.choices[0].message.content or ""
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"OpenRouter API error: {exc}")


# ─── Custom REST API adapter ──────────────────────────────────────────────────

class CustomApiAdapter(BaseAIAdapter):
    async def call(self, prompt: str, config: dict) -> str:
        import httpx

        base_url = (config.get("base_url") or "").rstrip("/")
        if not base_url:
            raise HTTPException(status_code=503, detail="Custom API base URL is not configured.")

        headers: dict[str, str] = {"Content-Type": "application/json"}
        if config.get("api_key"):
            headers["Authorization"] = f"Bearer {config['api_key']}"
        headers.update(config.get("custom_headers") or {})

        payload = {
            "model": config.get("model", ""),
            "messages": [{"role": "user", "content": prompt}],
            "max_tokens": config.get("max_tokens", 2048),
            "temperature": config.get("temperature", 0.3),
        }

        async with httpx.AsyncClient(timeout=config.get("timeout", 30)) as client:
            try:
                resp = await client.post(f"{base_url}/chat/completions", json=payload, headers=headers)
                resp.raise_for_status()
                data = resp.json()
                return data["choices"][0]["message"]["content"]
            except httpx.HTTPStatusError as exc:
                raise HTTPException(
                    status_code=502,
                    detail=f"Custom API HTTP {exc.response.status_code}: {exc.response.text[:200]}",
                )
            except Exception as exc:
                raise HTTPException(status_code=502, detail=f"Custom API error: {exc}")


# ─── Adapter registry ─────────────────────────────────────────────────────────

_ADAPTERS: dict[str, BaseAIAdapter] = {
    "claude":      ClaudeAdapter(),
    "gemini":      GeminiAdapter(),
    "openai":      OpenAIAdapter(),
    "deepseek":    DeepSeekAdapter(),
    "azure_openai": AzureOpenAIAdapter(),
    "openrouter":  OpenRouterAdapter(),
    "custom":      CustomApiAdapter(),
}


# ─── AIService ────────────────────────────────────────────────────────────────

class AIService:
    """Central AI service. All AI-powered features must call this — never providers directly."""

    @staticmethod
    async def get_active_config(master_db) -> dict:
        """Load and return the active AI provider config (API key decrypted)."""
        doc = await master_db[_COLLECTION].find_one({"_id": _DOC_ID})
        if not doc:
            raise HTTPException(
                status_code=503,
                detail=(
                    "No AI provider is configured. "
                    "Go to Super Admin → Settings → AI Provider Management to set one up."
                ),
            )
        if not doc.get("is_active", True):
            raise HTTPException(status_code=503, detail="AI provider is currently disabled.")

        api_key = ""
        if doc.get("api_key_encrypted"):
            from app.services.email_service import decrypt_password
            api_key = decrypt_password(doc["api_key_encrypted"])

        return {
            "provider":        doc.get("provider", ""),
            "api_key":         api_key,
            "model":           doc.get("model", ""),
            "temperature":     doc.get("temperature", 0.3),
            "top_p":           doc.get("top_p", 1.0),
            "max_tokens":      doc.get("max_tokens", 2048),
            "timeout":         doc.get("timeout", 30),
            "retry_count":     doc.get("retry_count", 2),
            "organization_id": doc.get("organization_id"),
            "project_id":      doc.get("project_id"),
            "region":          doc.get("region"),
            "azure_endpoint":  doc.get("azure_endpoint"),
            "api_version":     doc.get("api_version"),
            "base_url":        doc.get("base_url"),
            "custom_headers":  doc.get("custom_headers") or {},
        }

    @staticmethod
    def _adapter(provider: str) -> BaseAIAdapter:
        adapter = _ADAPTERS.get(provider)
        if not adapter:
            raise HTTPException(
                status_code=503,
                detail=f"Unknown AI provider '{provider}'. Supported: {', '.join(_ADAPTERS)}",
            )
        return adapter

    @staticmethod
    async def _call_with_retry(adapter: BaseAIAdapter, prompt: str, config: dict) -> str:
        retries = max(1, int(config.get("retry_count", 2)))
        last_exc: Exception | None = None
        for attempt in range(retries):
            try:
                return await adapter.call(prompt, config)
            except HTTPException:
                raise
            except Exception as exc:
                last_exc = exc
                logger.warning("AI call attempt %d/%d failed: %s", attempt + 1, retries, exc)
                if attempt < retries - 1:
                    await asyncio.sleep(1)
        raise HTTPException(
            status_code=502,
            detail=f"AI provider failed after {retries} attempt(s): {last_exc}",
        )

    @classmethod
    async def parse_resume(cls, raw_text: str, master_db) -> dict:
        """Parse resume text via the active AI provider and return normalized candidate fields."""
        start = time.monotonic()
        config = await cls.get_active_config(master_db)
        adapter = cls._adapter(config["provider"])
        prompt = _RESUME_PARSE_PROMPT.format(resume_text=raw_text[:8000])

        response_text = await cls._call_with_retry(adapter, prompt, config)

        try:
            parsed = _parse_json(response_text)
        except ValueError as exc:
            logger.error("Resume parse invalid JSON: %s", exc)
            raise HTTPException(status_code=502, detail="Resume parser returned invalid data. Please try again.")

        result = _normalize_resume(parsed)
        logger.info(
            "resume_parse provider=%s model=%s duration_ms=%d",
            config["provider"], config.get("model"), int((time.monotonic() - start) * 1000),
        )
        return result

    @classmethod
    async def calculate_ats_score(cls, resume_text: str, job_description: str, master_db) -> dict:
        """Score resume against a job description using the active AI provider."""
        config = await cls.get_active_config(master_db)
        adapter = cls._adapter(config["provider"])
        prompt = _ATS_SCORE_PROMPT.format(
            resume_text=resume_text[:6000],
            job_description=job_description[:3000],
        )
        response_text = await cls._call_with_retry(adapter, prompt, config)
        try:
            result = _parse_json(response_text)
        except ValueError as exc:
            raise HTTPException(status_code=502, detail=str(exc))

        return {
            "ats_score":              int(result.get("ats_score", 0)),
            "keyword_match_score":    int(result.get("keyword_match_score", 0)),
            "experience_match_score": int(result.get("experience_match_score", 0)),
            "skills_match_score":     int(result.get("skills_match_score", 0)),
            "education_match_score":  int(result.get("education_match_score", 0)),
            "matched_keywords":       result.get("matched_keywords", []),
            "missing_keywords":       result.get("missing_keywords", []),
            "matched_skills":         result.get("matched_skills", []),
            "missing_skills":         result.get("missing_skills", []),
            "recommendations":        result.get("recommendations", []),
            "summary":                result.get("summary", ""),
        }

    @classmethod
    async def map_excel_columns(cls, headers: list[str], entity_type: str, master_db) -> dict:
        """AI-powered mapping of spreadsheet column headers to standard field names."""
        if entity_type not in _STANDARD_FIELDS:
            raise HTTPException(status_code=400, detail=f"Unknown entity type '{entity_type}'")

        config = await cls.get_active_config(master_db)
        adapter = cls._adapter(config["provider"])
        standard_fields = ", ".join(_STANDARD_FIELDS[entity_type])
        prompt = _EXCEL_COLUMN_MAP_PROMPT.format(
            entity_type=entity_type,
            standard_fields=standard_fields,
            headers=json.dumps(headers),
        )
        response_text = await cls._call_with_retry(adapter, prompt, config)
        try:
            mapping = _parse_json(response_text)
        except ValueError as exc:
            raise HTTPException(status_code=502, detail=str(exc))

        valid = set(_STANDARD_FIELDS[entity_type])
        header_set = set(headers)
        return {
            k: (v if v in valid else None)
            for k, v in mapping.items()
            if k in header_set
        }

    @classmethod
    async def test_connection(cls, config_override: Optional[dict], master_db) -> dict:
        """Test the active provider (or a supplied config) without saving."""
        config = config_override if config_override else await cls.get_active_config(master_db)
        provider = config.get("provider", "")
        adapter = cls._adapter(provider)
        return await adapter.test_connection(config)
