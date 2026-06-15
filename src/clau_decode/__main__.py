"""Module entry point so ``python -m clau_decode`` runs the app.

Mirrors the ``clau-decode`` console script (``clau_decode.cli:main``). Handy for
running straight from a checkout (``uv run python -m clau_decode``) without a
global install.
"""

from .cli import main

if __name__ == "__main__":
    main()
