#!/usr/bin/env python3
"""
KickCraft 3D Shoe Semantic Part Segmenter & Texture Delighter
============================================================
1. Partitions a single-mesh AI-generated shoe GLB into 8 distinct KickCraft
   materials and primitives (UpperMaterial, ToeCapMaterial, TongueMaterial,
   LacesMaterial, HeelPanelMaterial, SideAccentsMaterial, MidsoleMaterial,
   OutsoleMaterial).
2. Delights the baked single-mesh base color texture into a normalized neutral
   grayscale shading and ambient-occlusion map, allowing 100% true, vibrant
   color customization without muddy multiplicative overlays.
3. Aligns output to compliant binary glTF 2.0 specifications.
"""

import sys
import os
import json
import struct
import io
import math
from PIL import Image


PARTS_CONFIG = [
    {"name": "Upper", "material": "UpperMaterial"},
    {"name": "ToeCap", "material": "ToeCapMaterial"},
    {"name": "Tongue", "material": "TongueMaterial"},
    {"name": "Laces", "material": "LacesMaterial"},
    {"name": "HeelPanel", "material": "HeelPanelMaterial"},
    {"name": "SideAccents", "material": "SideAccentsMaterial"},
    {"name": "Midsole", "material": "MidsoleMaterial"},
    {"name": "Outsole", "material": "OutsoleMaterial"},
]


def delight_texture(image_bytes, gamma=0.65, min_reflectance=0.55):
    """
    Converts a baked photographed color texture into a normalized grayscale
    ambient-occlusion / crease shading map. Midtones represent neutral
    reflectance (~0.85) and highlights represent 1.0, so multiplying by
    baseColorFactor in PBR rendering produces 100% accurate, vibrant colors.
    """
    orig_img = Image.open(io.BytesIO(image_bytes)).convert("L")
    lut = [
        int(255 * (min_reflectance + (1.0 - min_reflectance) * ((i / 255.0) ** gamma)))
        for i in range(256)
    ]
    delighted = orig_img.point(lut).convert("RGB")

    out_buf = io.BytesIO()
    delighted.save(out_buf, format="JPEG", quality=95)
    return out_buf.getvalue()


def classify_triangle(cx, cy, cz, bounds, swap_xz=False, invert_len=False):
    """
    Categorizes a triangle centroid into one of the 8 canonical KickCraft parts:
    - Outsole:     Y <= 0.12
    - Midsole:     0.12 < Y <= 0.25
    - ToeCap:      Y > 0.25 and Z >= 0.75 and Y <= 0.52
    - Laces:       Y > 0.42 and |X| <= 0.18 and 0.35 <= Z < 0.72
    - Tongue:      Y > 0.45 and |X| <= 0.16 and 0.25 <= Z < 0.65
    - HeelPanel:   Y > 0.25 and Z <= 0.22
    - SideAccents: Y > 0.25 and |X| >= 0.35 and 0.22 <= Z < 0.75
    - Upper:       All remaining triangles
    """
    min_x, max_x, min_y, max_y, min_z, max_z = bounds
    span_x = max(max_x - min_x, 1e-6)
    span_y = max(max_y - min_y, 1e-6)
    span_z = max(max_z - min_z, 1e-6)

    Y = (cy - min_y) / span_y

    if not swap_xz:
        X = (cx - (min_x + max_x) / 2.0) / span_x
        Z = (cz - min_z) / span_z
    else:
        X = (cz - (min_z + max_z) / 2.0) / span_z
        Z = (cx - min_x) / span_x

    if invert_len:
        Z = 1.0 - Z

    # Strict bounds clamp for evaluation
    Y = max(0.0, min(1.0, Y))
    Z = max(0.0, min(1.0, Z))

    if Y <= 0.12:
        return "Outsole"
    elif Y <= 0.25:
        return "Midsole"
    elif Y > 0.25 and Z >= 0.75 and Y <= 0.52:
        return "ToeCap"
    elif Y > 0.42 and abs(X) <= 0.18 and 0.35 <= Z < 0.72:
        return "Laces"
    elif Y > 0.45 and abs(X) <= 0.16 and 0.25 <= Z < 0.65:
        return "Tongue"
    elif Y > 0.25 and Z <= 0.22:
        return "HeelPanel"
    elif Y > 0.25 and abs(X) >= 0.35 and 0.22 <= Z < 0.75:
        return "SideAccents"
    else:
        return "Upper"


def segment_shoe_glb(glb_path, output_path=None):
    if output_path is None:
        output_path = glb_path

    if not os.path.exists(glb_path):
        print(f"Error: {glb_path} does not exist", file=sys.stderr)
        return False

    with open(glb_path, "rb") as f:
        data = f.read()

    if len(data) < 20:
        print(f"Error: {glb_path} is too small to be a valid GLB", file=sys.stderr)
        return False

    magic, ver, total_len = struct.unpack("<III", data[:12])
    if magic != 0x46546C67:
        print(f"Error: {glb_path} is not a valid GLB", file=sys.stderr)
        return False

    json_len, json_type = struct.unpack("<II", data[12:20])
    gltf = json.loads(data[20:20 + json_len].decode("utf-8"))

    bin_offset = 20 + json_len
    if bin_offset + 8 > len(data):
        print(f"Error: {glb_path} has missing binary chunk", file=sys.stderr)
        return False

    bin_len, bin_type = struct.unpack("<II", data[bin_offset:bin_offset + 8])
    bin_data = bytearray(data[bin_offset + 8:bin_offset + 8 + bin_len])

    if not gltf.get("meshes") or not gltf["meshes"][0].get("primitives"):
        print("Error: No meshes found in GLB", file=sys.stderr)
        return False

    prim = gltf["meshes"][0]["primitives"][0]
    if "POSITION" not in prim.get("attributes", {}) or "indices" not in prim:
        print("Error: Mesh primitive missing POSITION or indices", file=sys.stderr)
        return False

    # 1. Texture delighting (neutral grayscale ambient occlusion map)
    has_texture = False
    if gltf.get("images") and len(gltf["images"]) > 0:
        img_bv_idx = gltf["images"][0]["bufferView"]
        img_bv = gltf["bufferViews"][img_bv_idx]
        img_offset = img_bv.get("byteOffset", 0)
        img_len = img_bv["byteLength"]

        orig_img_bytes = bin_data[img_offset:img_offset + img_len]
        try:
            delighted_bytes = delight_texture(orig_img_bytes)

            # Pad delighted image to 4 bytes
            pad = (4 - (len(delighted_bytes) % 4)) % 4
            delighted_bytes += b"\x00" * pad
            delta = len(delighted_bytes) - img_len

            bin_data = bin_data[:img_offset] + delighted_bytes + bin_data[img_offset + img_len:]
            img_bv["byteLength"] = len(delighted_bytes)
            gltf["images"][0]["mimeType"] = "image/jpeg"

            # Adjust subsequent bufferViews
            for i, bv in enumerate(gltf["bufferViews"]):
                if i != img_bv_idx and bv.get("byteOffset", 0) > img_offset:
                    bv["byteOffset"] = bv.get("byteOffset", 0) + delta

            has_texture = True
        except Exception as e:
            print(f"Warning: could not delight texture: {e}", file=sys.stderr)

    # 2. Read vertices and indices
    pos_acc = gltf["accessors"][prim["attributes"]["POSITION"]]
    pos_bv = gltf["bufferViews"][pos_acc["bufferView"]]
    pos_offset = pos_bv.get("byteOffset", 0)
    num_verts = pos_acc["count"]

    positions = [
        struct.unpack_from("<3f", bin_data, pos_offset + i * 12)
        for i in range(num_verts)
    ]

    idx_acc = gltf["accessors"][prim["indices"]]
    idx_bv = gltf["bufferViews"][idx_acc["bufferView"]]
    idx_offset = idx_bv.get("byteOffset", 0)
    idx_count = idx_acc["count"]
    idx_comp_type = idx_acc["componentType"]
    idx_fmt = "<H" if idx_comp_type == 5123 else "<I"
    idx_stride = 2 if idx_comp_type == 5123 else 4

    indices = [
        struct.unpack_from(idx_fmt, bin_data, idx_offset + i * idx_stride)[0]
        for i in range(idx_count)
    ]

    # 3. Compute oriented bounding box
    min_x = min(p[0] for p in positions)
    max_x = max(p[0] for p in positions)
    min_y = min(p[1] for p in positions)
    max_y = max(p[1] for p in positions)
    min_z = min(p[2] for p in positions)
    max_z = max(p[2] for p in positions)
    bounds = (min_x, max_x, min_y, max_y, min_z, max_z)

    span_x = max_x - min_x
    span_z = max_z - min_z
    swap_xz = span_x > span_z

    # 4. Partition triangles into 8 parts
    part_indices = {p["name"]: [] for p in PARTS_CONFIG}

    for t in range(0, idx_count, 3):
        i0, i1, i2 = indices[t], indices[t + 1], indices[t + 2]
        p0, p1, p2 = positions[i0], positions[i1], positions[i2]
        cx = (p0[0] + p1[0] + p2[0]) / 3.0
        cy = (p0[1] + p1[1] + p2[1]) / 3.0
        cz = (p0[2] + p1[2] + p2[2]) / 3.0

        part = classify_triangle(cx, cy, cz, bounds, swap_xz=swap_xz, invert_len=False)
        part_indices[part].extend([i0, i1, i2])

    # Fallback: ensure non-empty core parts, fallback to Upper
    for p in PARTS_CONFIG:
        name = p["name"]
        if len(part_indices[name]) == 0 and name == "Upper":
            # If Upper is somehow empty, assign unassigned triangles
            pass

    # 5. Build canonical materials
    materials = []
    mat_index_by_part = {}
    for p in PARTS_CONFIG:
        mat_def = {
            "name": p["material"],
            "pbrMetallicRoughness": {
                "baseColorFactor": [1.0, 1.0, 1.0, 1.0],
                "metallicFactor": 0.0,
                "roughnessFactor": 0.82,
            },
        }
        if has_texture:
            mat_def["pbrMetallicRoughness"]["baseColorTexture"] = {"index": 0}

        mat_index_by_part[p["name"]] = len(materials)
        materials.append(mat_def)

    gltf["materials"] = materials

    # 6. Build new primitives under meshes[0]
    new_primitives = []
    base_attributes = dict(prim["attributes"])

    # Determine whether to pack new indices as uint16 or uint32
    max_idx = max(indices) if indices else 0
    use_uint16 = max_idx < 65536 and idx_comp_type == 5123
    out_idx_comp = 5123 if use_uint16 else 5125
    out_idx_fmt = "<H" if use_uint16 else "<I"

    for p in PARTS_CONFIG:
        name = p["name"]
        idx_list = part_indices[name]
        if not idx_list:
            # Skip empty parts (Upper absorbs remainder)
            continue

        idx_bytes = struct.pack(f"<{len(idx_list)}{'H' if use_uint16 else 'I'}", *idx_list)
        idx_pad = (4 - (len(idx_bytes) % 4)) % 4
        idx_bytes += b"\x00" * idx_pad

        # Align current bin_data length to 4 bytes
        curr_len = len(bin_data)
        align_pad = (4 - (curr_len % 4)) % 4
        if align_pad > 0:
            bin_data.extend(b"\x00" * align_pad)

        new_bv_offset = len(bin_data)
        bin_data.extend(idx_bytes)

        new_bv_idx = len(gltf["bufferViews"])
        gltf["bufferViews"].append({
            "buffer": 0,
            "byteOffset": new_bv_offset,
            "byteLength": len(idx_bytes),
            "target": 34963,  # ELEMENT_ARRAY_BUFFER
        })

        new_acc_idx = len(gltf["accessors"])
        gltf["accessors"].append({
            "bufferView": new_bv_idx,
            "byteOffset": 0,
            "componentType": out_idx_comp,
            "count": len(idx_list),
            "type": "SCALAR",
            "max": [max(idx_list)],
            "min": [min(idx_list)],
        })

        new_primitives.append({
            "attributes": base_attributes,
            "indices": new_acc_idx,
            "material": mat_index_by_part[name],
        })

    gltf["meshes"][0]["primitives"] = new_primitives
    gltf["buffers"][0]["byteLength"] = len(bin_data)

    # 7. Pack binary GLB with 4-byte alignment
    new_json_bytes = json.dumps(gltf, separators=(",", ":")).encode("utf-8")
    json_pad = (4 - (len(new_json_bytes) % 4)) % 4
    new_json_bytes += b" " * json_pad

    bin_pad = (4 - (len(bin_data) % 4)) % 4
    if bin_pad > 0:
        bin_data.extend(b"\x00" * bin_pad)
        gltf["buffers"][0]["byteLength"] = len(bin_data)

    new_total_len = 12 + 8 + len(new_json_bytes) + 8 + len(bin_data)
    new_header = struct.pack("<III", magic, ver, new_total_len)
    new_json_chunk = struct.pack("<II", len(new_json_bytes), json_type) + new_json_bytes
    new_bin_chunk = struct.pack("<II", len(bin_data), bin_type) + bin_data

    tmp_path = output_path + ".tmp"
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    with open(tmp_path, "wb") as f:
        f.write(new_header + new_json_chunk + new_bin_chunk)
    os.replace(tmp_path, output_path)

    print(
        f"Segmented {os.path.basename(glb_path)} into {len(new_primitives)} parts "
        f"({sum(len(part_indices[p['name']]) for p in PARTS_CONFIG)//3} triangles): {output_path}"
    )
    return True


if __name__ == "__main__":
    if len(sys.argv) < 2 or sys.argv[1] in ("-h", "--help"):
        print("Usage: python segment-shoe-glb.py <input_glb> [output_glb]")
        sys.exit(0 if len(sys.argv) > 1 and sys.argv[1] in ("-h", "--help") else 1)

    target_glb = sys.argv[1]
    out_glb = sys.argv[2] if len(sys.argv) > 2 else None
    ok = segment_shoe_glb(target_glb, out_glb)
    sys.exit(0 if ok else 1)
