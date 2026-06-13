"""Shared spawn-environment construction for claude-compatible binaries.

Centralises the "strip API-key vars or pass them through?" decision so all
PTY-backed spawn sites apply identical rules.

Decision matrix
---------------

``authMethod`` returned by ``<bin> auth status``:

- ``"claude.ai"`` — subscription auth. Strip ``ANTHROPIC_API_KEY`` and
  ``ANTHROPIC_AUTH_TOKEN`` from the spawn env, even if the user set them.
  This is the original billing safeguard: a stale env var would silently
  re-route traffic to an API account the user may not have intended to bill.
- ``"api_key"`` — pass everything through. The binary is self-aware that it
  uses API key auth; both the env key and any other config it cares about
  should reach the spawn.
- ``"none"`` / probe failure / unknown — pass everything through. The probe
  is unreliable for env-based wrappers (e.g. cc-mirror's ``zai``, which
  unsets the token before the probe runs, so the probe never sees it as
  ``api_key``). Stripping here would break the wrapper's only authentication
  path. The trade-off: a user with ``ANTHROPIC_API_KEY`` exported and a
  binary that reports ``"none"`` will route to that key — but that requires
  the user to have explicitly exported the key, which is their signal.
"""

from __future__ import annotations

import asyncio
import json as _json
import os
from typing import Final

_SUBSCRIPTION_BLOCKED_ENV: Final = frozenset(
    {"ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN"}
)

_AUTH_PROBE_TIMEOUT_S: Final = 5.0


def _subscription_env() -> dict[str, str]:
    """Pure strip helper: ``os.environ`` minus the API-key vars.

    Exposed for tests and as a primitive for ``spawn_env``. Direct callers
    outside tests should prefer ``spawn_env(bin_name)`` so the strip is
    gated by the binary's actual auth method.
    """
    return {
        k: v for k, v in os.environ.items() if k not in _SUBSCRIPTION_BLOCKED_ENV
    }


async def _bin_auth_method(bin_name: str) -> str:
    """Probe ``<bin_name> auth status`` for its ``authMethod`` string.

    Returns the method name (``"claude.ai"`` / ``"api_key"`` / ``"none"``)
    or ``""`` on any probe failure (spawn error, non-zero exit, JSON parse
    failure, or timeout). Callers must treat ``""`` and ``"none"`` the same.

    Inherits the full parent env so the probe can see any API key the user
    has exported — some wrappers report ``"api_key"`` when a key is present
    and ``"none"`` otherwise.
    """
    try:
        proc = await asyncio.create_subprocess_exec(
            bin_name,
            "auth",
            "status",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
    except (FileNotFoundError, PermissionError):
        return ""
    try:
        stdout, _stderr = await asyncio.wait_for(
            proc.communicate(), timeout=_AUTH_PROBE_TIMEOUT_S
        )
    except asyncio.TimeoutError:
        proc.kill()
        return ""
    if proc.returncode != 0:
        return ""
    try:
        data = _json.loads(stdout.decode("utf-8", errors="replace"))
    except _json.JSONDecodeError:
        return ""
    method = data.get("authMethod") if isinstance(data, dict) else None
    return str(method) if isinstance(method, str) else ""


async def spawn_env(bin_name: str) -> dict[str, str]:
    """Build the spawn env for ``bin_name``.

    See module docstring for the strip/keep decision matrix. The returned
    dict starts from ``os.environ`` and is safe to mutate (it's a copy).
    """
    auth_method = await _bin_auth_method(bin_name)
    if auth_method == "claude.ai":
        return _subscription_env()
    return dict(os.environ)
