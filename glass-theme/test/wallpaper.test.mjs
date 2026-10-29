import test from 'node:test'
import assert from 'node:assert/strict'

const mod = await import('../src/shared/wallpaper.ts')

test('mediaFromName knows images and videos', () => {
  assert.equal(mod.mediaFromName('a.jpg'), 'image')
  assert.equal(mod.mediaFromName('A.PNG'), 'image')
  assert.equal(mod.mediaFromName('clip.webm'), 'video')
  assert.equal(mod.mediaFromName('clip.MP4'), 'video')
  assert.equal(mod.mediaFromName('readme.txt'), null)
})

test('isSafeFileName rejects traversal and odd names', () => {
  assert.equal(mod.isSafeFileName('wallpaper-1.jpg'), true)
  assert.equal(mod.isSafeFileName('../x.jpg'), false)
  assert.equal(mod.isSafeFileName('a/b.jpg'), false)
  assert.equal(mod.isSafeFileName('a\\b.jpg'), false)
  assert.equal(mod.isSafeFileName(''), false)
  assert.equal(mod.isSafeFileName('a:b.jpg'), false)
})

test('buildWallpaperName stamps the time and keeps the extension', () => {
  const name = mod.buildWallpaperName('.jpg', new Date('2026-10-26T10:20:30.456Z'))
  assert.equal(name, 'wallpaper-20261026-102030-456.jpg')
  assert.equal(mod.mediaFromName(name), 'image')
})

test('detectMediaFromMagic reads image and video headers', () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0])
  const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0])
  const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])
  const mp4 = new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32])
  const avif = new Uint8Array([0, 0, 0, 0x1c, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66])
  const avis = new Uint8Array([0, 0, 0, 0x1c, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x73])
  const webmv = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0])
  const text = new Uint8Array([0x68, 0x65, 0x6c, 0x6c, 0x6f, 0, 0, 0])
  assert.equal(mod.detectMediaFromMagic(png), 'image')
  assert.equal(mod.detectMediaFromMagic(jpg), 'image')
  assert.equal(mod.detectMediaFromMagic(webp), 'image')
  assert.equal(mod.detectMediaFromMagic(avif), 'image')
  assert.equal(mod.detectMediaFromMagic(avis), 'image')
  assert.equal(mod.detectMediaFromMagic(mp4), 'video')
  assert.equal(mod.detectMediaFromMagic(webmv), 'video')
  assert.equal(mod.detectMediaFromMagic(text), null)
})

test('mimeFor maps an extension to the served content type', () => {
  assert.equal(mod.mimeFor('a.jpg'), 'image/jpeg')
  assert.equal(mod.mimeFor('a.webp'), 'image/webp')
  assert.equal(mod.mimeFor('a.mp4'), 'video/mp4')
  assert.equal(mod.mimeFor('a.webm'), 'video/webm')
  assert.equal(mod.mimeFor('a.avif'), 'image/avif')
  assert.equal(mod.mimeFor('a.txt'), 'application/octet-stream')
})
