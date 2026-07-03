import os

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    lta_account_key: str = ""
    # Vercel's serverless filesystem is read-only except /tmp
    db_path: str = "/tmp/bababus.db" if os.environ.get("VERCEL") else "bababus.db"
    # Hosted DB (Turso/libSQL over HTTP); when set, favourites/alarms persist
    # across serverless instances instead of dying with the ephemeral /tmp file
    turso_url: str = ""
    turso_token: str = ""
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def demo_mode(self) -> bool:
        return not self.lta_account_key


settings = Settings()
