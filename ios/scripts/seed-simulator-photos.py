#!/usr/bin/env python3
"""Add 16 synthetic PNGs to an explicitly selected simulator; never clear its library.

Usage: python3 ios/scripts/seed-simulator-photos.py <SIMULATOR-UDID>
Uses only Python's standard library and Xcode's simctl. Temporary files are removed.
"""

import struct
import subprocess
import sys
import tempfile
import zlib
from pathlib import Path


def chunk(kind, data):
    return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))


def photo(index):
    width, height = 480, 640
    rows = bytearray()
    for y in range(height):
        rows.append(0)  # PNG row filter: none.
        for x in range(width):
            color = (45 + index * 9, 40 + index * 4, 105 + index * 5)
            if x < 150:
                color = (255, 200, 30)
            elif x >= 250 and y >= 320:
                color = (40, 195, 130)
            rows.extend(color)
    header = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", zlib.compress(rows)) + chunk(b"IEND", b"")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    with tempfile.TemporaryDirectory(prefix="collage-picker-") as directory:
        paths = []
        for index in range(1, 17):
            path = Path(directory) / f"synthetic-collage-{index:02}.png"
            path.write_bytes(photo(index))
            paths.append(str(path))
        subprocess.run(["xcrun", "simctl", "addmedia", sys.argv[1], *paths], check=True)
    print("Added 16 synthetic images. No existing photos were removed.")
