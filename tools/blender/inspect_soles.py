import bpy
from mathutils import Vector

SOURCE_BLEND = "C:/Users/kinglebron/Downloads/Orange Sneaker/BlendSwapShoe.blend"

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.wm.open_mainfile(filepath=SOURCE_BLEND)

for obj in bpy.data.objects:
    if obj.type == "MESH":
        bbox = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
        min_z = min(v.z for v in bbox)
        max_z = max(v.z for v in bbox)
        mats = [s.name for s in obj.material_slots]
        print(f"{obj.name:15} | Z: [{min_z:.3f}, {max_z:.3f}] | Mats: {mats}")
