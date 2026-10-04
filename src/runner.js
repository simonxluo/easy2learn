/**
 * easy2learn 本地判题器：把用户提交的代码写到临时目录，
 * 用本机工具链 (g++/python3/node) 编译运行测试用例。
 * 仅监听 127.0.0.1 的本地学习工具，不做沙箱隔离。
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const COMPILE_TIMEOUT_MS = 20000
const RUN_TIMEOUT_MS = 5000
const MAX_OUTPUT = 20000

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

export function runSubmission({ lang, code, tests }) {
  const langs = availableLangs()
  if (!['cpp', 'python', 'node'].includes(lang)) return { error: `不支持的语言: ${lang}` }
  if (typeof code !== 'string' || !code.trim()) return { error: '代码不能为空' }
  if (!Array.isArray(tests) || !tests.length) return { error: '缺少测试用例' }
  if (lang === 'cpp' && !langs.cpp) return { error: '本机未找到 g++/clang++，无法判 cpp 题' }
  if (lang === 'python' && !langs.python) return { error: '本机未找到 python3' }

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'easy2learn-'))
  try {
    if (lang === 'cpp') return runCpp(dir, code, tests)
    if (lang === 'python') return runPython(dir, code, tests)
    return runNode(dir, code, tests)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

function runCpp(dir, code, tests) {
  const compiler = findBin('g++') || findBin('clang++')
  const src = path.join(dir, 'main.cpp')
  const exe = path.join(dir, 'main.out')
  fs.writeFileSync(src, code, 'utf8')
  const comp = spawnSync(compiler, ['-O2', '-std=c++17', '-o', exe, src], {
    timeout: COMPILE_TIMEOUT_MS,
    encoding: 'utf8',
  })
  if (comp.status !== 0) {
    return { error: '编译失败', compileOutput: clip(String(comp.stderr || comp.stdout || '')) }
  }
  return runTests(() => spawnSync(exe, [], runOpts(tests, 0)), tests)
}

function runPython(dir, code, tests) {
  const bin = findBin('python3') || findBin('python')
  const src = path.join(dir, 'main.py')
  fs.writeFileSync(src, code, 'utf8')
  return runTests((stdin) => spawnSync(bin, [src], runOpts(stdin)), tests, true)
}

function runNode(dir, code, tests) {
  const bin = process.execPath
  const src = path.join(dir, 'main.js')
  fs.writeFileSync(src, code, 'utf8')
  return runTests((stdin) => spawnSync(bin, [src], runOpts(stdin)), tests, true)
}

function runOpts(stdin) {
  return {
    input: String(stdin ?? ''),
    timeout: RUN_TIMEOUT_MS,
    encoding: 'utf8',
    killSignal: 'SIGKILL',
    maxBuffer: 4 * 1024 * 1024,
    env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
  }
}

function runTests(runOne, tests, stdinPerTest = true) {
  const results = tests.map((t, i) => {
    const startedAt = Date.now()
    const r = runOne(stdinPerTest ? t.stdin : '')
    const timeMs = Date.now() - startedAt
    const actual = clip(String(r.stdout ?? '').replace(/\r\n/g, '\n'))
    const expected = String(t.expected ?? '').replace(/\r\n/g, '\n').trim()
    const actualTrim = actual.trim()
    const timedOut = r.error && r.error.code === 'ETIMEDOUT'
    return {
      index: i + 1,
      pass: !timedOut && r.status === 0 && actualTrim === expected,
      expected,
      actual,
      exitCode: r.status,
      timeMs,
      stderr: timedOut ? `超时（>${RUN_TIMEOUT_MS / 1000}s）` : clip(String(r.stderr || '')),
    }
  })
  return {
    results,
    allPass: results.every((r) => r.pass),
    summary: `${results.filter((r) => r.pass).length}/${results.length} 通过`,
  }
}

function clip(s) {
  return s.length > MAX_OUTPUT ? `${s.slice(0, MAX_OUTPUT)}\n…(输出过长已截断)` : s
}
