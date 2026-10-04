/* easy2learn 学习模式：本地笔记知识大纲 + 正文阅读 + 学习进度 + 实时刷新 */
import { esc, extractOutline, renderMd } from './md.js'

const $ = (sel) => document.querySelector(sel)

const store = {
  state: null,          // /api/state
  notes: new Map(),     // topicId -> { text, outline }
  topicId: null,
  learned: loadLearned(),
  activeId: null,
}

function loadLearned() {
  try { return JSON.parse(localStorage.getItem('e2l.learned') || '{}') } catch { return {} }
}
function saveLearned() { localStorage.setItem('e2l.learned', JSON.stringify(store.learned)) }
function key(topicId, sectionId) { return `${topicId}::${sectionId}` }

async function fetchJson(url) {
  const res = await fetch(url)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
  return data
}

async function boot() {
  store.state = await fetchJson('/api/state')
  const withNote = store.state.topics.filter((t) => t.note)
  if (!withNote.length) throw new Error('题库 topics 没有关联笔记(note 字段)')
  await Promise.all(withNote.map(loadTopicNote))
  store.topicId = withNote[0].id
  bindStatic()
  renderSidebar()
  renderContent()
  connectSse()
}

async function loadTopicNote(topic) {
  const data = await fetchJson(`/api/notes?p=${encodeURIComponent(topic.note)}`)
  store.notes.set(topic.id, { text: data.text, outline: extractOutline(data.text) })
}

/* ---------- 渲染 ---------- */
function renderSidebar() {
  const topics = store.state.topics.filter((t) => t.note)
  $('#topic-list').innerHTML = topics
    .map((t) => {
      const learnedCount = learnedOf(t.id)
      const total = store.notes.get(t.id)?.outline.filter((o) => o.level === 3).length || 0
      const active = store.topicId === t.id ? 'active' : ''
      return `<li data-topic="${t.id}" class="${active}">
        <span>${esc(t.name)}</span>
        <span class="count">${learnedCount}/${total}</span>
      </li>`
    })
    .join('')
  renderOutline()
}

function learnedOf(topicId) {
  const prefix = `${topicId}::`
  return Object.keys(store.learned).filter((k) => k.startsWith(prefix) && store.learned[k]).length
}

function renderOutline() {
  const note = store.notes.get(store.topicId)
  const filter = $('#outline-search').value.trim().toLowerCase()
  const items = (note?.outline || []).map((o) => {
    if (filter && !o.text.toLowerCase().includes(filter)) return ''
    const isH2 = o.level === 2
    const active = store.activeId === o.id ? 'active' : ''
    const done = store.learned[key(store.topicId, o.id)] ? 'done' : ''
    if (isH2) {
      return `<div class="ol-group ${filter ? '' : 'open'}" data-sec="${o.id}">
        <span class="ol-toggle"></span><span class="ol-text">${esc(o.text)}</span>
      </div>`
    }
    return `<a class="ol-item ${active} ${done}" data-sec="${o.id}" href="#${o.id}">
      <span class="ol-check" data-check="${o.id}" title="标记已学">${store.learned[key(store.topicId, o.id)] ? '✓' : '○'}</span>
      <span class="ol-text">${esc(o.text)}</span>
    </a>`
  })
  $('#outline').innerHTML = items.join('') || '<p class="hint">无匹配知识点</p>'

  const total = (note?.outline || []).filter((o) => o.level === 3).length
  const done = learnedOf(store.topicId)
  $('#outline-progress').textContent = `${done}/${total}`
}

function renderContent() {
  const topic = store.state.topics.find((t) => t.id === store.topicId)
  const note = store.notes.get(store.topicId)
  $('#crumb').textContent = `${topic?.name || ''} · 知识笔记`
  const html = renderMd(note?.text || '')
  $('#content').innerHTML = `<article class="learn-doc md">${html}</article>`
  // 给渲染出的 h2/h3 依序注入 id（与 extractOutline 顺序一致）
  const heads = [...document.querySelectorAll('#content h2, #content h3')]
  const outline = note?.outline || []
  let oi = 0
  for (const h of heads) {
    while (oi < outline.length && outline[oi].level !== Number(h.tagName[1])) oi++
    if (oi >= outline.length) break
    h.id = outline[oi].id
    h.insertAdjacentHTML(
      'beforeend',
      `<button class="sec-mark ${store.learned[key(store.topicId, outline[oi].id)] ? 'on' : ''}" data-mark="${outline[oi].id}" title="标记已学">${store.learned[key(store.topicId, outline[oi].id)] ? '✓ 已学' : '○ 标记已学'}</button>`,
    )
    oi++
  }
  if (store.activeId) {
    const el = document.getElementById(store.activeId)
    if (el) requestAnimationFrame(() => el.scrollIntoView({ block: 'start' }))
  } else $('#content').scrollTop = 0
}

/* ---------- 交互 ---------- */
function bindStatic() {
  $('#topic-list').addEventListener('click', (e) => {
    const li = e.target.closest('li[data-topic]')
    if (!li) return
    store.topicId = li.dataset.topic
    store.activeId = null
    renderSidebar()
    renderContent()
  })
  $('#outline').addEventListener('click', (e) => {
    const check = e.target.closest('.ol-check')
    if (check) {
      e.preventDefault()
      toggleLearned(check.dataset.check)
      return
    }
    const group = e.target.closest('.ol-group')
    if (group && !e.target.closest('.ol-item')) {
      let next = group.nextElementSibling
      while (next && !next.classList.contains('ol-group')) {
        next.classList.toggle('hidden')
        next = next.nextElementSibling
      }
      group.classList.toggle('open')
      return
    }
    const item = e.target.closest('.ol-item')
    if (item) {
      store.activeId = item.dataset.sec
      renderOutline()
      document.getElementById(store.activeId)?.scrollIntoView({ block: 'start', behavior: 'smooth' })
    }
  })
  $('#outline-search').addEventListener('input', renderOutline)
  $('#btn-mark').addEventListener('click', () => {
    const cur = currentSection()
    if (cur) toggleLearned(cur)
  })
  $('#btn-prev').addEventListener('click', () => stepSection(-1))
  $('#btn-next').addEventListener('click', () => stepSection(1))
  $('#content').addEventListener('click', (e) => {
    const mark = e.target.closest('[data-mark]')
    if (mark) toggleLearned(mark.dataset.mark)
  })
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
    if (e.key === 'j' || e.key === 'ArrowDown') { e.preventDefault(); stepSection(1) }
    if (e.key === 'k' || e.key === 'ArrowUp') { e.preventDefault(); stepSection(-1) }
  })
}

function sections() {
  return (store.notes.get(store.topicId)?.outline || []).filter((o) => o.level === 3)
}

function currentSection() {
  const ss = sections()
  if (!ss.length) return null
  if (store.activeId && ss.some((s) => s.id === store.activeId)) return store.activeId
  // 按滚动位置找当前节
  for (const s of ss) {
    const el = document.getElementById(s.id)
    if (el && el.getBoundingClientRect().top > 120) return s.id
  }
  return ss[ss.length - 1].id
}

function stepSection(dir) {
  const ss = sections()
  if (!ss.length) return
  const idx = Math.max(0, ss.findIndex((s) => s.id === currentSection()))
  const next = ss[Math.min(ss.length - 1, Math.max(0, idx + dir))]
  store.activeId = next.id
  renderOutline()
  document.getElementById(next.id)?.scrollIntoView({ block: 'start', behavior: 'smooth' })
}

function toggleLearned(sectionId) {
  const k = key(store.topicId, sectionId)
  store.learned[k] = !store.learned[k]
  saveLearned()
  renderSidebar()
  // 更新正文里的标记按钮（不重渲染正文，避免跳滚动）
  const btn = document.querySelector(`[data-mark="${sectionId}"]`)
  if (btn) {
    btn.classList.toggle('on', store.learned[k])
    btn.textContent = store.learned[k] ? '✓ 已学' : '○ 标记已学'
  }
}

/* ---------- SSE 实时更新 ---------- */
function connectSse() {
  const es = new EventSource('/api/events')
  es.addEventListener('hello', () => {
    $('#conn-dot').className = 'dot on'
    $('#live-badge').classList.remove('hidden')
  })
  es.addEventListener('notes', async () => {
    // 本地笔记被 agent 编辑 → 重拉当前科目并重渲染
    const topic = store.state.topics.find((t) => t.id === store.topicId)
    if (topic) await loadTopicNote(topic)
    renderSidebar()
    renderContent()
  })
  es.addEventListener('reload', () => location.reload())
  es.onerror = () => {
    $('#conn-dot').className = 'dot off'
    $('#live-badge').classList.add('hidden')
  }
}

boot().catch((err) => {
  $('#content').innerHTML = `<div class="empty"><div class="big">💥</div><p>加载失败: ${esc(err.message)}</p></div>`
})
