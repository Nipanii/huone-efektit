// ==UserScript==
// @name         kupla: Messenger muistaa kokonsa
// @namespace    kupla
// @version      0.1.0
// @description  Messenger-ikkunan koko (venytetään nurkasta) talteen ja palautetaan kun ikkuna avataan uudelleen.
// @match        https://kupla.cc/*
// @grant        none
// @run-at       document-idle
// @kupla-oletus on
// @kupla-ryhma  Testattavat
// ==/UserScript==
// B137 (kp 28.10. 16:26 + 17:00 "ei muista kokoaan"). Koon antaa selaimen CSS resize: both (NitroCardView.scss:5).
// Clientin oma koon tallennus on kommentoitu pois (NitroCardView.tsx:27-55), joten tallennetaan täällä.
(() => {
  if (window.__kuplaMessengerKoko) return;

  const AVAIN = 'kupla.messenger.koko';
  const KORTTI = '.nitro-card.kupla-messenger';
  const MIN_W = 560, MIN_H = 400;

  let mo = null;          // body: uusi kortti mountataan
  let ro = null;          // koon havainnoija nykyiselle kortille
  let kortti = null;      // nykyinen kortti
  let ensimmainen = true; // RO:n ensimmäinen callback = alkukoko, ei tallenneta
  let ajastin = 0;        // 300 ms debounce
  let asetettu = null;    // { w, h } px-merkkijonot jotka TÄMÄ skripti asetti

  const lue = () => {
    try {
      const v = JSON.parse(localStorage.getItem(AVAIN));
      return (v && Number.isFinite(v.w) && Number.isFinite(v.h)) ? v : null;
    } catch (e) { return null; }
  };

  const tallenna = (w, h) => {
    try { localStorage.setItem(AVAIN, JSON.stringify({ w, h })); } catch (e) {}
  };

  const rajaa = (arvo, min, max) => Math.round(Math.min(Math.max(arvo, min), max));

  const kiinnita = el => {
    const v = lue();

    // Asetus ENNEN observointia, jotta RO:n ensimmäinen callback näkee jo asetetun koon.
    asetettu = null;
    if (v) {
      asetettu = { w: rajaa(v.w, MIN_W, window.innerWidth) + 'px', h: rajaa(v.h, MIN_H, window.innerHeight) + 'px' };
      el.style.width = asetettu.w;
      el.style.height = asetettu.h;
    }

    kortti = el;
    ensimmainen = true;
    ro = new ResizeObserver(() => {
      if (ensimmainen) { ensimmainen = false; return; }
      clearTimeout(ajastin);
      ajastin = setTimeout(() => {
        if (!el.isConnected) return;
        const w = Math.round(el.offsetWidth), h = Math.round(el.offsetHeight);
        if (w && h) tallenna(w, h);
      }, 300);
    });
    ro.observe(el);
  };

  const irrota = () => {
    clearTimeout(ajastin);
    if (ro) ro.disconnect();
    ro = null;
    kortti = null;
  };

  const tarkista = () => {
    const el = document.querySelector(KORTTI);
    if (el === kortti) return;
    irrota();
    if (el) kiinnita(el);
  };

  window.__kuplaMessengerKoko = {
    versio: '0.1.0',
    pois() {
      // Tallennettua kokoa EI poisteta. Poistetaan vain oma inline-koko, jos käyttäjä ei ole venyttänyt sen jälkeen.
      mo.disconnect();
      const el = kortti;
      irrota();
      if (el && asetettu && el.style.width === asetettu.w && el.style.height === asetettu.h) {
        el.style.width = '';
        el.style.height = '';
      }
      asetettu = null;
      delete window.__kuplaMessengerKoko;
    }
  };

  mo = new MutationObserver(tarkista);
  mo.observe(document.body, { childList: true, subtree: true });
  tarkista();
})();
