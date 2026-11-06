// ==UserScript==
// @name         Kupla AA-kytkin
// @namespace    https://re-lab.local/kupla
// @match        https://kupla.cc/*
// @grant        none
// @run-at       document-idle
// @version      0.7.1
// @kupla-oletus on
// @description  Komento :aa vaihtaa pehmennyksen päälle/pois (linear, kuten Boon; ei terävöintiä). Vaihto näkyy heti, ei uudelleenlatausta. Valinta muistetaan.
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
//
// 0.7.0 (kp 21:22 "laita se :aa komentoo ja poista kaikki variantit siit komennost" · "se togglee vaa on/off meidän vahvinta versioo"):
//   :aa on pelkkä on/off. Päällä = linear (0.7.0:n terävöinti poistettu 0.7.1:ssä, kp 21:39-21:40) + roundPixels.
//   Poistettu: :aa1-:aa7, auto-tila, tason tallennus. Pois palauttaa kaiken (scaleMode, suodatin, roundPixels).
//   roundPixels kuten Boon (index-762329f4.js: ROUND_PIXELS=!0). Pixi 8: AbstractRenderer.mjs:67 this._roundPixels (vain getter
//   `roundPixels`, ei setteriä) ja SpritePipe.mjs:39 lukee sen VAIN kun spritelle luodaan GPU-data (_initGPUSprite) -> jo olemassa
//   olevien spritejen _gpuData[uid].roundPixels päivitetään käsin. HUOM: kupla-client asettaa jo roundPixels:true (Nitro-V3/src/App.tsx:376),
//   joten päällä-tilassa tämä on yleensä no-op; pois-tilassa palautetaan se arvo joka renderöijällä oli ennen :aa:ta.
(function () {
  'use strict';
  const VW = (typeof unsafeWindow !== 'undefined' && unsafeWindow) || window;
  // Moottoriversio (kayttajat.json ryhmä aa-kytkin): jos sama lisäosa on jo ajossa (kp:n loader), ei toista kertaa.
  if (VW.kuplaAA) return;
  const AVAIN = 'kupla.aa';
  // 0.7.0: vain on | off. Vanha 'auto' (0.2.0-0.4.x) luetaan pois-tilaksi.
  let tila = 'off'; try { tila = VW.localStorage.getItem(AVAIN) === 'on' ? 'on' : 'off'; } catch (e) {}
  const laske = () => tila === 'on';
  let paalla = laske();
  let asennettu = false;

  // Kaikki huoneen näkymän tekstuurit. Mitattu robolla 05:58 (DPR 1.5, 683 tekstuuria): pelkkä getter vaihtoi vain 1/683, koska
  //   staattinen huone ei sido tekstuureja uudelleen -> vaihdossa käydään kaikki läpi ja päivitetään suoraan.
  function huoneJuuri() {
    const RE = VW.NitroDevTools && VW.NitroDevTools.roomEngine; if (!RE || !RE.getRoomInstanceRenderingCanvas) return null;
    let c = null; try { c = RE.getRoomInstanceRenderingCanvas(RE.activeRoomId, 1); } catch (e) {}
    return (c && (c.master || c._master)) || null;
  }
  function lahteet() {
    const juuri = huoneJuuri(); if (!juuri) return [];
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
    VW.__kuplaAApaalla = paalla;
    const m = paalla ? 'linear' : 'nearest'; let n = 0;
    for (const s of lahteet()) if (s.style && s.style.scaleMode !== m) { s.style.scaleMode = m; s.style.update && s.style.update(); n++; }
    return n;
  }

  // roundPixels (0.7.0). Renderöijä ei ole julkinen: huonekanvaksen juuren parentRenderGroup -> instructionSet.renderPipes -> sprite._renderer
  //   (mitattu robolla 21:2x, Pixi 8.19). Alkuperäinen arvo muistetaan VW:hen, jotta kuumapäivitys ei kadota sitä.
  function renderoija() {
    const juuri = huoneJuuri(), rg = juuri && juuri.parentRenderGroup; if (!rg) return null;
    const hae = g => { const rp = g && g.instructionSet && g.instructionSet.renderPipes;
      return (rp && ((rp.sprite && rp.sprite._renderer) || (rp.graphics && rp.graphics.renderer))) || null; };
    let r = hae(rg);
    if (!r) for (const ch of rg.renderGroupChildren || []) { r = hae(ch); if (r) break; }
    return r && '_roundPixels' in r ? r : null;
  }
  // Pixi lukee renderöijän lipun vain kun spritelle luodaan GPU-data, joten olemassa olevat spritet päivitetään itse.
  function kierrosRP(arvo) {
    const r = renderoija(); if (!r) return false;
    if (r._roundPixels === arvo) return true;
    r._roundPixels = arvo;
    const juuri = huoneJuuri(), seen = new Set();
    const walk = (o, d) => { if (!o || d > 15 || seen.has(o)) return; seen.add(o);
      const g = o._gpuData && o._gpuData[r.uid];
      if (g && 'roundPixels' in g) { g.roundPixels = arvo | (o._roundPixels ? 1 : 0); o.onViewUpdate && o.onViewUpdate(); }
      (o.children || []).forEach(ch => walk(ch, d + 1)); };
    walk(juuri, 0);
    return true;
  }
  function roundPixels() {
    const r = renderoija(); if (!r) return;
    if (paalla) { if (VW.__kuplaAAedRP === undefined) VW.__kuplaAAedRP = r._roundPixels; kierrosRP(1); }
    else if (VW.__kuplaAAedRP !== undefined) { if (kierrosRP(VW.__kuplaAAedRP)) VW.__kuplaAAedRP = undefined; }
  }

  function asenna() {
    if (asennettu) return true;
    const P = etsiProto(); if (!P) return false;
    // 0.6.3 (kp 07:04 "ei mee aa pois päältä"): getter jäi ENSIMMÄISEN version sulkeumaan (sen paalla), joten kuumapäivityksen jälkeen
    //   pois ei vaikuttanut sidontaan. Nyt getter määritellään joka versiossa uudelleen ja lukee jaetun lipun.
    Object.defineProperty(P, 'nitroFixedScaleMode', { configurable: true,
      get() {
        if (!VW.__kuplaAApaalla || !this.style) return false;
        if (this.style.scaleMode !== 'linear') { this.style.scaleMode = 'linear'; this.style.update && this.style.update(); }
        return true;
      },
      set(v) { Object.defineProperty(this, 'nitroFixedScaleMode', { value: v, writable: true, configurable: true }); } });
    asennettu = true; return true;
  }
  const ajastin = setInterval(() => { if (asenna()) { clearInterval(ajastin); if (paalla) { pyyhi(); roundPixels(); } } }, 2000);

  // Terävöinti pehmennyksen päälle (0.3.0): SVG feConvolveMatrix huonecanvasille (CSS filter), kerroin = reunojen paino.
  // 0.7.0: yksi kiinteä taso = entisen :aa7:n (sisäinen taso 5) kerroin. Gamma poistettu (se oli vain entisessä :aa2:ssa).
  const VAHVUUS = 0.75;
  function huoneCanvas() {
    let paras = null, a = 0;
    for (const c of document.querySelectorAll('canvas')) { const x = c.clientWidth * c.clientHeight; if (x > a) { a = x; paras = c; } }
    return paras;
  }
  function teravoita() {
    const vari = false, k = 0;   // 0.7.1: EI terävöintiä (kp 21:39 "kuka sano et piti olla terävöintiä lainkaan aa:ssa", 21:40 "viiva paheni"); filtteri vain poistetaan
    let d = document.getElementById('kupla-aa-svg');
    if (vari && !d) {
      d = document.createElement('div'); d.id = 'kupla-aa-svg'; d.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
      d.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg"><filter id="kupla-teravoita" color-interpolation-filters="sRGB"><feComponentTransfer><feFuncR type="gamma" amplitude="1" offset="0" exponent="1"/><feFuncG type="gamma" amplitude="1" offset="0" exponent="1"/><feFuncB type="gamma" amplitude="1" offset="0" exponent="1"/></feComponentTransfer><feConvolveMatrix order="3" preserveAlpha="true"/></filter></svg>';
      document.body.appendChild(d);
    }
    // 0.4.4: SVG jää sivulle versiosta toiseen (vanhassa voi olla gamma) -> exponent asetetaan joka kierroksella, ei vain luodessa
    if (d) d.querySelectorAll('feFuncR,feFuncG,feFuncB').forEach(e => e.setAttribute('exponent', '1'));
    if (d) d.querySelector('feConvolveMatrix').setAttribute('kernelMatrix', `0 ${ -k } 0 ${ -k } ${ 1 + 4 * k } ${ -k } 0 ${ -k } 0`);
    // 0.4.1 (kp 06:46 "vilkkuu edellee"): suodatin WebGL-canvasille itselleen vilkkui -> vanhemman divin kerrokselle.
    const c0 = huoneCanvas(); if (!c0) return;
    if (c0.style.filter) c0.style.filter = '';
    const c = c0.parentElement || c0;
    const f = vari ? 'url(#kupla-teravoita)' : '';
    if (c.style.filter !== f) c.style.filter = f;
  }
  // 0.4.2 (kp 06:47 "sekunnin välein välähtää"): moottorin kuumapäivitys jätti vanhan version ajastimet henkiin, ja kaksi versiota
  //   kirjoitti suodatinta vuorotellen. Sukupolvi: uusi ajo kasvattaa laskuria, vanhan ajastin pysähtyy itse.
  const SUKU = VW.__kuplaAAsuku = (VW.__kuplaAAsuku || 0) + 1;
  const ajastinT = setInterval(() => { if (VW.__kuplaAAsuku !== SUKU) return clearInterval(ajastinT); teravoita(); if (paalla) roundPixels(); }, 2000);

  // 0.6.4 (kp 07:04 "komennon pitäs sanoo mitkä settings menee pääl samanlail ku wired messaget näkyy vaa itel"): yksi chattirivi vain itselle.
  //   Pelin oma RSCE_CHAT_EVENT (RoomSessionChatEvent, kuten DiscordRuntime.ts:119) globaaliin tapahtumajakajaan; ei lähde palvelimelle.
  //   Luokkaa ei voi importata userscriptistä -> tavallinen olio samoilla kentillä (kuuntelija lukee vain kentät). Kuiskaustyyli (chatType 1).
  function omaRivi(teksti) {
    try {
      const RE = VW.NitroDevTools && VW.NitroDevTools.roomEngine, ses = RE && RE._roomSessionManager && RE._roomSessionManager.getSession(RE.activeRoomId);
      if (!RE || !RE.events || !ses) return false;
      RE.events.dispatchEvent({ type: 'RSCE_CHAT_EVENT', session: ses, objectId: ses.ownRoomIndex, message: teksti, chatType: 1, style: 0, chatColours: '', links: null,
        extraParam: -1, prefixText: '', prefixColor: '', prefixIcon: '', prefixEffect: '', prefixFont: '', nickIcon: '', displayOrder: 'icon-prefix-name' });
      return true;
    } catch (e) { return false; }
  }
  function aseta(uusi) {
    tila = uusi; paalla = laske(); try { VW.localStorage.setItem(AVAIN, tila); } catch (e) {}
    asenna(); const n = pyyhi(); roundPixels(); teravoita();
    omaRivi(paalla ? 'aa: päällä (linear)' : 'aa: pois');
    return 'AA ' + (paalla ? 'PÄÄLLÄ (linear)' : 'POIS (terävä, nearest)') + (asennettu ? ' · ' + n + ' tekstuuria' : ' — odottaa huonetta');
  }
  // 0.7.0: sivun zoom muuttaa DPR:ää ja kuvan skaalaa, mutta tila ei riipu siitä -> resize-kuuntelijaa ei enää tarvita (auto poistui).

  // :aa = päälle/pois, :aa off / :aa pois = sammuttaa aina.
  (VW.kuplaKomennotJono = VW.kuplaKomennotJono || []).push([['aa'],
    (teksti, sanat) => /^(off|pois)$/i.test(sanat[0] || '') ? aseta('off') : aseta(paalla ? 'off' : 'on'),
    'pehmennys: :aa päälle/pois (linear) · :aa off sammuttaa', 'AA-kytkin']);
  // Ilman kuplaKomennot-lisäosaa (Res): oma Enter-käsittelijä kuten wired-piilo.user.js.
  const komennotHoitaa = n => { try { return !!(VW.kuplaKomennot && VW.kuplaKomennot.lista().some(k => k.nimet.includes(n))); } catch (e) { return false; } };
  function ilmoita(teksti) {
    const d = document.createElement('div'); d.textContent = teksti;
    d.style.cssText = 'position:fixed;left:50%;top:70px;transform:translateX(-50%);z-index:99999;background:rgba(20,25,30,.95);color:#fff;padding:6px 12px;border-radius:6px;font:13px sans-serif;pointer-events:none';
    document.body.appendChild(d); setTimeout(() => d.remove(), 2500);
  }
  document.addEventListener('keydown', ev => {
    if (ev.key !== 'Enter' || ev.isComposing || VW.__kuplaAAsuku !== SUKU) return;
    const t = ev.target; if (!t || (t.tagName !== 'INPUT' && t.tagName !== 'TEXTAREA')) return;
    const m = /^\s*:aa(?:\s+(\S+))?\s*$/i.exec(t.value || ''); if (!m || komennotHoitaa('aa')) return;
    ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation();
    try { const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(t), 'value').set;
      setter.call(t, ''); t.dispatchEvent(new Event('input', { bubbles: true })); } catch (err) { t.value = ''; }
    ilmoita(/^(off|pois)$/i.test(m[1] || '') ? aseta('off') : aseta(paalla ? 'off' : 'on'));
  }, true);
  VW.kuplaAA = { versio: '0.7.1', pois: () => { VW.__kuplaAAsuku++; }, aseta, tila: () => ({ tila, paalla, asennettu, dpr: VW.devicePixelRatio }) };
})();
