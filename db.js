/**
 * BaseAI Baseball System - Database Layer
 * Supports Supabase (production) + localStorage (demo) + in-memory fallback
 *
 * Usage: Include this file before all modules.
 * Set window.SUPABASE_URL and window.SUPABASE_ANON_KEY for production.
 */

(function() {
  'use strict';

  // ============================================================
  // STORAGE MANAGER - handles localStorage unavailability
  // ============================================================
  var _memoryStore = {};          // In-memory fallback store
  var _useLocalStorage = false;  // Auto-detected

  (function detectStorage() {
    try {
      var testKey = '__storage_test__';
      localStorage.setItem(testKey, '1');
      localStorage.removeItem(testKey);
      _useLocalStorage = true;
    } catch(e) {
      _useLocalStorage = false;
      console.warn('[DB] localStorage unavailable, using in-memory storage');
    }
  })();

  function storageGet(key) {
    if (_useLocalStorage) {
      try { return localStorage.getItem(key); } catch(e) { return null; }
    }
    return _memoryStore[key] || null;
  }

  function storageSet(key, value) {
    if (_useLocalStorage) {
      try { localStorage.setItem(key, value); return; } catch(e) {}
    }
    _memoryStore[key] = value;
  }

  function storageRemove(key) {
    if (_useLocalStorage) {
      try { localStorage.removeItem(key); } catch(e) {}
    }
    delete _memoryStore[key];
  }

  // ============================================================
  // CONFIGURATION
  // ============================================================
  var CONFIG = {
    supabaseUrl: window.SUPABASE_URL || '',
    supabaseKey: window.SUPABASE_ANON_KEY || '',
    useSupabase: !!(window.SUPABASE_URL && window.SUPABASE_ANON_KEY),
    debug: false,
    lsPrefix: 'baseai_db_',
    dbVersion: '3'
  };

  // Version gate: if schema changed, wipe old data and re-seed
  (function versionGate() {
    var verKey = CONFIG.lsPrefix + '_version';
    var prev = storageGet(verKey);
    if (prev !== CONFIG.dbVersion) {
      ['players','teams','games','game_innings','player_stats','player_profiles','users','system_settings'].forEach(function(t) {
        storageRemove(CONFIG.lsPrefix + t);
      });
      storageSet(verKey, CONFIG.dbVersion);
    }
  })();

  if (CONFIG.debug) console.log('[DB] Init, Supabase:', CONFIG.useSupabase, '| Storage:', _useLocalStorage ? 'localStorage' : 'memory');

  // ============================================================
  // UTILITY
  // ============================================================
  function generateId() {
    return 'id_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  function now() {
    return new Date().toISOString();
  }

  // ============================================================
  // SUPABASE CLIENT (Production)
  // ============================================================
  var SupabaseDB = null;  // Lazy-loaded

  // ============================================================
  // LOCALSTORAGE / MEMORY FALLBACK (Demo)
  // ============================================================
  var LocalDB = function() {
    this.tables = ['players', 'teams', 'games', 'game_innings', 'player_stats', 'player_profiles', 'users', 'system_settings'];
    this._initTables();
  };

  LocalDB.prototype._initTables = function() {
    this.tables.forEach(function(t) {
      var existing = storageGet(CONFIG.lsPrefix + t);
      if (!existing) {
        storageSet(CONFIG.lsPrefix + t, '[]');
      }
    });
  };

  LocalDB.prototype._get = function(table) {
    try {
      return JSON.parse(storageGet(CONFIG.lsPrefix + table) || '[]');
    } catch(e) { return []; }
  };

  LocalDB.prototype._set = function(table, data) {
    storageSet(CONFIG.lsPrefix + table, JSON.stringify(data));
  };

  LocalDB.prototype.select = async function(table, filters) {
    var data = this._get(table);
    if (filters) {
      Object.entries(filters).forEach(function(entry) {
        var k = entry[0], v = entry[1];
        if (v === null || v === undefined) return;
        data = data.filter(function(row) { return row[k] === v; });
      });
    }
    return { data: data || [], error: null };
  };

  LocalDB.prototype.insert = async function(table, records) {
    var self = this;
    var data = this._get(table);
    var recordsArr = Array.isArray(records) ? records : [records];
    recordsArr.forEach(function(r) {
      r.id = r.id || generateId();
      r.created_at = r.created_at || now();
      r.updated_at = r.updated_at || now();
      data.push(r);
    });
    this._set(table, data);
    return { data: recordsArr, error: null };
  };

  LocalDB.prototype.update = async function(table, id, updates) {
    var data = this._get(table);
    var idx = data.findIndex(function(r) { return r.id === id; });
    if (idx === -1) return { data: null, error: 'Not found' };
    data[idx] = Object.assign({}, data[idx], updates, { updated_at: now() });
    this._set(table, data);
    return { data: [data[idx]], error: null };
  };

  LocalDB.prototype.upsert = async function(table, records) {
    var data = this._get(table);
    var recordsArr = Array.isArray(records) ? records : [records];
    recordsArr.forEach(function(r) {
      r.updated_at = now();
      var idx = data.findIndex(function(d) {
        return (d.id && d.id === r.id) ||
               (d.player_id && d.player_id === r.player_id) ||
               (d.team_id && d.team_id === r.team_id) ||
               (d.game_id && d.game_id === r.game_id);
      });
      if (idx >= 0) {
        data[idx] = Object.assign({}, data[idx], r);
      } else {
        r.id = r.id || generateId();
        r.created_at = r.created_at || now();
        data.push(r);
      }
    });
    this._set(table, data);
    return { data: recordsArr, error: null };
  };

  LocalDB.prototype.delete = async function(table, id) {
    var data = this._get(table);
    data = data.filter(function(r) { return r.id !== id; });
    this._set(table, data);
    return { data: null, error: null };
  };

  // ============================================================
  // DEMO DATA
  // ============================================================
  var DEMO_PLAYERS = [
    { player_id: 'P001', name: '罗莀安', gender: 'F', birth_date: '2014-03-15', age: 12, position: '投手/内野', batting_hand: 'R', throwing_hand: 'R', height_cm: 148, weight_kg: 42, school: '香港国际学校', status: 'active' },
    { player_id: 'P002', name: '陈伟豪', gender: 'M', birth_date: '2013-07-22', age: 12, position: '捕手', batting_hand: 'R', throwing_hand: 'R', height_cm: 155, weight_kg: 48, school: '圣保罗小学', status: 'active' },
    { player_id: 'P003', name: '张芷晴', gender: 'F', birth_date: '2014-01-08', age: 12, position: '中外野', batting_hand: 'L', throwing_hand: 'R', height_cm: 145, weight_kg: 40, school: '拔萃女小学', status: 'active' },
    { player_id: 'P004', name: '李浩然', gender: 'M', birth_date: '2013-11-30', age: 12, position: '游击手', batting_hand: 'R', throwing_hand: 'R', height_cm: 152, weight_kg: 45, school: '喇沙小学', status: 'active' },
    { player_id: 'P005', name: '王晓琳', gender: 'F', birth_date: '2014-05-18', age: 11, position: '一垒手', batting_hand: 'S', throwing_hand: 'L', height_cm: 143, weight_kg: 38, school: '协恩中学附属小学', status: 'active' },
    { player_id: 'P006', name: '刘健文', gender: 'M', birth_date: '2013-09-12', age: 12, position: '三垒手', batting_hand: 'R', throwing_hand: 'R', height_cm: 158, weight_kg: 50, school: '英华小学', status: 'active' },
    { player_id: 'P007', name: '何美琪', gender: 'F', birth_date: '2014-02-28', age: 12, position: '左外野', batting_hand: 'L', throwing_hand: 'L', height_cm: 146, weight_kg: 41, school: '玛利诺小学', status: 'active' },
    { player_id: 'P008', name: '周俊杰', gender: 'M', birth_date: '2013-06-05', age: 12, position: '二垒手', batting_hand: 'R', throwing_hand: 'R', height_cm: 150, weight_kg: 44, school: '圣公会小学', status: 'active' }
  ];

  var DEMO_TEAMS = [
    { team_id: 'T001', name: '香港青少棒红狮队', name_en: 'HK Youth Red Lions', category: 'u12', gender: 'M', coach_name: '陈志明', coach_phone: '+852 9123 4567', founded_year: 2020, home_venue: '香港仔运动场', status: 'active' },
    { team_id: 'T002', name: '香港女子青棒凤凰队', name_en: 'HK Girls Baseball Phoenix', category: 'u12', gender: 'F', coach_name: '李婉华', coach_phone: '+852 9876 5432', founded_year: 2021, home_venue: '九龙公园棒球场', status: 'active' },
    { team_id: 'T003', name: '香港国际学校校队', name_en: 'Hong Kong International School', category: 'u12', gender: 'coed', coach_name: 'MR. Johnson', coach_phone: '+852 2345 6789', founded_year: 2019, home_venue: '清水湾运动场', status: 'active' }
  ];

  var DEMO_GAMES = [
    { game_id: 'G001', game_date: '2026-04-05', home_team_name: '香港青少棒红狮队', away_team_name: '香港国际学校校队', home_score: 8, away_score: 5, venue: '香港仔运动场', league: '香港U12联赛', season: '2026春季', game_type: 'league', status: 'completed', innings_total: 7, innings_played: 7 },
    { game_id: 'G002', game_date: '2026-04-12', home_team_name: '香港女子青棒凤凰队', away_team_name: '香港国际学校校队', home_score: 12, away_score: 3, venue: '九龙公园棒球场', league: '香港U12联赛', season: '2026春季', game_type: 'league', status: 'completed', innings_total: 7, innings_played: 7 },
    { game_id: 'G003', game_date: '2026-04-19', home_team_name: '香港青少棒红狮队', away_team_name: '香港女子青棒凤凰队', home_score: 0, away_score: 0, venue: '香港仔运动场', league: '香港U12联赛', season: '2026春季', game_type: 'league', status: 'scheduled', innings_total: 7, innings_played: 0 }
  ];

  // ============================================================
  // UNIFIED API
  // ============================================================
  var _db = new LocalDB();

  var DB = {
    isReady: function() { return true; },

    getMode: function() { return _useLocalStorage ? 'localStorage' : 'in-memory'; },

    // Players
    getPlayers: async function(filters) {
      var result = await _db.select('players', filters);
      return { data: result.data || [], error: result.error };
    },
    addPlayer: async function(player) {
      player.player_id = player.player_id || generateId();
      return _db.insert('players', player);
    },
    updatePlayer: async function(id, updates) { return _db.update('players', id, updates); },
    deletePlayer: async function(id) { return _db.delete('players', id); },
    upsertPlayer: async function(player) { return _db.upsert('players', player); },

    // Teams
    getTeams: async function(filters) {
      var result = await _db.select('teams', filters);
      return { data: result.data || [], error: result.error };
    },
    addTeam: async function(team) {
      team.team_id = team.team_id || generateId();
      return _db.insert('teams', team);
    },
    updateTeam: async function(id, updates) { return _db.update('teams', id, updates); },
    deleteTeam: async function(id) { return _db.delete('teams', id); },
    upsertTeam: async function(team) { return _db.upsert('teams', team); },

    // Games
    getGames: async function(filters) {
      var result = await _db.select('games', filters);
      return { data: result.data || [], error: result.error };
    },
    addGame: async function(game) {
      game.game_id = game.game_id || generateId();
      return _db.insert('games', game);
    },
    updateGame: async function(id, updates) { return _db.update('games', id, updates); },
    deleteGame: async function(id) { return _db.delete('games', id); },
    upsertGame: async function(game) { return _db.upsert('games', game); },

    // Game Innings
    getGameInnings: async function(gameId) {
      var result = await _db.select('game_innings', { game_id: gameId });
      return { data: result.data || [], error: result.error };
    },
    upsertInning: async function(inning) { return _db.upsert('game_innings', inning); },

    // Player Stats
    getPlayerStats: async function(filters) {
      var result = await _db.select('player_stats', filters);
      return { data: result.data || [], error: result.error };
    },
    addPlayerStat: async function(stat) { return _db.insert('player_stats', stat); },
    upsertPlayerStat: async function(stat) { return _db.upsert('player_stats', stat); },
    updatePlayerStat: async function(id, updates) { return _db.update('player_stats', id, updates); },

    // Player Profiles
    getPlayerProfiles: async function(filters) {
      var result = await _db.select('player_profiles', filters);
      return { data: result.data || [], error: result.error };
    },
    upsertPlayerProfile: async function(profile) { return _db.upsert('player_profiles', profile); },
    deletePlayerProfile: async function(id) { return _db.delete('player_profiles', id); },

    // Seed demo data
    _seedSync: function() {
      var existing = this._getPlayers();
      if (existing.length > 0) return;
      var self = this;
      DEMO_PLAYERS.forEach(function(p) { self.upsertPlayer(p); });
      DEMO_TEAMS.forEach(function(t) { self.upsertTeam(t); });
      DEMO_GAMES.forEach(function(g) { self.upsertGame(g); });
    },

    // Internal
    _getPlayers: function() {
      try { return JSON.parse(storageGet(CONFIG.lsPrefix + 'players') || '[]'); } catch(e) { return []; }
    },

    // Export/Import
    exportAll: async function() {
      var result = {};
      var tables = ['players', 'teams', 'games', 'player_stats', 'player_profiles'];
      tables.forEach(function(t) {
        var r = _db.select(t);
        r.then(function(res) { result[t] = res.data || []; });
      });
      await Promise.all(tables.map(function(t) { return _db.select(t); }));
      tables.forEach(function(t) {
        var data = _db._get(t);
        result[t] = data;
      });
      return result;
    },

    importAll: async function(data) {
      var self = this;
      Object.keys(data).forEach(function(table) {
        if (Array.isArray(data[table])) {
          data[table].forEach(function(record) { self.upsertPlayer(record); });
        }
      });
    }
  };

  window.DB = DB;

  // Synchronous seeding - runs immediately when db.js loads (before any module)
  DB._seedSync();

})();
