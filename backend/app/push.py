"""Web Push sending via VAPID. Private key is base64-of-PEM in settings."""
import base64
import json

from pywebpush import webpush

from .config import settings


def _private_pem() -> str:
    return base64.b64decode(settings.vapid_private_b64).decode()


def send_web_push(sub: dict, payload: dict) -> None:
    """Send one push; raises pywebpush.WebPushException on failure."""
    webpush(
        subscription_info={
            "endpoint": sub["endpoint"],
            "keys": {"p256dh": sub["p256dh"], "auth": sub["auth"]},
        },
        data=json.dumps(payload),
        vapid_private_key=_private_pem(),
        vapid_claims={"sub": settings.vapid_subject},
    )
