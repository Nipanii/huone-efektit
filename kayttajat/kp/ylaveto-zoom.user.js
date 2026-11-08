// ==UserScript==
// @name         Yläveto-historia: uusi asettelu UI-zoomin jälkeen (kp)
// @namespace    https://re-lab.local/kupla
// @match        https://kupla.cc/*
// @run-at       document-idle
// @grant        none
// @version      1.1.0
// @description  B227 väliaikaisesti skriptinä (PR 857 draft): kun UI-zoom muuttuu, laukaistaan window resize, jolloin ChatHistoryPulldownView asettelee kuplat uudelleen eivätkä ne mene päällekkäin. kp 8.11. 03:25
// @author       re-lab
// ==/UserScript==

// Syy (mitattu robolla 8.11.): pulldown asettelee kuplat vain kun viewportTick muuttuu (window resize / kuvan load).
// UiZoom muuttaa --kupla-ui-zoom-arvoa laukaisematta kumpaakaan -> kuplat kasvavat vanhoilla paikoillaan päällekkäin
// (134-173 päällekkäistä paria). Käsin laukaistu sama relayout vei päällekkäisyydet nollaan. Tämä laukaisee sen.
(() => {
  'use strict';
  const VERSIO = '1.1.0';
  if (window.__kuplaYlavetoZoom && typeof window.__kuplaYlavetoZoom.pois === 'function') { try { window.__kuplaYlavetoZoom.pois(); } catch (e) {} }
  const taso = () => getComputedStyle(document.documentElement).getPropertyValue('--kupla-ui-zoom').trim()
    + '|' + ((window.kuplaUiZoom && window.kuplaUiZoom.level) || '');
  let edellinen = taso(), ajastin = 0;
  const tarkista = () => {
    const nyt = taso();
    if (nyt === edellinen) return;
    edellinen = nyt;
    // 1.1.0 (kp 03:43 'vasta kun koon muuttaminen pysähtyy … eiks ne kuplat vois saman tien löytää oikeen paikkansa'):
    // ei debouncea, vaan uusi asettelu jokaisessa ruudussa jossa zoom muuttui (rAF kokoaa saman ruudun muutokset yhteen)
    if (ajastin) return;
    ajastin = requestAnimationFrame(() => { ajastin = 0; window.dispatchEvent(new Event('resize')); });
  };
  const havainnoija = new MutationObserver(tarkista);
  havainnoija.observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'class', 'data-kupla-ui-zoom'] });
  const varmistus = setInterval(tarkista, 100); // jos zoom asetetaan muualle kuin juureen
  window.__kuplaYlavetoZoom = { versio: VERSIO, pois() {
    havainnoija.disconnect(); clearInterval(varmistus); cancelAnimationFrame(ajastin); delete window.__kuplaYlavetoZoom;
  } };
})();
