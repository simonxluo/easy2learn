/**
 * easy2learn 知识图谱数据模型
 *
 * Graph 结构（data/graph.json，由笔记 + data/graph-extra.json 构建）：
 * {
 *   "generatedAt": "...",
 *   "engine": "builtin-force",
 *   "topics": [{
 *     "id": "os", "name": "操作系统", "note": "interview-prep/os/操作系统.md",
 *     "chapters": [{ "id": "slug", "name": "进程与线程" }],
 *     "nodes":   [{ "id": "os:xxx", "chapter": "slug", "label": "...", "content": "markdown" }],
 *     "edges":   [{ "s": "节点id", "t": "节点id", "kind": "seq|rel", "label": "关联理由" }],
 *     "warnings": ["未匹配的策展边, ..."]
 *   }]
 * }
 *
 * 持久化分层：
 * - 笔记(## 问答卡片) → 节点主体 + 章节内顺序链(kind=seq)，regen 时重建
 * - data/graph-extra.json → 跨章节语义关联(kind=rel)与手工节点，regen 时合并，工具增删也写这里
 */
import fs from 'node:fs'
import path from 'node:path'

export class GraphError extends Error {
  constructor(message) {
    super(message)
    this.name = 'GraphError'
  }
}

export function emptyGraph() {
  return { generatedAt: new Date().toISOString(), engine: 'builtin-force', topics: [] }
}

export function loadGraph(graphPath) {
  let raw
  try {
    raw = fs.readFileSync(graphPath, 'utf8')
  } catch (err) {
    if (err.code === 'ENOENT') return emptyGraph()
    throw err
  }
  return normalizeGraph(JSON.parse(raw))
}

export function normalizeGraph(input) {
  const out = emptyGraph()
  if (!input || typeof input !== 'object') return out
  out.generatedAt = String(input.generatedAt || out.generatedAt)
  out.engine = String(input.engine || out.engine)
  const seenTopic = new Set()
  for (const t of Array.isArray(input.topics) ? input.topics : []) {
    if (!t || typeof t.id !== 'string' || !t.nodes) continue
    if (seenTopic.has(t.id)) continue
    seenTopic.add(t.id)
    const topic = {
      id: t.id,
      name: String(t.name || t.id),
      note: String(t.note || ''),
      chapters: Array.isArray(t.chapters) ? t.chapters.filter((c) => c && c.id && c.name) : [],
      nodes: [],
      edges: [],
      warnings: Array.isArray(t.warnings) ? t.warnings.map(String) : [],
    }
    const ids = new Set()
    for (const n of t.nodes) {
      if (!n || typeof n.label !== 'string' || !n.label.trim()) continue
      const id = String(n.id || slug(n.label))
      if (ids.has(id)) continue
      ids.add(id)
      topic.nodes.push({
        id,
        chapter: String(n.chapter || 'other'),
        label: n.label.trim(),
        content: String(n.content || ''),
      })
    }
    const seenEdge = new Set()
    for (const e of Array.isArray(t.edges) ? t.edges : []) {
      if (!e || !ids.has(e.s) || !ids.has(e.t) || e.s === e.t) continue // 丢弃悬垂边
      const k = `${e.s}>${e.t}`
      if (seenEdge.has(k)) continue
      seenEdge.add(k)
      topic.edges.push({ s: e.s, t: e.t, kind: e.kind === 'rel' ? 'rel' : 'seq', label: String(e.label || '') })
    }
    out.topics.push(topic)
  }
  return out
}

export function saveGraph(graphPath, graph) {
  graph.generatedAt = new Date().toISOString()
  fs.mkdirSync(path.dirname(graphPath), { recursive: true })
  const tmp = `${graphPath}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(graph, null, 2) + '\n', 'utf8')
  fs.renameSync(tmp, graphPath)
}

/* ---------------- 扩展数据（策展边 / 手工节点） ---------------- */

export function readExtra(extraPath) {
  try {
    const raw = JSON.parse(fs.readFileSync(extraPath, 'utf8'))
    const topics = raw?.topics && typeof raw.topics === 'object' ? raw.topics : {}
    const out = {}
    const normEdge = (e) => {
      if (Array.isArray(e) && e.length >= 2) return { s: String(e[0]), t: String(e[1]), label: String(e[2] || '') }
      if (e && typeof e === 'object' && e.s && e.t) return { s: String(e.s), t: String(e.t), label: String(e.label || '') }
      return null
    }
    for (const [tid, val] of Object.entries(topics)) {
      out[tid] = {
        edges: (Array.isArray(val?.edges) ? val.edges : []).map(normEdge).filter(Boolean),
        nodes: (Array.isArray(val?.nodes) ? val.nodes : [])
          .filter((n) => n && typeof n.label === 'string')
          .map((n) => ({ label: String(n.label), chapter: String(n.chapter || 'other'), content: String(n.content || '') })),
      }
    }
    return out
  } catch (err) {
    if (err.code === 'ENOENT') return {}
    throw err
  }
}

export function writeExtra(extraPath, extra) {
  fs.mkdirSync(path.dirname(extraPath), { recursive: true })
  const tmp = `${extraPath}.tmp`
  fs.writeFileSync(tmp, JSON.stringify({ $comment: '知识图谱持久化扩展：edges=[s,t,label]（s/t 为节点 id 或唯一子串）；nodes 为手工补充知识点', topics: extra }, null, 2) + '\n', 'utf8')
  fs.renameSync(tmp, extraPath)
}

/** 在 extra 里追加一条边（去重） */
export function appendExtraEdge(extra, topicId, { s, t, label }) {
  const bucket = extra[topicId] || (extra[topicId] = { edges: [], nodes: [] })
  const dup = bucket.edges.some((e) => (e.s === s && e.t === t) || (e.s === t && e.t === s))
  if (!dup) bucket.edges.push({ s, t, label: String(label || '') })
  return !dup
}

/** 删除 extra 里匹配（双向）的边，返回删除数 */
export function removeExtraEdge(extra, topicId, s, t) {
  const bucket = extra[topicId]
  if (!bucket) return 0
  const before = bucket.edges.length
  bucket.edges = bucket.edges.filter((e) => !((e.s === s && e.t === t) || (e.s === t && e.t === s)))
  return before - bucket.edges.length
}

/* ---------------- 从笔记构建图谱 ---------------- */

function slug(text) {
  return (
    String(text)
      .replace(/[？?！!。，,、：:（）()《》「」\s]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'n'
  )
}

/** 解析「## 📇 问答卡片」段：章节(### 非 Q) + 问答卡(### Q:) */
export function parseNote(md) {
  const lines = String(md || '').replace(/\r\n/g, '\n').split('\n')
  const inCards = []
  let inSection = false
  for (const line of lines) {
    if (/^##\s+/.test(line)) {
      inSection = /^##\s+.*问答卡片/.test(line)
      continue
    }
    if (inSection) inCards.push(line)
  }
  const chapters = []
  const nodes = []
  let chapter = null
  let cur = null
  for (const line of inCards) {
    const h3 = /^###\s+(.+)$/.exec(line)
    if (h3) {
      if (cur) nodes.push(cur)
      const text = h3[1].trim()
      if (/^Q[:：]/.test(text)) {
        cur = { label: text.replace(/^Q[:：]\s*/, '').trim(), chapter, content: [] }
      } else {
        chapter = { name: text }
        chapters.push(chapter)
        cur = null
      }
      continue
    }
    if (cur) cur.content.push(line)
  }
  if (cur) nodes.push(cur)
  return { chapters, nodes }
}

/** id 精确匹配 → label 唯一子串匹配 */
export function findNodeId(nodes, frag) {
  const byId = nodes.find((n) => n.id === frag)
  if (byId) return byId.id
  const hits = nodes.filter((n) => n.label.includes(frag))
  return hits.length ? hits[0].id : null
}

/**
 * 构建完整图谱：bank.topics 的笔记 + graph-extra.json
 * @param {{root: string, topics: Array, extraPath: string}} opts
 */
export function buildGraphFromNotes({ root, topics, extraPath }) {
  const extra = readExtra(extraPath)
  const graph = emptyGraph()
  for (const bt of topics || []) {
    if (!bt?.note) continue
    const noteFile = path.resolve(root, bt.note)
    let md = ''
    try {
      md = fs.readFileSync(noteFile, 'utf8')
    } catch {
      graph.topics.push({ ...emptyTopic(bt), warnings: [`笔记读取失败: ${noteFile}`] })
      continue
    }
    graph.topics.push(buildTopic(bt.id, bt.name, bt.note, md, extra[bt.id]))
  }
  return graph
}

function emptyTopic(bt) {
  return { id: bt.id, name: bt.name || bt.id, note: bt.note || '', chapters: [], nodes: [], edges: [], warnings: [] }
}

function buildTopic(topicId, name, note, md, extra) {
  const t = emptyTopic({ id: topicId, name, note })
  const { chapters, nodes } = parseNote(md)

  const chapId = new Map()
  for (const c of chapters) {
    const cid = slug(c.name)
    chapId.set(c.name, cid)
    t.chapters.push({ id: cid, name: c.name })
  }

  const ensureChapter = (ref) => {
    if (!ref) return 'other'
    if (chapId.has(ref)) return chapId.get(ref)
    const found = [...chapId.entries()].find(([cname, cid]) => cid === ref || cname === ref)
    if (found) return found[1]
    const cid = slug(ref)
    chapId.set(ref, cid)
    t.chapters.push({ id: cid, name: ref })
    return cid
  }

  const used = new Set()
  const push = (label, chapter, content) => {
    let id = slug(label)
    while (used.has(id)) id += '-x'
    used.add(id)
    t.nodes.push({ id: `${topicId}:${id}`, chapter, label, content })
  }
  for (const n of nodes) push(n.label, n.chapter ? chapId.get(n.chapter.name) : 'other', n.content.join('\n').replace(/^\n+|\n+$/g, ''))
  for (const n of extra?.nodes || []) push(n.label, ensureChapter(n.chapter), n.content)

  const has = new Set()
  const addEdge = (s, tid2, kind, label) => {
    if (!s || !tid2 || s === tid2 || has.has(s + '>' + tid2)) return
    has.add(s + '>' + tid2)
    t.edges.push({ s, t: tid2, kind, label })
  }

  let prev = null
  for (const n of t.nodes) {
    if (prev && prev.chapter === n.chapter) addEdge(prev.id, n.id, 'seq', '下一问')
    prev = n
  }
  for (const e of extra?.edges || []) {
    const s = findNodeId(t.nodes, e.s)
    const d = findNodeId(t.nodes, e.t)
    if (s && d) addEdge(s, d, 'rel', e.label)
    else t.warnings.push(`${e.s} -> ${e.t} 未匹配`)
  }
  return t
}

/* ---------------- 工具用图内变更辅助 ---------------- */

/** 由 label 生成该 topic 内唯一的节点 id */
export function nodeIdFor(topic, label) {
  const ids = new Set(topic.nodes.map((x) => x.id))
  let id = `${topic.id}:${slug(String(label || '')) || 'n'}`
  while (ids.has(id)) id += '-x'
  return id
}
