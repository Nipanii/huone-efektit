// ==UserScript==
// @name         Ominaisuudet piiloon (kp)
// @namespace    https://re-lab.local/kupla
// @match        https://kupla.cc/*
// @run-at       document-idle
// @grant        none
// @version      1.1.0
// @description  Oikean reunan Ominaisuudet-paneeli (section.hud-features): nappi paneelin sisällä, yksi klikkaus piilottaa/näyttää. kp 8.11. 01:57, 02:03-02:04
// @author       re-lab
// ==/UserScript==

(() => {
  'use strict';

  const VERSIO = '1.1.0';
  const AVAIN = 'kupla.ominaisuudetPiilo';
  // kp 02:04 "joo haluun": yksi klikkaus piiloon suoraan; 02:03 "en tykkää et toi napuska on ton elementin ulkopuolella" -> nappi sisälle
  const TILAT = ['auki', 'piilossa'];
  const MERKKI = { auki: '–', piilossa: '+' };
  const OTSIKKO = { auki: 'Piilota Ominaisuudet', piilossa: 'Näytä Ominaisuudet' };

  // Jos aiempi instanssi on käynnissä, puretaan se ensin
  if (window.__kuplaOminaisuudetPiilo && typeof window.__kuplaOminaisuudetPiilo.pois === 'function') {
    try { window.__kuplaOminaisuudetPiilo.pois(); } catch (e) {}
  }

  const lue = () => { try { const t = localStorage.getItem(AVAIN); return TILAT.includes(t) ? t : 'auki'; } catch (e) { return 'auki'; } };
  const kirjoita = t => { try { localStorage.setItem(AVAIN, t); } catch (e) {} };
  let tila = lue();

  const tyyli = document.createElement('style');
  tyyli.textContent = `
    .kp-ominaisuudet-nappi { position: absolute; top: 3px; right: 4px; z-index: 2; width: 16px; height: 16px; padding: 0; margin: 0;
      line-height: 14px; font-size: 13px; font-weight: bold; color: rgba(255,255,255,.7); background: transparent; border: 0;
      border-radius: 4px; cursor: pointer; pointer-events: auto; }
    .kp-ominaisuudet-nappi:hover { color: #fff; background: rgba(255,255,255,.12); }
    section.hud-features.kp-piilossa { padding: 0 !important; width: 24px; height: 22px; min-height: 0; justify-self: end; align-self: end; }
    section.hud-features.kp-piilossa > :not(.kp-ominaisuudet-nappi) { display: none !important; }
  `;
  document.head.appendChild(tyyli);

  const nappi = document.createElement('button');
  nappi.type = 'button';
  nappi.className = 'kp-ominaisuudet-nappi';
  nappi.addEventListener('click', e => {
    e.stopPropagation();
    tila = TILAT[(TILAT.indexOf(tila) + 1) % TILAT.length];
    kirjoita(tila);
    paivita();
  });

  function paivita() {
    const s = document.querySelector('section.hud-features');
    if (!s) return;
    if (nappi.parentElement !== s) s.appendChild(nappi);
    s.classList.toggle('kp-piilossa', tila === 'piilossa');
    nappi.textContent = MERKKI[tila];
    nappi.title = OTSIKKO[tila];
  }

  // React voi piirtää paneelin uudelleen (huoneen vaihto, HUD:n remount) -> kiinnitetään nappi ja luokat takaisin
  let ajastettu = false;
  const havainto = new MutationObserver(() => {
    if (ajastettu) return;
    ajastettu = true;
    requestAnimationFrame(() => { ajastettu = false; paivita(); });
  });
  havainto.observe(document.body, { childList: true, subtree: true });
  paivita();

  window.__kuplaOminaisuudetPiilo = {
    versio: VERSIO,
    pois() {
      havainto.disconnect();
      nappi.remove();
      tyyli.remove();
      const s = document.querySelector('section.hud-features');
      if (s) s.classList.remove('kp-piilossa');
      delete window.__kuplaOminaisuudetPiilo;
    },
  };
})();
