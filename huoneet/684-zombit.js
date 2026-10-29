// Huone 684 (Halloween rata 5/6): zombit. Oma tiedosto, jotta pimeys/valot (684.js) eivät muutu.
// kp + sona 29.10. 22:32-22:40 (nitro/PAIVAKIRJA.md): zombit ovat yhteisiä, jahtaavat HITAINTA pelaajaa, ovat tosi hitaita, aseita ei ole.
//   Kiinni jäänyt pelaaja kuolee -> ovelle 30,15. Ansaan houkuteltu zombi kuolee ja syntyy uudelleen kauas pelaajista. Ansa tappaa myös
//   pelaajan. Zombit eivät nouse yläkerrokseen (korkeuskartan taso z 7, rivit y 3..6). kp 23:11: ':safe' = oma pelaaja ei kuole.
//
// JAETTU TILA ILMAN PALVELINTA: jokainen client laskee saman simulaation. Ainoat syötteet ovat
//   (1) kello: tikki k = floor(Date.now() / tikki) — kaikki clientit askeltavat samalla tikillä (kellojen ero = viive, ei hajontaa niin kauan
//       kuin ero on alle tikin), ja
//   (2) pelaajien ruudut, jotka palvelin jakaa kaikille samoina (pyöristettynä ruutuun).
//   Askelfunktio on deterministinen: kiinteä naapurijärjestys, siemenellinen satunnaisluku (tikki + zombin numero), ei Math.randomia.
//   Epookki (ASETUS.epookki ms): epookin alussa zombit syntyvät siemenen mukaan samoihin ruutuihin kaikilla. Kesken epookin tuleva client
//   aloittaa syntyruuduista (ei kelausta), joten sen näkymä poikkeaa muista seuraavaan epookkiin asti. Skriptin uudelleenlataus (push)
//   jatkaa samasta tilasta (window.__h684Zombit).
//   RAJA (ei mitattu kahdella clientilla): kellojen ero > tikki, tai pelaaja joka kävelee juuri tikin rajalla, voi antaa eri ruudun.
//   "Hitain" = pienin kuljettu matka (ruutuaskelten summa) viimeisen ASETUS.ikkuna ms aikana; tasapelissä pienin käyttäjä-id.
//   Paikallaan seisova on aina hitain, ja paikallaan seisovan ruutu on kaikilla sama -> kohde on vakaa.
// KUOLEMA: jokainen client tarkistaa vain OMAN pelaajansa. Siirto ovelle = sama wired-muuttujateleportti kuin nitro/kupla.js teleport
//   (7099 + 7016 @position.y, sitten @position.x; y ensin, koska rivi 15 on lattiaa x 4..37 mutta (30, y) ei aina ole). Vaatii huoneoikeudet.
//   Jos sijainti ei muutu: varalla huoneeseen uudelleen tulo (createSession), jonka laskeutumisruutua EI ole mitattu.
// NÄKYY VAIN SALLITUILLE (rataryhmä, kunnes kp sanoo muuta). Muilla tämä palauttaa heti tyhjän siivouksen.
// Konsolissa: zombit.loki · zombit.zombit · zombit.kohde · zombit.safe(true|false) · zombit.asetus.eiKohteena = [] · zombit.kuva()
const SALLITUT = [1, 282, 281, 245];   // Res, kurkkupomo, sona, Herra-Robotti
const ASETUS = {
  maara: 3,            // zombien määrä (AUKI kp:lle)
  tikki: 2000,         // ms per ruutu (pelaaja 500 ms/ruutu -> zombi 4x hitaampi; AUKI kp:lle)
  epookki: 300000,     // ms; uusi aalto + hajonnan raja
  ikkuna: 10000,       // ms; "hitain" mitataan tältä ajalta
  ovi: { x: 30, y: 15 },
  ansa: null,          // kp 23:18: sona poisti ansan, palataan myöhemmin. Muoto: { furni: <id>, x, y } (paikka luetaan furnista, x/y varalla). null = ei ansaa.
  kaukana: 10,         // ruutua: ansaan kuollut zombi syntyy vähintään näin kauas jokaisesta pelaajasta (jos mahdollista)
  lattiaYli: 0.3,      // zombi kävelee ruudulla jonka pino on enintään näin paljon lattian yli (matot, laatat, ansa 0.1)
  kohteet: SALLITUT,   // ketä jahdataan (testivaihe: vain rataryhmä)
  eiKohteena: [245],   // robo seisoo paikallaan aina -> olisi aina hitain
  siemen: 684,
  figuuri: 'hd-11509-1461.hr-3714-45.ch-3530-1330.lg-11495-1408.sh-3720-82',   // varalla; oikea luetaan huoneen Zombie-botilta
};

const e = window.NitroDevTools && window.NitroDevTools.roomEngine;
const huone = (kupla && kupla.roomId && kupla.roomId()) || (e && e.activeRoomId);
const dv = (o, k) => { const d = o && Object.getOwnPropertyDescriptor(o, k); return d && !d.get ? d.value : undefined; };
const omaId = () => { const s = e && dv(e, '_sessionDataManager'); return Number((s && (dv(s, '_userId') || s.userId)) || 0); };
if (!e || !SALLITUT.includes(omaId())) return () => {};

const tila = window.zombit = { versio: 'huone-684 zombit 1', huone, asetus: ASETUS, zombit: [], kohde: null, loki: [], kuolemat: 0, virheet: 0, k: 0 };
const lokiin = o => { o.t = new Date().toTimeString().slice(0, 8); tila.loki.push(o); if (tila.loki.length > 200) tila.loki.shift(); };
const MUISTI = 'h684.safe';
let safe = false; try { safe = sessionStorage.getItem(MUISTI) === '1'; } catch (x) {}
tila.safe = (v) => { if (v === undefined) return safe; safe = !!v; try { sessionStorage.setItem(MUISTI, safe ? '1' : '0'); } catch (x) {} lokiin({ safe }); return safe; };

// ---- satunnaisuus ja ruudukko
const arpa = (n) => { let a = (n >>> 0) || 1; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const NAAP = [[0, -1], [1, 0], [0, 1], [-1, 0], [1, -1], [1, 1], [-1, 1], [-1, -1]];   // kiinteä järjestys = sama valinta kaikilla
let ruudukko = null;
const rakenna = () => {   // zombien kävelyruudut: perustason lattia (|korkeus| < 0.5), matala pino, ja yhteydessä oveen
  const hm = e.getFurnitureStackingHeightMap(huone), wg = e.getLegacyWallGeometry(huone); if (!hm || !wg) return null;
  const W = hm.width, H = hm.height, ok = new Uint8Array(W * H), z = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (!wg.isRoomTile(x, y)) continue;
    const lattia = wg.getHeight(x, y), pino = hm.getTileHeight(x, y); z[i] = pino;
    if (Math.abs(lattia) < 0.5 && pino - lattia <= ASETUS.lattiaYli) ok[i] = 1; }
  const yht = new Uint8Array(W * H), d0 = ASETUS.ovi.y * W + ASETUS.ovi.x, jono = [d0]; if (ok[d0]) yht[d0] = 1;
  while (jono.length) { const i = jono.shift(), x = i % W, y = (i - x) / W;
    for (const [dx, dy] of NAAP) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const j = ny * W + nx;
      if (ok[j] && !yht[j] && (dx === 0 || dy === 0 || (ok[y * W + nx] && ok[ny * W + x]))) { yht[j] = 1; jono.push(j); } } }
  const ruudut = []; for (let i = 0; i < W * H; i++) if (yht[i]) ruudut.push(i);
  return { W, H, ok: yht, z, ruudut };
};
const kentta = (kx, ky) => {   // BFS-etäisyys kohteesta (tai sen kävelykelpoisista naapureista, jos kohde seisoo esim. tuolilla)
  const { W, H, ok } = ruudukko, d = new Int32Array(W * H).fill(-1), jono = [];
  const alku = (x, y) => { if (x < 0 || y < 0 || x >= W || y >= H) return; const i = y * W + x; if (ok[i] && d[i] < 0) { d[i] = 0; jono.push(i); } };
  alku(kx, ky); if (!jono.length) for (const [dx, dy] of NAAP) alku(kx + dx, ky + dy);
  for (let q = 0; q < jono.length; q++) { const i = jono[q], x = i % W, y = (i - x) / W;
    for (const [dx, dy] of NAAP) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const j = ny * W + nx;
      if (ok[j] && d[j] < 0 && (dx === 0 || dy === 0 || (ok[y * W + nx] && ok[ny * W + x]))) { d[j] = d[i] + 1; jono.push(j); } } }
  return d;
};
const ansaRuutu = () => { if (!ASETUS.ansa) return null; try { const o = e.getRoomObject(huone, ASETUS.ansa.furni, 10), L = o && o.getLocation(); if (L) return { x: Math.round(L.x), y: Math.round(L.y) }; } catch (x) {}
  return { x: ASETUS.ansa.x, y: ASETUS.ansa.y }; };

// ---- pelaajat (palvelimen jakama syöte)
const istunto = () => { const sm = dv(e, '_roomSessionManager'); return sm && sm.getSession && sm.getSession(huone); };
const pelaajat = () => { const s = istunto(), ud = s && s.userDataManager, out = [];
  for (const o of e.getRoomObjects(huone, 100) || []) { if (!o || o.id < 0 || String(o.type) !== 'user') continue;
    const u = ud && ud.getUserDataByIndex && ud.getUserDataByIndex(o.id), id = Number(u && u.webID) || 0; if (!id) continue;
    const L = o.getLocation(); out.push({ id, i: o.id, x: Math.round(L.x), y: Math.round(L.y), nimi: u.name }); }
  return out.sort((a, b) => a.id - b.id); };
// Tila säilyy skriptin uudelleenlatauksen yli (push käynnistää skriptin uudelleen kaikilla ~15 s välein): ilman tätä kelaus vei zombit
//   heti hitaimman päälle ja tappoi hänet (mitattu robolla 23:19). Avain = huone; epookki tarkistetaan tiki():ssä.
const SAILO = (window.__h684Zombit && window.__h684Zombit.huone === huone) ? window.__h684Zombit : (window.__h684Zombit = { huone, E: -1, K: -1, zombit: [], historia: new Map() });
const historia = SAILO.historia;   // id -> [{k,x,y}]
const kirjaa = (k, P) => { const n = Math.max(1, Math.round(ASETUS.ikkuna / ASETUS.tikki));
  for (const p of P) { let h = historia.get(p.id); if (!h) historia.set(p.id, h = []); h.push({ k, x: p.x, y: p.y }); while (h.length && h[0].k <= k - n) h.shift(); }
  for (const id of [...historia.keys()]) if (!P.some(p => p.id === id)) historia.delete(id); };
const liike = (id) => { const h = historia.get(id) || []; let s = 0, hyppy = 0; for (let i = 1; i < h.length; i++) { const a = Math.max(Math.abs(h[i].x - h[i - 1].x), Math.abs(h[i].y - h[i - 1].y)); s += a; if (a > hyppy) hyppy = a; } return { s, hyppy }; };
const hitain = (P) => { const { W, ok } = ruudukko; let paras = null;
  for (const p of P) { if (!ASETUS.kohteet.includes(p.id) || ASETUS.eiKohteena.includes(p.id)) continue;
    let tavoitettava = false; for (const [dx, dy] of [[0, 0]].concat(NAAP)) { const x = p.x + dx, y = p.y + dy; if (x >= 0 && y >= 0 && x < W && ok[y * W + x]) { tavoitettava = true; break; } }
    if (!tavoitettava) continue;   // yläkerroksessa tai muualla minne zombi ei pääse
    // Teleportannut (yli 3 ruutua tikissä = kuoli ja siirtyi ovelle, tai tuli huoneeseen) ei ole kohde ikkunan aikana. Kaikki näkevät
    //   saman hypyn, joten sääntö on jaettu. Ilman tätä ovelle siirretty seisoo paikallaan = hitain = zombit ovelle = kuolemasilmukka.
    const l = liike(p.id); if (l.hyppy > 3) continue; const m = l.s; if (!paras || m < paras.m) paras = { ...p, m }; }   // P on id-järjestyksessä -> tasapelissä pienin id
  return paras; };
const kaukainen = (P, rnd) => { const { W, ruudut } = ruudukko, a = ansaRuutu(); let pisteet = [];
  for (const i of ruudut) { const x = i % W, y = (i - x) / W; if (a && x === a.x && y === a.y) continue;
    let m = 1e9; for (const p of P) m = Math.min(m, Math.max(Math.abs(p.x - x), Math.abs(p.y - y))); pisteet.push([m, i]); }
  pisteet.sort((p, q) => q[0] - p[0] || p[1] - q[1]);
  const riittavat = pisteet.filter(p => p[0] >= ASETUS.kaukana), joukko = riittavat.length ? riittavat : pisteet.slice(0, 20);
  const v = joukko[Math.floor(rnd() * joukko.length)][1]; return { x: v % W, y: (v - v % W) / W }; };

// ---- simulaatio (deterministinen)
const synny = (E) => { const { W, ruudut } = ruudukko, rnd = arpa(ASETUS.siemen * 7919 + E), d = kentta(ASETUS.ovi.x, ASETUS.ovi.y), kauas = ruudut.filter(i => d[i] >= 12);
  const lahde = kauas.length >= ASETUS.maara ? kauas : ruudut, z = [];
  for (let n = 0; n < ASETUS.maara; n++) { const i = lahde[Math.floor(rnd() * lahde.length)]; z.push({ n, x: i % W, y: (i - i % W) / W, px: i % W, py: (i - i % W) / W, kuoli: -1, suunta: 4 }); }
  return z; };
const askel = (k, Z, P) => {
  kirjaa(k, P);
  const a = ansaRuutu(), kohde = hitain(P), d = kohde ? kentta(kohde.x, kohde.y) : null, { W } = ruudukko, varattu = new Set();
  for (const z of Z) { z.px = z.x; z.py = z.y;
    if (z.kuoli >= 0) { const r = kaukainen(P, arpa(ASETUS.siemen * 31 + k * 101 + z.n)); z.x = z.px = r.x; z.y = z.py = r.y; z.kuoli = -1; z.syo = false; z.synty = k; varattu.add(z.y * W + z.x); continue; }
    if (d) { let paras = null; const nyt = d[z.y * W + z.x];
      for (const [dx, dy] of NAAP) { const x = z.x + dx, y = z.y + dy, j = y * W + x; if (x < 0 || y < 0 || x >= W || y >= ruudukko.H || d[j] < 0 || varattu.has(j)) continue;
        if ((nyt < 0 || d[j] < nyt) && (!paras || d[j] < paras.d)) paras = { x, y, d: d[j], dx, dy }; }
      if (paras) { z.x = paras.x; z.y = paras.y; z.suunta = suunnaksi(paras.dx, paras.dy); } }
    varattu.add(z.y * W + z.x);
    if (a && z.x === a.x && z.y === a.y) z.kuoli = k;   // ansaan: makaa tämän tikin, syntyy seuraavalla kauas
    // Kiinni saatu: zombi "syö" ja syntyy seuraavalla tikillä kauas, kuten ansassa. Kaikki näkevät saman ruudun, joten sääntö on jaettu.
    //   Ilman tätä ovelle siirretty seisoo zombin vieressä ja kuolee 4 s välein (mitattu robolla 23:22: 18 kuolemaa, 54 teleporttipakettia).
    else if (P.some(p => ASETUS.kohteet.includes(p.id) && p.x === z.x && p.y === z.y)) { z.kuoli = k; z.syo = true; }
  }
  return kohde;
};
const suunnaksi = (dx, dy) => ({ '0,-1': 0, '1,-1': 1, '1,0': 2, '1,1': 3, '0,1': 4, '-1,1': 5, '-1,0': 6, '-1,-1': 7 })[dx + ',' + dy] ?? 4;

// ---- piirto (paikalliset hahmot negatiivisilla id:illä, vain tässä clientissä)
let V = null, figuuri = ASETUS.figuuri, seuraavaId = -950001;
const valmistele = () => { const s = istunto(), ud = s && s.userDataManager; let loydetty = false;
  for (const o of [...(e.getRoomObjects(huone, 100) || [])].sort((a, b) => a.id - b.id)) { if (!V) V = o.getLocation().constructor;
    const u = ud && ud.getUserDataByIndex && ud.getUserDataByIndex(o.id);
    if (!loydetty && u && /zombi/i.test(String(u.name || '')) && /bot/i.test(String(o.type))) { const f = o.model && o.model.getValue('figure'); if (f) { figuuri = f; loydetty = true; } } }
  return !!V; };
const piirretyt = new Map();   // n -> objekti-id
const piirra = () => {
  const p = Math.min(1, ((Date.now() % ASETUS.tikki) / ASETUS.tikki) / 0.85), { z: Z } = ruudukko;
  for (const z of tila.zombit) {
    let g = piirretyt.get(z.n);
    const x = z.px + (z.x - z.px) * p, y = z.py + (z.y - z.py) * p, zz = Math.max(0, Z[Math.round(y) * ruudukko.W + Math.round(x)] || 0), sd = z.suunta * 45;
    if (g == null) { g = seuraavaId--; if (!e.addRoomObjectUser(huone, g, new V(x, y, zz), new V(sd), sd, 1, figuuri)) continue; piirretyt.set(z.n, g); }
    try { e.updateRoomObjectUserLocation(huone, g, new V(x, y, zz), null, false, 0, new V(sd), sd, true, false, 16);
      const liikkuu = (z.x !== z.px || z.y !== z.py) && p < 1, asento = z.kuoli >= 0 && !z.syo ? 'lay' : liikkuu ? 'mv' : 'std';
      if (z._asento !== asento) { e.updateRoomObjectUserPosture(huone, g, asento, ''); z._asento = asento; } } catch (x) {}
  }
};
tila.kuva = () => tila.zombit.map(z => ({ n: z.n, x: z.x, y: z.y, kuoli: z.kuoli, id: piirretyt.get(z.n) }));

// ---- oma kuolema
const ilmoita = teksti => { const d = document.createElement('div'); d.textContent = teksti;
  d.style.cssText = 'position:fixed;left:50%;top:14%;transform:translateX(-50%);z-index:99999;pointer-events:none;padding:8px 16px;'
    + 'background:rgba(90,0,0,.8);color:#fff;font:bold 15px sans-serif;border-radius:6px;transition:opacity .4s';
  document.body.appendChild(d); setTimeout(() => { d.style.opacity = '0'; }, 1600); setTimeout(() => d.remove(), 2100); };
const yhteys = () => { const nahty = new Set(); let c = null;
  const etsi = (o, d) => { if (!o || c || d > 4 || typeof o !== 'object' || nahty.has(o)) return; nahty.add(o);
    if (Object.getOwnPropertyDescriptor(o, '_cryptoState')) { c = o; return; }
    for (const k of Object.getOwnPropertyNames(o)) { const de = Object.getOwnPropertyDescriptor(o, k); if (de && !de.get && de.value && typeof de.value === 'object') etsi(de.value, d + 1); } };
  etsi(dv(e, '_roomSessionManager'), 0); return c; };
const omaRuutu = () => { const s = istunto(), i = s && s.ownRoomIndex; if (i == null || i < 0) return null;
  const o = e.getRoomObject(huone, i, 100), L = o && o.getLocation(); return L ? { i, x: Math.round(L.x), y: Math.round(L.y) } : null; };
const odota = ms => new Promise(r => setTimeout(r, ms));
let kuolemaKaynnissa = 0, safeIlmoitettu = 0;
const kuole = async (syy) => {
  const nyt = Date.now(); if (nyt - kuolemaKaynnissa < 8000) return;   // 8 s: zombi ehtii syntyä kauas ennen seuraavaa tarkistusta
  if (safe) { if (nyt - safeIlmoitettu > 5000) { safeIlmoitettu = nyt; ilmoita(syy + ' (:safe päällä, ei kuolemaa)'); lokiin({ kuolema: syy, safe: true }); } return; }
  kuolemaKaynnissa = nyt; tila.kuolemat++; ilmoita(syy);
  const o = omaRuutu(), c = yhteys(), { x, y } = ASETUS.ovi; let tapa = 'teleportti';
  if (o && o.x === x && o.y === y) { lokiin({ kuolema: syy, tapa: 'jo ovella, ei pakettia' }); return; }
  try { if (!o || !c || typeof c.sendRawPacket !== 'function') throw new Error('yhteys/indeksi puuttuu');
    // Kaksi yritystä: robolla 2/4 teleporttia jäi puolitiehen (vain toinen koordinaatti vaihtui), toinen yritys onnistui aina (23:20-23:27).
    let r = null; for (let yritys = 0; yritys < 2; yritys++) {
      c.sendRawPacket(7099, [1, 524287, huone], 'zombit'); await odota(60);
      c.sendRawPacket(7016, [1, o.i, 'internal:1:@position.y', y, 0], 'zombit'); await odota(250);
      c.sendRawPacket(7016, [1, o.i, 'internal:1:@position.x', x, 0], 'zombit'); await odota(700);
      r = omaRuutu(); if (r && r.x === x && r.y === y) break; tapa = 'teleportti, yritys 2'; }
    if (!r || r.x !== x || r.y !== y) throw new Error('sijainti ' + (r ? r.x + ',' + r.y : '?'));
  } catch (err) { tapa = 'uudelleen tulo (' + String(err.message || err) + ')';
    try { const sm = dv(e, '_roomSessionManager'); if (sm && sm.createSession) sm.createSession(huone, null); } catch (x) { tapa += ' EPÄONNISTUI ' + x; } }
  lokiin({ kuolema: syy, tapa, ennen: o && [o.x, o.y] });
};
const tarkistaOma = () => { if (Date.now() - ALKU < ARMO) return; const o = omaRuutu(); if (!o) return; const a = ansaRuutu();
  if (a && o.x === a.x && o.y === a.y) return kuole('Astuit ansaan!');
  for (const z of tila.zombit) if ((z.kuoli < 0 || z.syo) && z.x === o.x && z.y === o.y) return kuole('Zombi sai sinut kiinni!');
  if (!ruudukko.ok[o.y * ruudukko.W + o.x]) for (const z of tila.zombit)   // tuolilla tms.: zombi viereisessä ruudussa riittää
    if (z.kuoli < 0 && Math.max(Math.abs(z.x - o.x), Math.abs(z.y - o.y)) <= 1 && ruudukko.ok[z.y * ruudukko.W + z.x] && hitainId() === omaId()) return kuole('Zombi sai sinut kiinni!'); };
const hitainId = () => tila.kohde && tila.kohde.id;

// ---- kello
const ALKU = Date.now(), ARMO = 6000;   // käynnistyksen jälkeen ei kuolemaa (kelattu tila voi olla väärä; tulija ehtii nähdä zombit)
const tiki = () => {
  const nyt = Date.now(), k = Math.floor(nyt / ASETUS.tikki), e1 = Math.floor(nyt / ASETUS.epookki);
  if (!ruudukko) { ruudukko = rakenna(); if (!ruudukko || !ruudukko.ruudut.length || !valmistele()) { ruudukko = null; return; } }
  if (SAILO.E === e1 && SAILO.zombit.length === ASETUS.maara && k - SAILO.K < 30) { if (tila.zombit !== SAILO.zombit) { tila.zombit = SAILO.zombit; lokiin({ jatkettu: SAILO.K }); } }
  else {   // uusi epookki tai ensimmäinen käynnistys tällä sivulla: zombit epookin syntyruutuihin (siemen = epookki, sama kaikilla).
    // EI kelausta nykyisillä pelaajaruuduilla: se vei zombit heti hitaimman päälle (mitattu 23:19, kuolema 1 s käynnistyksestä).
    // Hinta: kesken epookin tullut näkee zombit syntyruuduissa, kun huoneessa jo olleet näkevät ne jahdissa -> eri näkymä epookin loppuun asti.
    SAILO.E = e1; tila.zombit = SAILO.zombit = synny(e1); historia.clear(); SAILO.K = k - 1; lokiin({ epookki: e1, syntyi: tila.zombit.map(z => z.x + ',' + z.y).join(' ') });
  }
  while (SAILO.K < k) { SAILO.K++; tila.kohde = askel(SAILO.K, tila.zombit, pelaajat()); }
  tila.k = SAILO.K;
};
const ajastin = setInterval(() => { try { tiki(); if (ruudukko) { piirra(); tarkistaOma(); } } catch (x) { tila.virheet++; lokiin({ virhe: String(x && x.stack || x).slice(0, 300) }); if (tila.virheet > 50) clearInterval(ajastin); } }, 100);
const uusiKartta = setInterval(() => { try { if (ruudukko) { const r = rakenna(); if (r && r.ruudut.length) ruudukko = r; } } catch (x) {} }, 5000);

// ---- :safe (vain rataryhmä, kuten :efektit; rivi ei lähde palvelimelle)
const KENTTA = 'input.nitro-chat-input-control', KOMENTO = /^:safe(?:\s+(pois|päälle|paalle|on|off))?$/i;
const kuule = ev => {
  if (ev.key !== 'Enter' && ev.key !== 'NumpadEnter') return;
  const el = ev.target; if (!(el instanceof HTMLInputElement) || !el.matches(KENTTA)) return;
  const m = KOMENTO.exec((el.value || '').trim()); if (!m || !SALLITUT.includes(omaId())) return;
  ev.preventDefault(); ev.stopImmediatePropagation();
  const s = (m[1] || '').toLowerCase(), uusi = s ? !(s === 'pois' || s === 'off') : !safe;
  tila.safe(uusi); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ''); el.dispatchEvent(new Event('input', { bubbles: true }));
  ilmoita(uusi ? ':safe päällä: zombit ja ansa eivät tapa sinua' : ':safe pois: zombit ja ansa tappavat');
};
addEventListener('keydown', kuule, true); tila._kuule = kuule;   // testaus: zombit._kuule(valeTapahtuma)
lokiin({ alku: huone, safe });

return () => { clearInterval(ajastin); clearInterval(uusiKartta); removeEventListener('keydown', kuule, true);
  for (const g of piirretyt.values()) try { e.removeRoomObjectUser(huone, g); } catch (x) {}
  piirretyt.clear(); if (window.zombit === tila) delete window.zombit; };
