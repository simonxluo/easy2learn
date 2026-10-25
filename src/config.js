/** easy2learn 配置解析（无依赖，纯 JS） */
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PLUGIN_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

export function resolveConfig(config = {}) {
  const port = clampInt(config.port, 8788, 1024, 65535)
  const basePath = normalizeBasePath(config.basePath)
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
  return { port, basePath, bankPath, graphPath, extraPath, root, pluginDir: PLUGIN_DIR, webDir: path.join(PLUGIN_DIR, 'web') }
}

/** 子路径部署前缀（如 /easy2learn）： 表示根路径部署 */
function normalizeBasePath(v) {
  if (typeof v !== 'string') return ''
  let b = v.trim()
  if (!b) return ''
  if (!b.startsWith('/')) b = '/' + b
  return b.replace(/\/+$/, '')
}

function clampInt(v, fallback, min, max) {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : fallback
  return Math.min(max, Math.max(min, n))
}
