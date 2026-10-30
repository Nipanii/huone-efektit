// Jaetut zombit (pohja: huoneet/684-zombit.js, wired-hybridi: huoneet/682.js).
// kp 30.10. 15:58-16:10: zombit yhteisiä kaikille huoneessa olijoille, jahtaavat ketä tahansa pelaajaa (hitainta; ei botteja eikä
//   Herra-Robottia 245). Ei kiinteitä spawneja: zombi syntyy kävelykelpoiselle lattiaruudulle mahdollisimman kauas kaikista pelaajista
//   (BFS-reittietäisyys, ei linnuntie), deterministisesti siemenestä + tikistä, ei ovelle eikä alle ASETUS.oviEtaisyys ruudun päähän
//   ovesta. Kiinni saanut zombi syntyy seuraavalla tikillä samalla säännöllä uudelleen.
//   Kiinnijäänti -> ovelle wired-script-hybridillä: kun zombi saa OMAN pelaajan kiinni, skripti lähettää salaisen sanan (ASETUS.salasana)
//   tavallisena chat-viestinä ja piilottaa sekä suun liikkeen (handleMessages-kaikunielu) että puhekuplan (MutationObserver), kuten 682.js.
//   Huoneen wired (wf_trg_says_something [1,1,0] -> wf_act_teleport_to) hoitaa siirron ovelle. Ei 7016-muuttujateleporttia.
//   Ei aseita, ei lobbya, ei vihreää lyhtyä, ei piikkejä, ei ansaa (ansa: null), ei :safe-poikkeusta muille kuin ASETUS.turvassa-listalle.
// Konsolissa: zombit.loki · zombit.zombit · zombit.kohde · zombit.ovi · zombit.safe(true|false) · zombit.asetus · zombit.kuva()
const ASETUS = {
  maara: 3,            // zombien määrä
  tikki: 1000,         // ms per ruutu (pelaaja 500 ms/ruutu -> zombi 2x hitaampi)
  epookki: 300000,     // ms; uusi aalto + hajonnan raja
  ikkuna: 10000,       // ms; "hitain" mitataan tältä ajalta
  kohdeTapa: 'hitain', // kohdelogiikka ('hitain' = pienin kuljettu matka ikkunan aikana, tasapelissä pienin käyttäjä-id)
  ovi: { x: null, y: null }, // täytetään huoneesta mitattuna; jos null, luetaan clientin huonemallista (vain spawn-etäisyyteen)
  oviEtaisyys: 10,     // ruutua (reittietäisyys): ei ovelle eikä alle N ruudun päähän ovesta
  kaukana: 10,         // ruutua (reittietäisyys): vähimmäisetäisyys pelaajista syntyessä (jos mahdollista)
  hajonta: 3,          // ruutua: syntyruutu valitaan kauimpien ruutujen kärjestä (maxEtaisyys - hajonta .. maxEtaisyys)
  ansa: null,          // ei ansaa
  lattiaYli: 0.3,      // zombi kävelee ruudulla jonka pino on enintään näin paljon lattian yli
  kohteet: null,       // null = jahtaa ketä tahansa pelaajaa (ei SALLITUT-rajausta)
  eiKohteena: [245],   // Herra-Robotti (user id 245) ja botit eivät ole kohteita
  turvassa: [],        // käyttäjä-id:t joille :safe-poikkeus on sallittu (oletus tyhjä)
  salasana: 'zk684',   // salainen sana jonka skripti sanoo kiinnijäädessä (wired: wf_trg_says_something -> wf_act_teleport_to)
  kuolemaLukko: 5000,  // ms; lukko ettei sama kiinnijäänti lähetä sanaa monta kertaa
  siemen: 684,         // deterministisen satunnaislukugeneraattorin siemen
  figuuri: 'hd-11509-1461.hr-3714-45.ch-3530-1330.lg-11495-1408.sh-3720-82',   // varalla; oikea luetaan huoneen Zombie-botilta
};

const e = window.NitroDevTools && window.NitroDevTools.roomEngine;
const huone = Number((kupla && kupla.roomId && kupla.roomId()) || (e && e.activeRoomId)) || 0;
const dv = (o, k) => { const d = o && Object.getOwnPropertyDescriptor(o, k); return d && !d.get ? d.value : undefined; };
const omaId = () => { const s = e && dv(e, '_sessionDataManager'); return Number((s && (dv(s, '_userId') || s.userId)) || 0); };
if (!e || !huone) return () => {};

const tila = window.zombit = { versio: 'zombit-jaettu 1', huone, asetus: ASETUS, zombit: [], kohde: null, ovi: null, loki: [], kuolemat: 0, virheet: 0, k: 0 };
const lokiin = o => { o.t = new Date().toTimeString().slice(0, 8); tila.loki.push(o); if (tila.loki.length > 200) tila.loki.shift(); };
const MUISTI = 'zombit.' + huone + '.safe';
const saaSafe = () => Array.isArray(ASETUS.turvassa) && ASETUS.turvassa.includes(omaId());
let safe = false; try { if (saaSafe()) safe = sessionStorage.getItem(MUISTI) === '1'; } catch (x) {}
tila.safe = (v) => {
  if (v === undefined) return safe && saaSafe();
  if (!saaSafe()) { lokiin({ safe: 'estetty (ei ASETUS.turvassa-listalla)', id: omaId() }); return false; }
  safe = !!v; try { sessionStorage.setItem(MUISTI, safe ? '1' : '0'); } catch (x) {}
  lokiin({ safe }); return safe;
};

// ---- yhteys ja istunto
const istunto = () => { const sm = dv(e, '_roomSessionManager'); return sm && sm.getSession && sm.getSession(huone); };
const omaIndeksi = () => {
  const s = istunto(), i = s && s.ownRoomIndex; if (i != null && i >= 0) return i;
  const ud = s && s.userDataManager, sd = dv(e, '_sessionDataManager') || {}, id = Number(sd._userId || sd.userId || 0), nimi = String(sd._name || sd.userName || '').trim().toLowerCase();
  if (!ud || !ud.getUserDataByIndex || (!id && !nimi)) return null;
  for (const o of e.getRoomObjects(huone, 100) || []) { const u = o && ud.getUserDataByIndex(o.id);
    if (u && ((id > 0 && Number(u.webID) === id) || (nimi && String(u.name || '').trim().toLowerCase() === nimi))) return o.id; }
  return null;
};
const yhteys = () => {
  const nahty = new Set(); let c = null;
  const etsi = (o, d) => { if (!o || c || d > 4 || typeof o !== 'object' || nahty.has(o)) return; nahty.add(o);
    if (Object.getOwnPropertyDescriptor(o, '_cryptoState')) { c = o; return; }
    for (const k of Object.getOwnPropertyNames(o)) { const de = Object.getOwnPropertyDescriptor(o, k); if (de && !de.get && de.value && typeof de.value === 'object') etsi(de.value, d + 1); } };
  etsi(dv(e, '_roomSessionManager'), 0); return c;
};

// ---- ovi: 1) ASETUS.ovi, 2) RoomEntryTileMessageEvent (1664), 3) room_map_data.doors[0], 4) istunto._doorX/doorX, muuten null
const lueOvi = (W, H) => {
  const kelpaa = (x, y, lahde) => (x != null && y != null && isFinite(x) && isFinite(y) && x >= 0 && y >= 0 && (!W || (x < W && y < H)))
    ? { x: Math.floor(Number(x)), y: Math.floor(Number(y)), lahde } : null;
  if (ASETUS.ovi && ASETUS.ovi.x != null && ASETUS.ovi.y != null) {
    const a = kelpaa(ASETUS.ovi.x, ASETUS.ovi.y, 'asetus'); if (a) return a;
  }
  try {
    const c = yhteys(), msgs = c && dv(c, '_messages'), ev = msgs && msgs.getEvents && msgs.getEvents(1664), p = ev && ev[0] && ev[0].parser;
    const a = p && kelpaa(p.x, p.y, 'paketti1664'); if (a) return a;
  } catch (x) {}
  try {
    const ro = e.getRoomOwnObject && e.getRoomOwnObject(huone), rm = ro && ro.model && ro.model.getValue('room_map_data'), d = rm && Array.isArray(rm.doors) && rm.doors[0];
    const a = d && kelpaa(d.x, d.y, 'room_map_data'); if (a) return a;
  } catch (x) {}
  try {
    const s = istunto(), a = s && kelpaa(s._doorX ?? s.doorX, s._doorY ?? s.doorY, 'istunto'); if (a) return a;
  } catch (x) {}
  return null;
};

// ---- satunnaisuus ja ruudukko
const arpa = (n) => { let a = (n >>> 0) || 1; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const NAAP = [[0, -1], [1, 0], [0, 1], [-1, 0], [1, -1], [1, 1], [-1, 1], [-1, -1]];   // kiinteä järjestys = sama valinta kaikilla
let ruudukko = null;

// Monilähteinen BFS-reittietäisyys kävelykelpoisella ruudukolla (kulman oikaisu estetty).
const bfsKentta = (W, H, ok, pisteet) => {
  const d = new Int32Array(W * H).fill(-1), jono = [];
  const alku = (x, y) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return false;
    const i = y * W + x; if (!ok[i]) return false;
    if (d[i] < 0) { d[i] = 0; jono.push(i); }
    return true;
  };
  for (const p of pisteet || []) if (p && isFinite(p.x) && isFinite(p.y)) {
    const rx = Math.round(p.x), ry = Math.round(p.y);
    if (!alku(rx, ry)) for (const [dx, dy] of NAAP) alku(rx + dx, ry + dy);
  }
  for (let q = 0; q < jono.length; q++) {
    const i = jono[q], x = i % W, y = (i - x) / W;
    for (const [dx, dy] of NAAP) {
      const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = ny * W + nx;
      if (ok[j] && d[j] < 0 && (dx === 0 || dy === 0 || (ok[y * W + nx] && ok[ny * W + x]))) { d[j] = d[i] + 1; jono.push(j); }
    }
  }
  return { d, lahteita: jono.length };
};
const kentta = (kx, ky) => bfsKentta(ruudukko.W, ruudukko.H, ruudukko.ok, [{ x: kx, y: ky }]).d;

const rakenna = () => {   // zombien kävelyruudut: perustason lattia (|korkeus| < 0.5), matala pino; yhteys oveen tai suurin yhtenäinen lattia-alue
  const hm = e.getFurnitureStackingHeightMap(huone), wg = e.getLegacyWallGeometry(huone); if (!hm || !wg) return null;
  const W = hm.width, H = hm.height, ok = new Uint8Array(W * H), z = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x; if (!wg.isRoomTile(x, y) || (hm._isRoomTile && !hm._isRoomTile[i])) continue;
    const lattia = wg.getHeight(x, y), pino = hm.getTileHeight(x, y); z[i] = pino;
    if (Math.abs(lattia) < 0.5 && pino - lattia <= ASETUS.lattiaYli) ok[i] = 1;
  }
  const ovi = lueOvi(W, H); tila.ovi = ovi;
  const yht = new Uint8Array(W * H), jono = [];
  if (ovi) {
    const d0 = ovi.y * W + ovi.x;
    if (ok[d0]) { yht[d0] = 1; jono.push(d0); }
    else for (const [dx, dy] of NAAP) {
      const nx = ovi.x + dx, ny = ovi.y + dy;
      if (nx >= 0 && ny >= 0 && nx < W && ny < H && ok[ny * W + nx] && !yht[ny * W + nx]) { yht[ny * W + nx] = 1; jono.push(ny * W + nx); }
    }
  }
  for (let q = 0; q < jono.length; q++) {
    const i = jono[q], x = i % W, y = (i - x) / W;
    for (const [dx, dy] of NAAP) {
      const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = ny * W + nx;
      if (ok[j] && !yht[j] && (dx === 0 || dy === 0 || (ok[y * W + nx] && ok[ny * W + x]))) { yht[j] = 1; jono.push(j); }
    }
  }
  // Jos ovea ei tunneta tai ovi on eri kerroksessa (esim. 684:n ylätaso z=7), valitaan suurin yhtenäinen perustason lattia-alue.
  if (!jono.length) {
    const nahty = new Uint8Array(W * H); let paras = [];
    for (let i0 = 0; i0 < W * H; i0++) {
      if (!ok[i0] || nahty[i0]) continue;
      const komp = [i0]; nahty[i0] = 1;
      for (let q = 0; q < komp.length; q++) {
        const i = komp[q], x = i % W, y = (i - x) / W;
        for (const [dx, dy] of NAAP) {
          const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const j = ny * W + nx;
          if (ok[j] && !nahty[j] && (dx === 0 || dy === 0 || (ok[y * W + nx] && ok[ny * W + x]))) { nahty[j] = 1; komp.push(j); }
        }
      }
      if (komp.length > paras.length) paras = komp;
    }
    for (const i of paras) yht[i] = 1;
  }
  const ruudut = []; for (let i = 0; i < W * H; i++) if (yht[i]) ruudut.push(i);
  const oviBfs = ovi ? bfsKentta(W, H, yht, [ovi]) : null;
  return { W, H, ok: yht, z, ruudut, ovi, dOvi: oviBfs && oviBfs.lahteita ? oviBfs.d : null };
};
const ansaRuutu = () => {
  if (!ASETUS.ansa) return null;
  try { const o = e.getRoomObject(huone, ASETUS.ansa.furni, 10), L = o && o.getLocation(); if (L) return { x: Math.round(L.x), y: Math.round(L.y) }; } catch (x) {}
  return { x: ASETUS.ansa.x, y: ASETUS.ansa.y };
};

// ---- pelaajat (palvelimen jakama syöte; vain oikeat pelaajat, ei botteja)
const onKohde = p => !!p && !(Array.isArray(ASETUS.eiKohteena) && ASETUS.eiKohteena.includes(p.id)) && (!Array.isArray(ASETUS.kohteet) || ASETUS.kohteet.includes(p.id));
const pelaajat = () => {
  const s = istunto(), ud = s && s.userDataManager, out = [];
  for (const o of e.getRoomObjects(huone, 100) || []) {
    if (!o || o.id < 0 || String(o.type) !== 'user') continue;
    const u = ud && ud.getUserDataByIndex && ud.getUserDataByIndex(o.id);
    if (!u || (u.type != null && Number(u.type) !== 1)) continue;   // userType 1 = oikea pelaaja (botit 3/4, lemmikit 2 pois)
    const id = Number(u.webID) || 0; if (!id) continue;
    const L = o.getLocation(); if (!L) continue;
    out.push({ id, i: o.id, x: Math.round(L.x), y: Math.round(L.y), nimi: u.name });
  }
  return out.sort((a, b) => a.id - b.id);
};

// Tila säilyy skriptin uudelleenlatauksen yli (push käynnistää skriptin uudelleen ~15 s välein).
const SAILO = (window.__zombitJaettu && window.__zombitJaettu.huone === huone)
  ? window.__zombitJaettu
  : (window.__zombitJaettu = { huone, E: -1, K: -1, zombit: [], historia: new Map() });
const historia = SAILO.historia;   // id -> [{k,x,y}]
const kirjaa = (k, P) => {
  const n = Math.max(1, Math.round(ASETUS.ikkuna / ASETUS.tikki));
  for (const p of P) {
    let h = historia.get(p.id); if (!h) historia.set(p.id, h = []);
    h.push({ k, x: p.x, y: p.y }); while (h.length && h[0].k <= k - n) h.shift();
  }
  for (const id of [...historia.keys()]) if (!P.some(p => p.id === id)) historia.delete(id);
};
const liike = (id) => {
  const h = historia.get(id) || []; let s = 0, hyppy = 0;
  for (let i = 1; i < h.length; i++) {
    const a = Math.max(Math.abs(h[i].x - h[i - 1].x), Math.abs(h[i].y - h[i - 1].y));
    s += a; if (a > hyppy) hyppy = a;
  }
  return { s, hyppy };
};
const hitain = (P) => {
  const { W, H, ok } = ruudukko; let paras = null;
  for (const p of P) {
    if (!onKohde(p)) continue;
    let tavoitettava = false;
    for (const [dx, dy] of [[0, 0]].concat(NAAP)) {
      const x = p.x + dx, y = p.y + dy;
      if (x >= 0 && y >= 0 && x < W && y < H && ok[y * W + x]) { tavoitettava = true; break; }
    }
    if (!tavoitettava) continue;   // yläkerroksessa tai muualla minne zombi ei pääse
    // Teleportannut (yli 3 ruutua tikissä = kuoli ja siirtyi ovelle, tai tuli huoneeseen) ei ole kohde ikkunan aikana.
    const l = liike(p.id); if (l.hyppy > 3) continue;
    const m = l.s; if (!paras || m < paras.m) paras = { ...p, m };   // P on id-järjestyksessä -> tasapelissä pienin id
  }
  return paras;
};

// Spawn ilman kiinteitä pisteitä: kävelykelpoinen lattiaruutu mahdollisimman kaukana kaikista pelaajista (BFS-reittietäisyys),
//   ei ovelle eikä alle ASETUS.oviEtaisyys ruudun päähän ovesta, deterministisesti siemenestä + tikistä.
const kaukainen = (P, rnd, varattu) => {
  const { W, H, ok, ruudut, ovi, dOvi } = ruudukko, a = ansaRuutu(), minOvi = Math.max(1, Number(ASETUS.oviEtaisyys) || 0);
  let ehdokkaat = ruudut.filter(i => {
    const x = i % W, y = (i - x) / W;
    if (a && x === a.x && y === a.y) return false;
    if (ovi && x === ovi.x && y === ovi.y) return false;
    return true;
  });
  if (!ehdokkaat.length) ehdokkaat = ruudut.slice();
  if (dOvi) {
    const kauasOvesta = ehdokkaat.filter(i => dOvi[i] >= minOvi);
    if (kauasOvesta.length) ehdokkaat = kauasOvesta;
    else {
      let maxOvi = -1; for (const i of ehdokkaat) if (dOvi[i] > maxOvi) maxOvi = dOvi[i];
      if (maxOvi > 0) ehdokkaat = ehdokkaat.filter(i => dOvi[i] >= Math.max(1, maxOvi - 2));
    }
  }
  if (varattu && varattu.size) {
    const vapaat = ehdokkaat.filter(i => !varattu.has(i));
    if (vapaat.length) ehdokkaat = vapaat;
  }
  const K = (P || []).filter(onKohde), lahteet = K.length ? K : (P || []);
  const { d: dP, lahteita } = bfsKentta(W, H, ok, lahteet);
  if (!lahteita) {
    const v = ehdokkaat[Math.floor(rnd() * ehdokkaat.length)];
    return { x: v % W, y: (v - v % W) / W };
  }
  const pisteet = ehdokkaat.map(i => [dP[i], i]);
  pisteet.sort((p, q) => q[0] - p[0] || p[1] - q[1]);   // suurin reittietäisyys ensin, tasapelissä ruutuindeksi
  const maxD = pisteet[0][0], kaukana = Math.max(1, Number(ASETUS.kaukana) || 10), hajonta = Math.max(0, Number(ASETUS.hajonta ?? 3));
  const raja = Math.max(Math.min(kaukana, maxD), maxD - hajonta);
  const joukko = pisteet.filter(p => p[0] >= raja);
  const valinta = joukko.length ? joukko : pisteet.slice(0, Math.min(20, pisteet.length));
  const v = valinta[Math.floor(rnd() * valinta.length)][1];
  return { x: v % W, y: (v - v % W) / W };
};

// ---- simulaatio (deterministinen)
const perusSiemen = () => Number(ASETUS.siemen) || huone || 684;
const synny = (k, P) => {
  const { W } = ruudukko, s0 = perusSiemen(), varattu = new Set(), z = [];
  for (let n = 0; n < ASETUS.maara; n++) {
    const r = kaukainen(P, arpa(s0 * 7919 + k * 101 + n), varattu);
    varattu.add(r.y * W + r.x);
    z.push({ n, x: r.x, y: r.y, px: r.x, py: r.y, kuoli: -1, suunta: 4 });
  }
  return z;
};
const askel = (k, Z, P) => {
  kirjaa(k, P);
  const a = ansaRuutu(), kohde = hitain(P), d = kohde ? kentta(kohde.x, kohde.y) : null, { W, H, ok } = ruudukko, varattu = new Set(), s0 = perusSiemen();
  for (const z of Z) if (z.kuoli < 0) varattu.add(z.y * W + z.x);
  for (const z of Z) {
    z.px = z.x; z.py = z.y;
    if (z.kuoli >= 0) {
      const r = kaukainen(P, arpa(s0 * 31 + k * 101 + z.n), varattu);
      z.x = z.px = r.x; z.y = z.py = r.y; z.kuoli = -1; z.syo = false; z.synty = k;
      varattu.add(z.y * W + z.x); continue;
    }
    if (P.some(p => onKohde(p) && p.x === z.x && p.y === z.y)) {
      z.kuoli = k; z.syo = true; continue;
    }
    varattu.delete(z.y * W + z.x);
    if (d) {
      let paras = null; const nyt = d[z.y * W + z.x];
      for (const [dx, dy] of NAAP) {
        const x = z.x + dx, y = z.y + dy, j = y * W + x;
        if (x < 0 || y < 0 || x >= W || y >= H || d[j] < 0 || varattu.has(j)) continue;
        if ((nyt < 0 || d[j] < nyt) && (!paras || d[j] < paras.d)) paras = { x, y, d: d[j], dx, dy };
      }
      if (paras) { z.x = paras.x; z.y = paras.y; z.suunta = suunnaksi(paras.dx, paras.dy); }
    }
    varattu.add(z.y * W + z.x);
    if (a && z.x === a.x && z.y === a.y) z.kuoli = k;
    // Kiinni saatu: zombi "syö" tämän tikin ja syntyy seuraavalla tikillä kauas kaikista pelaajista.
    else if (P.some(p => onKohde(p) && ((p.x === z.x && p.y === z.y) || (!ok[p.y * W + p.x] && kohde && p.id === kohde.id && Math.max(Math.abs(z.x - p.x), Math.abs(z.y - p.y)) <= 1)))) {
      z.kuoli = k; z.syo = true;
    }
  }
  return kohde;
};
const suunnaksi = (dx, dy) => ({ '0,-1': 0, '1,-1': 1, '1,0': 2, '1,1': 3, '0,1': 4, '-1,1': 5, '-1,0': 6, '-1,-1': 7 })[dx + ',' + dy] ?? 4;

// ---- piirto (paikalliset hahmot negatiivisilla id:illä, vain tässä clientissä)
let V = null, figuuri = ASETUS.figuuri, seuraavaId = -950001;
const valmistele = () => {
  const s = istunto(), ud = s && s.userDataManager; let loydetty = false;
  for (const o of [...(e.getRoomObjects(huone, 100) || [])].sort((a, b) => a.id - b.id)) {
    if (!V && o.getLocation) V = o.getLocation().constructor;
    const u = ud && ud.getUserDataByIndex && ud.getUserDataByIndex(o.id);
    if (!loydetty && u && /zombi/i.test(String(u.name || '')) && /bot/i.test(String(o.type))) {
      const f = o.model && o.model.getValue('figure'); if (f) { figuuri = f; loydetty = true; }
    }
  }
  if (!V) { const f = (e.getRoomObjects(huone, 10) || [])[0]; if (f && f.getLocation) V = f.getLocation().constructor; }
  return !!V;
};
const piirretyt = new Map();   // n -> objekti-id
const piirra = () => {
  // kp 30.10. 16:49 "zombit warppailee noin sekunnin välein": p laskettiin kellosta (now % tikki), mutta askel (tiki) ajetaan
  //   100 ms ajastimessa. Tikin rajalla p ehti nollautua ennen kuin px/x päivittyivät -> zombi hyppäsi ruudun taaksepäin
  //   jopa 100 ms ajaksi joka tikki. Nyt p lasketaan viimeksi lasketusta tikistä: jos askel on myöhässä, zombi pysyy määränpäässä.
  const p = Math.max(0, Math.min(1, (Date.now() - SAILO.K * ASETUS.tikki) / ASETUS.tikki)), { z: Z } = ruudukko;
  for (const z of tila.zombit) {
    let g = piirretyt.get(z.n);
    const x = z.px + (z.x - z.px) * p, y = z.py + (z.y - z.py) * p, zz = Math.max(0, Z[Math.round(y) * ruudukko.W + Math.round(x)] || 0), sd = z.suunta * 45;
    if (g == null) { g = seuraavaId--; if (!e.addRoomObjectUser(huone, g, new V(x, y, zz), new V(sd), sd, 1, figuuri)) continue; piirretyt.set(z.n, g); }
    try {
      e.updateRoomObjectUserLocation(huone, g, new V(x, y, zz), null, false, 0, new V(sd), sd, true, false, 16);
      const liikkuu = (z.x !== z.px || z.y !== z.py) && p < 1, asento = z.kuoli >= 0 && !z.syo ? 'lay' : liikkuu ? 'mv' : 'std';
      if (z._asento !== asento) { e.updateRoomObjectUserPosture(huone, g, asento, ''); z._asento = asento; }
    } catch (x) {}
  }
};
tila.kuva = () => tila.zombit.map(z => ({ n: z.n, x: z.x, y: z.y, kuoli: z.kuoli, id: piirretyt.get(z.n) }));

// ---- wired-script-hybridi (682.js:153-206, 442): salaisen sanan lähetys + kaiun nielu (suu ei liiku) + puhekuplan piilotus
let koukkuYhteys = null, koukkuOma = null, koukkuAlkup = null;
const koukku = () => {
  const c = yhteys(); if (!c || typeof c.handleMessages !== 'function') return null;
  if (koukkuYhteys === c && c.handleMessages === koukkuOma) return c;
  const alkup = c.handleMessages;
  const oma = function (...viestit) {
    try {
      const sana = String(ASETUS.salasana || '').trim().toLowerCase();
      if (sana) {
        let i;
        viestit = viestit.filter(v => {
          const p = v && v.parser;
          // Palvelin kaiuttaa wf_trg_says_something (piilota=1) -koodin lähettäjälle kuiskauksena (2704) -> niellään, ettei suu liiku eikä kuplaa synny.
          if (p && typeof p.message === 'string' && p.message.trim().toLowerCase() === sana) {
            if (i === undefined) i = omaIndeksi();
            if (i == null || p.roomIndex === i) return false;
          }
          return true;
        });
        if (!viestit.length) return;
      }
    } catch (x) {}
    return alkup.apply(this, viestit);
  };
  c.handleMessages = oma; koukkuYhteys = c; koukkuOma = oma; koukkuAlkup = alkup; return c;
};
const kuplaPiiloon = el => {
  try {
    const sana = String(ASETUS.salasana || '').trim(); if (!sana) return;
    const esc = sana.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(':\\s*' + esc + '\\s*↩?\\s*$', 'i').test(el.textContent || '') && el.style.display !== 'none') el.style.display = 'none';
  } catch (x) {}
};
const kuplat = () => { for (const b of document.querySelectorAll('.bubble-container')) kuplaPiiloon(b); };
const kuplaVahti = new MutationObserver(kuplat);
if (document.body) kuplaVahti.observe(document.body, { childList: true, subtree: true, characterData: true });
const kuplaAjastimet = new Set();
const sanoSalainen = () => {
  const sana = String(ASETUS.salasana || '').trim(); if (!sana) return false;
  try {
    koukku();
    const s = istunto(); if (!s || typeof s.sendChatMessage !== 'function') return false;
    s.sendChatMessage(sana, 0);
    kuplat();
    for (const ms of [30, 300, 1000]) kuplaAjastimet.add(setTimeout(kuplat, ms));
    return true;
  } catch (x) { lokiin({ salasanaVirhe: String(x) }); return false; }
};
tila._sanoSalainen = sanoSalainen;

// ---- oma kiinnijäänti
const ilmoita = teksti => {
  const d = document.createElement('div'); d.textContent = teksti;
  d.style.cssText = 'position:fixed;left:50%;top:14%;transform:translateX(-50%);z-index:99999;pointer-events:none;padding:8px 16px;'
    + 'background:rgba(90,0,0,.8);color:#fff;font:bold 15px sans-serif;border-radius:6px;transition:opacity .4s';
  document.body.appendChild(d); setTimeout(() => { d.style.opacity = '0'; }, 1600); setTimeout(() => d.remove(), 2100);
};
const omaRuutu = () => {
  const i = omaIndeksi(); if (i == null || i < 0) return null;
  const o = e.getRoomObject(huone, i, 100), L = o && o.getLocation();
  return L ? { i, x: Math.round(L.x), y: Math.round(L.y) } : null;
};
let kuolemaKaynnissa = 0, safeIlmoitettu = 0;
const kuole = (syy) => {
  const nyt = Date.now(), lukko = Math.max(1000, Number(ASETUS.kuolemaLukko) || 5000);
  if (nyt - kuolemaKaynnissa < lukko) return;
  if (safe && saaSafe()) {
    if (nyt - safeIlmoitettu > 5000) { safeIlmoitettu = nyt; ilmoita(syy + ' (:safe päällä, ei kuolemaa)'); lokiin({ kuolema: syy, safe: true }); }
    return;
  }
  kuolemaKaynnissa = nyt; tila.kuolemat++; ilmoita(syy);
  const o = omaRuutu(), ok = sanoSalainen();
  lokiin({ kuolema: syy, tapa: ok ? 'wired-salasana (' + ASETUS.salasana + ')' : 'salasanan lähetys epäonnistui', ennen: o && [o.x, o.y] });
};
const hitainId = () => tila.kohde && tila.kohde.id;
const tarkistaOma = () => {
  if (Date.now() - ALKU < ARMO) return;
  if (!onKohde({ id: omaId() })) return;
  const o = omaRuutu(); if (!o) return;
  const a = ansaRuutu();
  if (a && o.x === a.x && o.y === a.y) return kuole('Astuit ansaan!');
  for (const z of tila.zombit) if ((z.kuoli < 0 || z.syo) && z.x === o.x && z.y === o.y) return kuole('Zombi sai sinut kiinni!');
  if (!ruudukko.ok[o.y * ruudukko.W + o.x]) for (const z of tila.zombit)   // tuolilla tms.: zombi viereisessä ruudussa riittää
    if ((z.kuoli < 0 || z.syo) && Math.max(Math.abs(z.x - o.x), Math.abs(z.y - o.y)) <= 1 && ruudukko.ok[z.y * ruudukko.W + z.x] && hitainId() === omaId()) return kuole('Zombi sai sinut kiinni!');
};

// ---- kello
const ALKU = Date.now(), ARMO = 6000;   // käynnistyksen jälkeen 6 s armoaika
const tiki = () => {
  const nyt = Date.now(), k = Math.floor(nyt / ASETUS.tikki), e1 = Math.floor(nyt / ASETUS.epookki);
  if (!ruudukko) { ruudukko = rakenna(); if (!ruudukko || !ruudukko.ruudut.length || !valmistele()) { ruudukko = null; return; } }
  koukku();
  const P = pelaajat();
  if (SAILO.E === e1 && SAILO.zombit.length === ASETUS.maara && k - SAILO.K < 30) {
    if (tila.zombit !== SAILO.zombit) { tila.zombit = SAILO.zombit; lokiin({ jatkettu: SAILO.K }); }
  } else {
    SAILO.E = e1; tila.zombit = SAILO.zombit = synny(e1, P); historia.clear(); SAILO.K = k - 1;
    lokiin({ epookki: e1, syntyi: tila.zombit.map(z => z.x + ',' + z.y).join(' '), ovi: ruudukko.ovi });
  }
  while (SAILO.K < k) { SAILO.K++; tila.kohde = askel(SAILO.K, tila.zombit, P); }
  tila.k = SAILO.K;
};
let rafKaynnissa = true;
const kehys = () => { if (!rafKaynnissa) return; try { if (ruudukko) piirra(); } catch (x) {} requestAnimationFrame(kehys); };
requestAnimationFrame(kehys);
const ajastin = setInterval(() => {
  try { tiki(); if (ruudukko) tarkistaOma(); }
  catch (x) { tila.virheet++; lokiin({ virhe: String(x && x.stack || x).slice(0, 300) }); if (tila.virheet > 50) clearInterval(ajastin); }
}, 100);
const uusiKartta = setInterval(() => { try { if (ruudukko) { const r = rakenna(); if (r && r.ruudut.length) ruudukko = r; } } catch (x) {} }, 5000);

// ---- :safe (vain ASETUS.turvassa-listalla oleville; rivi ei lähde palvelimelle)
const KENTTA = 'input.nitro-chat-input-control', KOMENTO = /^:safe(?:\s+(pois|päälle|paalle|on|off))?$/i;
const kuule = ev => {
  if (ev.key !== 'Enter' && ev.key !== 'NumpadEnter') return;
  const el = ev.target; if (!(el instanceof HTMLInputElement) || !el.matches(KENTTA)) return;
  const m = KOMENTO.exec((el.value || '').trim()); if (!m || !saaSafe()) return;
  ev.preventDefault(); ev.stopImmediatePropagation();
  const s = (m[1] || '').toLowerCase(), uusi = s ? !(s === 'pois' || s === 'off') : !safe;
  tila.safe(uusi); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ''); el.dispatchEvent(new Event('input', { bubbles: true }));
  ilmoita(uusi ? ':safe päällä: zombit eivät tapa sinua' : ':safe pois: zombit tappavat');
};
addEventListener('keydown', kuule, true); tila._kuule = kuule;
lokiin({ alku: huone, safe: safe && saaSafe() });

return () => {
  rafKaynnissa = false; clearInterval(ajastin); clearInterval(uusiKartta); removeEventListener('keydown', kuule, true);
  kuplaVahti.disconnect(); for (const a of kuplaAjastimet) clearTimeout(a); kuplaAjastimet.clear();
  try {
    if (koukkuYhteys && koukkuYhteys.handleMessages === koukkuOma) {
      if (koukkuAlkup === Object.getPrototypeOf(koukkuYhteys).handleMessages) delete koukkuYhteys.handleMessages;
      else koukkuYhteys.handleMessages = koukkuAlkup;
    }
  } catch (x) {}
  for (const g of piirretyt.values()) try { e.removeRoomObjectUser(huone, g); } catch (x) {}
  piirretyt.clear(); if (window.zombit === tila) delete window.zombit;
};
