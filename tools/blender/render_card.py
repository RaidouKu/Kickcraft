import bpy
import math
import os

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath="output/orange-sneaker/orange-sneaker.glb")

# Camera
cam_data = bpy.data.cameras.new("CardCam")
cam = bpy.data.objects.new("CardCam", cam_data)
bpy.context.scene.collection.objects.link(cam)
bpy.context.scene.camera = cam

# Angle slightly down so sole, upper, and laces are all clearly visible
cam.location = (0.2, -2.8, 0.8)
cam.rotation_euler = (math.radians(76), 0, math.radians(4))
cam.data.lens = 52

# Lighting
sun1 = bpy.data.objects.new("Sun1", bpy.data.lights.new("Sun1", "SUN"))
sun1.data.energy = 4.0
sun1.rotation_euler = (math.radians(50), math.radians(20), math.radians(40))
bpy.context.scene.collection.objects.link(sun1)

sun2 = bpy.data.objects.new("Sun2", bpy.data.lights.new("Sun2", "SUN"))
sun2.data.energy = 2.5
sun2.rotation_euler = (math.radians(-30), math.radians(-30), math.radians(140))
bpy.context.scene.collection.objects.link(sun2)

# World background: clean neutral light grey (#e5e7eb)
bpy.context.scene.world = bpy.data.worlds.new("World")
bg = bpy.context.scene.world.node_tree.nodes.get("Background")
if bg:
    bg.inputs["Color"].default_value = (0.88, 0.89, 0.90, 1.0)
    bg.inputs["Strength"].default_value = 1.0

# Shadow catcher floor
bpy.ops.mesh.primitive_plane_add(size=12, location=(0, 0, -0.46))
plane = bpy.context.active_object
mat_ground = bpy.data.materials.new("GroundMat")
bsdf = mat_ground.node_tree.nodes.get("Principled BSDF")
if bsdf:
    bsdf.inputs["Base Color"].default_value = (0.88, 0.89, 0.90, 1.0)
    bsdf.inputs["Roughness"].default_value = 0.9
plane.data.materials.append(mat_ground)

bpy.context.scene.render.resolution_x = 800
bpy.context.scene.render.resolution_y = 450
bpy.context.scene.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items] else "BLENDER_EEVEE"
bpy.context.scene.render.filepath = os.path.abspath("output/orange-sneaker/orange-sneaker-card.png")
bpy.ops.render.render(write_still=True)
print("Rendered card image successfully!")
