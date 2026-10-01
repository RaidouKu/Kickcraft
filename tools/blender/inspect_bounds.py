import bpy
from mathutils import Vector

SOURCE_BLEND = "C:/Users/kinglebron/Downloads/Orange Sneaker/BlendSwapShoe.blend"

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.wm.open_mainfile(filepath=SOURCE_BLEND)

print("\n--- DETAILED OBJECT BOUNDS ---")
for obj in bpy.data.objects:
    if obj.type in ("MESH", "CURVE"):
        # Evaluate bounding box
        bbox = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box] if obj.bound_box else []
        if bbox:
            min_c = Vector((min(v[i] for v in bbox) for i in range(3)))
            max_c = Vector((max(v[i] for v in bbox) for i in range(3)))
            size = max_c - min_c
            center = (min_c + max_c) / 2.0
            print(f"{obj.name:18} | Type: {obj.type:5} | Size: ({size.x:.3f}, {size.y:.3f}, {size.z:.3f}) | Center: ({center.x:.3f}, {center.y:.3f}, {center.z:.3f}) | Modifiers: {[m.type for m in obj.modifiers]}")
