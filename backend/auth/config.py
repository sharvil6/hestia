import os


def _env(key: str, default: str) -> str:
    return os.environ.get(key, default)


def _env_bool(key: str, default: bool) -> bool:
    raw = os.environ.get(key)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _env_int(key: str, default: int) -> int:
    raw = os.environ.get(key)
    if raw is None or raw.strip() == "":
        return default
    return int(raw)


PUBLIC_URL = _env("HESTIA_PUBLIC_URL", "http://localhost:3000")
COOKIE_NAME = _env("HESTIA_COOKIE_NAME", "hestia_session")
COOKIE_DOMAIN = os.environ.get("HESTIA_COOKIE_DOMAIN") or None
COOKIE_SECURE = _env_bool("HESTIA_COOKIE_SECURE", False)
COOKIE_SAMESITE = _env("HESTIA_COOKIE_SAMESITE", "lax")

SESSION_TTL_DAYS = _env_int("HESTIA_SESSION_TTL_DAYS", 30)
INVITE_TTL_DAYS = _env_int("HESTIA_INVITE_TTL_DAYS", 7)
CHALLENGE_TTL_SECONDS = _env_int("HESTIA_CHALLENGE_TTL_SECONDS", 300)

# Demo mode: when on, the two Gemini-vision endpoints are disabled and an
# anonymous one-click /auth/demo-login is enabled. Only ever set on the separate
# demo deployment, which runs against its own throwaway DB — never in prod.
DEMO_MODE = _env_bool("HESTIA_DEMO_MODE", False)
# Stable id for the shared demo account so seed/reset scripts and /auth/demo-login
# agree on which user to use, without needing a schema flag.
DEMO_USER_ID = _env("HESTIA_DEMO_USER_ID", "demo")

# WebAuthn relying-party config.
# RP_ID must be the registrable domain (no scheme, no port). localhost is allowed in dev.
RP_ID = _env("HESTIA_RP_ID", "localhost")
RP_NAME = _env("HESTIA_RP_NAME", "Hestia")
# EXPECTED_ORIGIN must include scheme; multiple comma-separated origins are supported for dev.
EXPECTED_ORIGINS = [o.strip() for o in _env("HESTIA_EXPECTED_ORIGINS", "http://localhost:3000").split(",") if o.strip()]
