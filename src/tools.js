/** easy2learn 工具定义：easy2learn_start / easy2learn_bank / easy2learn_graph / easy2learn_health */
import { BankError, validateQuestion } from './bank.js'
import {
  GraphError,
  appendExtraEdge,
  buildGraphFromNotes,
  findNodeId,
  inferNodeKind,
  nodeIdFor,
  readExtra,
  removeExtraEdge,
  writeExtra,
} from './graph.js'
import { availableLangs } from './runner.js'
import { ensureServer, getLiveState, mutateBank, mutateGraph, applyGraph, serverStatus } from './server.js'

const OBJ_SCHEMA = { type: 'object', additionalProperties: true }

function block(text) {
  return [{ type: 'text', text }]
}

function str(args, key) {
  return typeof args[key] === 'string' ? args[key].trim() : ''
}

/** extra 手工节点与图内节点的对应（extra 只存 label，靠 label 相等 + 目标 id 定位） */
function labelMatchesExtraNode(topic, extraNode, nodeId) {
  return topic.nodes.some((n) => n.id === nodeId && n.label === extraNode.label)
}

function renderGraphOp(v) {
  if (v && Array.isArray(v.topics)) {
    const lines = ['知识图谱：']
    for (const t of v.topics) {
      lines.push(`- ${t.name}(${t.id}): ${t.nodes} 节点 / ${t.relEdges} 条关联边 · 章节 ${t.chapters.join('/')}`)
      if (t.warnings?.length) lines.push(`  ⚠️ ${t.warnings.join('; ')}`)
    }
    if (v.extraPath) lines.push(`扩展数据: ${v.extraPath}`)
    return lines.join('\n')
  }
  return JSON.stringify(v, null, 2)
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
          ...config,
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
      name: 'easy2learn_graph',
      description:
        '管理 easy2learn 学习页的知识图谱(页面实时刷新)：' +
        'regen=从本地笔记+data/graph-extra.json 重建图谱(改完笔记后调用)；list=查看各 topic 节点/边概览；' +
        'add-edge=新增跨知识点关联(同时持久化到 graph-extra.json，regen 不丢)；remove-edge=删除关联；' +
        'add-node/update-node/delete-node=管理手工补充的知识点(同样持久化)。' +
        '用户想串联知识点、要求加关联或改图谱时用本工具。',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['regen', 'list', 'add-edge', 'remove-edge', 'add-node', 'update-node', 'delete-node'],
            description: '操作类型',
          },
          topic: { type: 'string', description: 'topic id，如 os / cpp' },
          s: { type: 'string', description: '边的起点：节点 id 或 label 子串(add-edge/remove-edge)' },
          t: { type: 'string', description: '边的终点：节点 id 或 label 子串(add-edge/remove-edge)' },
          label: { type: 'string', description: '关联理由(显示在图上)，如「共享内存需同步」' },
          id: { type: 'string', description: 'update-node/delete-node 的节点 id' },
          nodeLabel: { type: 'string', description: 'add-node/update-node 的知识点标题' },
          chapter: { type: 'string', description: '章节名(新章节会自动创建)' },
          content: { type: 'string', description: '知识点内容(markdown)' },
          kind: { type: 'string', enum: ['qa', 'concept', 'code'], description: '知识形态(可选，缺省按内容自动推断)' },
        },
        required: ['action'],
        additionalProperties: false,
      },
      output: { schema: OBJ_SCHEMA, render: (_a, v) => block(renderGraphOp(v)) },
      async execute(rawArgs) {
        const args = rawArgs || {}
        const action = str(args, 'action')
        const live = getLiveState()
        if (!live) throw new GraphError('服务未启动，先调用 easy2learn_start')

        if (action === 'regen') {
          const graph = buildGraphFromNotes({ root: live.root, topics: live.bank.topics, extraPath: live.extraPath })
          return applyGraph(graph)
        }

        if (action === 'list') {
          return {
            extraPath: live.extraPath,
            topics: live.graph.topics.map((t) => ({
              id: t.id,
              name: t.name,
              nodes: t.nodes.length,
              relEdges: t.edges.filter((e) => e.kind === 'rel').length,
              chapters: t.chapters.map((c) => c.name),
              warnings: t.warnings,
            })),
          }
        }

        const topicId = str(args, 'topic')
        if (!topicId) throw new GraphError('本操作需要 topic 参数(os/cpp)')
        const topic = live.graph.topics.find((t) => t.id === topicId)
        if (!topic) throw new GraphError(`graph 里没有 topic: ${topicId}(可用 ${live.graph.topics.map((t) => t.id).join('/')})`)

        if (action === 'add-edge' || action === 'remove-edge') {
          const sRaw = str(args, 's'), tRaw = str(args, 't')
          if (!sRaw || !tRaw) throw new GraphError('需要 s 和 t(节点 id 或 label 子串)')
          const extra = readExtra(live.extraPath)
          if (action === 'add-edge') {
            const s = findNodeId(topic.nodes, sRaw)
            const t = findNodeId(topic.nodes, tRaw)
            if (!s) throw new GraphError(`s 未匹配到节点: ${sRaw}`)
            if (!t) throw new GraphError(`t 未匹配到节点: ${tRaw}`)
            const added = appendExtraEdge(extra, topicId, { s, t, label: str(args, 'label') })
            writeExtra(live.extraPath, extra)
            const out = mutateGraph((g) => {
              const tp = g.topics.find((x) => x.id === topicId)
              const dup = tp.edges.some((e) => (e.s === s && e.t === t) || (e.s === t && e.t === s))
              if (!dup) tp.edges.push({ s, t, kind: 'rel', label: str(args, 'label') })
              return { edge: `${s} -> ${t}`, persisted: 'graph-extra.json', duplicated: dup }
            })
            return added ? out : { ...out, note: 'graph-extra.json 里已存在该关联(双向去重)' }
          }
          const removed = removeExtraEdge(extra, topicId, sRaw, tRaw)
          // extra 里存的是原始子串，也可能存的是 id；再按 id 删一遍
          const s = findNodeId(topic.nodes, sRaw), t = findNodeId(topic.nodes, tRaw)
          if (s && t) removeExtraEdge(extra, topicId, s, t)
          writeExtra(live.extraPath, extra)
          return mutateGraph((g) => {
            const tp = g.topics.find((x) => x.id === topicId)
            const before = tp.edges.length
            tp.edges = tp.edges.filter((e) => {
              const byRaw = (e.s === sRaw && e.t === tRaw) || (e.s === tRaw && e.t === sRaw)
              const byId = Boolean(s && t) && ((e.s === s && e.t === t) || (e.s === t && e.t === s))
              return !(byRaw || byId)
            })
            return { removedFromExtra: removed, removedFromGraph: before - tp.edges.length }
          })
        }

        if (action === 'add-node') {
          const label = str(args, 'nodeLabel')
          if (!label) throw new GraphError('add-node 需要 nodeLabel')
          const content = str(args, 'content')
          const chapterName = str(args, 'chapter') || '补充'
          const kind = str(args, 'kind') || inferNodeKind(content)
          const extra = readExtra(live.extraPath)
          const bucket = extra[topicId] || (extra[topicId] = { edges: [], nodes: [] })
          if (bucket.nodes.some((n) => n.label === label)) throw new GraphError('graph-extra.json 已有同名手工节点')
          bucket.nodes.push({ label, chapter: chapterName, kind, content })
          writeExtra(live.extraPath, extra)
          return mutateGraph((g) => {
            const tp = g.topics.find((x) => x.id === topicId)
            let chap = tp.chapters.find((c) => c.name === chapterName)
            if (!chap) {
              chap = { id: chapterName, name: chapterName }
              tp.chapters.push(chap)
            }
            const id = nodeIdFor(tp, label)
            tp.nodes.push({ id, chapter: chap.id, label, kind, content })
            return { id, chapter: chap.name, kind, persisted: 'graph-extra.json' }
          })
        }

        if (action === 'update-node') {
          const id = str(args, 'id')
          const node = topic.nodes.find((n) => n.id === id)
          if (!node) throw new GraphError(`节点不存在: ${id}`)
          const patch = {}
          if (str(args, 'nodeLabel')) patch.label = str(args, 'nodeLabel')
          if (str(args, 'content')) patch.content = str(args, 'content')
          if (str(args, 'kind')) patch.kind = str(args, 'kind')
          if (str(args, 'chapter')) {
            const name = str(args, 'chapter')
            patch.chapter = name // normalizeGraph/前端按名称或 id 匹配；regen 时 ensureChapter 兜底
          }
          // 手工节点同步回 extra（笔记节点的内容以笔记为准，不回写）
          const extra = readExtra(live.extraPath)
          const bucket = extra[topicId]
          if (bucket) {
            const en = bucket.nodes.find((n) => labelMatchesExtraNode(topic, n, id))
            if (en) Object.assign(en, patch.label ? { label: patch.label } : {}, patch.content !== undefined ? { content: patch.content } : {}, patch.chapter ? { chapter: patch.chapter } : {}, patch.kind ? { kind: patch.kind } : {})
            writeExtra(live.extraPath, extra)
          }
          return mutateGraph((g) => {
            const tp = g.topics.find((x) => x.id === topicId)
            const n = tp.nodes.find((x) => x.id === id)
            Object.assign(n, patch)
            if (patch.chapter && !tp.chapters.some((c) => c.id === patch.chapter || c.name === patch.chapter)) {
              tp.chapters.push({ id: patch.chapter, name: patch.chapter })
            }
            return { id, updated: Object.keys(patch) }
          })
        }

        if (action === 'delete-node') {
          const id = str(args, 'id')
          if (!topic.nodes.some((n) => n.id === id)) throw new GraphError(`节点不存在: ${id}`)
          const extra = readExtra(live.extraPath)
          const bucket = extra[topicId]
          if (bucket) {
            bucket.nodes = bucket.nodes.filter((n) => !labelMatchesExtraNode(topic, n, id))
            writeExtra(live.extraPath, extra)
          }
          return mutateGraph((g) => {
            const tp = g.topics.find((x) => x.id === topicId)
            const before = tp.nodes.length
            tp.nodes = tp.nodes.filter((n) => n.id !== id)
            tp.edges = tp.edges.filter((e) => e.s !== id && e.t !== id)
            return { deleted: id, nodesBefore: before, nodesAfter: tp.nodes.length, note: '笔记生成的节点 regen 后会恢复；要彻底移除请改笔记' }
          })
        }

        throw new GraphError(`未知 action: ${action}`)
      },
    },
    {
      name: 'easy2learn_health',
      description: 'easy2learn 自检：服务是否在跑、URL、题量、题型分布、知识图谱规模、可用判题语言、SSE 在线页面数。',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
      output: { schema: OBJ_SCHEMA, render: (_a, v) => block(renderHealth(v)) },
      async execute() {
        const status = serverStatus()
        const info = { ...status, langs: null, byType: null, graphTopics: null }
        let state = getLiveState()
        if (state) {
          state = { questions: state.bank.questions, langs: availableLangs(), graphTopics: (state.graph.topics || []).map((t) => ({ id: t.id, nodes: t.nodes.length, edges: t.edges.length })) }
        } else {
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
          const qs = state.questions || []
          const byType = {}
          for (const q of qs) byType[q.type] = (byType[q.type] || 0) + 1
          info.byType = byType
          info.graphTopics = state.graphTopics || null
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
  const graph = (r.graphTopics || []).map((t) => `${t.id}${t.nodes}n/${t.edges}e`).join(' ')
  const langs = Object.entries(r.langs || {}).map(([k, ok]) => `${k}${ok ? '✓' : '✗'}`).join(' ')
  return `easy2learn 运行中 ${r.url}，${r.questions} 题(${byType})，图谱 ${graph}，判题链路 ${langs}，在线页面 ${r.clients ?? 0}，uptime ${Math.round((r.uptimeMs || 0) / 1000)}s`
}
