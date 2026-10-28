// ==UserScript==
// @name         kupla: Lisäosakortin + / − nappi näkyväksi
// @namespace    kupla
// @version      0.1.0
// @description  Lisäosakortin + / − -nappi näkyy tekstinappina, samannäköisenä kuin kortin muut napit.
// @match        https://kupla.cc/*
// @grant        none
// @run-at       document-idle
// @kupla-oletus on
// @kupla-ryhma  Testattavat
// ==/UserScript==
// B94 + I116 (kp 2026-10-28). Syy: MessengerView.scss:1155 .km-code-icon ilman taustaa ja reunaa. Vain CSS, Reactin solmuihin ei kosketa.
(() => {
  if (window.__kuplaLisaosaNappi) return; window.__kuplaLisaosaNappi = true;
  if (!document.getElementById('kln-tyyli')) { const s = document.createElement('style'); s.id = 'kln-tyyli';
    s.textContent = '.km-code-card.is-addon button.km-code-icon{display:inline-flex;align-items:center;height:28px;padding:0 10px;border:0;border-radius:7px;' +
      'background:#272727;box-shadow:inset 0 0 0 1px #474747;color:#dce6f2;font-family:inherit;font-weight:normal;font-size:0;white-space:nowrap;cursor:pointer}' +
      '.km-code-card.is-addon button.km-code-icon::before{content:attr(title);font-size:12px}' +
      '.km-code-card.is-addon button.km-code-icon:hover{background:#343434}' +
      '.km-code-card.is-addon button.km-code-icon:disabled{opacity:.45;cursor:default}';
    document.head.appendChild(s); }
})();
