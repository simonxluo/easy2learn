/** easy2learn 工具定义：easy2learn_start / easy2learn_bank / easy2learn_health */
import { BankError, validateQuestion } from './bank.js'
import { availableLangs } from './runner.js'
import { ensureServer, getLiveState, mutateBank, serverStatus } from './server.js'

const OBJ_SCHEMA = { type: 'object', additionalProperties: true }

function block(text) {
  return [{ type: 'text', text }]
}

function str(args, key) {
  return typeof args[key] === 'string' ? args[key].trim() : ''
}

/** 进程内没有服务实例时，退化为 HTTP 调用（复用独立进程场景） */
async function bankViaHttp(config, args, action) {
  const base = `http://127.0.0.1:${config.port}`
  const send = async (method, pathname, body) => {
    let res
    try {
      res = await fetch(base + pathname, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : {},
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(3000),
      })
    } catch {
      throw new BankError('服务未启动，先调用 easy2learn_start')
    }
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new BankError(data.error || `HTTP ${res.status}`)
    return data
  }
  if (action === 'list') {
    const state = await send('GET', '/api/state')
    let qs = state.questions
    if (args.topic) qs = qs.filter((q) => q.topic === args.topic)
    if (args.type) qs = qs.filter((q) => q.type === args.type)
    return {
      total: state.questions.length,
      filtered: qs.length,
      questions: qs.map((q) => ({
        id: q.id,
        type: q.type,
        topic: q.topic,
        difficulty: q.difficulty,
        tags: q.tags || [],
        stem: q.stem.length > 60 ? `${q.stem.slice(0, 60)}…` : q.stem,
      })),
    }
  }
  if (action === 'add') return send('POST', '/api/questions', args.question)
  if (action === 'update') return send('PUT', `/api/questions/${encodeURIComponent(str(args, 'id'))}`, args.question)
  if (action === 'delete') return send('DELETE', `/api/questions/${encodeURIComponent(str(args, 'id'))}`)
  throw new BankError(`未知 action: ${action}`)
}

export function buildTools(config) {
  return [
    {
      name: 'easy2learn_start',
      description:
        '启动 easy2learn 本地刷题网页(选择/问答/判断/编程题 + 知识点面板)，返回可点开的 URL。' +
        '服务常驻：题库或前端文件变化会通过 SSE 推给页面实时更新；agent 可随时用 easy2learn_bank 增删改题目。' +
        '用户想刷题/复习时调用本工具。',
      parameters: {
        type: 'object',
        properties: {
          port: { type: 'number', description: '端口，默认 8788' },
          bankPath: { type: 'string', description: '题库 JSON 路径(相对插件目录或绝对路径)' },
          root: { type: 'string', description: '本地笔记根目录(默认插件目录的上一级)' },
        },
        additionalProperties: false,
      },
      output: { schema: OBJ_SCHEMA, render: (_a, v) => block(renderStart(v)) },
      async execute(rawArgs) {
        const args = rawArgs || {}
        const merged = {
          port: typeof args.port === 'number' ? args.port : config.port,
          bankPath: str(args, 'bankPath') || config.bankPath,
          root: str(args, 'root') || config.root,
        }
        return ensureServer(merged)
      },
    },
    {
      name: 'easy2learn_bank',
      description:
        '管理 easy2learn 题库(页面已打开时变更实时推送，无需刷新)：list 列出题目摘要；add 新增(完整 question 对象)；' +
        'update 按 id 修改(patch 合并)；delete 按 id 删除。题型 type: single/multi/judge/qa/code。' +
        'single/multi 需 options 数组 + answer(下标或 A/B/C；multi 为数组)；judge 需布尔 answer；qa 需 answer 参考答案文本；' +
        'code 需 code:{lang: cpp/python/node, starter, tests:[{stdin?, expected}]}。建议附 analysis(解析)与 knowledge(相关知识点 markdown)。',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['list', 'add', 'update', 'delete'], description: '操作类型' },
          id: { type: 'string', description: 'update/delete 必填的题目 id' },
          question: {
            type: 'object',
            description: 'add 的完整题目 / update 的部分字段 patch',
            additionalProperties: true,
          },
          topic: { type: 'string', description: 'list 时按 topic 过滤(可选)' },
          type: { type: 'string', description: 'list 时按题型过滤(可选)' },
        },
        required: ['action'],
        additionalProperties: false,
      },
      output: { schema: OBJ_SCHEMA, render: (_a, v) => block(renderBank(v)) },
      async execute(rawArgs) {
        const args = rawArgs || {}
        const action = str(args, 'action')
        const live = getLiveState()
        if (!live) return bankViaHttp(config, args, action)

        if (action === 'list') {
          let qs = live.bank.questions
          if (args.topic) qs = qs.filter((q) => q.topic === args.topic)
          if (args.type) qs = qs.filter((q) => q.type === args.type)
          return {
            total: live.bank.questions.length,
            filtered: qs.length,
            questions: qs.map((q) => ({
              id: q.id,
              type: q.type,
              topic: q.topic,
              difficulty: q.difficulty,
              tags: q.tags || [],
              stem: q.stem.length > 60 ? `${q.stem.slice(0, 60)}…` : q.stem,
            })),
          }
        }
        if (action === 'add') {
          if (!args.question || typeof args.question !== 'object') {
            throw new BankError('add 需要完整 question 对象')
          }
          return mutateBank((bank) => {
            const q = validateQuestion(args.question, bank)
            const ids = bank.questions.map((x) => x.id)
            let n = ids.length + 1
            while (ids.includes(`q${String(n).padStart(3, '0')}`)) n++
            q.id = `q${String(n).padStart(3, '0')}`
            bank.questions.push(q)
            return { id: q.id, total: bank.questions.length }
          })
        }
        if (action === 'update') {
          const id = str(args, 'id')
          if (!id) throw new BankError('update 需要 id')
          if (!args.question || typeof args.question !== 'object') throw new BankError('update 需要 question(patch 对象)')
          return mutateBank((bank) => {
            const idx = bank.questions.findIndex((q) => q.id === id)
            if (idx < 0) throw new BankError(`题目不存在: ${id}`)
            const merged = { ...bank.questions[idx], ...args.question, id }
            bank.questions[idx] = validateQuestion(merged, bank)
            return { id, updated: true }
          })
        }
        if (action === 'delete') {
          const id = str(args, 'id')
          if (!id) throw new BankError('delete 需要 id')
          return mutateBank((bank) => {
            const idx = bank.questions.findIndex((q) => q.id === id)
            if (idx < 0) throw new BankError(`题目不存在: ${id}`)
            bank.questions.splice(idx, 1)
            return { deleted: id, total: bank.questions.length }
          })
        }
        throw new BankError(`未知 action: ${action}`)
      },
    },
    {
      name: 'easy2learn_health',
      description: 'easy2learn 自检：服务是否在跑、URL、题量、题型分布、可用判题语言、SSE 在线页面数。',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
      output: { schema: OBJ_SCHEMA, render: (_a, v) => block(renderHealth(v)) },
      async execute() {
        const status = serverStatus()
        const info = { ...status, langs: null, byType: null }
        let state = getLiveState()
        if (!state) {
          // 探测是否有独立进程在服务
          try {
            const res = await fetch(`http://127.0.0.1:${config.port}/api/state`, { signal: AbortSignal.timeout(1500) })
            if (res.ok) {
              state = await res.json()
              Object.assign(info, {
                running: true,
                port: config.port,
                url: `http://127.0.0.1:${config.port}/`,
                questions: state.questions?.length ?? 0,
                note: '由独立进程(standalone)提供服务',
              })
            }
          } catch {}
        }
        if (state) {
          info.langs = state.langs || availableLangs()
          const qs = state.questions || state.bank?.questions || []
          const byType = {}
          for (const q of qs) byType[q.type] = (byType[q.type] || 0) + 1
          info.byType = byType
        }
        return info
      },
    },
  ]
}

function renderStart(v) {
  const r = v || {}
  if (!r.running) return `easy2learn 启动失败: ${r.error || '未知错误'}`
  return [
    `✅ easy2learn 已启动: ${r.url}`,
    `题库 ${r.questions} 题，topics: ${(r.topics || []).join(', ')}`,
    r.note ? `⚠️ ${r.note}` : '',
    '页面开着时，增删改题目或编辑 web/ 前端文件都会实时推送，无需刷新。',
  ].filter(Boolean).join('\n')
}

function renderBank(v) {
  if (v && Array.isArray(v.questions)) {
    const lines = [`题库共 ${v.total} 题(过滤后 ${v.filtered})：`]
    for (const q of v.questions.slice(0, 30)) {
      lines.push(`- [${q.id}] ${q.type}/${q.topic} ${q.tags.join(',')} ${q.stem}`)
    }
    if (v.questions.length > 30) lines.push(`…共 ${v.questions.length} 条，仅示前 30`)
    return lines.join('\n')
  }
  return JSON.stringify(v, null, 2)
}

function renderHealth(v) {
  const r = v || {}
  if (!r.running) return 'easy2learn 未运行(调用 easy2learn_start 启动)'
  const byType = Object.entries(r.byType || {}).map(([k, n]) => `${k}:${n}`).join(' ')
  const langs = Object.entries(r.langs || {}).map(([k, ok]) => `${k}${ok ? '✓' : '✗'}`).join(' ')
  return `easy2learn 运行中 ${r.url}，${r.questions} 题(${byType})，判题链路 ${langs}，在线页面 ${r.clients ?? 0}，uptime ${Math.round((r.uptimeMs || 0) / 1000)}s`
}
