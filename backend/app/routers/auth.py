import time
import uuid

import httpx
from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from .. import db
from ..config import settings

router = APIRouter(prefix="/api/auth")

GOOGLE_TOKENINFO = "https://oauth2.googleapis.com/tokeninfo"


class GoogleIn(BaseModel):
    credential: str  # Google Identity Services ID token (JWT)


def _verify_google(credential: str) -> dict:
    """Validate a Google ID token and return its claims. Raises on failure."""
    if not settings.google_client_id:
        raise HTTPException(503, "Google sign-in is not configured")
    try:
        res = httpx.get(GOOGLE_TOKENINFO, params={"id_token": credential}, timeout=10)
    except Exception:
        raise HTTPException(502, "Could not reach Google")
    if res.status_code != 200:
        raise HTTPException(401, "Invalid Google token")
    claims = res.json()
    if claims.get("aud") != settings.google_client_id:
        raise HTTPException(401, "Token audience mismatch")
    if str(claims.get("email_verified")).lower() != "true":
        raise HTTPException(401, "Email not verified")
    return claims


def _bearer(authorization: str | None) -> str | None:
    if authorization and authorization.lower().startswith("bearer "):
        return authorization[7:].strip()
    return None


def _account_public(acc: dict) -> dict:
    return {"name": acc.get("name"), "email": acc.get("email"), "image": acc.get("image")}


@router.post("/google")
def google_signin(body: GoogleIn, x_device_id: str | None = Header(default=None)):
    claims = _verify_google(body.credential)
    now = int(time.time())
    account_id = db.upsert_account(
        new_id=uuid.uuid4().hex,
        provider="google",
        provider_uid=claims["sub"],
        email=claims.get("email"),
        name=claims.get("name") or claims.get("email"),
        image=claims.get("picture"),
        created_at=now,
    )
    # Move this device's anonymous favourites/alarms/subscriptions into the account.
    if x_device_id:
        db.migrate_owner(x_device_id, account_id)
    token = uuid.uuid4().hex
    db.create_session(token, account_id, now)
    return {"token": token, "account": _account_public(db.get_account(account_id))}


@router.get("/me")
def me(authorization: str | None = Header(default=None)):
    account_id = db.get_session_account_id(_bearer(authorization) or "")
    acc = db.get_account(account_id) if account_id else None
    if not acc:
        raise HTTPException(401, "Not signed in")
    return {"account": _account_public(acc)}


@router.post("/logout")
def logout(authorization: str | None = Header(default=None)):
    token = _bearer(authorization)
    if token:
        db.delete_session(token)
    return {"ok": True}
