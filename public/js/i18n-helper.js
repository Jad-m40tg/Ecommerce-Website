/* i18n-helper.js — data-i18n attribute helper
 *
 * Supported attributes:
 *   data-i18n="common.nav_home"                 → set element innerHTML to t(key)
 *   data-i18n-attr="placeholder:cart.email;aria-label:cart.email_label"
 *                                               → set those attrs to t(key)
 *
 * Debug mode (?i18nDebug=1 or localStorage i18nDebug=1) adds a title
 * attribute showing the raw key over every element it translates.
 */
(function () {
  function hasOwn(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
  }

  var isDebug = false;
  try {
    isDebug = /i18nDebug=1/.test(window.location.search) || localStorage.getItem('i18nDebug') === '1';
  } catch (e) {}

  function translateElement(el) {
    if (!el || !window.i18n) return;
    var key = el.getAttribute('data-i18n');
    if (!key || !hasOwn(window.i18n, key)) return;
    el.innerHTML = window.i18n(key);
    if (isDebug) el.setAttribute('title', key);
  }

  function apply(callback) {
    if (!window.i18n) return;
    var nodes = document.querySelectorAll('[data-i18n]');
    for (var i = 0; i < nodes.length; i++) translateElement(nodes[i]);

    var attrNodes = document.querySelectorAll('[data-i18n-attr]');
    for (var a = 0; a < attrNodes.length; a++) {
      var node = attrNodes[a];
      var spec = (node.getAttribute('data-i18n-attr') || '').split(';');
      for (var j = 0; j < spec.length; j++) {
        var kv = spec[j].split('=');
        if (kv.length < 2) continue;
        var attr = kv[0].trim();
        var key = kv.slice(1).join('=').trim();
        if (!attr || !key) continue;
        node.setAttribute(attr, window.i18n(key));
      }
    }

    if (typeof callback === 'function') callback();
  }

  function observe() {
    var root = document.body;
    if (!root || !window.MutationObserver) return;
    var mo = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var m = mutations[i];
        for (var n = 0; n < m.addedNodes.length; n++) {
          var node = m.addedNodes[n];
          if (node.nodeType !== 1) continue;
          if (node.hasAttribute && node.hasAttribute('data-i18n')) translateElement(node);
          var inner = node.querySelectorAll ? node.querySelectorAll('[data-i18n]') : [];
          for (var k = 0; k < inner.length; k++) translateElement(inner[k]);
        }
      }
    });
    mo.observe(root, { childList: true, subtree: true });
  }

  window.BoularasI18n = Object.assign(window.BoularasI18n || {}, {
    i18nHelper: {
      apply: apply,
      translateElement: translateElement
    }
  });

  setTimeout(observe, 0);
})();
