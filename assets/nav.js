/**
 * BaseAI Shared Navigation & Toast System
 * All modules include this for consistent UI
 */
(function() {
  'use strict';

  const MODULES = [
    { id: 'm1', name: '球员资料库', icon: '👥', href: 'players.html' },
    { id: 'm2', name: '球队梯队', icon: '🏆', href: 'teams.html' },
    { id: 'm3', name: '赛事记分', icon: '📊', href: 'games.html' },
    { id: 'm4', name: '技术档案', icon: '📈', href: 'profiles.html' },
    { id: 'm5', name: '权限后台', icon: '⚙️', href: 'admin.html' },
    { id: 'm6', name: 'AI 专属教练', icon: '🤖', href: 'ai-coach-v2.html', isAI: true },
  ];

  function getCurrentModule() {
    return window.location.pathname.split('/').pop() || 'index.html';
  }

  function buildNav(current) {
    let html = `<aside class="sidebar" id="app-sidebar">
      <div class="sidebar-logo">
        <div class="logo-mark">⚾</div>
        <h1>BaseAI</h1>
        <div class="subtitle">BASEBALL SYSTEM</div>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-section-label">📋 核心模块</div>`;
    MODULES.forEach(m => {
      const active = current === m.href ? ' active' : '';
      const badge = m.isAI ? '<span class="nav-badge">AI</span>' : '';
      const extraClass = m.isAI ? ' ai-item' : '';
      html += `<a href="${m.href}" class="nav-item${active}${extraClass}">
        <div class="nav-icon">${m.icon}</div><span>${m.name}</span>${badge}
      </a>`;
    });
    html += `</div>
    <div class="sidebar-section" style="margin-top:auto;">
      <a href="index.html" class="nav-item" style="border-top:1px solid var(--border);border-left:none;border-radius:0;">
        <div class="nav-icon">🏠</div><span>返回首页</span>
      </a>
    </div>
    <div class="sidebar-footer">
      <div class="db-indicator">
        <div class="db-dot" id="nav-db-dot"></div>
        <span id="nav-db-label">初始化中...</span>
      </div>
      <div style="margin-top:4px;font-size:10px;">v2.0 · 2026-04-19</div>
    </div>
    </aside>`;
    return html;
  }

  function buildTopbar(title, subtitle, stats) {
    let statsHtml = '';
    (stats || []).forEach(s => {
      statsHtml += `<div class="topbar-stat"><div class="num">${s.value}</div><div class="label">${s.label}</div></div>`;
    });
    return `<header class="topbar">
      <div class="topbar-left">
        <button class="menu-toggle" id="menu-toggle">☰</button>
        <a href="index.html" class="topbar-home-btn" title="返回首页">🏠 首页</a>
        <div>
          <div class="topbar-title">${title || ''}</div>
          ${subtitle ? `<div style="font-size:11px;color:var(--text-muted);">${subtitle}</div>` : ''}
        </div>
      </div>
      <div class="topbar-right">
        ${statsHtml}
        <div class="topbar-user">
          <div class="user-avatar">⚾</div>
          <span>管理员</span>
        </div>
      </div>
    </header>`;
  }

  window.initNav = function(opts) {
    opts = opts || {};
    const current = getCurrentModule();
    const app = document.createElement('div');
    app.className = 'app';
    app.innerHTML = buildNav(current) + `<main class="main">${buildTopbar(opts.title || '', opts.subtitle || '', opts.stats || [])}
      <div class="page-content" id="page-content"></div>
    </main>`;
    document.body.insertAdjacentElement('afterbegin', app);
    document.getElementById('menu-toggle').addEventListener('click', function() {
      document.getElementById('app-sidebar').classList.toggle('open');
    });
    // DB status
    setTimeout(function() {
      const dot = document.getElementById('nav-db-dot');
      const label = document.getElementById('nav-db-label');
      if (!dot || !label) return;
      const mode = (window.DB && window.FirebaseService) ? (FirebaseService.isConfigured ? 'Firebase' : 'localStorage') : null;
      if (mode) {
        if (mode === 'Firebase') {
          label.textContent = 'Firebase 云端';
        } else {
          dot.classList.add('offline');
          label.textContent = '本地存储';
        }
      } else {
        setTimeout(function retry() { checkDBStatus(); }, 300);
      }
    }, 300);
  };

  // Toast
  window.showToast = function(msg, type) {
    type = type || 'info';
    let c = document.getElementById('toast-container');
    if (!c) { c = document.createElement('div'); c.id = 'toast-container'; c.className = 'toast-container'; document.body.appendChild(c); }
    var icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };
    var t = document.createElement('div');
    t.className = 'toast ' + type;
    t.innerHTML = '<span>' + (icons[type] || '·') + '</span><span>' + msg + '</span>';
    c.appendChild(t);
    setTimeout(function() { t.style.opacity = '0'; }, 2700);
    setTimeout(function() { t.remove(); }, 3000);
  };

  // Confirm
  window.confirmAction = function(msg, onConfirm) {
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = '<div class="modal" style="max-width:420px;">' +
      '<div class="modal-header"><div class="modal-title">⚠️ 确认操作</div>' +
      '<button class="modal-close" onclick="this.closest(\'.modal-overlay\').remove()">✕</button></div>' +
      '<div class="modal-body" style="text-align:center;padding:32px;">' +
      '<div style="font-size:40px;margin-bottom:16px;">⚠️</div>' +
      '<div style="font-size:14px;">' + msg + '</div></div>' +
      '<div class="modal-footer" style="justify-content:center;">' +
      '<button class="btn btn-ghost" onclick="this.closest(\'.modal-overlay\').remove()">取消</button>' +
      '<button class="btn btn-danger" id="confirm-yes-btn">确认删除</button></div></div>';
    document.body.appendChild(overlay);
    document.getElementById('confirm-yes-btn').onclick = function() {
      overlay.remove();
      if (onConfirm) onConfirm();
    };
    overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };
  };

  // Utils
  window.formatDate = function(d) { return d ? new Date(d).toLocaleDateString('zh-CN') : '-'; };
  window.formatGender = function(g) { return g === 'M' ? '男' : g === 'F' ? '女' : '-'; };
  window.formatHand = function(h) { return h === 'L' ? '左手' : h === 'R' ? '右手' : h === 'S' ? '左右' : '-'; };

  window.genPlayerId = function() { return 'P' + String(Math.floor(Math.random() * 900000) + 100000); };
  window.genTeamId = function() { return 'T' + String(Math.floor(Math.random() * 900000) + 100000); };
  window.genGameId = function() { return 'G' + String(Math.floor(Math.random() * 900000) + 100000); };

  window.renderAvatar = function(name, small) {
    var colors = ['#f97316','#3b82f6','#10b981','#8b5cf6','#ec4899','#f59e0b'];
    var color = colors[(name || 'A').charCodeAt(0) % colors.length];
    var sz = small ? 'avatar-sm' : '';
    return '<div class="avatar ' + sz + '" style="background:' + color + '">' + ((name || '?') + '').charAt(0) + '</div>';
  };

})();
