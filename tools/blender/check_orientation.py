import bpy

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath="public/models/shoe-soleview-final.glb")

toecap = bpy.data.objects.get("ToeCap")
heel = bpy.data.objects.get("HeelPanel")
anchor = bpy.data.objects.get("CharmAnchor")

print("ToeCap Center X:", sum(v.co.x for v in toecap.data.vertices)/len(toecap.data.vertices))
print("HeelPanel Center X:", sum(v.co.x for v in heel.data.vertices)/len(heel.data.vertices))
print("CharmAnchor Loc:", anchor.location if anchor else None)
