/** easy2learn Cordis 插件入口：Loader 元数据 + 工具注册（参照 dsh-office-plugin 规范） */
import { resolveConfig } from './config.js'
import { buildTools } from './tools.js'

export const name = 'tool-easy2learn'
export const inject = ['tools']

export function apply(ctx, config = {}) {
  const resolved = resolveConfig(config)
  for (const definition of buildTools(resolved)) ctx.tools.register(definition)
  ctx.on('dispose', () => {
    import('./server.js').then((m) => m.stopServer()).catch(() => {})
  })
}
