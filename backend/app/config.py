import os

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    lta_account_key: str = ""
    # Vercel's serverless filesystem is read-only except /tmp
    db_path: str = "/tmp/bababus.db" if os.environ.get("VERCEL") else "bababus.db"
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def demo_mode(self) -> bool:
        return not self.lta_account_key


settings = Settings()
