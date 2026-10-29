// dsh-msg-notify — Host half.
// 本插件是纯客户端插件：检测、发声、设置页全在 lib/client.js 里跑。
// 这个 host 行只为了让 bundle 的 cordis.patch.yml 能按包名注册（Node 解析需要 main），
// 运行时不做任何事。
export const name = 'dsh-msg-notify'

export function apply() {
  // 有意留空。
}
