/* ============================================================
   easy2learn · 外观切换（自动 / 浅色 / 深色）
   - 偏好存 localStorage('e2l-theme')，auto 跟随系统
   - html.light / html.dark 类覆盖 prefers-color-scheme
   - 页面需在 <head> 内联应用初始类（见 index.html / learn.html）以防闪烁
   ============================================================ */
(function () {
  'use strict'

  var KEY = 'e2l-theme'
  var root = document.documentElement

  function pref() {
    var v = null
    try { v = localStorage.getItem(KEY) } catch (e) { /* 隐私模式等 */ }
    return v === 'light' || v === 'dark' ? v : 'auto'
  }

  function resolve(p) {
    if (p === 'light' || p === 'dark') return p
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }

  function apply() {
    var p = pref()
    var eff = resolve(p)
    root.classList.toggle('dark', eff === 'dark')
    root.classList.toggle('light', eff === 'light')
    root.classList.toggle('theme-auto', p === 'auto')
    // 同步所有分段控件的选中态
    document.querySelectorAll('[data-theme-opt]').forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-theme-opt') === p)
    })
  }

  // 自动模式下跟随系统变化
  var mq = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)')
  if (mq) {
    var onChange = function () { if (pref() === 'auto') apply() }
    if (mq.addEventListener) mq.addEventListener('change', onChange)
    else if (mq.addListener) mq.addListener(onChange)
  }

  function init() {
    document.querySelectorAll('[data-theme-opt]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        try { localStorage.setItem(KEY, btn.getAttribute('data-theme-opt')) } catch (e) { /* 忽略 */ }
        apply()
      })
    })
    apply()
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init)
  else init()
})()
