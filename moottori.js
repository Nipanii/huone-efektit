// ==UserScript==
// @name         Huoneskriptit (moottori)
// @version      0.5.1
// @match        https://kupla.cc/*
// @grant        none
// ==/UserScript==
// Moottori on pelkkä huoneskriptien LATAAJA. Siinä ei ole yhdenkään huoneen logiikkaa (kp 27.10. 17:04 "ne ei kuulu moottoriin",
// 17:05 "moottori piti olla se koodi joka loadaa scriptit"). Client (roomScripts.ts) hakee tämän tiedoston ja ajaa sen, jos
// // @version on uudempi kuin edellinen ajettu.
//
// Huoneeseen tullessa: hakee huoneet.json:n, ja jos huoneella on skriptejä, hakee ne ja ajaa: new Function('kupla', koodi)(api).
//   Sama sopimus kuin Resin Messenger-moottorissa (client/DarkUI/messenger-scripts/moottori.js), joten skriptit voi myöhemmin
//   siirtää sinne sellaisenaan. Skripti palauttaa funktion (tai olion jolla dispose()), jota kutsutaan kun huoneesta lähdetään.
// 15 s välein missä tahansa huoneessa: muuttunut tai huoneet.json:iin lisätty skripti käynnistetään (versiota ei tarvitse nostaa).
// 15 s välein aina: uudempi moottori (// @version) ajetaan tämän tilalle.
// Konsolissa: huoneskriptit.ajossa (mitä ajetaan) · huoneskriptit.loki · huoneskriptit.paivita(true) (hae ja käynnistä uudelleen)
(() => {
  const hs = { versio: '0.5.1', huone: 0, ajossa: new Map(), loki: [], pysaytetty: false };   // versio: myös 0.4.x:n itsepäivitys lukee tämän
  const POHJA = 'https://nipanii.github.io/huone-efektit/';
  const uudempi = (a, b) => { const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number);
    for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); return false; };

  // 0.4.x-moottori (miinat moottorin sisällä) pysäytetään: sen ajastimet pois ja window.miina pois, jolloin sen koukut tyhjenevät.
  const m = window.miina; let vanhaPois = false;
  if (m && (m._ajastin || m.ajastin)) { clearInterval(m.ajastin); clearInterval(m._ajastin); clearInterval(m._paivitys); if (window.miina === m) delete window.miina; vanhaPois = true; }

  // Sama tai uudempi moottori jo ajossa -> ei toista kopiota (client ja 0.4.x:n itsepäivitys voivat ajaa saman version kahdesti).
  const ed = window.huoneskriptit;
  if (ed && ed.versio && !ed.pysaytetty) {
    if (!uudempi(hs.versio, ed.versio)) { if (vanhaPois && ed.paivita) ed.paivita(true); return; }
    try { ed.pysayta(); } catch (err) { console.warn('[huoneskriptit] edellisen moottorin pysäytys epäonnistui', err); }
  }
  window.huoneskriptit = hs;

  const hae = async (polku) => { const v = await fetch(POHJA + polku + '?t=' + Date.now(), { cache: 'no-store' });
    if (!v.ok) throw new Error('HTTP ' + v.status + ' ' + polku); return v.text(); };
  const merkitse = (rivi) => { rivi.aika = new Date().toTimeString().slice(0, 8); hs.loki.push(rivi); if (hs.loki.length > 200) hs.loki.shift(); };

  const pysaytaSkripti = (avain) => { const s = hs.ajossa.get(avain); if (!s) return; hs.ajossa.delete(avain);
    try { if (s.stop) s.stop(); merkitse({ pysaytetty: avain }); } catch (err) { console.warn('[huoneskriptit] ' + avain + ' pysäytys epäonnistui', err); } };
  const pysaytaKaikki = () => { for (const k of [...hs.ajossa.keys()]) pysaytaSkripti(k); };
  const kaynnista = (avain, koodi, r) => {
    pysaytaSkripti(avain);
    let stop = null;
    const api = { roomId: () => r, moottori: hs.versio };
    try { const t = new Function('kupla', koodi)(api);
      stop = typeof t === 'function' ? t : (t && typeof t.dispose === 'function') ? () => t.dispose() : null; merkitse({ kaynnistetty: avain }); }
    catch (err) { console.warn('[huoneskriptit] ' + avain + ' kaatui', err); merkitse({ virhe: avain, viesti: String(err) }); }
    hs.ajossa.set(avain, { koodi, stop });
  };

  // Vain uusin haku saa käynnistää: huone voi vaihtua kesken haun, ja 15 s tiki voi osua huoneen vaihdon päälle.
  let kierros = 0;
  const paivita = hs.paivita = async (pakota) => {
    const oma = ++kierros, r = hs.huone, voimassa = () => oma === kierros && r === hs.huone && !hs.pysaytetty;
    try {
      const lista = JSON.parse(await hae('huoneet.json')); if (!voimassa()) return;
      const polut = (((lista.huoneet || {})[String(r)] || {}).skriptit) || [];
      const avaimet = new Set(polut.map(p => r + ':' + p));
      for (const k of [...hs.ajossa.keys()]) if (!avaimet.has(k)) pysaytaSkripti(k);
      for (const p of polut) {
        const koodi = await hae(p); if (!voimassa()) return;
        const k = r + ':' + p, nyt = hs.ajossa.get(k);
        if (!pakota && nyt && nyt.koodi === koodi) continue;
        kaynnista(k, koodi, r);
      }
    } catch (err) { console.warn('[huoneskriptit] haku epäonnistui', err); merkitse({ virhe: 'haku', viesti: String(err) }); }
  };

  // Huoneen vaihto: edellisen huoneen skriptit pysähtyvät heti, uuden huoneen skriptit haetaan.
  hs._huoneTiki = setInterval(() => {
    const e = window.NitroDevTools && window.NitroDevTools.roomEngine, r = (e && e.activeRoomId) || 0;
    if (r === hs.huone) return;
    pysaytaKaikki(); hs.huone = r; if (r > 0) paivita(true);
  }, 250);

  hs._tiki = setInterval(async () => {
    if (hs.pysaytetty) return;
    if (hs.huone > 0) paivita(false);   // 0.5.1: myös huoneessa jossa ei vielä ajeta mitään (kp 28.10. 00:11:49 "toivottavasti huoneeseen ei tarvii tulla uudelleen"): uusi huoneet.json-rivi käynnistyy ilman huoneen vaihtoa
    try { const t = await hae('moottori.js'), v = ((t.match(/\/\/\s*@version\s+([^\r\n]+)/) || [])[1] || '').trim();
      if (v && !hs.pysaytetty && uudempi(v, hs.versio)) { const L = window.huoneEfektiLataaja; if (L) L.koodi = t; (0, eval)(t); console.info('[huoneskriptit] moottori päivitetty', v); } } catch (err) {}
  }, 15000);

  hs.pysayta = () => { hs.pysaytetty = true; clearInterval(hs._huoneTiki); clearInterval(hs._tiki); pysaytaKaikki();
    if (window.huoneskriptit === hs) delete window.huoneskriptit; };
})();
