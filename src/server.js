/**
 * easy2learn 服务端（零依赖）：
 * - 静态托管 web/（禁缓存，agent 改前端文件即时可见）
 * - 题库 API：GET /api/state、POST/PUT/DELETE /api/questions
 * - 图谱 API：GET /api/graph（内存态，来自 data/graph.json）
 * - 本地判题：POST /api/run
 * - 笔记读取：GET /api/notes?p=...（限制在 root 允许范围内）
 * - SSE 热更新：GET /api/events
 *   · bank  = 题库变更（工具/API/直接改文件）
 *   · graph = 知识图谱变更（regen/直接改文件）
 *   · notes = 笔记 md 被编辑（提示需要 regen，学习页会顺带重拉 graph）
 *   · reload = web/ 前端文件变更 → 页面整页刷新
 */
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { BankError, loadBank, normalizeBank, nextId, saveBank, validateQuestion } from './bank.js'
import { GraphError, buildGraphFromNotes, loadGraph, saveGraph } from './graph.js'
import { availableLangs, runSubmission } from './runner.js'

let current = null

/** 供工具直接读取当前服务状态（未启动返回 null） */
export function getLiveState() {
  return current ? current.state : null
}

/** 供工具直接变更题库：fn(bank) => result，自动落盘并广播 SSE bank */
export function mutateBank(fn) {
  if (!current) throw new BankError('服务未启动')
  syncBankFromDisk(current.state) // 磁盘被外部改过（如 gen-bank 重写）则先重载，避免旧内存覆盖磁盘
  const out = fn(current.state.bank)
  persist(current.state, current.server._e2lClients)
  return out
}

/** 供工具直接变更图谱：fn(graph) => result，自动落盘并广播 SSE graph */
export function mutateGraph(fn) {
  if (!current) throw new GraphError('服务未启动')
  const out = fn(current.state.graph)
  persistGraph(current.state, current.server._e2lClients)
  return out
}

/** 供工具整体替换图谱（如 regen 后）：落盘 + 广播 */
export function applyGraph(graph) {
  if (!current) throw new GraphError('服务未启动')
  current.state.graph = graph
  persistGraph(current.state, current.server._e2lClients)
  return { topics: graph.topics.length }
}

export function serverStatus() {
  if (!current) return { running: false }
  const { server, state } = current
  return {
    running: true,
    port: state.port,
    url: `http://127.0.0.1:${state.port}/`,
    uptimeMs: Date.now() - state.startedAt,
    questions: state.bank.questions.length,
    graphTopics: (state.graph.topics || []).map((t) => ({ id: t.id, nodes: t.nodes.length, edges: t.edges.length })),
    topics: state.bank.topics.map((t) => t.id),
    lastBankChange: state.lastBankChange,
    lastGraphChange: state.lastGraphChange,
    clients: server._e2lClients ? server._e2lClients.size : 0,
  }
}

export async function ensureServer(config) {
  if (current) {
    if (config.port !== current.state.port) {
      return { ...serverStatus(), note: `服务已在 ${current.state.port} 端口运行，忽略新端口 ${config.port}` }
    }
    return serverStatus()
  }
  // 端口上已有独立进程在服务（如 standalone 启动的）→ 直接复用
  try {
    const res = await fetch(`http://127.0.0.1:${config.port}/api/state`, { signal: AbortSignal.timeout(1500) })
    if (res.ok) {
      const state = await res.json()
      return {
        running: true,
        port: config.port,
        url: `http://127.0.0.1:${config.port}/`,
        questions: state.questions?.length ?? 0,
        topics: (state.topics || []).map((t) => t.id),
        note: '检测到该端口已有 easy2learn 进程，直接复用（工具走 HTTP 或文件生效）',
      }
    }
  } catch {}
  await startServer(config)
  return serverStatus()
}

export async function stopServer() {
  if (!current) return { stopped: false }
  const { server, watcher } = current
  if (watcher) for (const w of watcher) try { w.close() } catch {}
  await new Promise((resolve) => server.close(resolve))
  for (const [, res] of server._e2lClients || new Map()) try { res.end() } catch {}
  current = null
  return { stopped: true }
}

async function startServer(config) {
  const state = {
    ...config,
    bank: loadBank(config.bankPath),
    graph: loadGraph(config.graphPath),
    bankRaw: '', // 磁盘上"我们所知"的题库原文；写操作前据此检测外部修改
    startedAt: Date.now(),
    lastBankChange: null,
    lastGraphChange: null,
  }
  try {
    state.bankRaw = fs.readFileSync(config.bankPath, 'utf8')
  } catch {
    state.bankRaw = ''
  }
  const clients = new Set()
  const server = http.createServer((req, res) => handle(req, res, state, clients))
  server._e2lClients = clients
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(state.port, '127.0.0.1', resolve)
  })

  const debounce = { web: null }
  const dataTimers = new Map() // 按文件名各自 debounce：bank 与 graph 在同一窗口内先后变化时互不吞事件
  const watchers = []
  // data 目录：bank.json / graph.json / graph-extra.json 被外部直接修改 → 分别重载并广播
  try {
    const bankName = path.basename(state.bankPath)
    const graphName = path.basename(state.graphPath)
    const extraName = path.basename(state.extraPath)
    const onDataFile = (name) => {
      if (!current) return
      if (name === bankName) {
        if (Date.now() - (state.lastSelfSave || 0) < 400) return // 自己刚落盘，跳过
        try {
          state.bank = loadBank(state.bankPath)
          try { state.bankRaw = fs.readFileSync(state.bankPath, 'utf8') } catch {}
          state.lastBankChange = new Date().toISOString()
          broadcast(clients, 'bank', { questions: state.bank.questions.length, at: state.lastBankChange })
        } catch (err) {
          broadcast(clients, 'error', { message: `题库重载失败: ${err.message}` })
        }
      } else if (name === graphName) {
        if (Date.now() - (state.lastSelfGraphSave || 0) < 400) return
        try {
          state.graph = loadGraph(state.graphPath)
          state.lastGraphChange = new Date().toISOString()
          broadcast(clients, 'graph', { at: state.lastGraphChange })
        } catch (err) {
          broadcast(clients, 'error', { message: `图谱重载失败: ${err.message}` })
        }
      } else if (name === extraName) {
        // graph-extra.json 直接被手改：立即重建内存图谱并落盘，页面才会真正看到新关联
        try {
          const graph = buildGraphFromNotes({ root: state.root, topics: state.bank.topics, extraPath: state.extraPath })
          state.graph = graph
          state.lastSelfGraphSave = Date.now() // 下面要写 graph.json，抑制随后 watcher 的自触发
          saveGraph(state.graphPath, graph)
          state.lastGraphChange = new Date().toISOString()
          broadcast(clients, 'graph', { at: state.lastGraphChange, via: 'graph-extra' })
        } catch (err) {
          broadcast(clients, 'error', { message: `graph-extra 变更后图谱重建失败: ${err.message}` })
        }
      }
    }
    watchers.push(
      fs.watch(path.dirname(state.bankPath), { recursive: false }, (_evt, file) => {
        const name = path.basename(String(file || ''))
        if (!name) return
        clearTimeout(dataTimers.get(name))
        dataTimers.set(name, setTimeout(() => {
          dataTimers.delete(name)
          onDataFile(name)
        }, 150))
      }),
    )
  } catch {}
  // 前端目录：agent 编辑 web/ 下文件 → 通知页面整页刷新（拿到新资源）
  try {
    watchers.push(
      fs.watch(state.webDir, { recursive: false }, () => {
        clearTimeout(debounce.web)
        debounce.web = setTimeout(() => {
          if (current) broadcast(clients, 'reload', { at: new Date().toISOString() })
        }, 150)
      }),
    )
  } catch {}

  // 笔记目录（notesRoots）：agent 编辑本地 md 笔记 → 学习页收到 notes 事件重拉内容
  debounce.notes = null
  for (const r of state.bank.notesRoots) {
    const dir = path.resolve(state.root, r)
    const fire = () => {
      clearTimeout(debounce.notes)
      debounce.notes = setTimeout(() => {
        if (current) broadcast(clients, 'notes', { at: new Date().toISOString() })
      }, 250)
    }
    try {
      watchers.push(fs.watch(dir, { recursive: true }, (_evt, file) => {
        if (file && file.endsWith('.DS_Store')) return
        fire()
      }))
    } catch {
      try { watchers.push(fs.watch(dir, { recursive: false }, fire)) } catch {}
    }
  }

  current = { server, state, watcher: watchers }
}

function broadcast(clients, event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  for (const res of clients) {
    try { res.write(payload) } catch { clients.delete(res) }
  }
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, headers)
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body))
}

function sendJson(res, status, obj) {
  send(res, status, obj, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
}

function readBody(req, limit = 5 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0
    let tooBig = false
    const chunks = []
    req.on('data', (c) => {
      size += c.length
      if (size > limit) {
        // 不再 destroy 连接：让 413 响应有机会送达客户端，多余数据直接丢弃
        if (!tooBig) {
          tooBig = true
          reject(Object.assign(new BankError('请求体过大'), { status: 413 }))
        }
        return
      }
      chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

async function handle(req, res, state, clients) {
  const url = new URL(req.url, `http://127.0.0.1:${state.port}`)
  const p = url.pathname
  try {
    if (req.method === 'GET' && p === '/api/events') return handleSse(req, res, clients)
    if (req.method === 'GET' && p === '/api/state') {
      return sendJson(res, 200, {
        meta: state.bank.meta,
        topics: state.bank.topics,
        notesRoots: state.bank.notesRoots,
        questions: state.bank.questions,
        graphTopics: (state.graph.topics || []).map((t) => ({ id: t.id, nodes: t.nodes.length, edges: t.edges.length })),
        langs: availableLangs(),
        serverTime: new Date().toISOString(),
      })
    }
    if (req.method === 'GET' && p === '/api/graph') {
      if (!state.graph.topics.length) {
        return sendJson(res, 404, { error: 'graph.json 为空，先运行 node scripts/gen-graph.mjs 或 easy2learn_graph regen' })
      }
      return sendJson(res, 200, state.graph)
    }
    if (req.method === 'GET' && p === '/api/notes') return handleNotes(url, res, state)
    if (req.method === 'POST' && p === '/api/questions') {
      syncBankFromDisk(state)
      const q = validateQuestion(JSON.parse(await readBody(req)), state.bank)
      q.id = nextId(state.bank)
      state.bank.questions.push(q)
      persist(state, clients)
      return sendJson(res, 201, { id: q.id, total: state.bank.questions.length })
    }
    const m = /^\/api\/questions\/([^/]+)$/.exec(p)
    if (m) {
      const id = decodeURIComponent(m[1])
      syncBankFromDisk(state)
      const idx = state.bank.questions.findIndex((q) => q.id === id)
      if (req.method === 'PUT' && idx >= 0) {
        const patch = JSON.parse(await readBody(req))
        const merged = { ...state.bank.questions[idx], ...patch, id }
        const q = validateQuestion(merged, state.bank)
        state.bank.questions[idx] = q
        persist(state, clients)
        return sendJson(res, 200, { id })
      }
      if (req.method === 'DELETE' && idx >= 0) {
        state.bank.questions.splice(idx, 1)
        persist(state, clients)
        return sendJson(res, 200, { deleted: id, total: state.bank.questions.length })
      }
      if (req.method === 'GET' && idx >= 0) return sendJson(res, 200, state.bank.questions[idx])
      return sendJson(res, 404, { error: `题目不存在: ${id}` })
    }
    if (req.method === 'POST' && p === '/api/run') {
      const body = JSON.parse(await readBody(req))
      const result = await runSubmission(body) // 异步判题：不阻塞其他请求
      return sendJson(res, result.error ? 400 : 200, result)
    }
    if (req.method === 'GET') return handleStatic(p, res, state)
    return sendJson(res, 404, { error: 'not found' })
  } catch (err) {
    // 客户端错误：BankError/畸形 JSON → 400；显式带 err.status（如 413）优先
    const status = err.status || (err instanceof BankError || err instanceof SyntaxError ? 400 : 500)
    if (status === 413) res.setHeader('Connection', 'close')
    sendJson(res, status, { error: err.message })
  }
}

/** 写题库前调用：磁盘原文与我们所知不一致（外部重写过）则先重载，杜绝旧内存覆盖磁盘丢题 */
function syncBankFromDisk(state) {
  let raw = ''
  try {
    raw = fs.readFileSync(state.bankPath, 'utf8')
  } catch {
    return // 磁盘读不到（被移走）：维持内存态，让 saveBank 重建
  }
  if (raw === state.bankRaw) return
  try {
    state.bank = normalizeBank(JSON.parse(raw))
    state.bankRaw = raw
  } catch (err) {
    throw new BankError(`磁盘题库解析失败，为避免覆盖已拒绝写入: ${err.message}`)
  }
}

function persist(state, clients) {
  saveBank(state.bankPath, state.bank)
  state.bankRaw = JSON.stringify(state.bank, null, 2) + '\n' // 与 saveBank 的写盘格式一致
  state.lastBankChange = new Date().toISOString()
  state.lastSelfSave = Date.now()
  broadcast(clients, 'bank', { questions: state.bank.questions.length, at: state.lastBankChange })
}

function persistGraph(state, clients) {
  saveGraph(state.graphPath, state.graph)
  state.lastGraphChange = new Date().toISOString()
  state.lastSelfGraphSave = Date.now()
  broadcast(clients, 'graph', { at: state.lastGraphChange })
}

function handleSse(req, res, clients) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-store',
    Connection: 'keep-alive',
  })
  res.write(`event: hello\ndata: {"ok":true}\n\n`)
  clients.add(res)
  const ping = setInterval(() => {
    // broadcast 里写失败会先删掉死客户端；interval 要跟着退出，不能空转到连接关闭
    if (!clients.has(res)) {
      clearInterval(ping)
      return
    }
    try { res.write(': ping\n\n') } catch {
      clients.delete(res)
      clearInterval(ping)
    }
  }, 15000)
  req.on('close', () => {
    clearInterval(ping)
    clients.delete(res)
  })
}

/** 读取本地 markdown 笔记：note 路径相对 root，notesRoots 是白名单目录前缀 */
function handleNotes(url, res, state) {
  const rel = String(url.searchParams.get('p') || '').trim()
  if (!rel) return sendJson(res, 400, { error: '缺少 p 参数' })
  const file = path.resolve(state.root, rel)
  const rootDirs = state.bank.notesRoots.length ? state.bank.notesRoots.map((r) => path.resolve(state.root, r)) : [state.root]
  const underAny = (f, dirs) => dirs.some((r) => f === r || f.startsWith(r + path.sep))
  if (!underAny(file, rootDirs) || path.extname(file).toLowerCase() !== '.md' || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    return sendJson(res, 403, { error: `路径不在允许的笔记根目录内或不可读: ${rel}` })
  }
  // symlink 防护：白名单目录里放软链也逃不出去——真实路径必须仍落在白名单的真实根内
  try {
    const realFile = fs.realpathSync(file)
    const realDirs = rootDirs.map((r) => fs.realpathSync(r))
    if (!underAny(realFile, realDirs)) {
      return sendJson(res, 403, { error: `路径经符号链接逃出笔记根目录: ${rel}` })
    }
  } catch {
    return sendJson(res, 403, { error: `路径不可读: ${rel}` })
  }
  return send(res, 200, JSON.stringify({ path: rel, text: fs.readFileSync(file, 'utf8') }), {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  })
}

function handleStatic(p, res, state) {
  const rel = p === '/' ? 'index.html' : p.replace(/^\/+/, '')
  const file = path.resolve(state.webDir, rel)
  if (file !== state.webDir && !file.startsWith(state.webDir + path.sep)) {
    return sendJson(res, 403, { error: 'forbidden' })
  }
  let body
  try {
    body = fs.readFileSync(file)
  } catch {
    return sendJson(res, 404, { error: 'not found' })
  }
  send(res, 200, body, {
    'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
    'Cache-Control': 'no-store', // agent 随时改前端，浏览器不许缓存
  })
}
