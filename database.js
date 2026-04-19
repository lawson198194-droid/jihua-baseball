/**
 * BaseAI 棒球管理系统 · Supabase 数据库模块 (安全版)
 * secret key 不存放于前端，仅使用 anon public key
 * RLS 策略控制读写权限
 */
(function () {
  'use strict';

  // ========== Supabase 配置 (anon key - 公开安全) ==========
  const SUPABASE_URL = 'https://hbzophgucdwlvcwolmom.supabase.co';
  // 匿名 key：浏览器端安全使用，配合 RLS 策略
  const ANON_KEY    = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhiem9waGd1Y2R3bHZjd29sbW9tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY1MzUwOTgsImV4cCI6MjA5MjExMTA5OH0.LNDRTdwgKoOWRtevFR7pEjo1qvbJW0fVmQBgOllXkpc';

  let _cache = { players: [], teams: [], games: [], stats: [] };
  let _ready = false;

  function apiFetch(table, params) {
    const url = new URL(SUPABASE_URL + '/rest/v1/' + table);
    if (params) Object.keys(params).forEach(k => url.searchParams.append(k, params[k]));
    const req = new Request(url.toString(), {
      method: 'GET',
      headers: {
        'apikey': ANON_KEY,
        'Authorization': 'Bearer ' + ANON_KEY,
        'Content-Type': 'application/json'
      }
    });
    return fetch(req).then(r => r.ok ? r.json() : Promise.reject(new Error(r.status + ': ' + r.statusText)));
  }

  function apiPost(table, data) {
    const req = new Request(SUPABASE_URL + '/rest/v1/' + table, {
      method: 'POST',
      headers: {
        'apikey': ANON_KEY,
        'Authorization': 'Bearer ' + ANON_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(data)
    });
    return fetch(req).then(r => r.ok ? r.json() : Promise.reject(new Error(r.status)));
  }

  function apiPatch(table, params, data) {
    const url = new URL(SUPABASE_URL + '/rest/v1/' + table);
    Object.keys(params).forEach(k => url.searchParams.append(k, params[k]));
    const req = new Request(url.toString(), {
      method: 'PATCH',
      headers: {
        'apikey': ANON_KEY,
        'Authorization': 'Bearer ' + ANON_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(data)
    });
    return fetch(req).then(r => r.ok ? r.json() : Promise.reject(new Error(r.status)));
  }

  function apiDelete(table, params) {
    const url = new URL(SUPABASE_URL + '/rest/v1/' + table);
    Object.keys(params).forEach(k => url.searchParams.append(k, params[k]));
    const req = new Request(url.toString(), {
      method: 'DELETE',
      headers: { 'apikey': ANON_KEY, 'Authorization': 'Bearer ' + ANON_KEY }
    });
    return fetch(req).then(r => r.ok ? r.json() : Promise.reject(new Error(r.status)));
  }

  async function loadAll() {
    try {
      const [players, teams, games, stats] = await Promise.all([
        apiFetch('players', { select: '*,teams(name)', order: 'created_at.desc' }),
        apiFetch('teams', { select: '*', order: 'created_at.asc' }),
        apiFetch('games', { select: '*,home:teams!home_team_id(name),away:teams!away_team_id(name)', order: 'game_date.desc' }),
        apiFetch('stats', { select: '*', order: 'recorded_at.desc' })
      ]);
      _cache = { players: players || [], teams: teams || [], games: games || [], stats: stats || [] };
      _ready = true;
    } catch (e) {
      console.warn('[DB] Supabase 连接失败，使用本地数据:', e.message);
      try {
        const local = JSON.parse(localStorage.getItem('baseai_db') || '{}');
        _cache = { players: local.players || [], teams: local.teams || [], games: local.games || [], stats: local.stats || [] };
      } catch () { _cache = { players: [], teams: [], games: [], stats: [] }; }
      _ready = true;
    }
  }

  // Players
  function getPlayers()     { return Promise.resolve(_cache.players); }
  function getPlayer(id)    { return Promise.resolve(_cache.players.find(p => p.id === id)); }

  async function addPlayer(data) {
    try {
      const result = await apiPost('players', data);
      _cache.players.unshift(Array.isArray(result) ? result[0] : result);
      return result;
    } catch (e) {
      const item = { id: 'P' + Date.now(), ...data, created_at: new Date().toISOString() };
      _cache.players.unshift(item);
      localStorage.setItem('baseai_db', JSON.stringify(_cache));
      return item;
    }
  }

  async function updatePlayer(id, data) {
    try { await apiPatch('players', { id: 'eq.' + id }, data); } catch (e) {}
    const idx = _cache.players.findIndex(p => p.id === id);
    if (idx >= 0) _cache.players[idx] = { ..._cache.players[idx], ...data };
    localStorage.setItem('baseai_db', JSON.stringify(_cache));
    return _cache.players[idx];
  }

  async function deletePlayer(id) {
    try { await apiDelete('players', { id: 'eq.' + id }); } catch (e) {}
    _cache.players = _cache.players.filter(p => p.id !== id);
    localStorage.setItem('baseai_db', JSON.stringify(_cache));
  }

  // Teams
  function getTeams()       { return Promise.resolve(_cache.teams); }

  async function addTeam(data) {
    try {
      const result = await apiPost('teams', data);
      _cache.teams.push(Array.isArray(result) ? result[0] : result);
      return result;
    } catch (e) {
      const item = { id: 'T' + Date.now(), ...data, created_at: new Date().toISOString() };
      _cache.teams.push(item);
      localStorage.setItem('baseai_db', JSON.stringify(_cache));
      return item;
    }
  }

  async function updateTeam(id, data) {
    try { await apiPatch('teams', { id: 'eq.' + id }, data); } catch (e) {}
    const idx = _cache.teams.findIndex(t => t.id === id);
    if (idx >= 0) _cache.teams[idx] = { ..._cache.teams[idx], ...data };
    return _cache.teams[idx];
  }

  // Games
  function getGames()       { return Promise.resolve(_cache.games); }

  async function addGame(data) {
    try {
      const result = await apiPost('games', data);
      _cache.games.unshift(Array.isArray(result) ? result[0] : result);
      return result;
    } catch (e) {
      const item = { id: 'G' + Date.now(), ...data, created_at: new Date().toISOString() };
      _cache.games.unshift(item);
      return item;
    }
  }

  async function updateGame(id, data) {
    try { await apiPatch('games', { id: 'eq.' + id }, data); } catch (e) {}
    const idx = _cache.games.findIndex(g => g.id === id);
    if (idx >= 0) _cache.games[idx] = { ..._cache.games[idx], ...data };
    return _cache.games[idx];
  }

  // Stats
  function getStats()       { return Promise.resolve(_cache.stats); }

  async function addStat(data) {
    try {
      const result = await apiPost('stats', data);
      _cache.stats.unshift(Array.isArray(result) ? result[0] : result);
      return result;
    } catch (e) {
      const item = { id: 'S' + Date.now(), ...data, recorded_at: new Date().toISOString() };
      _cache.stats.unshift(item);
      return item;
    }
  }

  function exportAll()       { return JSON.stringify(_cache, null, 2); }
  function importAll(s)     { try { _cache = JSON.parse(s); return true; } catch { return false; } }

  window.DB = {
    load, ready: () => _ready, cache: () => _cache,
    players: { getAll: getPlayers, get: getPlayer, add: addPlayer, update: updatePlayer, delete: deletePlayer },
    teams:   { getAll: getTeams, add: addTeam, update: updateTeam },
    games:   { getAll: getGames, add: addGame, update: updateGame },
    stats:   { getAll: getStats, add: addStat },
    export: exportAll, import: importAll
  };

  console.log('[DB] BaseAI 云端数据库模块已加载 ✓  (Supabase + 本地备援)');

})();
