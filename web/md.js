/* 共享 markdown 渲染（app.js / learn.js 复用）：标题/列表/表格/代码块/引用/加粗/行内码 */
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

/** 链接 href 白名单：只放行 http(s)/mailto/站内相对与锚点，拦下 javascript: 等危险 scheme */
function safeHref(href) {
  const h = String(href).trim()
  return /^(https?:\/\/|mailto:|\/|#|\.\.?(\/|$))/i.test(h) ? h : null
}

function inlineMd(s) {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (m, text, href) => {
      const h = safeHref(href)
      return h ? `<a href="${h}" target="_blank" rel="noopener">${text}</a>` : `<span>${text}</span>`
    })
}

export function renderMd(md) {
  if (!md) return ''
  const lines = String(md).replace(/\r\n/g, '\n').split('\n')
  const out = []
  let inCode = false, listType = null, tableBuf = []
  const closeList = () => { if (listType) { out.push(listType === 'ol' ? '</ol>' : '</ul>'); listType = null } }
  const flushTable = () => {
    if (!tableBuf.length) return
    const rows = tableBuf.filter((r) => !/^\s*\|?[\s:|-]+\|?\s*$/.test(r))
    const toTr = (r, tag) => {
      const cells = r.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((c) => `<${tag}>${inlineMd(c.trim())}</${tag}>`)
      return `<tr>${cells.join('')}</tr>`
    }
    if (rows.length) {
      out.push(`<table><thead>${toTr(rows[0], 'th')}</thead><tbody>${rows.slice(1).map((r) => toTr(r, 'td')).join('')}</tbody></table>`)
    }
    tableBuf = []
  }
  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      flushTable(); closeList()
      if (inCode) { out.push('</code></pre>'); inCode = false }
      else { out.push('<pre><code>'); inCode = true }
      continue
    }
    if (inCode) { out.push(esc(line)); continue }
    if (/^\s*\|.*\|\s*$/.test(line)) { closeList(); tableBuf.push(line); continue }
    flushTable()
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { closeList(); out.push('<hr>'); continue } // 水平线
    const h = /^(#{1,6})\s+(.*)$/.exec(line)
    if (h) { closeList(); out.push(`<h${h[1].length}>${inlineMd(h[2])}</h${h[1].length}>`); continue }
    const bq = /^>\s?(.*)$/.exec(line)
    if (bq) { closeList(); out.push(`<blockquote>${inlineMd(bq[1])}</blockquote>`); continue }
    const ul = /^\s*[-*]\s+(.*)$/.exec(line)
    if (ul) { if (listType !== 'ul') { closeList(); out.push('<ul>'); listType = 'ul' } out.push(`<li>${inlineMd(ul[1])}</li>`); continue }
    const ol = /^\s*\d+[.、]\s+(.*)$/.exec(line)
    if (ol) { if (listType !== 'ol') { closeList(); out.push('<ol>'); listType = 'ol' } out.push(`<li>${inlineMd(ol[1])}</li>`); continue }
    if (!line.trim()) { closeList(); continue }
    closeList()
    out.push(`<p>${inlineMd(line)}</p>`)
  }
  if (inCode) out.push('</code></pre>')
  closeList(); flushTable()
  return out.join('\n')
}
