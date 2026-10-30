// Jaetut zombit (pohja: huoneet/684-zombit.js, wired-hybridi: huoneet/682.js).
// kp 30.10. 15:58-16:10: zombit yhteisiä kaikille huoneessa olijoille, jahtaavat ketä tahansa pelaajaa (hitainta; ei botteja eikä
//   Herra-Robottia 245). Ei kiinteitä spawneja: zombi syntyy kävelykelpoiselle lattiaruudulle mahdollisimman kauas kaikista pelaajista
//   (BFS-reittietäisyys, ei linnuntie), deterministisesti siemenestä + tikistä, ei ovelle eikä alle ASETUS.oviEtaisyys ruudun päähän
//   ovesta. Kiinni saanut zombi jää paikalleen syömään/seisomaan uhrin viereen koko kuolemamakuun (ASETUS.kuolemaMakuu, 1500 ms)
//   ajaksi (ei liiku eikä nappaa muita) ja syntyy vasta makuun päätyttyä uudelleen kauas (kp 30.10. 19:54).
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
//   5) Kiinni jääneestä pelaajasta syntyy SAMAAN ruutuun "muuttunut" zombi vasta kuolemamakuun (ASETUS.kuolemaMakuu, 1500 ms) päätyttyä
//      (kun uhri on teleportattu pois): pelaajan oma figuuri zombifioituna (Left 4 Kuplan zZombify-muunnoksella), sekä pysyvä pelaajakohtainen
//      verilammikko (SAILO.lammikot: viimeisin per pelaaja, näkyy kaikille, korvautuu saman pelaajan uudella kuolemalla ja katoaa vain kun pelaaja
//      poistuu huoneesta). Kiinni jäänyt pelaaja EI näe omaa muuttunutta versiotaan, eikä muuttunut jahtaa tai ota kontaktia lähdepelaajaansa.
//      Muuttunut elää vähintään ASETUS.muuttunutMin (120000 ms, säilyy epookin yli) ja despawnaa sen jälkeen heti kun sen ruutu on kokonaan pimeässä.
//      Yksi muuttunut per pelaaja, korkeintaan ASETUS.muuttuneitaMax (4) kerrallaan.
//   6) Nopeuden vaihtelu: jokaiselle zombille arvotaan syntyessä (ja uudelleensyntyessä) oma perusnopeus väliltä ASETUS.askelVali
//      (800..1400 ms/ruutu), ja saman zombin askelväli vaihtelee dynaamisesti joka askeleella (±20 % aaltoilu + satunnaiset lyhyet
//      kiihdytykset/hidastukset). Simulaatio pyörii lyhyellä perustikillä (ASETUS.tikki = 250 ms) ja piirto interpoloidaan zombin omasta askelajasta.
//   7) Ääniveto ja tutkiminen: julkiset viestit ja huudot kuuluvat kuuloetäisyydellä (ASETUS.kuuloVali 12..20 ruutua, huuto x1.5).
//      Yksittäinen ääni painottaa vaellusta ääntä kohti; kun äänen paino >= ASETUS.tutkiRaja (1.8, ~2 viestiä tai huuto), vaeltava
//      zombi katkaisee vaellustauon ja tutkii suoraan BFS-reittiä äänen lähtöruutuun ilman taukoja kunnes on <= 2 ruudun päässä.
// Konsolissa: zombit.loki · zombit.zombit · zombit.muuttuneet · zombit.kohde · zombit.ovi · zombit.safe(true|false) · zombit.asetus · zombit.kuva()
const ASETUS = {
  maara: 3,            // tavallisten zombien määrä (päivittyy pelaajamäärän mukaan: maaraPohja + kohteet, min maaraMin, max maaraMax)
  maaraPohja: 2,       // kp 19:27: pohjamäärä, johon lisätään kohteeksi kelpaavien pelaajien määrä
  maaraMin: 3,         // kp 19:27: tavallisten zombien vähimmäismäärä
  maaraMax: 8,         // kp 19:27: tavallisten zombien enimmäismäärä
  tikki: 250,          // ms; simulaation perustikki (zombin oma askelväli 800..1400 ms ±vaihtelu)
  askelVali: [800, 1400], // ms per ruutu: jokaiselle zombille arvotaan syntyessä ja uudelleensyntyessä oma perusnopeus tältä väliltä
  nopeusVaihtelu: 0.2, // saman zombin nopeuden jatkuva aaltoilu (±20 %) + satunnaiset lyhyet kiihdytykset/hidastukset
  epookki: 1800000,    // ms (30 min); uusi aalto ilman näkyviä hyppyjä (valaistu zombi synkataan vasta pimeässä)
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
  kontaktiMin: 0.8,    // kp 20:13 "pidentää se minimi" (oli 0.5; kp 19:46 "kiinni jää 0,5-1,5s", alun perin 3). sekuntia (tai ms jos >= 50): vähimmäiskontaktiraja ennen kiinnijääntiä
  kontaktiMax: 1.5,    // (oli 6) sekuntia (tai ms jos >= 50): enimmäiskontaktiraja (arvotaan deterministisesti 3..6 s per zombi+pelaaja)
  kontaktiSama: 1,     // kertymäkerroin samassa ruudussa (+1 per s eli +tikki ms per tikki)
  kontaktiViereinen: 0,   // kp 20:11 "käy": vain sama ruutu kerryttää (oli 0.5). kertymäkerroin viereisessä ruudussa (+0.5 per s eli +0.5*tikki ms per tikki)
  kontaktiHiipuma: 0.25,  // hiipumakerroin ilman kontaktia (-0.25 per s eli -0.25*tikki ms per tikki; ei nollaudu heti)
  muuttunutMin: 120000, // ms; kiinni jääneestä pelaajasta syntyneen muuttuneen zombin vähimmäiselinaika (2 min) ennen pimeässä despawnausta
  muuttuneitaMax: 4,   // enintään näin monta muuttunutta zombia samaan aikaan huoneessa (vanhin poistuu ensin)
  ilmanValoa: 1.8,     // ruutua: pelaajan perusvalosäde ilman käsiesinettä (jos window.pimeys.ilmanValoa ei ole saatavilla)
  lammikkoVarit: ['#8b0000', '#a30d0d', '#b01212', '#7a0a0a'], // vain punaisen sävyjä (kp 19:09)
  kuuloVali: [12, 20], // ruutua (reittietäisyys): zombikohtainen kuuloetäisyys huoneen julkisille chat-viesteille (huuto x1.5)
  aaniKesto: 30000,    // ms; kuinka kauan chat-ääni vetää vaeltelevia zombeja vinosti puoleensa (hiipuu ajan myötä)
  tutkiRaja: 1.8,      // äänen voimakkuusraja: tämän ylittävä ääni katkaisee vaellustauon heti ja laittaa zombin tutkimaan äänen lähtöruutua
  tutkiEtaisyys: 2,    // ruutua (BFS-reitti): zombi tutkii kunnes on <= N ruudun päässä äänen lähtöruudusta
  vaihtoEro: 3,        // ruutua (kp 19:15): kohde vaihtuu jos toinen pelaaja on vähintään näin paljon lähempänä kuin nykyinen kohde
  vaihtoTn: 0.5,       // todennäköisyys (50 %) vaihtaa selvästi lähempänä olevaan kohteeseen
  vaihtoVali: 3000,    // ms; kohteenvaihdon arvonnan minimiväli ettei arvo joka tikki
  aaniVaihtoTn: [0.35, 0.6], // [puhe, huuto] (kp 19:15): todennäköisyys vaihtaa kohteeksi äänen päästänyt pelaaja lähellä (BFS <= huomaa)
  aaniVaihtoMax: 0.8,  // ryhmän kertyneen äänipainon mukainen maksimitodennäköisyys
  ovi: { x: null, y: null }, // täytetään huoneesta mitattuna; jos null, luetaan clientin huonemallista (vain spawn-etäisyyteen)
  eiSpawnia: [[20, 34, 28, 37]],   // alanurkan tasku (Mesa Escopeta 22,37), kp 30.10. 18:59
  eiZombeja: null,     // kp 19:00 "tuol on aidattu alue · siin on portti · sen taakse ei saa mennä zombeja", oletus = eiSpawnia
  oviEtaisyys: 10,     // ruutua (reittietäisyys): ei ovelle eikä alle N ruudun päähän ovesta
  kaukana: 10,         // ruutua (reittietäisyys): vähimmäisetäisyys pelaajista syntyessä (jos mahdollista)
  hajonta: 3,          // ruutua: syntyruutu valitaan kauimpien ruutujen kärjestä (maxEtaisyys - hajonta .. maxEtaisyys)
  ansa: null,          // ei ansaa
  lattiaYli: 0.3,      // zombi kävelee ruudulla jonka pino on enintään näin paljon lattian yli
  kohteet: null,       // null = jahtaa ketä tahansa pelaajaa (ei SALLITUT-rajausta)
  eiKohteena: [245],   // Herra-Robotti (user id 245) ja botit eivät ole kohteita
  turvassa: [],        // käyttäjä-id:t joille :safe-poikkeus on sallittu (oletus tyhjä)
  salasana: 'zk684',   // salainen sana jonka skripti sanoo kiinnijäädessä (wired: wf_trg_says_something -> wf_act_teleport_to)
  kuolemaMakuu: 1500,  // ms (kp 19:25); kiinnijäädessä uhrin hahmo makaa maassa ('lay') tämän ajan ennen zk684-teleporttia
  kuolemaLukko: 5000,  // ms; lukko ettei sama kiinnijäänti lähetä sanaa monta kertaa
  siemen: 684,         // deterministisen satunnaislukugeneraattorin siemen
  figuuri: 'hd-11509-1461.hr-3714-45.ch-3530-1330.lg-11495-1408.sh-3720-82',   // varalla; oikea luetaan huoneen Zombie-botilta
  zombiAsut: [
    'hd-180-1.ch-210-66.lg-270-82.sh-290-80.hr-100-31',
    'hd-600-1.ch-630-62.lg-695-62.sh-725-62.hr-515-33',
    'hd-180-2.ch-215-64.lg-275-64.sh-300-64.hr-115-38',
    'hd-600-2.ch-635-73.lg-700-73.sh-730-73.hr-520-40',
    'hd-190-3.ch-220-89.lg-280-89.sh-305-89.hr-125-42',
    'hd-605-3.ch-640-92.lg-705-92.sh-735-92.hr-525-45',
    'hd-195-4.ch-225-70.lg-285-70.sh-310-70.hr-130-35',
    'hd-610-4.ch-645-80.lg-710-80.sh-740-80.hr-530-37'
  ],
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
    if (Math.abs(lattia) < 0.5 && pino - lattia <= ASETUS.lattiaYli && !eiZombeja(x, y)) ok[i] = 1;
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
  : (window.__zombitJaettu = { huone, E: -1, K: -1, zombit: [], muuttuneet: [], lammikot: [], aanet: [], makaavat: new Map(), piirretytIdt: new Set(), seuraavaMuuttunutN: 1000, historia: new Map() });
if (!Array.isArray(SAILO.muuttuneet)) SAILO.muuttuneet = [];
if (!Array.isArray(SAILO.lammikot)) SAILO.lammikot = [];
if (!Array.isArray(SAILO.aanet)) SAILO.aanet = [];
if (!(SAILO.makaavat instanceof Map)) SAILO.makaavat = new Map();
if (!(SAILO.piirretytIdt instanceof Set)) SAILO.piirretytIdt = new Set();
if (!(SAILO.seuraavaMuuttunutN >= 1000)) SAILO.seuraavaMuuttunutN = 1000;
tila.muuttuneet = SAILO.muuttuneet;
tila.lammikot = SAILO.lammikot;
tila.makaavat = SAILO.makaavat;

// Siivotaan heti käynnistyksessä KAIKKI vanhat huoneobjektit (SAILO.piirretytIdt ja -950000..-959999) ennen ensimmäistä piirtoa
try {
  for (const g of SAILO.piirretytIdt) try { e.removeRoomObjectUser(huone, g); } catch (x) {}
  SAILO.piirretytIdt.clear();
  for (const o of (e.getRoomObjects(huone, 100) || [])) {
    if (o && o.id <= -950000 && o.id >= -959999) {
      try { e.removeRoomObjectUser(huone, o.id); } catch (x) {}
    }
  }
} catch (x) {}
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
const arvoKuulo = (s0, k, zn) => lukuValilta(ASETUS.kuuloVali, 12, 20, arpa(s0 * 5801 + k * 2381 + zn * 179));
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

// ---- Kuolemamakuu (kp 19:25 & 19:54): kiinnijäädessä JOKAINEN client näyttää uhrin hahmon paikallisesti makaavana ('lay')
//   ASETUS.kuolemaMakuu (1500 ms) ajan ennen zk684-teleporttia. Makuun aikana uhri ei voi jäädä uudelleen kiinni, nappaava zombi
//   pysyy paikallaan syömässä/seisomassa uhrin vieressä, ja uhrin muuttunut zombiversio syntyy uhrin ruutuun vasta makuun päätyttyä.
const makuuAjastimet = new Set();
const asetaHahmonAsento = (ri, asento) => {
  if (ri == null || ri < 0 || !e || typeof e.updateRoomObjectUserPosture !== 'function') return false;
  try { e.updateRoomObjectUserPosture(huone, ri, asento, ''); return true; } catch (x) { return false; }
};
const onMakaava = (pid, tMs) => {
  const mk = SAILO.makaavat && SAILO.makaavat.get(pid);
  if (!mk) return false;
  if (tMs != null && tMs >= mk.loppuMs) return false;
  return true;
};
const paivitaMakaavat = (P, tMs, k, tikki, s0) => {
  if (!(SAILO.makaavat instanceof Map) || !SAILO.makaavat.size) return;
  for (const [pid, mk] of [...SAILO.makaavat.entries()]) {
    const p = Array.isArray(P) ? P.find(x => x && x.id === pid) : null;
    const ri = (p && p.i != null) ? p.i : mk.i;
    const telesi = p && isFinite(p.x) && isFinite(p.y) && Math.hypot(p.x - mk.x, p.y - mk.y) > 3;
    const aikaTaynna = (tMs != null && tMs >= mk.loppuMs);
    if (!p || telesi || aikaTaynna) {
      if (mk.ajastin) { clearTimeout(mk.ajastin); makuuAjastimet.delete(mk.ajastin); mk.ajastin = null; }
      if (!mk.asentoPalautettu) { asetaHahmonAsento(ri, 'std'); mk.asentoPalautettu = true; }
    } else if (!mk.asentoPalautettu) {
      try {
        const ho = e.getRoomObject && e.getRoomObject(huone, ri, 100);
        const nyk = ho && ho.model && ho.model.getValue && ho.model.getValue('figure_posture');
        if (nyk && nyk !== 'lay') asetaHahmonAsento(ri, 'lay');
      } catch (x) {}
    }
    // kp 20:26 "näkyy hahmo samaa aikaa siin zombin kaa": teleportti näkyy muille vasta verkon yli makuun jälkeen ->
    //   muuttunut syntyy kiinteällä lisäviiveellä (ASETUS.muuttunutViive), sama simulaatioaika kaikilla clienteillä.
    if (tMs != null && tMs >= mk.loppuMs + Math.max(0, Number(ASETUS.muuttunutViive ?? 2500)) && k != null) {
      if (!mk.muuttunutLuotu) {
        mk.muuttunutLuotu = true;
        luoMuuttunut(mk, mk.suunta, k, tMs, tikki || Math.max(50, Number(ASETUS.tikki) || 250), s0 || perusSiemen(), P);
      }
      SAILO.makaavat.delete(pid);
    }
  }
};
const aloitaMakuu = (kp, suunta, k, tMs, tikki, s0, P) => {
  if (!kp || !kp.id) return;
  const makuuMs = Math.max(0, Number(ASETUS.kuolemaMakuu ?? 1500));
  const vanha = SAILO.makaavat.get(kp.id);
  if (vanha && vanha.ajastin) { clearTimeout(vanha.ajastin); makuuAjastimet.delete(vanha.ajastin); }
  const zn = ++SAILO.seuraavaMuuttunutN;
  const siem = s0 || perusSiemen();
  const lm = luoLammikko(kp.x, kp.y, zn, kp, k, tMs, siem);
  if (!Array.isArray(SAILO.lammikot)) SAILO.lammikot = [];
  SAILO.lammikot = SAILO.lammikot.filter(l => l && (l.lahdeId ?? l.id) !== kp.id);
  SAILO.lammikot.push(lm);
  // kp 20:06 "kai kuollessa targeted pelaaja resetoituu, vaik ois huutanu": uhrin äänet pois, ettei vanha huuto vedä zombeja hänen peräänsä
  if (Array.isArray(SAILO.aanet)) SAILO.aanet = SAILO.aanet.filter(a => a && a.id !== kp.id);
  paivitaLammikot(P);
  const mk = {
    id: kp.id, i: kp.i, nimi: kp.nimi || null, figuuri: kp.figuuri || figuuri,
    x: kp.x, y: kp.y, suunta: suunta ?? 4, zn, lammikko: lm,
    alkuK: k, alkuMs: tMs, loppuMs: tMs + makuuMs,
    muuttunutLuotu: false, asentoPalautettu: false, ajastin: null,
  };
  if (makuuMs <= 0) {
    SAILO.makaavat.delete(kp.id);
    mk.muuttunutLuotu = true;
    luoMuuttunut(mk, mk.suunta, k, tMs, tikki || Math.max(50, Number(ASETUS.tikki) || 250), siem, P);
    return;
  }
  asetaHahmonAsento(kp.i, 'lay');
  mk.ajastin = setTimeout(() => {
    makuuAjastimet.delete(mk.ajastin);
    mk.ajastin = null;
    if (SAILO.makaavat.get(kp.id) === mk && !mk.asentoPalautettu) {
      mk.asentoPalautettu = true;
      const P2 = pelaajat(), p = P2.find(x => x && x.id === kp.id);
      asetaHahmonAsento((p && p.i != null) ? p.i : mk.i, 'std');
    }
  }, makuuMs);
  if (mk.ajastin && typeof mk.ajastin.unref === 'function') mk.ajastin.unref();
  makuuAjastimet.add(mk.ajastin);
  SAILO.makaavat.set(kp.id, mk);
};

// Zombikohtainen kohdevalinta: huomaa pelaajan kun BFS-reittietäisyys <= z.huomaa (5..9),
//   luopuu kun etäisyys > z.meneta (z.huomaa + z.luovutus, 3..5; hystereesi). Muuttunut EI jahtaa omaa lähdepelaajaansa (z.lahdeId).
// kp 19:15: kohteen vaihto jos toinen pelaaja on SELVÄSTI lähempänä (B <= A - vaihtoEro) tai äänen perusteella.
const valitseKohde = (z, dz, P, k, tMs, s0) => {
  if (z.huomaa == null) z.huomaa = arvoHuomaa(perusSiemen(), z.synty ?? SAILO.E, z.n);
  if (z.luovutus == null) z.luovutus = arvoLuovutus(perusSiemen(), z.synty ?? SAILO.E, z.n);
  const huomaa = Math.max(0, Number(z.huomaa));
  const meneta = Math.max(huomaa, huomaa + hystereesiVali(z));
  z.meneta = meneta;

  const ehdokkaat = [];
  let nykyinenEt = -1, nykyinenP = null;

  for (const p of P) {
    if (!onKohde(p)) continue;
    if (onMakaava(p.id, tMs)) continue;   // kuolemamakuun aikana uhria ei jahdata
    if (z.muuttunut && p.id === z.lahdeId) continue;   // muuttunut ei jahtaa omaa lähdepelaajaansa
    const et = etaisyysPelaajaan(dz, p);
    if (et < 0) continue;   // yläkerroksessa tai muualla minne zombi ei pääse
    const raja = p.id === z.kohdeId ? meneta : huomaa;
    if (et > raja) continue;   // näköpiirin ulkopuolella
    // Teleportannut (yli 3 ruutua tikissä = kuoli ja siirtyi ovelle, tai tuli huoneeseen) ei ole kohde ikkunan aikana.
    const l = liike(p.id); if (l.hyppy > 3) continue;
    const m = l.s;
    const obj = { ...p, m, et };
    ehdokkaat.push(obj);
    if (p.id === z.kohdeId) { nykyinenEt = et; nykyinenP = obj; }
  }

  if (!ehdokkaat.length) return null;

  // 1. Jos zombi jo jahtaa kohdetta ja nykyinen kohde on yhä kelvollinen:
  if (nykyinenP) {
    // A) Äänivaihto (kp 19:15): kun jahtaava zombi kuulee uuden äänen pelaajalta B != kohdeId ja B on lähellä (et <= huomaa; huuto x1.5)
    if (Array.isArray(SAILO.aanet) && SAILO.aanet.length) {
      const kestoMs = Math.max(1000, aikaMs(ASETUS.aaniKesto ?? 30000, 30));
      for (let i = SAILO.aanet.length - 1; i >= 0; i--) {
        const a = SAILO.aanet[i];
        if (!a || (tMs != null && tMs - a.alkuMs >= kestoMs) || (k != null && a.k > k)) continue;
        if (a.id === z.kohdeId) continue;
        if (z.muuttunut && a.id === z.lahdeId) continue;
        const b = ehdokkaat.find(e => e.id === a.id);
        if (!b) continue;
        const aaniRaja = Math.round(huomaa * (a.huuto ? 1.5 : 1));
        if (b.et > aaniRaja) continue;

        // Arvonta kerran per uusi ääniviesti (äänen k / alkuMs + zombin n)
        const aaniAvain = a.id + ':' + (a.alkuMs || a.k);
        if (!z._aaniVaihtoArvottu) z._aaniVaihtoArvottu = new Set();
        if (!z._aaniVaihtoArvottu.has(aaniAvain)) {
          z._aaniVaihtoArvottu.add(aaniAvain);
          const perusTn = Array.isArray(ASETUS.aaniVaihtoTn) ? (a.huuto ? ASETUS.aaniVaihtoTn[1] : ASETUS.aaniVaihtoTn[0]) : 0.4;
          const tn = Math.min(Number(ASETUS.aaniVaihtoMax ?? 0.8), (Number(perusTn) || 0.4) * (a.voima || 1));
          const rndAani = arpa(s0 * 3821 + (a.alkuMs || a.k || 0) * 1109 + z.n * 73);
          if (rndAani() < tn) {
            z._vaihdettuKohteeseen = true;
            return b;
          }
        }
      }
    }

    // B) Selvästi lähempänä oleva pelaaja B (B <= A - vaihtoEro)
    const vaihtoEro = Math.max(1, Number(ASETUS.vaihtoEro ?? 3));
    const laheisemmat = ehdokkaat.filter(e => e.id !== z.kohdeId && e.et <= huomaa && e.et <= nykyinenEt - vaihtoEro);
    if (laheisemmat.length) {
      laheisemmat.sort((p, q) => p.et - q.et || p.m - q.m || p.id - q.id);
      const parasB = laheisemmat[0];
      const vaihtoVali = Math.max(500, Number(ASETUS.vaihtoVali ?? 3000));
      const pariAvain = z.kohdeId + '->' + parasB.id;
      if (z._viimeVaihtoAvain !== pariAvain || (tMs != null && tMs - (z._viimeVaihtoMs || 0) >= vaihtoVali)) {
        z._viimeVaihtoAvain = pariAvain;
        z._viimeVaihtoMs = tMs || 0;
        const vaihtoTn = Number(ASETUS.vaihtoTn ?? 0.5);
        const kAika = k ?? Math.floor((tMs || 0) / 250);
        const rndVaihto = arpa(s0 * 4787 + Math.floor(kAika / Math.max(1, Math.round(vaihtoVali / 250))) * 1237 + z.n * 67 + parasB.id * 31);
        if (rndVaihto() < vaihtoTn) {
          z._vaihdettuKohteeseen = true;
          return parasB;
        }
      }
    }

    // Jos ei vaihdettu, pidetään nykyinen kohde
    return nykyinenP;
  }

  // 2. Ei nykyistä kohdetta -> valitaan hitain (pienin liike ikkunassa, tasapelissä pienin id)
  let paras = null;
  for (const e of ehdokkaat) {
    if (!paras || e.m < paras.m) paras = e;
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
  const kestoMs = Math.max(1000, aikaMs(ASETUS.aaniKesto ?? 30000, 30));
  const kuulo = Math.max(1, Number(z.kuulo ?? 16));
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
//   Kun äänen paino >= ASETUS.tutkiRaja (1.8), zombi tutkii ääntä ja kävelee BFS-reittiä suoraan äänen lähtöruutuun ilman vaellustaukoja.
const vaella = (k, tMs, tikki, z, dz, varattu, s0, a, kentat) => {
  const rnd = arpa(s0 * 1009 + k * 9176 + z.n * 37 + (z.askelNro || 0) * 19);
  const aani = dz ? etsiAani(z, dz, k, tMs) : null;
  z.aaniKohde = aani ? { x: aani.x, y: aani.y, paino: Math.round(aani.paino * 100) / 100 } : null;

  const tutkiRaja = Number(ASETUS.tutkiRaja ?? 1.8);
  const tutkiEtaisyys = Number(ASETUS.tutkiEtaisyys ?? 2);
  const onTutkinta = !!(aani && aani.paino >= tutkiRaja);

  if ((z.vTaukoAsti || 0) > tMs) {
    if (onTutkinta) {
      // tutkiRaja ylittävä ääni katkaisee käynnissä olevan vaellustauon heti
      z.vTaukoAsti = 0;
      z.vTaukoMs = 0;
      z.vTauko = 0;
    } else {
      // Mikä tahansa ääni (paino >= 1) lyhentää käynnissä olevaa vaellustaukoa
      if (aani && aani.paino >= 1.0 && z.vTaukoAsti - tMs > 1250 && z._aaniLyh !== aani.alkuMs) {
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
  }
  z.vTaukoMs = 0; z.vTauko = 0; z.vTaukoAsti = 0;

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

  // "Tutkiminen": kun ryhmän paino >= ASETUS.tutkiRaja (oletus 1.8), vaeltava zombi kävelee REITTIÄ PITKIN
  // (sama BFS-kenttä kentta(aani.x, aani.y)) kohti äänen LÄHTÖRUUTUA (ei pelaajaa) vaellusnopeudella,
  // ilman vaellustaukoja, kunnes on <= 2 ruudun päässä siitä tai ääni hiipuu alle rajan.
  if (onTutkinta) {
    const avain = 'a:' + aani.x + ',' + aani.y;
    let da = kentat && kentat.get(avain);
    if (!da) { da = kentta(aani.x, aani.y); if (kentat) kentat.set(avain, da); }
    const nytD = da[z.y * W + z.x];

    if (nytD > tutkiEtaisyys) {
      let paras = null;
      for (const e of ehdokkaat) {
        const d = da[e.y * W + e.x];
        if (d >= 0 && (nytD < 0 || d < nytD) && (!paras || d < paras.d)) paras = { ...e, d };
      }
      if (paras) {
        z.vDx = paras.dx; z.vDy = paras.dy;
        z.x = paras.x; z.y = paras.y; z.suunta = suunnaksi(paras.dx, paras.dy);
        z.vAsk = 0; // tutkiessa ei vaellusaskelpätkiä eikä taukoja
        z.vTaukoAsti = 0; z.vTaukoMs = 0; z.vTauko = 0;
        asetaAskelAika(z, s0, k, tMs, tikki);
        return;
      }
    }
    // Jos etäisyys on jo <= tutkiEtaisyys (2) tai reittiä ei löydy, jatketaan normaalilla vaelluksella
  }

  if (!(z.vAsk > 0)) {
    z.vAsk = lukuValilta(ASETUS.vaellusAskeleet, 2, 4, rnd);
    z.vDx = 0; z.vDy = 0;
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
            // Vinosti ääntä kohti (sivuviistoon lähestyvä askel) painottuu vahvimmin, jotta liike on kaartamista eikä suoraa jahtia
            const vino = (e.dx !== suoraDx || e.dy !== suoraDy);
            w = (1 + veto * 5) * (vino ? 1.3 : 0.95);
          } else if (d === nytD) {
            w = 1 + veto * 0.65;
          } else {
            w = Math.max(0.05, 1 - veto * 0.6);
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
// kp 30.10. 18:59 "tuol on alue mihin ei sais spawnata zombeja" (osoitti Mesa Escopeta 446609 @ 22,37): ASETUS.eiSpawnia = [x0, y0, x1, y1] -suorakaiteet.
const eiSpawnia = (x, y) => (Array.isArray(ASETUS.eiSpawnia) ? ASETUS.eiSpawnia : []).some(r => Array.isArray(r) && x >= r[0] && y >= r[1] && x <= r[2] && y <= r[3]);
const eiZombeja = (x, y) => {
  const lista = Array.isArray(ASETUS.eiZombeja) ? ASETUS.eiZombeja : (Array.isArray(ASETUS.eiSpawnia) ? ASETUS.eiSpawnia : []);
  return lista.some(r => Array.isArray(r) && x >= r[0] && y >= r[1] && x <= r[2] && y <= r[3]);
};
const kaukainen = (P, rnd, varattu) => {
  const { W, H, ok, ruudut, ovi, dOvi } = ruudukko, a = ansaRuutu(), minOvi = Math.max(1, Number(ASETUS.oviEtaisyys) || 0);
  let ehdokkaat = ruudut.filter(i => {
    const x = i % W, y = (i - x) / W;
    if (a && x === a.x && y === a.y) return false;
    if (ovi && x === ovi.x && y === ovi.y) return false;
    if (eiSpawnia(x, y)) return false;
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
  const pimeat = ehdokkaat.filter(i => !onValaistu(i % W, (i - i % W) / W, P));
  if (pimeat.length) ehdokkaat = pimeat;
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

// ---- Värilammikko (per pelaaja, irti muuttuneista) ja muuttunut zombi (kiinni jääneestä pelaajasta)
// kp 30.10. 19:18: SAILO.lammikot = viimeisin lammikko per pelaaja (kiinnijääntiruutu, väri), näkyy kaikille (myös itselle),
//   korvautuu saman pelaajan seuraavalla kuolemalla, ja katoaa VAIN kun pelaaja ei enää ole huoneessa (pelaajat() ei sisällä id:tä).
const paivitaLammikot = (P) => {
  if (!Array.isArray(SAILO.lammikot)) SAILO.lammikot = [];
  if (Array.isArray(P)) {
    const lasna = new Set(P.map(p => p && p.id));
    SAILO.lammikot = SAILO.lammikot.filter(l => l && lasna.has(l.lahdeId ?? l.id));
  }
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
  return { id: kp.id, lahdeId: kp.id, lahdeNimi: kp.nimi || null, n: zn, x, y, vari, pisarat, syntyK: k, syntyMs: tMs };
};
const luoMuuttunut = (kp, suunta, k, tMs, tikki, s0, P) => {
  const lahdeId = kp && (kp.id ?? kp.lahdeId);
  if (!lahdeId) return null;
  if (SAILO.muuttuneet.some(m => m.lahdeId === lahdeId && m.synty === k)) return null;
  // kp 30.10. 18:58 & 19:18: yksi muuttunut per pelaaja ja yksi lammikko per pelaaja; uusi kuolema korvaa saman pelaajan vanhan
  const zn = kp.zn || (++SAILO.seuraavaMuuttunutN);
  let lm = kp.lammikko || null;
  if (!lm) {
    lm = luoLammikko(kp.x, kp.y, zn, kp, k, tMs, s0);
    if (!Array.isArray(SAILO.lammikot)) SAILO.lammikot = [];
    SAILO.lammikot = SAILO.lammikot.filter(l => l && (l.lahdeId ?? l.id) !== lahdeId);
    SAILO.lammikot.push(lm);
  }

  SAILO.muuttuneet = SAILO.muuttuneet.filter(m => m.lahdeId !== lahdeId);
  const maxM = Math.max(1, Math.floor(Number(ASETUS.muuttuneitaMax ?? 4)));
  while (SAILO.muuttuneet.length >= maxM) SAILO.muuttuneet.shift();
  const siemen = (s0 * 4093 + k * 1301 + (lahdeId || 0) * 89 + zn) >>> 0;
  const huomaa = arvoHuomaa(s0, k, zn), luovutus = arvoLuovutus(s0, k, zn), kuulo = arvoKuulo(s0, k, zn);
  const alkuTaukoMs = 1000;
  const m = {
    n: zn, muuttunut: true, tyyppi: 'muuttunut',
    lahdeId, lahdeNimi: kp.nimi || null, nimi: 'Muuttunut ' + (kp.nimi || ('#' + lahdeId)),
    figuuri: zombifioiAsu(kp.figuuri || figuuri, siemen),
    x: kp.x, y: kp.y, px: kp.x, py: kp.y, kuoli: -1, synty: k, syntyMs: tMs, suunta: (suunta ?? kp.suunta) ?? 4,
    huomaa, luovutus, meneta: huomaa + luovutus, kuulo,
    reaktio: 0, reaktioMs: 0, reaktioAsti: 0,
    kohdeId: null, kohde: null,
    vAsk: 0, vTauko: Math.ceil(alkuTaukoMs / 1000), vTaukoMs: alkuTaukoMs, vTaukoAsti: tMs + alkuTaukoMs, vDx: 0, vDy: 0,
    kontaktit: {}, kontaktiId: null, kontakti: 0, kontaktiRaja: 0, kontaktiMs: 0, kontaktiRajaMs: 0, syoId: null, syoAstiMs: 0,
    lammikko: lm,
  };
  alustaNopeus(m, s0, k, tMs, tikki);
  SAILO.muuttuneet.push(m);
  paivitaLammikot(P);
  return m;
};

// ---- simulaatio (deterministinen)
const perusSiemen = () => Number(ASETUS.siemen) || huone || 684;
// kp 19:27: tavallisten zombien määrä kasvaa pelaajamäärän mukaan: maaraPohja (2) + kohteet, min maaraMin (3), max maaraMax (8)
const laskeMaara = (P) => {
  const pohja = Number(ASETUS.maaraPohja ?? 2);
  const min = Math.max(1, Number(ASETUS.maaraMin ?? 3));
  const max = Math.max(min, Number(ASETUS.maaraMax ?? 8));
  const nKohde = Array.isArray(P) ? P.filter(onKohde).length : 0;
  return Math.max(min, Math.min(max, Math.floor(pohja + nKohde)));
};
const luoPerusZombi = (n, eSynty, P, k0, tMs, tikki, s0, varattu) => {
  const { W } = ruudukko;
  const r = kaukainen(P, arpa(s0 * 7919 + eSynty * 101 + n), varattu);
  varattu.add(r.y * W + r.x);
  const huomaa = arvoHuomaa(s0, eSynty, n), luovutus = arvoLuovutus(s0, eSynty, n), kuulo = arvoKuulo(s0, eSynty, n);
  const taukoMs = (n % 3) * 1000;
  const zo = {
    n, muuttunut: false, tyyppi: 'perus', x: r.x, y: r.y, px: r.x, py: r.y, kuoli: -1, synty: eSynty, syntyMs: tMs, suunta: 4,
    odottaaSynkkaa: null, poistumassa: false,
    huomaa, luovutus, meneta: huomaa + luovutus, kuulo,
    reaktio: 0, reaktioMs: 0, reaktioAsti: 0,
    kohdeId: null, kohde: null,
    vAsk: 0, vTauko: n % 3, vTaukoMs: taukoMs, vTaukoAsti: tMs + taukoMs, vDx: 0, vDy: 0,
    kontaktit: {}, kontaktiId: null, kontakti: 0, kontaktiRaja: 0, kontaktiMs: 0, kontaktiRajaMs: 0, syoId: null,
  };
  alustaNopeus(zo, s0, eSynty, tMs, tikki);
  return zo;
};
const synkkaaZombi = (z, eSynk, P, k, tMs, tikki, s0, varattu) => {
  const { W } = ruudukko;
  varattu.delete(z.y * W + z.x);
  const r = kaukainen(P, arpa(s0 * 7919 + eSynk * 101 + z.n), varattu);
  varattu.add(r.y * W + r.x);
  const huomaa = arvoHuomaa(s0, eSynk, z.n), luovutus = arvoLuovutus(s0, eSynk, z.n), kuulo = arvoKuulo(s0, eSynk, z.n);
  const taukoMs = (z.n % 3) * 1000;
  z.x = z.px = r.x; z.y = z.py = r.y; z.kuoli = -1; z.syo = false; z.syoId = null; z.syoAstiMs = 0;
  z.synty = eSynk; z.syntyMs = tMs; z.suunta = 4; z.odottaaSynkkaa = null;
  z.huomaa = huomaa; z.luovutus = luovutus; z.meneta = huomaa + hystereesiVali(z); z.kuulo = kuulo;
  z.reaktio = 0; z.reaktioMs = 0; z.reaktioAsti = 0;
  z.kohdeId = null; z.kohde = null;
  z.vAsk = 0; z.vTauko = z.n % 3; z.vTaukoMs = taukoMs; z.vTaukoAsti = tMs + taukoMs; z.vDx = 0; z.vDy = 0;
  z.kontaktit = {}; z.kontaktiId = null; z.kontakti = 0; z.kontaktiRaja = 0; z.kontaktiMs = 0; z.kontaktiRajaMs = 0;
  delete z._asu;
  alustaNopeus(z, s0, eSynk, tMs, tikki);
};
const synkkaaPimeatZombit = (Z, P, k) => {
  if (!ruudukko || !Array.isArray(Z)) return;
  const tikki = Math.max(50, Number(ASETUS.tikki) || 250), tMs = (k ?? 0) * tikki;
  const { W } = ruudukko, s0 = perusSiemen(), varattu = new Set();
  for (const z of Z.concat(SAILO.muuttuneet || [])) if (z && (z.kuoli < 0 || (z.syo && tMs < (z.syoAstiMs || 0)))) varattu.add(z.y * W + z.x);
  for (const z of Z) {
    if (!z || z.muuttunut || z.odottaaSynkkaa == null) continue;
    if (z.kuoli >= 0 || (z.syo && tMs < (z.syoAstiMs || 0))) continue;
    if (onValaistu(z.x, z.y, P)) continue;
    synkkaaZombi(z, z.odottaaSynkkaa, P, k, tMs, tikki, s0, varattu);
  }
};
const sopeutaMaara = (Z, P, k) => {
  if (!ruudukko || !Array.isArray(Z)) return;
  const tavoite = laskeMaara(P);
  ASETUS.maara = tavoite;
  const tikki = Math.max(50, Number(ASETUS.tikki) || 250), tMs = (k ?? 0) * tikki;
  const { W } = ruudukko, s0 = perusSiemen();

  if (Z.length <= tavoite) {
    for (const z of Z) if (z) z.poistumassa = false;
  }
  if (Z.length < tavoite) {
    const varattu = new Set();
    for (const z of Z.concat(SAILO.muuttuneet || [])) if (z && (z.kuoli < 0 || (z.syo && tMs < (z.syoAstiMs || 0)))) varattu.add(z.y * W + z.x);
    const kaytossa = new Set(Z.map(z => z.n));
    let seurN = 0;
    while (Z.length < tavoite) {
      while (kaytossa.has(seurN)) seurN++;
      kaytossa.add(seurN);
      Z.push(luoPerusZombi(seurN, k || SAILO.E || 0, P, k, tMs, tikki, s0, varattu));
    }
    return;
  }

  // Kun määrä pienenee: ylimääräiset (suurin n ensin) merkitään poistumaan, mutta poistetaan vasta kun
  //   zombi on pimeässä (!onValaistu) JA ei jahtaa ketään (kohdeId == null) eikä ole syömässä.
  const jarj = [...Z].sort((a, b) => b.n - a.n);
  const ylim = Z.length - tavoite;
  for (let i = 0; i < jarj.length; i++) jarj[i].poistumassa = i < ylim;

  for (let i = 0; i < jarj.length && Z.length > tavoite; i++) {
    const z = jarj[i];
    if (!z.poistumassa) continue;
    if (z.kohdeId != null && (!Array.isArray(P) || !P.some(p => p && p.id === z.kohdeId && onKohde(p)))) {
      z.kohdeId = null; z.kohde = null;
    }
    if (z.kohdeId != null || z.kuoli >= 0 || (z.syo && tMs < (z.syoAstiMs || 0))) continue;
    if (onValaistu(z.x, z.y, P)) continue;
    const idx = Z.indexOf(z);
    if (idx >= 0) Z.splice(idx, 1);
  }
};
const synny = (e1, P, k0) => {
  const s0 = perusSiemen(), varattu = new Set(), z = [];
  const tikki = Math.max(50, Number(ASETUS.tikki) || 250), tMs = (k0 ?? 0) * tikki;
  const maara = laskeMaara(P);
  ASETUS.maara = maara;
  for (let n = 0; n < maara; n++) {
    z.push(luoPerusZombi(n, e1, P, k0, tMs, tikki, s0, varattu));
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
    if (!onKohde(p) || onMakaava(p.id, tMs) || (z.muuttunut && p.id === z.lahdeId)) continue;
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
    // kp 20:40 "jos makaa tos robo nii ei voi kuolla": sängyllä/kalusteella (ei zombien kävelyruutu) zombi ei pääse samaan ruutuun ->
    //   silloin viereinen ruutu kerryttää kuin sama ruutu.
    const kalusteella = etRuutu === 1 && !(ruudukko.ok && ruudukko.ok[p.y * ruudukko.W + p.x]);
    const kerroin = etRuutu === 0 || kalusteella ? kSama : etRuutu === 1 ? kVier : -kHiip;
    let t = z.kontaktit[p.id];
    if (kerroin > 0) {
      if (!t || !(t.ms > 0)) {
        const rajaMs = arvoKontaktiRajaMs(s0, k, z.n, p.id);
        t = z.kontaktit[p.id] = { ms: 0, rajaMs, laskuri: 0, raja: Math.round((rajaMs / 1000) * 100) / 100, et: etRuutu, kasvaa: true };
      }
      t.ms = Math.min(t.rajaMs, t.ms + tikki * kerroin);
      t.laskuri = Math.round((t.ms / 1000) * 100) / 100;
      t.et = etRuutu;
      t.kasvaa = true;
      if (t.ms >= t.rajaMs) {
        if (!saalis || etRuutu < saalis.et || (etRuutu === saalis.et && p.id === z.kohdeId)) {
          saalis = { p, t, et: etRuutu };
        }
      }
    } else if (t && t.ms > 0) {
      t.ms = Math.max(0, t.ms + tikki * kerroin);
      t.laskuri = Math.round((t.ms / 1000) * 100) / 100;
      t.et = etRuutu;
      t.kasvaa = false;
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
  paivitaLammikot(P);
  paivitaMakaavat(P, tMs, k, tikki, s0);
  const omaI = omaIndeksi();
  // Toisen pelaajan kuolema: hahmo hyppää > 3 ruutua ovelle (zk684-teleportti) -> lammikko + muuttunut viimeiseen ruutuun.
  if (!(SAILO.viimeSij instanceof Map)) SAILO.viimeSij = new Map();
  { const ov = ruudukko.ovi;
    for (const p of P || []) { if (!p || !p.id) continue; const ed = SAILO.viimeSij.get(p.id);
      if (ed && p.i !== omaI && ov && Math.hypot(p.x - ed.x, p.y - ed.y) > 3 && Math.hypot(p.x - ov.x, p.y - ov.y) <= 2.5
          && !(SAILO.makaavat instanceof Map && SAILO.makaavat.has(p.id))) {
        try { luoMuuttunut({ id: p.id, nimi: p.nimi, figuuri: p.figuuri, x: ed.x, y: ed.y }, 4, k, tMs, tikki, s0, P); paivitaLammikot(P); } catch (x) {}
      }
      SAILO.viimeSij.set(p.id, { x: p.x, y: p.y }); } }
  synkkaaPimeatZombit(Z, P, k);
  sopeutaMaara(Z, P, k);
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
  if (poistui) paivitaLammikot(P);

  const kaikki = Z.concat(SAILO.muuttuneet);
  for (const z of kaikki) if (z.kuoli < 0 || (z.syo && tMs < (z.syoAstiMs || 0))) varattu.add(z.y * W + z.x);
  const uudetMuuttuneet = [], kaatuneet = new Set();

  for (const z of kaikki) {
    varmistaZombi(z, s0, k, tMs, tikki);
    if (z.muuttunut && z.synty === k) {
      varattu.add(z.y * W + z.x);
      continue;
    }
    // kp 19:54: kiinnijäännin jälkeen nappaava zombi jää paikalleen uhrin viereen koko kuolemamakuun (ASETUS.kuolemaMakuu)
    //   ajaksi (ei liiku eikä nappaa muita) ja syntyy vasta makuun päätyttyä uudelleen kauas.
    if (z.syo && tMs < (z.syoAstiMs || 0)) {
      z.px = z.x; z.py = z.y;
      z.viimeAskelMs = tMs; z.seuraavaAskelMs = tMs + tikki; z.piirtoAskelMs = tikki;
      varattu.add(z.y * W + z.x);
      continue;
    }
    if (z.muuttunut && z.syo) { z.syo = false; z.syoId = null; z.syoAstiMs = 0; z.seuraavaAskelMs = tMs; }
    if (!z.muuttunut && z.kuoli >= 0) {
      const r = kaukainen(P, arpa(s0 * 31 + k * 101 + z.n), varattu);
      z.x = z.px = r.x; z.y = z.py = r.y; z.kuoli = -1; z.syo = false; z.syoId = null; z.syoAstiMs = 0; z.synty = k; z.syntyMs = tMs; z.odottaaSynkkaa = null;
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
      z._vaihdettuKohteeseen = false;
      const kohde = valitseKohde(z, dz, P, k, tMs, s0);
      if (kohde) {
        if (!oliKohde || z._vaihdettuKohteeseen) {
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
        if (idx >= 0) { SAILO.muuttuneet.splice(idx, 1); paivitaLammikot(P); }
      } else {
        z.kuoli = k; z.kontaktit = {}; z.kontaktiId = null; z.kontakti = 0; z.kontaktiRaja = 0; z.kontaktiMs = 0; z.kontaktiRajaMs = 0;
      }
      continue;
    }

    // Kiinnijäännin kertyvä kontaktilaskuri (per zombi + pelaaja): +1/s samassa ruudussa, +0.5/s viereisessä, -0.25/s ilman kontaktia.
    let { saalis, aktP, aktT } = paivitaKontaktit(z, P, k, tMs, tikki, s0, kaatuneet);
    // kp 20:39 "mun kuolema ei näkyny sun ruudulla" / desync: vain UHRIN oma kone päättää kiinnijäännin (se lähettää zk684).
    //   Muiden koneiden zombit eivät tapa toisen pelaajaa paikallisesti (tuotti valekuolemia); kuolema näkyy muille ovelle-teleportista.
    if (saalis && saalis.p && saalis.p.i !== omaI) { if (z.kontaktit) delete z.kontaktit[saalis.p.id]; saalis = null; }
    if (saalis) {
      const kp = saalis.p;
      const makuuMs = Math.max(0, Number(ASETUS.kuolemaMakuu ?? 1500));
      const loppuMs = tMs + makuuMs;
      if (kp.x !== z.x || kp.y !== z.y) z.suunta = suunnaksi(Math.sign(kp.x - z.x), Math.sign(kp.y - z.y));
      z.px = z.x; z.py = z.y;
      z.viimeAskelMs = tMs; z.seuraavaAskelMs = Math.max(tMs + tikki, loppuMs); z.piirtoAskelMs = tikki;
      z.syo = true; z.syoId = kp.id; z.syoAstiMs = loppuMs; z.viimeSyoId = kp.id; z.viimeSyoK = k; z.viimeSyoMs = tMs;
      kaatuneet.add(kp.id);
      for (const zz of kaikki) {
        if (zz.kontaktit) delete zz.kontaktit[kp.id];
        if (zz.kohdeId === kp.id) { zz.kohdeId = null; zz.kohde = null; zz.reaktio = 0; zz.reaktioMs = 0; zz.reaktioAsti = 0; }
      }
      z.kohdeId = null; z.kohde = null; z.reaktio = 0; z.reaktioMs = 0; z.reaktioAsti = 0;
      z.vAsk = 0; z.vTauko = 0; z.vTaukoMs = 0; z.vTaukoAsti = 0; z.vDx = 0; z.vDy = 0; z.aaniKohde = null;
      z.kontaktit = {}; z.kontaktiId = null; z.kontakti = 0; z.kontaktiRaja = 0; z.kontaktiMs = 0; z.kontaktiRajaMs = 0;
      if (!z.muuttunut) z.kuoli = k;
      uudetMuuttuneet.push({ kp: { id: kp.id, i: kp.i, nimi: kp.nimi, figuuri: kp.figuuri, x: kp.x, y: kp.y }, suunta: z.suunta });
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

  for (const u of uudetMuuttuneet) {
    aloitaMakuu(u.kp, u.suunta, k, tMs, tikki, s0, P);
  }

  // Tarkista myös askelen lopussa pimeässä despawnaavat muuttuneet (jos muuttunut juuri astui valosta pimeään) ja ylimääräiset zombit.
  let poistuiLopussa = false;
  for (let i = SAILO.muuttuneet.length - 1; i >= 0; i--) {
    const m = SAILO.muuttuneet[i];
    if (!m || (tMs - (m.syntyMs ?? 0) >= minElinaika && !onValaistu(m.x, m.y, P))) {
      SAILO.muuttuneet.splice(i, 1);
      poistuiLopussa = true;
    }
  }
  sopeutaMaara(Z, P, k);
  paivitaLammikot(P);
  return ekaKohde;
};
const suunnaksi = (dx, dy) => ({ '0,-1': 0, '1,-1': 1, '1,0': 2, '1,1': 3, '0,1': 4, '-1,1': 5, '-1,0': 6, '-1,-1': 7 })[dx + ',' + dy] ?? 4;

// ---- piirto (paikalliset hahmot negatiivisilla id:illä + värilammikot kanvaksella lattian päällä, vain tässä clientissä)
let V = null, figuuri = ASETUS.figuuri, seuraavaId = -950001, asut = [];
// kp 30.10. 18:58 & 19:09: tavalliset zombit EIVÄT käytä huoneen pelaajien asuja (kp 19:09: 'näen myös ite kp zombin').
//   Pohjat: Zombie-botit + ASETUS.zombiAsut (~8 geneeristä asua) + vara-asu figuuri, ja jokainen zombifioidaan siemenellä.
const valitseAsu = z => {
  const geneeriset = Array.isArray(ASETUS.zombiAsut) ? ASETUS.zombiAsut : [];
  const lista = [...asut, ...geneeriset, figuuri].filter((f, i, a) => f && a.indexOf(f) === i), n = Math.abs(Number(z.n) || 0) + Math.abs(Number(z.synty ?? SAILO.E) || 0);
  return zombifioiAsu(lista[n % lista.length], (n * 7919 + 104729) >>> 0) || lista[n % lista.length];
};
const valmistele = () => {
  const s = istunto(), ud = s && s.userDataManager; let loydetty = false; const uudetAsut = [];
  for (const o of [...(e.getRoomObjects(huone, 100) || [])].sort((a, b) => a.id - b.id)) {
    if (!V && o.getLocation) V = o.getLocation().constructor;
    const u = ud && ud.getUserDataByIndex && ud.getUserDataByIndex(o.id);
    if (u && /zombi/i.test(String(u.name || '')) && /bot/i.test(String(o.type))) {
      const f = o.model && o.model.getValue('figure');
      if (f) { if (!loydetty) { figuuri = f; loydetty = true; } if (!uudetAsut.includes(f)) uudetAsut.push(f); }
    }
  }
  if (uudetAsut.length) asut = uudetAsut;
  if (!V) { const f = (e.getRoomObjects(huone, 10) || [])[0]; if (f && f.getLocation) V = f.getLocation().constructor; }
  return !!V;
};

// Lammikkokanvas (sama asemointi huoneen kanvaksen päälle kuin 684.js:64,74-89, pimeyskerroksen alle ilman välkkyvää clearRect-hahmoleikkausta, kp 19:38)
try {
  if (typeof document !== 'undefined' && document.querySelectorAll) {
    for (const vanha of document.querySelectorAll('canvas[data-zombit-lammikko]')) vanha.remove();
  }
} catch (x) {}
const huoneKanvas = () => {
  if (typeof document === 'undefined' || !document.querySelectorAll) return null;
  for (const c of document.querySelectorAll('.roomView-background > canvas')) if (typeof c.onmousedown === 'function') return c;
  return null;
};
const lammikkoKanvas = (typeof document !== 'undefined' && document.createElement) ? document.createElement('canvas') : null;
const lctx = lammikkoKanvas && lammikkoKanvas.getContext ? lammikkoKanvas.getContext('2d') : null;
if (lammikkoKanvas) {
  if (lammikkoKanvas.setAttribute) lammikkoKanvas.setAttribute('data-zombit-lammikko', String(huone));
  if (lammikkoKanvas.style) lammikkoKanvas.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;pointer-events:none;z-index:1';
}
let lammikkoAla = '';
const kontaktissaOlevat = (P) => {
  const kaikki = (SAILO.zombit || []).concat(SAILO.muuttuneet || []);
  const idt = new Set();
  for (const z of kaikki) {
    if (!z || z.kuoli >= 0 || z.syo || !z.kontaktit) continue;
    for (const [idStr, t] of Object.entries(z.kontaktit)) {
      if (t && t.ms > 0 && t.kasvaa && (t.et == null || t.et <= 1)) idt.add(Number(idStr));
    }
  }
  if (!idt.size) return [];
  const lista = Array.isArray(P) ? P : pelaajat();
  const tMs = SAILO.K >= 0 ? SAILO.K * Math.max(50, Number(ASETUS.tikki) || 250) : null;
  return lista.filter(p => p && idt.has(p.id) && !onMakaava(p.id, tMs));
};
tila.kontaktissa = () => kontaktissaOlevat().map(p => p.id);
// kp 20:19 "punanen välkky on vaan punanen neliö hahmon päällä · kato shooter logic": shooterin keino (shooter.user.js savyta):
//   hahmon OMIEN spritejen väri (sprite.color) punaiseksi, varjo (alpha<255) ja additiiviset ohitetaan, palautus 0xffffff.
const savytetyt = new Map();   // hahmon roomIndex -> true
const savyta = (id, vari) => {
  try {
    const o = e.getRoomObject(huone, id, 100), sp = (o && o.visualization && o.visualization.sprites) || [];
    for (const s of sp) { if (s.alpha !== 255 || s.blendMode === 'add') continue;
      if (s.color !== vari) { s.color = vari; if (s.increaseUpdateCounter) s.increaseUpdateCounter(); } }
  } catch (x) {}
};
const paivitaValahdys = (kontaktissa) => {
  const nyt = Date.now(), nyky = new Set();
  for (const p of kontaktissa) if (p && p.i != null) { nyky.add(p.i); savytetyt.set(p.i, true); savyta(p.i, Math.floor(nyt / 120) % 2 ? 0xff9090 : 0xff2a2a); }
  for (const id of [...savytetyt.keys()]) if (!nyky.has(id)) { savyta(id, 0xffffff); savytetyt.delete(id); }
};
const piirraLammikot = () => {
  if (!lammikkoKanvas || !lctx || typeof document === 'undefined' || !document.body) return;
  const lammikot = Array.isArray(SAILO.lammikot) ? SAILO.lammikot : (tila.lammikot || []);
  const kontaktissa = kontaktissaOlevat();
  paivitaValahdys(kontaktissa);
  if (!lammikot.length && !kontaktissa.length) {
    if (lammikkoKanvas.width > 0 && lammikkoKanvas.height > 0) lctx.clearRect(0, 0, lammikkoKanvas.width, lammikkoKanvas.height);
    return;
  }
  const cv = huoneKanvas(); if (!cv || !cv.getBoundingClientRect) return;
  const r = cv.getBoundingClientRect(), a = r.left + ',' + r.top + ',' + r.width + ',' + r.height;
  const W = Math.max(1, Math.round(r.width)), H = Math.max(1, Math.round(r.height));
  if (W <= 1 || H <= 1) return;
  const ac = e._activeRoomActiveCanvas || 1;
  const g = (e.getRoomInstanceGeometry && e.getRoomInstanceGeometry(huone, ac))
    || (ac !== 1 && e.getRoomInstanceGeometry && e.getRoomInstanceGeometry(huone, 1));
  const rc = (e.getRoomInstanceRenderingCanvas && e.getRoomInstanceRenderingCanvas(huone, ac))
    || (ac !== 1 && e.getRoomInstanceRenderingCanvas && e.getRoomInstanceRenderingCanvas(huone, 1));
  if (!g || !rc || typeof g.getScreenPoint !== 'function') return;
  if (lammikkoKanvas.parentNode !== document.body || document.body.firstChild !== lammikkoKanvas) {
    document.body.insertBefore(lammikkoKanvas, document.body.firstChild);
  }
  if (a !== lammikkoAla) { lammikkoAla = a; Object.assign(lammikkoKanvas.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' }); }
  if (lammikkoKanvas.width !== W || lammikkoKanvas.height !== H) { lammikkoKanvas.width = W; lammikkoKanvas.height = H; }
  lctx.clearRect(0, 0, W, H);
  const scale = rc.scale ?? rc._scale ?? 1;
  const rw = rc.width ?? rc._width ?? W, rh = rc.height ?? rc._height ?? H;
  const ox = rc.screenOffsetX ?? rc._screenOffsetX ?? 0, oy = rc.screenOffsetY ?? rc._screenOffsetY ?? 0;
  const ruudulle = (x, y, z) => {
    const p = g.getScreenPoint(V ? new V(x, y, z) : { x, y, z }); if (!p) return null;
    return { x: p.x * scale + rw / 2 + ox, y: p.y * scale + rh / 2 + oy };
  };
  const { z: Z } = ruudukko;
  if (lammikot.length) {
    // kp 20:41 "zombien ympärillä kans joku ihme aura mikä epärendaa noi veret": leikkaus koski KAIKKIA lammikoita hahmon kohdalla.
    //   Nyt syvyysjärjestys (Habbo: x+y): lammikot piirretään takimmaisesta etummaiseen ja kunkin jälkeen pyyhitään vain ne
    //   hahmot, jotka seisovat SAMASSA ruudussa tai sen EDESSÄ (syvyys >= lammikon). Hahmon edessä oleva lammikko jää näkyviin.
    const hahmot = [];
    if (typeof e.getRoomObjectBoundingRectangle === 'function' && r.width > 0) {
      for (const o of e.getRoomObjects(huone, 100) || []) {
        if (!o || String(o.type) !== 'user') continue;
        try { const b = e.getRoomObjectBoundingRectangle(huone, o.id, 100, 1), L = o.getLocation();
          if (b && b.width > 0 && L) hahmot.push({ b, syv: L.x + L.y }); } catch (x) {}
      }
    }
    const fx = W / (r.width || 1), fy = H / (r.height || 1);
    const jarj = lammikot.filter(lm => lm && isFinite(lm.x) && isFinite(lm.y)).sort((a, b) => (a.x + a.y) - (b.x + b.y));
    for (const lm of jarj) {
      const zz = Math.max(0, Z[Math.round(lm.y) * ruudukko.W + Math.round(lm.x)] || 0);
      const o = ruudulle(lm.x, lm.y, zz), ex = ruudulle(lm.x + 1, lm.y, zz);
      if (!o || !ex) continue;
      const sc = Math.max(10, Math.abs(ex.x - o.x));
      lctx.save();
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
      lctx.restore();
      const lsyv = Math.round(lm.x) + Math.round(lm.y);
      for (const h of hahmot) {
        if (h.syv + 0.01 < lsyv) continue;   // hahmo lammikon takana -> lammikko piirtyy sen päälle (oikein)
        const b = h.b, cx = (b.x - r.left + b.width / 2) * fx, cy = (b.y - r.top + b.height * 0.5) * fy;
        lctx.save(); lctx.globalCompositeOperation = 'destination-out'; lctx.beginPath();
        lctx.ellipse(cx, cy, Math.max(2, b.width * 0.24 * fx), Math.max(2, b.height * 0.47 * fy), 0, 0, Math.PI * 2); lctx.fill(); lctx.restore();
      }
    }
  }
  // kp 20:04 välähdys: paivitaValahdys() (spritejen sävy, ei piirretä tälle kanvakselle)
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
    const asu = (z.muuttunut && z.figuuri) ? z.figuuri : (z._asu || (z._asu = valitseAsu(z)));
    if (g == null) {
      g = seuraavaId--;
      if (!e.addRoomObjectUser(huone, g, new V(x, y, zz), new V(sd), sd, 1, asu)) continue;
      piirretyt.set(z.n, g);
      SAILO.piirretytIdt.add(g);
    }
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
      SAILO.piirretytIdt.delete(g);
    }
  }
  piirraLammikot();
};
tila.kuva = () => tila.zombit.concat(tila.muuttuneet || []).map(z => ({
  n: z.n, muuttunut: !!z.muuttunut, nimi: z.nimi || ('Zombi ' + z.n), lahdeId: z.lahdeId ?? null, lahdeNimi: z.lahdeNimi ?? null,
  x: z.x, y: z.y, kuoli: z.kuoli, syo: !!z.syo, syoId: z.syoId ?? null, kohde: z.kohdeId ?? null,
  odottaaSynkkaa: z.odottaaSynkkaa ?? null, poistumassa: !!z.poistumassa,
  huomaa: z.huomaa, luovutus: z.luovutus, meneta: z.meneta, kuulo: z.kuulo,
  perusAskelMs: z.perusAskelMs, askelMs: z.askelMs, reaktioMs: z.reaktioMs || 0,
  tila: z.syo ? 'syo' : z.kuoli >= 0 ? 'kuoli' : z.kohdeId != null ? ((z.reaktioMs || 0) > 0 ? 'reagoi' : 'jahtaa') : (z.vTaukoMs || 0) > 0 ? 'seisoo' : 'vaeltaa',
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
    for (const ms of [30, 300, 1000]) {
      const aj = setTimeout(kuplat, ms);
      if (aj && typeof aj.unref === 'function') aj.unref();
      kuplaAjastimet.add(aj);
    }
    return true;
  } catch (x) { lokiin({ salasanaVirhe: String(x) }); return false; }
};
tila._sanoSalainen = sanoSalainen;

// ---- oma kiinnijäänti (kp 19:25: paikallinen 'lay' ASETUS.kuolemaMakuu ms ajan ennen zk684-salasanan lähetystä; kp 20:04: iso keskitetty KUOLIT-viesti)
const ilmoita = teksti => {
  const d = document.createElement('div'); d.textContent = teksti;
  d.style.cssText = 'position:fixed;left:50%;top:14%;transform:translateX(-50%);z-index:99999;pointer-events:none;padding:8px 16px;'
    + 'background:rgba(90,0,0,.8);color:#fff;font:bold 15px sans-serif;border-radius:6px;transition:opacity .4s';
  document.body.appendChild(d); setTimeout(() => { d.style.opacity = '0'; }, 1600); setTimeout(() => d.remove(), 2100);
};
const naytaKuolit = () => {
  if (typeof document === 'undefined' || !document.body || !document.createElement) return;
  try {
    if (document.querySelectorAll) {
      for (const v of document.querySelectorAll('[data-zombit-kuolit]')) if (v && v.remove) v.remove();
    }
    const d = document.createElement('div');
    if (d.setAttribute) d.setAttribute('data-zombit-kuolit', '1');
    d.textContent = 'KUOLIT';
    if (d.style) {
      d.style.cssText = 'position:fixed;left:50%;top:42%;transform:translate(-50%,-50%);z-index:100000;pointer-events:none;'
        + 'color:#ff1a1a;font:900 72px/1.1 Impact,"Arial Black",sans-serif;letter-spacing:6px;text-transform:uppercase;'
        + 'text-shadow:0 0 18px rgba(180,0,0,.95),0 4px 12px #000,0 0 4px #000;opacity:1;transition:opacity .6s ease-out';
    }
    document.body.appendChild(d);
    const a1 = setTimeout(() => { kuplaAjastimet.delete(a1); if (d.style) d.style.opacity = '0'; }, 1500);
    const a2 = setTimeout(() => { kuplaAjastimet.delete(a2); if (d.remove) d.remove(); }, 2100);
    for (const a of [a1, a2]) {
      if (a && typeof a.unref === 'function') a.unref();
      kuplaAjastimet.add(a);
    }
  } catch (x) {}
};
const omaRuutu = () => {
  const i = omaIndeksi(); if (i == null || i < 0) return null;
  const o = e.getRoomObject(huone, i, 100), L = o && o.getLocation();
  return L ? { i, x: Math.round(L.x), y: Math.round(L.y) } : null;
};
let kuolemaKaynnissa = 0, safeIlmoitettu = 0, omaViimeSyoK = -1, odottavaKuolema = null, kavelyEstoAsti = 0, kavelyH = null, kavelyAlkup = null, kavelyOma = null;
const asennaKavelyEsto = () => {
  try {
    const h = e && e.objectEventHandler; if (!h || typeof h.sendWalkUpdate !== 'function') return;
    if (kavelyH === h && h.sendWalkUpdate === kavelyOma) return;
    const alkup = h.sendWalkUpdate;
    kavelyOma = function (...a) { if (Date.now() < kavelyEstoAsti) return; return alkup.apply(this, a); };
    h.sendWalkUpdate = kavelyOma; kavelyH = h; kavelyAlkup = alkup;
  } catch (x) {}
};
const puraKavelyEsto = () => { try { if (kavelyH && kavelyH.sendWalkUpdate === kavelyOma) kavelyH.sendWalkUpdate = kavelyAlkup; } catch (x) {} kavelyH = kavelyOma = kavelyAlkup = null; };
const kuole = (syy) => {
  const nyt = Date.now(), makuuMs = Math.max(0, Number(ASETUS.kuolemaMakuu ?? 1500));
  const lukko = Math.max(1000, Number(ASETUS.kuolemaLukko) || 5000);
  if (nyt - kuolemaKaynnissa < Math.max(lukko, makuuMs)) return;
  if (safe && saaSafe()) {
    if (nyt - safeIlmoitettu > 5000) { safeIlmoitettu = nyt; ilmoita(syy + ' (:safe päällä, ei kuolemaa)'); lokiin({ kuolema: syy, safe: true }); }
    return;
  }
  kuolemaKaynnissa = nyt; tila.kuolemat++; naytaKuolit();
  // kp 20:06 "kun makaa pysty kävellä samalla": oman hahmon kävelykomennot estetään makuun ajan (sendWalkUpdate-kääre, puretaan siivouksessa)
  kavelyEstoAsti = nyt + makuuMs + 300; asennaKavelyEsto();
  // kp 20:28 "hahmo edellee liukuu hetken ku kuolee · jos kuolee liikkees": esto pysäyttää vain UUDET kävelyt, palvelimen kesken
  //   oleva reitti jatkui -> kävelykomento omaan nykyruutuun (alkuperäisellä sendWalkUpdatella) pysäyttää hahmon heti.
  try { const r0 = omaRuutu(); if (r0 && kavelyH && typeof kavelyAlkup === 'function') kavelyAlkup.call(kavelyH, r0.x, r0.y); } catch (x) {}
  const o = omaRuutu();
  if (o && o.i != null && makuuMs > 0) asetaHahmonAsento(o.i, 'lay');
  const laheta = () => {
    const ok = sanoSalainen();
    const o2 = omaRuutu() || o;
    if (o2 && o2.i != null) asetaHahmonAsento(o2.i, 'std');
    lokiin({ kuolema: syy, tapa: ok ? 'wired-salasana (' + ASETUS.salasana + ')' : 'salasanan lähetys epäonnistui', ennen: o && [o.x, o.y], makuuMs });
  };
  if (makuuMs > 0) {
    // kp 20:02 "mun hahmo ei teleportannu ollenkaa kuoleman jälkee": live-päivitys kesken makuun pyyhki ajastimen -> zk684 jäi lähtemättä.
    //   Odottava lähetys talteen; siivous lähettää sen heti (ks. return-siivous).
    const aj = setTimeout(() => { kuplaAjastimet.delete(aj); odottavaKuolema = null; laheta(); }, makuuMs);
    odottavaKuolema = { aj, laheta };
    if (aj && typeof aj.unref === 'function') aj.unref();
    kuplaAjastimet.add(aj);
  } else {
    laheta();
  }
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
    if (z.viimeSyoId === id && z.viimeSyoK > omaViimeSyoK && SAILO.K - z.viimeSyoK <= ikkunaK) {
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
  paivitaLammikot(P);
  const maxKirittava = Math.max(30, Math.round(30000 / tikki));
  if (!Array.isArray(SAILO.zombit) || !SAILO.zombit.length || SAILO.E < 0) {
    SAILO.E = e1;
    tila.zombit = SAILO.zombit = synny(e1, P, k);
    paivitaLammikot(P);
    historia.clear();
    SAILO.K = k - 1;
    lokiin({ epookki: e1, syntyi: tila.zombit.map(z => z.x + ',' + z.y).join(' '), ovi: ruudukko.ovi });
  } else {
    if (tila.zombit !== SAILO.zombit) {
      tila.zombit = SAILO.zombit;
      // kp 19:11: Päivityksen yhteydessä ei saa laukaista vanhaa kiinnijääntiä/zk684:ää (omaViimeSyoK alustetaan nykyiseen SAILO.K-arvoon)
      omaViimeSyoK = SAILO.K;
      lokiin({ jatkettu: SAILO.K });
    }
    if (k - SAILO.K >= maxKirittava) {
      const ohitettuMs = (k - 1 - SAILO.K) * tikki;
      const siirraSynty = ohitettuMs >= Math.max(300000, (Number(ASETUS.epookki) || 1800000) * 0.5);
      for (const z of SAILO.zombit.concat(SAILO.muuttuneet)) {
        if (!z) continue;
        if (siirraSynty && z.syntyMs != null) z.syntyMs += ohitettuMs;
        if (z.viimeAskelMs != null) z.viimeAskelMs += ohitettuMs;
        if (z.seuraavaAskelMs != null) z.seuraavaAskelMs += ohitettuMs;
        if (z.vTaukoAsti > 0) z.vTaukoAsti += ohitettuMs;
        if (z.reaktioAsti > 0) z.reaktioAsti += ohitettuMs;
      }
      SAILO.K = k - 1;
    }
    if (SAILO.E !== e1) {
      SAILO.E = e1;
      for (const z of SAILO.zombit) if (z && !z.muuttunut) z.odottaaSynkkaa = e1;
      synkkaaPimeatZombit(SAILO.zombit, P, Math.max(k, SAILO.K));
      lokiin({
        epookki: e1,
        valaistut: tila.zombit.filter(z => z.odottaaSynkkaa != null).map(z => z.n),
        synkatut: tila.zombit.filter(z => z.odottaaSynkkaa == null).map(z => z.n),
        muuttuneita: SAILO.muuttuneet.length,
        lammikoita: SAILO.lammikot.length,
      });
    } else if (SAILO.zombit.some(z => z && z.odottaaSynkkaa != null)) {
      synkkaaPimeatZombit(SAILO.zombit, P, Math.max(k, SAILO.K));
    }
    sopeutaMaara(SAILO.zombit, P, Math.max(k, SAILO.K));
  }
  while (SAILO.K < k) { SAILO.K++; tila.kohde = askel(SAILO.K, tila.zombit, P); }
  paivitaMakaavat(P, SAILO.K * tikki);
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
  try {
    if (typeof document !== 'undefined' && document.querySelectorAll) {
      for (const v of document.querySelectorAll('[data-zombit-kuolit]')) if (v && v.remove) v.remove();
    }
  } catch (x) {}
  kuplaVahti.disconnect();
  puraKavelyEsto();
  for (const id of savytetyt.keys()) savyta(id, 0xffffff); savytetyt.clear();
  if (odottavaKuolema) { const k = odottavaKuolema; odottavaKuolema = null; clearTimeout(k.aj); try { k.laheta(); } catch (x) {} }   // ei jätetä kuolemaa lähtemättä
  for (const a of kuplaAjastimet) clearTimeout(a); kuplaAjastimet.clear();
  for (const a of makuuAjastimet) clearTimeout(a); makuuAjastimet.clear();
  try {
    if (koukkuYhteys && koukkuYhteys.handleMessages === koukkuOma) {
      if (koukkuAlkup === Object.getPrototypeOf(koukkuYhteys).handleMessages) delete koukkuYhteys.handleMessages;
      else koukkuYhteys.handleMessages = koukkuAlkup;
    }
  } catch (x) {}
  for (const g of piirretyt.values()) {
    try { e.removeRoomObjectUser(huone, g); } catch (x) {}
    SAILO.piirretytIdt.delete(g);
  }
  piirretyt.clear();
  try {
    for (const g of SAILO.piirretytIdt) try { e.removeRoomObjectUser(huone, g); } catch (x) {}
    SAILO.piirretytIdt.clear();
  } catch (x) {}
  if (window.zombit === tila) delete window.zombit;
};
