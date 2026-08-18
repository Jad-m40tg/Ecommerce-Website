/* admin-mobile-nav.js — shared off-canvas drawer behavior for admin pages (<=860px).
   Requires: .admin-drawer-toggle button in .topbar, aside.sidebar, .admin-drawer-backdrop. */
(function () {
  var toggle = document.querySelector('.admin-drawer-toggle');
  var sidebar = document.querySelector('.sidebar');
  if (!toggle || !sidebar) return;
  var backdrop = document.querySelector('.admin-drawer-backdrop');

  function open() {
    sidebar.classList.add('open');
    if (backdrop) backdrop.classList.add('open');
    document.body.classList.add('drawer-open');
    toggle.setAttribute('aria-expanded', 'true');
    toggle.setAttribute('aria-label', 'Close menu');
  }

  function close() {
    sidebar.classList.remove('open');
    if (backdrop) backdrop.classList.remove('open');
    document.body.classList.remove('drawer-open');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Open menu');
  }

  toggle.addEventListener('click', function () {
    if (sidebar.classList.contains('open')) close();
    else open();
  });

  if (backdrop) backdrop.addEventListener('click', close);

  sidebar.querySelectorAll('a').forEach(function (link) {
    link.addEventListener('click', close);
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') close();
  });

  window.addEventListener('resize', function () {
    if (window.innerWidth > 860) close();
  });
})();
