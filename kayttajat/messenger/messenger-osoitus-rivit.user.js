// ==UserScript==
// @name         kupla: Osoita-kortit allekkain yksityisketjussa
// @namespace    kupla
// @version      0.1.1
// @description  Peräkkäiset Osoita-kortit omille riveilleen yksityisviestiketjussa, kuten ryhmissä (ennen 3 rinnakkain).
// @match        https://kupla.cc/*
// @grant        none
// @run-at       document-idle
// @kupla-oletus on
// @kupla-ryhma  Testattavat
// ==/UserScript==
// B131 (kp 2026-10-28 12:14 "tää on outo"). Syy: MessengerThreadPane.tsx:177 palauttaa kortin suoraan .km-m-bodyyn ilman .km-txt-riviä,
//   ja .km-point-card on display:inline-flex (MessengerView.scss:1069) -> peräkkäiset kortit virtaavat rinnakkain.
//   MessengerChannelPane.tsx:177 käärii saman kortin .km-txt-diviin, joten ryhmässä ne ovat jo allekkain. Vain CSS, Reactin solmuihin ei kosketa.
(() => {
  if (window.__kuplaOsoitusRivit) return;
  if (!document.getElementById('kor-tyyli')) { const s = document.createElement('style'); s.id = 'kor-tyyli';
    s.textContent = '.km-m-body > .km-point-card{display:flex;width:fit-content}';
    document.head.appendChild(s); }
  // 0.1.1: pois() hot-updatea varten (moottorin kayttajaskriptit, kp 28.10. "eikä tarvii f5").
  window.__kuplaOsoitusRivit = { versio: '0.1.1', pois() { const s = document.getElementById('kor-tyyli'); if (s) s.remove(); delete window.__kuplaOsoitusRivit; } };
})();
