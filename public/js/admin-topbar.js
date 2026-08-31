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
      if (r.status === 401 || r.status === 403) { localStorage.removeItem('admin_token'); window.location.href = 'admin-login.html'; throw new Error(window.i18n ? window.i18n('admin:topbar.unauthorized') : 'Unauthorized'); }
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

  /* --- Keyboard operability: .admin-chip is a role="button" div --- */
  var chipEl = document.querySelector('.admin-chip');
  if (chipEl) {
    chipEl.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      chipEl.click();
    });
  }

  /* --- Notifications --- */
  var notifPanel = document.getElementById('notifPanel');
  var notifBtn = document.getElementById('notifBtn');
  var notifBody = document.getElementById('notifBody');
  var notifDot = document.getElementById('notifDot');
  var notifClear = document.getElementById('notifClear');

  if (!notifBtn || !notifPanel) return;

  // Accessibility: expose the panel toggle state to assistive tech.
  notifBtn.setAttribute('aria-expanded', 'false');
  notifBtn.setAttribute('aria-controls', notifPanel.id || 'notifPanel');
  notifPanel.setAttribute('role', 'region');
  notifPanel.setAttribute('aria-label', window.i18n ? window.i18n('admin:topbar.notifications') : 'Notifications');
  notifPanel.setAttribute('aria-live', 'polite');

  var seenNotifs = JSON.parse(localStorage.getItem('seen_notifs') || '[]');

  var DISMISS_KEY = 'boularas-dismissed-notifs';
  var DISMISS_MAX = 300;

  function loadDismissed() {
    var arr = [];
    try { arr = JSON.parse(localStorage.getItem(DISMISS_KEY) || '[]'); } catch (e) {}
    return arr;
  }

  function saveDismissed(arr) {
    if (arr.length > DISMISS_MAX) arr = arr.slice(arr.length - DISMISS_MAX);
    localStorage.setItem(DISMISS_KEY, JSON.stringify(arr));
  }

  function dismissNotif(key) {
    var arr = loadDismissed();
    if (arr.indexOf(key) === -1) arr.push(key);
    saveDismissed(arr);
  }

  var TRUCK_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 3h15v13H1z"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>';

  // Same visual language as the customer-side payment status: check_circle (confirmed)
  // and cancel (failed/cancelled) from Material Symbols.
  var CHECK_CIRCLE_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m8 12 2.5 2.5L16 9"/></svg>';
  var CANCEL_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>';

  function t(key, opts) {
    return window.i18n ? window.i18n(key, opts) : key;
  }

  function timeAgo(dateStr) {
    if (!dateStr) return '—';
    var d = new Date(dateStr.replace(' ', 'T') + 'Z').getTime();
    if (isNaN(d)) return '—';
    var diff = Date.now() - d;
    var mins = Math.floor(diff / 60000);
    if (mins < 1) return t('admin:topbar.just_now');
    if (mins < 60) return t('admin:topbar.mins_ago', { count: mins });
    var hrs = Math.floor(mins / 60);
    if (hrs < 24) return t('admin:topbar.hrs_ago', { count: hrs });
    return t('admin:topbar.days_ago', { count: Math.floor(hrs / 24) });
  }

  function loadNotifications() {
    var dismissed = loadDismissed();
    apiFetch('/api/orders?limit=9999').then(function (data) {
      var orders = data.orders || data || [];
      var notifs = [];
      orders.slice(0, 20).forEach(function (o) {
        var key = 'order_' + o.id + '_' + o.order_status;
        var icon;
        if (o.order_status === 'pending') icon = '&#9888;';
        else if (o.order_status === 'shipped') icon = TRUCK_SVG;
        else if (o.order_status === 'delivered') icon = '<span style="color:var(--sage);display:flex;align-items:center;justify-content:center">' + CHECK_CIRCLE_SVG + '</span>';
        else if (o.order_status === 'confirmed') icon = '<span style="color:var(--sage);display:flex;align-items:center;justify-content:center">' + CHECK_CIRCLE_SVG + '</span>';
        else if (o.order_status === 'cancelled') icon = '<span style="color:var(--danger);display:flex;align-items:center;justify-content:center">' + CANCEL_SVG + '</span>';
        else icon = '&#9679;';
        var cname = escapeHtml(o.customer_name || t('admin:topbar.customer'));
        var ost = t('admin:order.status.' + (o.order_status || 'pending'));
        notifs.push({ key: key, icon: icon, text: '<strong>#' + (o.id || '').toString().slice(0, 8) + '</strong> ' + cname + ' - ' + ost, time: o.created_at, orderId: o.id });
      });
      var visible = notifs.filter(function (n) { return dismissed.indexOf(n.key) === -1; });
      var unseen = visible.filter(function (n) { return seenNotifs.indexOf(n.key) === -1; });
      if (notifDot) notifDot.style.display = unseen.length > 0 ? 'block' : 'none';
      if (visible.length === 0) {
        notifBody.innerHTML = '<div class="notif-empty">' + t('admin:topbar.no_notifications_yet') + '</div>';
      } else {
        notifBody.innerHTML = visible.map(function (n) {
          return '<div class="notif-item" data-key="' + n.key + '" data-id="' + n.orderId + '" style="cursor:pointer"><div class="notif-main" role="button" tabindex="0" title="' + t('admin:topbar.open_order') + '" style="display:flex;gap:10px;flex:1;min-width:0;align-items:flex-start"><div class="notif-icon">' + n.icon + '</div><div><div class="notif-text">' + n.text + '</div><div class="notif-time">' + timeAgo(n.time) + '</div></div></div><button type="button" class="notif-dismiss" data-dismiss="' + n.key + '" aria-label="' + t('admin:topbar.dismiss_notification') + '" title="' + t('admin:topbar.dismiss_notification') + '" style="background:none;border:none;color:var(--gray);cursor:pointer;font-size:14px;line-height:1;padding:2px 6px;margin-left:auto;align-self:flex-start">&times;</button></div>';
        }).join('');
      }
    }).catch(function () {});
  }

  notifBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    var isOpen = notifPanel.style.display !== 'none';
    notifPanel.style.display = isOpen ? 'none' : 'flex';
    notifBtn.setAttribute('aria-expanded', isOpen ? 'false' : 'true');
    if (!isOpen) {
      notifBody.querySelectorAll('.notif-item').forEach(function (item) {
        var key = item.getAttribute('data-key');
        if (key && seenNotifs.indexOf(key) === -1) seenNotifs.push(key);
      });
      localStorage.setItem('seen_notifs', JSON.stringify(seenNotifs));
      if (notifDot) notifDot.style.display = 'none';
      // Keyboard activation (detail === 0): move focus into the panel
      if (e.detail === 0) {
        var firstFocusable = notifBody.querySelector('.notif-main') || notifClear;
        if (firstFocusable) firstFocusable.focus();
      }
    }
  });

  notifBody.addEventListener('click', function (e) {
    var dismissBtn = e.target.closest('.notif-dismiss');
    if (dismissBtn) {
      var key = dismissBtn.getAttribute('data-dismiss');
      if (key) dismissNotif(key);
      var itemEl = dismissBtn.closest('.notif-item');
      if (itemEl) itemEl.remove();
      if (notifDot) {
        var hasUnseen = false;
        notifBody.querySelectorAll('.notif-item').forEach(function (el) {
          var k = el.getAttribute('data-key');
          if (k && seenNotifs.indexOf(k) === -1) hasUnseen = true;
        });
        notifDot.style.display = hasUnseen ? 'block' : 'none';
      }
      return;
    }
    var item = e.target.closest('.notif-item');
    if (!item) return;
    var id = item.getAttribute('data-id');
    if (id) {
      window.location.href = 'admin-orders.html?order=' + id;
    }
  });

  notifBody.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    if (e.target.closest('.notif-dismiss')) return; // real button handles its own keys
    var item = e.target.closest('.notif-item');
    if (!item) return;
    e.preventDefault();
    var id = item.getAttribute('data-id');
    if (id) window.location.href = 'admin-orders.html?order=' + id;
  });

  if (notifClear) {
    notifClear.addEventListener('click', function () {
      var dismissed = loadDismissed();
      notifBody.querySelectorAll('.notif-item').forEach(function (item) {
        var key = item.getAttribute('data-key');
        if (key && dismissed.indexOf(key) === -1) dismissed.push(key);
        if (key && seenNotifs.indexOf(key) === -1) seenNotifs.push(key);
      });
      saveDismissed(dismissed);
      localStorage.setItem('seen_notifs', JSON.stringify(seenNotifs));
      if (notifDot) notifDot.style.display = 'none';
      notifBody.innerHTML = '<div class="notif-empty">' + t('admin:topbar.no_new_notifications') + '</div>';
    });
  }

  document.addEventListener('click', function () { notifPanel.style.display = 'none'; notifBtn.setAttribute('aria-expanded', 'false'); });
  notifPanel.addEventListener('click', function (e) { e.stopPropagation(); });

  // Escape closes the notif panel and returns focus to the trigger.
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && notifPanel.style.display !== 'none') {
      notifPanel.style.display = 'none';
      notifBtn.setAttribute('aria-expanded', 'false');
      notifBtn.focus();
    }
  });

  if (window.i18n) loadNotifications();
  else window.addEventListener('i18n:ready', loadNotifications, { once: true });
  window.addEventListener('i18n:changed', loadNotifications);
})();
