import bpy
from mathutils import Vector

def inspect_glb(path):
    print(f"\n=== INSPECTING GLB: {path} ===")
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=path)
    
    all_verts = []
    for obj in bpy.data.objects:
        if obj.type == "MESH":
            verts = [obj.matrix_world @ v.co for v in obj.data.vertices]
            all_verts.extend(verts)
            mats = [s.material.name if s.material else "None" for s in obj.material_slots]
            print(f"Mesh: {obj.name:20} | Mats: {mats} | Verts: {len(obj.data.vertices)}")
        elif obj.name == "CharmAnchor":
            print(f"CharmAnchor Found! Location: {list(obj.location)}")
    
    if all_verts:
        min_c = Vector((min(v[i] for v in all_verts) for i in range(3)))
        max_c = Vector((max(v[i] for v in all_verts) for i in range(3)))
        print(f"Bounding Box Min: ({min_c.x:.3f}, {min_c.y:.3f}, {min_c.z:.3f})")
        print(f"Bounding Box Max: ({max_c.x:.3f}, {max_c.y:.3f}, {max_c.z:.3f})")
        print(f"Dimensions: ({max_c.x - min_c.x:.3f}, {max_c.y - min_c.y:.3f}, {max_c.z - min_c.z:.3f})")

inspect_glb("public/models/shoe-soleview-final.glb")
inspect_glb("public/models/nike-dunk.glb")
inspect_glb("public/models/nike-air-max-custom.glb")
