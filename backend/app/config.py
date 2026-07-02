from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    lta_account_key: str = ""
    db_path: str = "bababus.db"
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def demo_mode(self) -> bool:
        return not self.lta_account_key


settings = Settings()
