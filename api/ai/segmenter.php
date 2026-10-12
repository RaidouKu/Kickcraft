<?php
// KickCraft 3D Shoe Semantic Part Segmenter & Texture Delighter in Pure PHP
// =========================================================================
// Native PHP glTF 2.0 binary partitioner that runs in any environment
// (shared hosting, InfinityFree, CLI, XAMPP) without requiring Python or exec().

function classifyShoeTrianglePhp(float $cx, float $cy, float $cz, array $bounds, bool $swapXz = false, bool $invertLen = false): string {
    $minX = $bounds[0]; $maxX = $bounds[1];
    $minY = $bounds[2]; $maxY = $bounds[3];
    $minZ = $bounds[4]; $maxZ = $bounds[5];

    $spanX = max($maxX - $minX, 1e-6);
    $spanY = max($maxY - $minY, 1e-6);
    $spanZ = max($maxZ - $minZ, 1e-6);

    $Y = ($cy - $minY) / $spanY;

    if (!$swapXz) {
        $X = ($cx - ($minX + $maxX) / 2.0) / $spanX;
        $Z = ($cz - $minZ) / $spanZ;
    } else {
        $X = ($cz - ($minZ + $maxZ) / 2.0) / $spanZ;
        $Z = ($cx - $minX) / $spanX;
    }

    if ($invertLen) {
        $Z = 1.0 - $Z;
    }

    $Y = max(0.0, min(1.0, $Y));
    $Z = max(0.0, min(1.0, $Z));

    if ($Y <= 0.12) {
        return 'Outsole';
    } elseif ($Y <= 0.25) {
        return 'Midsole';
    } elseif ($Y > 0.25 && $Z >= 0.75 && $Y <= 0.52) {
        return 'ToeCap';
    } elseif ($Y > 0.42 && abs($X) <= 0.18 && $Z >= 0.35 && $Z < 0.72) {
        return 'Laces';
    } elseif ($Y > 0.45 && abs($X) <= 0.16 && $Z >= 0.25 && $Z < 0.65) {
        return 'Tongue';
    } elseif ($Y > 0.25 && $Z <= 0.22) {
        return 'HeelPanel';
    } elseif ($Y > 0.25 && abs($X) >= 0.35 && $Z >= 0.22 && $Z < 0.75) {
        return 'SideAccents';
    } else {
        return 'Upper';
    }
}

function delightTexturePhp(string $imageBytes): ?string {
    if (!function_exists('imagecreatefromstring')) {
        return null;
    }
    $img = @imagecreatefromstring($imageBytes);
    if (!$img) {
        return null;
    }
    if (function_exists('imagefilter')) {
        imagefilter($img, IMG_FILTER_GRAYSCALE);
        imagefilter($img, IMG_FILTER_BRIGHTNESS, 60);
        imagefilter($img, IMG_FILTER_CONTRAST, -30);
    }
    ob_start();
    imagejpeg($img, null, 95);
    $out = ob_get_clean();
    imagedestroy($img);
    return $out ?: null;
}

function segmentShoeGlbPhp(string $glbPath, ?string $outputPath = null): bool {
    if ($outputPath === null) {
        $outputPath = $glbPath;
    }

    if (!file_exists($glbPath)) {
        return false;
    }

    $data = @file_get_contents($glbPath);
    if ($data === false || strlen($data) < 20 || substr($data, 0, 4) !== 'glTF') {
        return false;
    }

    $header = unpack('Vmagic/Vversion/VtotalLength', substr($data, 0, 12));
    $magic = $header['magic'];
    $version = $header['version'];
    if ($magic !== 0x46546C67) {
        return false;
    }

    $jsonHeader = unpack('Vlength/Vtype', substr($data, 12, 8));
    $jsonLen = $jsonHeader['length'];
    $jsonType = $jsonHeader['type'];
    $gltf = json_decode(substr($data, 20, $jsonLen), true);
    if (!is_array($gltf) || empty($gltf['meshes']) || empty($gltf['meshes'][0]['primitives'])) {
        return false;
    }

    $binOffset = 20 + $jsonLen;
    if ($binOffset + 8 > strlen($data)) {
        return false;
    }

    $binHeader = unpack('Vlength/Vtype', substr($data, $binOffset, 8));
    $binLen = $binHeader['length'];
    $binType = $binHeader['type'];
    $binData = substr($data, $binOffset + 8, $binLen);

    $prim = $gltf['meshes'][0]['primitives'][0];
    if (empty($prim['attributes']['POSITION']) && !isset($prim['attributes']['POSITION'])) {
        return false;
    }
    if (!isset($prim['indices'])) {
        return false;
    }

    $partsConfig = [
        ['name' => 'Upper', 'material' => 'UpperMaterial'],
        ['name' => 'ToeCap', 'material' => 'ToeCapMaterial'],
        ['name' => 'Tongue', 'material' => 'TongueMaterial'],
        ['name' => 'Laces', 'material' => 'LacesMaterial'],
        ['name' => 'HeelPanel', 'material' => 'HeelPanelMaterial'],
        ['name' => 'SideAccents', 'material' => 'SideAccentsMaterial'],
        ['name' => 'Midsole', 'material' => 'MidsoleMaterial'],
        ['name' => 'Outsole', 'material' => 'OutsoleMaterial'],
    ];

    // 1. Texture Delighting (neutral shading map)
    $hasTexture = false;
    if (!empty($gltf['images']) && isset($gltf['images'][0]['bufferView'])) {
        $imgBvIdx = $gltf['images'][0]['bufferView'];
        if (isset($gltf['bufferViews'][$imgBvIdx])) {
            $imgBv = $gltf['bufferViews'][$imgBvIdx];
            $imgOffset = $imgBv['byteOffset'] ?? 0;
            $imgLen = $imgBv['byteLength'];

            $origImgBytes = substr($binData, $imgOffset, $imgLen);
            $delightedBytes = delightTexturePhp($origImgBytes);
            if ($delightedBytes !== null) {
                $pad = (4 - (strlen($delightedBytes) % 4)) % 4;
                if ($pad > 0) {
                    $delightedBytes .= str_repeat("\x00", $pad);
                }
                $delta = strlen($delightedBytes) - $imgLen;
                $binData = substr($binData, 0, $imgOffset) . $delightedBytes . substr($binData, $imgOffset + $imgLen);
                $gltf['bufferViews'][$imgBvIdx]['byteLength'] = strlen($delightedBytes);
                $gltf['images'][0]['mimeType'] = 'image/jpeg';

                foreach ($gltf['bufferViews'] as $i => &$bv) {
                    if ($i !== $imgBvIdx && ($bv['byteOffset'] ?? 0) > $imgOffset) {
                        $bv['byteOffset'] = ($bv['byteOffset'] ?? 0) + $delta;
                    }
                }
                unset($bv);
                $hasTexture = true;
            } else {
                $hasTexture = true;
            }
        }
    }

    // 2. Read vertices and indices
    $posAcc = $gltf['accessors'][$prim['attributes']['POSITION']];
    $posBv = $gltf['bufferViews'][$posAcc['bufferView']];
    $posOffset = ($posBv['byteOffset'] ?? 0) + ($posAcc['byteOffset'] ?? 0);
    $numVerts = $posAcc['count'];

    $positionsRaw = unpack('f*', substr($binData, $posOffset, $numVerts * 12));
    if (!$positionsRaw || count($positionsRaw) < $numVerts * 3) {
        return false;
    }

    $idxAcc = $gltf['accessors'][$prim['indices']];
    $idxBv = $gltf['bufferViews'][$idxAcc['bufferView']];
    $idxOffset = ($idxBv['byteOffset'] ?? 0) + ($idxAcc['byteOffset'] ?? 0);
    $idxCount = $idxAcc['count'];
    $idxCompType = $idxAcc['componentType'];
    $idxFormat = ($idxCompType === 5123) ? 'v*' : 'V*';
    $idxStride = ($idxCompType === 5123) ? 2 : 4;

    $indicesRaw = unpack($idxFormat, substr($binData, $idxOffset, $idxCount * $idxStride));
    if (!$indicesRaw || count($indicesRaw) < $idxCount) {
        return false;
    }

    // 3. Compute bounding box
    $minX = INF; $maxX = -INF;
    $minY = INF; $maxY = -INF;
    $minZ = INF; $maxZ = -INF;

    for ($v = 0; $v < $numVerts; $v++) {
        $x = $positionsRaw[$v * 3 + 1];
        $y = $positionsRaw[$v * 3 + 2];
        $z = $positionsRaw[$v * 3 + 3];
        if ($x < $minX) $minX = $x;
        if ($x > $maxX) $maxX = $x;
        if ($y < $minY) $minY = $y;
        if ($y > $maxY) $maxY = $y;
        if ($z < $minZ) $minZ = $z;
        if ($z > $maxZ) $maxZ = $z;
    }

    $bounds = [$minX, $maxX, $minY, $maxY, $minZ, $maxZ];
    $swapXz = ($maxX - $minX) > ($maxZ - $minZ);

    // 4. Partition triangles into parts
    $partIndices = [];
    foreach ($partsConfig as $p) {
        $partIndices[$p['name']] = [];
    }

    for ($t = 1; $t <= $idxCount; $t += 3) {
        $i0 = $indicesRaw[$t];
        $i1 = $indicesRaw[$t + 1];
        $i2 = $indicesRaw[$t + 2];

        $cx = ($positionsRaw[$i0 * 3 + 1] + $positionsRaw[$i1 * 3 + 1] + $positionsRaw[$i2 * 3 + 1]) / 3.0;
        $cy = ($positionsRaw[$i0 * 3 + 2] + $positionsRaw[$i1 * 3 + 2] + $positionsRaw[$i2 * 3 + 2]) / 3.0;
        $cz = ($positionsRaw[$i0 * 3 + 3] + $positionsRaw[$i1 * 3 + 3] + $positionsRaw[$i2 * 3 + 3]) / 3.0;

        $part = classifyShoeTrianglePhp($cx, $cy, $cz, $bounds, $swapXz, false);
        $partIndices[$part][] = $i0;
        $partIndices[$part][] = $i1;
        $partIndices[$part][] = $i2;
    }

    // 5. Build canonical materials
    $materials = [];
    $matIndexByPart = [];
    foreach ($partsConfig as $p) {
        $matDef = [
            'name' => $p['material'],
            'pbrMetallicRoughness' => [
                'baseColorFactor' => [1.0, 1.0, 1.0, 1.0],
                'metallicFactor' => 0.0,
                'roughnessFactor' => 0.82,
            ],
        ];
        if ($hasTexture) {
            $matDef['pbrMetallicRoughness']['baseColorTexture'] = ['index' => 0];
        }
        $matIndexByPart[$p['name']] = count($materials);
        $materials[] = $matDef;
    }
    $gltf['materials'] = $materials;

    // 6. Build new primitives
    $newPrimitives = [];
    $baseAttributes = $prim['attributes'];
    $useUint16 = ($idxCompType === 5123);
    $outIdxComp = $useUint16 ? 5123 : 5125;
    $outIdxPackFmt = $useUint16 ? 'v*' : 'V*';

    foreach ($partsConfig as $p) {
        $name = $p['name'];
        $list = $partIndices[$name];
        if (empty($list)) {
            continue;
        }

        $idxBytes = pack($outIdxPackFmt, ...$list);
        $idxPad = (4 - (strlen($idxBytes) % 4)) % 4;
        if ($idxPad > 0) {
            $idxBytes .= str_repeat("\x00", $idxPad);
        }

        $currLen = strlen($binData);
        $alignPad = (4 - ($currLen % 4)) % 4;
        if ($alignPad > 0) {
            $binData .= str_repeat("\x00", $alignPad);
        }

        $newBvOffset = strlen($binData);
        $binData .= $idxBytes;

        $newBvIdx = count($gltf['bufferViews']);
        $gltf['bufferViews'][] = [
            'buffer' => 0,
            'byteOffset' => $newBvOffset,
            'byteLength' => strlen($idxBytes),
            'target' => 34963, // ELEMENT_ARRAY_BUFFER
        ];

        $newAccIdx = count($gltf['accessors']);
        $gltf['accessors'][] = [
            'bufferView' => $newBvIdx,
            'byteOffset' => 0,
            'componentType' => $outIdxComp,
            'count' => count($list),
            'type' => 'SCALAR',
            'max' => [max($list)],
            'min' => [min($list)],
        ];

        $newPrimitives[] = [
            'attributes' => $baseAttributes,
            'indices' => $newAccIdx,
            'material' => $matIndexByPart[$name],
        ];
    }

    $gltf['meshes'][0]['primitives'] = $newPrimitives;
    $gltf['buffers'][0]['byteLength'] = strlen($binData);

    // 7. Pack binary GLB
    $jsonStr = json_encode($gltf, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    $jsonPad = (4 - (strlen($jsonStr) % 4)) % 4;
    if ($jsonPad > 0) {
        $jsonStr .= str_repeat(' ', $jsonPad);
    }

    $binPad = (4 - (strlen($binData) % 4)) % 4;
    if ($binPad > 0) {
        $binData .= str_repeat("\x00", $binPad);
        $gltf['buffers'][0]['byteLength'] = strlen($binData);
    }

    $totalLen = 12 + 8 + strlen($jsonStr) + 8 + strlen($binData);
    $headerPacked = pack('VVV', $magic, $version, $totalLen);
    $jsonChunk = pack('VV', strlen($jsonStr), $jsonType) . $jsonStr;
    $binChunk = pack('VV', strlen($binData), $binType) . $binData;

    $tmpOut = $outputPath . '.tmp';
    @mkdir(dirname($outputPath), 0777, true);
    if (file_put_contents($tmpOut, $headerPacked . $jsonChunk . $binChunk) === false) {
        return false;
    }
    rename($tmpOut, $outputPath);
    return true;
}
