// ==UserScript==
// @name         kupla: Messenger-kuplat A/B-testi (B123)
// @namespace    kupla
// @version      0.3.2
// @description  TESTI: kaikki viestit kupliin, kaksi tyyliä. A2 = läpikuultava, ohut reuna, terävä kulma lähettäjän puolella. C = täytetty väri, pyöreä, ei reunaa. Valinta localStorage 'kuplat-testi' = A2 | C (oletus A2).
// @match        https://kupla.cc/*
// @grant        none
// @run-at       document-idle
// @kupla-oletus on
// @kupla-ryhma  Testattavat
// ==/UserScript==
// B123 (kp 2026-10-28 12:29 "tehää ab vertailuu meidän clienteillä ... anna molempiin aina 2 eri vaihtoehtoo ... siis niitä messenger kuplia").
// 0.2.0: kp 12:50 "huono vertailu kun et laittanut kuplaa molemmille osapuolille" -> molemmat vaihtoehdot kuplittavat omat JA muiden viestit.
// Kaksi clienttiä vierekkäin: robon clientiin C (CDP), kp:lle oletus A2. Vain CSS, Reactin solmuihin ei kosketa.
// Vaihto: localStorage['kuplat-testi'] = 'A2' tai 'C', sitten sivun päivitys.
(() => {
  if (window.__kuplaKuplatTesti) return;
  // Yhteinen: muiden viestit kutistuvat tekstin levyisiksi (natiivisti .km-txt on täysleveä lohko), kupla enintään 78 %.
  // 0.3.1 kp 13:57 "nää pallot on liian kiinni toisissaan" (natiivi .km-row 36px + margin 1px = 2px pallojen väli) ja
  //   13:58 "ryhmä icon pallurassa on tyhmää tilaa" (natiivi is-group::before 16x14 36px pallossa, all_friends_icon.png 35x33).
  const VALIT = '.km-row{margin-top:3px;margin-bottom:3px}.km-av.km-chav.is-group::before{width:26px;height:24px}';
  const POHJA = '.km-m:not(.is-own) .km-m-body{display:flex;flex-direction:column;align-items:flex-start}' +
    '.km-m .km-txt{max-width:78%;text-align:left;padding:6px 11px;margin-top:4px}' +
    // messenger-media:n Kopioi muiden kuplassa pois tekstivirrasta (muuten näkymätön nappi leventää kuplaa): kuplan oikealle puolelle.
    '.km-m:not(.is-own) .kmm-add .kmm-kopioi{position:absolute;top:0;left:100%;margin-left:6px;white-space:nowrap;visibility:hidden;background:#30363f;z-index:2}' +
    '.km-m:not(.is-own) .km-txt:hover .kmm-kopioi,.km-m:not(.is-own) .kmm-kopioi:focus{visibility:visible}' +
    '.km-m:not(.is-own) .kmm-add:has(> .kmm-kopioi:only-child){margin-left:0}';
  const TYYLI = {
    A2: '.km-m.is-own .km-txt{background:rgba(38,127,147,.30);border:1px solid rgba(98,193,214,.22);border-radius:6px 2px 6px 6px}' +
      '.km-m:not(.is-own) .km-txt{background:rgba(255,255,255,.055);border:1px solid rgba(255,255,255,.07);border-radius:2px 6px 6px 6px}',
    C: '.km-m.is-own .km-txt{background:#1d6474;color:#eef6f8;border-radius:6px;border:1px solid rgba(98,193,214,.35)}' +
      '.km-m:not(.is-own) .km-txt{background:#2c323b;color:#dfe6ee;border-radius:6px;border:1px solid rgba(255,255,255,.12)}'
  };
  let v = 'A2'; try { v = localStorage.getItem('kuplat-testi') === 'C' ? 'C' : 'A2'; } catch (_) {}
  const s = document.getElementById('kuplat-testi') || document.createElement('style'); s.id = 'kuplat-testi';
  s.dataset.v = v; s.textContent = VALIT + POHJA + TYYLI[v];
  document.head.appendChild(s);
  // 0.3.2: pois() hot-updatea varten (moottorin kayttajaskriptit, kp 28.10. "eikä tarvii f5").
  window.__kuplaKuplatTesti = { versio: '0.3.2', pois() { const s = document.getElementById('kuplat-testi'); if (s) s.remove(); delete window.__kuplaKuplatTesti; } };
})();
