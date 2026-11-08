// ==UserScript==
// @name         Osoita-nappi ei sulje avointa valikkoa (kp)
// @namespace    https://re-lab.local/kupla
// @match        https://kupla.cc/*
// @run-at       document-idle
// @grant        none
// @version      1.0.0
// @description  B225 väliaikaisesti skriptinä (PR 854): Messengerin Osoita-painallus ei enää sulje Työkalut-valikkoa tms. ennen kuin osoitustila alkaa. kp 8.11. 03:25
// @author       re-lab
// ==/UserScript==

// Syy: avoimet valikot (HudRoomCardView ym.) sulkeutuvat document-tason pointerdown/mousedown/clickiin valikon ulkopuolella,
// ja Osoita-napin painallus kulki documentille asti. PR 854 pysäyttää sen Reactin käsittelijässä. Tämä tekee saman natiivisti
// React-juuressa (#root), JÄLKEEN Reactin oman kuuntelijan (rekisteröity ensin), joten napin onClick toimii yhä.
(() => {
  'use strict';
  const VERSIO = '1.0.0';
  if (window.__kuplaOsoitaValikko && typeof window.__kuplaOsoitaValikko.pois === 'function') { try { window.__kuplaOsoitaValikko.pois(); } catch (e) {} }
  const juuri = document.getElementById('root');
  if (!juuri) { console.warn('[osoita-valikko] #root puuttuu'); return; }
  const pysayta = ev => { if (ev.target && ev.target.closest && ev.target.closest('.km-btn-osoita')) ev.stopPropagation(); };
  const tyypit = ['pointerdown', 'mousedown', 'click'];
  for (const t of tyypit) juuri.addEventListener(t, pysayta);
  window.__kuplaOsoitaValikko = { versio: VERSIO, pois() {
    for (const t of tyypit) juuri.removeEventListener(t, pysayta);
    delete window.__kuplaOsoitaValikko;
  } };
})();
