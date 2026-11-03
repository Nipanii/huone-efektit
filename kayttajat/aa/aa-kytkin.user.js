// ==UserScript==
// @name         Kupla AA-kytkin
// @namespace    https://re-lab.local/kupla
// @match        https://kupla.cc/*
// @grant        none
// @run-at       document-idle
// @version      0.2.0
// @kupla-oletus on
// @description  Komento :aa vaihtaa pehmennyksen (LINEAR, kuten Boon) päälle/pois. Vaihto näkyy heti, ei uudelleenlatausta. Valinta muistetaan.
// @author       re-lab
// ==/UserScript==
//
// kp 2026-11-03 05:49: "mites se AA juttu Onks vaikee toteuttaa? Vois tehdä komennon sen testaamiseen. Sama komento laittaa on/off".
// TAUSTA (luettu main-live): Nitro_Render_V3/packages/utils/src/DprRenderingMode.ts:8 GetDesiredScaleMode = () => 'nearest' (kovakoodattu),
//   ja GetRenderer.ts:40-48 patchattu bindSource pakottaa sen JOKAISELLE tekstuurille joka sidonnassa, PAITSI jos source.nitroFixedScaleMode.
//   Boon: index-762329f4.js SCALE_MODE = devicePixelRatio%1 ? LINEAR : NEAREST -> murto-DPR:llä (125/150 %) koko kuva pehmeä.
// MITEN: TextureSource.prototype saa getterin nitroFixedScaleMode. AA päällä: getter palauttaa true (Nitro ei pakota nearestia) ja
//   asettaa samalla tekstuurille linear. AA pois: false -> Nitro palauttaa nearestin itse seuraavassa sidonnassa. Prototyyppi
//   haetaan mistä tahansa huoneen spritestä (NitroDevTools.roomEngine), koska pixiä ei voi importata userscriptistä.
// RAJA: vaatii huoneen (spriten) ennen kuin proto löytyy; yritetään 2 s välein. Tekstuurit joilla oma nitroFixedScaleMode-arvo
//   (instanssikenttä) ohittavat getterin ja pysyvät ennallaan. Koskee vain tätä selainta.
(function () {
  'use strict';
  const VW = (typeof unsafeWindow !== 'undefined' && unsafeWindow) || window;
  // Moottoriversio (kayttajat.json ryhmä aa-kytkin): jos sama lisäosa on jo ajossa (kp:n loader), ei toista kertaa.
  if (VW.kuplaAA) return;
  const AVAIN = 'kupla.aa';
  // 0.2.0 (kp 06:05 "joo lisätään"): tila on | off | auto. auto = Boonin logiikka (index-762329f4.js
  //   SCALE_MODE = devicePixelRatio%1 ? LINEAR : NEAREST) — pehmeä vain murto-DPR:llä; sivun zoom muuttaa DPR:ää, joten resize arvioi uudelleen.
  let tila = 'off'; try { tila = VW.localStorage.getItem(AVAIN) || 'off'; } catch (e) {}
  const laske = () => tila === 'on' || (tila === 'auto' && (VW.devicePixelRatio || 1) % 1 !== 0);
  let paalla = laske();
  let asennettu = false;

  // Kaikki huoneen näkymän tekstuurit. Mitattu robolla 05:58 (DPR 1.5, 683 tekstuuria): pelkkä getter vaihtoi vain 1/683, koska
  //   staattinen huone ei sido tekstuureja uudelleen -> vaihdossa käydään kaikki läpi ja päivitetään suoraan.
  function lahteet() {
    const RE = VW.NitroDevTools && VW.NitroDevTools.roomEngine; if (!RE || !RE.getRoomInstanceRenderingCanvas) return [];
    let c = null; try { c = RE.getRoomInstanceRenderingCanvas(RE.activeRoomId, 1); } catch (e) {}
    const juuri = c && (c.master || c._master); if (!juuri) return [];
    const seen = new Set(), S = new Set();
    const walk = (o, d) => { if (!o || d > 15 || seen.has(o)) return; seen.add(o);
      if (o.texture && o.texture.source && o.texture.source.style) S.add(o.texture.source);
      (o.children || []).forEach(ch => walk(ch, d + 1)); };
    walk(juuri, 0);
    return [...S];
  }
  // Perusluokka TextureSource (omistaa staattisen defaultOptions), EI ensimmäisen spriten aliluokka: mitattu 05:59, getter
  //   ImageSourcen protossa -> muut lähdetyypit palasivat nearestiin 1,5 s:ssa.
  function etsiProto() {
    const a = lahteet(); if (!a.length) return null;
    let P = Object.getPrototypeOf(a[0]);
    while (P && !Object.prototype.hasOwnProperty.call(P.constructor, 'defaultOptions')) P = Object.getPrototypeOf(P);
    return P || Object.getPrototypeOf(a[0]);
  }
  function pyyhi() {
    const m = paalla ? 'linear' : 'nearest'; let n = 0;
    for (const s of lahteet()) if (s.style && s.style.scaleMode !== m) { s.style.scaleMode = m; s.style.update && s.style.update(); n++; }
    return n;
  }

  function asenna() {
    if (asennettu) return true;
    const P = etsiProto(); if (!P) return false;
    if (Object.getOwnPropertyDescriptor(P, 'nitroFixedScaleMode')) { asennettu = true; return true; }
    Object.defineProperty(P, 'nitroFixedScaleMode', { configurable: true,
      get() {
        if (!paalla || !this.style) return false;
        if (this.style.scaleMode !== 'linear') { this.style.scaleMode = 'linear'; this.style.update && this.style.update(); }
        return true;
      },
      set(v) { Object.defineProperty(this, 'nitroFixedScaleMode', { value: v, writable: true, configurable: true }); } });
    asennettu = true; return true;
  }
  const ajastin = setInterval(() => { if (asenna()) { clearInterval(ajastin); if (paalla) pyyhi(); } }, 2000);

  function aseta(uusi) {
    tila = uusi; paalla = laske(); try { VW.localStorage.setItem(AVAIN, tila); } catch (e) {}
    asenna(); const n = pyyhi();
    const nimi = tila === 'auto' ? 'AUTO (DPR ' + (VW.devicePixelRatio || 1) + ' -> ' + (paalla ? 'pehmeä' : 'terävä') + ')'
      : (paalla ? 'PÄÄLLÄ (pehmeä, linear)' : 'POIS (terävä, nearest)');
    return 'AA ' + nimi + (asennettu ? ' · ' + n + ' tekstuuria' : ' — odottaa huonetta');
  }
  VW.addEventListener('resize', () => { const p = laske(); if (p !== paalla) { paalla = p; pyyhi(); } });
  (VW.kuplaKomennotJono = VW.kuplaKomennotJono || []).push([['aa'],
    (teksti, sanat) => { const s = (sanat[0] || '').toLowerCase();
      return aseta(/^auto$/.test(s) ? 'auto' : /^(on|päälle|paalle|1)$/.test(s) ? 'on' : /^(pois|off|0)$/.test(s) ? 'off' : (paalla ? 'off' : 'on')); },
    'pehmennys: :aa vaihtaa · :aa on · :aa pois · :aa auto (kuten Boon: vain murtolukuskaalauksella)', 'AA-kytkin']);
  // Ilman kuplaKomennot-lisäosaa (Res): oma Enter-käsittelijä kuten wired-piilo.user.js.
  const komennotHoitaa = () => { try { return !!(VW.kuplaKomennot && VW.kuplaKomennot.lista().some(k => k.nimet.includes('aa'))); } catch (e) { return false; } };
  function ilmoita(teksti) {
    const d = document.createElement('div'); d.textContent = teksti;
    d.style.cssText = 'position:fixed;left:50%;top:70px;transform:translateX(-50%);z-index:99999;background:rgba(20,25,30,.95);color:#fff;padding:6px 12px;border-radius:6px;font:13px sans-serif;pointer-events:none';
    document.body.appendChild(d); setTimeout(() => d.remove(), 2500);
  }
  document.addEventListener('keydown', ev => {
    if (ev.key !== 'Enter' || ev.isComposing) return;
    const t = ev.target; if (!t || (t.tagName !== 'INPUT' && t.tagName !== 'TEXTAREA')) return;
    const m = /^\s*:aa(?:\s+(\S+))?\s*$/i.exec(t.value || ''); if (!m || komennotHoitaa()) return;
    ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation();
    try { const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(t), 'value').set;
      setter.call(t, ''); t.dispatchEvent(new Event('input', { bubbles: true })); } catch (err) { t.value = ''; }
    const s = (m[1] || '').toLowerCase();
    ilmoita(aseta(/^auto$/.test(s) ? 'auto' : /^(on|päälle|paalle|1)$/.test(s) ? 'on' : /^(pois|off|0)$/.test(s) ? 'off' : (paalla ? 'off' : 'on')));
  }, true);
  VW.kuplaAA = { aseta, tila: () => ({ tila, paalla, asennettu, dpr: VW.devicePixelRatio }) };
})();
