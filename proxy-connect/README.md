# 代理连接 · dsh-proxy-connect

[English](README.en.md) | 简体中文

一个开关、一份名单，管两条出网的路：

| 走哪条路 | 规则 |
| --- | --- |
| **抓网页**（`web_fetch`） | 名单里的域名直接走代理；名单外先直连，2 秒连不上才转代理，**转成功就把域名记进名单**（有累计门槛，见下文） |
| **模型出网**（模型、HTTP MCP、其他插件等 Node 侧流量） | 名单里的域名走代理；其余一律直连——**不重试、不登记**，所以代理关着也不影响国内服务 |

仓库自带 `whitelist.example.json`；首次使用请复制为同目录下的 `whitelist.json`（也可装好后由插件按需自建）。两条路共用 `whitelist.json` 与插件面板里的那一个启停开关。本插件**没有**单独设置页。

- 作者：Song-812
- 版本：1.0.0
- 许可证：MIT

## 行为

```
抓网页
  ├─ 域名在 whitelist.json 里（按域名后缀匹配，子域名一并覆盖）→ 直接走代理
  └─ 不在名单里 → 直连
        ├─ 通了 → 返回结果（什么都不记）
        └─ 2 秒内没连上 → 转走代理
              ├─ 通了 → 累计达标后把域名记进名单，返回结果
              └─ 不通 → 抛出带原因的错（端口没人听会提示代理大概没开着）

模型出网
  ├─ 域名在名单里 → 交给 ProxyAgent（走代理）
  ├─ 本机地址（localhost / 127.0.0.0/8 / ::1）→ 永远直连
  ├─ 非 http(s) 协议 → 直连
  └─ 其余 → 直连（连接池照常复用）
```

只有「压根没连上」（`ECONNREFUSED`、`UND_ERR_CONNECT_TIMEOUT` 等）才回退；用户取消、DSH 策略拒绝、目标服务器正常回 4xx/5xx 都不回退——4xx/5xx 本身就是结果，不抛错。

「该不该回退」和「代理是不是没起来」是**两个不同的判断**，故意分开：`UND_ERR_HEADERS_TIMEOUT` 属于前者（该回退），但它恰恰说明代理是通的，所以不算后者。

## 边界

| 归它管 | 不归它管 |
| --- | --- |
| `web_fetch`（抓网页） | 浏览器（走系统代理） |
| 模型请求（含国外 API 域名） | shell 里的 git / npm 等 |
| HTTP MCP、其他插件的 Node 侧出网 | DSH 外壳与遥测（遥测按设计直连） |

**让位规则**：如果 DSH 自己已经通过 `https_proxy` / `http_proxy` / `all_proxy` 等环境变量配好了出网代理，本插件不接管模型出网那一半（只记一条诊断），避免两套策略互相覆盖。

## 代理地址与自动登记

- **代理地址**：默认 `http://127.0.0.1:7897`（常见 Clash 混合端口）。要换端口，二选一：
  - 环境变量 `DSH_PROXY_CONNECT_URL`（优先）
  - 或在插件目录放 `proxy.json`：`{ "proxyUrl": "http://127.0.0.1:7890" }`（已在 `.gitignore`，勿提交）
  - 只支持 http/https 代理；写错会忽略并退回默认值，原因记进 `debug.log`
- **自动登记门槛**：名单外的域名，直连失败而代理成功时，**同一域名 10 分钟内累计 3 次**才会永久写进 `whitelist.json`（一次抖动不会留下永久规则；直连成功一次就清零；计数只在内存里）。门槛常量：`lib/config.js` 的 `REGISTER_AFTER_FAILURES` / `REGISTER_WINDOW_MS`
- **名单监听**：监听名单所在目录（按文件名过滤）；文件暂时不存在不再每秒报错；监听建失败按 1s→30s 退避重试
- 需要 **Node ≥ 22.19**（undici 8 的要求；DSH 自带的 Node 24 满足）

## 名单文件

| 文件 | 说明 |
| --- | --- |
| `whitelist.example.json` | 示例起步名单（仓库只交这个） |
| `whitelist.json` | 运行时名单（需自行从 example 复制；可编辑，改完立刻生效） |
| `whitelist.example.json` | 开源包自带的**示例起步名单**（常见国外模型 / 文档域名）；可按需增删 |

开源包里的起步名单**不含**个人浏览痕迹。国内模型域名一般**不必**写入——不在名单里就是直连。

写 `anthropic.com` 会覆盖 `api.anthropic.com`（按标签边界的后缀匹配）。名单写坏或暂时不存在时**保留上一份好名单**；启动首读就损坏时会打印醒目警告。

## 文件结构

| 路径 | 作用 |
| --- | --- |
| `lib/index.js` | 装配两条路，并把事实写进 `debug.log` |
| `lib/plugin.js` | 抓网页：启用时接管抓取器，停用时交还 |
| `lib/provider.js` | 抓网页直连 / 代理决策与报错措辞 |
| `lib/egress.js` | 模型出网：实时名单 → 分诊台 → 卸载 |
| `lib/egress-routing.js` | 模型出网分流（默认直连、名单走代理、本机不走） |
| `lib/egress-whitelist.js` | 实时名单：严格读取、监听刷新、写坏保留上一份 |
| `lib/egress-dispatcher.js` | 全局出网分诊台（**每次请求**重新判定） |
| `lib/failure-tracker.js` | 自动登记的失败计数（内存、带时间窗） |
| `lib/profile-web-config.js` | 停用 / 启用时改写 profile 的 `fetchProvider` |
| `lib/fetch-url.js` | 重定向、大小上限、内容类型 |
| `lib/undici-transport.js` | undici 适配（直连 Agent / 代理 ProxyAgent） |
| `lib/whitelist.js` | 名单读写、域名归一化与后缀匹配 |
| `lib/fallback.js` | 两种失败分类 |
| `lib/config.js` | 端口、超时、上限等常量 |
| `cordis.patch.yml` | bundle patch（行 id = 包名） |
| `test/*.mjs` | 离线自测（多数不需网络） |

## 启用与停用

两个方向都以 `configEditor` 为首选，失败时退回文件级写入（启用 / 停用发生在 HMR 事务里时，嵌套 `configEditor` 会报错）：

| 方向 | 首选 | 失败时退回 |
| --- | --- | --- |
| 启用（claim） | `configEditor` 改写 `fetchProvider` | 改文件：内置实现 → `proxy-connect`；缺行时补在 `web` 段末尾；隔 400ms 再写一遍（幂等） |
| 停用（handBack） | —— | 改文件：`proxy-connect` → `http`（绝不新增行）；隔 400ms 再写一遍 |

写回是 CAS 式的：改名前重读比对，发现窗口里 DSH 刚写入了别的行就基于新内容重试（最多 3 次）。

## 安装与开发

1. 在本目录执行 `npm install`（需要自带的 **undici**；DSH profile 解析路径里没有它）
2. 在 DSH 插件面板装本目录，或 `plugin_manager install_bundle` 指向本目录
3. **重启一次 DSH**；之后在插件面板里开 / 关即可

插件自带 `cordis.patch.yml`；profile 里**不要**再插一次同样的行。

改了 `lib/` 下任何文件后必须**整机重启 DSH**（ESM 已缓存，面板里关掉再打开不够）。

```bash
cd proxy-connect
npm install
npm test   # node --test
```

除少量集成测试外不需要网络；集成测试会探测本机代理端口是否在听，Clash 关着时「国内端点仍直连 / 名单内快速失败」一类用例仍应通过。

## 已知限制

1. 改源码后必须整机重启 DSH，不能只靠插件面板重载。
2. profile 的 `cordis.patch.yml` 由 DSH 掌管，可能把外部手工写入盖回去；插件会在装载 / 切换时自己再写正确的 `fetchProvider`。
3. 不接管浏览器出网，也不接管 shell 里的 git / npm。
4. 不依赖 Windows 回收站；Windows / macOS / Linux 只要 Node ≥ 22.19 且代理可达即可。

## 改名记录

- 2026-10-26：目录名由旧名改为 `proxy-connect`（中文「代理连接」），包名 `dsh-proxy-switch` → `dsh-proxy-connect`，抓取器 id 同步为 `proxy-connect`；版本 1.0.0。

## 许可证

MIT，见仓库根目录 [LICENSE](../LICENSE)。© Song-812
