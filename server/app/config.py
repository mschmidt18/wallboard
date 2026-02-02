from pathlib import Path
from dataclasses import dataclass


@dataclass
class Config:
    db_path: Path
    secret_key_path: Path
    log_path: Path
    log_level: str = "INFO"
    display_refresh_interval: int = 60

    @classmethod
    def default(cls) -> "Config":
        wallboard_dir = Path.home() / ".wallboard"
        return cls(
            db_path=wallboard_dir / "wallboard.db",
            secret_key_path=wallboard_dir / "secret.key",
            log_path=Path("/var/log/wallboard/wallboard.log"),
        )

    @classmethod
    def for_testing(cls, tmp_path: Path) -> "Config":
        return cls(
            db_path=tmp_path / "test.db",
            secret_key_path=tmp_path / "secret.key",
            log_path=tmp_path / "wallboard.log",
        )
