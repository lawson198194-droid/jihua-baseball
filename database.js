/**
 * JIHUA 棒球管理系统 - 数据库模块 (Supabase)
 * 负责所有数据的增删改查操作
 */
(function() {
  'use strict';
  
  // ========== Supabase 配置 ==========
  const SUPABASE_URL = 'https://your-project.supabase.co';
  const SUPABASE_ANON_KEY = 'your-anon-key';
  
  // 简化的本地存储适配器（开发模式）
  const STORAGE_KEY = 'jihua_db';
  
  // ========== 模拟数据库操作 ==========
  class JihuDB {
    constructor() {
      this._cache = this._load();
      this._ready = true;
    }
    
    _load() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : this._initDB();
      } catch(e) {
        return this._initDB();
      }
    }
    
    _save() {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this._cache));
      } catch(e) {
        console.warn('存储已满', e);
      }
    }
    
    _initDB() {
      return {
        players: [
          { id: 'P001', name: '罗莀安', team: 'U12 Tigers', position: '投手', age: 11, throw_speed: 85, swing_speed: 112, created: '2026-01-15' },
          { id: 'P002', name: '陈伟豪', team: 'U12 Tigers', position: '捕手', age: 12, throw_speed: 78, swing_speed: 98, created: '2026-01-15' },
          { id: 'P003', name: '张明辉', team: 'U15 Eagles', position: '内野手', age: 14, throw_speed: 95, swing_speed: 118, created: '2026-01-20' },
          { id: 'P004', name: '李芷晴', team: 'U12 Tigers', position: '外野手', age: 11, throw_speed: 72, swing_speed: 105, created: '2026-02-01' },
        ],
        teams: [
          { id: 'T001', name: 'U12 Tigers', league: '香港U12联赛', coach: '黄教练', members: 15, created: '2026-01-10' },
          { id: 'T002', name: 'U15 Eagles', league: '香港U15联赛', coach: '李教练', members: 18, created: '2026-01-10' },
        ],
        games: [
          { id: 'G001', date: '2026-03-15', home: 'U12 Tigers', away: 'U12 Dragons', score: '8-5', venue: '红磡球场', status: 'completed' },
          { id: 'G002', date: '2026-04-10', home: 'U15 Eagles', away: 'U15 Hawks', score: '12-3', venue: '天水围', status: 'completed' },
        ],
        stats: []
      };
    }
    
    // ===== Players =====
    async getPlayers() {
      return this._cache.players;
    }
    
    async getPlayer(id) {
      return this._cache.players.find(p => p.id === id);
    }
    
    async addPlayer(data) {
      const id = 'P' + String(this._cache.players.length + 1).padStart(3, '0');
      const player = { id, ...data, created: new Date().toISOString().split('T')[0] };
      this._cache.players.push(player);
      this._save();
      return player;
    }
    
    async updatePlayer(id, data) {
      const idx = this._cache.players.findIndex(p => p.id === id);
      if (idx >= 0) {
        this._cache.players[idx] = { ...this._cache.players[idx], ...data };
        this._save();
        return this._cache.players[idx];
      }
      return null;
    }
    
    async deletePlayer(id) {
      this._cache.players = this._cache.players.filter(p => p.id !== id);
      this._save();
      return true;
    }
    
    // ===== Teams =====
    async getTeams() {
      return this._cache.teams;
    }
    
    async addTeam(data) {
      const id = 'T' + String(this._cache.teams.length + 1).padStart(3, '0');
      const team = { id, ...data, created: new Date().toISOString().split('T')[0] };
      this._cache.teams.push(team);
      this._save();
      return team;
    }
    
    // ===== Games =====
    async getGames() {
      return this._cache.games;
    }
    
    async addGame(data) {
      const id = 'G' + String(this._cache.games.length + 1).padStart(3, '0');
      const game = { id, ...data, status: 'scheduled' };
      this._cache.games.push(game);
      this._save();
      return game;
    }
    
    // ===== Stats =====
    async addStat(data) {
      const stat = { id: 'S' + Date.now(), ...data };
      this._cache.stats.push(stat);
      this._save();
      return stat;
    }
    
    // ===== Export/Import =====
    exportAll() {
      return JSON.stringify(this._cache, null, 2);
    }
    
    importAll(jsonStr) {
      try {
        const data = JSON.parse(jsonStr);
        this._cache = data;
        this._save();
        return true;
      } catch(e) {
        return false;
      }
    }
  }
  
  // 全局实例
  window.JihuDB = new JihuDB();
  console.log('✅ JIHUA 数据库模块已就绪');
  
})();
