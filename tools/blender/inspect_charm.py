import bpy

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath="public/models/charms/star-charm.glb")

print("Star Charm objects:")
for o in bpy.data.objects:
    print(f"  {o.name:20} | Type: {o.type} | Loc: {list(o.location)} | Dims: {o.dimensions if hasattr(o, 'dimensions') else None}")
