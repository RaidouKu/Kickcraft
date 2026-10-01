import bpy
import math
import os

SOURCE_BLEND = "C:/Users/kinglebron/Downloads/Orange Sneaker/BlendSwapShoe.blend"
OUTPUT_PREVIEW = "output/inspect/original_orange_sneaker.png"
os.makedirs(os.path.dirname(OUTPUT_PREVIEW), exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.wm.open_mainfile(filepath=SOURCE_BLEND)

# Add a camera
cam_data = bpy.data.cameras.new("InspectCam")
cam = bpy.data.objects.new("InspectCam", cam_data)
bpy.context.scene.collection.objects.link(cam)
bpy.context.scene.camera = cam

# Position camera to look at the sneaker (it's centered near 0, 0, 0.06)
cam.location = (0.5, -0.6, 0.4)
cam.rotation_euler = (math.radians(65), 0, math.radians(40))

# Add lights
sun_data = bpy.data.lights.new(name="Sun", type="SUN")
sun_data.energy = 4.0
sun = bpy.data.objects.new(name="Sun", object_data=sun_data)
bpy.context.scene.collection.objects.link(sun)
sun.rotation_euler = (math.radians(45), math.radians(30), math.radians(30))

sun_data2 = bpy.data.lights.new(name="Sun2", type="SUN")
sun_data2.energy = 2.0
sun2 = bpy.data.objects.new(name="Sun2", object_data=sun_data2)
bpy.context.scene.collection.objects.link(sun2)
sun2.rotation_euler = (math.radians(-45), math.radians(-30), math.radians(150))

bpy.context.scene.render.resolution_x = 800
bpy.context.scene.render.resolution_y = 600
bpy.context.scene.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items] else "BLENDER_EEVEE"
bpy.context.scene.render.filepath = os.path.abspath(OUTPUT_PREVIEW)
bpy.ops.render.render(write_still=True)
print("Rendered:", OUTPUT_PREVIEW)
