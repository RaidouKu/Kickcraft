#!/usr/bin/env python3
"""
KickCraft 3D GLB Texture & Brightness Enhancer
Boosts underexposed AI-generated GLB textures (lifting darks, boosting color saturation,
and enhancing contrast) so shoes with black leather, brown gum soles, and subtle details
render with maximum vividness in 3D viewers.
"""

import sys
import os
import json
import struct
import io
from PIL import Image, ImageEnhance


def enhance_glb(glb_path, output_path=None, gamma=0.48, saturation=1.85, contrast=1.15, brightness=1.10):
    if output_path is None:
        output_path = glb_path

    if not os.path.exists(glb_path):
        print(f"Error: {glb_path} does not exist", file=sys.stderr)
        return False

    with open(glb_path, "rb") as f:
        data = f.read()

    if len(data) < 20:
        return False

    magic, ver, length = struct.unpack("<III", data[:12])
    if magic != 0x46546C67:
        print(f"Error: {glb_path} is not a valid GLB", file=sys.stderr)
        return False

    json_len, json_type = struct.unpack("<II", data[12:20])
    gltf = json.loads(data[20:20 + json_len].decode("utf-8"))

    bin_offset = 20 + json_len
    bin_len, bin_type = struct.unpack("<II", data[bin_offset:bin_offset + 8])
    bin_data = bytearray(data[bin_offset + 8:bin_offset + 8 + bin_len])

    if not gltf.get("images"):
        print("No images found in GLB")
        return False

    img_bv_idx = gltf["images"][0]["bufferView"]
    img_bv = gltf["bufferViews"][img_bv_idx]
    img_offset = img_bv.get("byteOffset", 0)
    img_len = img_bv["byteLength"]

    orig_bytes = bin_data[img_offset:img_offset + img_len]
    orig_img = Image.open(io.BytesIO(orig_bytes)).convert("RGB")

    # 1. Non-linear gamma lift: lifts shadows and midtones while keeping white highlights clean
    gamma_table = [int(255 * ((i / 255.0) ** gamma)) for i in range(256)]
    img_g = orig_img.point(gamma_table * 3)

    # 2. Rich color saturation: restores true gum sole brown and leather tones
    img_c = ImageEnhance.Color(img_g).enhance(saturation)

    # 3. Micro-contrast & brightness polish
    img_con = ImageEnhance.Contrast(img_c).enhance(contrast)
    img_final = ImageEnhance.Brightness(img_con).enhance(brightness)

    out_buf = io.BytesIO()
    img_final.save(out_buf, format="JPEG", quality=95)
    new_bytes = out_buf.getvalue()

    # 4-byte alignment
    pad = (4 - (len(new_bytes) % 4)) % 4
    new_bytes += b"\x00" * pad
    delta = len(new_bytes) - img_len

    new_bin = bin_data[:img_offset] + new_bytes + bin_data[img_offset + img_len:]
    img_bv["byteLength"] = len(new_bytes)
    gltf["images"][0]["mimeType"] = "image/jpeg"

    for i, bv in enumerate(gltf["bufferViews"]):
        if i != img_bv_idx and bv.get("byteOffset", 0) > img_offset:
            bv["byteOffset"] = bv.get("byteOffset", 0) + delta

    gltf["buffers"][0]["byteLength"] = len(new_bin)

    new_json_bytes = json.dumps(gltf, separators=(",", ":")).encode("utf-8")
    json_pad = (4 - (len(new_json_bytes) % 4)) % 4
    new_json_bytes += b" " * json_pad

    new_total_len = 12 + 8 + len(new_json_bytes) + 8 + len(new_bin)
    new_header = struct.pack("<III", magic, ver, new_total_len)
    new_json_chunk = struct.pack("<II", len(new_json_bytes), json_type) + new_json_bytes
    new_bin_chunk = struct.pack("<II", len(new_bin), bin_type) + new_bin

    tmp_path = output_path + ".tmp"
    with open(tmp_path, "wb") as f:
        f.write(new_header + new_json_chunk + new_bin_chunk)
    os.replace(tmp_path, output_path)

    print(f"Enhanced {os.path.basename(glb_path)}: {len(data)} -> {new_total_len} bytes")
    return True


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python enhance-glb.py <path_to_glb> [output_path]")
        sys.exit(1)
    target = sys.argv[1]
    out = sys.argv[2] if len(sys.argv) > 2 else None
    success = enhance_glb(target, out)
    sys.exit(0 if success else 1)
