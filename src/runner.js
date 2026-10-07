/**
 * easy2learn 本地判题器：把用户提交的代码写到临时目录，
 * 用本机工具链 (g++/python3/node) 编译运行测试用例。
 * 仅监听 127.0.0.1 的本地学习工具，不做沙箱隔离。
 *
 * 全异步（spawn）：判题不再用 spawnSync 阻塞事件循环，
 * 编译/运行期间服务器仍能响应页面、SSE 与其他 API。
 * 多个提交串行执行（单并发队列），避免并行判题互相抢 CPU。
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const COMPILE_TIMEOUT_MS = 20000
const RUN_TIMEOUT_MS = 5000
const MAX_OUTPUT = 20000
const MAX_CAPTURE = 2 * 1024 * 1024 // 单流最多累积 2MB，防失控输出吃内存

const binCache = new Map()

function findBin(name) {
  if (binCache.has(name)) return binCache.get(name)
  const dirs = (process.env.PATH || '').split(path.delimiter)
  let found = null
  for (const dir of dirs) {
    for (const p of [path.join(dir, name), path.join(dir, `${name}.exe`)]) {
      try {
        fs.accessSync(p, fs.constants.X_OK)
        found = p
        break
      } catch {}
    }
    if (found) break
  }
  binCache.set(name, found)
  return found
}

export function availableLangs() {
  return {
    cpp: Boolean(findBin('g++') || findBin('clang++')),
    python: Boolean(findBin('python3') || findBin('python')),
    node: Boolean(findBin('node')),
  }
}

/** 单并发队列：后到的提交排队等待前一个完成 */
let queueTail = Promise.resolve()

/** 判题入口（异步）。业务问题（空代码/不支持的语言等）以 resolve {error} 表达 */
export function runSubmission(payload) {
  const job = queueTail.then(() => runImpl(payload))
  queueTail = job.then(
    () => {},
    () => {},
  )
  return job
}

async function runImpl({ lang, code, tests }) {
  const langs = availableLangs()
  if (!['cpp', 'python', 'node'].includes(lang)) return { error: `不支持的语言: ${lang}` }
  if (typeof code !== 'string' || !code.trim()) return { error: '代码不能为空' }
  if (!Array.isArray(tests) || !tests.length) return { error: '缺少测试用例' }
  if (lang === 'cpp' && !langs.cpp) return { error: '本机未找到 g++/clang++，无法判 cpp 题' }
  if (lang === 'python' && !langs.python) return { error: '本机未找到 python3' }

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'easy2learn-'))
  try {
    if (lang === 'cpp') return await runCpp(dir, code, tests)
    if (lang === 'python') return await runPython(dir, code, tests)
    return await runNode(dir, code, tests)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

/** spawn 包装：resolve { status, signal, error, stdout, stderr }，超时 SIGKILL */
function runProc(cmd, args, { input = '', timeoutMs = RUN_TIMEOUT_MS } = {}) {
  return new Promise((resolve) => {
    let stdout = ''
    let stderr = ''
    let settled = false
    const finish = (v) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(v)
    }
    let p
    try {
      p = spawn(cmd, args, { env: { ...process.env, PYTHONIOENCODING: 'utf-8' }, stdio: ['pipe', 'pipe', 'pipe'] })
    } catch (err) {
      return resolve({ status: null, error: err, stdout: '', stderr: '' })
    }
    const timer = setTimeout(() => {
      try { p.kill('SIGKILL') } catch {}
      finish({ status: null, signal: 'SIGKILL', error: { code: 'ETIMEDOUT' }, stdout, stderr })
    }, timeoutMs)
    p.stdout.setEncoding('utf8')
    p.stderr.setEncoding('utf8')
    p.stdout.on('data', (d) => { if (stdout.length < MAX_CAPTURE) stdout += d })
    p.stderr.on('data', (d) => { if (stderr.length < MAX_CAPTURE) stderr += d })
    p.on('error', (err) => finish({ status: null, error: err, stdout, stderr }))
    p.on('close', (status, signal) => finish({ status, signal, stdout, stderr }))
    if (input) p.stdin.end(input)
    else p.stdin.end()
  })
}

async function runCpp(dir, code, tests) {
  const compiler = findBin('g++') || findBin('clang++')
  const src = path.join(dir, 'main.cpp')
  const exe = path.join(dir, 'main.out')
  fs.writeFileSync(src, code, 'utf8')
  const comp = await runProc(compiler, ['-O2', '-std=c++17', '-o', exe, src], { timeoutMs: COMPILE_TIMEOUT_MS })
  if (comp.status !== 0) {
    return { error: '编译失败', compileOutput: clip(String(comp.stderr || comp.stdout || '')) }
  }
  return runTests((stdin) => runProc(exe, [], { input: stdin }), tests)
}

async function runPython(dir, code, tests) {
  const bin = findBin('python3') || findBin('python')
  const src = path.join(dir, 'main.py')
  fs.writeFileSync(src, code, 'utf8')
  return runTests((stdin) => runProc(bin, [src], { input: stdin }), tests)
}

async function runNode(dir, code, tests) {
  const bin = process.execPath
  const src = path.join(dir, 'main.js')
  fs.writeFileSync(src, code, 'utf8')
  return runTests((stdin) => runProc(bin, [src], { input: stdin }), tests)
}

/** 逐用例运行（每用例独立 stdin 与超时），结果结构与旧版完全兼容 */
async function runTests(runOne, tests) {
  const results = []
  for (let i = 0; i < tests.length; i++) {
    const t = tests[i]
    const startedAt = Date.now()
    const r = await runOne(String(t.stdin ?? ''))
    const timeMs = Date.now() - startedAt
    const actual = clip(String(r.stdout ?? '').replace(/\r\n/g, '\n'))
    const expected = String(t.expected ?? '').replace(/\r\n/g, '\n').trim()
    const actualTrim = actual.trim()
    const timedOut = r.error && r.error.code === 'ETIMEDOUT'
    // 非零退出码 / 异常终止时给一行人话，不然结果表里只有一个裸数字让人困惑
    let note = ''
    if (!timedOut) {
      if (r.status === null) note = r.signal ? `（异常终止: ${r.signal}）` : r.error ? `（无法运行: ${r.error.message || r.error.code}）` : ''
      else if (r.status !== 0) note = `（非零退出码 ${r.status}）`
    }
    results.push({
      index: i + 1,
      pass: !timedOut && r.status === 0 && actualTrim === expected,
      expected,
      actual,
      exitCode: r.status,
      timeMs,
      stderr: timedOut ? `超时（>${RUN_TIMEOUT_MS / 1000}s）` : clip(String(r.stderr || '')) + note,
    })
  }
  return {
    results,
    allPass: results.every((r) => r.pass),
    summary: `${results.filter((r) => r.pass).length}/${results.length} 通过`,
  }
}

function clip(s) {
  return s.length > MAX_OUTPUT ? `${s.slice(0, MAX_OUTPUT)}\n…(输出过长已截断)` : s
}
