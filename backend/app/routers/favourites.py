from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from .. import db
from ..deps import get_owner

router = APIRouter(prefix="/api/favourites")


class FavouriteIn(BaseModel):
    stop_id: str
    custom_name: str
    group_name: str = "Going out"
    service_no: str | None = None  # set → a favourited bus, not a stop


class RenameIn(BaseModel):
    custom_name: str


@router.get("")
def list_all(owner: str = Depends(get_owner)):
    return {"favourites": db.list_favourites(owner)}


@router.post("")
def create(fav: FavouriteIn, owner: str = Depends(get_owner)):
    fav_id = db.add_favourite(
        fav.stop_id, fav.custom_name, fav.group_name, fav.service_no, owner=owner
    )
    return {"id": fav_id, **fav.model_dump()}


@router.patch("/{fav_id}")
def rename(fav_id: int, body: RenameIn, owner: str = Depends(get_owner)):
    if not db.rename_favourite(fav_id, body.custom_name, owner):
        raise HTTPException(404, "Favourite not found")
    return {"ok": True}


@router.delete("/{fav_id}")
def remove(fav_id: int, owner: str = Depends(get_owner)):
    if not db.delete_favourite(fav_id, owner):
        raise HTTPException(404, "Favourite not found")
    return {"ok": True}
