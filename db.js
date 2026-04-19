/**
 * BaseAI Baseball System - Database Layer
 * Supports Supabase (production) + localStorage (fallback/demo)
 * 
 * Usage: Include this file before all modules.
 * Set window.SUPABASE_URL and window.SUPABASE_ANON_KEY for production.
 */

(function() {
  'use strict';

  // ============================================================
  // CONFIGURATION
  // ============================================================
  const CONFIG = {
    supabaseUrl: window.SUPABASE_URL || '',
    supabaseKey: window.SUPABASE_ANON_KEY || '',
    useSupabase: !!(window.SUPABASE_URL && window.SUPABASE_ANON_KEY),
    debug: false,
    lsPrefix: 'baseai_db_',
    dbVersion: '2'           // Bump this to force-clear old cache & re-seed
  };

  // Version gate: if schema changed, wipe old data and re-seed
  (function() {
    var verKey = CONFIG.lsPrefix + '_version';
    var prev = localStorage.getItem(verKey);
    if (prev !== CONFIG.dbVersion) {
      // Wipe all known tables
      ['players','teams','games','game_innings','player_stats','player_profiles','users','system_settings'].forEach(function(t) {
        localStorage.removeItem(CONFIG.lsPrefix + t);
      });
      localStorage.setItem(verKey, CONFIG.dbVersion);
    }
  })();

  if (CONFIG.debug) console.log('[DB] Initializing, Supabase:', CONFIG.useSupabase);

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
  class SupabaseDB {
    constructor() {
      this.client = null;
      this._init();
    }

    async _init() {
      if (!CONFIG.useSupabase) return;
      try {
        const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
        this.client = createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey);
        if (CONFIG.debug) console.log('[DB] Supabase connected');
      } catch (e) {
        console.warn('[DB] Supabase failed, using localStorage:', e.message);
        CONFIG.useSupabase = false;
      }
    }

    async _ready() {
      if (!CONFIG.useSupabase) return false;
      for (let i = 0; i < 50; i++) {
        if (this.client) return true;
        await new Promise(r => setTimeout(r, 100));
      }
      return false;
    }

    async select(table, filters) {
      if (!await this._ready()) return { data: null, error: 'Not connected' };
      let query = this.client.from(table).select('*');
      if (filters) {
        Object.entries(filters).forEach(([k, v]) => {
          if (v === null || v === undefined) return;
          if (Array.isArray(v)) query = query.in(k, v);
          else query = query.eq(k, v);
        });
      }
      const { data, error } = await query;
      return { data, error };
    }

    async insert(table, records) {
      if (!await this._ready()) return { data: null, error: 'Not connected' };
      const recordsArr = Array.isArray(records) ? records : [records];
      const { data, error } = await this.client.from(table).insert(recordsArr).select();
      return { data, error };
    }

    async update(table, id, updates) {
      if (!await this._ready()) return { data: null, error: 'Not connected' };
      const { data, error } = await this.client.from(table).update({ ...updates, updated_at: now() }).eq('id', id).select();
      return { data, error };
    }

    async upsert(table, records) {
      if (!await this._ready()) return { data: null, error: 'Not connected' };
      const { data, error } = await this.client.from(table).upsert(records).select();
      return { data, error };
    }

    async delete(table, id) {
      if (!await this._ready()) return { data: null, error: 'Not connected' };
      const { data, error } = await this.client.from(table).delete().eq('id', id);
      return { data, error };
    }
  }

  // ============================================================
  // LOCALSTORAGE FALLBACK (Demo)
  // ============================================================
  class LocalDB {
    constructor() {
      this.tables = ['players', 'teams', 'games', 'game_innings', 'player_stats', 'player_profiles', 'users', 'system_settings'];
      this._initTables();
      if (CONFIG.debug) console.log('[DB] Using localStorage');
    }

    _initTables() {
      this.tables.forEach(t => {
        if (!localStorage.getItem(CONFIG.lsPrefix + t)) {
          localStorage.setItem(CONFIG.lsPrefix + t, JSON.stringify([]));
        }
      });
    }

    _get(table) {
      try {
        return JSON.parse(localStorage.getItem(CONFIG.lsPrefix + table) || '[]');
      } catch { return []; }
    }

    _set(table, data) {
      localStorage.setItem(CONFIG.lsPrefix + table, JSON.stringify(data));
    }

    async select(table, filters) {
      let data = this._get(table);
      if (filters) {
        Object.entries(filters).forEach(([k, v]) => {
          if (v === null || v === undefined) return;
          data = data.filter(row => row[k] === v);
        });
      }
      return { data: data || [], error: null };
    }

    async insert(table, records) {
      const data = this._get(table);
      const recordsArr = Array.isArray(records) ? records : [records];
      recordsArr.forEach(r => {
        r.id = r.id || generateId();
        r.created_at = r.created_at || now();
        r.updated_at = r.updated_at || now();
        data.push(r);
      });
      this._set(table, data);
      return { data: recordsArr, error: null };
    }

    async update(table, id, updates) {
      const data = this._get(table);
      const idx = data.findIndex(r => r.id === id);
      if (idx === -1) return { data: null, error: 'Not found' };
      data[idx] = { ...data[idx], ...updates, updated_at: now() };
      this._set(table, data);
      return { data: [data[idx]], error: null };
    }

    async upsert(table, records) {
      const data = this._get(table);
      const recordsArr = Array.isArray(records) ? records : [records];
      recordsArr.forEach(r => {
        r.updated_at = now();
        const matchKey = r.player_id || r.team_id || r.game_id || r.id;
        const idx = data.findIndex(d => 
          (d.id && d.id === r.id) || 
          (d.player_id && d.player_id === r.player_id) ||
          (d.team_id && d.team_id === r.team_id) ||
          (d.game_id && d.game_id === r.game_id)
        );
        if (idx >= 0) data[idx] = { ...data[idx], ...r };
        else {
          r.id = r.id || generateId();
          r.created_at = r.created_at || now();
          data.push(r);
        }
      });
      this._set(table, data);
      return { data: recordsArr, error: null };
    }

    async delete(table, id) {
      let data = this._get(table);
      data = data.filter(r => r.id !== id);
      this._set(table, data);
      return { data: null, error: null };
    }
  }

  // ============================================================
  // UNIFIED API
  // ============================================================
  let _db = CONFIG.useSupabase ? new SupabaseDB() : new LocalDB();

  const DB = {
    isReady() { return true; },

    async getPlayers(filters) {
      const { data, error } = await _db.select('players', filters);
      return { data: data || [], error };
    },
    async addPlayer(player) {
      player.player_id = player.player_id || generateId();
      return _db.insert('players', player);
    },
    async updatePlayer(id, updates) { return _db.update('players', id, updates); },
    async deletePlayer(id) { return _db.delete('players', id); },
    async upsertPlayer(player) { return _db.upsert('players', player); },

    async getTeams(filters) {
      const { data, error } = await _db.select('teams', filters);
      return { data: data || [], error };
    },
    async addTeam(team) {
      team.team_id = team.team_id || generateId();
      return _db.insert('teams', team);
    },
    async updateTeam(id, updates) { return _db.update('teams', id, updates); },
    async deleteTeam(id) { return _db.delete('teams', id); },
    async upsertTeam(team) { return _db.upsert('teams', team); },

    async getGames(filters) {
      const { data, error } = await _db.select('games', filters);
      return { data: data || [], error };
    },
    async addGame(game) {
      game.game_id = game.game_id || generateId();
      return _db.insert('games', game);
    },
    async updateGame(id, updates) { return _db.update('games', id, updates); },
    async deleteGame(id) { return _db.delete('games', id); },
    async upsertGame(game) { return _db.upsert('games', game); },

    async getGameInnings(gameId) {
      const { data, error } = await _db.select('game_innings', { game_id: gameId });
      return { data: data || [], error };
    },
    async upsertInning(inning) { return _db.upsert('game_innings', inning); },

    async getPlayerStats(filters) {
      const { data, error } = await _db.select('player_stats', filters);
      return { data: data || [], error };
    },
    async addPlayerStat(stat) { return _db.insert('player_stats', stat); },
    async upsertPlayerStat(stat) { return _db.upsert('player_stats', stat); },
    async updatePlayerStat(id, updates) { return _db.update('player_stats', id, updates); },

    async getPlayerProfiles(filters) {
      const { data, error } = await _db.select('player_profiles', filters);
      return { data: data || [], error };
    },
    async upsertPlayerProfile(profile) { return _db.upsert('player_profiles', profile); },
    async deletePlayerProfile(id) { return _db.delete('player_profiles', id); },

    getMode() { return CONFIG.useSupabase ? 'Supabase' : 'localStorage'; },

    // Synchronous seeding - runs immediately when db.js loads
    _seedSync() {
      // Read current players
      var existing = [];
      try { existing = JSON.parse(localStorage.getItem(CONFIG.lsPrefix + 'players') || '[]'); } catch(e) {}
      if (existing.length > 0) return; // Already seeded

      var demoPlayers = [
        { player_id: 'P001', name: '罗莀安', gender: 'F', birth_date: '2014-03-15', age: 12, position: '投手/内野', batting_hand: 'R', throwing_hand: 'R', height_cm: 148, weight_kg: 42, school: '香港国际学校', status: 'active' },
        { player_id: 'P002', name: '陈伟豪', gender: 'M', birth_date: '2013-07-22', age: 12, position: '捕手', batting_hand: 'R', throwing_hand: 'R', height_cm: 155, weight_kg: 48, school: '圣保罗小学', status: 'active' },
        { player_id: 'P003', name: '张芷晴', gender: 'F', birth_date: '2014-01-08', age: 12, position: '中外野', batting_hand: 'L', throwing_hand: 'R', height_cm: 145, weight_kg: 40, school: '拔萃女小学', status: 'active' },
        { player_id: 'P004', name: '李浩然', gender: 'M', birth_date: '2013-11-30', age: 12, position: '游击手', batting_hand: 'R', throwing_hand: 'R', height_cm: 152, weight_kg: 45, school: '喇沙小学', status: 'active' },
        { player_id: 'P005', name: '王晓琳', gender: 'F', birth_date: '2014-05-18', age: 11, position: '一垒手', batting_hand: 'S', throwing_hand: 'L', height_cm: 143, weight_kg: 38, school: '协恩中学附属小学', status: 'active' },
        { player_id: 'P006', name: '刘健文', gender: 'M', birth_date: '2013-09-12', age: 12, position: '三垒手', batting_hand: 'R', throwing_hand: 'R', height_cm: 158, weight_kg: 50, school: '英华小学', status: 'active' },
        { player_id: 'P007', name: '何美琪', gender: 'F', birth_date: '2014-02-28', age: 12, position: '左外野', batting_hand: 'L', throwing_hand: 'L', height_cm: 146, weight_kg: 41, school: '玛利诺小学', status: 'active' },
        { player_id: 'P008', name: '周俊杰', gender: 'M', birth_date: '2013-06-05', age: 12, position: '二垒手', batting_hand: 'R', throwing_hand: 'R', height_cm: 150, weight_kg: 44, school: '圣公会小学', status: 'active' }
      ];

      var demoTeams = [
        { team_id: 'T001', name: '香港青少棒红狮队', name_en: 'HK Youth Red Lions', category: 'u12', gender: 'M', coach_name: '陈志明', coach_phone: '+852 9123 4567', founded_year: 2020, home_venue: '香港仔运动场', status: 'active' },
        { team_id: 'T002', name: '香港女子青棒凤凰队', name_en: 'HK Girls Baseball Phoenix', category: 'u12', gender: 'F', coach_name: '李婉华', coach_phone: '+852 9876 5432', founded_year: 2021, home_venue: '九龙公园棒球场', status: 'active' },
        { team_id: 'T003', name: '香港国际学校校队', name_en: 'Hong Kong International School', category: 'u12', gender: 'coed', coach_name: 'MR. Johnson', coach_phone: '+852 2345 6789', founded_year: 2019, home_venue: '清水湾运动场', status: 'active' }
      ];

      var demoGames = [
        { game_id: 'G001', game_date: '2026-04-05', home_team_name: '香港青少棒红狮队', away_team_name: '香港国际学校校队', home_score: 8, away_score: 5, venue: '香港仔运动场', league: '香港U12联赛', season: '2026春季', game_type: 'league', status: 'completed', innings_total: 7, innings_played: 7 },
        { game_id: 'G002', game_date: '2026-04-12', home_team_name: '香港女子青棒凤凰队', away_team_name: '香港国际学校校队', home_score: 12, away_score: 3, venue: '九龙公园棒球场', league: '香港U12联赛', season: '2026春季', game_type: 'league', status: 'completed', innings_total: 7, innings_played: 7 },
        { game_id: 'G003', game_date: '2026-04-19', home_team_name: '香港青少棒红狮队', away_team_name: '香港女子青棒凤凰队', home_score: 0, away_score: 0, venue: '香港仔运动场', league: '香港U12联赛', season: '2026春季', game_type: 'league', status: 'scheduled', innings_total: 7, innings_played: 0 }
      ];

      try {
        localStorage.setItem(CONFIG.lsPrefix + 'players', JSON.stringify(demoPlayers));
        localStorage.setItem(CONFIG.lsPrefix + 'teams', JSON.stringify(demoTeams));
        localStorage.setItem(CONFIG.lsPrefix + 'games', JSON.stringify(demoGames));
      } catch(e) {}
    },

    async seedDemoData() {
      // Already seeded by _seedSync()
      var existing = [];
      try { existing = JSON.parse(localStorage.getItem(CONFIG.lsPrefix + 'players') || '[]'); } catch(e) {}
      if (existing.length > 0) return;
      // Fallback async seed if sync didn't run
      const demoPlayers = [
        { player_id: 'P001', name: '罗莀安', gender: 'F', birth_date: '2014-03-15', age: 12, position: '投手/内野', batting_hand: 'R', throwing_hand: 'R', height_cm: 148, weight_kg: 42, school: '香港国际学校', status: 'active' },
        { player_id: 'P002', name: '陈伟豪', gender: 'M', birth_date: '2013-07-22', age: 12, position: '捕手', batting_hand: 'R', throwing_hand: 'R', height_cm: 155, weight_kg: 48, school: '圣保罗小学', status: 'active' },
        { player_id: 'P003', name: '张芷晴', gender: 'F', birth_date: '2014-01-08', age: 12, position: '中外野', batting_hand: 'L', throwing_hand: 'R', height_cm: 145, weight_kg: 40, school: '拔萃女小学', status: 'active' },
        { player_id: 'P004', name: '李浩然', gender: 'M', birth_date: '2013-11-30', age: 12, position: '游击手', batting_hand: 'R', throwing_hand: 'R', height_cm: 152, weight_kg: 45, school: '喇沙小学', status: 'active' },
        { player_id: 'P005', name: '王晓琳', gender: 'F', birth_date: '2014-05-18', age: 11, position: '一垒手', batting_hand: 'S', throwing_hand: 'L', height_cm: 143, weight_kg: 38, school: '协恩中学附属小学', status: 'active' },
        { player_id: 'P006', name: '刘健文', gender: 'M', birth_date: '2013-09-12', age: 12, position: '三垒手', batting_hand: 'R', throwing_hand: 'R', height_cm: 158, weight_kg: 50, school: '英华小学', status: 'active' },
        { player_id: 'P007', name: '何美琪', gender: 'F', birth_date: '2014-02-28', age: 12, position: '左外野', batting_hand: 'L', throwing_hand: 'L', height_cm: 146, weight_kg: 41, school: '玛利诺小学', status: 'active' },
        { player_id: 'P008', name: '周俊杰', gender: 'M', birth_date: '2013-06-05', age: 12, position: '二垒手', batting_hand: 'R', throwing_hand: 'R', height_cm: 150, weight_kg: 44, school: '圣公会小学', status: 'active' }
      ];
      const demoTeams = [
        { team_id: 'T001', name: '香港青少棒红狮队', category: 'u12', gender: 'M', coach_name: '陈志明', founded_year: 2020, home_venue: '香港仔运动场', status: 'active' },
        { team_id: 'T002', name: '香港女子青棒凤凰队', category: 'u12', gender: 'F', coach_name: '李婉华', founded_year: 2021, home_venue: '九龙公园棒球场', status: 'active' },
        { team_id: 'T003', name: '香港国际学校校队', category: 'u12', gender: 'coed', coach_name: 'MR. Johnson', founded_year: 2019, home_venue: '清水湾运动场', status: 'active' }
      ];
      const demoGames = [
        { game_id: 'G001', game_date: '2026-04-05', home_team_name: '香港青少棒红狮队', away_team_name: '香港国际学校校队', home_score: 8, away_score: 5, venue: '香港仔运动场', league: '香港U12联赛', season: '2026春季', game_type: 'league', status: 'completed', innings_total: 7, innings_played: 7 },
        { game_id: 'G002', game_date: '2026-04-12', home_team_name: '香港女子青棒凤凰队', away_team_name: '香港国际学校校队', home_score: 12, away_score: 3, venue: '九龙公园棒球场', league: '香港U12联赛', season: '2026春季', game_type: 'league', status: 'completed', innings_total: 7, innings_played: 7 },
        { game_id: 'G003', game_date: '2026-04-19', home_team_name: '香港青少棒红狮队', away_team_name: '香港女子青棒凤凰队', home_score: 0, away_score: 0, venue: '香港仔运动场', league: '香港U12联赛', season: '2026春季', game_type: 'league', status: 'scheduled', innings_total: 7, innings_played: 0 }
      ];
      await Promise.all(demoPlayers.map(p => this.upsertPlayer(p)));
      await Promise.all(demoTeams.map(t => this.upsertTeam(t)));
      await Promise.all(demoGames.map(g => this.upsertGame(g)));
    },

    async exportAll() {
      const result = {};
      for (const table of ['players', 'teams', 'games', 'player_stats', 'player_profiles']) {
        const { data } = await _db.select(table);
        result[table] = data || [];
      }
      return result;
    },

    async importAll(data) {
      for (const [table, records] of Object.entries(data)) {
        if (Array.isArray(records)) await _db.upsert(table, records);
      }
    }
  };

  window.DB = DB;
  DB._seedSync(); // Synchronous seeding - runs immediately before any module loads

})();
