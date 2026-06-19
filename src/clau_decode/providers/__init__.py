"""Provider abstraction layer — adapters bridge external AI tools into clau-decode.

Each supported tool (Claude Code, Codex, etc.) ships as a ``ProviderAdapter``
subclass registered via ``providers.registry``.  The server and scanner never
import concrete adapter modules directly; they work against the abstract seam
defined in ``providers.base``.
"""
