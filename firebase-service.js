// ============================================================
//  Firebase Service - BaseAI 棒球管理系统
//  接入 Firebase Realtime Database (compat SDK v10.7.1)
// ============================================================

(function(){
  window.FirebaseService = {
    db: null,
    isConfigured: false,

    init: function(callback) {
      var self = this;
      // Check if Firebase compat SDK is loaded (global firebase namespace)
      if (typeof firebase === 'undefined' || typeof firebase.app === 'undefined') {
        console.warn('[Firebase] SDK not loaded, falling back to localStorage');
        this.isConfigured = false;
        this.db = null;
        if (callback) callback(false);
        return;
      }

      var firebaseConfig = {
        apiKey: "AIzaSyAFfnoOfKRgXltdJJfmybecw89WxYize1U",
        authDomain: "baseai-hk.firebaseapp.com",
        databaseURL: "https://baseai-hk-default-rtdb.asia-southeast1.firebasedatabase.app",
        projectId: "baseai-hk",
        storageBucket: "baseai-hk.firebasestorage.app",
        messagingSenderId: "409831152638",
        appId: "1:409831152638:web:1da4d9da8b2f24505dfeaf"
      };

      try {
        var app = firebase.initializeApp(firebaseConfig);
        this.db = firebase.database(app);
        this.isConfigured = true;
        console.log('[Firebase] Connected! URL:', firebaseConfig.databaseURL);
        if (callback) callback(true);
      } catch(e) {
        console.error('[Firebase] Init failed:', e);
        this.isConfigured = false;
        this.db = null;
        if (callback) callback(false);
      }
    },

    // ── Players ────────────────────────────────────────────

    getPlayers: function(callback) {
      var self = this;
      if (!this.isConfigured) {
        var data = JSON.parse(localStorage.getItem('baseai_players') || '[]');
        setTimeout(function(){ callback({ data: data }); }, 0);
        return;
      }
      this.db.ref('players').once('value').then(function(snapshot) {
        var data = [];
        snapshot.forEach(function(child) {
          var item = child.val();
          item.id = child.key;
          data.push(item);
        });
        callback({ data: data });
      }).catch(function(error) {
        console.error('[Firebase] getPlayers error:', error);
        callback({ data: [] });
      });
    },

    getPlayer: function(id, callback) {
      if (!this.isConfigured) {
        var players = JSON.parse(localStorage.getItem('baseai_players') || '[]');
        var found = players.find(function(p){ return p.id === id; });
        setTimeout(function(){ callback({ data: found || null }); }, 0);
        return;
      }
      this.db.ref('players/' + id).once('value').then(function(snapshot) {
        var data = snapshot.val();
        if (data) data.id = snapshot.key;
        callback({ data: data });
      }).catch(function(error) {
        console.error('[Firebase] getPlayer error:', error);
        callback({ data: null });
      });
    },

    addPlayer: function(playerData, callback) {
      if (!this.isConfigured) {
        var players = JSON.parse(localStorage.getItem('baseai_players') || '[]');
        var id = 'P' + Date.now();
        playerData.id = id;
        players.push(playerData);
        localStorage.setItem('baseai_players', JSON.stringify(players));
        setTimeout(function(){ if(callback) callback({ success: true, id: id }); }, 0);
        return;
      }
      var self = this;
      var newRef = this.db.ref('players').push();
      newRef.set(playerData).then(function() {
        if (callback) callback({ success: true, id: newRef.key });
      }).catch(function(e) {
        console.error('[Firebase] addPlayer error:', e);
        if (callback) callback({ success: false, error: e });
      });
    },

    updatePlayer: function(id, playerData, callback) {
      if (!this.isConfigured) {
        var players = JSON.parse(localStorage.getItem('baseai_players') || '[]');
        var idx = players.findIndex(function(p){ return p.id === id; });
        if (idx >= 0) {
          players[idx] = Object.assign({}, players[idx], playerData);
          localStorage.setItem('baseai_players', JSON.stringify(players));
        }
        setTimeout(function(){ if(callback) callback({ success: true }); }, 0);
        return;
      }
      this.db.ref('players/' + id).update(playerData).then(function() {
        if (callback) callback({ success: true });
      }).catch(function(e) {
        console.error('[Firebase] updatePlayer error:', e);
        if (callback) callback({ success: false, error: e });
      });
    },

    deletePlayer: function(id, callback) {
      if (!this.isConfigured) {
        var players = JSON.parse(localStorage.getItem('baseai_players') || '[]');
        players = players.filter(function(p){ return p.id !== id; });
        localStorage.setItem('baseai_players', JSON.stringify(players));
        setTimeout(function(){ if(callback) callback({ success: true }); }, 0);
        return;
      }
      this.db.ref('players/' + id).remove().then(function() {
        if (callback) callback({ success: true });
      }).catch(function(e) {
        console.error('[Firebase] deletePlayer error:', e);
        if (callback) callback({ success: false, error: e });
      });
    },

    upsertPlayer: function(playerData, callback) {
      if (playerData.id) {
        this.updatePlayer(playerData.id, playerData, callback);
      } else {
        // No ID: add new player. Use the pending record's ID as the player ID
        // to avoid creating duplicate entries on re-sync.
        var pendingId = playerData._pending_id;
        delete playerData._pending_id;
        if (pendingId) {
          // Write with the same key as the pending record → no duplicate
          this.db.ref('players/' + pendingId).set(playerData).then(function() {
            playerData.id = pendingId;
            if (callback) callback({ success: true, id: pendingId });
          }).catch(function(e) {
            console.error('[Firebase] upsertPlayer error:', e);
            if (callback) callback({ success: false, error: e });
          });
        } else {
          this.addPlayer(playerData, callback);
        }
      }
    },

    // ── Register new player (from register.html) ─────────────

    submitRegistration: function(playerData, callback) {
      var now = new Date().toISOString();
      var data = Object.assign({
        submittedAt: now,
        createdAt: now,
        status: 'pending',
        source: 'register_form'
      }, playerData);

      if (!this.isConfigured) {
        // Firebase not configured - let the caller (register.html) handle localStorage backup
        console.warn('[Firebase] Not configured, skipping Firebase submit');
        setTimeout(function(){ if(callback) callback({ success: false, reason: 'firebase_not_configured' }); }, 0);
        return;
      }

      var newRef = this.db.ref('pending_players').push();
      newRef.set(data).then(function() {
        console.log('[Firebase] Registration submitted successfully:', newRef.key);
        if (callback) callback({ success: true, id: newRef.key });
      }).catch(function(e) {
        console.error('[Firebase] submitRegistration error:', e);
        if (callback) callback({ success: false, error: e });
      });
    },

    getPendingRegistrations: function(callback) {
      if (!this.isConfigured) {
        var data = JSON.parse(localStorage.getItem('baseai_pending_players') || '[]');
        setTimeout(function(){ callback({ data: data }); }, 0);
        return;
      }
      this.db.ref('pending_players').once('value').then(function(snapshot) {
        var data = [];
        snapshot.forEach(function(child) {
          var item = child.val();
          item.id = child.key;
          data.push(item);
        });
        callback({ data: data });
      }).catch(function(error) {
        console.error('[Firebase] getPendingRegistrations error:', error);
        callback({ data: [] });
      });
    },

    // Real-time listener: watch pending_players for NEW submissions only
    // Uses a cutoff timestamp to avoid firing for existing children on initial attach
    onPendingRegistrations: function(callback) {
      if (!this.isConfigured) {
        var lastCount = 0;
        var timer = setInterval(function() {
          var data = JSON.parse(localStorage.getItem('baseai_pending_players') || '[]');
          if (data.length > lastCount) {
            var newItems = data.slice(lastCount);
            lastCount = data.length;
            callback(newItems);
          }
        }, 3000);
        return { detach: function() { clearInterval(timer); } };
      }
      // Capture cutoff time NOW — any pending items created before this moment are skipped
      var self = this;
      var cutoffTime = new Date().toISOString();
      this.db.ref('pending_players').on('child_added', function(snapshot) {
        var item = snapshot.val();
        var createdAt = item.createdAt || item.submittedAt || '';
        // Skip items that existed before the listener was attached (avoid double-processing)
        if (createdAt && createdAt < cutoffTime) {
          console.log('[Firebase] Skipping pre-existing child_added:', snapshot.key, createdAt, '<', cutoffTime);
          return;
        }
        item.id = snapshot.key;
        callback([item]);
      });
      return { detach: function() { self.db.ref('pending_players').off('child_added'); } };
    },

    removePendingRegistration: function(pendingId, callback) {
      if (!this.isConfigured) {
        // Remove from localStorage pending list
        var pending = JSON.parse(localStorage.getItem('baseai_pending_players') || '[]');
        var filtered = pending.filter(function(p) {
          return (p.id || p._local_id) !== pendingId;
        });
        localStorage.setItem('baseai_pending_players', JSON.stringify(filtered));
        setTimeout(function(){ if(callback) callback({ success: true }); }, 0);
        return;
      }
      // Remove from Firebase
      this.db.ref('pending_players/' + pendingId).remove()
        .then(function() {
          console.log('[Firebase] Removed pending registration:', pendingId);
          if (callback) callback({ success: true });
        })
        .catch(function(e) {
          console.error('[Firebase] removePendingRegistration error:', e);
          if (callback) callback({ success: false, error: e });
        });
    },

    approveRegistration: function(pendingId, callback) {
      var self = this;
      this.getPendingRegistrations(function(result) {
        var pending = result.data.find(function(p){ return p.id === pendingId; });
        if (!pending) {
          if (callback) callback({ success: false, error: 'Not found' });
          return;
        }
        var playerData = Object.assign({}, pending);
        delete playerData.id;
        delete playerData.submittedAt;
        delete playerData.status;
        delete playerData.source;
        playerData.status = 'pending';

        self.addPlayer(playerData, function() {
          self.db.ref('pending_players/' + pendingId).remove();
          if (callback) callback({ success: true });
        });
      });
    },

    rejectRegistration: function(pendingId, callback) {
      if (!this.isConfigured) {
        var list = JSON.parse(localStorage.getItem('baseai_pending_players') || '[]');
        list = list.filter(function(p){ return p.id !== pendingId; });
        localStorage.setItem('baseai_pending_players', JSON.stringify(list));
        setTimeout(function(){ if(callback) callback({ success: true }); }, 0);
        return;
      }
      this.db.ref('pending_players/' + pendingId).remove().then(function() {
        if (callback) callback({ success: true });
      }).catch(function(e) {
        console.error('[Firebase] rejectRegistration error:', e);
        if (callback) callback({ success: false, error: e });
      });
    },

    // ── Seed demo data ──────────────────────────────────────
    seedDemoPlayers: function(callback) {
      var demoPlayers = [
        { name: '罗莀安', gender: '女', birth_year: 2015, school: '香港国际学校', grade: 'G4', positions: ['投手', '外野手'], contact_name: '罗哥', phone_main: '98765432', relationship: '父亲', status: 'active', club: '香港棒垒球总会 U12', hkab_id: 'HKBA-2024-0001', batting_hand: '右', throwing_hand: '右', height_cm: 138, weight_kg: 34, notes: '左手投手，有潜力', photo: null },
        { name: '陈伟豪', gender: '男', birth_year: 2014, school: '拔萃男书院附属小学', grade: 'G5', positions: ['捕手', '一垒手'], contact_name: '陈太强', phone_main: '91234567', relationship: '父亲', status: 'active', club: '香港棒垒球总会 U12', hkab_id: 'HKBA-2024-0002', batting_hand: '右', throwing_hand: '右', height_cm: 145, weight_kg: 42, notes: '捕手位置稳定', photo: null },
        { name: '张芷晴', gender: '女', birth_year: 2015, school: '协恩中学附属小学', grade: 'G4', positions: ['游击手', '三垒手'], contact_name: '张太', phone_main: '98761234', relationship: '母亲', status: 'active', club: '九龙青少棒', hkab_id: 'HKBA-2024-0003', batting_hand: '左', throwing_hand: '右', height_cm: 136, weight_kg: 32, notes: '防守意识好', photo: null },
        { name: '林志杰', gender: '男', birth_year: 2013, school: '圣若瑟书院', grade: 'G6', positions: ['投手', '一垒手'], contact_name: '林先生', phone_main: '97876543', relationship: '父亲', status: 'active', club: '香港棒垒球总会 U14', hkab_id: 'HKBA-2024-0004', batting_hand: '右', throwing_hand: '右', height_cm: 158, weight_kg: 55, notes: '球速达75mph', photo: null },
        { name: '王雨萱', gender: '女', birth_year: 2015, school: '香港真光中学附属小学', grade: 'G4', positions: ['外野手', '指定打击'], contact_name: '王太', phone_main: '96543210', relationship: '母亲', status: 'active', club: '九龙青少棒', hkab_id: 'HKBA-2024-0005', batting_hand: '右', throwing_hand: '左', height_cm: 133, weight_kg: 30, notes: '跑垒速度快', photo: null },
        { name: '刘家豪', gender: '男', birth_year: 2014, school: '喇沙小学', grade: 'G5', positions: ['二垒手', '游击手'], contact_name: '刘太', phone_main: '93456789', relationship: '母亲', status: 'active', club: '香港棒垒球总会 U12', hkab_id: 'HKBA-2024-0006', batting_hand: '右', throwing_hand: '右', height_cm: 141, weight_kg: 38, notes: '击球力量大', photo: null },
        { name: '赵晓婷', gender: '女', birth_year: 2015, school: '嘉诺撒圣心学校', grade: 'G4', positions: ['捕手', '三垒手'], contact_name: '赵先生', phone_main: '90123456', relationship: '父亲', status: 'active', club: '香港棒垒球总会 U12', hkab_id: 'HKBA-2024-0007', batting_hand: '左', throwing_hand: '右', height_cm: 135, weight_kg: 33, notes: '臂力强', photo: null },
        { name: '周浩然', gender: '男', birth_year: 2014, school: '玛利诺修院学校', grade: 'G5', positions: ['投手', '外野手'], contact_name: '周太', phone_main: '92345678', relationship: '母亲', status: 'active', club: '九龙青少棒', hkab_id: 'HKBA-2024-0008', batting_hand: '右', throwing_hand: '右', height_cm: 148, weight_kg: 45, notes: '曲球质量高', photo: null }
      ];

      var self = this;
      var count = 0;
      demoPlayers.forEach(function(player) {
        self.addPlayer(player, function(res) {
          count++;
          if (count === demoPlayers.length && callback) callback();
        });
      });
    },

    // ── Teams ──────────────────────────────────────────────

    getTeams: function(callback) {
      if (!this.isConfigured) {
        var data = JSON.parse(localStorage.getItem('baseai_teams') || '[]');
        setTimeout(function(){ callback({ data: data }); }, 0);
        return;
      }
      this.db.ref('teams').once('value').then(function(snapshot) {
        var data = [];
        snapshot.forEach(function(child) {
          var item = child.val();
          item.id = child.key;
          data.push(item);
        });
        callback({ data: data });
      }).catch(function(error) {
        console.error('[Firebase] getTeams error:', error);
        callback({ data: [] });
      });
    },

    upsertTeam: function(teamData, callback) {
      if (!this.isConfigured) {
        var teams = JSON.parse(localStorage.getItem('baseai_teams') || '[]');
        if (teamData.id || teamData.team_id) {
          var id = teamData.id || teamData.team_id;
          var idx = teams.findIndex(function(t){ return (t.id||t.team_id) === id; });
          if (idx >= 0) teams[idx] = Object.assign({}, teams[idx], teamData);
          else teams.push(Object.assign({}, teamData, { id: id }));
        } else {
          var newId = 'T' + Date.now();
          teams.push(Object.assign({}, teamData, { id: newId, team_id: newId }));
        }
        localStorage.setItem('baseai_teams', JSON.stringify(teams));
        setTimeout(function(){ if(callback) callback({ success: true }); }, 0);
        return;
      }
      var id = teamData.id || teamData.team_id;
      if (id) {
        this.db.ref('teams/' + id).update(teamData).then(function() {
          if (callback) callback({ success: true });
        }).catch(function(e) {
          console.error('[Firebase] upsertTeam error:', e);
          if (callback) callback({ success: false, error: e });
        });
      } else {
        var newRef = this.db.ref('teams').push();
        teamData.team_id = newRef.key;
        newRef.set(teamData).then(function() {
          if (callback) callback({ success: true, id: newRef.key });
        }).catch(function(e) {
          console.error('[Firebase] upsertTeam error:', e);
          if (callback) callback({ success: false, error: e });
        });
      }
    },

    deleteTeam: function(id, callback) {
      if (!this.isConfigured) {
        var teams = JSON.parse(localStorage.getItem('baseai_teams') || '[]');
        teams = teams.filter(function(t){ return (t.id||t.team_id) !== id; });
        localStorage.setItem('baseai_teams', JSON.stringify(teams));
        setTimeout(function(){ if(callback) callback({ success: true }); }, 0);
        return;
      }
      this.db.ref('teams/' + id).remove().then(function() {
        if (callback) callback({ success: true });
      }).catch(function(e) {
        console.error('[Firebase] deleteTeam error:', e);
        if (callback) callback({ success: false, error: e });
      });
    }
  };
})();

