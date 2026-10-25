/* ============================================================
   easy2learn · 笔记浏览（notes.html）
   左侧：笔记目录树（按目录分组 + 即时搜索 + 键盘导航）
   右侧：markdown 正文（复用 md.js 渲染）
   - 深链：#<笔记路径>，刷新/分享不丢位置；localStorage 记忆上次阅读
   - SSE：notes 事件刷新目录与正文；reload 事件整页刷新
   ============================================================ */
import { esc, renderMd } from './md.js'

/* 子路径部署（如 https://host/easy2learn/）时由 HTML 注入；根路径部署为空串 */
const BASE = window.E2L_BASE || ''
const $ = (s) => document.querySelector(s)

const store = {
  files: [],      // { path, dir, name, bytes, mtime }
  current: '',    // 当前笔记相对路径
  filter: '',     // 搜索词
  legacy: false,  // 服务端无 list 接口（旧进程）→ 用题库主题关联笔记兜底
}

async function fetchJson(url) {
  const res = await fetch(url)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
  return data
}

/* ---------- 目录树 ---------- */

async function loadList() {
  try {
    const data = await fetchJson(BASE + '/api/notes/list')
    store.files = data.files || []
    store.legacy = false
  } catch (err) {
    // 旧服务进程（如 DSH 宿主未重启）没有 /api/notes/list：
    // 退化为题库 topics[].note 关联的笔记，保证页面可用
    const state = await fetchJson(BASE + '/api/state')
    const seen = new Set()
    store.files = (state.topics || [])
      .map((t) => t.note)
      .filter((p) => p && !seen.has(p) && seen.add(p))
      .map((p) => {
        const i = p.lastIndexOf('/')
        return { path: p, dir: i < 0 ? '' : p.slice(0, i), name: p.slice(i + 1).replace(/\.md$/i, ''), bytes: 0, mtime: null }
      })
    store.legacy = true
  }
  renderNav()
}

function visibleFiles() {
  const q = store.filter.trim().toLowerCase()
  return q ? store.files.filter((f) => f.path.toLowerCase().includes(q)) : store.files
}

function renderNav() {
  const nav = $('#note-nav')
  const files = visibleFiles()
  $('#note-count').textContent = `${files.length}/${store.files.length} 篇`
  if (!files.length) {
    nav.innerHTML = `<p class="hint" style="padding:6px 12px">没有匹配「${esc(store.filter)}」的笔记</p>`
    return
  }
  const groups = new Map()
  for (const f of files) {
    if (!groups.has(f.dir)) groups.set(f.dir, [])
    groups.get(f.dir).push(f)
  }
  // 根目录文件排最前，其余按目录名排序；组内顺序沿用服务端的中文 locale 排序
  const dirs = [...groups.keys()].sort((a, b) => (a === '' ? -1 : b === '' ? 1 : a.localeCompare(b, 'zh-Hans-CN')))
  nav.innerHTML = dirs
    .map(
      (dir) => `
    ${dir ? `<div class="note-group" title="${esc(dir)}">${esc(dir)}</div>` : ''}
    <ul class="topic-list">
      ${groups
        .get(dir)
        .map(
          (f) => `
      <li data-path="${esc(f.path)}" class="${f.path === store.current ? 'active' : ''}" title="${esc(f.path)}">
        <span class="note-name">${esc(f.name)}</span>
        ${f.bytes ? `<span class="count">${fmtSize(f.bytes)}</span>` : ''}
      </li>`,
        )
        .join('')}
    </ul>`,
    )
    .join('')
}

/* ---------- 正文 ---------- */

let openSeq = 0
async function open(path) {
  if (!path) return
  const seq = ++openSeq
  try {
    const data = await fetchJson(BASE + '/api/notes?p=' + encodeURIComponent(path))
    if (seq !== openSeq) return // 用户已切换到另一篇，丢弃过期响应
    store.current = path
    $('#note-body').innerHTML = renderMd(data.text)
    $('#note-body').classList.remove('hidden')
    $('#note-empty').classList.add('hidden')
    $('#note-meta').textContent = metaText(path)
    updateCrumb(path)
    try { localStorage.setItem('e2l-note', path) } catch { /* 隐私模式 */ }
    history.replaceState(null, '', '#' + encodeURIComponent(path))
    renderNav()
    $('#content').scrollTop = 0
  } catch (err) {
    if (seq !== openSeq) return
    $('#note-body').classList.remove('hidden')
    $('#note-empty').classList.add('hidden')
    $('#note-body').innerHTML = `<p style="color:var(--danger)">读取失败: ${esc(err.message)}</p>`
  }
}

function updateCrumb(path) {
  const f = store.files.find((x) => x.path === path)
  $('#crumb').textContent = f ? (f.dir ? `${f.dir} · ${f.name}` : f.name) : path
}

function metaText(path) {
  const f = store.files.find((x) => x.path === path)
  if (!f) return ''
  const parts = []
  if (f.bytes) parts.push(fmtSize(f.bytes))
  if (f.mtime) parts.push('更新于 ' + new Date(f.mtime).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }))
  return parts.join(' · ')
}

function fmtSize(n) {
  return n >= 1024 ? (n / 1024).toFixed(1) + ' KB' : n + ' B'
}

/* ---------- 交互 ---------- */

$('#note-nav').addEventListener('click', (e) => {
  const li = e.target.closest('li[data-path]')
  if (li) open(li.dataset.path)
})

$('#note-search').addEventListener('input', (e) => {
  store.filter = e.target.value
  renderNav()
})

document.addEventListener('keydown', (e) => {
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'j' && e.key !== 'k') return
  const files = visibleFiles()
  if (!files.length) return
  e.preventDefault()
  const idx = files.findIndex((f) => f.path === store.current)
  const delta = e.key === 'ArrowDown' || e.key === 'j' ? 1 : -1
  const next = files[idx < 0 ? 0 : Math.min(files.length - 1, Math.max(0, idx + delta))]
  if (!next || next.path === store.current) return
  open(next.path)
  const el = document.querySelector(`#note-nav li[data-path="${CSS.escape(next.path)}"]`)
  if (el) el.scrollIntoView({ block: 'nearest' })
})

/* ---------- SSE 实时更新 ---------- */

function connectSse() {
  const es = new EventSource(BASE + '/api/events')
  es.addEventListener('hello', () => {
    $('#conn-dot').className = 'dot on'
    $('#live-badge').classList.remove('hidden')
  })
  es.addEventListener('notes', () => {
    // 笔记 md 被编辑：刷新目录（大小/时间）并重拉当前正文
    loadList().then(() => {
      if (store.current) open(store.current)
    })
  })
  es.addEventListener('reload', () => location.reload())
  es.onerror = () => {
    $('#conn-dot').className = 'dot off'
    $('#live-badge').classList.add('hidden')
  }
}

/* ---------- 启动 ---------- */

async function boot() {
  await loadList()
  if (store.legacy) $('#legacy-hint').classList.remove('hidden')
  const fromHash = decodeURIComponent(location.hash.replace(/^#/, ''))
  let target = store.files.some((f) => f.path === fromHash) ? fromHash : ''
  if (!target) {
    let saved = null
    try { saved = localStorage.getItem('e2l-note') } catch { /* 隐私模式 */ }
    if (saved && store.files.some((f) => f.path === saved)) target = saved
  }
  if (!target && store.files.length) target = store.files[0].path
  if (target) await open(target)
  else $('#note-empty').innerHTML = '<span class="big">📭</span>笔记根目录下没有找到 markdown 文件'
  connectSse()
}

boot().catch((err) => {
  $('#note-body').classList.remove('hidden')
  $('#note-empty').classList.add('hidden')
  $('#note-body').innerHTML = `<p style="color:var(--danger)">加载失败: ${esc(err.message)}<br/>请确认 easy2learn 服务在运行</p>`
})
