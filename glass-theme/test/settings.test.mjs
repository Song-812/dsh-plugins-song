import test from 'node:test'
import assert from 'node:assert/strict'

const mod = await import('../src/shared/settings.ts')

test('defaults match the confirmed look', () => {
  assert.deepEqual(mod.DEFAULT_SETTINGS, {
    accent: '#F077AF',
    blur: 4,
    frost: 55,
    wallpaperBlur: 0,
    wallpaperFrost: 20,
    videoBlur: 6,
    videoBrightness: 45,
    bgBrightness: 50,
    press: true,
    spotlight: true,
  })
})

test('normalizeSettings clamps out-of-range numbers', () => {
  const s = mod.normalizeSettings({
    blur: 999, frost: -5, wallpaperBlur: 41, wallpaperFrost: 300,
    videoBlur: -2, videoBrightness: 101, bgBrightness: 49.6,
  })
  assert.equal(s.blur, 40)
  assert.equal(s.frost, 0)
  assert.equal(s.wallpaperBlur, 40)
  assert.equal(s.wallpaperFrost, 100)
  assert.equal(s.videoBlur, 0)
  assert.equal(s.videoBrightness, 100)
  assert.equal(s.bgBrightness, 50)
})

test('normalizeSettings rounds numbers and keeps booleans', () => {
  const s = mod.normalizeSettings({ blur: 4.6, press: false, spotlight: 'no' })
  assert.equal(s.blur, 5)
  assert.equal(s.press, false)
  assert.equal(s.spotlight, true)
})

test('normalizeSettings rejects a non-hex accent', () => {
  assert.equal(mod.normalizeSettings({ accent: 'pink' }).accent, '#F077AF')
  assert.equal(mod.normalizeSettings({ accent: '#4d7cfe' }).accent, '#4D7CFE')
})

test('normalizeSettings ignores junk objects', () => {
  assert.deepEqual(mod.normalizeSettings(null), mod.DEFAULT_SETTINGS)
  assert.deepEqual(mod.normalizeSettings('x'), mod.DEFAULT_SETTINGS)
  assert.deepEqual(mod.normalizeSettings([]), mod.DEFAULT_SETTINGS)
})

test('parseSettings falls back on broken JSON', () => {
  assert.deepEqual(mod.parseSettings('{oops'), mod.DEFAULT_SETTINGS)
  assert.deepEqual(mod.parseSettings(null), mod.DEFAULT_SETTINGS)
})

test('parseSettings reads a stored value', () => {
  const stored = JSON.stringify({ ...mod.DEFAULT_SETTINGS, blur: 12, accent: '#1FA6B8' })
  assert.equal(mod.parseSettings(stored).blur, 12)
  assert.equal(mod.parseSettings(stored).accent, '#1FA6B8')
})

test('legacy knobs migrate, removed features are ignored', () => {
  const legacy = new Map([
    ['dsh.ui-aqua.blur', '7'],
    ['dsh.ui-aqua.frost', '33'],
    ['dsh.ui-aqua.wallpaperBlur', '2'],
    ['dsh.ui-aqua.wallpaperFrost', '18'],
    ['dsh.ui-aqua.videoBlur', '3'],
    ['dsh.ui-aqua.videoBrightness', '60'],
    ['dsh.ui-aqua.bgBrightness', '55'],
    ['dsh.ui-aqua.press', 'false'],
    ['dsh.ui-aqua.spotlight', 'true'],
    ['dsh.ui-aqua.mode', 'compat'],
    ['dsh.ui-aqua.enabled', 'false'],
    ['dsh.ui-aqua.wallpaper', 'data:image/jpeg;base64,AAAA'],
  ])
  const got = mod.migrateLegacy((key) => legacy.get(key) ?? null)
  assert.deepEqual(got.settings, {
    accent: '#F077AF',
    blur: 7,
    frost: 33,
    wallpaperBlur: 2,
    wallpaperFrost: 18,
    videoBlur: 3,
    videoBrightness: 60,
    bgBrightness: 55,
    press: false,
    spotlight: true,
  })
  assert.equal(got.wallpaper, 'data:image/jpeg;base64,AAAA')
})

test('legacy migration with an empty store keeps defaults', () => {
  const got = mod.migrateLegacy(() => null)
  assert.deepEqual(got.settings, mod.DEFAULT_SETTINGS)
  assert.equal(got.wallpaper, null)
})

test('inkFor picks a readable label colour', () => {
  assert.equal(mod.inkFor('#FFFFFF'), '#13243E')
  assert.equal(mod.inkFor('#F077AF'), '#13243E')
  assert.equal(mod.inkFor('#1F2329'), '#FFFFFF')
  assert.equal(mod.inkFor('#4D7CFE'), '#FFFFFF')
})
