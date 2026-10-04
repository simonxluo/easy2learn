/**
 * easy2learn 服务端（零依赖）：
 * - 静态托管 web/（禁缓存，agent 改前端文件即时可见）
 * - 题库 API：GET /api/state、POST/PUT/DELETE /api/questions
 * - 本地判题：POST /api/run
 * - 笔记读取：GET /api/notes?p=...（限制在 root 允许范围内）
 * - SSE 热更新：GET /api/events（bank 变更 / 前端文件变更 → 页面自动刷新）
 */
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { BankError, loadBank, nextId, saveBank, validateQuestion } from './bank.js'
import { availableLangs, runSubmission } from './runner.js'

let current = null

/** 供工具直接读取当前服务状态（未启动返回 null） */
export function getLiveState() {
  return current ? current.state : null
}

/** 供工具直接变更题库：fn(bank) => result，自动落盘并广播 SSE */
export function mutateBank(fn) {
  if (!current) throw new BankError('服务未启动')
  const out = fn(current.state.bank)
  persist(current.state, current.server._e2lClients)
  return out
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
    topics: state.bank.topics.map((t) => t.id),
    lastBankChange: state.lastBankChange,
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
    startedAt: Date.now(),
    lastBankChange: null,
  }
  const clients = new Set()
  const server = http.createServer((req, res) => handle(req, res, state, clients))
  server._e2lClients = clients
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(state.port, '127.0.0.1', resolve)
  })

  const debounce = { bank: null, web: null }
  const watchers = []
  // 题库目录：外部直接改 bank.json（如 agent 用编辑器）→ 重载并广播 bank
  try {
    watchers.push(
      fs.watch(path.dirname(state.bankPath), { recursive: false }, () => {
        clearTimeout(debounce.bank)
        debounce.bank = setTimeout(() => {
          if (!current) return
          if (Date.now() - (state.lastSelfSave || 0) < 400) return // 自己刚落盘，跳过
          try {
            state.bank = loadBank(state.bankPath)
            state.lastBankChange = new Date().toISOString()
            broadcast(clients, 'bank', { questions: state.bank.questions.length, at: state.lastBankChange })
          } catch (err) {
            broadcast(clients, 'error', { message: `题库重载失败: ${err.message}` })
          }
        }, 150)
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
    const chunks = []
    req.on('data', (c) => {
      size += c.length
      if (size > limit) {
        reject(new BankError('请求体过大'))
        req.destroy()
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
        langs: availableLangs(),
        serverTime: new Date().toISOString(),
      })
    }
    if (req.method === 'GET' && p === '/api/notes') return handleNotes(url, res, state)
    if (req.method === 'POST' && p === '/api/questions') {
      const q = validateQuestion(JSON.parse(await readBody(req)), state.bank)
      q.id = nextId(state.bank)
      state.bank.questions.push(q)
      persist(state, clients)
      return sendJson(res, 201, { id: q.id, total: state.bank.questions.length })
    }
    const m = /^\/api\/questions\/([^/]+)$/.exec(p)
    if (m) {
      const id = decodeURIComponent(m[1])
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
      const result = runSubmission(body)
      return sendJson(res, 200, result)
    }
    if (req.method === 'GET') return handleStatic(p, res, state)
    return sendJson(res, 404, { error: 'not found' })
  } catch (err) {
    const status = err instanceof BankError ? 400 : 500
    sendJson(res, status, { error: err.message })
  }
}

function persist(state, clients) {
  saveBank(state.bankPath, state.bank)
  state.lastBankChange = new Date().toISOString()
  state.lastSelfSave = Date.now()
  broadcast(clients, 'bank', { questions: state.bank.questions.length, at: state.lastBankChange })
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
    try { res.write(': ping\n\n') } catch { clients.delete(res) }
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
  const whitelisted = state.bank.notesRoots.length
    ? state.bank.notesRoots.some((r) => file.startsWith(path.resolve(state.root, r) + path.sep))
    : file.startsWith(state.root + path.sep)
  if (!whitelisted || path.extname(file).toLowerCase() !== '.md' || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    return sendJson(res, 403, { error: `路径不在允许的笔记根目录内或不可读: ${rel}` })
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
