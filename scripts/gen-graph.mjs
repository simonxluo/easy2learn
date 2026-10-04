/**
 * 生成 data/graph.json：把 interview-prep 的两份面经笔记解析成知识图谱
 * 节点 = 每张问答卡片（### Q: ...），章节 = ### 非 Q 开头的分组标题，
 * 边 = 章节内顺序链（下一问）+ 手工策划的跨章节语义关联（把知识串起来）。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** 手工策划的语义关联（按子串匹配节点 label，双向可读） */
const CURATED = {
  os: [
    ['进程和线程的区别', '进程间通信', '同属进程管理'],
    ['进程间通信', '线程同步方式', '共享内存需同步'],
    ['线程同步方式', '互斥锁和自旋锁', '细化'],
    ['线程同步方式', '乐观锁', '两派思路'],
    ['互斥锁和自旋锁', '原子操作', '更轻的同步'],
    ['乐观锁', '原子操作', 'CAS 实现'],
    ['原子操作', '内存屏障', '底层机制'],
    ['进程和线程的区别', '协程', '更轻的执行单元'],
    ['虚拟内存', 'TLB', '加速地址转换'],
    ['虚拟内存', '缺页中断', '按需加载'],
    ['缺页中断', '页面置换', '无空闲页框时'],
    ['虚拟内存', 'mmap', '映射手段'],
    ['内存对齐', 'TLB', '硬件访存效率'],
    ['五种 IO 模型', '同步 IO 和异步 IO', '本质判据'],
    ['五种 IO 模型', 'epoll', '多路复用实现'],
    ['epoll', '零拷贝', '高性能 IO'],
    ['同步 IO 和异步 IO', 'Reactor 和 Proactor', '两种事件模型'],
    ['零拷贝', 'Reactor 和 Proactor', '高吞吐服务'],
    ['死锁的四个必要条件', '如何预防', '对策'],
    ['如何预防', '银行家算法', '避免策略'],
    ['线程同步方式', '死锁的四个必要条件', '用锁不当的后果'],
  ],
  cpp: [
    ['内存分区', 'new/delete', '堆的来源'],
    ['new/delete', 'unique_ptr', '自动化释放'],
    ['unique_ptr', '循环引用', '共享所有权陷阱'],
    ['循环引用', 'RAII', '所有权设计'],
    ['unique_ptr', 'RAII', '核心思想'],
    ['RAII', '内存泄漏', '防线'],
    ['虚函数是怎么实现', '虚函数和纯虚函数', '接口化'],
    ['虚函数是怎么实现', '析构函数能否为虚', 'vptr 生命周期'],
    ['拷贝构造函数的调用时机', '深拷贝', '复制语义'],
    ['深拷贝', '三/五法则', '何时必须自定义'],
    ['右值引用和移动语义', '完美转发', '左右值属性透传'],
    ['右值引用和移动语义', 'vector 扩容', '搬移加速'],
    ['vector 扩容', 'STL 迭代器失效', '搬迁副作用'],
    ['STL 迭代器失效', 'map 和 unordered_map', '容器行为对比'],
    ['map 和 unordered_map', '红黑树的特性', '底层结构'],
    ['一个 C++ 程序从代码', '静态链接', '链接方式'],
    ['静态链接', '大端小端', '数据布局'],
    ['constexpr 和 const', 'auto 和 decltype', '现代特性'],
    ['lambda 表达式', 'auto 和 decltype', '类型推导联动'],
  ],
}

function slug(text) {
  return String(text)
    .replace(/[？?！!。，,、：:（）()《》「」\s]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'n'
}

/** 解析「## 📇 问答卡片」段：返回 chapters/nodes（含顺序） */
function parseNote(md) {
  const lines = md.replace(/\r\n/g, '\n').split('\n')
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

function buildTopic(topicId, name, notePath) {
  const md = fs.readFileSync(path.resolve(ROOT, '..', notePath), 'utf8')
  const { chapters, nodes } = parseNote(md)

  const chapId = new Map()
  for (const c of chapters) chapId.set(c.name, slug(c.name))

  const used = new Set()
  const outNodes = []
  const byLabel = []
  for (const n of nodes) {
    let id = slug(n.label)
    while (used.has(id)) id += '-x'
    used.add(id)
    const node = {
      id: `${topicId}:${id}`,
      chapter: n.chapter ? chapId.get(n.chapter.name) : 'other',
      label: n.label,
      content: n.content.join('\n').replace(/^\n+|\n+$/g, ''),
    }
    outNodes.push(node)
    byLabel.push({ label: n.label, id: node.id })
  }

  const find = (frag) => {
    const hits = byLabel.filter((n) => n.label.includes(frag))
    return hits.length === 1 ? hits[0].id : hits.length ? hits[0].id : null
  }

  const edges = []
  const has = new Set()
  const addEdge = (s, t, kind, label = '') => {
    if (!s || !t || s === t || has.has(s + '>' + t)) return
    has.add(s + '>' + t)
    edges.push({ s, t, kind, label })
  }

  // 章节内顺序链
  let prev = null
  for (const n of outNodes) {
    if (prev && prev.chapter === n.chapter) addEdge(prev.id, n.id, 'seq', '下一问')
    prev = n
  }
  // 章节枢纽：章节 → 首个知识点（视觉锚）
  // 语义关联
  const warnings = []
  for (const [a, b, label] of CURATED[topicId] || []) {
    const sa = find(a), sb = find(b)
    if (sa && sb) addEdge(sa, sb, 'rel', label)
    else warnings.push(`${a} -> ${b} 未匹配`)
  }

  return {
    id: topicId,
    name,
    note: notePath,
    chapters: chapters.map((c) => ({ id: chapId.get(c.name), name: c.name })),
    nodes: outNodes,
    edges,
    warnings,
  }
}

const graph = {
  generatedAt: new Date().toISOString(),
  engine: 'builtin-force', // web/kgraph.js；未来可换 cytoscape 等
  topics: [
    buildTopic('os', '操作系统', 'interview-prep/os/操作系统.md'),
    buildTopic('cpp', 'C++', 'interview-prep/language/编程语言.md'),
  ],
}

const out = path.join(ROOT, 'data', 'graph.json')
fs.writeFileSync(out, JSON.stringify(graph, null, 2) + '\n', 'utf8')
for (const t of graph.topics) {
  console.log(`${t.name}: ${t.nodes.length} 节点, ${t.edges.length} 边 (rel ${(t.edges.filter((e) => e.kind === 'rel')).length}), 章节 ${t.chapters.map((c) => c.name).join('/')}`)
  if (t.warnings.length) console.log('  ⚠️ 未匹配:', t.warnings.join('; '))
}
