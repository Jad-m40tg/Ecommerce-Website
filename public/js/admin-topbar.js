/* admin-topbar.js — Shared notification, avatar, and admin name logic for all admin pages */
(function () {
  var token = localStorage.getItem('admin_token');
  if (!token) return;

  function authHeaders() {
    return { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' };
  }
  function apiFetch(url, opts) {
    opts = opts || {};
    opts.headers = Object.assign(authHeaders(), opts.headers || {});
    return fetch(url, opts).then(function (r) {
      if (r.status === 401 || r.status === 403) { localStorage.removeItem('admin_token'); window.location.href = 'admin-login.html'; throw new Error('Unauthorized'); }
      return r.json();
    });
  }

  /* --- Admin name & avatar --- */
  var nameEl = document.getElementById('adminName');
  var avatarEl = document.querySelector('.admin-chip .avatar');

  apiFetch('/api/auth/me').then(function (data) {
    var user = data.admin || data.user || data;
    if (user && user.name) {
      if (nameEl) nameEl.textContent = user.name.split(' ')[0];
      if (avatarEl) {
        var parts = user.name.trim().split(/\s+/);
        var initials = parts.length >= 2
          ? (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase()
          : parts[0].charAt(0).toUpperCase();
        avatarEl.textContent = initials;
      }
    }
  }).catch(function () {});

  /* --- Notifications --- */
  var notifPanel = document.getElementById('notifPanel');
  var notifBtn = document.getElementById('notifBtn');
  var notifBody = document.getElementById('notifBody');
  var notifDot = document.getElementById('notifDot');
  var notifClear = document.getElementById('notifClear');

  if (!notifBtn || !notifPanel) return;

  var seenNotifs = JSON.parse(localStorage.getItem('seen_notifs') || '[]');

  var TRUCK_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 3h15v13H1z"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>';

  function timeAgo(dateStr) {
    var diff = Date.now() - new Date(dateStr).getTime();
    var mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return mins + 'm ago';
    var hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + 'h ago';
    return Math.floor(hrs / 24) + 'd ago';
  }

  function loadNotifications() {
    apiFetch('/api/orders?limit=9999').then(function (data) {
      var orders = data.orders || data || [];
      var notifs = [];
      orders.slice(0, 20).forEach(function (o) {
        var key = 'order_' + o.id + '_' + o.order_status;
        var icon;
        if (o.order_status === 'pending') icon = '&#9888;';
        else if (o.order_status === 'shipped') icon = TRUCK_SVG;
        else if (o.order_status === 'delivered') icon = '&#10003;';
        else icon = '&#9679;';
        notifs.push({ key: key, icon: icon, text: '<strong>#' + (o.id || '').toString().slice(0, 8) + '</strong> ' + escapeHtml(o.customer_name || 'Customer') + ' — ' + (o.order_status || 'pending'), time: o.created_at });
      });
      var unseen = notifs.filter(function (n) { return seenNotifs.indexOf(n.key) === -1; });
      if (notifDot) notifDot.style.display = unseen.length > 0 ? 'block' : 'none';
      if (notifs.length === 0) {
        notifBody.innerHTML = '<div class="notif-empty">No notifications yet</div>';
      } else {
        notifBody.innerHTML = notifs.map(function (n) {
          return '<div class="notif-item" data-key="' + n.key + '"><div class="notif-icon">' + n.icon + '</div><div><div class="notif-text">' + n.text + '</div><div class="notif-time">' + timeAgo(n.time) + '</div></div></div>';
        }).join('');
      }
    }).catch(function () {});
  }

  notifBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    var isOpen = notifPanel.style.display !== 'none';
    notifPanel.style.display = isOpen ? 'none' : 'flex';
    if (!isOpen) {
      notifBody.querySelectorAll('.notif-item').forEach(function (item) {
        var key = item.getAttribute('data-key');
        if (seenNotifs.indexOf(key) === -1) seenNotifs.push(key);
      });
      localStorage.setItem('seen_notifs', JSON.stringify(seenNotifs));
      if (notifDot) notifDot.style.display = 'none';
    }
  });

  if (notifClear) {
    notifClear.addEventListener('click', function () {
      notifBody.querySelectorAll('.notif-item').forEach(function (item) {
        var key = item.getAttribute('data-key');
        if (seenNotifs.indexOf(key) === -1) seenNotifs.push(key);
      });
      localStorage.setItem('seen_notifs', JSON.stringify(seenNotifs));
      if (notifDot) notifDot.style.display = 'none';
      notifBody.innerHTML = '<div class="notif-empty">No new notifications</div>';
    });
  }

  document.addEventListener('click', function () { notifPanel.style.display = 'none'; });
  notifPanel.addEventListener('click', function (e) { e.stopPropagation(); });

  loadNotifications();
})();
