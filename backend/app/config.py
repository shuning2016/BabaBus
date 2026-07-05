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
    # Web Push (VAPID). vapid_private_b64 is base64 of the PKCS8 PEM.
    vapid_public_key: str = ""
    vapid_private_b64: str = ""
    vapid_subject: str = "mailto:shuning2016@gmail.com"
    # shared secret guarding the cron-triggered /api/push/tick endpoint
    push_secret: str = ""
    # OAuth Web client id for "Sign in with Google" (id-token audience check).
    # Public value (safe to commit); an env var of the same name overrides it.
    google_client_id: str = "339749162186-dcimakscdhsigaov376e76fdgoq501lk.apps.googleusercontent.com"
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def demo_mode(self) -> bool:
        return not self.lta_account_key


settings = Settings()
