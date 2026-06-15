/* ====================================================================
 * BaseAI 训练出勤模块 - 核心逻辑
 * 依赖: firebase-service.js, db.js
 * ==================================================================== */

(function() {
  'use strict';

  /* ========== 4 个梯队配置（与 Firebase attendance_teams 同步） ========== */
  const TEAMS = [
    { code: 'U15',    name: 'HK ELITE 1 (U15)', short: 'U15',  days: ['sat'],            period: '上午', periodKey: 'morning', venue: '晒草湾',   weekdayLabel: '每周六上午' },
    { code: 'U12',    name: 'U12 梯队',          short: 'U12',  days: ['sat'],            period: '上午', periodKey: 'morning', venue: '荃湾',     weekdayLabel: '每周六上午' },
    { code: 'U10',    name: 'U10 梯队',          short: 'U10',  days: ['sat'],            period: '上午', periodKey: 'morning', venue: '纯阳小学', weekdayLabel: '每周六上午' },
    { code: 'female', name: '女棒',              short: '女棒', days: ['tue','thu'],      period: '晚上', periodKey: 'evening', venue: '晒草湾',   weekdayLabel: '每周二/四晚上' }
  ];

  const ABSENT_REASONS = [
    { code: 'sick',    label: '生病' },
    { code: 'leave',   label: '请假' },
    { code: 'outing',  label: '外出' },
    { code: 'family',  label: '家事' },
    { code: 'school',  label: '学校活动' },
    { code: 'other',   label: '其他' }
  ];

  /* ========== 工具函数 ========== */

  // 把 teamCode 翻译成 team 对象
  function getTeam(code) {
    return TEAMS.find(t => t.code === code) || null;
  }

  // 判断某天 (Date) 是不是某梯队的训练日
  function isTrainingDay(team, date) {
    if (!team) return false;
    const dayMap = { sun:0, mon:1, tue:2, wed:3, thu:4, fri:5, sat:6 };
    const wd = date.getDay();
    return team.days.some(d => dayMap[d] === wd);
  }

  // 当周 ISO 周 key (e.g. "2026-W24")
  function getCurrentWeekKey(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return d.getUTCFullYear() + '-W' + String(weekNo).padStart(2, '0');
  }

  // 当周一的 Date
  function getMondayOfWeek(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  // 当周日的 Date (7 天)
  function getWeekDates(monday) {
    const arr = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      arr.push(d);
    }
    return arr;
  }

  // 把 YYYY-MM-DD 转成 Date
  function parseDate(s) {
    const parts = s.split('-');
    return new Date(Number(parts[0]), Number(parts[1])-1, Number(parts[2]));
  }

  // 格式化日期
  function fmtDate(d, fmt) {
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,'0');
    const dd = String(d.getDate()).padStart(2,'0');
    if (fmt === 'ymd') return y + '-' + m + '-' + dd;
    if (fmt === 'md')  return m + '/' + dd;
    if (fmt === 'cn')  return y + '年' + m + '月' + dd + '日';
    return y + '-' + m + '-' + dd;
  }

  // 周几中文
  const WEEKDAYS_CN = ['周日','周一','周二','周三','周四','周五','周六'];

  // 判断链接是否在本周有效（下周一 00:00 失效）
  function isLinkValid(weekKey) {
    const now = new Date();
    const currentMonday = getMondayOfWeek(now);
    const nextMonday = new Date(currentMonday);
    nextMonday.setDate(currentMonday.getDate() + 7);
    const nowWeekKey = getCurrentWeekKey(now);
    return weekKey === nowWeekKey && now < nextMonday;
  }

  // 解析 URL 参数
  function getUrlParams() {
    const params = new URLSearchParams(window.location.search);
    return {
      team:   params.get('team')   || '',
      week:   params.get('week')   || '',
      player: params.get('player') || ''
    };
  }

  /* ========== Firebase 数据操作 ========== */

  // 读取某梯队某周的所有出勤记录
  function getWeekAttendance(teamCode, weekKey) {
    if (typeof firebase === 'undefined' || !firebase.database) {
      return Promise.resolve({});
    }
    const db = firebase.database();
    return db.ref('attendance/' + teamCode + '/' + weekKey).once('value')
      .then(snap => snap.val() || {});
  }

  // 提交单条出勤记录
  function submitAttendance(teamCode, weekKey, playerId, data) {
    if (typeof firebase === 'undefined' || !firebase.database) {
      return Promise.reject(new Error('Firebase 未连接'));
    }
    const db = firebase.database();
    const payload = Object.assign({
      status: 'absent',
      reason: '',
      note: '',
      submittedAt: new Date().toISOString(),
      submittedBy: '家长'
    }, data);
    return db.ref('attendance/' + teamCode + '/' + weekKey + '/' + playerId).set(payload);
  }

  // 读取某梯队所有球员（从 baseai_players 缓存）
  function getTeamPlayers(teamCode) {
    if (typeof firebase === 'undefined' || !firebase.database) {
      return Promise.resolve([]);
    }
    const db = firebase.database();
    return db.ref('players').once('value').then(snap => {
      const all = snap.val() || {};
      const list = [];
      Object.keys(all).forEach(id => {
        const p = all[id];
        if (p.status === 'active' && p.team === teamCode) {
          list.push(Object.assign({id: id}, p));
        }
      });
      list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      return list;
    });
  }

  /* ========== 链接生成 ========== */

  // 生成家长填写链接
  function generateParentLink(teamCode, weekKey) {
    const base = window.location.origin + window.location.pathname.replace(/[^/]*$/, '');
    return base + 'parents.html?team=' + encodeURIComponent(teamCode) + '&week=' + encodeURIComponent(weekKey);
  }

  // 复制到剪贴板
  function copyToClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    // fallback
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta);
    return Promise.resolve();
  }

  /* ========== 统计 ========== */

  // 计算球员月度出勤率
  function calcPlayerMonthStats(records, weekKeys) {
    let should = 0, actual = 0;
    weekKeys.forEach(wk => {
      if (records[wk]) {
        const r = records[wk];
        if (r.status === 'present') {
          should++; actual++;
        } else if (r.status === 'absent') {
          should++;
        }
      }
    });
    return {
      should: should,
      actual: actual,
      rate: should === 0 ? 0 : Math.round(actual / should * 100)
    };
  }

  /* ========== 导出 Excel（CSV） ========== */

  function exportCSV(teamCode, weekKey, players, records) {
    const team = getTeam(teamCode);
    const lines = [];
    const headers = ['球员ID', '姓名', '梯队', '出席状态', '缺勤原因', '备注', '提交时间', '提交人'];
    lines.push('\uFEFF' + headers.join(','));
    players.forEach(p => {
      const r = records[p.id] || {};
      const row = [
        p.id,
        p.name || '',
        team ? team.short : teamCode,
        r.status === 'present' ? '出席' : (r.status === 'absent' ? '缺席' : '未填'),
        getReasonLabel(r.reason),
        (r.note || '').replace(/,/g, '，'),
        r.submittedAt || '',
        r.submittedBy || ''
      ];
      lines.push(row.join(','));
    });
    const csv = lines.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'attendance_' + teamCode + '_' + weekKey + '.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function getReasonLabel(code) {
    const r = ABSENT_REASONS.find(x => x.code === code);
    return r ? r.label : '';
  }

  /* ========== Toast 提示 ========== */

  function toast(msg, type) {
    type = type || 'info';
    let box = document.getElementById('attendance-toast');
    if (!box) {
      box = document.createElement('div');
      box.id = 'attendance-toast';
      box.style.cssText = 'position:fixed;top:20px;right:20px;z-index:9999;display:flex;flex-direction:column;gap:8px;';
      document.body.appendChild(box);
    }
    const colors = {
      success: '#10b981',
      error:   '#ef4444',
      warning: '#f59e0b',
      info:    '#3b82f6'
    };
    const t = document.createElement('div');
    t.style.cssText = 'background:' + (colors[type] || colors.info) + ';color:#fff;padding:12px 20px;border-radius:8px;font-size:14px;font-weight:600;box-shadow:0 4px 12px rgba(0,0,0,0.3);animation:slideIn 0.3s ease;max-width:340px;';
    t.textContent = msg;
    box.appendChild(t);
    setTimeout(function() {
      t.style.opacity = '0';
      t.style.transition = 'opacity 0.3s';
      setTimeout(function() { t.remove(); }, 300);
    }, 3500);
  }

  /* ========== 暴露全局 API ========== */

  window.AttendanceModule = {
    TEAMS: TEAMS,
    ABSENT_REASONS: ABSENT_REASONS,
    getTeam: getTeam,
    isTrainingDay: isTrainingDay,
    getCurrentWeekKey: getCurrentWeekKey,
    getMondayOfWeek: getMondayOfWeek,
    getWeekDates: getWeekDates,
    parseDate: parseDate,
    fmtDate: fmtDate,
    isLinkValid: isLinkValid,
    getUrlParams: getUrlParams,
    getWeekAttendance: getWeekAttendance,
    submitAttendance: submitAttendance,
    getTeamPlayers: getTeamPlayers,
    generateParentLink: generateParentLink,
    copyToClipboard: copyToClipboard,
    calcPlayerMonthStats: calcPlayerMonthStats,
    exportCSV: exportCSV,
    getReasonLabel: getReasonLabel,
    toast: toast,
    WEEKDAYS_CN: WEEKDAYS_CN
  };

})();
