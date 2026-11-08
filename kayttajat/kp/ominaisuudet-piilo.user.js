// ==UserScript==
// @name         Ominaisuudet piiloon (kp)
// @namespace    https://re-lab.local/kupla
// @match        https://kupla.cc/*
// @run-at       document-idle
// @grant        none
// @version      1.0.0
// @description  Oikean reunan Ominaisuudet-paneeli (section.hud-features): nappi kiertää auki -> kompakti (vain ikonit) -> piilossa. kp 8.11. 01:57
// @author       re-lab
// ==/UserScript==

(() => {
  'use strict';

  const VERSIO = '1.0.0';
  const AVAIN = 'kupla.ominaisuudetPiilo';
  const TILAT = ['auki', 'kompakti', 'piilossa'];
  const MERKKI = { auki: '▾', kompakti: '▸', piilossa: '◂' };
  const OTSIKKO = { auki: 'Ominaisuudet: pienennä', kompakti: 'Ominaisuudet: piilota', piilossa: 'Ominaisuudet: näytä' };

  // Jos aiempi instanssi on käynnissä, puretaan se ensin
  if (window.__kuplaOminaisuudetPiilo && typeof window.__kuplaOminaisuudetPiilo.pois === 'function') {
    try { window.__kuplaOminaisuudetPiilo.pois(); } catch (e) {}
  }

  const lue = () => { try { const t = localStorage.getItem(AVAIN); return TILAT.includes(t) ? t : 'auki'; } catch (e) { return 'auki'; } };
  const kirjoita = t => { try { localStorage.setItem(AVAIN, t); } catch (e) {} };
  let tila = lue();

  const tyyli = document.createElement('style');
  tyyli.textContent = `
    .kp-ominaisuudet-nappi { align-self: flex-end; width: 22px; height: 16px; padding: 0; margin: 0 0 2px 0; line-height: 14px;
      font-size: 12px; color: #fff; background: rgba(0,0,0,.55); border: 1px solid rgba(255,255,255,.35); border-radius: 4px;
      cursor: pointer; pointer-events: auto; }
    .kp-ominaisuudet-nappi:hover { background: rgba(0,0,0,.8); }
    section.hud-features.kp-kompakti .hud-feature__text { display: none !important; }
    section.hud-features.kp-piilossa { display: none !important; }
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
    if (nappi.parentElement !== s.parentElement || nappi.nextElementSibling !== s) s.parentElement.insertBefore(nappi, s);
    s.classList.toggle('kp-kompakti', tila === 'kompakti');
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
      if (s) s.classList.remove('kp-kompakti', 'kp-piilossa');
      delete window.__kuplaOminaisuudetPiilo;
    },
  };
})();
