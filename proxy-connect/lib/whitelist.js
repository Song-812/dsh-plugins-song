/**
 * 「要走代理」的域名名单 —— **两条路共用**：抓网页（provider.js）与模型出网
 * （egress-routing.js）。
 *
 * 只存域名、不存时间：这份名单按设计永久有效（设计约定），
 * 增删由使用者决定（本插件不提供编辑界面），所以插件不做界面，也不设过期。
 *
 * 域名匹配按标签边界：条目 `openai.com` 会连同 `api.openai.com` 一起覆盖，
 * 但 `notopenai.com` 不算命中。
 */
import { randomBytes } from 'node:crypto'
import { readFile, rename, unlink, writeFile } from 'node:fs/promises'

/**
 * 每个名单文件一份「最后已知好名单」：文件写坏或暂时不存在时沿用它，
 * 敏感域名不会因为一次坏写就掉回直连（与 egress-whitelist 的策略一致，
 * README 里「写坏保留上一份好名单」对抓网页这条路同样成立）。
 */
const lastKnownGood = new Map()

/** 首读就坏、且警告已经打过的文件：同一份文件只警告一次，不刷屏。 */
const warnedBroken = new Set()

/**
 * 读取名单（路由判活用）。文件缺失或内容损坏时先沿用上一份好名单；
 * 连好名单都没有（比如启动首读就坏了）才退回空名单，并打印醒目警告。
 */
export async function loadWhitelist(filePath) {
	let raw
	try {
		raw = await readFile(filePath, 'utf8')
	} catch (error) {
		return degradeToLastKnownGood(filePath, error)
	}
	const hosts = parseHosts(raw)
	if (hosts === null) {
		return degradeToLastKnownGood(filePath, new Error('内容损坏（不是合法的 JSON 数组）'))
	}
	lastKnownGood.set(filePath, hosts)
	warnedBroken.delete(filePath)
	return new Set(hosts)
}

/** 读不了或内容坏了：有上一份好名单就沿用；没有才警告一次并按空名单处理。 */
function degradeToLastKnownGood(filePath, error) {
	const previous = lastKnownGood.get(filePath)
	if (previous !== undefined) return new Set(previous)
	warnBrokenOnce(filePath, error)
	return new Set()
}

function warnBrokenOnce(filePath, error) {
	if (warnedBroken.has(filePath)) return
	warnedBroken.add(filePath)
	console.warn(
		`⚠️ [代理连接] 白名单文件读取失败，且没有上一份好名单可沿用，暂时按空名单处理：${filePath}；错误：${error?.message ?? error}`,
	)
}

/**
 * 读取名单（读改写用）：读不了、或内容坏了都要抛错，绝不当空名单。
 *
 * 否则「名单坏掉 / 一时读不到」之后的第一次自动登记，会用单个新域名覆盖掉整份名单，
 * 连模型出网那条规则也一起丢。
 */
async function readForUpdate(filePath) {
	let raw
	try {
		raw = await readFile(filePath, 'utf8')
	} catch (error) {
		if (error && error.code === 'ENOENT') return new Set()
		throw error
	}
	const hosts = parseHosts(raw)
	if (hosts === null) throw new Error(`whitelist 文件内容坏了，拒绝覆盖：${filePath}`)
	return hosts
}

/** 每个名单文件一条串行链：两个网页同时回退代理时，读改写不能交叉。 */
const queues = new Map()

function withLock(filePath, task) {
	const previous = queues.get(filePath) ?? Promise.resolve()
	const next = previous.then(task, task)
	queues.set(filePath, next.catch(() => {}))
	return next
}

/** 把一个域名登记进名单。已在名单里时不重写文件；同一文件的读改写串行执行。 */
export async function addHost(filePath, host) {
	const normalized = normalizeHost(host)
	if (normalized.length === 0) return
	await withLock(filePath, async () => {
		const hosts = await readForUpdate(filePath)
		if (!hosts.has(normalized)) {
			hosts.add(normalized)
			await saveHosts(filePath, hosts)
		}
		// 刚读到/写出的就是「上一份好名单」：文件接下来哪怕立刻坏掉，也不丢这次登记。
		lastKnownGood.set(filePath, hosts)
	})
}

/**
 * 一个主机名是否被某个名单条目覆盖。
 * @param host - 待判定的主机名（大小写、前导点都会归一化）。
 * @param entry - 名单条目。
 * @returns 命中为 true。
 */
export function matchesHost(host, entry) {
	const target = normalizeHost(host)
	const pattern = normalizeHost(entry)
	if (target.length === 0 || pattern.length === 0) return false
	return target === pattern || target.endsWith(`.${pattern}`)
}

/**
 * 名单里是否有任何条目覆盖这个主机名。
 * @param whitelist - 域名集合。
 * @param host - 待判定的主机名。
 * @returns 命中为 true。
 */
export function covers(whitelist, host) {
	for (const entry of whitelist) {
		if (matchesHost(host, entry)) return true
	}
	return false
}

/** 域名统一小写、去空白、去前导点：读取、登记、比对共用同一套写法，三处不会漂移。 */
export function normalizeHost(value) {
	if (typeof value !== 'string') return ''
	return value.trim().toLowerCase().replace(/^\.+/, '')
}

/** 解析名单；内容不合法时返回 null（调用方自己决定是当空名单还是拒绝）。 */
function parseHosts(raw) {
	let parsed
	try {
		parsed = JSON.parse(raw)
	} catch {
		return null
	}
	if (!Array.isArray(parsed)) return null
	return new Set(parsed.map(normalizeHost).filter((entry) => entry.length > 0))
}

/** 原子写：先写同目录临时文件再整体替换，写一半失败也不会留下半截名单。 */
async function saveHosts(filePath, hosts) {
	const temp = `${filePath}.tmp-${process.pid}-${Date.now()}-${randomBytes(3).toString('hex')}`
	try {
		await writeFile(temp, `${JSON.stringify([...hosts], null, '\t')}\n`, 'utf8')
		await rename(temp, filePath)
	} catch (error) {
		try {
			await unlink(temp)
		} catch {
			// 临时文件可能压根没建出来。
		}
		throw error
	}
}
