"""Web Push sending via VAPID. Private key is base64-of-PEM in settings."""
import base64
import json

from py_vapid import Vapid
from pywebpush import webpush

from .config import settings


def _vapid_key() -> Vapid:
    """Build the VAPID signer from the base64-of-PEM private key.

    pywebpush 2.x sends a bare string through ``Vapid.from_string``, which
    strips newlines and cannot parse PEM armor — so passing the PEM text
    directly raises a deserialization error and every push silently fails.
    Building the ``Vapid`` object ourselves avoids that path.
    """
    pem = base64.b64decode(settings.vapid_private_b64)
    return Vapid.from_pem(pem)


def send_web_push(sub: dict, payload: dict) -> None:
    """Send one push; raises pywebpush.WebPushException on failure."""
    webpush(
        subscription_info={
            "endpoint": sub["endpoint"],
            "keys": {"p256dh": sub["p256dh"], "auth": sub["auth"]},
        },
        data=json.dumps(payload),
        vapid_private_key=_vapid_key(),
        vapid_claims={"sub": settings.vapid_subject},
    )
