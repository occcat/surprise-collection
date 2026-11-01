"""X's filled bookmark in its bookmarked blue, with the effect's three sparks flying out below it,
on a dark rounded square: the moment the effect ends. The background matches Grok Usage Floating's
icon. 16 px drops the sparks, which would only read as specks at that size.
Run: python3 scripts/icons.py"""
from __future__ import annotations

import math
import struct
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "icons"
OUT.mkdir(exist_ok=True)

BG = (15, 15, 15)
BLUE = (29, 155, 240)


def png_rgba(px: bytearray, size: int) -> bytes:
    stride = size * 4
    raw = b"".join(b"\x00" + bytes(px[y * stride:(y + 1) * stride]) for y in range(size))

    def chunk(tag: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    return b"".join(
        [
            b"\x89PNG\r\n\x1a\n",
            chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)),
            chunk(b"IDAT", zlib.compress(raw, 9)),
            chunk(b"IEND", b""),
        ]
    )


# Each shape is an inside test. Pixels are sampled on a grid, so edges come out antialiased.
def round_rect(x0: float, y0: float, x1: float, y1: float, r: float):
    cx, cy, hx, hy = (x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) / 2 - r, (y1 - y0) / 2 - r

    def inside(x: float, y: float) -> bool:
        qx, qy = abs(x - cx) - hx, abs(y - cy) - hy
        return math.hypot(max(qx, 0), max(qy, 0)) + min(max(qx, qy), 0) - r <= 0

    return inside


def seg_dist(px: float, py: float, ax: float, ay: float, bx: float, by: float) -> float:
    vx, vy = bx - ax, by - ay
    h = max(0.0, min(1.0, ((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy or 1)))
    return math.hypot(px - ax - vx * h, py - ay - vy * h)


def bookmark(x0: float, x1: float, top: float, r: float, bottom: float, notch: float):
    """X's bookmark shape: rounded top corners, straight sides, a notch cut up into the bottom."""
    cx = (x0 + x1) / 2
    corners = round_rect(x0, top, x1, bottom + r * 2, r)

    def inside(x: float, y: float) -> bool:
        if not (x0 <= x <= x1 and top <= y <= bottom) or not corners(x, y):
            return False
        # Below the line from each bottom corner up to the notch is outside.
        k = (bottom - notch) / (cx - x0)
        return y <= notch + k * abs(x - cx)

    return inside


def spark(ax: float, ay: float, bx: float, by: float, w: float):
    return lambda x, y: seg_dist(x, y, ax, ay, bx, by) <= w / 2


def layers(size: int) -> list:
    out = [(round_rect(0, 0, size, size, size * 0.22), BG)]
    if size <= 16:
        # The 24-unit glyph, 12 px tall, on whole pixels: x 4–12, y 2–14.
        out.append((bookmark(4, 12, 2, 1.25, 14, 10.6), BLUE))
        return out
    # The 24-unit glyph sits in a 32-unit box, leaving room for the sparks below it.
    u = size / 32
    ox, oy = 4 * u, 1.2 * u
    glyph = bookmark(4 * u, 20 * u, 2 * u, 2.5 * u, 22.94 * u, 17.23 * u)
    out.append((lambda x, y: glyph(x - ox, y - oy), BLUE))
    w = 2.1 * u
    for ax, ay, bx, by in ((2.3, 24.9, 0.6, 26.6), (12, 21.4, 12, 24.6), (21.7, 24.9, 23.4, 26.6)):
        out.append((spark(ax * u + ox, ay * u + oy, bx * u + ox, by * u + oy, w), BLUE))
    return out


def icon(size: int) -> bytes:
    ss = 8 if size <= 48 else 4
    n = ss * ss
    px = bytearray(size * size * 4)
    shapes = layers(size)
    for j in range(size):
        for i in range(size):
            r = g = b = a = 0.0
            for inside, col in shapes:
                cov = sum(inside(i + (si + 0.5) / ss, j + (sj + 0.5) / ss) for sj in range(ss) for si in range(ss)) / n
                if cov:
                    r, g, b = (col[0] * cov + r * (1 - cov), col[1] * cov + g * (1 - cov), col[2] * cov + b * (1 - cov))
                    a = cov + a * (1 - cov)
            if a:
                k = (j * size + i) * 4
                px[k:k + 4] = bytes((round(r / a), round(g / a), round(b / a), round(a * 255)))
    return png_rgba(px, size)


for n in (16, 32, 48, 128):
    (OUT / f"{n}.png").write_bytes(icon(n))
print("icons written")
