// ============================================================
//  DB Layer - BaseAI 棒球管理系统
//  所有数据操作通过 FirebaseService 统一管理
//  （无 Firebase 时自动降级到 localStorage）
// ============================================================

var DB = {
  _initialized: false,

  init: function(callback) {
    var self = this;
    FirebaseService.init(function(ok) {
      self._initialized = true;
      console.log('[DB] Initialized, Firebase:', FirebaseService.isConfigured ? 'ONLINE' : 'OFFLINE (localStorage)');

      // If Firebase is online, sync demo data
      if (FirebaseService.isConfigured) {
        FirebaseService.getPlayers(function(result) {
          if (!result.data || result.data.length === 0) {
            console.log('[DB] No players in Firebase, seeding demo data...');
            FirebaseService.seedDemoPlayers(function() {
              console.log('[DB] Demo data seeded');
              if (callback) callback();
            });
          } else {
            console.log('[DB] Firebase has', result.data.length, 'players');
            if (callback) callback();
          }
        });
      } else {
        // localStorage fallback: seed if empty
        var local = localStorage.getItem('baseai_players');
        if (!local || JSON.parse(local).length === 0) {
          console.log('[DB] localStorage empty, seeding demo data...');
          FirebaseService.seedDemoPlayers(function() {
            if (callback) callback();
          });
        } else {
          if (callback) callback();
        }
      }
    });
  },

  // ── Players ──────────────────────────────────────────────

  getPlayers: function(callback) {
    FirebaseService.getPlayers(callback);
  },

  getPlayer: function(id, callback) {
    FirebaseService.getPlayer(id, callback);
  },

  addPlayer: function(data, callback) {
    FirebaseService.addPlayer(data, callback);
  },

  updatePlayer: function(id, data, callback) {
    FirebaseService.updatePlayer(id, data, callback);
  },

  deletePlayer: function(id, callback) {
    FirebaseService.deletePlayer(id, callback);
  },

  upsertPlayer: function(data, callback) {
    FirebaseService.upsertPlayer(data, callback);
  },

  // ── Pending Registrations ────────────────────────────────

  getPendingRegistrations: function(callback) {
    FirebaseService.getPendingRegistrations(callback);
  },

  onPendingRegistrations: function(callback) {
    return FirebaseService.onPendingRegistrations(callback);
  },

  removePendingRegistration: function(id, callback) {
    FirebaseService.removePendingRegistration(id, callback);
  },

  submitRegistration: function(data, callback) {
    FirebaseService.submitRegistration(data, callback);
  },

  approveRegistration: function(pendingId, callback) {
    FirebaseService.approveRegistration(pendingId, callback);
  },

  rejectRegistration: function(pendingId, callback) {
    FirebaseService.rejectRegistration(pendingId, callback);
  },

  // ── Teams ──────────────────────────────────────────────

  getTeams: function(callback) {
    FirebaseService.getTeams(callback);
  },

  upsertTeam: function(data, callback) {
    FirebaseService.upsertTeam(data, callback);
  },

  deleteTeam: function(id, callback) {
    FirebaseService.deleteTeam(id, callback);
  }
};
