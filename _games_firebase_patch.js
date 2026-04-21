// ============================================================
//  FirebaseService - BaseAI 棒球管理系统
//  games + game_roster nodes
// ============================================================

// ── Games ──────────────────────────────────────────────────
getGames: function(callback) {
  var self = this;
  if (!this.isConfigured) {
    var data = JSON.parse(localStorage.getItem('baseai_games') || '[]');
    setTimeout(function(){ callback({ data: data }); }, 0);
    return;
  }
  this.db.ref('games').orderByChild('date').once('value').then(function(snapshot) {
    var data = [];
    snapshot.forEach(function(child) {
      var item = child.val();
      item.id = child.key;
      data.unshift(item); // newest first
    });
    callback({ data: data });
  }).catch(function(e) {
    console.error('[Firebase] getGames error:', e);
    callback({ data: [] });
  });
},

getGame: function(id, callback) {
  var self = this;
  if (!this.isConfigured) {
    var games = JSON.parse(localStorage.getItem('baseai_games') || '[]');
    var found = games.find(function(g){ return g.id === id; });
    setTimeout(function(){ callback({ data: found || null }); }, 0);
    return;
  }
  this.db.ref('games/' + id).once('value').then(function(snapshot) {
    var data = snapshot.val();
    if (data) data.id = snapshot.key;
    callback({ data: data });
  }).catch(function(e) {
    console.error('[Firebase] getGame error:', e);
    callback({ data: null });
  });
},

upsertGame: function(gameData, callback) {
  if (!this.isConfigured) {
    var games = JSON.parse(localStorage.getItem('baseai_games') || '[]');
    var id = gameData.id;
    if (id) {
      var idx = games.findIndex(function(g){ return g.id === id; });
      if (idx >= 0) games[idx] = gameData;
    } else {
      id = 'G' + Date.now();
      gameData.id = id;
      games.push(gameData);
    }
    localStorage.setItem('baseai_games', JSON.stringify(games));
    setTimeout(function(){ if(callback) callback({ success: true, id: id }); }, 0);
    return;
  }
  var self = this;
  var data = Object.assign({}, gameData);
  var id = data.id;
  delete data.id;
  var ref = id ? this.db.ref('games/' + id) : this.db.ref('games').push();
  var finalId = id || ref.key;
  ref.set(data).then(function() {
    if (callback) callback({ success: true, id: finalId });
  }).catch(function(e) {
    console.error('[Firebase] upsertGame error:', e);
    if (callback) callback({ success: false, error: e });
  });
},

deleteGame: function(id, callback) {
  var self = this;
  if (!this.isConfigured) {
    var games = JSON.parse(localStorage.getItem('baseai_games') || '[]');
    games = games.filter(function(g){ return g.id !== id; });
    localStorage.setItem('baseai_games', JSON.stringify(games));
    setTimeout(function(){ if(callback) callback({ success: true }); }, 0);
    return;
  }
  // delete game + its roster
  this.db.ref('games/' + id).remove().then(function() {
    self.db.ref('game_rosters/' + id).remove().then(function() {
      if (callback) callback({ success: true });
    });
  }).catch(function(e) {
    console.error('[Firebase] deleteGame error:', e);
    if (callback) callback({ success: false, error: e });
  });
},

// ── Game Roster ─────────────────────────────────────────────
getGameRoster: function(gameId, callback) {
  var self = this;
  if (!this.isConfigured) {
    var data = JSON.parse(localStorage.getItem('baseai_roster_' + gameId) || '{}');
    var list = Object.keys(data).map(function(k){ data[k].id = k; return data[k]; });
    setTimeout(function(){ callback({ data: list }); }, 0);
    return;
  }
  this.db.ref('game_rosters/' + gameId).once('value').then(function(snapshot) {
    var data = [];
    snapshot.forEach(function(child) {
      var item = child.val();
      item.id = child.key;
      data.push(item);
    });
    callback({ data: data });
  }).catch(function(e) {
    console.error('[Firebase] getGameRoster error:', e);
    callback({ data: [] });
  });
},

setGameRoster: function(gameId, roster, callback) {
  var self = this;
  if (!this.isConfigured) {
    var obj = {};
    roster.forEach(function(p){ obj[p.id] = p; });
    localStorage.setItem('baseai_roster_' + gameId, JSON.stringify(obj));
    setTimeout(function(){ if(callback) callback({ success: true }); }, 0);
    return;
  }
  var updates = {};
  updates['game_rosters/' + gameId] = null; // clear existing
  roster.forEach(function(p) {
    updates['game_rosters/' + gameId + '/' + p.id] = p;
  });
  this.db.ref().update(updates).then(function() {
    if (callback) callback({ success: true });
  }).catch(function(e) {
    console.error('[Firebase] setGameRoster error:', e);
    if (callback) callback({ success: false, error: e });
  });
},

addPlayerToRoster: function(gameId, player, callback) {
  var self = this;
  if (!this.isConfigured) {
    var data = JSON.parse(localStorage.getItem('baseai_roster_' + gameId) || '{}');
    data[player.id] = player;
    localStorage.setItem('baseai_roster_' + gameId, JSON.stringify(data));
    setTimeout(function(){ if(callback) callback({ success: true }); }, 0);
    return;
  }
  this.db.ref('game_rosters/' + gameId + '/' + player.id).set(player).then(function() {
    if (callback) callback({ success: true });
  }).catch(function(e) {
    console.error('[Firebase] addPlayerToRoster error:', e);
    if (callback) callback({ success: false, error: e });
  });
},

removePlayerFromRoster: function(gameId, playerId, callback) {
  var self = this;
  if (!this.isConfigured) {
    var data = JSON.parse(localStorage.getItem('baseai_roster_' + gameId) || '{}');
    delete data[playerId];
    localStorage.setItem('baseai_roster_' + gameId, JSON.stringify(data));
    setTimeout(function(){ if(callback) callback({ success: true }); }, 0);
    return;
  }
  this.db.ref('game_rosters/' + gameId + '/' + playerId).remove().then(function() {
    if (callback) callback({ success: true });
  }).catch(function(e) {
    console.error('[Firebase] removePlayerFromRoster error:', e);
    if (callback) callback({ success: false, error: e });
  });
},

// ── Player Stats (lifetime, per-player) ────────────────────
updatePlayerGameStats: function(playerId, gameStats, callback) {
  // gameStats = { ab, r, h, rbi, bb, so, ip, ph, pr, per, pbb, pso, phr }
  var self = this;
  this.getPlayer(playerId, function(result) {
    var p = result.data || {};
    var stats = p.stats || {};
    var s = {
      games: (stats.games || 0) + 1,
      ab: (stats.ab || 0) + (gameStats.ab || 0),
      r: (stats.r || 0) + (gameStats.r || 0),
      h: (stats.h || 0) + (gameStats.h || 0),
      rbi: (stats.rbi || 0) + (gameStats.rbi || 0),
      bb: (stats.bb || 0) + (gameStats.bb || 0),
      so: (stats.so || 0) + (gameStats.so || 0),
      ip: (stats.ip || 0) + (gameStats.ip || 0),
      ph: (stats.ph || 0) + (gameStats.ph || 0),
      pr: (stats.pr || 0) + (gameStats.pr || 0),
      per: (stats.per || 0) + (gameStats.er || 0),
      pbb: (stats.pbb || 0) + (gameStats.pbb || 0),
      pso: (stats.pso || 0) + (gameStats.pso || 0),
      phr: (stats.phr || 0) + (gameStats.phr || 0)
    };
    self.updatePlayer(playerId, { stats: s }, callback);
  });
}