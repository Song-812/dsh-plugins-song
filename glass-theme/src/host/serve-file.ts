/**
 * 壁纸文件流式响应：只读客户端真正要的字节，不再整文件进内存。
 * 语义与旧版 readFileSync 实现一致：无 Range/不认识的写法 → 200 整流，
 * 合法区间 → 206 切片，越界 → 416。
 */
import fs from 'node:fs'
import { Readable } from 'node:stream'

export type ByteRange = { start: number; end: number }

/**
 * 解析 Range 头。null = 没写或格式不认识（回退整文件）；
 * 'unsatisfiable' = 区间不可满足（416）。
 */
export function parseByteRange(header: string, size: number): ByteRange | 'unsatisfiable' | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header)
  if (match === null) return null
  if (match[1] === '' && match[2] === '') return null
  if (match[1] === '') {
    const suffix = Number(match[2])
    if (!Number.isSafeInteger(suffix) || suffix <= 0 || size === 0) return 'unsatisfiable'
    return { start: Math.max(0, size - suffix), end: size - 1 }
  }
  const start = Number(match[1])
  const end = match[2] === '' ? size - 1 : Math.min(Number(match[2]), size - 1)
  if (Number.isSafeInteger(start) && Number.isSafeInteger(end) && start <= end && start < size) return { start, end }
  return 'unsatisfiable'
}

/**
 * 把磁盘文件按 Range 流式返回（200/206）。文件不存在等 stat 失败会抛错，
 * 由调用方决定映射（handleFile 映射为 500）。
 */
export function streamFile(file: string, type: string, rangeHeader: string | null): Response {
  const size = fs.statSync(file).size
  const range = rangeHeader === null ? null : parseByteRange(rangeHeader, size)
  if (range === 'unsatisfiable') {
    return new Response('range not satisfiable', {
      status: 416,
      headers: { 'content-range': `bytes */${size}` },
    })
  }
  const stream = range === null
    ? fs.createReadStream(file)
    : fs.createReadStream(file, { start: range.start, end: range.end })
  // 磁盘中途出错时避免未处理的 error 事件把进程打翻；Readable.toWeb 会把错误转给消费方。
  stream.on('error', () => {
    if (!stream.destroyed) stream.destroy()
  })
  const headers: Record<string, string> = {
    'content-type': type,
    'accept-ranges': 'bytes',
    'cache-control': 'no-store',
  }
  if (range === null) {
    headers['content-length'] = String(size)
  } else {
    headers['content-range'] = `bytes ${range.start}-${range.end}/${size}`
    headers['content-length'] = String(range.end - range.start + 1)
  }
  return new Response(Readable.toWeb(stream) as ReadableStream, {
    status: range === null ? 200 : 206,
    headers,
  })
}
