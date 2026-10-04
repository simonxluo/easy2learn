/* easy2learn 学习模式 v3
 * 展示层只消费 knowledge.js 归一化出的领域模型(Topic/Unit)，
 * 原始数据形状(graph.json 等)被隔离在适配层之后 —— 换数据源不动视图。
 * 视图：🕸 知识图谱（点选 → 下方看内容）+ 📑 滑动阅读（竖目录 + 横向滑卡）
 */
import { esc } from './md.js'
import { KGraph } from './kgraph.js'
import { adapt, renderUnit, kindMeta } from './knowledge.js'

const $ = (sel) => document.querySelector(sel)

const store = {
  topics: [],            // 领域模型 Topic[]（adapt 产物）
  topicId: null,
  view: 'graph',         // graph | slide
  selected: null,        // 当前知识点单元 id
  slideIndex: 0,
  learned: loadLearned(),
}

function loadLearned() {
  try { return JSON.parse(localStorage.getItem('e2l.learned') || '{}') } catch { return {} }
}
function saveLearned() { localStorage.setItem('e2l.learned', JSON.stringify(store.learned)) }
function key(unitId) { return `${store.topicId}::${unitId}` }
function isLearned(unitId) { return Boolean(store.learned[key(unitId)]) }

function topic() { return store.topics.find((t) => t.id === store.topicId) }
function units() { return topic()?.units || [] }
function edges() { return topic()?.edges || [] }
function unitById(id) { return units().find((u) => u.id === id) }
function neighborsOf(id) {
  const out = new Set()
  for (const e of edges()) {
    if (e.s === id) out.add(e.t)
    if (e.t === id) out.add(e.s)
  }
  return [...out]
}

async function fetchJson(url) {
  const res = await fetch(url)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
  return data
}

async function loadTopics() {
  const raw = await fetchJson('/api/graph')
  const topics = adapt(raw)
  if (!topics.length) throw new Error('没有可识别的知识数据（schema 不支持或 topics 为空）')
  store.topics = topics
}

async function boot() {
  await loadTopics()
  store.topicId = store.topics[0].id
  bindStatic()
  renderSidebar()
  initView()
  connectSse()
}

/* ================= 初始化与视图切换 ================= */
let kg = null
let viewNeedsFit = true // 切主题 / 图谱数据变更时置 true，refreshGraph 里消费

function initView() {
  if (!kg) {
    kg = new KGraph($('#graph-wrap'), {
      onTap: (id) => {
        if (id) selectNode(id)
        else hideDetail()
      },
    })
  }
  applyView()
}

function applyView() {
  const graph = store.view === 'graph'
  $('#view-graph').classList.toggle('hidden', !graph)
  $('#view-slide').classList.toggle('hidden', graph)
  document.querySelectorAll('#view-toggle .seg-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.view === store.view)
  })
  $('#view-hint').textContent = graph
    ? '点击节点 → 下方看知识点内容；拖拽平移，滚轮/双指捏合缩放，右上 ⤢ 复位'
    : '← → 方向键或横向滑动切卡；左侧竖排目录点击跳转'
  $('#btn-prev').textContent = graph ? '← 上一节' : '← 上一张'
  $('#btn-next').textContent = graph ? '下一节 →' : '下一张 →'
  if (graph) {
    kg.resize() // 容器刚解除 display:none，同步用真实尺寸重设画布（不等 RO 异步回调）
    refreshGraph()
    if (store.selected) showDetail(store.selected)
  } else {
    renderSlideMode()
  }
  renderStats()
  renderCrumb()
}

/** 领域模型 → 图谱引擎的节点形状（引擎只懂 id/label/chapter/done，不知道 Unit） */
function refreshGraph() {
  const t = topic()
  kg.setData({
    nodes: units().map((u) => ({ id: u.id, label: u.title, chapter: u.chapter, done: isLearned(u.id) })),
    edges: edges(),
    chapters: t.chapters,
  })
  kg.select(store.selected)
  // 只有切换主题/图谱数据更新时才重置视图；
  // 平时的字段刷新（如"标记已学"）保留用户当前的平移缩放。
  if (viewNeedsFit) {
    if (store.selected) kg.centerOn(store.selected)
    else kg.fit()
    viewNeedsFit = false
  }
  renderLegend()
}

/* ================= 侧栏 ================= */
function renderSidebar() {
  $('#topic-list').innerHTML = store.topics
    .map((t) => {
      const done = t.units.filter((u) => isLearned(u.id)).length
      const active = store.topicId === t.id ? 'active' : ''
      const kinds = new Set(t.units.map((u) => u.kind))
      const mix = [...kinds].map((k) => kindMeta(k).icon).join('') || '📄'
      return `<li data-topic="${t.id}" class="${active}" title="${esc(t.name)} · ${t.units.length} 个知识点"><span>${mix} ${esc(t.name)}</span><span class="count">${done}/${t.units.length}</span></li>`
    })
    .join('')
  renderStats()
}

function renderStats() {
  const us = units()
  const done = us.filter((u) => isLearned(u.id)).length
  const pct = us.length ? Math.round((done / us.length) * 100) : 0
  $('#stats').innerHTML =
    `<div>已学 <b>${done}</b> / ${us.length} 个知识点</div>` +
    `<div class="bar"><i style="width:${pct}%"></i></div>`
}

/** 顶栏面包屑：科目 · 当前知识点/进度（修复：此前静态写死「加载中…」永不更新） */
function renderCrumb() {
  const t = topic()
  if (!t) return
  let text = t.name
  if (store.view === 'graph') {
    const u = store.selected ? unitById(store.selected) : null
    if (u) text += ` · ${u.title}`
  } else {
    const us = units()
    if (us.length) text += ` · ${store.slideIndex + 1}/${us.length}`
  }
  $('#crumb').textContent = text
}

function renderLegend() {
  const t = topic()
  $('#legend').innerHTML = t.chapters
    .map((c) => {
      const color = kg.chapterColors.get(c.id) || '#8b93a3'
      const inCh = units().filter((u) => u.chapter === c.id)
      const done = inCh.filter((u) => isLearned(u.id)).length
      return `<div class="legend-item"><i style="background:${color}"></i>${esc(c.name)} <span class="count">${done}/${inCh.length}</span></div>`
    })
    .join('') + `<div class="legend-item hint">✓ = 已学 · 实线绿 = 关联 · 灰 = 下一问</div>`
}

/* ================= 图谱模式：详情面板 ================= */
function selectNode(id) {
  store.selected = id
  kg.select(id)
  kg.centerOn(id)
  showDetail(id)
}

function showDetail(id) {
  const u = unitById(id)
  if (!u) return
  const meta = kindMeta(u.kind)
  const chapterName = topic().chapters.find((c) => c.id === u.chapter)?.name || u.chapter
  $('#detail-chapter').textContent = chapterName
  $('#detail-kind').textContent = `${meta.icon} ${meta.label}`
  $('#detail-title').textContent = u.title
  const learned = isLearned(id)
  $('#btn-mark').textContent = learned ? '✓ 已学' : '○ 标记已学'
  $('#btn-mark').classList.toggle('on', learned)
  const rels = neighborsOf(id)
    .map((nid) => unitById(nid))
    .filter(Boolean)
    .slice(0, 8)
  $('#detail-related').innerHTML = rels.length
    ? `<span class="hint">关联知识点：</span>` + rels.map((r) => `<button class="chip small" data-jump="${r.id}">${esc(r.title)}</button>`).join('')
    : ''
  $('#detail-body').innerHTML = renderUnit(u)
  $('#node-detail').classList.remove('hidden')
  $('#node-detail').scrollTop = 0
  renderCrumb()
}

function hideDetail() {
  $('#node-detail').classList.add('hidden')
  renderCrumb()
}

/* ================= 滑动阅读模式 ================= */
function renderSlideMode() {
  const t = topic()
  const us = units()
  // 目录：章节分组的小 chip 条
  const groups = t.chapters
    .map((c) => {
      const items = us
        .map((u, i) => ({ u, i }))
        .filter(({ u }) => u.chapter === c.id)
        .map(({ u, i }) => {
          const active = i === store.slideIndex ? 'active' : ''
          const done = isLearned(u.id) ? 'done' : ''
          return `<button class="toc-item ${active} ${done}" data-goto="${i}">${esc(shortLabel(u.title))}</button>`
        })
        .join('')
      return `<span class="toc-group">${esc(c.name)}</span>${items}`
    })
    .join('')
  $('#slide-toc').innerHTML = groups

  // 横向滑卡：内容一律 renderUnit(unit)，卡片不关心知识形态
  $('#slide-track').innerHTML = us
    .map((u, i) => {
      const chapterName = t.chapters.find((c) => c.id === u.chapter)?.name || ''
      const learned = isLearned(u.id)
      const meta = kindMeta(u.kind)
      return `<article class="slide-card" data-index="${i}">
        <header class="card-head">
          <span class="badge type">${esc(chapterName)}</span>
          <span class="badge kind">${meta.icon} ${meta.label}</span>
          <span class="badge">${i + 1}/${us.length}</span>
          <button class="sec-mark ${learned ? 'on' : ''}" data-mark="${u.id}">${learned ? '✓ 已学' : '○ 标记已学'}</button>
        </header>
        <h2>${esc(u.title)}</h2>
        <div class="card-body">${renderUnit(u)}</div>
      </article>`
    })
    .join('')

  scrollToCard(store.slideIndex, false)
  updateTocActive()
}

function shortLabel(s) { return s.length > 10 ? `${s.slice(0, 9)}…` : s }

function cardEls() { return [...document.querySelectorAll('.slide-card')] }

function scrollToCard(index, smooth = true) {
  const el = cardEls()[index]
  if (!el) return
  el.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', inline: 'center', block: 'nearest' })
  renderCrumb() // 程序化切卡（按钮/目录）不必然触发 scroll 事件守卫，这里兜底刷新
}

function onSlideScroll() {
  const vp = $('#slide-viewport')
  const vpCenter = vp.getBoundingClientRect().left + vp.clientWidth / 2
  let best = 0, bestDist = Infinity
  cardEls().forEach((el, i) => {
    const mid = el.getBoundingClientRect().left + el.offsetWidth / 2
    const d = Math.abs(mid - vpCenter)
    if (d < bestDist) { bestDist = d; best = i }
  })
  if (best !== store.slideIndex) {
    store.slideIndex = best
    updateTocActive()
    renderCrumb()
  }
}

function updateTocActive() {
  document.querySelectorAll('.toc-item').forEach((b) => {
    b.classList.toggle('active', Number(b.dataset.goto) === store.slideIndex)
  })
  const cur = document.querySelector('.toc-item.active')
  // 目录是竖排侧栏：block:'nearest' 让当前项在目录里纵向滚入视野
  if (cur) cur.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
}

/* ================= 交互绑定 ================= */
function bindStatic() {
  $('#topic-list').addEventListener('click', (e) => {
    const li = e.target.closest('li[data-topic]')
    if (!li) return
    store.topicId = li.dataset.topic
    store.selected = null
    store.slideIndex = 0
    viewNeedsFit = true
    hideDetail()
    renderSidebar()
    applyView()
  })
  $('#view-toggle').addEventListener('click', (e) => {
    const b = e.target.closest('[data-view]')
    if (!b) return
    store.view = b.dataset.view
    applyView()
  })
  $('#btn-mark').addEventListener('click', () => {
    if (store.selected) toggleLearned(store.selected)
  })
  $('#btn-detail-close').addEventListener('click', hideDetail)
  $('#btn-fit').addEventListener('click', () => kg && kg.fit())
  $('#btn-prev').addEventListener('click', () => step(-1))
  $('#btn-next').addEventListener('click', () => step(1))
  $('#detail-related').addEventListener('click', (e) => {
    const b = e.target.closest('[data-jump]')
    if (b) selectNode(b.dataset.jump)
  })
  $('#slide-toc').addEventListener('click', (e) => {
    const b = e.target.closest('[data-goto]')
    if (!b) return
    store.slideIndex = Number(b.dataset.goto)
    scrollToCard(store.slideIndex)
  })
  $('#slide-track').addEventListener('click', (e) => {
    const mark = e.target.closest('[data-mark]')
    if (mark) toggleLearned(mark.dataset.mark)
  })
  $('#slide-viewport').addEventListener('scroll', onSlideScroll, { passive: true })
  $('#reset-progress').addEventListener('click', () => {
    if (!confirm('清空全部学习进度？')) return
    store.learned = {}
    saveLearned()
    refreshUI()
  })
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
    if (e.key === 'ArrowRight') { e.preventDefault(); step(1) }
    if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1) }
  })
}

function step(dir) {
  const us = units()
  if (!us.length) return
  if (store.view === 'graph') {
    // 图谱模式：沿单元顺序（=笔记阅读顺序）走
    const idx = store.selected ? us.findIndex((u) => u.id === store.selected) : -1
    const next = us[Math.min(us.length - 1, Math.max(0, idx + dir))]
    selectNode(next.id)
  } else {
    store.slideIndex = Math.min(us.length - 1, Math.max(0, store.slideIndex + dir))
    scrollToCard(store.slideIndex)
  }
}

function toggleLearned(unitId) {
  const k = key(unitId)
  store.learned[k] = !store.learned[k]
  saveLearned()
  refreshUI()
}

function refreshUI() {
  renderSidebar()
  renderLegend()
  renderStats()
  if (store.view === 'graph') {
    refreshGraph()
    if (store.selected) showDetail(store.selected)
  } else {
    document.querySelectorAll('.slide-card [data-mark]').forEach((btn) => {
      const on = isLearned(btn.dataset.mark)
      btn.classList.toggle('on', on)
      btn.textContent = on ? '✓ 已学' : '○ 标记已学'
    })
    document.querySelectorAll('.toc-item').forEach((b) => {
      const idx = Number(b.dataset.goto)
      b.classList.toggle('done', isLearned(units()[idx]?.id))
    })
  }
}

/* ================= SSE 实时更新 ================= */
function connectSse() {
  const es = new EventSource('/api/events')
  es.addEventListener('hello', () => {
    $('#conn-dot').className = 'dot on'
    $('#live-badge').classList.remove('hidden')
  })
  es.addEventListener('graph', async () => {
    const prevTopic = store.topicId
    const prevSel = store.selected
    await loadTopics()
    store.topicId = store.topics.some((t) => t.id === prevTopic) ? prevTopic : store.topics[0].id
    if (store.selected && !unitById(store.selected)) store.selected = null
    if (store.slideIndex >= units().length) store.slideIndex = 0
    viewNeedsFit = true
    renderSidebar()
    applyView()
    if (prevSel && unitById(prevSel)) {
      store.selected = prevSel
      if (store.view === 'graph') selectNode(prevSel)
    }
  })
  es.addEventListener('notes', async () => {
    // 笔记被编辑：图谱未必重建，先重拉（agent 通常会跟着 regen）；内容仍以 graph 为准
    try {
      await loadTopics()
      viewNeedsFit = true
      renderSidebar()
      applyView()
    } catch {}
  })
  es.addEventListener('reload', () => location.reload())
  es.onerror = () => {
    $('#conn-dot').className = 'dot off'
    $('#live-badge').classList.add('hidden')
  }
}

boot().catch((err) => {
  $('#graph-wrap').innerHTML = `<div class="empty"><div class="big">💥</div><p>加载失败: ${esc(err.message)}</p></div>`
})
