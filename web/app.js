/* easy2learn 前端：四类题型练习 + 知识点面板 + SSE 实时更新 */
import { esc, renderMd } from './md.js'

const $ = (sel) => document.querySelector(sel)

const TYPE_LABEL = { single: '单选', multi: '多选', judge: '判断', qa: '问答', code: '编程' }
const LETTERS = 'ABCDEFGH'.split('')

const store = {
  state: null,          // /api/state
  filters: { topic: 'all', type: 'all', mode: 'order' },
  idx: 0,
  progress: loadProgress(),
  revealed: new Set(),  // 本会话已看解析的题
}

function loadProgress() {
  try { return JSON.parse(localStorage.getItem('e2l.progress') || '{}') } catch { return {} }
}
function saveProgress() { localStorage.setItem('e2l.progress', JSON.stringify(store.progress)) }
function codeDraft(q) {
  return localStorage.getItem(`e2l.code.${q.id}`) ?? q.code?.starter ?? ''
}
function saveCodeDraft(q, text) { localStorage.setItem(`e2l.code.${q.id}`, text) }
function qaDraft(q) { return localStorage.getItem(`e2l.qa.${q.id}`) ?? '' }
function saveQaDraft(q, text) { localStorage.setItem(`e2l.qa.${q.id}`, text) }

/* ---------- 启动 ---------- */
async function boot() {
  await refreshState()
  bindStatic()
  renderAll()
  connectSse()
}

async function refreshState() {
  const res = await fetch('/api/state')
  if (!res.ok) throw new Error(`state ${res.status}`)
  store.state = await res.json()
}

function visibleQuestions() {
  const { topic, type, mode } = store.filters
  let qs = store.state.questions
  if (topic !== 'all') qs = qs.filter((q) => q.topic === topic)
  if (type !== 'all') qs = qs.filter((q) => q.type === type)
  if (mode === 'wrong') qs = qs.filter((q) => store.progress[q.id]?.correct === false)
  if (mode === 'random') {
    qs = [...qs]
    for (let i = qs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [qs[i], qs[j]] = [qs[j], qs[i]]
    }
  }
  return qs
}

/* ---------- 渲染 ---------- */
function renderAll() {
  renderSidebar()
  renderContent()
}

function renderSidebar() {
  const s = store.state
  const counts = {}
  for (const q of s.questions) counts[q.topic] = (counts[q.topic] || 0) + 1

  $('#topic-list').innerHTML = [
    li('all', '全部', s.questions.length),
    ...s.topics.map((t) => li(t.id, t.name, counts[t.id] || 0)),
  ].join('')
  function li(id, name, n) {
    const active = store.filters.topic === id ? 'active' : ''
    return `<li data-topic="${id}" class="${active}"><span>${esc(name)}</span><span class="count">${n}</span></li>`
  }

  $('#type-chips').innerHTML = ['all', ...Object.keys(TYPE_LABEL)]
    .map((t) => `<button class="chip ${store.filters.type === t ? 'active' : ''}" data-type="${t}">${t === 'all' ? '全部' : TYPE_LABEL[t]}</button>`)
    .join('')

  document.querySelectorAll('#mode-chips .chip').forEach((b) => {
    b.classList.toggle('active', b.dataset.mode === store.filters.mode)
  })

  const answered = Object.keys(store.progress).length
  const correct = Object.values(store.progress).filter((p) => p.correct).length
  const pct = answered ? Math.round((correct / answered) * 100) : 0
  $('#stats').innerHTML =
    `<div>已作答 <b>${answered}</b> / ${s.questions.length} 题</div>` +
    `<div>正确 <b style="color:var(--accent2)">${correct}</b>　正确率 <b>${pct}%</b></div>` +
    `<div class="bar"><i style="width:${answered ? (correct / answered) * 100 : 0}%"></i></div>`

  $('#notes-list').innerHTML = s.topics
    .filter((t) => t.note)
    .map((t) => `<li data-note="${esc(t.note)}" data-name="${esc(t.name)}"><span>📘 ${esc(t.name)} · 笔记</span></li>`)
    .join('')
}

function renderContent() {
  const qs = visibleQuestions()
  const content = $('#content')
  if (!qs.length) {
    content.innerHTML = `<div class="empty"><div class="big">🗂️</div><p>${
      store.filters.mode === 'wrong' ? '没有错题，太强了' : '当前筛选下没有题目'
    }</p></div>`
    updateCrumb(qs.length, 0)
    return
  }
  if (store.idx >= qs.length) store.idx = qs.length - 1
  if (store.idx < 0) store.idx = 0
  const q = qs[store.idx]
  content.innerHTML = `<article class="qcard" id="qcard"></article>`
  const card = $('#qcard')
  renderQuestion(card, q)
  bindQuestion(card, q)
  updateCrumb(qs.length, store.idx + 1)
}

function updateCrumb(total, pos) {
  const { topic, type, mode } = store.filters
  const tName = topic === 'all' ? '全部' : store.state.topics.find((t) => t.id === topic)?.name || topic
  const ty = type === 'all' ? '' : ` · ${TYPE_LABEL[type]}`
  const md = mode === 'wrong' ? ' · 错题' : mode === 'random' ? ' · 随机' : ''
  $('#crumb').textContent = `${tName}${ty}${md} — ${pos}/${total}`
}

function renderQuestion(card, q) {
  const diff = '★'.repeat(q.difficulty || 3) + '☆'.repeat(5 - (q.difficulty || 3))
  const head = `
    <div class="qhead">
      <span class="badge type">${TYPE_LABEL[q.type] || q.type}</span>
      <span class="badge">${esc(topicName(q.topic))}</span>
      <span class="badge diff">${diff}</span>
      ${(q.tags || []).map((t) => `<span class="badge">#${esc(t)}</span>`).join('')}
      <span class="badge">${q.id}</span>
    </div>
    <div class="stem md">${renderMd(q.stem)}</div>`

  let body = ''
  if (q.type === 'single' || q.type === 'multi') {
    body = `<div class="opts">${q.options
      .map((o, i) => `<label class="opt" data-i="${i}"><input type="${q.type === 'single' ? 'radio' : 'checkbox'}" name="opt" /><span class="label">${LETTERS[i]}.</span><span class="md">${renderMd(o)}</span></label>`)
      .join('')}</div>`
  } else if (q.type === 'judge') {
    body = `<div class="judge-row">
      <label class="opt" data-v="true"><input type="radio" name="opt" style="display:none"><span>✅ 对</span></label>
      <label class="opt" data-v="false"><input type="radio" name="opt" style="display:none"><span>❌ 错</span></label>
    </div>`
  } else if (q.type === 'qa') {
    body = `<textarea class="ans" id="qa-input" placeholder="用自己的话回答（会自动保存草稿）…">${esc(qaDraft(q))}</textarea>`
  } else if (q.type === 'code') {
    body = `
      <div class="qhead"><span class="badge">🖥 ${q.code.lang}</span><span class="badge">${q.code.tests.length} 组测试</span></div>
      <textarea class="code" id="code-input" spellcheck="false">${esc(codeDraft(q))}</textarea>
      <div id="run-result"></div>`
  }

  const actions = `
    <div class="actions">
      ${q.type === 'code'
        ? `<button class="primary" data-act="run">▶ 运行测试</button>`
        : q.type === 'qa'
          ? `<button class="primary" data-act="reveal">对照参考答案</button>`
          : `<button class="primary" data-act="submit">提交</button>`}
      <button class="ghost" data-act="prev">← 上一题</button>
      <button class="ghost" data-act="next">下一题 →</button>
    </div>
    <div id="verdict"></div>
    <div id="explain"></div>`

  card.innerHTML = head + body + actions

  const knowledge = [
    q.knowledge ? `<details class="knowledge"><summary>📖 相关知识点</summary><div class="md">${renderMd(q.knowledge)}</div></details>` : '',
    noteLinkHtml(q),
  ].filter(Boolean).join('')
  if (knowledge) card.insertAdjacentHTML('beforeend', `<div class="result">${knowledge}</div>`)

  const pager = `<div class="pager">
    <button class="ghost" data-act="prev">←</button>
    <span class="pos">${store.idx + 1} / ${visibleQuestions().length}</span>
    <button class="ghost" data-act="next">→</button>
  </div>`
  card.insertAdjacentHTML('beforeend', pager)
}

function noteLinkHtml(q) {
  const topic = store.state.topics.find((t) => t.id === q.topic)
  if (!topic?.note) return ''
  return `<p class="note-link"><a href="#" data-note="${esc(topic.note)}" data-name="${esc(topic.name)}">查看《${esc(topic.name)}》完整笔记 →</a></p>`
}

function topicName(id) {
  return store.state.topics.find((t) => t.id === id)?.name || id
}

/* ---------- 交互 ---------- */
function bindQuestion(card, q) {
  const verdict = $('#verdict')
  const explain = $('#explain')

  card.querySelectorAll('[data-act]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault()
      const act = btn.dataset.act
      if (act === 'prev') { store.idx = Math.max(0, store.idx - 1); renderContent(); return }
      if (act === 'next') { store.idx = Math.min(visibleQuestions().length - 1, store.idx + 1); renderContent(); return }
      if (act === 'submit') return submitChoice(q, verdict, explain)
      if (act === 'reveal') return revealQa(q, explain)
      if (act === 'run') return runCode(q)
    })
  })

  const qaInput = $('#qa-input')
  if (qaInput) qaInput.addEventListener('input', () => saveQaDraft(q, qaInput.value))

  document.querySelectorAll('.judge-row .opt').forEach((el) => {
    el.addEventListener('click', () => {
      document.querySelectorAll('.judge-row .opt').forEach((o) => {
        o.dataset.selected = '0'
        o.style.borderColor = ''
      })
      el.dataset.selected = '1'
      el.style.borderColor = 'var(--accent)'
    })
  })

  const codeInput = $('#code-input')
  if (codeInput) {
    codeInput.addEventListener('input', () => saveCodeDraft(q, codeInput.value))
    codeInput.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault()
        const { selectionStart: s, selectionEnd: en, value } = codeInput
        codeInput.value = value.slice(0, s) + '    ' + value.slice(en)
        codeInput.selectionStart = codeInput.selectionEnd = s + 4
        saveCodeDraft(q, codeInput.value)
      }
    })
  }
}

function submitChoice(q, verdict, explain) {
  let picked
  if (q.type === 'single') {
    const sel = document.querySelector('input[name="opt"]:checked')
    if (!sel) return flash(verdict, '先选择一个答案', 'no')
    picked = Number(sel.closest('.opt').dataset.i)
    mark(q, picked === q.answer)
    paintOptions(q, [picked])
  } else if (q.type === 'multi') {
    const sels = [...document.querySelectorAll('input[name="opt"]:checked')]
    if (!sels.length) return flash(verdict, '至少选择一项', 'no')
    picked = sels.map((s) => Number(s.closest('.opt').dataset.i)).sort((a, b) => a - b)
    const ok = picked.length === q.answer.length && picked.every((v, i) => v === q.answer[i])
    mark(q, ok)
    paintOptions(q, picked)
  } else if (q.type === 'judge') {
    const sel = document.querySelector('.judge-row .opt[data-selected="1"]')
    if (!sel) return flash(verdict, '先判断对错', 'no')
    picked = sel.dataset.v === 'true'
    mark(q, picked === q.answer)
    sel.classList.add(picked === q.answer ? 'correct' : 'wrong')
  }
  showExplain(q, explain, picked)
}

function paintOptions(q, picked) {
  document.querySelectorAll('#qcard .opt[data-i]').forEach((el) => {
    const i = Number(el.dataset.i)
    const isAnswer = Array.isArray(q.answer) ? q.answer.includes(i) : q.answer === i
    const isPicked = picked.includes(i)
    el.classList.toggle('correct', isAnswer)
    el.classList.toggle('wrong', isPicked && !isAnswer)
    el.querySelector('input').disabled = true
  })
}

function flash(el, text, cls) {
  el.innerHTML = `<div class="verdict ${cls}">${esc(text)}</div>`
}

function mark(q, correct) {
  store.progress[q.id] = { correct, at: new Date().toISOString() }
  saveProgress()
  renderSidebar()
}

function showExplain(q, explain) {
  const parts = []
  if (q.analysis) parts.push(`<h3>解析</h3><div class="ref md">${renderMd(q.analysis)}</div>`)
  if (q.type === 'qa' || q.type === 'code') {
    if (q.answer) parts.push(`<h3>参考答案</h3><div class="ref md">${renderMd(String(q.answer))}</div>`)
  } else {
    const ans = Array.isArray(q.answer) ? q.answer.map((i) => LETTERS[i]).join('、') : q.type === 'judge' ? (q.answer ? '对' : '错') : LETTERS[q.answer]
    parts.push(`<h3>正确答案</h3><div class="ref"><b style="color:var(--accent2)">${esc(ans)}</b></div>`)
  }
  explain.innerHTML = `<div class="result">${parts.join('')}</div>`
}

function revealQa(q, explain) {
  showExplain(q, explain)
  if (!explain.querySelector('.self-mark')) {
    explain.insertAdjacentHTML(
      'beforeend',
      `<div class="actions self-mark">
        <span style="align-self:center;color:var(--muted);font-size:13px">对照后自评：</span>
        <button class="ghost self-good" data-act="self-true">✓ 我答对了</button>
        <button class="ghost self-bad" data-act="self-false">✗ 没答好</button>
      </div>`,
    )
    explain.querySelector('[data-act="self-true"]').addEventListener('click', () => { mark(q, true); flash($('#verdict'), '已记为掌握 💪', 'ok') })
    explain.querySelector('[data-act="self-false"]').addEventListener('click', () => { mark(q, false); flash($('#verdict'), '已加入错题本，回头再战', 'no') })
  }
}

async function runCode(q) {
  const result = $('#run-result')
  const code = $('#code-input').value
  result.innerHTML = `<p style="color:var(--muted)">⏳ 本地编译运行中…</p>`
  try {
    const res = await fetch('/api/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lang: q.code.lang, code, tests: q.code.tests }),
    })
    const data = await res.json()
    if (data.error) {
      result.innerHTML = `<div class="compile-err">${esc(data.error)}\n${esc(data.compileOutput || '')}</div>`
      mark(q, false)
      return
    }
    const rows = data.results
      .map(
        (r) => `<tr class="${r.pass ? 'pass' : 'fail'}">
          <td>${r.pass ? '✓' : '✗'} #${r.index}</td>
          <td><pre>${esc(r.expected)}</pre></td>
          <td><pre>${esc(r.actual)}</pre></td>
          <td>${r.timeMs ?? '-'}ms${r.stderr ? `\n<pre style="color:var(--danger)">${esc(r.stderr)}</pre>` : ''}</td>
        </tr>`,
      )
      .join('')
    result.innerHTML = `
      <div class="tests">
        <h3>${data.allPass ? '🎉 全部通过' : '❌ 未通过'} · ${esc(data.summary)}</h3>
        <table><thead><tr><th>用例</th><th>期望输出</th><th>实际输出</th><th>耗时/错误</th></tr></thead><tbody>${rows}</tbody></table>
      </div>`
    mark(q, data.allPass)
  } catch (err) {
    result.innerHTML = `<div class="compile-err">运行失败: ${esc(err.message)}</div>`
  }
}

/* ---------- 静态事件 ---------- */
function bindStatic() {
  $('#topic-list').addEventListener('click', (e) => {
    const li = e.target.closest('li[data-topic]')
    if (!li) return
    store.filters.topic = li.dataset.topic
    store.idx = 0
    renderAll()
  })
  $('#type-chips').addEventListener('click', (e) => {
    const b = e.target.closest('[data-type]')
    if (!b) return
    store.filters.type = b.dataset.type
    store.idx = 0
    renderAll()
  })
  $('#mode-chips').addEventListener('click', (e) => {
    const b = e.target.closest('[data-mode]')
    if (!b) return
    store.filters.mode = b.dataset.mode
    store.idx = 0
    renderAll()
  })
  $('#reset-progress').addEventListener('click', () => {
    if (!confirm('清空全部作答记录？')) return
    store.progress = {}
    saveProgress()
    renderAll()
  })
  $('#notes-list').addEventListener('click', (e) => openNote(e.target.closest('li[data-note]')))
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[data-note]')
    if (a) { e.preventDefault(); openNote(a) }
  })
  $('#note-close').addEventListener('click', () => $('#note-modal').classList.add('hidden'))
  $('#note-modal').addEventListener('click', (e) => {
    if (e.target.id === 'note-modal') $('#note-modal').classList.add('hidden')
  })
  $('#btn-import').addEventListener('click', importDialog)

  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return
    if (e.key === 'ArrowLeft') { store.idx = Math.max(0, store.idx - 1); renderContent() }
    if (e.key === 'ArrowRight') { store.idx = Math.min(visibleQuestions().length - 1, store.idx + 1); renderContent() }
  })
}

async function openNote(el) {
  if (!el) return
  const p = el.dataset.note
  $('#note-title').textContent = `${el.dataset.name || ''} 笔记`
  $('#note-body').innerHTML = '<p style="color:var(--muted)">加载中…</p>'
  $('#note-modal').classList.remove('hidden')
  try {
    const res = await fetch(`/api/notes?p=${encodeURIComponent(p)}`)
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || res.status)
    $('#note-body').innerHTML = renderMd(data.text)
  } catch (err) {
    $('#note-body').innerHTML = `<p style="color:var(--danger)">读取失败: ${esc(err.message)}</p>`
  }
}

function importDialog() {
  const q = visibleQuestions()[store.idx]
  void q
  const box = $('#content')
  box.insertAdjacentHTML(
    'beforeend',
    `<div id="import-modal" class="modal"><div class="modal-box import-box" style="padding:18px">
      <h3>导入题目（JSON，字段见 README 数据模型）</h3>
      <textarea id="import-json" placeholder='{"type":"single","topic":"os","stem":"…","options":["…","…"],"answer":0,"analysis":"…","knowledge":"…"}'></textarea>
      <div class="actions">
        <button class="primary" id="import-go">导入</button>
        <button class="ghost" id="import-cancel">取消</button>
      </div>
    </div></div>`,
  )
  $('#import-cancel').addEventListener('click', () => $('#import-modal').remove())
  $('#import-go').addEventListener('click', async () => {
    try {
      const body = JSON.parse($('#import-json').value)
      const res = await fetch('/api/questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || res.status)
      $('#import-modal').remove()
      await refreshState()
      renderAll()
    } catch (err) {
      alert(`导入失败: ${err.message}`)
    }
  })
}

/* ---------- SSE 实时更新 ---------- */
function connectSse() {
  const es = new EventSource('/api/events')
  es.addEventListener('hello', () => {
    $('#conn-dot').className = 'dot on'
    $('#live-badge').classList.remove('hidden')
  })
  es.addEventListener('bank', async () => {
    await refreshState()
    renderAll()
  })
  es.addEventListener('reload', () => location.reload())
  es.onerror = () => {
    $('#conn-dot').className = 'dot off'
    $('#live-badge').classList.add('hidden')
  }
}

boot().catch((err) => {
  $('#content').innerHTML = `<div class="empty"><div class="big">💥</div><p>加载失败: ${esc(err.message)}<br/>请确认 easy2learn 服务在运行</p></div>`
})
