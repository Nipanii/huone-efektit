// ==UserScript==
// @name         kupla: Skriptit-välilehti tiiviiksi riveiksi (esikatselu)
// @namespace    kupla
// @version      0.1.0
// @description  Messenger / Skriptit-välilehden lisäosakortit yhdeksi riviksi: nimi, kytkin, </> ja roskis. Vain CSS, chat-kortit ennallaan.
// @match        https://kupla.cc/*
// @grant        none
// @run-at       document-idle
// @kupla-oletus off
// @kupla-ryhma  Testattavat
// ==/UserScript==
// Esikatselu, kp 2026-10-28 16:32 ("tää UI on ihan hirvee. siis toi scriptit"). Vain CSS: Reactin solmuihin ei kosketa.
// Kohde: .km-pane .km-scroll > .km-code-card.is-addon = vain Skriptit-välilehti (chat-kortit ovat .km-txt:n sisällä, eivät .km-scroll:n lapsia; mitattu robolla).
// Ylikirjoitus: messenger-lisaosanappi.user.js antaa .km-code-card.is-addon button.km-code-icon (0,3,1); tämän valitsimet ovat selvästi vahvempia.
// Roskis = sama PNG kuin ryhmän "Poista ryhmä" -napissa (remove_friend_bin.png, MessengerView.scss .km-icon.remove), mask-kuvana currentColor-värillä.
(() => {
  if (window.__kuplaSkriptitTesti) return;
  if (!document.getElementById('kst-tyyli')) {
    const P = '.km-pane .km-scroll > .km-code-card.is-addon';
    const ROSKIS = 'url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAA0AAAANCAYAAABy6+R8AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAACxMAAAsTAQCanBgAAABJSURBVChTY2TADv5DaRDAUIMsgKwQFwCrh2kiRgMMwC0CaSKkEa6GLJvI8hMTmIkKYAah03CATRNBMMg1kRV66CGDTyNULQMDACkBCxHze4N3AAAAAElFTkSuQmCC")';
    const CSS = [
      // kortti: yksi rivi (nimi | kytkin </> roskis), muu sisältö rivin alle
      `${P}{display:flex;flex-direction:row;flex-wrap:wrap;align-items:center;gap:8px;padding:6px 10px}`,
      `${P} > .km-code-head{display:contents}`,
      // nimi yhdelle riville, "Lisäosa:" pois (välilehden otsikko kertoo sen)
      `${P} > .km-code-head > .km-sys-text{order:1;flex:1 1 0;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;overflow-wrap:normal}`,
      `${P} > .km-code-head > .km-sys-text > b{display:none}`,
      // toimintarivi
      `${P} > .km-code-actions{order:2;flex:none;flex-wrap:nowrap;align-items:center;gap:6px}`,
      // Ota käyttöön (is-primary) ja Poista käytöstä (is-danger) = yksi kytkin 34x18, teksti piilotettu fontti-koolla 0
      `${P} > .km-code-actions > .km-btn.is-primary,${P} > .km-code-actions > .km-btn.is-danger{order:-1;position:relative;flex:none;width:34px;height:18px;min-width:0;margin:0;padding:0;gap:0;border:0;border-radius:9px;font-size:0;font-weight:normal;color:transparent;cursor:pointer;background:#2b2b2b;box-shadow:inset 0 0 0 1px #4a4a4a}`,
      `${P} > .km-code-actions > .km-btn.is-primary:hover{background:#343434}`,
      `${P} > .km-code-actions > .km-btn.is-primary::after,${P} > .km-code-actions > .km-btn.is-danger::after{content:"";position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;background:#dce6f2;box-shadow:0 1px 2px rgba(0,0,0,.4);transition:left .12s}`,
      `${P} > .km-code-actions > .km-btn.is-danger{background:linear-gradient(#18b842,#0e8a2c);box-shadow:inset 0 1px 0 rgba(255,255,255,.19)}`,
      `${P} > .km-code-actions > .km-btn.is-danger:hover{background:linear-gradient(#18b842,#0e8a2c);filter:brightness(1.1)}`,
      `${P} > .km-code-actions > .km-btn.is-danger::after{left:18px;background:#fff}`,
      // </> = Näytä koodi / Piilota koodi (ensimmäinen toimintanappi), pieni monospace-merkki
      `${P} > .km-code-actions > .km-btn:first-child:not(.is-primary):not(.is-danger){flex:none;width:26px;height:24px;margin:0;padding:0;gap:0;justify-content:center;font-size:0;border:0;border-radius:6px;background:#272727;box-shadow:inset 0 0 0 1px #474747;color:#dce6f2}`,
      `${P} > .km-code-actions > .km-btn:first-child:not(.is-primary):not(.is-danger):hover{background:#343434}`,
      `${P} > .km-code-actions > .km-btn:first-child:not(.is-primary):not(.is-danger)::before{content:"</>";font:bold 12px/1 monospace;color:#dce6f2}`,
      // muut tekstinapit rivillä (Kopioi koodi, Poista omalle lisäosalle) 24px, ettei rivi kasva yli 40 px
      `${P} > .km-code-actions > .km-btn:not(:first-child):not(.is-primary):not(.is-danger){height:24px;padding:0 8px;font-size:11px}`,
      // roskis = Poista skripteistä (button.km-code-icon, order 3); ei-tallennettu [+] näyttää tekstin [+]
      `${P} > .km-code-head > button.km-code-icon{--kst-roskis:${ROSKIS};order:3;display:inline-flex;align-items:center;justify-content:center;flex:none;width:26px;height:24px;margin:0;padding:0;border:0;border-radius:6px;background:none;box-shadow:none;color:#8f9aa6;font-size:0;line-height:0;cursor:pointer}`,
      `${P} > .km-code-head > button.km-code-icon:hover{background:rgba(255,255,255,.08);color:#dce6f2}`,
      `${P} > .km-code-head > button.km-code-icon::before{content:"";display:block;width:13px;height:13px;background:currentColor;-webkit-mask:var(--kst-roskis) center/contain no-repeat;mask:var(--kst-roskis) center/contain no-repeat}`,
      `${P} > .km-code-head > button.km-code-icon[title="Lisää skripteihin"]::before{content:"[+]";width:auto;height:auto;background:none;-webkit-mask:none;mask:none;font:bold 12px/1 monospace;color:inherit}`,
      // kaikki muu kortissa (ilmoitukset, koodi, vahvistus, loki, kopiointi) rivin alle
      `${P} > :not(.km-code-head):not(.km-code-actions){order:4;flex-basis:100%;max-width:100%;min-width:0}`,
    ].join('\n');
    const s = document.createElement('style');
    s.id = 'kst-tyyli';
    s.textContent = CSS;
    document.head.appendChild(s);
  }
  // pois() hot-updatea varten (kp 28.10. "eikä tarvii f5"), sama muoto kuin messenger-lisaosanappi.user.js
  window.__kuplaSkriptitTesti = { versio: '0.1.0', pois() { const s = document.getElementById('kst-tyyli'); if (s) s.remove(); delete window.__kuplaSkriptitTesti; } };
})();
