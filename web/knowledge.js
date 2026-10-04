/**
 * easy2learn 知识内核：前端展示框架 与 数据 之间的解耦层。
 *
 * 分层：
 *   数据源(graph.json / bank.json / …)
 *     → 适配器(adapter registry, 按数据自带的 schema/source 选择)
 *     → 归一化领域模型(Topic / Unit)
 *     → 视图(learn.js 的图谱/滑动/详情面板，kgraph.js 引擎)
 *
 * 领域模型（前端唯一认可的形状，视图不得越过本层直接读原始数据）：
 *   Topic { id, name, source, chapters[{id,name}], units[Unit], edges[{s,t,kind,label}], warnings[] }
 *   Unit  { id, title, kind, chapter, tags[], body:{format:'md', text} }
 *
 * kind = 知识形态（兼容多种知识的关键）：
 *   'qa'      问答卡：title 即问题，body 是答案（含 🔑 口诀 / ⚠️ 追问）
 *   'concept' 概念/结论性知识点：纯 markdown
 *   'code'    代码为主的知识点：markdown 中代码块占主导
 *   …可通过 registerRenderer() 扩展（如 quiz-embed / compare / …）
 *
 * 新增数据源三步：
 *   1. 服务端输出带 { schema, topics } 的 JSON
 *   2. registerAdapter(schemaName, (raw) => Topic[])
 *   3. 完成——视图自动获得图谱/滑动/详情三种展示
 */
import { esc, renderMd } from './md.js'

/* ---------------- 知识形态 ---------------- */

export const UNIT_KINDS = ['qa', 'concept', 'code']

const KIND_META = {
  qa: { icon: '💬', label: '问答' },
  concept: { icon: '📖', label: '概念' },
  code: { icon: '💻', label: '代码' },
}

/** kind → 角标信息（未知 kind 也有兜底，视图永远能渲染） */
export function kindMeta(kind) {
  return KIND_META[kind] || { icon: '📄', label: '知识' }
}

/** 归一化 kind：未知/缺失 → ''（由 inferUnitKind 兜底推断） */
function normKind(k) {
  return UNIT_KINDS.includes(k) ? k : ''
}

/**
 * 启发式推断知识形态（服务端没给 kind 的存量数据走这里）。
 * 只看内容本身：问答卡正文几乎都以 A:/Q: 标记开头；代码块字符数超过散文才算代码型。
 * @param {{title?:string, body?:string}} u
 */
export function inferUnitKind(u = {}) {
  const text = String(u.body || '')
  if (/^\s*\*{0,2}A[:：]/m.test(text) || /^\s*Q[:：]/m.test(text)) return 'qa'
  const fences = [...text.matchAll(/```[\w+#-]*\n([\s\S]*?)```/g)].map((m) => m[1].length)
  const codeLen = fences.reduce((a, b) => a + b, 0)
  const proseLen = text.replace(/```[\s\S]*?```/g, '').length
  if (codeLen > 0 && codeLen > proseLen) return 'code'
  return 'concept'
}

/* ---------------- 适配器注册表（数据源 → 领域模型） ---------------- */

const adapters = new Map()

/** 注册数据源适配器；同名覆盖（热替换/测试用） */
export function registerAdapter(name, fn) {
  adapters.set(name, fn)
}

/** 把任意原始数据归一化为 Topic[]；不认识的数据形状 → 空数组（视图显示空态而不是崩溃） */
export function adapt(raw) {
  if (!raw || typeof raw !== 'object') return []
  const name = String(raw.schema === 1 || (Array.isArray(raw.topics) && raw.topics.length) ? 'graph' : raw.schema || '')
  const fn = adapters.get(name)
  return fn ? fn(raw) : []
}

function toUnit(n) {
  const kind = normKind(n.kind) || inferUnitKind({ title: n.label, body: n.content })
  return {
    id: String(n.id || ''),
    title: String(n.label || n.id || ''),
    kind,
    chapter: String(n.chapter || 'other'),
    tags: Array.isArray(n.tags) ? n.tags.map(String) : [],
    body: { format: 'md', text: String(n.content || '') },
  }
}

/** 默认适配器：服务端 graph.json (schema 1) → Topic[] */
function graphAdapter(raw) {
  const out = []
  for (const t of Array.isArray(raw.topics) ? raw.topics : []) {
    if (!t || typeof t.id !== 'string' || !Array.isArray(t.nodes)) continue
    out.push({
      id: t.id,
      name: String(t.name || t.id),
      source: String(t.source || 'notes'),
      chapters: (Array.isArray(t.chapters) ? t.chapters : [])
        .filter((c) => c && c.id && c.name)
        .map((c) => ({ id: String(c.id), name: String(c.name) })),
      units: t.nodes.map((n) => toUnit(n)).filter((u) => u.id && u.title),
      edges: (Array.isArray(t.edges) ? t.edges : [])
        .filter((e) => e && e.s && e.t)
        .map((e) => ({ s: String(e.s), t: String(e.t), kind: e.kind === 'rel' ? 'rel' : 'seq', label: String(e.label || '') })),
      warnings: Array.isArray(t.warnings) ? t.warnings.map(String) : [],
    })
  }
  return out
}
registerAdapter('graph', graphAdapter)

/* ---------------- 渲染器注册表（领域模型 → 展示 HTML） ---------------- */

const renderers = new Map()

/**
 * 注册某知识形态的渲染器：fn(unit) → html 字符串。
 * 视图（滑动卡/详情面板）一律通过 renderUnit 输出内容，不关心 kind 细节。
 */
export function registerRenderer(kind, fn) {
  renderers.set(kind, fn)
}

/** 查表渲染；未知 kind 回退 concept（保证任何数据都能展示） */
export function renderUnit(unit) {
  const fn = renderers.get(unit.kind) || renderers.get('concept')
  return fn ? fn(unit) : `<div class="unit">${renderMd(unit.body?.text || '')}</div>`
}

/* ---------------- 内置渲染器 ---------------- */

function bodyText(u) {
  return u.body?.format === 'md' ? u.body.text : esc(u.body?.text || '')
}

registerRenderer('concept', (u) => `<div class="unit unit-concept">${renderMd(bodyText(u))}</div>`)

registerRenderer('code', (u) => `<div class="unit unit-code">${renderMd(bodyText(u))}</div>`)

registerRenderer('qa', (u) => {
  let text = bodyText(u)
  // 答案开头的 **A:** 标记吸收进横幅，避免与问题重复占一行
  text = text.replace(/^\s*\*{0,2}A[:：]\*{0,2}\s*\n?/, '')
  return `<div class="unit unit-qa">
  <div class="qa-banner"><span class="qa-badge">Q</span><span class="qa-q">${esc(u.title)}</span></div>
  <div class="qa-a">${renderMd(text)}</div>
</div>`
})
