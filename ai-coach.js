/* ====================================================================
 * BaseAI AI 教练模块 - 核心逻辑
 * 投手：Rapsodo PITCHING CSV 对接
 * 打击：Blast Motion CSV 对接
 * AI 建议：DeepSeek / 通义千问 大模型 API
 *
 * 依赖: firebase-service.js, db.js
 * ==================================================================== */

(function() {
  'use strict';

  /* ========== Rapsodo 投手字段映射 ==========
   * Rapsodo PITCHING 2.0 实际导出列名（不同版本略有差异，做模糊匹配） */
  const RAPSODO_FIELDS = {
    velocity:      { keys: ['velocity', 'speed', '球速', 'mph'],          unit: 'mph', label: '球速' },
    spinRate:      { keys: ['spinrate', 'spin_rate', 'rpm', '旋转率'],     unit: 'rpm', label: '旋转率' },
    spinAxis:      { keys: ['spinaxis', 'spin_axis', '旋转轴'],            unit: '°',   label: '旋转轴' },
    horzBreak:     { keys: ['horzbreak', 'horizontalbreak', '横向位移', 'hb'], unit: 'in', label: '横向位移' },
    vertBreak:     { keys: ['vertbreak', 'verticalbreak', '纵向位移', 'vb'],   unit: 'in', label: '纵向位移' },
    releaseHeight: { keys: ['releaseheight', 'release_height', '出手高度'],     unit: 'ft', label: '出手高度' },
    releaseSide:   { keys: ['releaseside', 'release_side', '出手点横向'],      unit: 'ft', label: '出手点横向' },
    extension:     { keys: ['extension', '伸展'],                              unit: 'ft', label: '伸展' },
    plateHeight:   { keys: ['platelocheight', 'plate_height', 'plateheight', '击球区高度'], unit: 'ft', label: '击球区高度' },
    plateSide:     { keys: ['platelocside', 'plate_side', 'plateside', '击球区横向'],     unit: 'in', label: '击球区横向' }
  };

  /* ========== Blast Motion 打击字段映射 ========== */
  const BLAST_FIELDS = {
    batSpeed:      { keys: ['batspeed', 'maxswingpeed', '挥棒速度'],          unit: 'mph', label: '挥棒速度' },
    impactSpeed:   { keys: ['batspeedatimpact', 'impactspeed', '击球瞬间速度'], unit: 'mph', label: '击球瞬间速度' },
    attackAngle:   { keys: ['attackangle', '攻击角度'],                        unit: '°',   label: '攻击角度' },
    blastFactor:   { keys: ['blastfactor', '爆发系数'],                        unit: '',    label: '爆发系数' },
    timeToContact: { keys: ['timetocontact', '击球时间'],                       unit: 's',   label: '击球时间' },
    vertBatAngle:  { keys: ['verticalbatangle', '球棒垂直角'],                  unit: '°',   label: '球棒垂直角' },
    power:         { keys: ['power', 'distance', '击球距离'],                   unit: 'ft',  label: '击球距离' },
    onPlanePct:    { keys: ['onplanepct', 'onplane%', 'onplane', '挥棒路径%'], unit: '%',   label: '挥棒路径%' },
    rotation:      { keys: ['rotation', 'hiprotation', '髋部旋转'],             unit: '°',   label: '髋部旋转' }
  };

  /* ========== 工具：模糊匹配列名 ========== */
  function pickField(headers, candidate) {
    const lower = headers.map(h => (h || '').toLowerCase().trim());
    for (let i = 0; i < candidate.length; i++) {
      const k = candidate[i].toLowerCase();
      // 精确包含
      for (let j = 0; j < lower.length; j++) {
        if (lower[j] === k) return headers[j];
      }
    }
    for (let i = 0; i < candidate.length; i++) {
      const k = candidate[i].toLowerCase();
      for (let j = 0; j < lower.length; j++) {
        if (lower[j].indexOf(k) >= 0) return headers[j];
      }
    }
    return null;
  }

  /* ========== CSV 解析（支持带引号、含逗号的字段） ========== */
  function parseCSV(text) {
    // 去掉 BOM
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    const lines = [];
    let cur = '', inQuote = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQuote) {
        if (c === '"') {
          if (text[i + 1] === '"') { cur += '"'; i++; }
          else inQuote = false;
        } else cur += c;
      } else {
        if (c === '"') inQuote = true;
        else if (c === '\n' || c === '\r') {
          if (cur.length > 0) { lines.push(cur); cur = ''; }
          if (c === '\r' && text[i + 1] === '\n') i++;
        } else cur += c;
      }
    }
    if (cur.length > 0) lines.push(cur);
    if (lines.length === 0) return { headers: [], rows: [] };
    const headers = lines[0].split(',').map(s => s.trim());
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      const cols = lines[i].split(',');
      const obj = {};
      headers.forEach((h, idx) => { obj[h] = (cols[idx] || '').trim(); });
      rows.push(obj);
    }
    return { headers: headers, rows: rows };
  }

  /* ========== 解析 Rapsodo CSV ========== */
  function parseRapsodo(text) {
    const parsed = parseCSV(text);
    if (parsed.rows.length === 0) throw new Error('CSV 无数据行');

    const map = {};
    Object.keys(RAPSODO_FIELDS).forEach(key => {
      const field = RAPSODO_FIELDS[key];
      const matched = pickField(parsed.headers, field.keys);
      if (matched) map[key] = matched;
    });

    if (!map.velocity) {
      throw new Error('未识别到"球速"字段，请确认是 Rapsodo 导出的 CSV');
    }

    const pitches = [];
    parsed.rows.forEach((row, idx) => {
      const pitch = { idx: idx + 1 };
      let hasData = false;
      Object.keys(map).forEach(key => {
        const raw = row[map[key]];
        const num = parseFloat(raw);
        if (!isNaN(num)) { pitch[key] = num; hasData = true; }
      });
      if (hasData) pitches.push(pitch);
    });

    if (pitches.length === 0) throw new Error('未能解析出有效的球数据');

    return {
      type: 'pitching',
      source: 'Rapsodo',
      map: map,
      pitches: pitches
    };
  }

  /* ========== 解析 Blast Motion CSV ========== */
  function parseBlast(text) {
    const parsed = parseCSV(text);
    if (parsed.rows.length === 0) throw new Error('CSV 无数据行');

    const map = {};
    Object.keys(BLAST_FIELDS).forEach(key => {
      const field = BLAST_FIELDS[key];
      const matched = pickField(parsed.headers, field.keys);
      if (matched) map[key] = matched;
    });

    if (!map.batSpeed && !map.impactSpeed) {
      throw new Error('未识别到挥棒速度字段，请确认是 Blast Motion 导出的 CSV');
    }

    const swings = [];
    parsed.rows.forEach((row, idx) => {
      const swing = { idx: idx + 1 };
      let hasData = false;
      Object.keys(map).forEach(key => {
        const raw = row[map[key]];
        const num = parseFloat(raw);
        if (!isNaN(num)) { swing[key] = num; hasData = true; }
      });
      if (hasData) swings.push(swing);
    });

    if (swings.length === 0) throw new Error('未能解析出有效的挥棒数据');

    return {
      type: 'hitting',
      source: 'Blast Motion',
      map: map,
      swings: swings
    };
  }

  /* ========== 指标统计 ========== */
  function stat(arr) {
    if (!arr || arr.length === 0) return { min: 0, max: 0, avg: 0, std: 0, count: 0 };
    const min = Math.min.apply(null, arr);
    const max = Math.max.apply(null, arr);
    const sum = arr.reduce((a, b) => a + b, 0);
    const avg = sum / arr.length;
    const variance = arr.reduce((a, b) => a + (b - avg) * (b - avg), 0) / arr.length;
    return {
      min: round(min),
      max: round(max),
      avg: round(avg),
      std: round(Math.sqrt(variance)),
      count: arr.length
    };
  }

  function round(n, d) {
    d = d || 1;
    return Math.round(n * Math.pow(10, d)) / Math.pow(10, d);
  }

  /* ========== 投手数据汇总 ========== */
  function summarizePitching(parsed) {
    const p = parsed.pitches;
    const fields = ['velocity', 'spinRate', 'spinAxis', 'horzBreak', 'vertBreak', 'releaseHeight', 'releaseSide', 'extension', 'plateHeight', 'plateSide'];
    const summary = { count: p.length, fields: {} };
    fields.forEach(f => {
      const arr = p.map(x => x[f]).filter(v => v !== undefined);
      if (arr.length > 0) summary.fields[f] = stat(arr);
    });
    return summary;
  }

  /* ========== 打击数据汇总 ========== */
  function summarizeHitting(parsed) {
    const s = parsed.swings;
    const fields = ['batSpeed', 'impactSpeed', 'attackAngle', 'blastFactor', 'timeToContact', 'vertBatAngle', 'power', 'onPlanePct', 'rotation'];
    const summary = { count: s.length, fields: {} };
    fields.forEach(f => {
      const arr = s.map(x => x[f]).filter(v => v !== undefined);
      if (arr.length > 0) summary.fields[f] = stat(arr);
    });
    return summary;
  }

  /* ========== 投手评级标准（U12-U18 通用经验值） ========== */
  const PITCH_NORMS = {
    velocity:   { good: 70, ok: 60,  unit: 'mph', label: '球速' },         // 13-18 岁参考
    spinRate:   { good: 2400, ok: 2100, unit: 'rpm', label: '旋转率' },
    horzBreak:  { good: 15, ok: 8,    unit: 'in',  label: '横向位移' },
    vertBreak:  { good: 18, ok: 12,   unit: 'in',  label: '纵向位移' },
    extension:  { good: 6.5, ok: 6.0, unit: 'ft',  label: '伸展' }
  };

  function ratePitching(summary) {
    const ratings = [];
    Object.keys(PITCH_NORMS).forEach(key => {
      const s = summary.fields[key];
      if (!s) return;
      const norm = PITCH_NORMS[key];
      let level = 'low', levelLabel = '待加强';
      if (s.avg >= norm.good) { level = 'good'; levelLabel = '优秀'; }
      else if (s.avg >= norm.ok) { level = 'ok'; levelLabel = '合格'; }
      else { level = 'low'; levelLabel = '需提升'; }
      ratings.push({
        key: key,
        label: norm.label,
        avg: s.avg,
        unit: norm.unit,
        level: level,
        levelLabel: levelLabel
      });
    });
    return ratings;
  }

  /* ========== 打击评级标准 ========== */
  const HIT_NORMS = {
    batSpeed:    { good: 65, ok: 55,  unit: 'mph', label: '挥棒速度' },
    impactSpeed: { good: 60, ok: 50,  unit: 'mph', label: '击球速度' },
    attackAngle: { good: 15, ok: 10,  unit: '°',   label: '攻击角度' },
    blastFactor: { good: 95, ok: 80,  unit: '',    label: '爆发系数' },
    onPlanePct:  { good: 80, ok: 60,  unit: '%',   label: '挥棒路径' }
  };

  function rateHitting(summary) {
    const ratings = [];
    Object.keys(HIT_NORMS).forEach(key => {
      const s = summary.fields[key];
      if (!s) return;
      const norm = HIT_NORMS[key];
      let level = 'low', levelLabel = '待加强';
      if (s.avg >= norm.good) { level = 'good'; levelLabel = '优秀'; }
      else if (s.avg >= norm.ok) { level = 'ok'; levelLabel = '合格'; }
      else { level = 'low'; levelLabel = '需提升'; }
      ratings.push({
        key: key,
        label: norm.label,
        avg: s.avg,
        unit: norm.unit,
        level: level,
        levelLabel: levelLabel
      });
    });
    return ratings;
  }

  /* ========== Firebase 存储分析记录 ========== */
  function saveAnalysis(playerId, analysisType, data) {
    if (typeof firebase === 'undefined' || !firebase.database) {
      return Promise.reject(new Error('Firebase 未连接'));
    }
    const db = firebase.database();
    const date = data.date || new Date().toISOString().slice(0, 10);
    const key = date + '_' + Date.now();
    return db.ref('analysis/' + playerId + '/' + analysisType + '/' + key).set({
      date: date,
      count: data.count,
      summary: data.summary,
      ratings: data.ratings,
      source: data.source,
      uploadedAt: new Date().toISOString()
    });
  }

  /* ========== 获取球员历史分析记录 ========== */
  function getPlayerHistory(playerId, analysisType, limit) {
    limit = limit || 10;
    if (typeof firebase === 'undefined' || !firebase.database) {
      return Promise.resolve([]);
    }
    const db = firebase.database();
    return db.ref('analysis/' + playerId + '/' + analysisType)
      .orderByChild('uploadedAt')
      .limitToLast(limit)
      .once('value')
      .then(snap => {
        const list = [];
        snap.forEach(child => list.push(Object.assign({ id: child.key }, child.val())));
        return list.reverse();
      });
  }

  /* ========== 大模型 API 调用 ==========
   * 通过 Cloudflare Workers / Vercel Edge Function 代理（避免暴露 API Key）
   * 如果没有代理，标记为未配置
   */
  function callAI(prompt, systemMsg) {
    // 默认代理地址：罗哥后期部署到自己的 Cloudflare Worker
    const endpoint = (window.AI_CONFIG && window.AI_CONFIG.endpoint) || '';
    const apiKey = (window.AI_CONFIG && window.AI_CONFIG.apiKey) || '';
    if (!endpoint) {
      return Promise.reject(new Error('AI 接口未配置：请在 AI_CONFIG 中设置 endpoint'));
    }
    return fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey
      },
      body: JSON.stringify({
        model: (window.AI_CONFIG && window.AI_CONFIG.model) || 'deepseek-chat',
        messages: [
          { role: 'system', content: systemMsg || '你是一个专业的青少年棒球教练，擅长用简洁易懂的中文给出技术改进建议。' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7
      })
    })
    .then(function(r) { return r.json(); })
    .then(function(d) {
      if (d.choices && d.choices[0]) return d.choices[0].message.content;
      if (d.error) throw new Error(d.error.message);
      throw new Error('AI 返回格式异常');
    });
  }

  /* ========== 提示词构造 ========== */
  function buildPitchingPrompt(playerName, summary, ratings, count) {
    let lines = [];
    lines.push('球员：' + (playerName || '未命名'));
    lines.push('采样数：' + count + ' 球（Rapsodo PITCHING 2.0 数据）');
    lines.push('');
    lines.push('【关键指标】');
    ratings.forEach(function(r) {
      lines.push('- ' + r.label + '：均值 ' + r.avg + ' ' + r.unit + '（' + r.levelLabel + '）');
    });
    lines.push('');
    lines.push('【完整数据】');
    Object.keys(summary.fields).forEach(function(k) {
      const s = summary.fields[k];
      lines.push('- ' + (RAPSODO_FIELDS[k] ? RAPSODO_FIELDS[k].label : k) + '：均值 ' + s.avg + ' ' + s.unit + ' / 最低 ' + s.min + ' / 最高 ' + s.max + ' / 标准差 ' + s.std);
    });
    lines.push('');
    lines.push('请基于以上数据，给出 3 段建议：');
    lines.push('1. 优势（哪几项指标突出）');
    lines.push('2. 待改进（哪几项指标偏弱，给出训练方向）');
    lines.push('3. 下一步重点（针对青少年投手的最关键 1-2 个建议）');
    lines.push('');
    lines.push('要求：');
    lines.push('- 用简体中文');
    lines.push('- 简洁，教练能直接用');
    lines.push('- 给出具体训练动作，不要泛泛而谈');
    return lines.join('\n');
  }

  function buildHittingPrompt(playerName, summary, ratings, count) {
    let lines = [];
    lines.push('球员：' + (playerName || '未命名'));
    lines.push('采样数：' + count + ' 次挥棒（Blast Motion 数据）');
    lines.push('');
    lines.push('【关键指标】');
    ratings.forEach(function(r) {
      lines.push('- ' + r.label + '：均值 ' + r.avg + ' ' + r.unit + '（' + r.levelLabel + '）');
    });
    lines.push('');
    lines.push('【完整数据】');
    Object.keys(summary.fields).forEach(function(k) {
      const s = summary.fields[k];
      lines.push('- ' + (BLAST_FIELDS[k] ? BLAST_FIELDS[k].label : k) + '：均值 ' + s.avg + ' ' + s.unit + ' / 最低 ' + s.min + ' / 最高 ' + s.max + ' / 标准差 ' + s.std);
    });
    lines.push('');
    lines.push('请基于以上数据，给出 3 段建议：');
    lines.push('1. 优势（哪几项指标突出）');
    lines.push('2. 待改进（哪几项指标偏弱，给出训练方向）');
    lines.push('3. 下一步重点（针对青少年打者的最关键 1-2 个建议）');
    lines.push('');
    lines.push('要求：');
    lines.push('- 用简体中文');
    lines.push('- 简洁，教练能直接用');
    lines.push('- 给出具体训练动作，不要泛泛而谈');
    return lines.join('\n');
  }

  /* ========== 暴露全局 API ========== */
  window.AICoachModule = {
    parseRapsodo: parseRapsodo,
    parseBlast: parseBlast,
    parseCSV: parseCSV,
    summarizePitching: summarizePitching,
    summarizeHitting: summarizeHitting,
    ratePitching: ratePitching,
    rateHitting: rateHitting,
    saveAnalysis: saveAnalysis,
    getPlayerHistory: getPlayerHistory,
    callAI: callAI,
    buildPitchingPrompt: buildPitchingPrompt,
    buildHittingPrompt: buildHittingPrompt,
    stat: stat,
    round: round,
    RAPSODO_FIELDS: RAPSODO_FIELDS,
    BLAST_FIELDS: BLAST_FIELDS,
    PITCH_NORMS: PITCH_NORMS,
    HIT_NORMS: HIT_NORMS
  };

})();
