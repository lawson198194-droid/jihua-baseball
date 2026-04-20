/**
 * BaseAI Database Layer
 * - If Firebase SDK is loaded → use Firebase Realtime Database
 * - Otherwise → fall back to localStorage
 *
 * All modules (players, teams, games) go through this layer.
 * No need to change any module code.
 */

const DEMO_PLAYERS = [
  { id:'P001', name:'罗莀安', gender:'F', birth_date:'2014-03-15', positions:['投手'], batting_hand:'R', throwing_hand:'R', height_cm:148, weight_kg:42, school:'香港国际学校', club:'香港棒垒球总会 U12 精英队', hkab_id:'HKBA-2024-0012', contact_name:'罗先生', contact_phone:'+852 6123 4567', contact_relation:'父亲', photo:null, status:'active', notes:'左撇子潜力投手', _key:'P001' },
  { id:'P002', name:'陈伟豪', gender:'M', birth_date:'2013-07-22', positions:['捕手','一垒手'], batting_hand:'R', throwing_hand:'R', height_cm:155, weight_kg:48, school:'圣保罗小学', club:'香港棒垒球总会 U12', hkab_id:'HKBA-2024-0023', contact_name:'陈太', contact_phone:'+852 9876 5432', contact_relation:'母亲', photo:null, status:'active', notes:'主力捕手', _key:'P002' },
  { id:'P003', name:'张芷晴', gender:'F', birth_date:'2014-01-08', positions:['中外野','左外野'], batting_hand:'L', throwing_hand:'R', height_cm:145, weight_kg:40, school:'拔萃女小学', club:'拔萃女书院附小', hkab_id:'HKBA-2024-0008', contact_name:'张太', contact_phone:'+852 5555 1234', contact_relation:'母亲', photo:null, status:'active', notes:'外野核心', _key:'P003' },
  { id:'P004', name:'李浩然', gender:'M', birth_date:'2013-11-30', positions:['游击手','二垒手'], batting_hand:'R', throwing_hand:'R', height_cm:152, weight_kg:45, school:'喇沙小学', club:'香港棒垒球总会 U12', hkab_id:'HKBA-2024-0019', contact_name:'李先生', contact_phone:'+852 2222 8888', contact_relation:'父亲', photo:null, status:'active', notes:'内野防守中枢', _key:'P004' },
  { id:'P005', name:'王晓琳', gender:'F', birth_date:'2014-05-18', positions:['一垒手','指定打击'], batting_hand:'S', throwing_hand:'L', height_cm:143, weight_kg:38, school:'协恩中学附属小学', club:'协恩附小棒球队', hkab_id:'HKBA-2024-0015', contact_name:'王太太', contact_phone:'+852 3333 4444', contact_relation:'母亲', photo:null, status:'active', notes:'强打型一垒', _key:'P005' },
  { id:'P006', name:'刘健文', gender:'M', birth_date:'2013-09-12', positions:['三垒手'], batting_hand:'R', throwing_hand:'R', height_cm:158, weight_kg:50, school:'英华小学', club:'香港棒垒球总会 U12', hkab_id:'HKBA-2024-0021', contact_name:'刘太', contact_phone:'+852 7777 6666', contact_relation:'母亲', photo:null, status:'active', notes:'力量型三垒', _key:'P006' },
  { id:'P007', name:'何美琪', gender:'F', birth_date:'2014-02-28', positions:['左外野','中外野'], batting_hand:'L', throwing_hand:'L', height_cm:146, weight_kg:41, school:'玛利诺小学', club:'玛利诺棒球队', hkab_id:'HKBA-2024-0011', contact_name:'何先生', contact_phone:'+852 4444 5555', contact_relation:'父亲', photo:null, status:'active', notes:'速度型外野', _key:'P007' },
  { id:'P008', name:'周俊杰', gender:'M', birth_date:'2013-06-05', positions:['二垒手','游击手'], batting_hand:'R', throwing_hand:'R', height_cm:150, weight_kg:44, school:'圣公会小学', club:'香港棒垒球总会 U12', hkab_id:'HKBA-2024-0025', contact_name:'周太', contact_phone:'+852 6666 7777', contact_relation:'母亲', photo:null, status:'active', notes:'内野万金油', _key:'P008' }
];

const DB = {
  _useFirebase: false,
  _ready: false,

  init(callback) {
    if (typeof firebase !== 'undefined' && firebase.apps.length > 0) {
      this._useFirebase = true;
      console.log('[DB] Mode: Firebase Realtime Database ✅');
    } else {
      console.log('[DB] Mode: localStorage fallback');
      // Seed demo data if empty
      var existing = localStorage.getItem('baseai_players');
      if (!existing || existing === '[]' || existing === 'null') {
        console.log('[DB] Seeding demo players...');
        localStorage.setItem('baseai_players', JSON.stringify(DEMO_PLAYERS));
      }
    }
    this._ready = true;
    if (callback) callback();
  },

  // ============================================================
  // PLAYERS
  // ============================================================
  getPlayers(callback) {
    if (this._useFirebase && typeof FBPlayers !== 'undefined') {
      FBPlayers.getAll(callback);
    } else {
      // localStorage fallback
      var data = JSON.parse(localStorage.getItem('baseai_players') || '[]');
      // Attach _key to each (use id as key, or generate stable key)
      data = data.map(function(p) {
        p._key = p.id || p._key || ('P' + (data.indexOf(p)));
        return p;
      });
      setTimeout(function() { callback({ data: data }); }, 0);
    }
  },

  getPlayer(key, callback) {
    if (this._useFirebase && typeof FBPlayers !== 'undefined') {
      FBPlayers.get(key, callback);
    } else {
      var data = JSON.parse(localStorage.getItem('baseai_players') || '[]');
      var found = data.find(function(p) { return (p.id || p._key) === key; });
      setTimeout(function() { callback(found || null); }, 0);
    }
  },

  upsertPlayer(playerData, callback) {
    if (this._useFirebase && typeof FBPlayers !== 'undefined') {
      FBPlayers.upsert(playerData, callback);
    } else {
      // localStorage fallback
      var data = JSON.parse(localStorage.getItem('baseai_players') || '[]');
      var key = playerData._key || playerData.id;
      if (key) {
        var idx = data.findIndex(function(p) { return (p.id || p._key) === key; });
        if (idx >= 0) {
          data[idx] = Object.assign(data[idx], playerData, { _key: key, id: key });
        } else {
          data.push(Object.assign({}, playerData, { _key: key, id: key }));
        }
      } else {
        // New player
        var newId = 'P' + Date.now();
        data.push(Object.assign({}, playerData, { _key: newId, id: newId }));
        key = newId;
      }
      localStorage.setItem('baseai_players', JSON.stringify(data));
      setTimeout(function() { callback({ success: true, key: key }); }, 0);
    }
  },

  deletePlayer(key, callback) {
    if (this._useFirebase && typeof FBPlayers !== 'undefined') {
      FBPlayers.delete(key, callback);
    } else {
      var data = JSON.parse(localStorage.getItem('baseai_players') || '[]');
      var filtered = data.filter(function(p) { return (p.id || p._key) !== key; });
      localStorage.setItem('baseai_players', JSON.stringify(filtered));
      setTimeout(function() { callback({ success: true }); }, 0);
    }
  },

  updatePlayerField(key, fields, callback) {
    if (this._useFirebase && typeof FBPlayers !== 'undefined') {
      FBPlayers.updateField(key, fields, callback);
    } else {
      var data = JSON.parse(localStorage.getItem('baseai_players') || '[]');
      var idx = data.findIndex(function(p) { return (p.id || p._key) === key; });
      if (idx >= 0) {
        data[idx] = Object.assign(data[idx], fields);
        localStorage.setItem('baseai_players', JSON.stringify(data));
      }
      setTimeout(function() { callback({ success: true }); }, 0);
    }
  },

  // ============================================================
  // TEAMS
  // ============================================================
  getTeams(callback) {
    if (this._useFirebase && typeof FBTeams !== 'undefined') {
      FBTeams.getAll(callback);
    } else {
      var data = JSON.parse(localStorage.getItem('baseai_teams') || '[]');
      data = data.map(function(t) {
        t._key = t.id || t._key || ('T' + data.indexOf(t));
        return t;
      });
      setTimeout(function() { callback({ data: data }); }, 0);
    }
  },

  upsertTeam(teamData, callback) {
    if (this._useFirebase && typeof FBTeams !== 'undefined') {
      FBTeams.upsert(teamData, callback);
    } else {
      var data = JSON.parse(localStorage.getItem('baseai_teams') || '[]');
      var key = teamData._key || teamData.id;
      if (key) {
        var idx = data.findIndex(function(t) { return (t.id || t._key) === key; });
        if (idx >= 0) {
          data[idx] = Object.assign(data[idx], teamData, { _key: key, id: key });
        } else {
          data.push(Object.assign({}, teamData, { _key: key, id: key }));
        }
      } else {
        var newId = 'T' + Date.now();
        data.push(Object.assign({}, teamData, { _key: newId, id: newId }));
        key = newId;
      }
      localStorage.setItem('baseai_teams', JSON.stringify(data));
      setTimeout(function() { callback({ success: true, key: key }); }, 0);
    }
  },

  deleteTeam(key, callback) {
    if (this._useFirebase && typeof FBTeams !== 'undefined') {
      FBTeams.delete(key, callback);
    } else {
      var data = JSON.parse(localStorage.getItem('baseai_teams') || '[]');
      var filtered = data.filter(function(t) { return (t.id || t._key) !== key; });
      localStorage.setItem('baseai_teams', JSON.stringify(filtered));
      setTimeout(function() { callback({ success: true }); }, 0);
    }
  },

  // ============================================================
  // GAMES
  // ============================================================
  getGames(callback) {
    if (this._useFirebase && typeof FBGames !== 'undefined') {
      FBGames.getAll(callback);
    } else {
      var data = JSON.parse(localStorage.getItem('baseai_games') || '[]');
      data = data.map(function(g) {
        g._key = g.id || g._key || ('G' + data.indexOf(g));
        return g;
      });
      setTimeout(function() { callback({ data: data }); }, 0);
    }
  },

  upsertGame(gameData, callback) {
    if (this._useFirebase && typeof FBGames !== 'undefined') {
      FBGames.upsert(gameData, callback);
    } else {
      var data = JSON.parse(localStorage.getItem('baseai_games') || '[]');
      var key = gameData._key || gameData.id;
      if (key) {
        var idx = data.findIndex(function(g) { return (g.id || g._key) === key; });
        if (idx >= 0) {
          data[idx] = Object.assign(data[idx], gameData, { _key: key, id: key });
        } else {
          data.push(Object.assign({}, gameData, { _key: key, id: key }));
        }
      } else {
        var newId = 'G' + Date.now();
        data.push(Object.assign({}, gameData, { _key: newId, id: newId }));
        key = newId;
      }
      localStorage.setItem('baseai_games', JSON.stringify(data));
      setTimeout(function() { callback({ success: true, key: key }); }, 0);
    }
  },

  deleteGame(key, callback) {
    if (this._useFirebase && typeof FBGames !== 'undefined') {
      FBGames.delete(key, callback);
    } else {
      var data = JSON.parse(localStorage.getItem('baseai_games') || '[]');
      var filtered = data.filter(function(g) { return (g.id || g._key) !== key; });
      localStorage.setItem('baseai_games', JSON.stringify(filtered));
      setTimeout(function() { callback({ success: true }); }, 0);
    }
  }
};
