import bpy

SOURCE_BLEND = "C:/Users/kinglebron/Downloads/Orange Sneaker/BlendSwapShoe.blend"

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.wm.open_mainfile(filepath=SOURCE_BLEND)

print("\n--- ALL OBJECTS IN BLEND ---")
for obj in bpy.data.objects:
    mats = [slot.material.name if slot.material else 'None' for slot in obj.material_slots]
    print(f"Name: {obj.name:20} | Type: {obj.type:8} | Mats: {','.join(mats):30} | Dims: {obj.dimensions if hasattr(obj, 'dimensions') else 'N/A'}")

print("\n--- ALL MATERIALS AND COLORS ---")
for mat in bpy.data.materials:
    color = "No nodes"
    if mat.use_nodes:
        for node in mat.node_tree.nodes:
            if node.type in ("BSDF_PRINCIPLED", "BSDF_DIFFUSE", "BSDF_GLOSSY"):
                col = node.inputs.get("Base Color") or node.inputs.get("Color")
                if col:
                    color = f"{node.type}: {list(col.default_value)}"
    else:
        color = f"Diffuse: {list(mat.diffuse_color)}"
    print(f"Mat: {mat.name:25} | {color}")
