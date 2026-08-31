/* i18n-init.js — i18next bootstrap for Boularas
 *
 * - Loads i18next + http-backend (vendored, no languagedetector by design)
 * - Read initial language from the existing language.js getLang()
 * - dir is ALWAYS "ltr". Never introduce RTL.
 * - Uses the ?v=N cache-busting convention for the backend loadPath.
 */
(function () {
  function getLang() {
    try {
      if (window.BoularasI18n && typeof window.BoularasI18n.getLang === 'function') {
        return window.BoularasI18n.getLang();
      }
    } catch (e) {}
    try {
      var v = localStorage.getItem('boularas_lang');
      return (v === 'ar' || v === 'fr' || v === 'en') ? v : 'en';
    } catch (e) {}
    return 'en';
  }

  function currentNamespace() {
    var path = window.location.pathname;
    if (/\/admin/i.test(path)) return 'admin';
    return 'customer';
  }

  document.documentElement.setAttribute('dir', 'ltr');
  document.documentElement.setAttribute('lang', getLang());

  var isDebug = false;
  try {
    isDebug = /i18nDebug=1/.test(window.location.search) || localStorage.getItem('i18nDebug') === '1';
  } catch (e) {}

  function hasOwn(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
  }

  function applyToElement(el, key) {
    var val = window.i18n.t(key);
    el.innerHTML = val;
    if (isDebug) {
      el.setAttribute('title', key);
    }
  }

  function applyAttrs() {
    var nodes = document.querySelectorAll('[data-i18n-attr]');
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      var spec = (node.getAttribute('data-i18n-attr') || '').split(';');
      for (var j = 0; j < spec.length; j++) {
        var kv = spec[j].split('=');
        if (kv.length < 2) continue;
        var attr = kv[0].trim();
        var key = kv.slice(1).join('=').trim();
        if (!attr || !key) continue;
        node.setAttribute(attr, window.i18n.t(key));
      }
    }
  }

  function apply() {
    if (!window.i18n) return;
    var nodes = document.querySelectorAll('[data-i18n]');
    for (var i = 0; i < nodes.length; i++) {
      applyToElement(nodes[i], nodes[i].getAttribute('data-i18n'));
    }
    applyAttrs();
  }

  function init() {
    window.i18next
      .use(window.i18nextHttpBackend)
      .init({
        backend: {
          loadPath: '/locales/{{lng}}/{{ns}}.json?v=1'
        },
        fallbackLng: 'en',
        lng: getLang(),
        ns: ['common', currentNamespace()],
        defaultNS: 'common',
        initImmediate: false,
        interpolation: {
          escapeValue: false
        }
      })
      .then(function () {
        window.i18n = window.i18next.t;
        apply();
      })
      .catch(function () {
        window.i18n = window.i18next.t;
      });
  }

  window.BoularasI18n = Object.assign(window.BoularasI18n || {}, {
    apply: apply,
    applyToElement: applyToElement
  });

  init();
})();
