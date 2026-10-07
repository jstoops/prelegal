"""Settings read from environment variables, with defaults for local runs."""

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

REPO_ROOT = Path(__file__).resolve().parents[3]


@dataclass(frozen=True)
class Settings:
    db_path: Path
    # Not served if missing, e.g. before the first `npm run build`.
    static_dir: Path
    # Without it the AI chat answers 503.
    openrouter_api_key: str | None = None

    @classmethod
    def from_env(cls) -> "Settings":
        # Local runs read the repo's .env; real environment variables (e.g.
        # Docker's --env-file) take precedence.
        load_dotenv(REPO_ROOT / ".env", override=False)
        return cls(
            db_path=Path(
                os.environ.get("PRELEGAL_DB_PATH", REPO_ROOT / "backend" / "data" / "prelegal.db")
            ),
            static_dir=Path(
                os.environ.get("PRELEGAL_STATIC_DIR", REPO_ROOT / "frontend" / "out")
            ),
            openrouter_api_key=os.environ.get("OPENROUTER_API_KEY") or None,
        )
