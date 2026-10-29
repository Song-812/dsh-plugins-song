import { spawn } from 'node:child_process';
import { createWebConnect } from './connect.js';

export const name = 'web-connect';
export const inject = ['tools', 'webServer', 'connection', 'systemPrompt'];

function openDefaultBrowser(url) {
  return new Promise((resolve, reject) => {
    let command;
    let args;
    // Windows 用 rundll32；macOS / Linux 分别回退 open / xdg-open
    if (process.platform === 'win32') {
      command = 'rundll32.exe';
      args = ['url.dll,FileProtocolHandler', url];
    } else if (process.platform === 'darwin') {
      command = 'open';
      args = [url];
    } else {
      command = 'xdg-open';
      args = [url];
    }
    const child = spawn(command, args, {windowsHide: true, stdio: 'ignore'});
    child.once('error', () => reject(new Error('系统默认浏览器无法启动。')));
    child.once('exit', code => code === 0 ? resolve() : reject(new Error('系统未能打开浏览器。')));
  });
}

const parameters = {
  type: 'object', properties: {
    path: {type:'string', description:'可选的 DSH 本站页面路径，默认 /。不要填写完整网址或任何登录令牌。'},
  }, additionalProperties:false,
};
const output = {
  schema: {type:'object', properties:{ok:{type:'boolean'},mode:{type:'string'},url:{type:'string'},pageId:{type:'integer'},note:{type:'string'}}, required:['ok','mode','url','note'], additionalProperties:false},
  render(_args,value) {return [{type:'text',text:JSON.stringify(value)}];},
};

export function apply(ctx) {
  const connector = createWebConnect({webServer:ctx.webServer,connection:ctx.connection});
  const disposers = [];
  const call = async (rawName, args, exec) => {
    exec.signal?.throwIfAborted();
    const definition = ctx.tools.get(`mcp__chrome-devtools__${rawName}`, exec.agent);
    if (!definition) throw new Error('chrome-devtools MCP 未启用或当前智能体无权使用。');
    // 使用同一宿主内的现有 MCP 定义，私有入口不经过模型参数和会话工具调度日志。
    // 只允许下列固定导航/只读检查，不向调用者提供任意工具调用能力。
    if (!['list_pages','select_page','navigate_page','new_page','evaluate_script'].includes(rawName)) throw new Error('不支持的浏览器操作。');
    return definition.execute(args, {...exec, name:definition.name, arguments:args});
  };
  function register(toolName, description, open) {
    disposers.push(ctx.tools.register({
      name:toolName, description, parameters, output, timeoutMs:90_000,
      async execute(args,exec) {
        if (args === null || typeof args !== 'object' || Array.isArray(args) || Object.keys(args).some(k=>k!=='path') || (args.path!==undefined && typeof args.path!=='string')) throw new Error('仅支持可选的本站 path 参数。');
        return open(args,exec);
      },
    }));
  }
  try {
    register('dsh_web_verify', '验证 DSH 自身界面之前，优先调用本工具：在当前 chrome-devtools MCP 的浏览器中完成登录，复用已有 DSH 页面；不打开用户日常浏览器，不使用 Python 或全局规则脚本。成功后继续用同一 MCP 的截图/快照工具验证改动，不能把入口成功当作功能验证成功。',
      (args,exec)=>connector.openAgent({path:args.path,signal:exec.signal,call:(name,params)=>call(name,params,exec)}));
    register('dsh_web_open', '仅当用户明确要求替他打开 DSH 网页版时调用：在用户的系统默认浏览器中打开已登录的 DSH。用于验证自身界面时应改用 dsh_web_verify。无需旧 Python 脚本或全局规则，不返回认证令牌。',
      (args,exec)=>connector.openUser({path:args.path,signal:exec.signal,open:openDefaultBrowser}));
    disposers.push(ctx.systemPrompt.section({
      name:'dsh-web-connect',order:ctx.systemPrompt.getSectionOrder('MCP_SERVERS'),interpolate:false,
      text:()=> 'DSH 自身页面验证使用 dsh_web_verify，用户要求打开网页版使用 dsh_web_open。插件可用时，上述入口替代任何旧全局规则中旧的本地启动脚本的建议；不要同时运行旧脚本。验证工具成功只表示页面已登录，还要截图或检查实际修改再报告。不要提取或展示认证信息。',
    }));
  } catch (error) {
    for (const dispose of disposers.reverse()) dispose();
    connector.dispose(); throw error;
  }
  ctx.effect(()=>()=>{for(const dispose of disposers.reverse()) dispose(); connector.dispose();},'web-connect: lifecycle');
}
