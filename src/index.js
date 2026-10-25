/** easy2learn Cordis 插件入口：Loader 元数据 + 工具注册（参照 dsh-office-plugin 规范） */
import { resolveConfig } from './config.js'
import { buildTools } from './tools.js'
import { ensureServer, stopServer } from './server.js'

export const name = 'tool-easy2learn'
export const inject = ['tools']

export function apply(ctx, config = {}) {
  const resolved = resolveConfig(config)
  for (const definition of buildTools(resolved)) ctx.tools.register(definition)
  // 跟随宿主启动：面板 iframe 常驻可见，服务不能等第一次工具调用才拉起。
  // 失败只记日志（如端口被非 easy2learn 进程占用），不影响宿主与其余工具；
  // 配置 autoStart: false 可关闭自启，回到按需启动。
  if (config.autoStart !== false) {
    ensureServer(resolved).catch((err) => console.error(`[easy2learn] 自启失败: ${err.message}`))
  }
  ctx.on('dispose', () => {
    stopServer().catch(() => {})
  })
}
