import bpy
import math
import os

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath="output/orange-sneaker/orange-sneaker.glb")

anchor = bpy.data.objects.get("CharmAnchor")
print("CharmAnchor location:", list(anchor.location) if anchor else "NOT FOUND")

# Import star charm
bpy.ops.import_scene.gltf(filepath="public/models/charms/star-charm.glb")
charm_objs = [o for o in bpy.context.selected_objects if o.type == "MESH"]
if anchor and charm_objs:
    for co in charm_objs:
        co.location = anchor.location
        co.scale = (0.35, 0.35, 0.35)

# Camera to inspect lateral laces area
cam_data = bpy.data.cameras.new("CharmTestCam")
cam = bpy.data.objects.new("CharmTestCam", cam_data)
bpy.context.scene.collection.objects.link(cam)
bpy.context.scene.camera = cam

cam.location = (0.3, -1.8, 0.6)
cam.rotation_euler = (math.radians(72), 0, math.radians(10))

# Lights
sun = bpy.data.objects.new("Sun", bpy.data.lights.new("Sun", "SUN"))
sun.data.energy = 4.0
sun.rotation_euler = (math.radians(50), math.radians(20), math.radians(30))
bpy.context.scene.collection.objects.link(sun)

bpy.context.scene.render.resolution_x = 800
bpy.context.scene.render.resolution_y = 600
bpy.context.scene.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items] else "BLENDER_EEVEE"
bpy.context.scene.render.filepath = os.path.abspath("output/inspect/charm_lace_test.png")
bpy.ops.render.render(write_still=True)
print("Rendered charm lace test!")
