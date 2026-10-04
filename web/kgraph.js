/**
 * easy2learn 内置知识图谱引擎（零依赖，canvas 力导向布局）
 * 交互：拖空白处平移 / 滚轮缩放(以光标为中心) / 拖节点 / 单击节点选中 / 单击空白取消
 * 接口刻意对齐 cytoscape 风格，未来可无缝替换 web/vendor/ 下的真库。
 */
const PALETTE = ['#5b8cff', '#7ee0a3', '#ffc86b', '#ff8fab', '#b28dff', '#6fd6e8', '#f2a06b', '#9dd65e']

export class KGraph {
  constructor(container, opts = {}) {
    this.el = container
    this.opts = opts
    this.canvas = document.createElement('canvas')
    this.canvas.className = 'kgraph-canvas'
    this.el.appendChild(this.canvas)
    this.ctx = this.canvas.getContext('2d')
    this.nodes = []          // {id,label,chapter,done,x,y,vx,vy,r,fx,fy}
    this.edges = []          // {s,t,kind,label}
    this.byId = new Map()
    this.chapterColors = new Map()
    this.view = { x: 0, y: 0, k: 1 }
    this.alpha = 0
    this.selected = null
    this._raf = null
    this._pointer = null
    this._destroyed = false

    this._bind()
    this._resize()
    this.ro = new ResizeObserver(() => this._resize())
    this.ro.observe(this.el)
    this._loop()
  }

  setData({ nodes, edges, chapters }) {
    const dpr = window.devicePixelRatio || 1
    const w = this.canvas.width / dpr, h = this.canvas.height / dpr
    const degree = new Map()
    for (const e of edges) {
      degree.set(e.s, (degree.get(e.s) || 0) + 1)
      degree.set(e.t, (degree.get(e.t) || 0) + 1)
    }
    const colors = new Map()
    ;(chapters || []).forEach((c, i) => colors.set(c.id, PALETTE[i % PALETTE.length]))
    this.chapterColors = colors
    const old = this.byId
    this.nodes = nodes.map((n, i) => {
      const prev = old.get(n.id)
      const a = (i / Math.max(1, nodes.length)) * Math.PI * 2
      return {
        ...n,
        x: prev ? prev.x : w / 2 + Math.cos(a) * Math.min(w, h) * 0.32,
        y: prev ? prev.y : h / 2 + Math.sin(a) * Math.min(w, h) * 0.32,
        vx: 0, vy: 0,
        r: 10 + Math.min(8, (degree.get(n.id) || 0) * 1.4),
      }
    })
    this.byId = new Map(this.nodes.map((n) => [n.id, n]))
    this.edges = edges
    if (this.selected && !this.byId.has(this.selected)) this.selected = null
    this.alpha = 1
    for (let i = 0; i < 260; i++) this._tick() // 预收敛，避免开场乱飞
    this.alpha = 0.6
    if (this.opts.onData) this.opts.onData()
  }

  select(id) {
    this.selected = id
    this.alpha = Math.max(this.alpha, 0.25)
  }

  fit() {
    const dpr = window.devicePixelRatio || 1
    const w = this.canvas.width / dpr, h = this.canvas.height / dpr
    if (!this.nodes.length) return
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    for (const n of this.nodes) {
      x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y)
      x1 = Math.max(x1, n.x); y1 = Math.max(y1, n.y)
    }
    const pad = 80
    const k = Math.min(2.2, Math.max(0.25, Math.min(w / (x1 - x0 + pad), h / (y1 - y0 + pad))))
    this.view = {
      k,
      x: w / 2 - ((x0 + x1) / 2) * k,
      y: h / 2 - ((y0 + y1) / 2) * k,
    }
    this._render()
  }

  centerOn(id) {
    const n = this.byId.get(id)
    if (!n) return
    const dpr = window.devicePixelRatio || 1
    const w = this.canvas.width / dpr, h = this.canvas.height / dpr
    this.view.x = w / 2 - n.x * this.view.k
    this.view.y = h / 2 - n.y * this.view.k
    this._render()
  }

  destroy() {
    this._destroyed = true
    cancelAnimationFrame(this._raf)
    this.ro.disconnect()
    this.canvas.remove()
  }

  /* ---------- 内部 ---------- */
  _bind() {
    const c = this.canvas
    c.style.touchAction = 'none'
    c.addEventListener('pointerdown', (e) => {
      c.setPointerCapture(e.pointerId)
      const hit = this._hit(e.offsetX, e.offsetY)
      this._pointer = { x: e.offsetX, y: e.offsetY, moved: 0, node: hit, panning: !hit }
      if (hit) { hit.fx = hit.x; hit.fy = hit.y }
    })
    c.addEventListener('pointermove', (e) => {
      const p = this._pointer
      if (!p) return
      const dx = e.offsetX - p.x, dy = e.offsetY - p.y
      p.moved += Math.abs(dx) + Math.abs(dy)
      p.x = e.offsetX; p.y = e.offsetY
      if (p.node) {
        p.node.fx = this._screenToWorldX(e.offsetX)
        p.node.fy = this._screenToWorldY(e.offsetY)
        this.alpha = Math.max(this.alpha, 0.3)
      } else if (p.panning) {
        this.view.x += dx; this.view.y += dy
      }
    })
    c.addEventListener('pointerup', (e) => {
      const p = this._pointer
      this._pointer = null
      if (!p) return
      if (p.node) { p.node.fx = null; p.node.fy = null; this.alpha = Math.max(this.alpha, 0.3) }
      if (p.moved < 6) {
        const hit = this._hit(e.offsetX, e.offsetY)
        this.selected = hit ? hit.id : null
        if (this.opts.onTap) this.opts.onTap(hit ? hit.id : null)
        this._render()
      }
    })
    c.addEventListener('wheel', (e) => {
      e.preventDefault()
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12
      const k2 = Math.min(3, Math.max(0.15, this.view.k * factor))
      const wx = this._screenToWorldX(e.offsetX), wy = this._screenToWorldY(e.offsetY)
      this.view.k = k2
      this.view.x = e.offsetX - wx * k2
      this.view.y = e.offsetY - wy * k2
      this._render()
    }, { passive: false })
  }

  _resize() {
    const dpr = window.devicePixelRatio || 1
    const rect = this.el.getBoundingClientRect()
    this.canvas.width = Math.max(50, rect.width * dpr)
    this.canvas.height = Math.max(50, rect.height * dpr)
    this.canvas.style.width = `${rect.width}px`
    this.canvas.style.height = `${rect.height}px`
    this._render()
  }

  _screenToWorldX(sx) { return (sx - this.view.x) / this.view.k }
  _screenToWorldY(sy) { return (sy - this.view.y) / this.view.k }

  _hit(sx, sy) {
    const wx = this._screenToWorldX(sx), wy = this._screenToWorldY(sy)
    for (let i = this.nodes.length - 1; i >= 0; i--) {
      const n = this.nodes[i]
      const dx = wx - n.x, dy = wy - n.y
      if (dx * dx + dy * dy <= (n.r + 6) * (n.r + 6)) return n
    }
    return null
  }

  _tick(damping = 0.85) {
    const ns = this.nodes
    const dpr = window.devicePixelRatio || 1
    const w = this.canvas.width / dpr, h = this.canvas.height / dpr
    const cx = w / 2, cy = h / 2
    // 斥力（库仑）
    const REP = 2600
    for (let i = 0; i < ns.length; i++) {
      for (let j = i + 1; j < ns.length; j++) {
        const a = ns[i], b = ns[j]
        let dx = b.x - a.x, dy = b.y - a.y
        let d2 = dx * dx + dy * dy
        if (d2 < 1) { dx = (Math.random() - 0.5); dy = (Math.random() - 0.5); d2 = 1 }
        const d = Math.sqrt(d2)
        const f = REP / d2
        const fx = (dx / d) * f, fy = (dy / d) * f
        a.vx -= fx; a.vy -= fy
        b.vx += fx; b.vy += fy
      }
    }
    // 弹簧（边）
    for (const e of this.edges) {
      const a = this.byId.get(e.s), b = this.byId.get(e.t)
      if (!a || !b) continue
      const rest = e.kind === 'rel' ? 150 : 95
      const dx = b.x - a.x, dy = b.y - a.y
      const d = Math.max(1, Math.hypot(dx, dy))
      const f = (d - rest) * 0.012
      const fx = (dx / d) * f, fy = (dy / d) * f
      a.vx += fx; a.vy += fy
      b.vx -= fx; b.vy -= fy
    }
    // 向心 + 积分
    for (const n of ns) {
      n.vx += (cx - n.x) * 0.0025
      n.vy += (cy - n.y) * 0.0025
      if (n.fx != null) { n.x = n.fx; n.vx = 0 } else { n.x += n.vx * damping * 2.2 }
      if (n.fy != null) { n.y = n.fy; n.vy = 0 } else { n.y += n.vy * damping * 2.2 }
      n.vx *= damping; n.vy *= damping
    }
  }

  _loop() {
    if (this._destroyed) return
    if (this.alpha > 0.005) {
      this._tick()
      this.alpha *= 0.995
      this._render()
    }
    this._raf = requestAnimationFrame(() => this._loop())
  }

  _neighbors(id) {
    const set = new Set()
    for (const e of this.edges) {
      if (e.s === id) set.add(e.t)
      if (e.t === id) set.add(e.s)
    }
    return set
  }

  _render() {
    const ctx = this.ctx
    const dpr = window.devicePixelRatio || 1
    const w = this.canvas.width / dpr, h = this.canvas.height / dpr
    ctx.save()
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)
    const v = this.view
    const sel = this.selected
    const nbrs = sel ? this._neighbors(sel) : null

    // 边
    for (const e of this.edges) {
      const a = this.byId.get(e.s), b = this.byId.get(e.t)
      if (!a || !b) continue
      const hot = sel && (e.s === sel || e.t === sel)
      ctx.beginPath()
      ctx.moveTo(v.x + a.x * v.k, v.y + a.y * v.k)
      ctx.lineTo(v.x + b.x * v.k, v.y + b.y * v.k)
      if (e.kind === 'rel') {
        ctx.strokeStyle = hot ? 'rgba(126,224,163,0.9)' : 'rgba(126,224,163,0.22)'
        ctx.lineWidth = hot ? 2 : 1.2
      } else {
        ctx.strokeStyle = hot ? 'rgba(91,140,255,0.8)' : 'rgba(139,147,163,0.16)'
        ctx.lineWidth = hot ? 1.8 : 1
      }
      ctx.stroke()
      // 关联边标签（仅选中时显示，避免杂乱）
      if (hot && e.kind === 'rel' && e.label) {
        const mx = v.x + (a.x + b.x) / 2 * v.k, my = v.y + (a.y + b.y) / 2 * v.k
        ctx.font = '10px sans-serif'
        const tw = ctx.measureText(e.label).width
        ctx.fillStyle = 'rgba(11,13,17,0.85)'
        ctx.fillRect(mx - tw / 2 - 3, my - 7, tw + 6, 13)
        ctx.fillStyle = '#9fe8bd'
        ctx.textAlign = 'center'
        ctx.fillText(e.label, mx, my + 3)
      }
    }

    // 节点
    for (const n of this.nodes) {
      const sx = v.x + n.x * v.k, sy = v.y + n.y * v.k
      const dim = sel && n.id !== sel && !nbrs?.has(n.id)
      const color = this.chapterColors.get(n.chapter) || '#8b93a3'
      ctx.globalAlpha = dim ? 0.25 : 1
      if (n.id === sel) {
        ctx.beginPath()
        ctx.arc(sx, sy, n.r + 5, 0, Math.PI * 2)
        ctx.strokeStyle = '#e6e9ef'
        ctx.lineWidth = 2
        ctx.stroke()
      }
      ctx.beginPath()
      ctx.arc(sx, sy, n.r, 0, Math.PI * 2)
      ctx.fillStyle = n.done ? color : 'rgba(22,26,33,0.95)'
      ctx.fill()
      ctx.strokeStyle = color
      ctx.lineWidth = 2
      ctx.stroke()
      if (n.done) {
        ctx.fillStyle = '#0f1115'
        ctx.font = `bold ${Math.max(9, n.r * 0.9)}px sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText('✓', sx, sy + 0.5)
        ctx.textBaseline = 'alphabetic'
      }
      // 标签
      const label = n.label.length > 14 ? `${n.label.slice(0, 13)}…` : n.label
      ctx.font = '11px -apple-system, PingFang SC, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillStyle = n.id === sel ? '#e6e9ef' : '#aab2c2'
      ctx.fillText(label, sx, sy + n.r + 14)
      ctx.globalAlpha = 1
    }
    ctx.restore()
  }
}
