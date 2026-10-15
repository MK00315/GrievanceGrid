from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="GG_", env_file=".env", extra="ignore")

    database_url: str = "sqlite:///./var/grievancegrid.db"
    jurisdiction_id: str = "demo-municipality"
    jurisdiction_name: str = "Demo municipality (simulated)"
    cors_origins: list[str] = ["http://localhost:3000"]
    session_hours: int = Field(default=8, ge=1, le=24)
    storage_backend: str = "local"
    local_storage_path: Path = Path("var/evidence")
    s3_endpoint_url: str | None = None
    s3_bucket: str = "grievancegrid-evidence"
    s3_region: str = "us-east-1"
    max_image_bytes: int = 8 * 1024 * 1024


@lru_cache
def get_settings() -> Settings:
    return Settings()
