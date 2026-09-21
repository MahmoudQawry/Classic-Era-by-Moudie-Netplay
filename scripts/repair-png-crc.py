#!/usr/bin/env python3
"""Repair PNG chunk CRCs without changing image pixels.

The app icon is a binary asset. This guard fixes CRC corruption introduced by
an upload/transport layer while preserving every PNG chunk payload exactly.
It fails loudly if the PNG is truncated or structurally invalid.
"""
from __future__ import annotations

import struct
import sys
import zlib
from pathlib import Path

PNG_SIG = b"\x89PNG\r\n\x1a\n"


def repair(path: Path) -> None:
    data = path.read_bytes()
    if not data.startswith(PNG_SIG):
        raise SystemExit(f"{path}: invalid PNG signature")
    pos = len(PNG_SIG)
    chunks: list[tuple[bytes, bytes, int, int]] = []
    idat = bytearray()
    seen_iend = False

    while pos < len(data):
        if pos + 12 > len(data):
            raise SystemExit(f"{path}: truncated PNG chunk header at byte {pos}")
        length = struct.unpack(">I", data[pos:pos + 4])[0]
        end = pos + 12 + length
        if end > len(data):
            raise SystemExit(f"{path}: truncated PNG chunk payload at byte {pos}")
        kind = data[pos + 4:pos + 8]
        payload = data[pos + 8:pos + 8 + length]
        stored_crc = struct.unpack(">I", data[pos + 8 + length:end])[0]
        calculated_crc = zlib.crc32(kind + payload) & 0xFFFFFFFF
        chunks.append((kind, payload, stored_crc, calculated_crc))
        if kind == b"IDAT":
            idat.extend(payload)
        if kind == b"IEND":
            seen_iend = True
            if length != 0:
                raise SystemExit(f"{path}: IEND chunk is malformed")
            if end != len(data):
                raise SystemExit(f"{path}: data exists after IEND")
        pos = end

    if not seen_iend:
        raise SystemExit(f"{path}: missing IEND chunk")
    if not chunks or chunks[0][0] != b"IHDR":
        raise SystemExit(f"{path}: missing IHDR as first chunk")
    if not idat:
        raise SystemExit(f"{path}: missing IDAT data")

    try:
        zlib.decompress(bytes(idat))
    except zlib.error as exc:
        raise SystemExit(f"{path}: IDAT zlib stream is corrupt: {exc}") from exc

    changed = any(stored != calculated for _, _, stored, calculated in chunks)
    if changed:
        out = bytearray(PNG_SIG)
        for kind, payload, _stored, calculated in chunks:
            out += struct.pack(">I", len(payload))
            out += kind
            out += payload
            out += struct.pack(">I", calculated)
        path.write_bytes(out)
        print(f"Repaired PNG CRCs: {path}")
    else:
        print(f"PNG CRCs already valid: {path}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("usage: repair-png-crc.py <png>")
    repair(Path(sys.argv[1]))
