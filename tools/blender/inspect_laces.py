import bpy

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath='output/orange-sneaker/orange-sneaker.glb')
anchor = bpy.data.objects.get('CharmAnchor')
laces = bpy.data.objects.get('Laces')
print('Anchor location:', list(anchor.location) if anchor else None)

lateral_v = [v.co for v in laces.data.vertices if v.co.y < -0.2]
print('Lateral lace verts count:', len(lateral_v))
min_y = min(v.y for v in lateral_v)
print('Min Y (outermost lateral):', min_y)

top_eyelet = [v for v in lateral_v if v.y < -0.25 and v.z > 0.05]
print('Top outer lace verts:', len(top_eyelet))
for v in sorted(top_eyelet, key=lambda x: -x.z)[:10]:
    print(f"  Z: {v.z:.4f}, X: {v.x:.4f}, Y: {v.y:.4f}")

