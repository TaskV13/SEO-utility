/**
 * Tells cateyetech.com's own visit log that someone opened a public page (Admin > Analytics & SEO there).
 * Only the listed addresses, only on this site's real address, no cookies. Signed-in screens never load this file.
 */
(function () {
  var PUBLIC_PAGES = ['/', '/home', '/signup', '/try', '/apps'];
  if (location.hostname !== 'support.cateyetech.com' || PUBLIC_PAGES.indexOf(location.pathname) < 0) return;
  fetch('https://cateyetech.com/api/collect/', {
    method: 'POST', mode: 'cors', credentials: 'omit', keepalive: true,
    body: JSON.stringify({ k: 'pageview', p: location.pathname, r: document.referrer, u: new URLSearchParams(location.search).get('utm_source') || '' }),
  }).catch(function () {});
})();
