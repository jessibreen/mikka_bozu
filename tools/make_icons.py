#!/usr/bin/env python3
"""Regenerate the app icons. Not part of the app: run only if you change the design.

    python3 tools/make_icons.py

Pure standard library (no Pillow). Draws three circles on a paper background:
two filled, the third outlined, i.e. "today is Day 3".
"""
import os
import struct
import zlib

BG = (245, 241, 234)      # #f5f1ea
ACCENT = (201, 70, 44)    # #c9462c
SS = 4                    # supersampling per axis, for smooth edges


def coverage(u, v):
    """Is the point (u, v) in unit-square coordinates covered by the accent color?"""
    r = 0.105
    for i, cx in enumerate((0.23, 0.5, 0.77)):
        d2 = (u - cx) ** 2 + (v - 0.5) ** 2
        if i < 2:
            if d2 <= r * r:
                return True
        else:
            inner = r - 0.026
            if inner * inner <= d2 <= r * r:
                return True
    return False


def render(size):
    rows = []
    n = SS * SS
    for y in range(size):
        row = bytearray([0])  # PNG filter type 0
        for x in range(size):
            hits = 0
            for sy in range(SS):
                v = (y + (sy + 0.5) / SS) / size
                for sx in range(SS):
                    u = (x + (sx + 0.5) / SS) / size
                    if coverage(u, v):
                        hits += 1
            a = hits / n
            row += bytes(round(BG[c] + (ACCENT[c] - BG[c]) * a) for c in range(3))
        rows.append(bytes(row))
    return b"".join(rows)


def chunk(kind, data):
    body = kind + data
    return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)


def write_png(path, size):
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)  # 8-bit RGB, opaque
    png = (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr)
           + chunk(b"IDAT", zlib.compress(render(size), 9)) + chunk(b"IEND", b""))
    with open(path, "wb") as f:
        f.write(png)
    print(f"{path}  {size}x{size}  {len(png)} bytes")


if __name__ == "__main__":
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "icons")
    os.makedirs(out, exist_ok=True)
    write_png(os.path.join(out, "apple-touch-icon.png"), 180)
    write_png(os.path.join(out, "icon-192.png"), 192)
    write_png(os.path.join(out, "icon-512.png"), 512)
