/** CLI：从 interview-prep 笔记 + data/graph-extra.json 重建 data/graph.json（逻辑在 src/graph.js） */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildGraphFromNotes, saveGraph } from '../src/graph.js'
import { emptyBank, loadBank } from '../src/bank.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const bankPath = path.join(ROOT, 'data', 'bank.json')
const graphPath = path.join(ROOT, 'data', 'graph.json')
const extraPath = path.join(ROOT, 'data', 'graph-extra.json')
const root = path.dirname(ROOT)

const bank = loadBank(bankPath) || emptyBank()
const graph = buildGraphFromNotes({ root, topics: bank.topics, extraPath })
saveGraph(graphPath, graph)
for (const t of graph.topics) {
  console.log(
    `${t.name}: ${t.nodes.length} 节点, ${t.edges.length} 边 (rel ${t.edges.filter((e) => e.kind === 'rel').length}), 章节 ${t.chapters.map((c) => c.name).join('/')}`,
  )
  if (t.warnings.length) console.log(`  ⚠️ ${t.warnings.join('; ')}`)
}
