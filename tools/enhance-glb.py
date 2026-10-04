#!/usr/bin/env python3
"""
KickCraft 3D GLB Texture, Brightness & Smooth Normals Enhancer
1. Boosts texture colors, lifts darks, and enriches gum-sole brown and leather blacks.
2. Computes smooth vertex normals for faceted meshes (e.g. from ZeroGPU/TRELLIS),
   eliminating origami-like polygon faces and rendering curved organic shoe surfaces.
3. Sets realistic PBR material properties (roughness 0.82 for matte leather/rubber,
   metallic 0.0) avoiding mirror/chrome facet artifacts.
"""

import sys
import os
import json
import struct
import io
import math
from PIL import Image, ImageEnhance


def enhance_glb(glb_path, output_path=None, gamma=0.50, saturation=1.80, contrast=1.15, brightness=1.10):
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

    # 1. Texture enhancement
    if gltf.get("images"):
        img_bv_idx = gltf["images"][0]["bufferView"]
        img_bv = gltf["bufferViews"][img_bv_idx]
        img_offset = img_bv.get("byteOffset", 0)
        img_len = img_bv["byteLength"]

        orig_bytes = bin_data[img_offset:img_offset + img_len]
        orig_img = Image.open(io.BytesIO(orig_bytes)).convert("RGB")

        # Non-linear gamma lift for shadow visibility
        gamma_table = [int(255 * ((i / 255.0) ** gamma)) for i in range(256)]
        img_g = orig_img.point(gamma_table * 3)

        # Rich color saturation (brown gum sole & accents)
        img_c = ImageEnhance.Color(img_g).enhance(saturation)

        # Micro-contrast & brightness polish
        img_con = ImageEnhance.Contrast(img_c).enhance(contrast)
        img_final = ImageEnhance.Brightness(img_con).enhance(brightness)

        out_buf = io.BytesIO()
        img_final.save(out_buf, format="JPEG", quality=95)
        new_bytes = out_buf.getvalue()

        # 4-byte alignment
        pad = (4 - (len(new_bytes) % 4)) % 4
        new_bytes += b"\x00" * pad
        delta = len(new_bytes) - img_len

        bin_data = bin_data[:img_offset] + new_bytes + bin_data[img_offset + img_len:]
        img_bv["byteLength"] = len(new_bytes)
        gltf["images"][0]["mimeType"] = "image/jpeg"

        for i, bv in enumerate(gltf["bufferViews"]):
            if i != img_bv_idx and bv.get("byteOffset", 0) > img_offset:
                bv["byteOffset"] = bv.get("byteOffset", 0) + delta

    # 2. Material PBR tuning: Matte leather & rubber (not chrome or shiny plastic)
    for mat in gltf.get("materials", []):
        pbr = mat.setdefault("pbrMetallicRoughness", {})
        pbr["roughnessFactor"] = 0.82
        pbr["metallicFactor"] = 0.0

    # 3. Compute smooth vertex normals if missing or flat
    if gltf.get("meshes") and gltf["meshes"][0].get("primitives"):
        prim = gltf["meshes"][0]["primitives"][0]
        if "NORMAL" not in prim.get("attributes", {}):
            try:
                idx_acc = gltf["accessors"][prim["indices"]]
                pos_acc = gltf["accessors"][prim["attributes"]["POSITION"]]

                idx_bv = gltf["bufferViews"][idx_acc["bufferView"]]
                pos_bv = gltf["bufferViews"][pos_acc["bufferView"]]

                idx_bytes = bin_data[idx_bv.get("byteOffset", 0):idx_bv.get("byteOffset", 0) + idx_bv["byteLength"]]
                pos_bytes = bin_data[pos_bv.get("byteOffset", 0):pos_bv.get("byteOffset", 0) + pos_bv["byteLength"]]

                num_indices = idx_acc["count"]
                num_verts = pos_acc["count"]

                # Handle uint16 vs uint32 indices
                idx_fmt = "<H" if idx_acc["componentType"] == 5123 else "<I"
                indices = struct.unpack(f"<{num_indices}{'H' if idx_acc['componentType'] == 5123 else 'I'}", idx_bytes)
                positions = [struct.unpack_from("<3f", pos_bytes, i * 12) for i in range(num_verts)]

                normals = [[0.0, 0.0, 0.0] for _ in range(num_verts)]
                for t in range(0, num_indices, 3):
                    i0, i1, i2 = indices[t], indices[t + 1], indices[t + 2]
                    p0, p1, p2 = positions[i0], positions[i1], positions[i2]
                    ax, ay, az = p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]
                    bx, by, bz = p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]
                    nx = ay * bz - az * by
                    ny = az * bx - ax * bz
                    nz = ax * by - ay * bx
                    normals[i0][0] += nx; normals[i0][1] += ny; normals[i0][2] += nz
                    normals[i1][0] += nx; normals[i1][1] += ny; normals[i1][2] += nz
                    normals[i2][0] += nx; normals[i2][1] += ny; normals[i2][2] += nz

                norm_bytes = bytearray()
                for n in normals:
                    length = math.sqrt(n[0] * n[0] + n[1] * n[1] + n[2] * n[2])
                    if length > 1e-9:
                        norm_bytes.extend(struct.pack("<3f", n[0] / length, n[1] / length, n[2] / length))
                    else:
                        norm_bytes.extend(struct.pack("<3f", 0.0, 1.0, 0.0))

                norm_offset = len(bin_data)
                bin_data.extend(norm_bytes)

                norm_bv_idx = len(gltf["bufferViews"])
                gltf["bufferViews"].append({
                    "buffer": 0,
                    "byteOffset": norm_offset,
                    "byteLength": len(norm_bytes),
                    "target": 34962  # ARRAY_BUFFER
                })

                norm_acc_idx = len(gltf["accessors"])
                gltf["accessors"].append({
                    "bufferView": norm_bv_idx,
                    "byteOffset": 0,
                    "componentType": 5126,  # FLOAT
                    "count": num_verts,
                    "type": "VEC3",
                    "max": [1.0, 1.0, 1.0],
                    "min": [-1.0, -1.0, -1.0]
                })

                prim["attributes"]["NORMAL"] = norm_acc_idx
                print("Attached smooth vertex normals to eliminate faceted polygons")
            except Exception as e:
                print(f"Warning: could not compute normals: {e}", file=sys.stderr)

    gltf["buffers"][0]["byteLength"] = len(bin_data)

    new_json_bytes = json.dumps(gltf, separators=(",", ":")).encode("utf-8")
    json_pad = (4 - (len(new_json_bytes) % 4)) % 4
    new_json_bytes += b" " * json_pad

    new_total_len = 12 + 8 + len(new_json_bytes) + 8 + len(bin_data)
    new_header = struct.pack("<III", magic, ver, new_total_len)
    new_json_chunk = struct.pack("<II", len(new_json_bytes), json_type) + new_json_bytes
    new_bin_chunk = struct.pack("<II", len(bin_data), bin_type) + bin_data

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
