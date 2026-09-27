import test from 'node:test'
import assert from 'node:assert/strict'
import { AIR_MAX_PARTS, CHARMS, PARTS, SHOES, buildPartColorway, charmScale, charmSource, setMaterialColor } from '../src/customization.js'

test('keeps the original eight-part shoe and adds the three-part Air Max', () => {
  assert.deepEqual(PARTS.map(({ material }) => material), [
    'UpperMaterial',
    'ToeCapMaterial',
    'TongueMaterial',
    'LacesMaterial',
    'HeelPanelMaterial',
    'SideAccentsMaterial',
    'MidsoleMaterial',
    'OutsoleMaterial',
  ])

  assert.deepEqual(AIR_MAX_PARTS.map(({ material }) => material), [
    'UpperMaterial',
    'LacesMaterial',
    'MidsoleMaterial',
  ])

  assert.deepEqual(SHOES.map(({ id, src }) => ({ id, src })), [
    { id: 'kickcraft-one', src: '/models/shoe-soleview-final.glb' },
    { id: 'nike-air-max', src: '/models/nike-air-max-custom.glb' },
    { id: 'nike-dunk', src: '/models/nike-dunk.glb' },
  ])

  assert.equal(SHOES[0].charmOffset, null)
  assert.equal(SHOES[1].charmOffset, '0.003800 0.005100 0.085800')
  assert.equal(SHOES[0].charmScale, '1 1 1')
  assert.equal(SHOES[1].charmScale, '0.25 0.25 0.25')
  assert.equal(SHOES[0].charmDir, null)
  assert.equal(SHOES[1].charmDir, '/models/charms/air-max/')

  assert.equal(charmSource(CHARMS[1], SHOES[0]), '/models/charms/star-charm.glb')
  assert.equal(charmSource(CHARMS[1], SHOES[1]), '/models/charms/air-max/star-charm.glb')

  const calls = []
  const upper = {
    pbrMetallicRoughness: {
      setBaseColorFactor: color => calls.push(color),
    },
  }
  const model = {
    getMaterialByName: name => name === 'UpperMaterial' ? upper : null,
  }

  assert.equal(setMaterialColor(model, 'UpperMaterial', '#245fa8'), true)
  assert.deepEqual(calls, ['#245fa8'])
  assert.equal(setMaterialColor(model, 'MissingMaterial', '#ffffff'), false)
})

test('shows only the selected charm and hides every charm for none', () => {
  assert.deepEqual(CHARMS, [
    { id: 'none', label: 'None', src: null },
    { id: 'star', label: 'Star', src: '/models/charms/star-charm.glb' },
    { id: 'lightning', label: 'Lightning', src: '/models/charms/lightning-charm.glb' },
    { id: 'k-tag', label: 'K tag', src: '/models/charms/k-tag-charm.glb' },
  ])

  assert.equal(charmScale('star', 'star'), '1 1 1')
  assert.equal(charmScale('star', 'star', '0.25 0.25 0.25'), '0.25 0.25 0.25')
  assert.equal(charmScale('lightning', 'star'), '0 0 0')
  assert.equal(charmScale('k-tag', 'none'), '0 0 0')
})

test('buildPartColorway repeats a short palette across every editable part', () => {
  const chalk = { name: 'Chalk', value: '#f1efe8' }
  const graphite = { name: 'Graphite', value: '#292b2d' }

  assert.deepEqual(buildPartColorway(PARTS.slice(0, 3), [chalk, graphite]), {
    upper: chalk,
    'toe-cap': graphite,
    tongue: chalk,
  })
  assert.deepEqual(buildPartColorway(PARTS, []), {})
})
