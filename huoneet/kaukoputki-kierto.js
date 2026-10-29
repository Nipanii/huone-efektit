// Kaukoputki joka näyttää huoneen TOISESTA KULMASTA zoomattuna (I179). Ensimmäinen käyttö: lobby 656, attic15_telescope 438790 (20,7).
//
// kp 29.10. 00:53 "Oisko mahdollista tehdä tosta lobbyn kaukoputkesta kans toimiva? … Kaukoputki näyttäis huoneen eri kulmasta huone
//   käännön avulla zoomed in. Se ois tosi trippy … huoneen kääntö script ainakin aiemmin bugitti puhekuplat. Samanlailla kaukoputki muuten
//   kuin aiempi huone. Ja sit palautuu normi kuvakulma kun siitä poistuu." · 00:58 "Zoomattu ympyrä seuraa hiirtä."
// Pohjat: huoneet/682.js:253-421 (putki, aukko, hiiren seuranta, klikkaus keskelle, kävelyesto) + userscriptit/huonekierto 1.9.1 aseta()
//   (kameran kääntö: geometry.direction + depthVector + _effectDirection + location kiertokeskipisteen ympäri; seinät/maisema
//   _typeVisibility[1,3] pois; seinäesineet alpha 0; moniruutuiset paikallisesti takakulmaan, 400 ms korjaus).
// Puhekuplat: kaikki piiloon putken ajaksi (kuten 682) -> kääntö ja kuplat eivät ole koskaan ruudulla yhtä aikaa (huonekierron #831).
// Avaus: klikkaus kaukoputkeen mistä tahansa (656:n putki on katolla z 7.2, sen viereen ei pääse kävelemään, mitattu 01:09).
//   Sulku: Esc, tuplaklikkaus lattiaan, klikkaus putkeen, oma hahmo liikkuu. Q/E tai ← → kulma, +/- tai ↑ ↓ tai rulla zoom 1-6x (versio 5).
//   Putken ajaksi piiloon: oma hahmo, itse putki ja etualan kalusteet (seinät/kaiteet katsojan ja fokusalueen välissä).
//   Sulkiessa kamera, zoom, offset, seinät ja kalusteiden paikat palautetaan täsmälleen avaushetken tilaan.
// RAJAT: 2-suuntaiset kalusteet näyttävät käännettynä väärältä (rakenteellinen, ROTATE.md vika 3). Seinät eivät näy käännetyssä näkymässä.
//   Kävely on estetty putken ollessa auki (pelin pinnan klikkaus laskee oletuskulmalla). Vain pelaajille joilla huoneskriptimoottori on.
// Konsolissa: kaukoputkiKierto.auki(true|false) · kaukoputkiKierto.loki
const e = window.NitroDevTools && window.NitroDevTools.roomEngine;
const huone = kupla.roomId();
if (!e) return;
// alue = kp 29.10. 01:46 "default view olis niinku tonne mis kaikki hengaa" #osoita:p:656:242,192,662,535 (huonepikseleinä, MessengerPoint.ts
//   roomPixelToScreen: getScreenPoint * 64 / geometry.scale, kääntämätön näkymä). Alueen keskikohta pidetään putken keskellä joka kulmassa.
const ASETUKSET = { 656: { putki: 438790, kulmat: [90, 270, 180], zoom: 2, alue: [242, 192, 662, 535] } };   // kp 01:05 "Kokeillaan molemmat kulmat"
const A = ASETUKSET[huone]; if (!A) return;
const tila = window.kaukoputkiKierto = { versio: 5, huone, auki: false, loki: [], zoom: A.zoom };
const lokiin = (x) => { x.t = new Date().toTimeString().slice(0, 8); tila.loki.push(x); if (tila.loki.length > 50) tila.loki.shift(); };
const dv = (o, k) => { const d = o && Object.getOwnPropertyDescriptor(o, k); return d && !d.get ? d.value : undefined; };
const hs = window.huoneskriptit;
const omaIndeksi = () => { try { if (hs && hs.oma) { const i = hs.oma(huone); if (i != null && i >= 0) return i; } } catch (x) {}
  const sm = dv(e, '_roomSessionManager'), s = sm && sm.getSession && sm.getSession(huone); const i = s && s.ownRoomIndex; return i != null && i >= 0 ? i : null; };
const omaHahmo = () => { const i = omaIndeksi(); return i == null ? null : e.getRoomObject(huone, i, 100); };
const yhteys = () => {
  const nahty = new Set(); let c = null;
  const etsi = (o, d) => { if (!o || c || d > 4 || typeof o !== 'object' || nahty.has(o)) return; nahty.add(o);
    if (Object.getOwnPropertyDescriptor(o, '_cryptoState')) { c = o; return; }
    for (const k of Object.getOwnPropertyNames(o)) { const de = Object.getOwnPropertyDescriptor(o, k); if (de && !de.get && de.value && typeof de.value === 'object') etsi(de.value, d + 1); } };
  etsi(dv(e, '_roomSessionManager'), 0); return c; };
const pois = [];
const rad = a => a / 180 * Math.PI;
const ruutu = () => { const o = omaHahmo(); if (!o) return null; const l = o.getLocation(); return Math.round(l.x) + ',' + Math.round(l.y); };
let avausRuutu = null;

// ---- Kameran kääntö (huonekierto 1.9.1 aseta(), vain tämä client, 0 pakettia)
let kierto = null;   // { cv, g, V, d0, l0, e0, o, L, s0, of0, seinat, alpha: Map, siirrot: Map }
const kanvas = () => { const cv = e.getRoomInstanceRenderingCanvas(huone, 1); return cv && cv.geometry ? cv : null; };
// v5: sprite on näytöllä offset + (p + trunc(w/2)) * scale (RoomSpriteCanvas.ts:736 + display.x/scale :493-501). v4:n p*s + w/2 + offset
//   oli oikein vain zoomilla 1, ja kaanna() ajetaan pelaajan omalla zoomilla (s0, esim. :zoom 2).
const naytto = (cv, V, x, y, z) => { const p = cv.geometry.getScreenPoint(new V(x, y, z)), s = cv._scale || 1;
  return [(p.x + Math.trunc(cv._width / 2)) * s + cv._screenOffsetX, (p.y + Math.trunc(cv._height / 2)) * s + cv._screenOffsetY]; };
const keskipiste = (cv, V) => { const o = naytto(cv, V, 0, 0, 0), X = naytto(cv, V, 1, 0, 0), Y = naytto(cv, V, 0, 1, 0);
  const ex = [X[0] - o[0], X[1] - o[1]], ey = [Y[0] - o[0], Y[1] - o[1]], det = ex[0] * ey[1] - ex[1] * ey[0]; if (!det) return null;
  const bx = cv._width / 2 - o[0], by = cv._height / 2 - o[1]; return { x: (bx * ey[1] - by * ey[0]) / det, y: (ex[0] * by - ex[1] * bx) / det }; };
const pidaKeskella = (cv, V, k) => { if (!k) return; const [X, Y] = naytto(cv, V, k.x, k.y, 0);
  cv._screenOffsetX += Math.round(cv._width / 2 - X); cv._screenOffsetY += Math.round(cv._height / 2 - Y); };
// Huonepikseli (kääntämätön geometria) -> lattiapiste z 0
const lattia = (g, V, px, py) => { const s = 64 / (g.scale || 64), P = (x, y) => { const p = g.getScreenPoint(new V(x, y, 0)); return [p.x * s, p.y * s]; };
  const o = P(0, 0), X = P(1, 0), Y = P(0, 1), ex = [X[0] - o[0], X[1] - o[1]], ey = [Y[0] - o[0], Y[1] - o[1]], det = ex[0] * ey[1] - ex[1] * ey[0]; if (!det) return null;
  const bx = px - o[0], by = py - o[1]; return { x: (bx * ey[1] - by * ey[0]) / det, y: (ex[0] * by - ex[1] * bx) / det }; };
const huoneObj = () => { const ri = e.getRoomInstance(huone); return ri; };
const seinat = (nakyvissa) => { try { const ro = huoneObj().getRoomObjectsForCategory(0)[0], v = ro && ro.visualization;
  if (!v || !Array.isArray(v._typeVisibility)) return;
  if (!nakyvissa) { if (!kierto.seinat) kierto.seinat = { v, alku: v._typeVisibility.slice() }; v._typeVisibility[1] = false; v._typeVisibility[3] = false; }
  else if (kierto.seinat && kierto.seinat.v === v) { v._typeVisibility = kierto.seinat.alku; kierto.seinat = null; } else return;
  v._visiblePlanes = []; v._visiblePlaneSpriteNumbers = []; } catch (x) { lokiin({ seinaVirhe: String(x) }); } };
const seinaesineet = (piiloon) => { try { for (const o of huoneObj().getRoomObjectsForCategory(20)) { const m = o.model; if (!m) continue;
    if (piiloon) { if (!kierto.alpha.has(o.id)) kierto.alpha.set(o.id, m.getValue('furniture_alpha_multiplier')); if (m.getValue('furniture_alpha_multiplier') !== 0) m.setValue('furniture_alpha_multiplier', 0); }
    else if (kierto.alpha.has(o.id)) { const a = kierto.alpha.get(o.id); m.setValue('furniture_alpha_multiplier', a == null ? 1 : a); } }
  if (!piiloon) kierto.alpha.clear(); } catch (x) { lokiin({ seinaesineVirhe: String(x) }); } };
// Moniruutuiset: sprite piirretään jalanjäljen takakulmasta katsojaan nähden -> käännettynä paikallisesti siihen kulmaan (huonekierto siirrot()).
//   Palvelimen päivitys kirjoittaa sijainnin yli -> korjaus 400 ms välein; palvelimen uusi sijainti tunnistetaan siitä ettei se ole meidän.
const sama = (a, b) => a && b && a.x === b.x && a.y === b.y && a.z === b.z;
const siirrot = (palauta) => { try { const V = kierto.V, dx = kierto.d0.x + kierto.kulma, lx = Math.cos(rad(dx)), ly = Math.sin(rad(dx));
  for (const u of huoneObj().getRoomObjectsForCategory(10)) {
    const l = u.getLocation(), s = kierto.siirrot.get(u.id), alkup = s && sama(l, s.siirretty) ? s.alkup : { x: l.x, y: l.y, z: l.z };
    if (palauta) { if (s && sama(l, s.siirretty)) u.setLocation(new V(alkup.x, alkup.y, alkup.z)); continue; }
    let sx = u.model.getValue('furniture_size_x') || 1, sy = u.model.getValue('furniture_size_y') || 1;
    const q = Math.trunc((Math.trunc(u.getDirection().x + 45) % 360) / 90); if (q === 1 || q === 3) [sx, sy] = [sy, sx];
    if (sx * sy <= 1) { if (s) kierto.siirrot.delete(u.id); continue; }
    let best = null; for (const cx of [alkup.x, alkup.x + sx - 1]) for (const cy of [alkup.y, alkup.y + sy - 1]) { const p = cx * lx + cy * ly; if (!best || p > best.p + 1e-9) best = { x: cx, y: cy, p }; }
    const kohde = { x: best.x, y: best.y, z: alkup.z };
    if (sama(kohde, alkup)) { if (s) kierto.siirrot.delete(u.id); continue; }
    if (!sama(l, kohde)) u.setLocation(new V(kohde.x, kohde.y, kohde.z));
    kierto.siirrot.set(u.id, { alkup, siirretty: kohde }); }
  if (palauta) kierto.siirrot.clear(); } catch (x) { lokiin({ siirtoVirhe: String(x) }); } };
const kaanna = () => { const cv = kanvas(); if (!cv) return false; const g = cv.geometry, d = g.direction, l = g.location, ax = g.directionAxis, V = d.constructor;
  if (!ax || !ax.z) return false;
  const t = -l.z / ax.z, o = { x: l.x + ax.x * t, y: l.y + ax.y * t, z: 0 };
  kierto = { cv, g, V, d0: new V(d.x, d.y, d.z), l0: new V(l.x, l.y, l.z), e0: cv._effectDirection, o, L: Math.hypot(l.x - o.x, l.y - o.y, l.z - o.z),
    s0: e.getRoomInstanceRenderingCanvasScale(huone, 1), of0: { x: cv._screenOffsetX, y: cv._screenOffsetY }, seinat: null, alpha: new Map(), siirrot: new Map(), etu: new Map(), fokus: null, fokusAlue: null };
  try { const a = A.alue; if (a) { kierto.fokus = lattia(g, V, (a[0] + a[2]) / 2, (a[1] + a[3]) / 2);
    kierto.fokusAlue = [[a[0], a[1]], [a[2], a[1]], [a[0], a[3]], [a[2], a[3]]].map(([x, y]) => lattia(g, V, x, y)).filter(Boolean); } } catch (x) { lokiin({ fokusVirhe: String(x) }); }
  asetaKulma(A.kulmat[tila.kulmaNro % A.kulmat.length]); seinat(false); seinaesineet(true); return true; };
// Kulma kiertokeskipisteen ympäri alkuperäisestä suunnasta; kuvan keskellä ollut lattiapiste pysyy keskellä.
const asetaKulma = (kulma) => { const k = kierto, cv = k.cv, g = k.g, V = k.V, keski = k.fokus || keskipiste(cv, V), dx = k.d0.x + kulma, dy = k.d0.y;
  if (k.kulma != null) siirrot(true); k.kulma = kulma;
  g.direction = new V(dx, dy, k.d0.z); g.setDepthVector(new V(dx, dy, 5)); cv._effectDirection = new V(dx, dy, k.d0.z);
  g.location = new V(k.o.x + k.L * Math.cos(rad(dx + 180)) * Math.cos(rad(dy)), k.o.y + k.L * Math.sin(rad(dx + 180)) * Math.cos(rad(dy)), k.o.z + k.L * Math.sin(rad(dy)));
  siirrot(false); etuala(true); pidaKeskella(cv, V, keski); k.keski = keski; };
// Zoom heti kulman asettamisen jälkeen: setScale laskee pivotin display-muunnoksesta, joka päivittyy vasta seuraavassa renderissä
//   (RoomSpriteCanvas.ts:493-501), joten pivot olisi edellisen kulman/zoomin -> keskitetään uudelleen skaalan jälkeen (mitattu 02:07: 1-2 ruutua heittoa).
const zoomKeskelle = () => { skaalaa(tila.zoom); const k = kierto; if (k && k.keski) pidaKeskella(k.cv, k.V, k.keski); };
// kp 29.10. 01:44-01:49 "etualan seinän sais piiloon + oma hahmo + toi kaukoputki" · "noi kaiteet ja seinät pitäs piilottaa jotka ei näy
//   tästä kulmasta" · "noi seinät näkyy väärin päin ja kaiteet etualalla": lattiakalusteet joiden koko jalanjälki on katsojan ja
//   fokusalueen välissä (kaukaisinkin kulma lähempänä kuin alueen lähin kulma) + itse putki -> alpha 0. Kulman vaihtuessa lasketaan uudelleen.
//   Suurempi x*lx+y*ly = kauempana kamerasta (kamera on kiertokeskipisteestä suuntaan dx+180, ks. asetaKulma).
const ALPHA = 'furniture_alpha_multiplier';
const etuala = (piiloon) => { try { const k = kierto; if (!k) return; const dx = k.d0.x + (k.kulma || 0), lx = Math.cos(rad(dx)), ly = Math.sin(rad(dx));
  const raja = piiloon && k.fokusAlue && k.fokusAlue.length ? Math.min(...k.fokusAlue.map(p => p.x * lx + p.y * ly)) - 0.5 : null;
  for (const u of huoneObj().getRoomObjectsForCategory(10)) { const m = u.model; if (!m) continue; let piilo = false;
    if (piiloon) { if (u.id === A.putki) piilo = true;
      else if (raja != null) { const s = k.siirrot.get(u.id), l = s ? s.alkup : u.getLocation();
        let sx = m.getValue('furniture_size_x') || 1, sy = m.getValue('furniture_size_y') || 1;
        const q = Math.trunc((Math.trunc(u.getDirection().x + 45) % 360) / 90); if (q === 1 || q === 3) [sx, sy] = [sy, sx];
        let kauin = -Infinity; for (const cx of [l.x, l.x + sx - 1]) for (const cy of [l.y, l.y + sy - 1]) kauin = Math.max(kauin, cx * lx + cy * ly);
        piilo = kauin < raja; } }
    if (piilo) { if (!k.etu.has(u.id)) k.etu.set(u.id, m.getValue(ALPHA)); if (m.getValue(ALPHA) !== 0) m.setValue(ALPHA, 0); }
    else if (k.etu.has(u.id)) { const a = k.etu.get(u.id); k.etu.delete(u.id); m.setValue(ALPHA, a == null ? 1 : a); } }
} catch (x) { lokiin({ etualaVirhe: String(x) }); } };
// Oma hahmo piiloon putken ajaksi (682.js:82-89 mykista: figure_is_muted IGNORED 2 | HIDDEN 4, vain tämä client). Moottorin
//   ITSE.tarkista nollaa oman hahmon mykistyksen 250 ms välein (moottori.js 0.6.7), joten lupa itse.salli() ennen ja kiella() jälkeen.
const MYKKA = 6; let omaPiilo = null;
const omaPiiloon = (on) => { try {
  if (on) { const i = omaIndeksi(), o = i == null ? null : e.getRoomObject(huone, i, 100); if (!o || omaPiilo) return;
    if (!(hs && hs.itse && typeof hs.itse.salli === 'function')) { lokiin({ hahmo: 'moottorissa ei itse.salli, ei piiloteta' }); return; }
    hs.itse.salli('kaukoputki auki');
    const alkup = o.model.getValue('figure_is_muted') || 0; omaPiilo = { i, o, alkup };
    if ((alkup & MYKKA) !== MYKKA) e.updateRoomObjectUserAction(huone, i, 'figure_is_muted', alkup | MYKKA); }
  else if (omaPiilo) { const p = omaPiilo; omaPiilo = null; if (e.getRoomObject(huone, p.i, 100) === p.o) e.updateRoomObjectUserAction(huone, p.i, 'figure_is_muted', p.alkup);
    if (hs && hs.itse && hs.itse.kiella) hs.itse.kiella(); }
} catch (x) { lokiin({ hahmoVirhe: String(x) }); } };
// Murtoluku-zoom: 7. parametri flag=true ohittaa Math.floorin (RoomEngine.ts:476). Pivot = kanvaksen keskikohta = putken keskikohta.
const skaalaa = (k) => e.setRoomInstanceRenderingCanvasScale(huone, 1, k, null, null, false, true);
tila.kulmaNro = 0;
const vaihdaKulma = (suunta) => { if (!kierto || !putki) return; tila.kulmaNro = (tila.kulmaNro + suunta + A.kulmat.length) % A.kulmat.length;
  // Keskipiste lasketaan vain zoomittomasta alkunäkymästä (mitattu 01:11: zoomattuna laskettu keskus vei 180/270 huoneen ulkopuolelle)
  const k = kierto, V = k.V; try {
    e.setRoomInstanceRenderingCanvasScale(huone, 1, k.s0 == null ? 1 : k.s0);
    const of = e.getRoomInstanceRenderingCanvasOffset(huone, 1); if (of) e.setRoomInstanceRenderingCanvasOffset(huone, 1, new of.constructor(k.of0.x, k.of0.y));
    k.cv._screenOffsetX = k.of0.x; k.cv._screenOffsetY = k.of0.y;
    k.g.direction = new V(k.d0.x, k.d0.y, k.d0.z); k.g.setDepthVector(new V(k.d0.x, k.d0.y, 5)); k.g.location = new V(k.l0.x, k.l0.y, k.l0.z);
    siirrot(true); k.kulma = null;
    asetaKulma(A.kulmat[tila.kulmaNro]);
    zoomKeskelle();
    const z = e.getRoomInstanceRenderingCanvasOffset(huone, 1); panAlku = z ? { x: z.x, y: z.y } : null; panoroi();
  } catch (x) { lokiin({ kulmaVirhe: String(x) }); }
  lokiin({ kulma: kierto.kulma }); pyyda(); };
tila.vaihdaKulma = vaihdaKulma;
const palautaKierto = () => { if (!kierto) return; const k = kierto; try {
  if (kanvas() === k.cv) { const V = k.V;
    k.g.direction = new V(k.d0.x, k.d0.y, k.d0.z); k.g.setDepthVector(new V(k.d0.x, k.d0.y, 5)); k.g.location = new V(k.l0.x, k.l0.y, k.l0.z);
    k.cv._effectDirection = k.e0 || new V(k.d0.x, k.d0.y, k.d0.z); }
  siirrot(true); etuala(false); seinat(true); seinaesineet(false);
  if (k.s0 != null) e.setRoomInstanceRenderingCanvasScale(huone, 1, k.s0);
  const of = e.getRoomInstanceRenderingCanvasOffset(huone, 1); if (of) e.setRoomInstanceRenderingCanvasOffset(huone, 1, new of.constructor(k.of0.x, k.of0.y));
} catch (x) { lokiin({ palautusVirhe: String(x) }); } kierto = null; };

// ---- Kameranseuranta pois putken ajaksi (682.js:265-273: muuten client vetää kameraa takaisin omaan hahmoon)
let kameraKohde = null;
const kameraSeuranta = (pois) => { try { const c = e.getRoomCamera(huone); if (!c) return;
  if (pois) { if (c.targetId !== -1) { kameraKohde = c.targetId; c.targetId = -1; } }
  else if (kameraKohde != null) { if (c.targetId === -1) c.targetId = kameraKohde; kameraKohde = null; } } catch (x) {} };

// ---- Putki: aukko keskellä, kamera siirtyy hiiren mukaan (682.js:274-332), zoom tila.zoom
let putki = null, hiiri = { x: innerWidth / 2, y: innerHeight / 2 }, piirto = 0, panAlku = null, panRaja = null;
const panoroi = () => { try { if (!panAlku) return; kameraSeuranta(true);
  const o = e.getRoomInstanceRenderingCanvasOffset(huone, 1); if (!o) return;
  const k = tila.zoom, x = panAlku.x + (innerWidth / 2 - hiiri.x) * k, y = panAlku.y + (innerHeight / 2 - hiiri.y) * k;
  if (Math.round(o.x) !== Math.round(x) || Math.round(o.y) !== Math.round(y)) e.setRoomInstanceRenderingCanvasOffset(huone, 1, new o.constructor(x, y));
} catch (x) { lokiin({ panVirhe: String(x) }); } };
const piirra = () => { piirto = 0; if (!putki) return;
  const c = putki, g = c.getContext('2d'), w = innerWidth, h = innerHeight, d = devicePixelRatio || 1;
  if (c.width !== Math.round(w * d) || c.height !== Math.round(h * d)) { c.width = Math.round(w * d); c.height = Math.round(h * d); }
  g.setTransform(d, 0, 0, d, 0, 0); g.globalCompositeOperation = 'source-over'; g.clearRect(0, 0, w, h);
  const R = Math.max(90, Math.min(170, Math.min(w, h) * 0.2)), x = w / 2, y = h / 2;
  g.fillStyle = 'rgb(4,4,8)'; g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.arc(x, y, R, 0, Math.PI * 2); g.fill();
  g.globalCompositeOperation = 'source-over';
  const t = g.createRadialGradient(x, y, 0, x, y, R); t.addColorStop(0, 'rgba(180,210,255,0.04)'); t.addColorStop(1, 'rgba(120,150,200,0.10)');
  g.fillStyle = t; g.beginPath(); g.arc(x, y, R, 0, Math.PI * 2); g.fill();
  const v = g.createRadialGradient(x, y, R * 0.55, x, y, R); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.55)');
  g.fillStyle = v; g.beginPath(); g.arc(x, y, R, 0, Math.PI * 2); g.fill();
  g.save(); g.beginPath(); g.arc(x, y, R, 0, Math.PI * 2); g.clip();
  const hl = g.createLinearGradient(x - R * 0.57, y - R * 0.57, x, y); hl.addColorStop(0, 'rgba(255,255,255,0.18)'); hl.addColorStop(1, 'rgba(255,255,255,0)');
  g.lineCap = 'round'; g.lineWidth = R * 0.16; g.strokeStyle = hl; g.beginPath(); g.arc(x, y, R * 0.8, Math.PI * 1.1, Math.PI * 1.5); g.stroke();
  g.lineWidth = R * 0.06; g.strokeStyle = 'rgba(255,255,255,0.06)'; g.beginPath(); g.arc(x, y, R * 0.82, Math.PI * 0.15, Math.PI * 0.5); g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.arc(x - R * 0.42, y - R * 0.42, R * 0.06, 0, Math.PI * 2); g.fill();
  g.restore();
  const ro = R * 1.12, rg = g.createLinearGradient(x - ro, y - ro, x + ro, y + ro);
  rg.addColorStop(0, '#4a3415'); rg.addColorStop(0.35, '#d8b062'); rg.addColorStop(0.65, '#7a5a24'); rg.addColorStop(1, '#3a2810');
  g.lineWidth = R * 0.12; g.strokeStyle = rg; g.beginPath(); g.arc(x, y, R + R * 0.06, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,0.6)'; g.beginPath(); g.arc(x, y, R + 1, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 1; g.strokeStyle = 'rgba(255,230,170,0.45)';
  g.beginPath(); g.arc(x, y, R + R * 0.03, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.arc(x, y, R + R * 0.11, 0, Math.PI * 2); g.stroke();
  // v5: infokortin reikä poistettu (kp 01:38 "see thru"): kortti on visibility:hidden mutta sen rect jäi, ja reikä näytti huoneen läpi
  g.font = '13px sans-serif'; g.textAlign = 'center'; g.fillStyle = 'rgba(255,255,255,0.55)';
  g.fillText('Q/E tai ← → kulma · + − tai rulla zoom ' + tila.zoom + 'x · Esc sulkee', w / 2, h - 18);
};
const pyyda = () => { if (!piirto) piirto = requestAnimationFrame(piirra); };
const lukittu = () => putki && document.pointerLockElement === putki;
const liike = ev => {
  if (lukittu()) { const w = innerWidth, h = innerHeight;
    hiiri = { x: Math.max(-w, Math.min(2 * w, hiiri.x + (ev.movementX || 0))), y: Math.max(-h, Math.min(2 * h, hiiri.y + (ev.movementY || 0))) }; }
  else hiiri = { x: ev.clientX, y: ev.clientY };
  // kp 01:37 "jokin estää liikuttamasta putkea vapaasti": panRaja-rajaus (avaushetken kanvasrajat) pois, ne eivät vastaa käännettyä näkymää
  if (panRaja && false) { const cx = innerWidth / 2, cy = innerHeight / 2, k = tila.zoom;
    hiiri = { x: Math.max(cx - (cx - panRaja.l) / k, Math.min(cx - (cx - panRaja.r) / k, hiiri.x)), y: Math.max(cy - (cy - panRaja.t) / k, Math.min(cy - (cy - panRaja.b) / k, hiiri.y)) }; }
  if (putki) { panoroi(); pyyda(); } };
let oliLukittu = false;
const lukko = () => { if (lukittu()) oliLukittu = true; else if (oliLukittu) { oliLukittu = false; if (putki) auki(false); } };
// kp 29.10. 01:36 "nuolinäppäimet telee mun hahmoo kans" + "scroll on varattu toiselle scriptille": nuolet ja rulla ovat muiden
//   lisäosien (supervoimat teleport-tila kuuntelee nuolia window-capturessa, ennen meitä). Siksi omat näppäimet: Q/E kulma, +/- zoom.
//   v5, kp 01:47 "+ ja miinus ja scroll molemmat toimii" · "arrow keys kans niille joilla ne ei oo binded": nuolet ← → kulma, ↑ ↓ zoom,
//   mutta vain jos mikään aiempi kuuntelija ei jo käsitellyt näppäintä (defaultPrevented = toisen lisäosan sidos).
const nappain = ev => { if (!putki) return; const k = ev.key;
  if (k === 'Escape') { auki(false); return; }
  if (k.startsWith('Arrow') && ev.defaultPrevented) return;
  const kulma = { q: -1, Q: -1, e: 1, E: 1, ArrowLeft: -1, ArrowRight: 1 }[k], zoomaus = { '+': 1, '=': 1, '-': -1, '_': -1, ArrowUp: 1, ArrowDown: -1 }[k];
  if (!kulma && !zoomaus) return; ev.preventDefault(); ev.stopImmediatePropagation();
  if (kulma) vaihdaKulma(kulma); else zoomaa(zoomaus); };
// kp 29.10. 01:33 "saisko scroll to zoom kans" -> näppäimillä (yllä). Näkymä rakennetaan uudelleen kuten kulman vaihdossa
//   (vaihdaKulma(0) laskee keskuksen zoomittomasta alkunäkymästä). Zoom säilyy seuraavaan avaukseen saman sivulatauksen ajan.
// v5, kp 01:44 "zoom vois olla vähän paremmin porrastettu ja sit zoomatessa se ei zoomaa siihen mihin hiiri osottaa": murtolukuportaat
//   (skaalaa, flag=true; v3:n "vain kokonaisluvut" johtui puuttuvasta flagista) ja zoom putken keskikohdan ympäri ILMAN
//   uudelleenrakennusta: setScale pitää pivot-pisteen paikallaan, ja panAlku lasketaan uudesta offsetista ettei panorointi hyppää.
const ZOOMIT = [1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6];
const zoomaa = suunta => { const i = ZOOMIT.indexOf(tila.zoom), j = Math.max(0, Math.min(ZOOMIT.length - 1, (i < 0 ? 3 : i) + suunta));
  if (ZOOMIT[j] === tila.zoom) return; tila.zoom = ZOOMIT[j]; lokiin({ zoom: tila.zoom });
  if (!kierto || !putki) return; try { skaalaa(tila.zoom); const z = e.getRoomInstanceRenderingCanvasOffset(huone, 1), k = tila.zoom;
    if (z) panAlku = { x: z.x - (innerWidth / 2 - hiiri.x) * k, y: z.y - (innerHeight / 2 - hiiri.y) * k }; } catch (x) { lokiin({ zoomVirhe: String(x) }); }
  pyyda(); };
tila.zoomaa = zoomaa;
// Rulla putken päällä: 100 deltaa = yksi porras (kosketuslevy lähettää pieniä deltoja)
let rullaKertyma = 0;
const rulla = ev => { if (!putki || ev.target !== putki) return; ev.preventDefault(); ev.stopImmediatePropagation();
  rullaKertyma += ev.deltaMode === 1 ? ev.deltaY * 33 : ev.deltaY;
  while (Math.abs(rullaKertyma) >= 100) { const s = rullaKertyma < 0 ? 1 : -1; rullaKertyma += s * 100; zoomaa(s); } };
// Klikkaus aukon keskelle (682.js:337-358)
const KESKELLE = { pointerdown: ['pointerdown', 'mousedown'], pointerup: ['pointerup', 'mouseup'], click: ['click'], mousedown: ['pointerdown', 'mousedown'], mouseup: ['pointerup', 'mouseup'] };
let ohjattu = false;
const keskelle = ev => { try {
  if (!putki || !ev.isTrusted || !(ev.target instanceof HTMLCanvasElement)) return;
  if (ev.type === 'pointerdown' || ev.type === 'mousedown') ohjattu = true; else if (!ohjattu) return; else if (ev.type === 'click') ohjattu = false;
  ev.stopImmediatePropagation(); ev.preventDefault();
  const x = innerWidth / 2, y = innerHeight / 2; let kohde = ev.target;
  if (kohde === putki) { putki.style.pointerEvents = 'none'; kohde = document.elementFromPoint(x, y); putki.style.pointerEvents = 'auto'; if (!kohde) return; }
  const s = { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, screenX: x, screenY: y,
    button: ev.button, buttons: ev.buttons, ctrlKey: ev.ctrlKey, shiftKey: ev.shiftKey, altKey: ev.altKey, metaKey: ev.metaKey, view: window };
  for (const t of KESKELLE[ev.type]) kohde.dispatchEvent(t.startsWith('pointer')
    ? new PointerEvent(t, { ...s, pointerId: ev.pointerId, pointerType: ev.pointerType, isPrimary: ev.isPrimary }) : new MouseEvent(t, s));
} catch (x) { lokiin({ klikkiVirhe: String(x) }); } };
// Puhekuplat piiloon putken ajaksi (682.js:205-208). kp 01:38 "tuo alue on jostain syystä see thru" (kuva: kaukoputken infokortti
//   Osta/Siirrä/Käännä putken päällä): avausklikki avaa myös esineen infokortin (DarkUI .nitro-infostand-container), joka piirtyi
//   putken yli läpikuultavana -> sekin piiloon putken ajaksi.
let kuplaCss = null;
const kuplaTyyli = on => { if (on && !kuplaCss) { kuplaCss = document.createElement('style'); kuplaCss.textContent = '.bubble-container,.nitro-infostand-container{visibility:hidden!important}'; document.head.appendChild(kuplaCss); }
  else if (!on && kuplaCss) { kuplaCss.remove(); kuplaCss = null; } };

// ---- Kävelyesto (682.js:401-416). Kääre asennetaan kerran ja on läpikulku kun putki on kiinni; poisto vain jos kukaan ei ole kääriytynyt päälle.
let kavelyEsto = 0, suljettu = 0, lattiaKlikki = 0, lahetys = null, kavelyViive = 0;
const kavelyKoukku = () => { if (lahetys) return; const c = yhteys(); if (!c || typeof c.send !== 'function') return;
  const kartta = dv(dv(c, '_messages'), '_messageIdByComposer'); if (!kartta || typeof kartta.get !== 'function') return;
  const orig = c.send;
  const oma = function (m, ...r) { try { if (m && kartta.get(m.constructor) === 3320) {
      if (Date.now() - kavelyEsto < 1200) { lokiin({ kavely: 'estetty' }); return; }
      // kp 01:36 "kaukoputken klikkaus liikuttaa hahmoo ku kaukoputki aukee": pelin kävely lähtee ENNEN REOE_SELECTEDia, joten
      //   kiinni-tilassa kävely odottaa 150 ms; jos putki avautui sillä välin (kavelyEsto asetettu), kävely pudotetaan.
      if (!putki) { const self = this; clearTimeout(kavelyViive);
        kavelyViive = setTimeout(() => { kavelyViive = 0; if (Date.now() - kavelyEsto < 1200) { lokiin({ kavely: 'estetty (avausklikki)' }); return; } orig.call(self, m, ...r); }, 150);
        return; }
      if (putki) { const nyt = Date.now(); kavelyEsto = nyt; if (nyt - lattiaKlikki < 500) { lattiaKlikki = 0; suljettu = nyt; setTimeout(() => auki(false), 0); } else lattiaKlikki = nyt; return; }
    } } catch (x) {} return orig.call(this, m, ...r); };
  c.send = oma; lahetys = { c, orig, oma }; };
pois.push(() => { if (lahetys && lahetys.c.send === lahetys.oma) lahetys.c.send = lahetys.orig; lahetys = null; });
let nielu = 0;
const niele = ev => { if (!nielu || !ev.isTrusted) return; if (Date.now() - nielu > 1000) { nielu = 0; return; }
  ev.stopImmediatePropagation(); ev.preventDefault(); if (ev.type === 'click') nielu = 0; };

let kursori = null;
const auki = (on) => {
  if (on && !putki) {
    kameraSeuranta(true);
    if (!kaanna()) { lokiin({ kierto: 'ei onnistunut' }); kameraSeuranta(false); return false; }
    putki = document.createElement('canvas');
    putki.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vh;z-index:2147483000;pointer-events:auto;cursor:none';
    kursori = document.createElement('style'); kursori.textContent = 'canvas{cursor:none!important}'; document.head.appendChild(kursori);
    document.body.appendChild(putki); tila.auki = true; kuplaTyyli(true);
    omaPiiloon(true); rullaKertyma = 0;
    try { zoomKeskelle();
      const z = e.getRoomInstanceRenderingCanvasOffset(huone, 1); panAlku = z ? { x: z.x, y: z.y } : null;
      const b = e.getCanvasBoundingRectangle(1); panRaja = b && b.right > b.left ? { l: b.left, t: b.top, r: b.right, b: b.bottom } : null; } catch (x) { panRaja = null; lokiin({ zoomVirhe: String(x) }); }
    avausRuutu = ruutu(); hiiri = { x: innerWidth / 2, y: innerHeight / 2 }; panoroi(); pyyda(); lokiin({ putki: 'auki', kulma: kierto && kierto.kulma, zoom: tila.zoom });
    try { const p = putki.requestPointerLock(); if (p && p.catch) p.catch(x => lokiin({ lukko: 'ei: ' + String(x).slice(0, 80) })); } catch (x) {}
  } else if (!on && putki) { if (document.pointerLockElement === putki) try { document.exitPointerLock(); } catch (x) {}
    oliLukittu = false; kuplaTyyli(false); putki.remove(); putki = null; if (kursori) { kursori.remove(); kursori = null; }
    panAlku = null; panRaja = null; omaPiiloon(false); palautaKierto(); kameraSeuranta(false); tila.auki = false; lokiin({ putki: 'kiinni' }); }
  return true;
};
tila.auki = false; tila.avaa = auki;
const valittu = ev => { try {
  if (!ev || ev.objectId !== A.putki || ev.category !== 10) return;
  const nyt = Date.now(); if (nyt - (tila.viimKlikki || 0) < 350) return; tila.viimKlikki = nyt;
  if (putki) { kavelyEsto = nyt; auki(false); } else if (nyt - suljettu > 600) { nielu = kavelyEsto = nyt; kavelyKoukku(); auki(true); }
} catch (x) { lokiin({ valintaVirhe: String(x) }); } };
const vayla = e.events;
if (vayla && vayla.addEventListener) { vayla.addEventListener('REOE_SELECTED', valittu); pois.push(() => vayla.removeEventListener('REOE_SELECTED', valittu)); }
else lokiin({ vayla: 'roomEngine.events puuttuu' });
kavelyKoukku();
for (const t of ['pointerup', 'mouseup', 'click']) { window.addEventListener(t, niele, true); pois.push(() => window.removeEventListener(t, niele, true)); }
for (const t of Object.keys(KESKELLE)) { window.addEventListener(t, keskelle, true); pois.push(() => window.removeEventListener(t, keskelle, true)); }
document.addEventListener('pointermove', liike, { capture: true, passive: true }); pois.push(() => document.removeEventListener('pointermove', liike, { capture: true }));
document.addEventListener('pointerlockchange', lukko); pois.push(() => document.removeEventListener('pointerlockchange', lukko));
window.addEventListener('wheel', rulla, { capture: true, passive: false }); pois.push(() => window.removeEventListener('wheel', rulla, { capture: true }));
document.addEventListener('keydown', nappain, true); pois.push(() => document.removeEventListener('keydown', nappain, true));
window.addEventListener('resize', pyyda); pois.push(() => window.removeEventListener('resize', pyyda));
// 400 ms: oman hahmon liike sulkee, moniruutuisten paikat korjataan palvelimen päivityksen jälkeen, kanvaksen vaihtuessa (huone ladattiin uudelleen) suljetaan
const ajastin = setInterval(() => { if (!putki) return; if (ruutu() !== avausRuutu || !kierto || kanvas() !== kierto.cv) { auki(false); return; } siirrot(false); etuala(true); pyyda(); }, 400);

return () => { clearInterval(ajastin); auki(false); for (const f of pois) try { f(); } catch (x) {} if (piirto) cancelAnimationFrame(piirto);
  if (window.kaukoputkiKierto === tila) delete window.kaukoputkiKierto; };
