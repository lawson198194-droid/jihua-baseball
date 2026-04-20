/**
 * Firebase Realtime Database Service for BaseAI
 *
 * HOW TO SET UP:
 * 1. Go to https://console.firebase.google.com/
 * 2. Create a project → Build → Realtime Database → Create database
 * 3. Start in test mode
 * 4. Project Settings → Your apps → </> → Register web app
 * 5. Copy the firebaseConfig here, replace the placeholder below
 *
 * After setup, all player/team/game data syncs in real-time across all devices.
 */

const FIREBASE_CONFIG = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  databaseURL: "https://YOUR_PROJECT-default-rtdb.firebaseio.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// ============================================================
// Firebase init (lazy — only init once)
// ============================================================
let _fbApp = null;
let _db = null;

function getFirebaseDB() {
  if (!_fbApp) {
    // Check if firebase is loaded
    if (typeof firebase === 'undefined') {
      console.error('[Firebase] firebase SDK not loaded! Add the CDN script first.');
      return null;
    }
    try {
      _fbApp = firebase.initializeApp(FIREBASE_CONFIG, 'baseai');
      _db = firebase.database(_fbApp);
      console.log('[Firebase] Connected to Realtime Database ✅');
    } catch (e) {
      console.error('[Firebase] Init failed:', e);
      return null;
    }
  }
  return _db;
}

// ============================================================
// Data paths
// ============================================================
const PATHS = {
  players: 'players',
  teams: 'teams',
  games: 'games',
  analysis: 'analysis'
};

// ============================================================
// PLAYERS
// ============================================================
const FBPlayers = {
  // Get all players (real-time listener)
  getAll(callback) {
    const db = getFirebaseDB();
    if (!db) return;
    db.ref(PATHS.players).off(); // remove old listeners
    db.ref(PATHS.players).on('value', function(snap) {
      var data = [];
      snap.forEach(function(child) {
        var item = child.val();
        item._key = child.key;
        data.push(item);
      });
      callback({ data: data });
    }, function(err) {
      console.error('[Firebase] getAll players error:', err);
      callback({ data: [] });
    });
  },

  // Get single player by key
  get(key, callback) {
    const db = getFirebaseDB();
    if (!db) return;
    db.ref(PATHS.players + '/' + key).once('value').then(function(snap) {
      var data = snap.val();
      if (data) data._key = key;
      callback(data);
    });
  },

  // Add or update player (upsert)
  upsert(playerData, callback) {
    const db = getFirebaseDB();
    if (!db) return;
    if (playerData._key) {
      // Update existing
      db.ref(PATHS.players + '/' + playerData._key).update(cleanForFirebase(playerData)).then(function() {
        console.log('[Firebase] Player updated:', playerData.name || playerData._key);
        if (callback) callback({ success: true, key: playerData._key });
      }).catch(function(err) {
        console.error('[Firebase] Update error:', err);
        if (callback) callback({ success: false, error: err });
      });
    } else {
      // Add new — generate key based on name
      var key = playerData.name
        ? 'P' + Date.now() + '_' + playerData.name.replace(/\s+/g, '_')
        : 'P' + Date.now();
      var newRef = db.ref(PATHS.players).push();
      newRef.set(cleanForFirebase(Object.assign({ created_at: Date.now() }, playerData))).then(function() {
        console.log('[Firebase] Player added:', playerData.name, '->', newRef.key);
        if (callback) callback({ success: true, key: newRef.key });
      }).catch(function(err) {
        console.error('[Firebase] Add error:', err);
        if (callback) callback({ success: false, error: err });
      });
    }
  },

  // Delete player
  delete(key, callback) {
    const db = getFirebaseDB();
    if (!db) return;
    db.ref(PATHS.players + '/' + key).remove().then(function() {
      console.log('[Firebase] Player deleted:', key);
      if (callback) callback({ success: true });
    }).catch(function(err) {
      console.error('[Firebase] Delete error:', err);
      if (callback) callback({ success: false, error: err });
    });
  },

  // Update specific fields
  updateField(key, fields, callback) {
    const db = getFirebaseDB();
    if (!db) return;
    db.ref(PATHS.players + '/' + key).update(cleanForFirebase(fields)).then(function() {
      if (callback) callback({ success: true });
    }).catch(function(err) {
      console.error('[Firebase] UpdateField error:', err);
      if (callback) callback({ success: false, error: err });
    });
  }
};

// ============================================================
// TEAMS
// ============================================================
const FBTeams = {
  getAll(callback) {
    const db = getFirebaseDB();
    if (!db) return;
    db.ref(PATHS.teams).off();
    db.ref(PATHS.teams).on('value', function(snap) {
      var data = [];
      snap.forEach(function(child) {
        var item = child.val();
        item._key = child.key;
        data.push(item);
      });
      callback({ data: data });
    }, function(err) {
      callback({ data: [] });
    });
  },

  upsert(teamData, callback) {
    const db = getFirebaseDB();
    if (!db) return;
    if (teamData._key) {
      db.ref(PATHS.teams + '/' + teamData._key).update(cleanForFirebase(teamData)).then(function() {
        if (callback) callback({ success: true, key: teamData._key });
      }).catch(function(err) {
        if (callback) callback({ success: false, error: err });
      });
    } else {
      var newRef = db.ref(PATHS.teams).push();
      newRef.set(cleanForFirebase(Object.assign({ created_at: Date.now() }, teamData))).then(function() {
        if (callback) callback({ success: true, key: newRef.key });
      }).catch(function(err) {
        if (callback) callback({ success: false, error: err });
      });
    }
  },

  delete(key, callback) {
    const db = getFirebaseDB();
    if (!db) return;
    db.ref(PATHS.teams + '/' + key).remove().then(function() {
      if (callback) callback({ success: true });
    }).catch(function(err) {
      if (callback) callback({ success: false, error: err });
    });
  }
};

// ============================================================
// GAMES
// ============================================================
const FBGames = {
  getAll(callback) {
    const db = getFirebaseDB();
    if (!db) return;
    db.ref(PATHS.games).off();
    db.ref(PATHS.games).on('value', function(snap) {
      var data = [];
      snap.forEach(function(child) {
        var item = child.val();
        item._key = child.key;
        data.push(item);
      });
      callback({ data: data });
    }, function(err) {
      callback({ data: [] });
    });
  },

  upsert(gameData, callback) {
    const db = getFirebaseDB();
    if (!db) return;
    if (gameData._key) {
      db.ref(PATHS.games + '/' + gameData._key).update(cleanForFirebase(gameData)).then(function() {
        if (callback) callback({ success: true, key: gameData._key });
      }).catch(function(err) {
        if (callback) callback({ success: false, error: err });
      });
    } else {
      var newRef = db.ref(PATHS.games).push();
      newRef.set(cleanForFirebase(Object.assign({ created_at: Date.now() }, gameData))).then(function() {
        if (callback) callback({ success: true, key: newRef.key });
      }).catch(function(err) {
        if (callback) callback({ success: false, error: err });
      });
    }
  },

  delete(key, callback) {
    const db = getFirebaseDB();
    if (!db) return;
    db.ref(PATHS.games + '/' + key).remove().then(function() {
      if (callback) callback({ success: true });
    }).catch(function(err) {
      if (callback) callback({ success: false, error: err });
    });
  }
};

// ============================================================
// ANALYSIS RECORDS (AI coach history)
// ============================================================
const FBAnalysis = {
  add(record, callback) {
    const db = getFirebaseDB();
    if (!db) return;
    var newRef = db.ref(PATHS.analysis).push();
    newRef.set(Object.assign({ created_at: Date.now() }, record)).then(function() {
      if (callback) callback({ success: true, key: newRef.key });
    }).catch(function(err) {
      if (callback) callback({ success: false, error: err });
    });
  },

  getByPlayer(playerKey, callback) {
    const db = getFirebaseDB();
    if (!db) return;
    db.ref(PATHS.analysis).orderByChild('player_key').equalTo(playerKey).once('value').then(function(snap) {
      var data = [];
      snap.forEach(function(child) {
        var item = child.val();
        item._key = child.key;
        data.push(item);
      });
      if (callback) callback({ data: data });
    }).catch(function(err) {
      if (callback) callback({ data: [] });
    });
  }
};

// ============================================================
// UTILITY
// ============================================================

// Remove non-serializable fields before saving to Firebase
function cleanForFirebase(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  var clean = {};
  for (var key in obj) {
    if (obj.hasOwnProperty(key)) {
      var val = obj[key];
      // Skip functions, undefined, and internal keys
      if (typeof val === 'function' || val === undefined) continue;
      if (key === '_key' || key === '_tempId') continue;
      clean[key] = val;
    }
  }
  return clean;
}

// Test connection
function testFirebaseConnection() {
  const db = getFirebaseDB();
  if (!db) return { success: false, error: 'Firebase not initialized' };
  db.ref('.info/connected').once('value').then(function(snap) {
    if (snap.val() === true) {
      console.log('[Firebase] ✅ Connected to Firebase Realtime Database');
      showToast('Firebase 已连接，数据将实时同步', 'success');
    } else {
      console.warn('[Firebase] ⚠️ Not connected yet');
    }
  }).catch(function(err) {
    console.error('[Firebase] Connection test failed:', err);
  });
}
