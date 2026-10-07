/**
 * easy2learn 数据模型：题库 (bank.json) 的加载 / 校验 / 变更
 *
 * Bank 结构：
 * {
 *   "meta":     { "name": string, "version": number, "updatedAt": string },
 *   "topics":   [{ "id": string, "name": string, "note"?: string }],
 *   "notesRoots": [string],           // 允许读取 .md 笔记的根（相对 root）
 *   "questions": [Question]
 * }
 *
 * Question（按 type 取舍字段）：
 * {
 *   "id": "q001",
 *   "type": "single" | "multi" | "judge" | "qa" | "code",
 *   "topic": "os",
 *   "difficulty": 1-5,
 *   "tags": ["进程"],
 *   "stem": "题干（支持 markdown）",
 *   "options": ["A..", ...],          // single/multi 必填
 *   "answer": 0 | [0,2] | true | "参考答案文本",   // 按类型
 *   "analysis": "解析（口诀/追问）",
 *   "knowledge": "相关知识点 markdown",
 *   "code": {                          // code 必填
 *     "lang": "cpp" | "python" | "node",
 *     "starter": "初始代码",
 *     "tests": [{ "stdin"?: string, "expected": string }]
 *   }
 * }
 */
import fs from 'node:fs'
import path from 'node:path'

export const QUESTION_TYPES = ['single', 'multi', 'judge', 'qa', 'code']

export class BankError extends Error {
  constructor(message) {
    super(message)
    this.name = 'BankError'
  }
}

export function emptyBank() {
  return {
    meta: { name: 'easy2learn 题库', version: 1, updatedAt: new Date().toISOString() },
    topics: [],
    notesRoots: [],
    questions: [],
  }
}

export function loadBank(bankPath) {
  let raw
  try {
    raw = fs.readFileSync(bankPath, 'utf8')
  } catch (err) {
    if (err.code === 'ENOENT') return emptyBank()
    throw err
  }
  const bank = JSON.parse(raw)
  return normalizeBank(bank)
}

export function normalizeBank(bank) {
  const out = emptyBank()
  if (!bank || typeof bank !== 'object') return out
  out.meta = { ...out.meta, ...(bank.meta || {}) }
  out.topics = Array.isArray(bank.topics)
    ? bank.topics.filter((t) => t && typeof t.id === 'string' && typeof t.name === 'string')
    : []
  out.notesRoots = Array.isArray(bank.notesRoots)
    ? bank.notesRoots.filter((r) => typeof r === 'string')
    : []
  // 加载归一化：磁盘上 multi 的 answer 若是乱序/字典序（历史数据），统一为数值升序去重，
  // 与 validateQuestion 的输出保持一致，前端逐位比较才不会误判
  out.questions = (Array.isArray(bank.questions) ? bank.questions : [])
    .filter(Boolean)
    .map((q) => {
      if (q && q.type === 'multi' && Array.isArray(q.answer) && q.answer.every((v) => typeof v === 'number' && Number.isInteger(v))) {
        return { ...q, answer: [...new Set(q.answer)].sort((a, b) => a - b) }
      }
      return q
    })
  return out
}

export function saveBank(bankPath, bank) {
  bank.meta.updatedAt = new Date().toISOString()
  fs.mkdirSync(path.dirname(bankPath), { recursive: true })
  const tmp = `${bankPath}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(bank, null, 2) + '\n', 'utf8')
  fs.renameSync(tmp, bankPath)
}

export function nextId(bank) {
  let max = 0
  for (const q of bank.questions) {
    const m = /^q(\d+)$/.exec(String(q.id || ''))
    if (m) max = Math.max(max, Number(m[1]))
  }
  return `q${String(max + 1).padStart(3, '0')}`
}

/** 校验单题；返回规范化后的题；不合法抛 BankError */
export function validateQuestion(input, bank) {
  if (!input || typeof input !== 'object') throw new BankError('题目必须是对象')
  const type = String(input.type || '')
  if (!QUESTION_TYPES.includes(type)) {
    throw new BankError(`type 必须是 ${QUESTION_TYPES.join('/')} 之一，收到: ${type}`)
  }
  const stem = String(input.stem || '').trim()
  if (!stem) throw new BankError('stem（题干）不能为空')
  const topic = String(input.topic || '')
  if (bank && bank.topics.length && !bank.topics.some((t) => t.id === topic)) {
    throw new BankError(`topic 「${topic}」不在题库 topics 里`)
  }

  const q = {
    id: String(input.id || ''),
    type,
    topic,
    difficulty: clampInt(input.difficulty, 3, 1, 5),
    tags: Array.isArray(input.tags) ? input.tags.map(String) : [],
    stem,
    options: undefined,
    answer: undefined,
    analysis: String(input.analysis || ''),
    knowledge: String(input.knowledge || ''),
    code: undefined,
  }

  if (type === 'single' || type === 'multi') {
    const options = Array.isArray(input.options) ? input.options.map(String) : []
    if (options.length < 2) throw new BankError('选择题 options 至少 2 项')
    q.options = options
    if (type === 'single') {
      const a = input.answer
      const idx = normalizeOptionIndex(a, options.length)
      if (idx < 0) throw new BankError('single 的 answer 必须是选项下标(0 起)或 A/B/C 字母')
      q.answer = idx
    } else {
      const list = Array.isArray(input.answer) ? input.answer : [input.answer]
      const idxs = list.map((a) => normalizeOptionIndex(a, options.length)).sort((a, b) => a - b)
      if (!idxs.length || idxs.some((i) => i < 0)) throw new BankError('multi 的 answer 必须是非空下标数组')
      q.answer = [...new Set(idxs)]
    }
  } else if (type === 'judge') {
    // 字符串答案大小写不敏感：TRUE/True/true 与 对 都视为真
    const s = typeof input.answer === 'string' ? input.answer.trim().toLowerCase() : null
    q.answer = s === null ? Boolean(input.answer) : s === '对' || s === 'true'
  } else if (type === 'qa') {
    const a = String(input.answer ?? '').trim()
    if (!a) throw new BankError('问答题 answer（参考答案）不能为空')
    q.answer = a
  } else if (type === 'code') {
    const c = input.code
    if (!c || typeof c !== 'object') throw new BankError('编程题缺少 code 对象')
    const lang = String(c.lang || '')
    if (!['cpp', 'python', 'node'].includes(lang)) throw new BankError('code.lang 必须是 cpp/python/node')
    const tests = Array.isArray(c.tests) ? c.tests : []
    if (!tests.length) throw new BankError('编程题至少要有一个测试用例')
    q.code = {
      lang,
      starter: String(c.starter || ''),
      tests: tests.map((t) => ({ stdin: String(t?.stdin ?? ''), expected: String(t?.expected ?? '') })),
    }
  }
  return q
}

function normalizeOptionIndex(v, len) {
  if (typeof v === 'number' && Number.isInteger(v)) return v >= 0 && v < len ? v : -1
  if (typeof v === 'string') {
    const s = v.trim()
    if (/^[0-9]+$/.test(s)) return normalizeOptionIndex(Number(s), len)
    if (/^[A-Za-z]$/.test(s)) {
      const i = s.toUpperCase().charCodeAt(0) - 65
      return i >= 0 && i < len ? i : -1
    }
  }
  return -1
}

function clampInt(v, fallback, min, max) {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : fallback
  return Math.min(max, Math.max(min, n))
}
