/** easy2learn 配置解析（无依赖，纯 JS） */
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PLUGIN_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

export function resolveConfig(config = {}) {
  const port = clampInt(config.port, 8788, 1024, 65535)
  const dataDir = path.join(PLUGIN_DIR, 'data')
  const bankPath = path.resolve(
    PLUGIN_DIR,
    typeof config.bankPath === 'string' && config.bankPath ? config.bankPath : 'data/bank.json',
  )
  const graphPath = path.resolve(dataDir, 'graph.json')
  const extraPath = path.resolve(dataDir, 'graph-extra.json')
  const root = path.resolve(
    typeof config.root === 'string' && config.root ? config.root : path.dirname(PLUGIN_DIR),
  )
  return { port, bankPath, graphPath, extraPath, root, pluginDir: PLUGIN_DIR, webDir: path.join(PLUGIN_DIR, 'web') }
}

function clampInt(v, fallback, min, max) {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : fallback
  return Math.min(max, Math.max(min, n))
}
