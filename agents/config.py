"""Central configuration for REJECT agents.

Single source of truth for the Gemini model and backend wiring. Both were
previously hardcoded in ~10 places, so a model retirement (e.g. gemini-2.0-flash
being sunset) silently took down the entire agent tier in production while the
frontend masked it with a fallback string. Keep these here so the next change
is one line.
"""

import os

# The Gemini model every agent uses. Override with the GEMINI_MODEL env var.
# gemini-2.0-flash was retired by Google ("no longer available") — do NOT pin a
# model that Google can sunset without warning. gemini-2.5-flash is the current
# stable flash model.
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

# Backend (Node/Express API) URL. The agent tier calls this for memory, tracker,
# knowledge base, and interview-flywheel persistence. If unset in production it
# defaults to localhost and every persistence call silently fails.
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8787")


def assert_production_config() -> None:
    """Fail fast if production is misconfigured.

    Called at server startup. A broken BACKEND_URL or a missing model would
    otherwise degrade silently (swallowed exceptions / frontend fallbacks)
    rather than surfacing as a visible failure.
    """
    env = os.getenv("ENV") or os.getenv("RAILWAY_ENVIRONMENT") or os.getenv("NODE_ENV")
    if env == "production":
        if "localhost" in BACKEND_URL or "127.0.0.1" in BACKEND_URL:
            raise RuntimeError(
                "BACKEND_URL points to localhost in production "
                f"({BACKEND_URL!r}). Memory, tracker, knowledge base, and "
                "interview intelligence will all silently fail. Set BACKEND_URL "
                "to the deployed Node API URL on the agents service."
            )
