/* footer.js — Dynamically updates footer contact info from settings API */
(function () {
  fetch('/api/settings').then(function (r) { return r.json(); }).then(function (data) {
    var s = data.settings || data || {};
    if (s.store_name) {
      document.querySelectorAll('.footer .brand').forEach(function (el) {
        el.innerHTML = s.store_name.replace(/\w+/, '<span>$&</span>');
      });
    }
    if (s.contact_email) {
      document.querySelectorAll('.footer-contact-email').forEach(function (el) { el.textContent = s.contact_email; });
    }
    if (s.contact_phone) {
      document.querySelectorAll('.footer-contact-phone').forEach(function (el) { el.textContent = s.contact_phone; });
    }
    if (s.store_address) {
      document.querySelectorAll('.footer-contact-address').forEach(function (el) { el.textContent = s.store_address; });
    }
  }).catch(function () {});
})();
