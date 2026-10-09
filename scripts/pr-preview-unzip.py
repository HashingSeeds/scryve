"""
why: the pr-preview publish job holds the Expo token, and the artifact it unpacks was written by a
job that ran the PR's dependencies. Every entry is checked before anything is written, and files
land only inside a new destination directory. Run with `python3 -I`.

Usage: python3 -I scripts/pr-preview-unzip.py <artifact.zip> <new destination dir>
"""

import shutil
import stat
import sys
import zipfile
from pathlib import Path

MAX_ENTRIES = 5000
MAX_TOTAL_BYTES = 200 * 1024 * 1024


def segments(info: zipfile.ZipInfo) -> list[str]:
    name = info.filename
    if name.startswith("/") or "\\" in name or ":" in name or "\0" in name:
        raise ValueError(f"unsafe entry name: {name!r}")
    parts = (name[:-1] if info.is_dir() else name).split("/")
    if any(part in ("", ".", "..") for part in parts):
        raise ValueError(f"unsafe entry name: {name!r}")
    # Zip writers often store permission bits with no file type, which means a regular file.
    kind = stat.S_IFMT(info.external_attr >> 16)
    if kind and kind != (stat.S_IFDIR if info.is_dir() else stat.S_IFREG):
        raise ValueError(f"not a regular file: {name!r}")
    return parts


def unzip(archive: str, destination: str) -> None:
    with zipfile.ZipFile(archive) as zf:
        entries = zf.infolist()
        if len(entries) > MAX_ENTRIES:
            raise ValueError(f"{len(entries)} entries is more than {MAX_ENTRIES}")
        if sum(info.file_size for info in entries) > MAX_TOTAL_BYTES:
            raise ValueError(f"more than {MAX_TOTAL_BYTES} bytes uncompressed")
        files = [(info, segments(info)) for info in entries if not info.is_dir()]

        root = Path(destination)
        root.mkdir()
        root = root.resolve()
        for info, parts in files:
            target = root.joinpath(*parts)
            target.parent.mkdir(parents=True, exist_ok=True)
            if not target.parent.resolve().is_relative_to(root):
                raise ValueError(f"entry escapes the destination: {info.filename!r}")
            with zf.open(info) as source, open(target, "xb") as sink:
                shutil.copyfileobj(source, sink)


if __name__ == "__main__":
    try:
        unzip(sys.argv[1], sys.argv[2])
    except (ValueError, OSError, zipfile.BadZipFile) as error:
        print(f"::error::{error}", file=sys.stderr)
        sys.exit(1)
