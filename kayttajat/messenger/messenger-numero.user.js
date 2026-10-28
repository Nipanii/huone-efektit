// ==UserScript==
// @name         kupla: Messenger-numero näkyy värillisenä
// @namespace    kupla
// @version      0.2.1
// @description  Työkalupalkin Viestit-ikonin lukemattomien numero ei harmaannu ikonin mukana vaan näkyy punaisena.
// @match        https://kupla.cc/*
// @grant        none
// @run-at       document-idle
// @kupla-oletus on
// ==/UserScript==
// kp 2026-10-15 04:03 "tee mun clienttii se et messenger notifikaatio numeros on värit". Syy (ticket #76): .icon-message on filter: grayscale(1),
//   ja punainen numero (.km-toolbar-count) on ikonin lapsi, joten suodatin harmaannuttaa sen mukana eikä lapsi voi kumota vanhemman suodatinta.
// 0.2.0 (kp 2026-10-15 08:45 "heittää ulos kun hyväksyn kaverin"): 0.1.0 SIIRSI Reactin omistaman numero-solmun ikonin sisältä sen
//   ulkopuolelle. Kun numero poistui (pyyntö hyväksyttiin/hylättiin -> 1 -> 0) React kutsui ikoni.removeChild(numero), mutta solmu oli jo
//   toisen vanhemman lapsi -> NotFoundError 'removeChild' -> koko näkymä kaatui ("Kupla ei pystynyt näyttämään tätä näkymää").
//   Toistettu kp:n clientissä 3/3 lisäosat päällä, 0/1 kun kaikki pois (tmp/kp-klikki2.js + loaderin puhdas-tila).
//   NYT: Reactin solmuun EI koske kukaan; se piilotetaan paikallaan ja numero näytetään omassa kopiossa ikonin ulkopuolella.
(() => {
  if (window.__kuplaMessengerNumero) return;
  if (!document.getElementById('kmn-tyyli')) {
    const s = document.createElement('style'); s.id = 'kmn-tyyli';
    s.textContent = '.toolbar-messenger-control{position:relative}' +
      '.toolbar-messenger-control .icon-message .km-toolbar-count{visibility:hidden}' +
      '.toolbar-messenger-control > .kmn-luku{position:absolute;top:0;right:4px;z-index:5;pointer-events:none;filter:none}';
    document.head.appendChild(s);
  }
  const paivita = () => {
    const kontrolli = document.querySelector('.toolbar-messenger-control');
    if (!kontrolli) return;
    const alkup = kontrolli.querySelector('.icon-message .km-toolbar-count');
    let kopio = kontrolli.querySelector(':scope > .kmn-luku');
    if (!alkup) { if (kopio) kopio.remove(); return; }
    if (!kopio) { kopio = document.createElement('span'); kopio.className = alkup.className.replace('km-toolbar-count', '').trim() + ' km-toolbar-count kmn-luku'; kontrolli.appendChild(kopio); }
    if (kopio.textContent !== alkup.textContent) kopio.textContent = alkup.textContent;
  };
  paivita();
  // 0.2.1: pois() hot-updatea varten (moottorin kayttajaskriptit, kp 28.10. "eikä tarvii f5").
  const havaitsija = new MutationObserver(paivita);
  havaitsija.observe(document.body, { childList: true, subtree: true, characterData: true });
  window.__kuplaMessengerNumero = { versio: '0.2.1', pois() { havaitsija.disconnect(); document.querySelectorAll('.kmn-luku').forEach(n => n.remove()); const s = document.getElementById('kmn-tyyli'); if (s) s.remove(); delete window.__kuplaMessengerNumero; } };
})();
