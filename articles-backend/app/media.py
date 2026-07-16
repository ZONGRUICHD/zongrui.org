from __future__ import annotations

import hashlib
import io
import os
import tempfile
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterator

from fastapi import HTTPException, UploadFile
from PIL import Image, ImageOps, UnidentifiedImageError
from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import Settings
from .models import Media


ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP"}


def ensure_media_backup_lock(settings: Settings) -> Path:
    lock_path = settings.media_dir.parent / ".media-backup.lock"
    lock_path.parent.mkdir(parents=True, exist_ok=True, mode=0o750)
    lock_path.touch(mode=0o640, exist_ok=True)
    os.chmod(lock_path, 0o640)
    return lock_path


@contextmanager
def media_backup_lock(settings: Settings) -> Iterator[None]:
    """Serialize media mutations with the database-and-media backup snapshot."""

    lock_path = ensure_media_backup_lock(settings)
    try:
        import fcntl
    except ImportError:  # Windows development and tests do not provide fcntl.
        yield
        return

    with lock_path.open("rb") as lock_file:
        fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(lock_file.fileno(), fcntl.LOCK_UN)


async def process_upload(file: UploadFile, db: Session, settings: Settings) -> Media:
    raw = await file.read(settings.max_upload_bytes + 1)
    if len(raw) > settings.max_upload_bytes:
        raise HTTPException(status_code=413, detail="image exceeds the 10 MiB limit")
    if not raw:
        raise HTTPException(status_code=422, detail="image is empty")

    Image.MAX_IMAGE_PIXELS = settings.max_image_pixels
    try:
        with Image.open(io.BytesIO(raw)) as probe:
            if probe.format not in ALLOWED_FORMATS:
                raise HTTPException(status_code=415, detail="only JPEG, PNG, and WebP images are accepted")
            probe.verify()
        with Image.open(io.BytesIO(raw)) as source:
            source = ImageOps.exif_transpose(source)
            if source.width * source.height > settings.max_image_pixels:
                raise HTTPException(status_code=422, detail="image dimensions are too large")
            source.thumbnail((2000, 2000), Image.Resampling.LANCZOS)
            image = source.convert("RGBA" if source.mode in {"RGBA", "LA"} or "transparency" in source.info else "RGB")
            width, height = image.size
            output = io.BytesIO()
            image.save(output, format="WEBP", quality=88, method=6, exif=b"")
    except HTTPException:
        raise
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as exc:
        raise HTTPException(status_code=422, detail="file is not a valid supported image") from exc

    encoded = output.getvalue()
    digest = hashlib.sha256(encoded).hexdigest()
    existing = db.scalar(select(Media).where(Media.sha256 == digest))
    if existing:
        return existing

    now = datetime.now(timezone.utc)
    relative = Path(now.strftime("%Y/%m")) / f"{digest}.webp"
    destination = (settings.media_dir / relative).resolve()
    media_root = settings.media_dir.resolve()
    if media_root not in destination.parents:
        raise HTTPException(status_code=500, detail="invalid media destination")
    destination.parent.mkdir(parents=True, exist_ok=True, mode=0o750)

    temporary_name: str | None = None
    try:
        with tempfile.NamedTemporaryFile(dir=destination.parent, prefix=".upload-", delete=False) as temporary:
            temporary_name = temporary.name
            temporary.write(encoded)
            temporary.flush()
            os.fsync(temporary.fileno())
        os.chmod(temporary_name, 0o640)
        os.replace(temporary_name, destination)
    finally:
        if temporary_name and os.path.exists(temporary_name):
            os.unlink(temporary_name)

    media = Media(
        path=relative.as_posix(),
        mime_type="image/webp",
        width=width,
        height=height,
        size_bytes=len(encoded),
        sha256=digest,
    )
    db.add(media)
    db.flush()
    return media


def safe_media_path(raw_path: str, settings: Settings) -> Path:
    if not raw_path or "\\" in raw_path:
        raise HTTPException(status_code=404, detail="media not found")
    root = settings.media_dir.resolve()
    candidate = (root / raw_path).resolve()
    if root not in candidate.parents or candidate.suffix.lower() != ".webp":
        raise HTTPException(status_code=404, detail="media not found")
    return candidate
