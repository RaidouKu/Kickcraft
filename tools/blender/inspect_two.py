import bpy
from mathutils import Vector

def inspect_one(path):
    print(f"\n=== INSPECTING: {path} ===")
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=path)
    for obj in bpy.data.objects:
        if obj.type == "MESH":
            mats = [s.material.name if s.material else "None" for s in obj.material_slots]
            print(f"Mesh: {obj.name:15} | Mats: {mats}")
        elif "Anchor" in obj.name or "anchor" in obj.name.lower():
            print(f"Anchor: {obj.name} | Loc: {[round(c, 4) for c in obj.location]} | Rot: {[round(c, 4) for c in obj.rotation_euler]}")
    all_verts = [obj.matrix_world @ v.co for obj in bpy.data.objects if obj.type == "MESH" for v in obj.data.vertices]
    min_c = Vector((min(v[i] for v in all_verts) for i in range(3)))
    max_c = Vector((max(v[i] for v in all_verts) for i in range(3)))
    print(f"Bounds: X: [{min_c.x:.3f}, {max_c.x:.3f}], Y: [{min_c.y:.3f}, {max_c.y:.3f}], Z: [{min_c.z:.3f}, {max_c.z:.3f}]")

inspect_one("public/models/shoe-soleview-final.glb")
inspect_one("public/models/nike-dunk.glb")
