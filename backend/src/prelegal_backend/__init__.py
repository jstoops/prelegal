"""Prelegal backend: FastAPI app serving the API and the static frontend."""

import os


def main() -> None:
    """Run the app with uvicorn (`uv run prelegal-backend`)."""
    import logging

    import uvicorn

    # Show the app's own INFO logs (e.g. the database reset) next to uvicorn's.
    logging.basicConfig(level=logging.INFO, format="%(levelname)s:     %(message)s")
    uvicorn.run(
        "prelegal_backend.main:create_app",
        factory=True,
        host=os.environ.get("PRELEGAL_HOST", "127.0.0.1"),
        port=int(os.environ.get("PRELEGAL_PORT", "8000")),
    )
