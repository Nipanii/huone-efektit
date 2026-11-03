// ==UserScript==
// @name         Kupla AA-kytkin
// @namespace    https://re-lab.local/kupla
// @match        https://kupla.cc/*
// @grant        none
// @run-at       document-idle
// @version      0.6.3
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
    VW.__kuplaAApaalla = paalla;
    const m = paalla ? 'linear' : 'nearest'; let n = 0;
    for (const s of lahteet()) if (s.style && s.style.scaleMode !== m) { s.style.scaleMode = m; s.style.update && s.style.update(); n++; }
    return n;
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
  const ajastin = setInterval(() => { if (asenna()) { clearInterval(ajastin); if (paalla) pyyhi(); } }, 2000);

  // 0.3.0 (kp 06:38 "erillinen kerros joka tuo jotain takas" · 06:39 "laita :aaN variantit"): terävöinti pehmennyksen päälle.
  //   SVG feConvolveMatrix huonecanvasille (CSS filter), taso 0-5 = reunojen paino. Mitattu robolla 06:39: 56 fps suodattimella.
  const TAVAIN = 'kupla.aa.teravyys', K = [0, 0.1, 0.2, 0.35, 0.5, 0.75];
  // 0.5.0 (kp 06:58 "aa = sama ku boon" · "aa<N> on sit meidän variaatiot"): taso -1 = puhdas Boon (pelkkä linear, ei suodatinta),
  //   0-5 = oma variaatio (gamma + terävöinti N). :aa / :aa on / :aa auto asettavat aina -1.
  let teravyys = -1; try { const v = VW.localStorage.getItem(TAVAIN); if (v !== null && v !== '') teravyys = Math.max(-1, Math.min(5, +v)); if (isNaN(teravyys)) teravyys = -1; } catch (e) {}
  function huoneCanvas() {
    let paras = null, a = 0;
    for (const c of document.querySelectorAll('canvas')) { const x = c.clientWidth * c.clientHeight; if (x > a) { a = x; paras = c; } }
    return paras;
  }
  // 0.4.0 (kp 06:44 "blendaa nii et vaalentaa eikä tummenna"): linear sekoittaa sRGB-arvoja, joten tummat ääriviivat leviävät ja kuva
  //   tummuu. Gamma < 1 nostaa keskisävyjä (likimain sekoitus lineaarisessa valossa), aina kun pehmennys on päällä.
  const GAMMA = 0.94; // 0.4.3: 0.85 oli kp:lle "överi kirkas" (06:57)
  function teravoita() {
    const vari = paalla && teravyys >= 0, k = vari ? K[teravyys] : 0;
    let d = document.getElementById('kupla-aa-svg');
    if (vari && !d) {
      d = document.createElement('div'); d.id = 'kupla-aa-svg'; d.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
      const g = `type="gamma" amplitude="1" offset="0" exponent="${ GAMMA }"`;
      d.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg"><filter id="kupla-teravoita" color-interpolation-filters="sRGB"><feComponentTransfer><feFuncR ${ g }/><feFuncG ${ g }/><feFuncB ${ g }/></feComponentTransfer><feConvolveMatrix order="3" preserveAlpha="true"/></filter></svg>`;
      document.body.appendChild(d);
    }
    // 0.4.4: SVG jää sivulle versiosta toiseen -> gamma asetetaan joka kierroksella, ei vain luodessa
    // 0.6.2 (kp 07:01 "ei saa gamma juttuu pois et koittaa vaa terävöintii"): gamma vain :aa2:ssa, :aa3-7 pelkkä terävöinti.
    if (d) d.querySelectorAll('feFuncR,feFuncG,feFuncB').forEach(e => e.setAttribute('exponent', String(teravyys === 0 ? GAMMA : 1)));
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
  const ajastinT = setInterval(() => { if (VW.__kuplaAAsuku !== SUKU) return clearInterval(ajastinT); teravoita(); }, 2000);

  function aseta(uusi, taso) {
    tila = uusi; paalla = laske(); try { VW.localStorage.setItem(AVAIN, tila); } catch (e) {}
    if (taso !== undefined) { teravyys = taso; try { VW.localStorage.setItem(TAVAIN, String(taso)); } catch (e) {} }
    asenna(); const n = pyyhi(); teravoita();
    const nimi = tila === 'auto' ? 'AUTO (DPR ' + (VW.devicePixelRatio || 1) + ' -> ' + (paalla ? 'pehmeä' : 'terävä') + ')'
      : (paalla ? 'PÄÄLLÄ (pehmeä, linear)' : 'POIS (terävä, nearest)');
    return 'AA ' + nimi + (paalla && teravyys >= 0 ? ' · :aa' + (teravyys + 2) + (teravyys ? ' (terävöinti ' + teravyys + ')' : ' (gamma)') : (paalla ? ' · kuten Boon' : '')) + (asennettu ? ' · ' + n + ' tekstuuria' : ' — odottaa huonetta');
  }
  VW.addEventListener('resize', () => { const p = laske(); if (p !== paalla) { paalla = p; pyyhi(); teravoita(); } });
  // 0.5.1 (kp 06:58 "kirjottamal saman komennon uusiks"): sama :aaN uudestaan sammuttaa.
  const vaihdaN = t => (paalla && teravyys === t) ? aseta('off', -1) : aseta('on', t);
  // 0.6.0 (kp 06:59 "miks aa0 alkaen, aa2 on seuraava"): :aa = :aa1 = Boon, omat alkavat :aa2:sta (sisäinen taso = N - 2).
  for (let t = 0; t <= 5; t++) (VW.kuplaKomennotJono = VW.kuplaKomennotJono || []).push([['aa' + (t + 2)], () => vaihdaN(t),
    'pehmennys + ' + (t ? 'terävöinti ' + t : 'gamma'), 'AA-kytkin']);
  (VW.kuplaKomennotJono = VW.kuplaKomennotJono || []).push([['aa', 'aa1'],
    // 0.5.0 (kp 06:58 "ei autoo, ei aa on aa off · on vaa :aa toggle on/off")
    // 0.6.1 (kp 07:00 "aa off kans vaihtoehtona"): :aa off sammuttaa aina, mikä tahansa variaatio päällä.
    (teksti, sanat) => /^(off|pois)$/i.test(sanat[0] || '') ? aseta('off', -1) : aseta(paalla ? 'off' : 'on', -1),
    'pehmennys kuten Boon: :aa päälle/pois · :aa off sammuttaa kaiken · omat variaatiot :aa2 ... :aa7 (yksi kerrallaan)', 'AA-kytkin']);
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
    const m = /^\s*:aa([1-7])?(?:\s+(\S+))?\s*$/i.exec(t.value || ''); if (!m || komennotHoitaa('aa' + (m[1] || ''))) return;
    ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation();
    try { const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(t), 'value').set;
      setter.call(t, ''); t.dispatchEvent(new Event('input', { bubbles: true })); } catch (err) { t.value = ''; }
    if (m[1] !== undefined) return ilmoita(+m[1] === 1 ? aseta(paalla ? 'off' : 'on', -1) : vaihdaN(+m[1] - 2));
    ilmoita(/^(off|pois)$/i.test(m[2] || '') ? aseta('off', -1) : aseta(paalla ? 'off' : 'on', -1));
  }, true);
  VW.kuplaAA = { versio: '0.6.3', pois: () => { VW.__kuplaAAsuku++; }, aseta, tila: () => ({ tila, paalla, asennettu, dpr: VW.devicePixelRatio }) };
})();
