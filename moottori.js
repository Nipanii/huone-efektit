// ==UserScript==
// @name         Huone-efektit (miinarata ym.)
// @version      0.4.13
// @match        https://kupla.cc/*
// @grant        none
// ==/UserScript==
// Hakee kp:n Pagesista listan huoneista joissa on efektejä (huoneskriptit/efektit.json) aina kun huone vaihtuu.
// Laukaisu 'astu': kun hahmo astuu listatun furnin ruutuun, furnin oma animaatio (esim. fx_explosion) piirtyy hänen kohdalleen.
// Vain tässä clientissä: ei itemiä, ei pakettia. Kesto tulee listasta (kesto, ms).
// PROTOTYYPPIVAIHE: miina.kesto = 1200 konsolissa ohittaa listan keston testausta varten (poistetaan lopullisesta).
(() => {
  const LISTA = 'https://nipanii.github.io/huone-efektit/efektit.json';
  // 0.3.2: oikea ajastin on _ajastin, koska vanha 0.2.x pysäyttää window.miina.ajastin -kentän ajastimen latautuessaan.
  if (window.miina) { clearInterval(window.miina.ajastin); clearInterval(window.miina._ajastin); clearInterval(window.miina._paivitys); }
  const cfg = window.miina = { versio: '0.4.13', lennata: true, muunnelma: null, kesto: null, vali: 1500, piilotaPohja: true, loki: [], lista: null };
  let seuraavaId = -930001;
  const edellinen = new Map(), viimeksi = new Map(), paikka = new Map();
  let huone = null, saannot = [], haetaan = false;

  const data = (st) => ({ flags: 0, uniqueNumber: 0, uniqueSeries: 0, rarityLevel: -1, state: 0,
    writeRoomObjectModel(m) { m.setValue('furniture_data_format', 0); m.setValue('furniture_data', st); },
    initializeFromRoomObjectModel() {}, parseWrapper() {}, getLegacyString() { return st; },
    compare() { return false; }, setString() {}, getValue() { return ''; } });

  cfg.rajayta = (x, y, z, furni = 'fx_explosion', kesto = 1500) => {
    const e = window.NitroDevTools && window.NitroDevTools.roomEngine; if (!e) return false;
    const r = e.activeRoomId, V = e.getRoomObjects(r, 100)[0]?.getLocation().constructor; if (!V) return false;
    const id = seuraavaId--, L = new V(x, y, z), D = new V(0), ms = cfg.kesto || kesto;
    if (!e.addFurnitureFloorByTypeName(r, id, furni, L, D, 0, data('0'), NaN, -1, 0, -1, '', true, false)) return false;
    const alku = performance.now();
    const piilo = cfg.piilotaPohja ? setInterval(() => { const o = e.getRoomObject(r, id, 10); if (!o) return; for (const s of o.visualization.sprites) if (/_a_\d+_\d+$/.test(s.name)) s.visible = false; }, 16) : null;
    // 0.3.7: tila 1 (animaatio) katosi jos se tuli ennen kuin visualisointi oli valmis -> vain pohja näkyi (kp 2/5). Odotetaan spritejä.
    let yrit = 0; const kaynnista = setInterval(() => { const o = e.getRoomObject(r, id, 10); yrit++;
      if ((o && o.visualization && o.visualization.sprites && o.visualization.sprites.length) || yrit > 30) { clearInterval(kaynnista); e.updateRoomObjectFloor(r, id, L, D, 1, data('1')); } }, 30);
    setTimeout(() => { clearInterval(piilo); e.removeRoomObjectFloor(r, id); cfg.loki.push({ piirretty: true, x, y, ms: Math.round(performance.now() - alku) }); }, ms);
    return true;
  };

  // 0.4.9 (kp 27.10. 12:16 "lisää scriptiin testinä"): hahmo lentää räjähdyksessä ilmaan pyörien. Vain omassa clientissä:
  //   paikallinen kopio hahmosta (negatiivinen id) miinaruutuun, oikea hahmo piiloon jos se on vielä ruudulla. Pois: miina.lennata = false
  let haamuId = -940001;
  // 0.4.12 (kp 12:30 "freeze hahmo telen jälkee kunnes animaatio on finished ja ei rendaa oikeeta hahmon sijaintii", Res "ei näkis itteänsä
  //   duplicatena"): lennon ajan oikea hahmo piilossa joka ruudussa (alpha 0, shooterin sävytyksen tapaan increaseUpdateCounter) ja sen
  //   sijaintipäivitykset pidätetään (__jaa); lopussa viimeisin päivitys ajetaan. Satunnaisuus (kp 12:29 "lay + spin", "randomiutta angles"):
  //   kaksi muunnelmaa ja satunnainen kaari. Siemen = hahmo + ruutu + 5 s ikkuna, joten eri clientit arpovat useimmiten saman.
  const lentavat = new Map();   // oid -> { args }
  cfg.__jaa = (rid, oid, args) => { const f = lentavat.get(oid); if (!f) return false; f.args = Array.prototype.slice.call(args); return true; };
  const arpa = (s) => () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const piilota = (o, talteen) => { const sp = (o && o.visualization && o.visualization.sprites) || [];
    for (const s of sp) { if (!talteen.has(s)) talteen.set(s, { a: s.alpha, v: s.visible }); if (s.alpha !== 0 || s.visible) { s.alpha = 0; s.visible = false; if (s.increaseUpdateCounter) s.increaseUpdateCounter(); } } };
  cfg.lenna = (oid, x, y, z) => {
    const e = window.NitroDevTools && window.NitroDevTools.roomEngine; if (!cfg.lennata || !e || oid == null || oid < 0 || lentavat.has(oid)) return false;
    const r = e.activeRoomId, o = e.getRoomObject(r, oid, 100); if (!o) return false;
    const V = o.getLocation().constructor, fig = o.model.getValue('figure'); if (!fig) return false;
    const rnd = arpa((oid * 73856093) ^ (Math.round(x) * 19349663) ^ (Math.round(y) * 83492791) ^ Math.floor(Date.now() / 5000));
    const arvo = rnd(), makaa = cfg.muunnelma ? cfg.muunnelma === "makaa" : arvo < 0.5, kulma = rnd() * Math.PI * 2, matka = 0.5 + rnd() * 1.0, h = 2.5 + rnd() * 2.5;
    const kierrokset = (1 + Math.floor(rnd() * 3)) * (rnd() < 0.5 ? -1 : 1), ms = 900 + Math.floor(rnd() * 600), alkuSuunta = Math.floor(rnd() * 8);
    const kieriminen = 2 + Math.floor(rnd() * 3);   // 0.4.12 (kp 12:42 "lay spin vähä bugged"): makuu piirtyy vain kahteen suuntaan, 8 suunnan pyöritys välkkyi -> kieritään 90/180 välillä
    const dx = Math.cos(kulma) * matka, dy = Math.sin(kulma) * matka;
    const g = haamuId--, z0 = z || 0, alku = performance.now();
    if (!e.addRoomObjectUser(r, g, new V(x, y, z0), new V(alkuSuunta * 45), alkuSuunta * 45, 1, fig)) return false;
    const f = { args: null }, talteen = new Map(); lentavat.set(oid, f);
    const asento = () => { try { const ho = e.getRoomObject(r, g, 100); if (makaa && ho && ho.model.getValue('figure_posture') !== 'lay') e.updateRoomObjectUserPosture(r, g, 'lay', ''); } catch (x) {} };
    asento(); piilota(o, talteen);
    const ajo = setInterval(() => {
      const t = Math.min(1, (performance.now() - alku) / ms), suunta = makaa ? (Math.floor(t * kieriminen) % 2 ? 180 : 90) : (((alkuSuunta + Math.floor(t * 8 * Math.abs(kierrokset)) * Math.sign(kierrokset)) % 8) + 8) % 8 * 45;
      try { e.updateRoomObjectUserLocation(r, g, new V(x + t * dx, y + t * dy, z0 + 4 * h * t * (1 - t)), null, false, 0, new V(suunta), suunta, true, false, 30); } catch (x) {}
      asento(); piilota(e.getRoomObject(r, oid, 100) || o, talteen);
      if (t >= 1) { clearInterval(ajo); try { e.removeRoomObjectUser(r, g); } catch (x) {}
        for (const [s, v] of talteen) { s.alpha = v.a; s.visible = v.v; if (s.increaseUpdateCounter) s.increaseUpdateCounter(); }
        lentavat.delete(oid); if (f.args) try { e.updateRoomObjectUserLocation.apply(e, f.args); } catch (x) {}
        cfg.loki.push({ lensi: oid, x, y, makaa, kulma: Math.round(kulma * 57.3), pidatetty: !!f.args }); }
    }, 30);
    return true;
  };

  // Haetaan lista tuoreena joka huoneeseen tullessa, jotta uudet huoneet tulevat mukaan ilman skriptin päivitystä.
  const lataa = async (r) => {
    haetaan = true;
    try {
      const j = await (await fetch(LISTA + '?t=' + Date.now(), { cache: 'no-store' })).json();
      cfg.lista = j;
      saannot = ((j.huoneet || {})[String(r)] || {}).efektit || [];
      saannot.forEach(s => { s.ruudut = null; });
      // 0.3.5: ensimmäinen räjähdys jäi näkymättä, koska efektin grafiikka latautuu vasta ensikäytössä -> esilataus kartan ulkopuolelle.
      for (const f of new Set(saannot.map(s => s.furni || 'fx_explosion'))) setTimeout(() => cfg.rajayta(-60, -60, 0, f, 3000), 500);
    } catch (err) { console.warn('[huone-efektit] listan haku epäonnistui', err); saannot = []; }
    haetaan = false;
  };

  // 0.4.0: kutsutaan updateRoomObjectUserLocation-koukusta (asennetaan kerran, delegoi tähän -> päivitys korvaa logiikan).
  cfg.__liike = (rid, oid, loc, tgt, kesto) => {
    if (rid !== huone || haetaan || !saannot.length || oid < 0) return;
    // 0.4.2: teleport-hyppy ilman räjähdystä 1,5 s sisällä = hukka -> lokiin (mista = edellinen sijainti/kohde), jotta hukka näkyy datana
    if (loc) { const ed = edellinen.get(oid); edellinen.set(oid, { x: loc.x, y: loc.y, z: loc.z, t: tgt ? [Math.round(tgt.x), Math.round(tgt.y)] : null });
      if (ed && Math.hypot(loc.x - ed.x, loc.y - ed.y) > 1.5 && Date.now() - (viimeksi.get(oid) || 0) > 1500) {
        // 0.4.8: nopea tele (Res 27.10. 12:09 "ei tuu jos vaihtaa wirediin nopean telen koska se näyttää eri efektin") ei anna efektiä 4,
        //   joten hyppy SUORAAN miinaruudusta (sijainti tai kohde) räjäyttää sen ruudun. Mitattu kp:n lokista: 5,15 ja 12,18 -> alku, 0 räjähdystä.
        const ehd = [[Math.round(ed.x), Math.round(ed.y)], ed.t].filter(Boolean);
        let osui = false;
        for (const [x, y] of ehd) { const s = saannot.find(s => s.ruudut && s.ruudut.has(x + ',' + y)); if (!s) continue;
          viimeksi.set(oid, Date.now()); cfg.loki.push({ u: oid, x, y, tapa: 'hyppy', viive: 0 });
          cfg.rajayta(x, y, ed.z || 0, s.furni, s.kesto); cfg.lenna(oid, x, y, ed.z || 0); osui = true; break; }
        if (!osui) cfg.loki.push({ u: oid, ohi: true, mista: [Math.round(ed.x), Math.round(ed.y)], kohde: ed.t, nyt: [Math.round(loc.x), Math.round(loc.y)] }); } }
    paikka.set(oid, { loc, tgt });
    for (const [P, tulossa] of [[tgt, true], [loc, false]]) {
      if (!P) continue; const x = Math.round(P.x), y = Math.round(P.y), k = x + ',' + y;
      const s = saannot.find(s => !s.efekti && s.ruudut && s.ruudut.has(k)); if (!s) continue;
      // 0.4.5: teleportin natiiviviiveen aikana hahmo ehtii astua 2-3 miinaruutuun (kp loki 8,18 -> 8,17 -> 8,16) -> yksi räjähdys per hahmo per cfg.vali
      const nyt = Date.now(); if (nyt - (viimeksi.get(oid) || 0) < cfg.vali) return;
      viimeksi.set(oid + '@' + k, nyt); viimeksi.set(oid, nyt);
      const viive = tulossa && loc && (Math.round(loc.x) !== x || Math.round(loc.y) !== y) ? (kesto > 0 ? kesto : 500) : 0;
      cfg.loki.push({ u: oid, x, y, tapa: tulossa ? 'kohde' : 'sijainti', viive });
      setTimeout(() => { cfg.rajayta(x, y, P.z, s.furni, s.kesto); cfg.lenna(oid, x, y, P.z); }, viive);
      return;
    }
  };
  // 0.4.6: säännöllä "efekti": N laukaisu on PALVELIMEN oma hetki: wired antaa hahmolle efektin N (teleport = 4) kun se rekisteröi astumisen,
  //   ja hahmon kohderuutu on silloin miinaruutu (mitattu robo 12,19 -> 12,18, teleportti ~1,5 s myöhemmin). kp 23:58 "teleport efekti tulee
  //   ennen teleporttia, siitä voisit tunnistaa". Ei arvausta sijainnista -> ei hukkia, ei tuplia natiiviviiveen aikana.
  // 0.4.7: efekti tulee JUURI ENNEN samassa nipussa olevaa liikepäivitystä (kohde = miinaruutu) -> arvioi vasta sen jälkeen.
  //   0.4.6 itsetesti: 8/8 teleporttia, 0 räjähdystä, koska paikka oli askeleen jäljessä (loc 10,20 tgt 10,19, miina 10,18).
  cfg.__efekti = (rid, oid, fx) => { setTimeout(() => cfg.__efektiNyt(rid, oid, fx), 60); };
  cfg.__efektiNyt = (rid, oid, fx) => {
    if (rid !== huone || haetaan || !saannot.length) return;
    const p = paikka.get(oid) || {};
    for (const s of saannot) {
      if (s.efekti !== fx || !s.ruudut) continue;
      for (const [P, tulossa] of [[p.tgt, true], [p.loc, false]]) {
        if (!P) continue; const x = Math.round(P.x), y = Math.round(P.y); if (!s.ruudut.has(x + ',' + y)) continue;
        const nyt = Date.now(); if (nyt - (viimeksi.get(oid) || 0) < cfg.vali) return; viimeksi.set(oid, nyt);
        const viive = tulossa && p.loc && (Math.round(p.loc.x) !== x || Math.round(p.loc.y) !== y) ? 500 : 0;
        cfg.loki.push({ u: oid, x, y, tapa: 'efekti' + fx, viive });
        setTimeout(() => { cfg.rajayta(x, y, P.z, s.furni, s.kesto); cfg.lenna(oid, x, y, P.z); }, viive);
        return;
      }
      cfg.loki.push({ u: oid, efekti: fx, ohi: true, loc: p.loc && [Math.round(p.loc.x), Math.round(p.loc.y)], tgt: p.tgt && [Math.round(p.tgt.x), Math.round(p.tgt.y)] });
    }
  };
  cfg._ajastin = setInterval(() => {
    // 0.3.2: vanha prototyyppi (0.2.x, ei versiota) käynnistyy lataajan jälkeen ja pysäyttää tämän -> otetaan valta takaisin.
    if (window.miina !== cfg) { const v = window.miina; if (!v) { clearInterval(cfg._ajastin); return; } // kumoa poisti -> pysähdy
      if (!v.versio) { if (v.ajastin) clearInterval(v.ajastin); window.miina = cfg; } }
    const e = window.NitroDevTools && window.NitroDevTools.roomEngine; if (!e) return;
    const r = e.activeRoomId;
    if (r !== huone) { huone = r; saannot = []; edellinen.clear(); if (r > 0) lataa(r); return; }
    if (haetaan || !saannot.length) return;
    for (const s of saannot) {
      if (s.laukaisu !== 'astu') continue;
      // 0.4.13: F5:n jälkeen furnin koko (furniture_size_x/y) puuttuu vielä ensimmäisillä tikeillä -> luettiin 1x1 ja joukko lukittui,
      //   joten vain 2x2-miinan kulmaruutu laukesi (kp 27.10. 16:57 "miinat ei räjähdä": moottorin joukossa 43 ruutua, oikea 172).
      //   Lasketaan uudelleen joka tiki kunnes jokainen furni JA sen koko löytyy, sen jälkeen 5 s välein (furnia voi siirtää).
      const nyt = Date.now(); if (s.ruudutValmis && nyt - (s.ruudutAika || 0) < 5000) continue;
      const set = new Set(); let kaikki = true;
      // 0.4.3: furni voi olla monta ruutua (681:n nurmi 2x2) -> kaikki sen ruudut, ei vain kulmaa (kp 23:52 "joku ruutu ei laukee ikinä")
      for (const id of s.furnit || []) { const o = e.getRoomObject(r, id, 10), L = o?.getLocation(); if (!L) { kaikki = false; continue; }
        const m = o.model, sx = Number(m?.getValue?.('furniture_size_x')), sy = Number(m?.getValue?.('furniture_size_y'));
        if (!(sx > 0) || !(sy > 0)) kaikki = false;
        const k = Math.round(o.getDirection?.()?.x || 0) % 180 === 90, w = (k ? sy : sx) || 1, h = (k ? sx : sy) || 1;
        for (let dx = 0; dx < w; dx++) for (let dy = 0; dy < h; dy++) set.add((Math.round(L.x) + dx) + ',' + (Math.round(L.y) + dy)); }
      if (set.size) s.ruudut = set;
      s.ruudutValmis = kaikki && set.size > 0; s.ruudutAika = nyt;
    }
    // 0.4.0: tunnistus suoraan jokaisesta sijaintipäivityksestä (kp 23:47 "tyhmä tunnistus"): 50 ms kysely ei nähnyt miinaruutua,
    //   kun palvelin lähetti askeleen miinalle ja teleportin samassa nipussa (loki: hyppy 10,16 -> 11,23 ilman miinaa).
    if (!e.__miinaEfektiKoukku) { const orig = e.updateRoomObjectUserEffect; e.__miinaEfektiKoukku = true;
      e.updateRoomObjectUserEffect = function (rid, oid, fx) { try { const k = window.miina && window.miina.__efekti; if (k) k(rid, oid, fx); } catch (x) {} return orig.apply(this, arguments); }; }
    if (!e.__miinaKoukku) { const orig = e.updateRoomObjectUserLocation; e.__miinaKoukku = true;
      e.updateRoomObjectUserLocation = function (rid, oid, loc, tgt) { try { const k = window.miina && window.miina.__liike; if (k) k(rid, oid, loc, tgt, arguments[10]); } catch (x) {} return orig.apply(this, arguments); }; }
    if (!e.__miinaKoukku2) { const ed = e.updateRoomObjectUserLocation; e.__miinaKoukku2 = true;   // 0.4.12: lennon ajan pidätys (ulompi kerros)
      e.updateRoomObjectUserLocation = function (rid, oid) { try { const k = window.miina && window.miina.__jaa; if (k && k(rid, oid, arguments)) return true; } catch (x) {} return ed.apply(this, arguments); }; }
  }, 50);
})();
// 0.3.4: itsepäivitys 60 s välein. Lataaja (#87) hakee vain kun huone-id vaihtuu, ja saman huoneen uudelleentulo ei vaihda sitä.
(() => {
  const cfg = window.miina, URL = 'https://nipanii.github.io/huone-efektit/moottori.js';
  // 0.4.4: vain UUDEMPAAN. Pages jää julkaisusta ~1 min jälkeen, ja "eri versio" vaihtoi 0.4.3 -> 0.4.2 takaisin (mitattu robolla).
  const uudempi = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); return false; };
  cfg._paivitys = setInterval(async () => {
    if (window.miina !== cfg) { clearInterval(cfg._paivitys); return; }
    try { const t = await (await fetch(URL + '?t=' + Date.now(), { cache: 'no-store' })).text(); const v = (t.match(/versio: '([^']*)'/) || [])[1];
      if (v && uudempi(v, cfg.versio)) { clearInterval(cfg._paivitys); const L = window.huoneEfektiLataaja; if (L) L.koodi = t; (0, eval)(t); console.info('[huone-efektit] päivitetty', v); } } catch (e) {}
  }, 15000); // 0.4.1: 60 s + Pagesin ~1 min julkaisuviive oli kp:lle liian hidas
})();
