// Jaetut zombit (pohja: huoneet/684-zombit.js, wired-hybridi: huoneet/682.js).
// kp 30.10. 15:58-16:10: zombit yhteisiä kaikille huoneessa olijoille, jahtaavat ketä tahansa pelaajaa (hitainta; ei botteja eikä
//   Herra-Robottia 245). Ei kiinteitä spawneja: zombi syntyy kävelykelpoiselle lattiaruudulle mahdollisimman kauas kaikista pelaajista
//   (BFS-reittietäisyys, ei linnuntie), deterministisesti siemenestä + tikistä, ei ovelle eikä alle ASETUS.oviEtaisyys ruudun päähän
//   ovesta. Kiinni saanut zombi syntyy seuraavalla tikillä samalla säännöllä uudelleen.
// kp 30.10. 16:58-17:02, 17:30-17:31 & 17:36-17:41:
//   1) Zombikohtainen näköetäisyys + vaihtuva hystereesi: jokaiselle zombille arvotaan syntyessä (ja uudelleensyntyessä) oma
//      huomaamisetäisyys väliltä ASETUS.huomaaVali (5..9 ruutua) ja oma luovutusväli väliltä ASETUS.luovutusVali (3..5 ruutua);
//      luopumisraja = oma huomaa + oma luovutusväli. Näköpiirissä olevista valitaan "hitain" (pienin liike ikkunassa, tasapelissä pienin id).
//   2) Liikkeellelähdön reaktioviive: kun zombi huomaa pelaajan, se odottaa oman reaktioviiveensä (ASETUS.reaktioVali 0..3 s per
//      huomaaminen) paikallaan ('std') kääntyneenä kohti pelaajaa ennen jahtiin lähtöä. Jos pelaaja poistuu näköpiiristä odotuksen aikana, odotus peruuntuu.
//   3) Ilman kohdetta zombi vaeltaa pysähtyillen: kulkee muutaman ruudun pätkiä (ASETUS.vaellusAskeleet 2..4, asento 'mv'),
//      seisoo 2..5 s paikallaan (ASETUS.vaellusTauko, asento 'std'), ja jatkaa uuteen satunnaiseen suuntaan (deterministinen PRNG).
//   4) Kiinnijäännin kertyvä kontaktilaskuri (per zombi + pelaaja): samassa ruudussa +1/s (+tikki ms), viereisessä ruudussa +0.5/s,
//      ja ilman kontaktia laskuri hiipuu hitaasti (-0.25/s) eikä nollaudu heti. Kiinnijäänti kun laskuri >= arvottu raja (3..6 s). Usean zombin laskurit kasvavat erikseen.
//   5) Kiinni jääneestä pelaajasta syntyy SAMAAN ruutuun "muuttunut" zombi: pelaajan oma figuuri zombifioituna (Left 4 Kuplan
//      zZombify-muunnoksella). Kiinni jäänyt pelaaja EI näe omaa muuttunutta versiotaan, eikä muuttunut jahtaa tai ota kontaktia
//      lähdepelaajaansa. Muuttunut elää vähintään ASETUS.muuttunutMin (120000 ms) ja despawnaa sen jälkeen heti kun sen ruutu on
//      kokonaan pimeässä (yksikään pelaaja ei valaise sitä ymparys-säteellä eikä keilalla). Korkeintaan ASETUS.muuttuneitaMax (4) kerrallaan.
//   6) Nopeuden vaihtelu: jokaiselle zombille arvotaan syntyessä (ja uudelleensyntyessä) oma perusnopeus väliltä ASETUS.askelVali
//      (800..1400 ms/ruutu), ja saman zombin askelväli vaihtelee dynaamisesti joka askeleella (±20 % aaltoilu + satunnaiset lyhyet
//      kiihdytykset/hidastukset). Simulaatio pyörii lyhyellä perustikillä (ASETUS.tikki = 250 ms) ja piirto interpoloidaan zombin omasta askelajasta.
// Konsolissa: zombit.loki · zombit.zombit · zombit.muuttuneet · zombit.kohde · zombit.ovi · zombit.safe(true|false) · zombit.asetus · zombit.kuva()
const ASETUS = {
  maara: 3,            // tavallisten zombien määrä
  tikki: 250,          // ms; simulaation perustikki (zombin oma askelväli 800..1400 ms ±vaihtelu)
  askelVali: [800, 1400], // ms per ruutu: jokaiselle zombille arvotaan syntyessä ja uudelleensyntyessä oma perusnopeus tältä väliltä
  nopeusVaihtelu: 0.2, // saman zombin nopeuden jatkuva aaltoilu (±20 %) + satunnaiset lyhyet kiihdytykset/hidastukset
  epookki: 300000,     // ms; uusi aalto + hajonnan raja
  ikkuna: 10000,       // ms; "hitain" mitataan tältä ajalta
  kohdeTapa: 'hitain', // kohdelogiikka ('hitain' = pienin kuljettu matka ikkunan aikana, tasapelissä pienin käyttäjä-id)
  huomaa: 7,           // ruutua (reittietäisyys): perustason huomaamisetäisyys
  meneta: 11,          // ruutua (reittietäisyys): perustason luopumisraja
  huomaaVali: [5, 9],  // ruutua: jokaiselle zombille arvotaan syntyessä oma huomaamisetäisyys tältä väliltä (5..9)
  luovutusVali: [3, 5], // ruutua: jokaiselle zombille arvotaan syntyessä oma hystereesiväli (3..5; meneta = huomaa + luovutus)
  reaktioVali: [0, 3], // sekuntia (tai ms jos >= 50): kun zombi huomaa pelaajan, se odottaa 0..3 s paikallaan ('std') kohti kääntyneenä ennen jahtia
  vaellusAskeleet: [2, 4], // ruutua: vaeltaessa zombi liikkuu 2..4 ruudun pätkiä ('mv') ennen pysähdystä
  vaellusTauko: [2, 5],    // sekuntia (tai ms jos >= 50): vaeltaessa zombi seisoo 2..5 s ('std') paikallaan pätkien välissä
  kontakti: 3,         // sekuntia (tai ms jos >= 50): oletuskontaktiraja (jos kontaktiMin/kontaktiMax asetetaan samaksi tai kontakti muutetaan)
  kontaktiMin: 3,      // sekuntia (tai ms jos >= 50): vähimmäiskontaktiraja ennen kiinnijääntiä
  kontaktiMax: 6,      // sekuntia (tai ms jos >= 50): enimmäiskontaktiraja (arvotaan deterministisesti 3..6 s per zombi+pelaaja)
  kontaktiSama: 1,     // kertymäkerroin samassa ruudussa (+1 per s eli +tikki ms per tikki)
  kontaktiViereinen: 0.5, // kertymäkerroin viereisessä ruudussa (+0.5 per s eli +0.5*tikki ms per tikki)
  kontaktiHiipuma: 0.25,  // hiipumakerroin ilman kontaktia (-0.25 per s eli -0.25*tikki ms per tikki; ei nollaudu heti)
  muuttunutMin: 120000, // ms; kiinni jääneestä pelaajasta syntyneen muuttuneen zombin vähimmäiselinaika (2 min) ennen pimeässä despawnausta
  muuttuneitaMax: 4,   // enintään näin monta muuttunutta zombia samaan aikaan huoneessa (vanhin poistuu ensin)
  ilmanValoa: 1.8,     // ruutua: pelaajan perusvalosäde ilman käsiesinettä (jos window.pimeys.ilmanValoa ei ole saatavilla)
  lammikkoVarit: ['#b01212', '#6fcf3a', '#7a1c8a', '#2e8b57', '#8b1a1a'], // kiinnijääntiruudun värilammikon paletti (Left 4 Kuplan veri/lima + sävyt)
  kuuloVali: [10, 16], // ruutua (reittietäisyys): zombikohtainen kuuloetäisyys huoneen julkisille chat-viesteille (huuto x1.5)
  aaniKesto: 20000,    // ms; kuinka kauan chat-ääni vetää vaeltelevia zombeja vinosti puoleensa (hiipuu ajan myötä)
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
Object.defineProperty(ASETUS, 'menetä', { get: () => ASETUS.meneta, set: v => { ASETUS.meneta = v; } });

const e = window.NitroDevTools && window.NitroDevTools.roomEngine;
const huone = Number((kupla && kupla.roomId && kupla.roomId()) || (e && e.activeRoomId)) || 0;
const dv = (o, k) => { const d = o && Object.getOwnPropertyDescriptor(o, k); return d && !d.get ? d.value : undefined; };
const omaId = () => { const s = e && dv(e, '_sessionDataManager'); return Number((s && (dv(s, '_userId') || s.userId)) || 0); };
if (!e || !huone) return () => {};

const tila = window.zombit = { versio: 'zombit-jaettu 2', huone, asetus: ASETUS, zombit: [], muuttuneet: [], lammikot: [], kohde: null, ovi: null, loki: [], kuolemat: 0, virheet: 0, k: 0 };
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
    let fig = String(u.figure || '');
    let ese = 0, suunta = 0;
    try {
      if (!fig && o.model) fig = String(o.model.getValue('figure') || '');
      if (o.model) ese = Number(o.model.getValue('figure_carry_object')) || 0;
      const d = o.getDirection && o.getDirection();
      if (d && isFinite(d.x)) suunta = Number(d.x) || 0;
    } catch (x) {}
    out.push({ id, i: o.id, x: Math.round(L.x), y: Math.round(L.y), z: Number(L.z) || 0, nimi: u.name, figuuri: fig, ese, suunta });
  }
  return out.sort((a, b) => a.id - b.id);
};

// ---- Left 4 Kupla -figuurimuunnos (D:/re-lab/tmp/shooter/shooter-1.15.2.user.js:316-317, 1275-1299)
const OSA_RE_KAIKKI = /\.q[0-9A-Za-z]{10,}-0(?=\.|$)/g;
const puhdasAsu = f => String(f || '').replace(OSA_RE_KAIKKI, '');
const Z_IHOT = ['1362', '1361', '1360'];
const zOsat = f => String(f || '').split('.').filter(Boolean).map(p => p.split('-')).filter(p => /^[a-z]{2}$/.test(p[0]) && p.length >= 2);
const zPaaId = f => { const p = zOsat(f).find(x => x[0] === 'hd'); return p ? (+p[1] | 0) : 0; };
const zZombify = (fig, o) => {
  const skin = (o && o.skin) || '1362';
  let ps = zOsat(puhdasAsu(fig));
  ps = ps.filter(p => !(o && o.dropHat && (p[0] === 'ha' || p[0] === 'he')) && !(o && o.dropHair && p[0] === 'hr') && !(o && o.dropFace && (p[0] === 'fa' || p[0] === 'ea')));
  ps = ps.map(p => p[0] === 'hd' ? ['hd', (o && o.head) || p[1], skin] : (o && o.dark && ['ch', 'lg', 'sh', 'cc'].includes(p[0])) ? [p[0], p[1], ...p.slice(2).map(() => o.dark)] : p);
  if (!ps.some(p => p[0] === 'hd')) ps.unshift(['hd', (o && o.head) || '3603', skin]);
  return ps.map(p => p.join('-')).join('.');
};
// Kaatuneen pelaajan tartuntamuunnos (shooter-1.15.2.user.js zVariantti + zFigure kun z.tyyppi === 1):
//   iho Z_IHOT-paletista, 30 % pakotettu zombipää (3603/4206) ja tyyppi === 1 varmistaa zombipään (o.head || '3603'),
//   30 % vaatteiden tummennus ('110'), pelaajan omat hiukset/hattu/vaatteet säilyvät.
const zombifioiAsu = (lahdeFig, siemen) => {
  const base = puhdasAsu(lahdeFig) || ASETUS.figuuri;
  const r = arpa(siemen);
  const skin = Z_IHOT[Math.floor(r() * Z_IHOT.length)];
  const pakota = r() < 0.3 ? (r() < 0.5 ? '3603' : '4206') : null;
  const tumma = r() < 0.3 ? '110' : null;
  const hd = zPaaId(base), tavallinen = (hd >= 180 && hd <= 209) || (hd >= 600 && hd <= 629);
  const head = pakota || (tavallinen ? null : ((siemen >>> 0) % 2 ? '4206' : '3603')) || '3603';
  return zZombify(base, { skin, dark: tumma, head });
};

// ---- Valaistus (huoneet/684.js:30-31, 311): ruutu on valaistu jos yksikin pelaaja valaisee sen ymparys-säteellä tai keilalla (ilman seinäestoja)
const OLETUS_VALOT = {
  1058: { nimi: 'Lyhty', ymparys: 3.5, keila: 9.5, kulma: 30, liekki: 1 },
  1027: { nimi: 'Kynttilä', ymparys: 2.4, keila: 2.8, kulma: 60, liekki: 1 },
  1113: { nimi: 'LED-kynttilä', ymparys: 2.4, keila: 2.8, kulma: 60 },
  1031: { nimi: 'Soihtu', ymparys: 4.2, keila: 5.5, kulma: 60, liekki: 1 },
};
const haeValot = () => (window.pimeys && window.pimeys.valot && typeof window.pimeys.valot === 'object') ? window.pimeys.valot : OLETUS_VALOT;
const onValaistu = (zx, zy, P) => {
  const valot = haeValot();
  const ilmanValoa = Number((window.pimeys && window.pimeys.ilmanValoa) ?? ASETUS.ilmanValoa ?? 1.8);
  for (const p of P || []) {
    if (!p || !isFinite(p.x) || !isFinite(p.y)) continue;
    const dx = zx - p.x, dy = zy - p.y, et = Math.hypot(dx, dy);
    const v = (p.ese && (valot[p.ese] || OLETUS_VALOT[p.ese])) || null;
    const ymparys = v && isFinite(Number(v.ymparys)) ? Number(v.ymparys) : (isFinite(ilmanValoa) ? ilmanValoa : 1.8);
    if (et <= ymparys) return true;
    const keila = v && isFinite(Number(v.keila)) ? Number(v.keila) : 0;
    if (keila > 0 && et <= keila && et > 1e-6) {
      const th = (Number(p.suunta) || 0) * Math.PI / 180;
      const kx = Math.sin(th), ky = -Math.cos(th);   // 684.js:311 kesk = atan2(-cos(th), sin(th))
      const puoliKulma = (isFinite(Number(v.kulma)) ? Number(v.kulma) : 30) * Math.PI / 180;
      if ((dx * kx + dy * ky) / et >= Math.cos(puoliKulma) - 1e-9) return true;
    }
  }
  return false;
};

// Tila säilyy skriptin uudelleenlatauksen yli (push käynnistää skriptin uudelleen ~15 s välein).
const SAILO = (window.__zombitJaettu && window.__zombitJaettu.huone === huone)
  ? window.__zombitJaettu
  : (window.__zombitJaettu = { huone, E: -1, K: -1, zombit: [], muuttuneet: [], lammikot: [], aanet: [], seuraavaMuuttunutN: 1000, historia: new Map() });
if (!Array.isArray(SAILO.muuttuneet)) SAILO.muuttuneet = [];
if (!Array.isArray(SAILO.lammikot)) SAILO.lammikot = [];
if (!Array.isArray(SAILO.aanet)) SAILO.aanet = [];
if (!(SAILO.seuraavaMuuttunutN >= 1000)) SAILO.seuraavaMuuttunutN = 1000;
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
const etaisyysPelaajaan = (dz, p) => {
  const { W, H, ok } = ruudukko;
  if (p.x >= 0 && p.y >= 0 && p.x < W && p.y < H && ok[p.y * W + p.x]) return dz[p.y * W + p.x];
  let paras = -1;
  for (const [dx, dy] of NAAP) {
    const x = p.x + dx, y = p.y + dy;
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    const e = dz[y * W + x];
    if (e >= 0 && (paras < 0 || e + 1 < paras)) paras = e + 1;
  }
  return paras;
};
const tavoitettava = (p) => {
  const { W, H, ok } = ruudukko;
  for (const [dx, dy] of [[0, 0]].concat(NAAP)) {
    const x = p.x + dx, y = p.y + dy;
    if (x >= 0 && y >= 0 && x < W && y < H && ok[y * W + x]) return true;
  }
  return false;
};
const lukuValilta = (pari, oletusMin, oletusMax, rnd) => {
  const a = Array.isArray(pari) ? Number(pari[0]) : NaN, b = Array.isArray(pari) ? Number(pari[1]) : NaN;
  const min = Math.max(0, isFinite(a) ? Math.floor(a) : oletusMin);
  const max = Math.max(min, isFinite(b) ? Math.floor(b) : oletusMax);
  return min + Math.floor(rnd() * (max - min + 1));
};
// Sekunteina (< 50) tai suoraan millisekunteina (>= 50) annetut välit muunnetaan aina millisekunneiksi -> kesto ei riipu ASETUS.tikki-arvosta.
const aikaMs = (v, oletusS) => {
  const n = Number(v);
  if (!isFinite(n) || n < 0) return oletusS * 1000;
  return n >= 50 ? Math.round(n) : Math.round(n * 1000);
};
const aikaValiltaMs = (pari, oletusMinS, oletusMaxS, rnd) => {
  const a = Array.isArray(pari) ? pari[0] : undefined, b = Array.isArray(pari) ? pari[1] : undefined;
  const minMs = aikaMs(a, oletusMinS), maxMs = Math.max(minMs, aikaMs(b, oletusMaxS));
  const askel = (minMs % 1000 === 0 && maxMs % 1000 === 0) ? 1000 : 250;
  const n = Math.floor((maxMs - minMs) / askel);
  return minMs + Math.floor(rnd() * (n + 1)) * askel;
};
const arvoHuomaa = (s0, k, zn) => lukuValilta(ASETUS.huomaaVali, 5, 9, arpa(s0 * 3571 + k * 2903 + zn * 131));
const arvoLuovutus = (s0, k, zn) => lukuValilta(ASETUS.luovutusVali, 3, 5, arpa(s0 * 4421 + k * 1973 + zn * 229));
const arvoKuulo = (s0, k, zn) => lukuValilta(ASETUS.kuuloVali, 10, 16, arpa(s0 * 5801 + k * 2381 + zn * 179));
const arvoReaktioMs = (s0, k, zn) => aikaValiltaMs(ASETUS.reaktioVali, 0, 3, arpa(s0 * 2749 + k * 4099 + zn * 193));
const arvoTaukoMs = (rnd) => aikaValiltaMs(ASETUS.vaellusTauko, 2, 5, rnd);
const arvoPerusAskel = (s0, k, zn) => lukuValilta(ASETUS.askelVali, 800, 1400, arpa(s0 * 6311 + k * 3307 + zn * 251));
const hystereesiVali = (z) => {
  const h = Number(ASETUS.huomaa ?? 7), m = Number(ASETUS.menetä ?? ASETUS.meneta ?? 11);
  if ((isFinite(h) && h !== 7) || (isFinite(m) && m !== 11)) return Math.max(0, (isFinite(m) ? m : 11) - (isFinite(h) ? h : 7));
  return Math.max(0, Number(z && z.luovutus != null ? z.luovutus : 4));
};

// Saman zombin dynaaminen nopeusvaihtelu: oma perusnopeus (800..1400 ms) + jatkuva kahden taajuuden aaltoilu (±20 %) +
//   satunnaiset lyhyet kiihdytykset/hidastukset (1..3 askelta) + pieni askelkohtainen vaihtelu, deterministisesti siemenestä.
const alustaNopeus = (z, s0, k, tMs, tikki) => {
  z.perusAskelMs = arvoPerusAskel(s0, k, z.n);
  const rnd = arpa(s0 * 5113 + k * 1789 + z.n * 313);
  z.aaltoVaihe = rnd() * Math.PI * 2;
  z.aaltoTaajuus = (Math.PI * 2) / (4 + rnd() * 4);
  z.aaltoVaihe2 = rnd() * Math.PI * 2;
  z.aaltoTaajuus2 = (Math.PI * 2) / (9 + rnd() * 6);
  z.askelNro = 0;
  z.puuskaAsk = 0;
  z.puuskaKerroin = 0;
  z.askelMs = z.perusAskelMs;
  z.viimeAskelMs = tMs;
  z.seuraavaAskelMs = tMs;
  z.piirtoAskelMs = tikki;
};
const laskeAskelMs = (z, s0, k) => {
  if (!z.perusAskelMs) alustaNopeus(z, s0, z.synty ?? SAILO.E, k * ASETUS.tikki, ASETUS.tikki);
  z.askelNro = (z.askelNro || 0) + 1;
  const rnd = arpa(s0 * 7331 + (z.synty ?? 0) * 4219 + z.n * 163 + z.askelNro * 997);
  const aalto = Math.sin(z.askelNro * z.aaltoTaajuus + z.aaltoVaihe) * 0.7 + Math.sin(z.askelNro * z.aaltoTaajuus2 + z.aaltoVaihe2) * 0.3;
  const vaihtelu = Math.max(0, Number(ASETUS.nopeusVaihtelu ?? 0.2));
  if (z.puuskaAsk > 0) {
    z.puuskaAsk--;
  } else if (rnd() < 0.25) {
    z.puuskaAsk = 1 + Math.floor(rnd() * 3);
    const suunta = rnd() < 0.5 ? -1 : 1;   // -1 = lyhyt pyrähdys, +1 = lyhyt hidastus
    z.puuskaKerroin = suunta * (0.08 + rnd() * 0.12);
  } else {
    z.puuskaKerroin = 0;
  }
  const kohina = (rnd() * 2 - 1) * 0.04;
  const kerroin = Math.max(0.55, Math.min(1.55, 1 + aalto * vaihtelu + (z.puuskaKerroin || 0) + kohina));
  const perus = lukuValilta(ASETUS.askelVali, 800, 1400, () => 0) <= z.perusAskelMs ? z.perusAskelMs : arvoPerusAskel(s0, z.synty ?? k, z.n);
  return Math.max(350, Math.min(2400, Math.round(perus * kerroin)));
};
const asetaAskelAika = (z, s0, k, tMs, tikki) => {
  z.askelMs = laskeAskelMs(z, s0, k);
  z.viimeAskelMs = tMs;
  const pohja = (z.seuraavaAskelMs != null && z.seuraavaAskelMs > tMs - tikki) ? z.seuraavaAskelMs : tMs;
  z.seuraavaAskelMs = Math.max(tMs + tikki, pohja + z.askelMs);
  z.piirtoAskelMs = Math.max(tikki, Math.ceil(z.seuraavaAskelMs / tikki) * tikki - tMs);
};
const varmistaZombi = (z, s0, k, tMs, tikki) => {
  const synty = z.synty ?? SAILO.E;
  if (z.huomaa == null) z.huomaa = arvoHuomaa(s0, synty, z.n);
  if (z.luovutus == null) z.luovutus = arvoLuovutus(s0, synty, z.n);
  if (z.kuulo == null) z.kuulo = arvoKuulo(s0, synty, z.n);
  z.meneta = Math.max(z.huomaa, z.huomaa + hystereesiVali(z));
  if (!z.perusAskelMs || z.viimeAskelMs == null || z.seuraavaAskelMs == null) alustaNopeus(z, s0, synty, tMs, tikki);
};

// Zombikohtainen kohdevalinta: huomaa pelaajan kun BFS-reittietäisyys <= z.huomaa (5..9),
//   luopuu kun etäisyys > z.meneta (z.huomaa + z.luovutus, 3..5; hystereesi). Muuttunut EI jahtaa omaa lähdepelaajaansa (z.lahdeId).
const valitseKohde = (z, dz, P) => {
  if (z.huomaa == null) z.huomaa = arvoHuomaa(perusSiemen(), z.synty ?? SAILO.E, z.n);
  if (z.luovutus == null) z.luovutus = arvoLuovutus(perusSiemen(), z.synty ?? SAILO.E, z.n);
  const huomaa = Math.max(0, Number(z.huomaa));
  const meneta = Math.max(huomaa, huomaa + hystereesiVali(z));
  z.meneta = meneta;
  let paras = null;
  for (const p of P) {
    if (!onKohde(p)) continue;
    if (z.muuttunut && p.id === z.lahdeId) continue;   // muuttunut ei jahtaa omaa lähdepelaajaansa
    const et = etaisyysPelaajaan(dz, p);
    if (et < 0) continue;   // yläkerroksessa tai muualla minne zombi ei pääse
    const raja = p.id === z.kohdeId ? meneta : huomaa;
    if (et > raja) continue;   // näköpiirin ulkopuolella
    // Teleportannut (yli 3 ruutua tikissä = kuoli ja siirtyi ovelle, tai tuli huoneeseen) ei ole kohde ikkunan aikana.
    const l = liike(p.id); if (l.hyppy > 3) continue;
    const m = l.s;
    if (!paras || m < paras.m) paras = { ...p, m, et };   // P on id-järjestyksessä -> tasapelissä pienin id
  }
  return paras;
};
const arvoKontaktiRajaMs = (s0, k, zn, pid) => {
  const kiintea = ASETUS.kontakti !== 3 && ASETUS.kontaktiMin === 3 && ASETUS.kontaktiMax === 6;
  const pari = kiintea ? [ASETUS.kontakti, ASETUS.kontakti] : [ASETUS.kontaktiMin ?? ASETUS.kontakti ?? 3, ASETUS.kontaktiMax ?? ASETUS.kontakti ?? 6];
  return Math.max(250, aikaValiltaMs(pari, 3, 6, arpa(s0 * 4999 + k * 6151 + zn * 97 + (pid || 0))));
};

// Huoneviestien ääniveto (vaeltaessa): aktiiviset äänet kuuloetäisyydellä painottavat vaellussuuntaa vinosti ääntä kohti.
const etsiAani = (z, dz, k, tMs) => {
  const kestoMs = Math.max(1000, aikaMs(ASETUS.aaniKesto ?? 20000, 20));
  const kuulo = Math.max(1, Number(z.kuulo ?? 12));
  const ryhmat = new Map();
  for (let i = SAILO.aanet.length - 1; i >= 0; i--) {
    const a = SAILO.aanet[i];
    if (!a || tMs - a.alkuMs >= kestoMs) { if (a && tMs - a.alkuMs >= kestoMs) SAILO.aanet.splice(i, 1); continue; }
    if (a.k > k) continue;
    if (z.muuttunut && a.id === z.lahdeId) continue;
    const et = etaisyysPelaajaan(dz, a);
    const raja = Math.round(kuulo * (a.huuto ? 1.5 : 1));
    if (et <= 0 || et > raja) continue;
    const teho = (a.voima || 1) * Math.max(0, 1 - (tMs - a.alkuMs) / kestoMs);
    if (teho <= 0.02) continue;
    const av = a.id || (a.y * 1000 + a.x);
    const vanha = ryhmat.get(av);
    if (vanha) {
      vanha.paino = Math.min(3.5, vanha.paino + teho);
      if (a.alkuMs >= vanha.alkuMs) { vanha.x = a.x; vanha.y = a.y; vanha.alkuMs = a.alkuMs; vanha.et = et; }
    } else {
      ryhmat.set(av, { id: a.id, x: a.x, y: a.y, paino: Math.min(3.5, teho), alkuMs: a.alkuMs, et });
    }
  }
  let paras = null;
  for (const r of ryhmat.values()) if (!paras || r.paino > paras.paino || (r.paino === paras.paino && r.et < paras.et)) paras = r;
  return paras;
};

// Vaellus ilman kohdetta: liikkuu muutaman ruudun pätkiä (vaellusAskeleet 2..4, asento 'mv'),
//   seisoo hetken paikallaan (vaellusTauko 2..5 s, asento 'std'), ja jatkaa uuteen suuntaan (mahdollinen ääniveto painottaa vinosti ääntä kohti).
const vaella = (k, tMs, tikki, z, dz, varattu, s0, a, kentat) => {
  const rnd = arpa(s0 * 1009 + k * 9176 + z.n * 37 + (z.askelNro || 0) * 19);
  const aani = dz ? etsiAani(z, dz, k, tMs) : null;
  z.aaniKohde = aani ? { x: aani.x, y: aani.y, paino: Math.round(aani.paino * 100) / 100 } : null;
  if ((z.vTaukoAsti || 0) > tMs) {
    // Vahva uusi ääni (huuto tai useita viestejä) lyhentää pitkää seisoskelua
    if (aani && aani.paino >= 1.3 && z.vTaukoAsti - tMs > 1250 && z._aaniLyh !== aani.alkuMs) {
      z._aaniLyh = aani.alkuMs;
      z.vTaukoAsti = tMs + Math.max(tikki, Math.round((z.vTaukoAsti - tMs) * 0.45 / tikki) * tikki);
    }
    if (z.vTaukoAsti > tMs) {
      z.vTaukoMs = z.vTaukoAsti - tMs;
      z.vTauko = Math.ceil(z.vTaukoMs / 1000);
      z.seuraavaAskelMs = tMs + tikki;
      z.piirtoAskelMs = tikki;
      return;   // seisoo paikallaan -> px === x, py === y -> asento 'std'
    }
  }
  z.vTaukoMs = 0; z.vTauko = 0; z.vTaukoAsti = 0;
  if (!(z.vAsk > 0)) {
    z.vAsk = lukuValilta(ASETUS.vaellusAskeleet, 2, 4, rnd);
    z.vDx = 0; z.vDy = 0;
  }
  const { W, H, ok } = ruudukko, ehdokkaat = [];
  for (const [dx, dy] of NAAP) {
    const x = z.x + dx, y = z.y + dy, j = y * W + x;
    if (x < 0 || y < 0 || x >= W || y >= H || !ok[j] || varattu.has(j)) continue;
    if (a && x === a.x && y === a.y) continue;
    if (dx !== 0 && dy !== 0 && (!ok[z.y * W + x] || !ok[y * W + z.x])) continue;
    ehdokkaat.push({ x, y, dx, dy });
  }
  if (!ehdokkaat.length) {
    z.vAsk = 0; z.vDx = 0; z.vDy = 0;
    const taukoMs = arvoTaukoMs(rnd);
    z.vTaukoAsti = tMs + taukoMs; z.vTaukoMs = taukoMs; z.vTauko = Math.ceil(taukoMs / 1000);
    z.seuraavaAskelMs = tMs + tikki; z.piirtoAskelMs = tikki;
    return;
  }
  let valittu = (z.vDx || z.vDy) ? ehdokkaat.find(e => e.dx === z.vDx && e.dy === z.vDy) : null;
  if (!valittu) {
    const vastasuunta = (z.suunta + 4) & 7;
    const muut = ehdokkaat.filter(e => suunnaksi(e.dx, e.dy) !== vastasuunta);
    const joukko = muut.length ? muut : ehdokkaat;
    if (aani && joukko.length > 1) {
      const avain = 'a:' + aani.x + ',' + aani.y;
      let da = kentat && kentat.get(avain);
      if (!da) { da = kentta(aani.x, aani.y); if (kentat) kentat.set(avain, da); }
      const nytD = da[z.y * W + z.x], veto = Math.min(3, aani.paino);
      const suoraDx = Math.sign(aani.x - z.x), suoraDy = Math.sign(aani.y - z.y);
      let summa = 0;
      const painot = joukko.map(e => {
        const d = da[e.y * W + e.x];
        let w = 1;
        if (d >= 0 && nytD >= 0) {
          if (d < nytD) {
            // Vinosti ääntä kohti (sivuviistoon lähestyvä askel) painottuu vahvimmin, jotta liike on hienovaraista kaartamista eikä suoraa jahtia
            const vino = (e.dx !== suoraDx || e.dy !== suoraDy);
            w = (1 + veto * 2.1) * (vino ? 1.3 : 0.95);
          } else if (d === nytD) {
            w = 1 + veto * 0.65;
          } else {
            w = Math.max(0.15, 1 - veto * 0.35);
          }
        }
        summa += w;
        return w;
      });
      let r = rnd() * summa;
      valittu = joukko[joukko.length - 1];
      for (let i = 0; i < joukko.length; i++) { r -= painot[i]; if (r <= 0) { valittu = joukko[i]; break; } }
    } else {
      valittu = joukko[Math.floor(rnd() * joukko.length)];
    }
    z.vDx = valittu.dx; z.vDy = valittu.dy;
  }
  z.x = valittu.x; z.y = valittu.y; z.suunta = suunnaksi(valittu.dx, valittu.dy);
  z.vAsk--;
  asetaAskelAika(z, s0, k, tMs, tikki);
  if (z.vAsk <= 0) {
    z.vDx = 0; z.vDy = 0;
    const taukoMs = arvoTaukoMs(rnd);
    const askelLoppuMs = Math.ceil(z.seuraavaAskelMs / tikki) * tikki;
    z.vTaukoAsti = askelLoppuMs + taukoMs;
  }
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

// ---- Värilammikko ja muuttunut zombi (kiinni jääneestä pelaajasta)
const paivitaLammikot = () => {
  SAILO.lammikot = SAILO.muuttuneet.map(m => m.lammikko).filter(Boolean);
  tila.muuttuneet = SAILO.muuttuneet;
  tila.lammikot = SAILO.lammikot;
};
const luoLammikko = (x, y, zn, kp, k, tMs, s0) => {
  const rnd = arpa(s0 * 8191 + k * 3517 + zn * 271 + (kp.id || 0) * 53);
  const paletti = Array.isArray(ASETUS.lammikkoVarit) && ASETUS.lammikkoVarit.length ? ASETUS.lammikkoVarit : ['#b01212', '#6fcf3a'];
  const vari = String(paletti[Math.floor(rnd() * paletti.length)]);
  const pisarat = [{ dx: (rnd() - 0.5) * 0.1, dy: (rnd() - 0.5) * 0.1, r: 0.28 + rnd() * 0.08, a: 0.82 }];
  const n = 5 + Math.floor(rnd() * 3);
  for (let i = 0; i < n; i++) {
    const kulma = (i / n) * Math.PI * 2 + (rnd() - 0.5) * 0.7, et = 0.14 + rnd() * 0.22;
    pisarat.push({ dx: Math.cos(kulma) * et, dy: Math.sin(kulma) * et, r: 0.07 + rnd() * 0.1, a: 0.65 + rnd() * 0.2 });
  }
  return { n: zn, x, y, vari, pisarat, syntyK: k, syntyMs: tMs, lahdeId: kp.id, lahdeNimi: kp.nimi || null };
};
const luoMuuttunut = (kp, suunta, k, tMs, tikki, s0) => {
  const lukkoMs = Math.max(1000, Number(ASETUS.kuolemaLukko) || 5000);
  if (SAILO.muuttuneet.some(m => m.lahdeId === kp.id && tMs - m.syntyMs < lukkoMs)) return null;
  const maxM = Math.max(1, Math.floor(Number(ASETUS.muuttuneitaMax ?? 4)));
  while (SAILO.muuttuneet.length >= maxM) SAILO.muuttuneet.shift();
  const zn = ++SAILO.seuraavaMuuttunutN;
  const siemen = (s0 * 4093 + k * 1301 + (kp.id || 0) * 89 + zn) >>> 0;
  const huomaa = arvoHuomaa(s0, k, zn), luovutus = arvoLuovutus(s0, k, zn), kuulo = arvoKuulo(s0, k, zn);
  const m = {
    n: zn, muuttunut: true, tyyppi: 'muuttunut',
    lahdeId: kp.id, lahdeNimi: kp.nimi || null, nimi: 'Muuttunut ' + (kp.nimi || ('#' + kp.id)),
    figuuri: zombifioiAsu(kp.figuuri || figuuri, siemen),
    x: kp.x, y: kp.y, px: kp.x, py: kp.y, kuoli: -1, synty: k, syntyMs: tMs, suunta: suunta ?? 4,
    huomaa, luovutus, meneta: huomaa + luovutus, kuulo,
    reaktio: 0, reaktioMs: 0, reaktioAsti: 0,
    kohdeId: null, kohde: null,
    vAsk: 0, vTauko: 1, vTaukoMs: 1000, vTaukoAsti: tMs + 1000, vDx: 0, vDy: 0,
    kontaktit: {}, kontaktiId: null, kontakti: 0, kontaktiRaja: 0, kontaktiMs: 0, kontaktiRajaMs: 0, syoId: null,
    lammikko: luoLammikko(kp.x, kp.y, zn, kp, k, tMs, s0),
  };
  alustaNopeus(m, s0, k, tMs, tikki);
  SAILO.muuttuneet.push(m);
  paivitaLammikot();
  return m;
};

// ---- simulaatio (deterministinen)
const perusSiemen = () => Number(ASETUS.siemen) || huone || 684;
const synny = (e1, P, k0) => {
  const { W } = ruudukko, s0 = perusSiemen(), varattu = new Set(), z = [];
  const tikki = Math.max(50, Number(ASETUS.tikki) || 250), tMs = (k0 ?? 0) * tikki;
  for (let n = 0; n < ASETUS.maara; n++) {
    const r = kaukainen(P, arpa(s0 * 7919 + e1 * 101 + n), varattu);
    varattu.add(r.y * W + r.x);
    const huomaa = arvoHuomaa(s0, e1, n), luovutus = arvoLuovutus(s0, e1, n), kuulo = arvoKuulo(s0, e1, n);
    const taukoMs = (n % 3) * 1000;
    const zo = {
      n, muuttunut: false, tyyppi: 'perus', x: r.x, y: r.y, px: r.x, py: r.y, kuoli: -1, synty: e1, syntyMs: tMs, suunta: 4,
      huomaa, luovutus, meneta: huomaa + luovutus, kuulo,
      reaktio: 0, reaktioMs: 0, reaktioAsti: 0,
      kohdeId: null, kohde: null,
      vAsk: 0, vTauko: n % 3, vTaukoMs: taukoMs, vTaukoAsti: tMs + taukoMs, vDx: 0, vDy: 0,
      kontaktit: {}, kontaktiId: null, kontakti: 0, kontaktiRaja: 0, kontaktiMs: 0, kontaktiRajaMs: 0, syoId: null,
    };
    alustaNopeus(zo, s0, e1, tMs, tikki);
    z.push(zo);
  }
  return z;
};
// Pelaajakohtainen kertyvä ja hitaasti hiipuva kontaktilaskuri per zombi:
//   samassa ruudussa +1/s (+tikki ms), viereisessä ruudussa +0.5/s (+0.5*tikki ms), ei kontaktia -0.25/s (-0.25*tikki ms).
//   Kiinnijäänti kun laskuri >= arvottu raja (3..6 s eli 3000..6000 ms). Usean zombin laskurit kasvavat erikseen.
const paivitaKontaktit = (z, P, k, tMs, tikki, s0, kaatuneet) => {
  if (!z.kontaktit || typeof z.kontaktit !== 'object') z.kontaktit = {};
  const kelvolliset = new Map();
  for (const p of P) {
    if (!onKohde(p) || (z.muuttunut && p.id === z.lahdeId)) continue;
    kelvolliset.set(p.id, p);
  }
  for (const idStr of Object.keys(z.kontaktit)) {
    const pid = Number(idStr);
    if (!kelvolliset.has(pid) || (kaatuneet && kaatuneet.has(pid))) delete z.kontaktit[idStr];
  }
  const kSama = Math.max(0, Number(ASETUS.kontaktiSama ?? 1));
  const kVier = Math.max(0, Number(ASETUS.kontaktiViereinen ?? 0.5));
  const kHiip = Math.max(0, Number(ASETUS.kontaktiHiipuma ?? 0.25));
  let saalis = null, aktP = null, aktT = null;
  for (const p of kelvolliset.values()) {
    if (kaatuneet && kaatuneet.has(p.id)) continue;
    const voiKoskea = tavoitettava(p) && liike(p.id).hyppy <= 3;
    const etRuutu = voiKoskea ? Math.max(Math.abs(z.x - p.x), Math.abs(z.y - p.y)) : 999;
    const kerroin = etRuutu === 0 ? kSama : etRuutu === 1 ? kVier : -kHiip;
    let t = z.kontaktit[p.id];
    if (kerroin > 0) {
      if (!t || !(t.ms > 0)) {
        const rajaMs = arvoKontaktiRajaMs(s0, k, z.n, p.id);
        t = z.kontaktit[p.id] = { ms: 0, rajaMs, laskuri: 0, raja: Math.round((rajaMs / 1000) * 100) / 100, et: etRuutu };
      }
      t.ms = Math.min(t.rajaMs, t.ms + tikki * kerroin);
      t.laskuri = Math.round((t.ms / 1000) * 100) / 100;
      t.et = etRuutu;
      if (t.ms >= t.rajaMs) {
        if (!saalis || etRuutu < saalis.et || (etRuutu === saalis.et && p.id === z.kohdeId)) {
          saalis = { p, t, et: etRuutu };
        }
      }
    } else if (t && t.ms > 0) {
      t.ms = Math.max(0, t.ms + tikki * kerroin);
      t.laskuri = Math.round((t.ms / 1000) * 100) / 100;
      t.et = etRuutu;
      if (t.ms <= 0) { delete z.kontaktit[p.id]; t = null; }
    }
    if (t && t.ms > 0) {
      if (!aktT || t.ms > aktT.ms || (t.ms === aktT.ms && p.id === z.kohdeId)) {
        aktP = p; aktT = t;
      }
    }
  }
  return { saalis, aktP, aktT };
};
const askel = (k, Z, P) => {
  kirjaa(k, P);
  const tikki = Math.max(50, Number(ASETUS.tikki) || 250), tMs = k * tikki;
  const a = ansaRuutu(), { W, H } = ruudukko, varattu = new Set(), s0 = perusSiemen(), kentat = new Map();
  let ekaKohde = null;

  // Muuttuneiden despawn: kun vähintään ASETUS.muuttunutMin (120000 ms) on kulunut JA ruutu on kokonaan pimeässä.
  const minElinaika = Math.max(0, Number(ASETUS.muuttunutMin ?? 120000));
  let poistui = false;
  for (let i = SAILO.muuttuneet.length - 1; i >= 0; i--) {
    const m = SAILO.muuttuneet[i];
    if (!m || (tMs - (m.syntyMs ?? 0) >= minElinaika && !onValaistu(m.x, m.y, P))) {
      SAILO.muuttuneet.splice(i, 1);
      poistui = true;
    }
  }
  if (poistui) paivitaLammikot();

  const kaikki = Z.concat(SAILO.muuttuneet);
  for (const z of kaikki) if (z.kuoli < 0) varattu.add(z.y * W + z.x);
  const uudetMuuttuneet = [], kaatuneet = new Set();

  for (const z of kaikki) {
    varmistaZombi(z, s0, k, tMs, tikki);
    if (z.muuttunut && z.syo) { z.syo = false; z.syoId = null; }
    if (!z.muuttunut && z.kuoli >= 0) {
      const r = kaukainen(P, arpa(s0 * 31 + k * 101 + z.n), varattu);
      z.x = z.px = r.x; z.y = z.py = r.y; z.kuoli = -1; z.syo = false; z.syoId = null; z.synty = k; z.syntyMs = tMs;
      z.huomaa = arvoHuomaa(s0, k, z.n); z.luovutus = arvoLuovutus(s0, k, z.n); z.meneta = z.huomaa + hystereesiVali(z); z.kuulo = arvoKuulo(s0, k, z.n);
      z.reaktio = 0; z.reaktioMs = 0; z.reaktioAsti = 0;
      z.kohdeId = null; z.kohde = null; z.vAsk = 0; z.vTauko = 0; z.vTaukoMs = 0; z.vTaukoAsti = 0; z.vDx = 0; z.vDy = 0;
      z.kontaktit = {}; z.kontaktiId = null; z.kontakti = 0; z.kontaktiRaja = 0; z.kontaktiMs = 0; z.kontaktiRajaMs = 0;
      alustaNopeus(z, s0, k, tMs, tikki);
      varattu.add(z.y * W + z.x); continue;
    }

    // Zombi astuu tai päivittää liiketilansa kun sen oma askelväli (seuraavaAskelMs) on täynnä.
    if (tMs >= (z.seuraavaAskelMs || 0)) {
      z.px = z.x; z.py = z.y;
      varattu.delete(z.y * W + z.x);
      const dz = kentta(z.x, z.y);
      const oliKohde = z.kohdeId != null;
      const kohde = valitseKohde(z, dz, P);
      if (kohde) {
        if (!oliKohde) {
          const rMs = arvoReaktioMs(s0, k, z.n);
          z.reaktioAsti = tMs + rMs;
        }
        z.reaktioMs = Math.max(0, (z.reaktioAsti || 0) - tMs);
        z.reaktio = Math.ceil(z.reaktioMs / 1000);
        z.kohdeId = kohde.id; z.kohde = kohde;
        z.vAsk = 0; z.vTauko = 0; z.vTaukoMs = 0; z.vTaukoAsti = 0; z.vDx = 0; z.vDy = 0; z.aaniKohde = null;
        if (!ekaKohde) ekaKohde = kohde;
        if (z.reaktioMs > 0) {
          if (kohde.x !== z.x || kohde.y !== z.y) z.suunta = suunnaksi(Math.sign(kohde.x - z.x), Math.sign(kohde.y - z.y));
          z.viimeAskelMs = tMs; z.seuraavaAskelMs = tMs + tikki; z.piirtoAskelMs = tikki;
        } else {
          let d = kentat.get(kohde.id);
          if (!d) { d = kentta(kohde.x, kohde.y); kentat.set(kohde.id, d); }
          let paras = null; const nyt = d[z.y * W + z.x];
          for (const [dx, dy] of NAAP) {
            const x = z.x + dx, y = z.y + dy, j = y * W + x;
            if (x < 0 || y < 0 || x >= W || y >= H || d[j] < 0 || varattu.has(j)) continue;
            if ((nyt < 0 || d[j] < nyt) && (!paras || d[j] < paras.d)) paras = { x, y, d: d[j], dx, dy };
          }
          if (paras) {
            z.x = paras.x; z.y = paras.y; z.suunta = suunnaksi(paras.dx, paras.dy);
            asetaAskelAika(z, s0, k, tMs, tikki);
          } else {
            if (kohde.x !== z.x || kohde.y !== z.y) z.suunta = suunnaksi(Math.sign(kohde.x - z.x), Math.sign(kohde.y - z.y));
            z.viimeAskelMs = tMs; z.seuraavaAskelMs = tMs + tikki; z.piirtoAskelMs = tikki;
          }
        }
      } else {
        z.kohdeId = null; z.kohde = null; z.reaktio = 0; z.reaktioMs = 0; z.reaktioAsti = 0;
        if (oliKohde) {
          const rnd = arpa(s0 * 1009 + k * 9176 + z.n * 37);
          z.vAsk = 0; z.vDx = 0; z.vDy = 0;
          const taukoMs = arvoTaukoMs(rnd);
          z.vTaukoAsti = tMs + taukoMs; z.vTaukoMs = taukoMs; z.vTauko = Math.ceil(taukoMs / 1000);
        }
        vaella(k, tMs, tikki, z, dz, varattu, s0, a, kentat);
      }
      varattu.add(z.y * W + z.x);
    } else if (z.kohde && !ekaKohde) {
      ekaKohde = z.kohde;
    }

    if (a && z.x === a.x && z.y === a.y) {
      if (z.muuttunut) {
        const idx = SAILO.muuttuneet.indexOf(z);
        if (idx >= 0) { SAILO.muuttuneet.splice(idx, 1); paivitaLammikot(); }
      } else {
        z.kuoli = k; z.kontaktit = {}; z.kontaktiId = null; z.kontakti = 0; z.kontaktiRaja = 0; z.kontaktiMs = 0; z.kontaktiRajaMs = 0;
      }
      continue;
    }

    // Kiinnijäännin kertyvä kontaktilaskuri (per zombi + pelaaja): +1/s samassa ruudussa, +0.5/s viereisessä, -0.25/s ilman kontaktia.
    const { saalis, aktP, aktT } = paivitaKontaktit(z, P, k, tMs, tikki, s0, kaatuneet);
    if (saalis) {
      const kp = saalis.p;
      if (kp.x !== z.x || kp.y !== z.y) z.suunta = suunnaksi(Math.sign(kp.x - z.x), Math.sign(kp.y - z.y));
      z.syo = true; z.syoId = kp.id; z.viimeSyoId = kp.id; z.viimeSyoK = k; z.viimeSyoMs = tMs;
      kaatuneet.add(kp.id);
      for (const zz of kaikki) if (zz.kontaktit) delete zz.kontaktit[kp.id];
      z.kontaktiId = null; z.kontakti = 0; z.kontaktiRaja = 0; z.kontaktiMs = 0; z.kontaktiRajaMs = 0;
      if (z.muuttunut) {
        z.kohdeId = null; z.kohde = null;
      } else {
        z.kuoli = k; z.kontaktit = {};
      }
      uudetMuuttuneet.push({ kp, suunta: z.suunta });
    } else if (aktP && aktT) {
      z.kontaktiId = aktP.id;
      z.kontaktiMs = Math.round(aktT.ms);
      z.kontaktiRajaMs = aktT.rajaMs;
      z.kontakti = Math.round((aktT.ms / 1000) * 10) / 10;
      z.kontaktiRaja = Math.round((aktT.rajaMs / 1000) * 10) / 10;
      if (aktT.et <= 1 && (aktP.x !== z.x || aktP.y !== z.y) && (z.x === z.px && z.y === z.py)) {
        z.suunta = suunnaksi(Math.sign(aktP.x - z.x), Math.sign(aktP.y - z.y));
      }
    } else {
      z.kontaktiId = null; z.kontakti = 0; z.kontaktiRaja = 0; z.kontaktiMs = 0; z.kontaktiRajaMs = 0;
    }
  }

  for (const u of uudetMuuttuneet) luoMuuttunut(u.kp, u.suunta, k, tMs, tikki, s0);

  // Tarkista myös askelen lopussa pimeässä despawnaavat muuttuneet (jos muuttunut juuri astui valosta pimeään).
  let poistuiLopussa = false;
  for (let i = SAILO.muuttuneet.length - 1; i >= 0; i--) {
    const m = SAILO.muuttuneet[i];
    if (!m || (tMs - (m.syntyMs ?? 0) >= minElinaika && !onValaistu(m.x, m.y, P))) {
      SAILO.muuttuneet.splice(i, 1);
      poistuiLopussa = true;
    }
  }
  if (poistuiLopussa) paivitaLammikot();
  return ekaKohde;
};
const suunnaksi = (dx, dy) => ({ '0,-1': 0, '1,-1': 1, '1,0': 2, '1,1': 3, '0,1': 4, '-1,1': 5, '-1,0': 6, '-1,-1': 7 })[dx + ',' + dy] ?? 4;

// ---- piirto (paikalliset hahmot negatiivisilla id:illä + värilammikot kanvaksella lattian päällä, vain tässä clientissä)
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

// Lammikkokanvas (sama asemointi huoneen kanvaksen päälle kuin 684.js:64,74-89 + hahmojen vartaloleikkaus kuten shooter-1.15.2.user.js:1881,1904)
const huoneKanvas = () => {
  if (typeof document === 'undefined' || !document.querySelectorAll) return null;
  for (const c of document.querySelectorAll('.roomView-background > canvas')) if (typeof c.onmousedown === 'function') return c;
  return null;
};
const lammikkoKanvas = (typeof document !== 'undefined' && document.createElement) ? document.createElement('canvas') : null;
const lctx = lammikkoKanvas && lammikkoKanvas.getContext ? lammikkoKanvas.getContext('2d') : null;
if (lammikkoKanvas && lammikkoKanvas.style) {
  lammikkoKanvas.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;pointer-events:none;z-index:1';
}
let lammikkoAla = '';
const piirraLammikot = () => {
  if (!lammikkoKanvas || !lctx || typeof document === 'undefined' || !document.body) return;
  const lammikot = tila.lammikot || [];
  if (!lammikot.length) {
    if (lammikkoKanvas.width > 0 && lammikkoKanvas.height > 0) lctx.clearRect(0, 0, lammikkoKanvas.width, lammikkoKanvas.height);
    return;
  }
  const cv = huoneKanvas(); if (!cv || !cv.getBoundingClientRect) return;
  if (!lammikkoKanvas.isConnected) document.body.insertBefore(lammikkoKanvas, document.body.firstChild);
  const r = cv.getBoundingClientRect(), a = r.left + ',' + r.top + ',' + r.width + ',' + r.height;
  const W = Math.max(1, Math.round(r.width)), H = Math.max(1, Math.round(r.height));
  if (a !== lammikkoAla) { lammikkoAla = a; Object.assign(lammikkoKanvas.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' }); }
  if (lammikkoKanvas.width !== W || lammikkoKanvas.height !== H) { lammikkoKanvas.width = W; lammikkoKanvas.height = H; }
  lctx.clearRect(0, 0, W, H);
  const ac = e._activeRoomActiveCanvas;
  const g = e.getRoomInstanceGeometry && e.getRoomInstanceGeometry(huone, ac);
  const rc = e.getRoomInstanceRenderingCanvas && e.getRoomInstanceRenderingCanvas(huone, ac);
  if (!g || !rc || typeof g.getScreenPoint !== 'function') return;
  const ruudulle = (x, y, z) => {
    const p = g.getScreenPoint({ x, y, z }); if (!p) return null;
    return { x: p.x * rc.scale + rc.width / 2 + rc.screenOffsetX, y: p.y * rc.scale + rc.height / 2 + rc.screenOffsetY };
  };
  const { z: Z } = ruudukko;
  lctx.save();
  for (const lm of lammikot) {
    const zz = Math.max(0, Z[Math.round(lm.y) * ruudukko.W + Math.round(lm.x)] || 0);
    const o = ruudulle(lm.x, lm.y, zz), ex = ruudulle(lm.x + 1, lm.y, zz);
    if (!o || !ex) continue;
    const sc = Math.max(10, Math.abs(ex.x - o.x));
    lctx.fillStyle = lm.vari || '#b01212';
    for (const p of lm.pisarat || []) {
      const pt = ruudulle(lm.x + p.dx, lm.y + p.dy, zz);
      if (!pt) continue;
      const rx = Math.max(2, p.r * sc * 0.95), ry = Math.max(1, p.r * sc * 0.46);
      lctx.globalAlpha = p.a || 0.75;
      lctx.beginPath();
      lctx.ellipse(pt.x, pt.y, rx, ry, 0, 0, Math.PI * 2);
      lctx.fill();
    }
  }
  // Pyyhitään huoneen hahmojen vartalokaistat lammikkokanvaksesta (shooter-1.15.2.user.js:1881,1904), jotta lammikko jää jalkojen alle.
  for (const o of e.getRoomObjects(huone, 100) || []) {
    const L = o && o.getLocation && o.getLocation(); if (!L) continue;
    const s = ruudulle(L.x, L.y, L.z || 0), q = ruudulle(L.x + 1, L.y, L.z || 0);
    if (!s || !q) continue;
    const hw = Math.max(8, Math.abs(q.x - s.x));
    lctx.clearRect(s.x - 0.45 * hw, s.y - 4.8 * hw, 0.9 * hw, 4.85 * hw);
  }
  lctx.restore();
};

const piirretyt = new Map(), piirrettyAsento = new Map();   // n -> objekti-id, n -> viimeksi piirretty asento
const piirra = () => {
  // Zombikohtainen interpolointi: jokainen zombi interpoloidaan omasta viimeisestä askelajastaan (viimeAskelMs) omalla askelvälillään (piirtoAskelMs).
  // Kiinni jäänyt pelaaja EI näe omaa muuttunutta versiotaan (z.muuttunut && z.lahdeId === omaId()).
  const nyt = Date.now(), tikki = Math.max(50, Number(ASETUS.tikki) || 250), { z: Z } = ruudukko, minunId = omaId();
  const nakyvat = new Set();
  const kaikki = tila.zombit.concat(tila.muuttuneet || []);
  for (const z of kaikki) {
    if (z.muuttunut && z.lahdeId === minunId) continue;   // lähdepelaaja ei näe omaa muuttunutta versiotaan
    nakyvat.add(z.n);
    const askelMs = Math.max(1, Number(z.piirtoAskelMs || z.askelMs || tikki));
    const alkuMs = Number(z.viimeAskelMs ?? (SAILO.K * tikki));
    const p = Math.max(0, Math.min(1, (nyt - alkuMs) / askelMs));
    let g = piirretyt.get(z.n);
    const x = z.px + (z.x - z.px) * p, y = z.py + (z.y - z.py) * p, zz = Math.max(0, Z[Math.round(y) * ruudukko.W + Math.round(x)] || 0), sd = z.suunta * 45;
    const asu = (z.muuttunut && z.figuuri) ? z.figuuri : figuuri;
    if (g == null) { g = seuraavaId--; if (!e.addRoomObjectUser(huone, g, new V(x, y, zz), new V(sd), sd, 1, asu)) continue; piirretyt.set(z.n, g); }
    try {
      e.updateRoomObjectUserLocation(huone, g, new V(x, y, zz), null, false, 0, new V(sd), sd, true, false, 16);
      const liikkuu = (z.x !== z.px || z.y !== z.py) && p < 1, asento = z.kuoli >= 0 && !z.syo ? 'lay' : liikkuu ? 'mv' : 'std';
      if (piirrettyAsento.get(z.n) !== asento) { e.updateRoomObjectUserPosture(huone, g, asento, ''); piirrettyAsento.set(z.n, asento); }
    } catch (x) {}
  }
  for (const [n, g] of [...piirretyt.entries()]) {
    if (!nakyvat.has(n)) {
      try { e.removeRoomObjectUser(huone, g); } catch (x) {}
      piirretyt.delete(n);
      piirrettyAsento.delete(n);
    }
  }
  piirraLammikot();
};
tila.kuva = () => tila.zombit.concat(tila.muuttuneet || []).map(z => ({
  n: z.n, muuttunut: !!z.muuttunut, nimi: z.nimi || ('Zombi ' + z.n), lahdeId: z.lahdeId ?? null, lahdeNimi: z.lahdeNimi ?? null,
  x: z.x, y: z.y, kuoli: z.kuoli, kohde: z.kohdeId ?? null,
  huomaa: z.huomaa, luovutus: z.luovutus, meneta: z.meneta, kuulo: z.kuulo,
  perusAskelMs: z.perusAskelMs, askelMs: z.askelMs, reaktioMs: z.reaktioMs || 0,
  tila: z.kuoli >= 0 ? 'kuoli' : z.kohdeId != null ? ((z.reaktioMs || 0) > 0 ? 'reagoi' : 'jahtaa') : (z.vTaukoMs || 0) > 0 ? 'seisoo' : 'vaeltaa',
  kontakti: z.kontaktiMs ? (z.kontakti + 's/' + z.kontaktiRaja + 's') : null,
  id: piirretyt.get(z.n) ?? null,
}));

// ---- Huoneen julkisen chatin kuuntelu (RSCE_CHAT_EVENT, sama väylä kuin 681.js:238-247 ja 682.js:242-245) + salaisen sanan nielu
const SALAISET_SANAT = new Set(['zk684', 'zl684', 'zc684', '73514k']);
let viimeChatAvain = '', viimeChatAika = 0;
const tallennaAani = (roomIndex, teksti, chatType) => {
  if (chatType !== 0 && chatType !== 2) return;   // vain julkinen puhe (0) ja huuto (2); kuiskaus (1) ohitetaan
  const viesti = String(teksti || '').trim();
  if (!viesti || viesti.startsWith(':')) return;
  const ala = viesti.toLowerCase();
  const omaSana = String(ASETUS.salasana || '').trim().toLowerCase();
  if ((omaSana && ala === omaSana) || SALAISET_SANAT.has(ala)) return;
  const nyt = Date.now(), avain = roomIndex + ':' + chatType + ':' + ala;
  if (avain === viimeChatAvain && nyt - viimeChatAika < 150) return;
  viimeChatAvain = avain; viimeChatAika = nyt;
  const P = pelaajat(), puhuja = P.find(p => p.i === Number(roomIndex));
  if (!puhuja || !onKohde(puhuja)) return;
  const tikki = Math.max(50, Number(ASETUS.tikki) || 250);
  // Kiinnitetään ääni tulevaan tikkiin floor(vastaanotto / tikki) + 2, jotta pieni vastaanottoajan ero ei hajota simulaatiota.
  const kAani = Math.floor(nyt / tikki) + 2, huuto = chatType === 2;
  SAILO.aanet.push({ id: puhuja.id, x: puhuja.x, y: puhuja.y, k: kAani, alkuMs: kAani * tikki, voima: huuto ? 1.5 : 1, huuto });
  if (SAILO.aanet.length > 60) SAILO.aanet.shift();
};
const kuuleChat = ev => {
  try {
    if (!ev || (ev.chatType !== 0 && ev.chatType !== 2)) return;
    if (ev.session && ev.session.roomId != null && Number(ev.session.roomId) !== huone) return;
    tallennaAani(ev.objectId, ev.message, ev.chatType);
  } catch (x) {}
};
const vayla = e && e.events;
if (vayla && typeof vayla.addEventListener === 'function') vayla.addEventListener('RSCE_CHAT_EVENT', kuuleChat);
tila._kuuleChat = kuuleChat;

// ---- wired-script-hybridi (682.js:153-206, 442): salaisen sanan lähetys + kaiun nielu (suu ei liiku) + puhekuplan piilotus
let koukkuYhteys = null, koukkuOma = null, koukkuAlkup = null;
const koukku = () => {
  const c = yhteys(); if (!c || typeof c.handleMessages !== 'function') return null;
  if (koukkuYhteys === c && c.handleMessages === koukkuOma) return c;
  const alkup = c.handleMessages;
  const oma = function (...viestit) {
    const julkiset = [];
    try {
      const sana = String(ASETUS.salasana || '').trim().toLowerCase();
      const msgs = dv(c, '_messages');
      const kuiskausLuokat = new Set((msgs && msgs.getEvents && msgs.getEvents(2704) || []).map(x => x && x.constructor));
      const huutoLuokat = new Set((msgs && msgs.getEvents && msgs.getEvents(1036) || []).map(x => x && x.constructor));
      const puheLuokat = new Set((msgs && msgs.getEvents && msgs.getEvents(1446) || []).map(x => x && x.constructor));
      let i;
      viestit = viestit.filter(v => {
        const p = v && v.parser;
        // Palvelin kaiuttaa wf_trg_says_something (piilota=1) -koodin lähettäjälle kuiskauksena (2704) -> niellään, ettei suu liiku eikä kuplaa synny.
        if (sana && p && typeof p.message === 'string' && p.message.trim().toLowerCase() === sana) {
          if (i === undefined) i = omaIndeksi();
          if (i == null || p.roomIndex === i) return false;
        }
        if (p && typeof p.message === 'string' && typeof p.roomIndex === 'number' && !kuiskausLuokat.has(v.constructor) && p.chatType !== 1) {
          const onHuuto = huutoLuokat.has(v.constructor) || p.chatType === 2;
          const onPuhe = puheLuokat.has(v.constructor) || p.chatType === 0 || (!kuiskausLuokat.size && p.chatType == null);
          if (onHuuto || onPuhe) julkiset.push([p.roomIndex, p.message, onHuuto ? 2 : 0]);
        }
        return true;
      });
      if (!viestit.length) return;
    } catch (x) {}
    const tulos = alkup.apply(this, viestit);
    for (const [ri, msg, ct] of julkiset) tallennaAani(ri, msg, ct);
    return tulos;
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
let kuolemaKaynnissa = 0, safeIlmoitettu = 0, omaViimeSyoK = -1;
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
const tarkistaOma = () => {
  if (Date.now() - ALKU < ARMO) return;
  const id = omaId();
  if (!onKohde({ id })) return;
  const o = omaRuutu(); if (!o) return;
  const a = ansaRuutu();
  if (a && o.x === a.x && o.y === a.y) return kuole('Astuit ansaan!');
  const tikki = Math.max(50, Number(ASETUS.tikki) || 250);
  const ikkunaK = Math.max(2, Math.round(2500 / tikki));
  for (const z of tila.zombit.concat(tila.muuttuneet || [])) {
    if (z.muuttunut && z.lahdeId === id) continue;
    if ((z.syo && z.syoId === id) || (z.viimeSyoId === id && z.viimeSyoK > omaViimeSyoK && SAILO.K - z.viimeSyoK <= ikkunaK)) {
      omaViimeSyoK = z.viimeSyoK ?? SAILO.K;
      return kuole('Zombi sai sinut kiinni!');
    }
  }
};

// ---- kello
const ALKU = Date.now(), ARMO = 6000;   // käynnistyksen jälkeen 6 s armoaika
const tiki = () => {
  const nyt = Date.now(), tikki = Math.max(50, Number(ASETUS.tikki) || 250), k = Math.floor(nyt / tikki), e1 = Math.floor(nyt / ASETUS.epookki);
  if (!ruudukko) { ruudukko = rakenna(); if (!ruudukko || !ruudukko.ruudut.length || !valmistele()) { ruudukko = null; return; } }
  koukku();
  const P = pelaajat();
  const maxKirittava = Math.max(30, Math.round(30000 / tikki));
  if (SAILO.E === e1 && SAILO.zombit.length === ASETUS.maara && k - SAILO.K < maxKirittava) {
    if (tila.zombit !== SAILO.zombit) { tila.zombit = SAILO.zombit; paivitaLammikot(); lokiin({ jatkettu: SAILO.K }); }
  } else {
    SAILO.E = e1; SAILO.muuttuneet = []; SAILO.aanet = []; tila.zombit = SAILO.zombit = synny(e1, P, k); paivitaLammikot(); historia.clear(); SAILO.K = k - 1;
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
  if (vayla && typeof vayla.removeEventListener === 'function') vayla.removeEventListener('RSCE_CHAT_EVENT', kuuleChat);
  if (lammikkoKanvas && lammikkoKanvas.remove) lammikkoKanvas.remove();
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
