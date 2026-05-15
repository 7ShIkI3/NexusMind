from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone

from app.core.database import get_db
from app.models.extension import Extension
from app.core.extension_manager import extension_manager, hooks

router = APIRouter(prefix="/extensions", tags=["extensions"])


class ExtensionConfig(BaseModel):
    config: dict = {}
    enabled: Optional[bool] = None


@router.get("/")
def list_extensions(db: Session = Depends(get_db)):
    db_exts = db.query(Extension).all()
    db_by_slug = {e.slug: e for e in db_exts}

    changed = False
    for installed in extension_manager.list_installed_manifests():
        slug = installed["slug"]
        manifest = installed["manifest"]
        ext = db_by_slug.get(slug)
        if ext is None:
            ext = Extension(
                name=manifest.get("name", slug),
                slug=slug,
                version=manifest.get("version", "1.0.0"),
                description=manifest.get("description"),
                author=manifest.get("author"),
                entry_point=manifest.get("entry_point", "main.py"),
                enabled=True,
            )
            db.add(ext)
            db_by_slug[slug] = ext
            changed = True
            continue

        updated = False
        for field, value in (
            ("name", manifest.get("name", ext.name)),
            ("version", manifest.get("version", ext.version)),
            ("description", manifest.get("description", ext.description)),
            ("author", manifest.get("author", ext.author)),
            ("entry_point", manifest.get("entry_point", ext.entry_point)),
        ):
            if getattr(ext, field) != value:
                setattr(ext, field, value)
                updated = True
        changed = changed or updated

    if changed:
        db.commit()
        db_exts = db.query(Extension).all()

    loaded = {e["slug"]: e for e in extension_manager.list_loaded()}
    return [
        {
            "id": e.id, "name": e.name, "slug": e.slug, "version": e.version,
            "description": e.description, "author": e.author,
            "enabled": e.enabled, "tags": e.tags or [],
            "loaded": e.slug in loaded,
            "installed_at": e.installed_at,
        }
        for e in db_exts
    ]


@router.post("/{slug}/toggle")
def toggle_extension(slug: str, db: Session = Depends(get_db)):
    ext = db.query(Extension).filter(Extension.slug == slug).first()
    if not ext:
        raise HTTPException(404, "Extension not found")
    ext.enabled = not ext.enabled
    ext.updated_at = datetime.now(timezone.utc)
    db.commit()

    if ext.enabled:
        try:
            extension_manager.load_extension(slug)
        except Exception as e:
            raise HTTPException(500, f"Failed to load: {e}")
    else:
        extension_manager.unload_extension(slug)

    return {"slug": slug, "enabled": ext.enabled}


@router.put("/{slug}/config")
def update_config(slug: str, data: ExtensionConfig, db: Session = Depends(get_db)):
    ext = db.query(Extension).filter(Extension.slug == slug).first()
    if not ext:
        raise HTTPException(404, "Extension not found")
    if data.config:
        ext.config = data.config
    if data.enabled is not None:
        ext.enabled = data.enabled
    ext.updated_at = datetime.now(timezone.utc)
    db.commit()
    return {"updated": True}


@router.delete("/{slug}")
def uninstall_extension(slug: str, db: Session = Depends(get_db)):
    ext = db.query(Extension).filter(Extension.slug == slug).first()
    if not ext:
        raise HTTPException(404, "Not found")
    extension_manager.unload_extension(slug)
    db.delete(ext)
    db.commit()
    return {"uninstalled": slug}


@router.get("/hooks/events")
def list_hooks():
    return {"events": list(hooks._hooks.keys())}
