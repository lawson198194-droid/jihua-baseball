/**
 * BaseAI Database Layer
 * - If Firebase SDK is loaded → use Firebase Realtime Database
 * - Otherwise → fall back to localStorage
 *
 * All modules (players, teams, games) go through this layer.
 * No need to change any module code.
 */

const DB = {
  _useFirebase: false,
  _ready: false,

  init(callback) {
    if (typeof firebase !== 'undefined' && firebase.apps.length > 0) {
      this._useFirebase = true;
      console.log('[DB] Mode: Firebase Realtime Database ✅');
    } else {
      console.log('[DB] Mode: localStorage fallback');
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
