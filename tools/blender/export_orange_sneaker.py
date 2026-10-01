import bpy
import os
import math
from mathutils import Vector

SOURCE_BLEND = "C:/Users/kinglebron/Downloads/Orange Sneaker/BlendSwapShoe.blend"
OUTPUT_DIR = "output/orange-sneaker"
TARGET_GLB = os.path.join(OUTPUT_DIR, "orange-sneaker.glb")
TARGET_IMAGE = os.path.join(OUTPUT_DIR, "orange-sneaker-card.png")

os.makedirs(OUTPUT_DIR, exist_ok=True)

print(f"Loading source: {SOURCE_BLEND}")
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.wm.open_mainfile(filepath=SOURCE_BLEND)

# Delete non-shoe objects
unwanted_names = [
    "*Layer_01 Camera",
    "*Layer_01 Camera target",
    "BezierCircle",
    "Emission Plane",
    "Cylinder",
]
for name in unwanted_names:
    obj = bpy.data.objects.get(name)
    if obj:
        bpy.data.objects.remove(obj, do_unlink=True)

# 1. Process Laces
# Lace curves: BezierCurve.010, 014, 015, 016, 017, 018, 019
# Eyelets: Circle.007, Circle.008, Circle.009, Circle.010
lace_curves = [bpy.data.objects.get(f"BezierCurve.{i:03d}") for i in [10, 14, 15, 16, 17, 18, 19] if bpy.data.objects.get(f"BezierCurve.{i:03d}")]
eyelets = [bpy.data.objects.get(f"Circle.{i:03d}") for i in [7, 8, 9, 10] if bpy.data.objects.get(f"Circle.{i:03d}")]

print(f"Found {len(lace_curves)} lace curves and {len(eyelets)} eyelets")

# Convert curves to mesh
for c in lace_curves:
    c.data.resolution_u = 3
    if c.data.bevel_object:
        c.data.bevel_object.data.resolution_u = 3
    bpy.ops.object.select_all(action="DESELECT")
    c.select_set(True)
    bpy.context.view_layer.objects.active = c
    bpy.ops.object.convert(target="MESH")

# Apply modifiers on eyelets
for e in eyelets:
    for m in e.modifiers:
        if m.type == "SUBSURF":
            m.levels = 1
            m.render_levels = 1
    bpy.ops.object.select_all(action="DESELECT")
    e.select_set(True)
    bpy.context.view_layer.objects.active = e
    for m in list(e.modifiers):
        try:
            bpy.ops.object.modifier_apply(modifier=m.name)
        except Exception as ex:
            print(f"Could not apply modifier {m.name} on {e.name}: {ex}")

# Join all laces and eyelets into one mesh
all_lace_objs = lace_curves + eyelets
bpy.ops.object.select_all(action="DESELECT")
for o in all_lace_objs:
    o.select_set(True)
bpy.context.view_layer.objects.active = all_lace_objs[0]
bpy.ops.object.join()
laces_mesh = bpy.context.active_object
laces_mesh.name = "Laces"
print(f"Joined Laces mesh: {len(laces_mesh.data.vertices)} verts")

# 2. Process Midsole (Plane.016)
sole_obj = bpy.data.objects.get("Plane.016")
if not sole_obj:
    raise RuntimeError("Missing sole object Plane.016")

for m in sole_obj.modifiers:
    if m.type == "SUBSURF":
        m.levels = 1
        m.render_levels = 1
bpy.ops.object.select_all(action="DESELECT")
sole_obj.select_set(True)
bpy.context.view_layer.objects.active = sole_obj
for m in list(sole_obj.modifiers):
    try:
        bpy.ops.object.modifier_apply(modifier=m.name)
    except Exception as ex:
        print(f"Could not apply modifier {m.name} on {sole_obj.name}: {ex}")

sole_obj.name = "Midsole"
print(f"Midsole mesh: {len(sole_obj.data.vertices)} verts")

# 3. Process Upper body
upper_names = [
    "Plane.002", "Plane.007", "Plane.008", "Plane.009", "Plane.010",
    "Plane.011", "Plane.012", "Plane.013", "Plane.014", "Plane.015",
    "Cylinder.041"
]
upper_objs = [bpy.data.objects.get(n) for n in upper_names if bpy.data.objects.get(n)]
print(f"Found {len(upper_objs)} upper objects")

for u in upper_objs:
    for m in u.modifiers:
        if m.type == "SUBSURF":
            m.levels = 1
            m.render_levels = 1
    bpy.ops.object.select_all(action="DESELECT")
    u.select_set(True)
    bpy.context.view_layer.objects.active = u
    for m in list(u.modifiers):
        try:
            bpy.ops.object.modifier_apply(modifier=m.name)
        except Exception as ex:
            print(f"Could not apply modifier {m.name} on {u.name}: {ex}")

bpy.ops.object.select_all(action="DESELECT")
for u in upper_objs:
    u.select_set(True)
bpy.context.view_layer.objects.active = upper_objs[0]
bpy.ops.object.join()
upper_mesh = bpy.context.active_object
upper_mesh.name = "Upper"
print(f"Joined Upper mesh: {len(upper_mesh.data.vertices)} verts")

# 4. Create standard PBR Materials
def hex_to_linear(hex_str):
    hex_str = hex_str.lstrip("#")
    r = int(hex_str[0:2], 16) / 255.0
    g = int(hex_str[2:4], 16) / 255.0
    b = int(hex_str[4:6], 16) / 255.0
    def to_lin(c):
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return (to_lin(r), to_lin(g), to_lin(b), 1.0)

def make_pbr_material(name, base_color_rgba, roughness=0.5):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    nodes.clear()
    bsdf = nodes.new(type="ShaderNodeBsdfPrincipled")
    bsdf.inputs["Base Color"].default_value = base_color_rgba
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = 0.0
    output = nodes.new(type="ShaderNodeOutputMaterial")
    mat.node_tree.links.new(bsdf.outputs["BSDF"], output.inputs["Surface"])
    return mat

# UpperMaterial: Vibrant Sneaker Orange (#ff5500)
mat_upper = make_pbr_material("UpperMaterial", hex_to_linear("#ff5500"), 0.45)
# LacesMaterial: Crisp Clean White (#f8f9fa)
mat_laces = make_pbr_material("LacesMaterial", hex_to_linear("#f8f9fa"), 0.6)
# MidsoleMaterial: Off-White / Sole White (#f0ede6)
mat_midsole = make_pbr_material("MidsoleMaterial", hex_to_linear("#f0ede6"), 0.75)

upper_mesh.data.materials.clear()
upper_mesh.data.materials.append(mat_upper)

laces_mesh.data.materials.clear()
laces_mesh.data.materials.append(mat_laces)

sole_obj.data.materials.clear()
sole_obj.data.materials.append(mat_midsole)

shoe_parts = [upper_mesh, laces_mesh, sole_obj]

# 5. Transform: Rotate and Normalize to KickCraft Standards
# Apply all existing transforms first
bpy.ops.object.select_all(action="DESELECT")
for o in shoe_parts:
    o.select_set(True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

# In original model: Toe is at -Y, Heel is at +Y.
# We rotate -90 degrees around Z:
# x' = y
# y' = -x
for o in shoe_parts:
    for v in o.data.vertices:
        old_x, old_y = v.co.x, v.co.y
        v.co.x = -old_y  # -(-Y) -> +X (Toe at +X!)
        v.co.y = -old_x

all_verts = [v.co for o in shoe_parts for v in o.data.vertices]
min_x, max_x = min(v.x for v in all_verts), max(v.x for v in all_verts)
min_y, max_y = min(v.y for v in all_verts), max(v.y for v in all_verts)
min_z, max_z = min(v.z for v in all_verts), max(v.z for v in all_verts)

print(f"Raw Rotated Bounds: X: [{min_x:.3f}, {max_x:.3f}], Y: [{min_y:.3f}, {max_y:.3f}], Z: [{min_z:.3f}, {max_z:.3f}]")

# Normalize: length 2.0 (X from -1.0 to 1.0)
scale_factor = 2.0 / (max_x - min_x)
mid_x = (min_x + max_x) / 2.0
mid_y = (min_y + max_y) / 2.0
mid_z = (min_z + max_z) / 2.0

for o in shoe_parts:
    for v in o.data.vertices:
        v.co.x = (v.co.x - mid_x) * scale_factor
        v.co.y = (v.co.y - mid_y) * scale_factor
        v.co.z = (v.co.z - mid_z) * scale_factor

# Update mesh data
for o in shoe_parts:
    o.data.update()

all_verts_scaled = [v.co for o in shoe_parts for v in o.data.vertices]
print(f"Normalized Bounds: X: [{min(v.x for v in all_verts_scaled):.3f}, {max(v.x for v in all_verts_scaled):.3f}], Y: [{min(v.y for v in all_verts_scaled):.3f}, {max(v.y for v in all_verts_scaled):.3f}], Z: [{min(v.z for v in all_verts_scaled):.3f}, {max(v.z for v in all_verts_scaled):.3f}]")

# 6. CharmAnchor placement ON THE LACES
# The user specified: "for the charm should be in the laces too"
# Let's find vertices on the laces on the outer lateral side (-Y) or top/middle of laces:
# In KickCraft:
# Toe is +X, Heel is -X.
# Lateral side (outside of right shoe) is -Y.
# Medial side (inside) is +Y.
# Laces are located roughly around X in [-0.2, 0.4], Z > 0.0.
lateral_lace_verts = [
    v for v in laces_mesh.data.vertices
    if -0.1 < v.co.x < 0.3 and v.co.y < -0.1 and v.co.z > 0.05
]

if lateral_lace_verts:
    # Pick a vertex along the mid-lace eyelet bar on lateral side
    target_v = min(lateral_lace_verts, key=lambda v: (abs(v.co.x - 0.05) + abs(v.co.y + 0.25)))
    anchor_loc = (target_v.co.x, target_v.co.y - 0.03, target_v.co.z)
    print(f"Selected lace vertex: ({target_v.co.x:.4f}, {target_v.co.y:.4f}, {target_v.co.z:.4f})")
else:
    # Fallback to standard lace position
    anchor_loc = (0.05, -0.28, 0.18)

print(f"CharmAnchor Location: {anchor_loc}")
anchor = bpy.data.objects.new("CharmAnchor", None)
bpy.context.scene.collection.objects.link(anchor)
anchor.location = anchor_loc

# 7. Export GLB
bpy.ops.object.select_all(action="DESELECT")
for o in shoe_parts + [anchor]:
    o.select_set(True)

bpy.ops.export_scene.gltf(
    filepath=TARGET_GLB,
    use_selection=True,
    export_apply=True
)
glb_sz = os.path.getsize(TARGET_GLB)
print(f"Exported GLB: {TARGET_GLB} ({glb_sz / 1024:.1f} KB / {glb_sz / (1024*1024):.2f} MB)")

# 8. Render Profile Card Image (800x450, KickCraft studio style)
cam_data = bpy.data.cameras.new("CardCam")
cam = bpy.data.objects.new("CardCam", cam_data)
bpy.context.scene.collection.objects.link(cam)
bpy.context.scene.camera = cam

# Profile perspective showing the lateral side of the shoe (+X toe to right, -X heel to left, looking from -Y)
cam.location = (0.0, -3.7, 0.15)
cam.rotation_euler = (math.radians(88), 0, 0)
cam.data.lens = 50

# Studio lights
sun_data1 = bpy.data.lights.new(name="KeySun", type="SUN")
sun_data1.energy = 3.5
sun1 = bpy.data.objects.new(name="KeySun", object_data=sun_data1)
bpy.context.scene.collection.objects.link(sun1)
sun1.rotation_euler = (math.radians(45), math.radians(20), math.radians(45))

sun_data2 = bpy.data.lights.new(name="FillSun", type="SUN")
sun_data2.energy = 2.0
sun2 = bpy.data.objects.new(name="FillSun", object_data=sun_data2)
bpy.context.scene.collection.objects.link(sun2)
sun2.rotation_euler = (math.radians(-30), math.radians(-30), math.radians(140))

# Clean background & studio floor matching KickCraft brand cards
bpy.context.scene.world = bpy.data.worlds.new("World")
bpy.context.scene.world.use_nodes = True
bg = bpy.context.scene.world.node_tree.nodes.get("Background")
if bg:
    bg.inputs["Color"].default_value = (0.89, 0.91, 0.90, 1.0)
    bg.inputs["Strength"].default_value = 1.0

bpy.ops.mesh.primitive_plane_add(size=12, location=(0, 0, -0.46))
plane = bpy.context.active_object
mat_ground = bpy.data.materials.new("GroundMat")
mat_ground.use_nodes = True
bsdf = mat_ground.node_tree.nodes.get("Principled BSDF")
if bsdf:
    bsdf.inputs["Base Color"].default_value = (0.89, 0.91, 0.90, 1.0)
    bsdf.inputs["Roughness"].default_value = 0.9
plane.data.materials.append(mat_ground)

bpy.context.scene.render.resolution_x = 800
bpy.context.scene.render.resolution_y = 450
bpy.context.scene.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items] else "BLENDER_EEVEE"
bpy.context.scene.render.filepath = os.path.abspath(TARGET_IMAGE)
bpy.ops.render.render(write_still=True)
img_sz = os.path.getsize(TARGET_IMAGE)
print(f"Rendered card image: {TARGET_IMAGE} ({img_sz / 1024:.1f} KB)")
