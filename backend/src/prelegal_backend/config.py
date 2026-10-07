"""Settings read from environment variables, with defaults for local runs."""

import os
from dataclasses import dataclass
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]


@dataclass(frozen=True)
class Settings:
    db_path: Path
    # Not served if missing, e.g. before the first `npm run build`.
    static_dir: Path

    @classmethod
    def from_env(cls) -> "Settings":
        return cls(
            db_path=Path(
                os.environ.get("PRELEGAL_DB_PATH", REPO_ROOT / "backend" / "data" / "prelegal.db")
            ),
            static_dir=Path(
                os.environ.get("PRELEGAL_STATIC_DIR", REPO_ROOT / "frontend" / "out")
            ),
        )
