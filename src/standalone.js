/** 独立运行（不依赖 DSH 宿主）：node src/standalone.js [port] */
import { resolveConfig } from './config.js'
import { ensureServer } from './server.js'

const port = Number(process.argv[2]) || undefined
const config = resolveConfig(port ? { port } : {})

try {
  const status = await ensureServer(config)
  if (!status.running) {
    console.error('启动失败:', status)
    process.exit(1)
  }
  console.log(`easy2learn 已启动: ${status.url}`)
  console.log(`题库: ${config.bankPath}（${status.questions} 题）`)
  console.log('Ctrl+C 退出')
} catch (err) {
  if (err.code === 'EADDRINUSE') {
    console.error(`端口 ${config.port} 已被占用：页面多半已经在运行 http://127.0.0.1:${config.port}/`)
    process.exit(0)
  }
  console.error('启动失败:', err.message)
  process.exit(1)
}
