"""
Extension Manager - Load, register, and execute NexusMind extensions.
Extensions are Python packages placed in the extensions/installed directory.
Each extension must have a manifest.json and an entry-point module.
"""
from __future__ import annotations

import os
import sys
import json
import importlib.util
from typing import Any, Callable, Optional
from pathlib import Path

from app.core.config import settings


class ExtensionHook:
    """Registry for extension hooks."""
    _hooks: dict[str, list[Callable]] = {}

    def register(self, event: str, callback: Callable):
        self._hooks.setdefault(event, []).append(callback)

    async def emit(self, event: str, *args, **kwargs) -> list[Any]:
        results = []
        for cb in self._hooks.get(event, []):
            try:
                import asyncio
                if asyncio.iscoroutinefunction(cb):
                    results.append(await cb(*args, **kwargs))
                else:
                    results.append(cb(*args, **kwargs))
            except Exception as e:
                results.append({"error": str(e)})
        return results


hooks = ExtensionHook()


class ExtensionManager:
    def __init__(self):
        self._loaded: dict[str, Any] = {}
        self._path = Path(settings.EXTENSIONS_PATH) / "installed"
        self._path.mkdir(parents=True, exist_ok=True)

    def load_all(self):
        """Load all enabled extensions from the filesystem."""
        for ext_dir in self._path.iterdir():
            if not ext_dir.is_dir():
                continue
            manifest_path = ext_dir / "manifest.json"
            if not manifest_path.exists():
                continue
            try:
                self.load_extension(ext_dir.name)
            except Exception as e:
                print(f"[ExtensionManager] Failed to load {ext_dir.name}: {e}")

    def load_extension(self, slug: str) -> bool:
        ext_dir = self._path / slug
        manifest_path = ext_dir / "manifest.json"
        if not manifest_path.exists():
            raise FileNotFoundError(f"No manifest.json in {ext_dir}")

        with open(manifest_path) as f:
            manifest = json.load(f)

        entry_point = manifest.get("entry_point", "main.py")
        entry_file = ext_dir / entry_point

        if not entry_file.exists():
            raise FileNotFoundError(f"Entry point {entry_file} not found")

        spec = importlib.util.spec_from_file_location(f"nexusmind_ext_{slug}", entry_file)
        module = importlib.util.module_from_spec(spec)
        sys.modules[f"nexusmind_ext_{slug}"] = module
        spec.loader.exec_module(module)

        if hasattr(module, "setup"):
            module.setup(hooks)

        self._loaded[slug] = {"module": module, "manifest": manifest}
        return True

    def unload_extension(self, slug: str) -> bool:
        if slug not in self._loaded:
            return False
        mod = self._loaded[slug]["module"]
        if hasattr(mod, "teardown"):
            try:
                mod.teardown()
            except Exception:
                pass
        del self._loaded[slug]
        sys.modules.pop(f"nexusmind_ext_{slug}", None)
        return True

    def list_loaded(self) -> list[dict]:
        result = []
        for slug, data in self._loaded.items():
            m = data["manifest"]
            result.append({
                "slug": slug,
                "name": m.get("name", slug),
                "version": m.get("version", "unknown"),
                "description": m.get("description", ""),
                "author": m.get("author", ""),
            })
        return result

    def get_manifest(self, slug: str) -> Optional[dict]:
        manifest_path = self._path / slug / "manifest.json"
        if not manifest_path.exists():
            return None
        with open(manifest_path) as f:
            return json.load(f)

    def install_from_zip(self, zip_bytes: bytes, slug: str) -> bool:
        """Install extension from a zip archive."""
        import zipfile
        import io
        target = self._path / slug
        target.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(io.BytesIO(zip_bytes)) as z:
            z.extractall(target)
        return self.load_extension(slug)


extension_manager = ExtensionManager()
