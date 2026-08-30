(function () {
  var STORAGE_KEY = 'boularas_lang';
  var LANGUAGES = ['en', 'fr', 'ar'];
  var NAMES = { en: 'English', fr: 'Français', ar: 'العربية' };
  var listeners = [];
  var current = localStorage.getItem(STORAGE_KEY) || 'en';
  if (LANGUAGES.indexOf(current) === -1) current = 'en';

  function setLang(code) {
    if (LANGUAGES.indexOf(code) === -1) return;
    current = code;
    localStorage.setItem(STORAGE_KEY, code);
    document.documentElement.setAttribute('lang', code);
    syncLabels();
    listeners.forEach(function (cb) {
      try { cb(code); } catch (e) {}
    });
  }

  function getLang() { return current; }

  function onChange(cb) {
    if (typeof cb === 'function') listeners.push(cb);
  }

  function syncLabels() {
    var labels = document.querySelectorAll('[data-lang-label]');
    for (var i = 0; i < labels.length; i++) labels[i].textContent = current.toUpperCase();
    var options = document.querySelectorAll('[data-lang-switcher] .lang-option');
    for (var j = 0; j < options.length; j++) {
      options[j].classList.toggle('active', options[j].getAttribute('data-lang') === current);
    }
    var mobileBtns = document.querySelectorAll('[data-lang-switcher-mobile] .lang-mobile-btn');
    for (var k = 0; k < mobileBtns.length; k++) {
      mobileBtns[k].classList.toggle('active', mobileBtns[k].getAttribute('data-lang') === current);
    }
    var menus = document.querySelectorAll('[data-lang-menu]');
    for (var m = 0; m < menus.length; m++) menus[m].classList.remove('open');
    var toggles = document.querySelectorAll('[data-lang-toggle]');
    for (var t = 0; t < toggles.length; t++) toggles[t].setAttribute('aria-expanded', 'false');
  }

  function buildDesktop() {
    var actions = document.querySelector('.navbar-actions');
    if (!actions || document.querySelector('[data-lang-switcher]')) return;
    var wrap = document.createElement('div');
    wrap.className = 'lang-switcher';
    wrap.setAttribute('data-lang-switcher', '');
    wrap.innerHTML =
      '<button type="button" class="lang-btn" data-lang-toggle aria-haspopup="true" aria-expanded="false" aria-label="Select language">' +
        '<svg class="lang-globe" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>' +
        '<span class="lang-btn-label" data-lang-label></span>' +
        '<svg class="lang-chev" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>' +
      '</button>' +
      '<div class="lang-menu" data-lang-menu>' +
        LANGUAGES.map(function (code) {
          return '<button type="button" class="lang-option" data-lang="' + code + '">' +
            '<span class="lang-code">' + code.toUpperCase() + '</span><span>' + NAMES[code] + '</span></button>';
        }).join('') +
      '</div>';
    var toggleBtn = wrap.querySelector('[data-lang-toggle]');
    var menu = wrap.querySelector('[data-lang-menu]');
    toggleBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = menu.classList.toggle('open');
      toggleBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    menu.querySelectorAll('.lang-option').forEach(function (opt) {
      opt.addEventListener('click', function (e) {
        e.stopPropagation();
        setLang(opt.getAttribute('data-lang'));
      });
    });
    document.addEventListener('click', function (e) {
      if (!wrap.contains(e.target)) {
        menu.classList.remove('open');
        toggleBtn.setAttribute('aria-expanded', 'false');
      }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        menu.classList.remove('open');
        toggleBtn.setAttribute('aria-expanded', 'false');
      }
    });
    actions.insertBefore(wrap, actions.querySelector('.menu-toggle'));
  }

  function buildMobile() {
    var navLinks = document.getElementById('navLinks');
    if (!navLinks || document.querySelector('[data-lang-switcher-mobile]')) return;
    var li = document.createElement('li');
    li.className = 'lang-switcher-mobile';
    li.setAttribute('data-lang-switcher-mobile', '');
    li.innerHTML = LANGUAGES.map(function (code) {
      return '<button type="button" class="lang-mobile-btn" data-lang="' + code + '">' + code.toUpperCase() + '</button>';
    }).join('');
    li.querySelectorAll('.lang-mobile-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        // On mobile only the currently-active pill is visible; tapping it
        // advances to the next language in the fixed cycle EN -> AR -> FR.
        // We reuse the same setLang() the existing pills call — no new logic.
        if (btn.classList.contains('active')) {
          var cycle = ['en', 'ar', 'fr'];
          var next = cycle[(cycle.indexOf(current) + 1) % cycle.length];
          setLang(next);
        } else {
          // Any non-active pill (not visible on mobile) keeps the old behavior.
          setLang(btn.getAttribute('data-lang'));
        }
      });
    });
    navLinks.appendChild(li);
  }

  document.documentElement.setAttribute('lang', current);
  buildDesktop();
  buildMobile();
  syncLabels();

  // ---- Mobile navbar keyboard a11y fix (all customer pages) ----
  // Addresses: Tab opens the nav but focus stays on the toggle (navLinks is
  // before the toggle in DOM so forward-Tab never reaches it), and arrows
  // did nothing. After open we move focus to first link; arrows cycle
  // freely between all focusable items inside the open panel; Escape
  // closes and returns focus to the toggle.
  (function () {
    var toggle = document.getElementById('menuToggle');
    var navLinks = document.getElementById('navLinks');
    if (!toggle || !navLinks) return;

    // After any click that toggles .open, focus first link when open
    toggle.addEventListener('click', function () {
      // page handler toggles synchronously; check after it
      setTimeout(function () {
        if (navLinks.classList.contains('open')) {
          var first = navLinks.querySelector('a, button');
          if (first) first.focus();
        }
      }, 0);
    });

    // Also allow ArrowDown/Right on the toggle to open and focus
    toggle.addEventListener('keydown', function (e) {
      if ((e.key === 'ArrowDown' || e.key === 'ArrowRight') && !navLinks.classList.contains('open')) {
        e.preventDefault();
        navLinks.classList.add('open');
        toggle.setAttribute('aria-expanded', 'true');
        var first = navLinks.querySelector('a, button');
        if (first) first.focus();
      }
    });

    // Arrow navigation inside the open panel + Escape to close
    document.addEventListener('keydown', function (e) {
      var isNavOpen = navLinks.classList.contains('open');
      var active = document.activeElement;

      // Escape: close and return focus to toggle. Runs even if a per-page
      // handler already removed .open — if focus was inside the panel we
      // still need to return focus to the toggle.
      if (e.key === 'Escape') {
        var wasInsideNav = navLinks.contains(active) || active === toggle;
        if (isNavOpen || wasInsideNav) {
          navLinks.classList.remove('open');
          toggle.setAttribute('aria-expanded', 'false');
          toggle.focus();
          e.stopPropagation();
          return;
        }
      }

      if (!isNavOpen) return;

      // Collect all keyboard-reachable items in the panel (links + mobile lang pills)
      var focusable = Array.prototype.slice.call(navLinks.querySelectorAll('a, button'));
      if (!focusable.length) return;

      var idx = focusable.indexOf(active);

      // If focus is on toggle while panel open, arrows should jump into panel
      if (idx === -1 && active === toggle && (e.key === 'ArrowDown' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowLeft')) {
        e.preventDefault();
        focusable[0].focus();
        return;
      }

      // If focus is inside panel but not directly on a focusable (e.g. li), try closest
      if (idx === -1 && navLinks.contains(active)) {
        var closest = active.closest ? active.closest('a, button') : null;
        if (closest) idx = focusable.indexOf(closest);
      }

      if (idx === -1) return;
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;

      e.preventDefault();
      var next = idx;
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') next = idx + 1;
      else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') next = idx - 1;

      // Wrap freely so user can move “anywhere”
      if (next < 0) next = focusable.length - 1;
      if (next >= focusable.length) next = 0;

      focusable[next].focus();
    });

    // Outside click should also return focus to toggle if it was keyboard opened
    document.addEventListener('click', function (e) {
      if (!navLinks.classList.contains('open')) return;
      if (navLinks.contains(e.target) || toggle.contains(e.target)) return;
      // page handler already removes .open; keep aria in sync
      toggle.setAttribute('aria-expanded', 'false');
    });
  })();

  window.BoularasI18n = {
    getLang: getLang,
    setLang: setLang,
    onChange: onChange
  };
})();