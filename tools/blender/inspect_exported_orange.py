import bpy

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath="output/orange-sneaker/orange-sneaker.glb")

print("\n--- EXPORTED GLB CONTENTS ---")
for obj in bpy.data.objects:
    if obj.type == "MESH":
        mats = [s.material.name if s.material else "None" for s in obj.material_slots]
        print(f"Mesh: {obj.name:15} | Mats: {mats} | Verts: {len(obj.data.vertices)}")
    else:
        print(f"Object: {obj.name:15} | Type: {obj.type} | Loc: {list(obj.location)}")
