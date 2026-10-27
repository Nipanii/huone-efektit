// Huone 684 (Halloween rata 5/6): pimeys, valosimulaatio ja simuloitu dimmeri.
// kp 27.10. 20:04:59 "huone on tosi pimee ja näkee vaan pienen alueen ympärillä" · 20:13:42 "advanced context aware light sim"
// · 20:28:23 "lyhty vois antaa enemmän valoo menosuuntaa" · 20:28:37 "huonekalut vois vaik blockaa" · 20:28:39 "ja seinät".
// Valo lasketaan säteinä ruutukartalla: jokainen säde kulkee valosta ulospäin kunnes osuu ruutuun jonka pinta on vähintään
// estoKorkeus valon jalkojen yläpuolella (seinät, kaapit, pöydät, korkeampi lattia). Osuman kohdalla seinän etupinta valaistaan.
//   käsiesine            valo
//   ei mitään            pieni piiri, juuri ja juuri näkee itsensä
//   kynttilä             pieni piiri joka varjostuu
//   öljylamppu           piiri + keila menosuuntaan (hahmon suunta)
//   soihtu               iso piiri
// Kontekstitietoinen: myös muiden pelaajien käsivalot ja huoneen päällä olevat lamput (tila > 0) valaisevat.
// Dimmeri (kp 20:11:28 "simuloitu dimmeri") = värisävy koko huoneen päällä. Vain tässä clientissä, ei paketteja palvelimelle.
// Rakentajille (kp 20:11:28): chatissa ":efektit pois" / ":efektit päälle" (pelkkä ":efektit" vaihtaa); ei lähde palvelimelle,
//   valinta muistetaan tässä selaimessa.
// Moottori ajaa tämän new Function('kupla', koodi)(api) ja kutsuu palautettua funktiota kun huoneesta lähdetään.
// Konsolissa (testaus): pimeys.tummuus = 0.97 · pimeys.estoKorkeus = 1 · pimeys.valot[1058].keila = 7 · pimeys.resoluutio = 3
//   · pimeys.dimmeri = { vari: '#2a1050', voima: 0.35 } · pimeys.paalla(false) · pimeys.loki · pimeys.mitta (ms/ruutu)
const MUISTI = 'h684.efektit';

const e = window.NitroDevTools && window.NitroDevTools.roomEngine;
const huone = (kupla && kupla.roomId && kupla.roomId()) || (e && e.activeRoomId);
const tila = window.pimeys = { versio: 'huone-684 valosim', huone, tummuus: 0.97, estoKorkeus: 1, seinaKorkeus: 2.4, askel: 0.1,
  sateet: 220, resoluutio: 3, ilmanValoa: 1.3, pehmeys: 34, eteen: 0.7, keilaVoima: 0.35, varjoValo: 0.45,   // pehmeys = reunan sumennus css-pikseleinä (kp 20:37:40 'aika harsh noi valo reunat', 21:52 'pitäs olla pehmeempi spread')
  // eteen = valopiirin liukuman keskipiste siirtyy näin monta ruutua katseen suuntaan; keilaVoima = keilan voima (kp 21:53 'paljon subtlempi')
  // varjoValo = kalusteen varjoon jäävä osuus valosta (kp 21:55 'pitäs toi varjo olla silti partly lit'); seinät varjostavat yhä täysin
  // ymparys = piirin säde ruutuina, keila = keilan pituus ruutuina, kulma = keilan puolikulma asteina, liekki = lämmin sävy + lepatus
  valot: { 1058: { nimi: 'Öljylamppu', ymparys: 1.8, keila: 7.5, kulma: 30, liekki: 1 }, 1027: { nimi: 'Kynttilä', ymparys: 1.7, keila: 2.8, kulma: 60, liekki: 1 },
    1113: { nimi: 'LED-kynttilä', ymparys: 1.7, keila: 2.8, kulma: 60 }, 1031: { nimi: 'Soihtu', ymparys: 3.2, keila: 5.5, kulma: 60, liekki: 1 } },
    // kp 20:42:15: kynttilälläkin pitää näkyä enemmän katseen suuntaan kuin selän taakse -> jokaisella käsivalolla leveä keila
  lamppu: { ymparys: 3.2, liekki: 1 }, lamppuKuvio: /lamp|light|vela|candle|torch|lantern/i, ohitaLamput: ['army_c15_light'],   // kp 21:54: kattolamppu teki oudon läikän -> 'laita se pois päältä'
 
  dimmeri: { vari: '#2a1050', voima: 0.35 }, loki: [], mitta: 0 };
tila.loki.push = function () { const t = new Date().toTimeString().slice(0, 8); for (const o of arguments) if (o && typeof o === 'object' && !o.t) o.t = t;
  if (this.length > 200) this.splice(0, this.length - 200); return Array.prototype.push.apply(this, arguments); };

const omaIndeksi = () => {
  const sm = e && Object.getOwnPropertyDescriptor(e, '_roomSessionManager'); const s = sm && sm.value && sm.value.getSession && sm.value.getSession(huone);
  const i = s && s.ownRoomIndex; return (i == null || i < 0) ? null : i;
};
const kanvas = () => [...document.querySelectorAll('canvas')].filter(c => c !== verho).sort((a, b) => b.width * b.height - a.width * a.height)[0];
const kadessa = o => { try { return Number(o.model.getValue('figure_carry_object')) || 0; } catch (x) { return 0; } };

const savy = document.createElement('canvas');   // dimmerin värisävy omana kanvaksena: valot leikkaavat myös sen (div jätti valaistun alueen violetiksi)
const sx = savy.getContext('2d');
savy.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vh;pointer-events:none;z-index:1';
const verho = document.createElement('canvas');   // pimeys, josta valot leikataan; pieni resoluutio venytetään = pehmeät reunat
verho.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vh;pointer-events:none;z-index:1';
const cx = verho.getContext('2d');
let liitetty = null;
const liita = cv => {
  if (!cv || liitetty === cv) return;
  // Kanvaksen perään samaan vanhempaan: kerrokset peittävät huoneen mutta jäävät chatin ja valikoiden alle.
  cv.parentNode.insertBefore(verho, cv.nextSibling); cv.parentNode.insertBefore(savy, verho); liitetty = cv;
};

let paalla = true;
try { paalla = localStorage.getItem(MUISTI) !== 'pois'; } catch (x) {}
tila.paalla = (p) => { if (p === undefined) return paalla; paalla = !!p;
  savy.style.display = verho.style.display = paalla ? '' : 'none';
  try { localStorage.setItem(MUISTI, paalla ? 'paalla' : 'pois'); } catch (x) {}
  tila.loki.push({ efektit: paalla ? 'päällä' : 'pois' }); return paalla; };
tila.paalla(paalla);

// Chat-komento: kaapataan Enter ennen pelin omaa käsittelijää (sama kenttä ja tapa kuin pitka-viesti-lisäosassa).
const KENTTA = 'input.nitro-chat-input-control', KOMENTO = /^:efektit(?:\s+(pois|päälle|paalle|on|off))?$/i;
const tyhjenna = el => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ''); el.dispatchEvent(new Event('input', { bubbles: true })); };
const ilmoita = teksti => { const d = document.createElement('div');
  d.textContent = teksti;
  d.style.cssText = 'position:fixed;left:50%;top:14%;transform:translateX(-50%);z-index:99999;pointer-events:none;padding:8px 16px;'
    + 'background:rgba(0,0,0,.75);color:#fff;font:bold 15px sans-serif;border-radius:6px;transition:opacity .4s';
  document.body.appendChild(d); setTimeout(() => { d.style.opacity = '0'; }, 1600); setTimeout(() => d.remove(), 2100); };
const kuuleKomento = ev => {
  if (ev.key !== 'Enter' && ev.key !== 'NumpadEnter') return;
  const el = ev.target; if (!(el instanceof HTMLInputElement) || !el.matches(KENTTA)) return;
  const m = KOMENTO.exec((el.value || '').trim()); if (!m) return;
  ev.preventDefault(); ev.stopImmediatePropagation();
  const s = (m[1] || '').toLowerCase(), uusi = s ? !(s === 'pois' || s === 'off') : !paalla;
  tila.paalla(uusi); tyhjenna(el); ilmoita(uusi ? 'Huoneen efektit päällä' : 'Huoneen efektit pois (rakennustila)');
};
addEventListener('keydown', kuuleKomento, true);

// Ruutukartta: korkein pinta per ruutu = max(kalustepino, lattia). Päivitetään puolen sekunnin välein (kalusteet liikkuvat).
let kartta = null, kartanAika = 0;
const rakennaKartta = () => {
  const hm = e.getFurnitureStackingHeightMap(huone), wg = e.getLegacyWallGeometry(huone); if (!hm || !wg) return null;
  const W = hm.width, H = hm.height, pinta = new Float32Array(W * H), lattiaa = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x;
    lattiaa[i] = wg.isRoomTile(x, y) ? 1 : 0; pinta[i] = Math.max(hm.getTileHeight(x, y), wg.getHeight(x, y)); }
  return { W, H, pinta, lattiaa };
};
const estaa = (x, y, z) => { const k = kartta, tx = Math.round(x), ty = Math.round(y);
  if (tx < 0 || ty < 0 || tx >= k.W || ty >= k.H) return true; const i = ty * k.W + tx;
  return !k.lattiaa[i] || k.pinta[i] - z >= tila.estoKorkeus; };

// Säteet valosta kulmaväliltä a0..a1. Osuessa jatketaan vähän esteen sisään, jotta sen lähin reuna valaistuu.
const seinaa = (x, y) => { const k = kartta, tx = Math.round(x), ty = Math.round(y); return tx < 0 || ty < 0 || tx >= k.W || ty >= k.H || !k.lattiaa[ty * k.W + tx]; };

const sateile = (l, a0, a1, n, r, vainSeinat) => { const pts = [];
  for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n, dx = Math.cos(a), dy = Math.sin(a); let d = 0.3, osui = false;
    for (; d < r; d += tila.askel) if (vainSeinat ? seinaa(l.x + dx * d, l.y + dy * d) : estaa(l.x + dx * d, l.y + dy * d, l.z)) { osui = true; break; }
    const dd = osui ? Math.min(r, d + 0.45) : r; pts.push({ x: l.x + dx * dd, y: l.y + dy * dd, osui }); }
  return pts; };

let g = null, rc = null, rr = null;
const ruudulle = (x, y, z) => { const p = g.getScreenPoint({ x, y, z }); if (!p) return null; const R = tila.resoluutio;
  return { x: (p.x * rc.scale + rc.width / 2 + rc.screenOffsetX + rr.left) / R, y: (p.y * rc.scale + rc.height / 2 + rc.screenOffsetY + rr.top) / R }; };
const monikulmio = (polku, pisteet) => { const q = pisteet.filter(Boolean); if (q.length < 3) return; let A = 0;
  for (let i = 0; i < q.length; i++) { const a = q[i], b = q[(i + 1) % q.length]; A += a.x * b.y - b.x * a.y; }
  if (A < 0) q.reverse();   // sama kiertosuunta kaikille -> nonzero-täyttö on unioni, ei reikiä
  polku.moveTo(q[0].x, q[0].y); for (let i = 1; i < q.length; i++) polku.lineTo(q[i].x, q[i].y); polku.closePath(); };

// Yksi valonlähde: lattiaviuhka + osumakohtien seinäpinnat yhdeksi poluksi, leikataan pimeydestä säteittäisellä liukumalla.
const valaise = (l, kulma0, kulma1, n, r, voima, lampin, gk, vainSeinat) => {   // gk = liukuman keskipiste ruutuina {x,y}, oletus valo itse
  const pts = sateile(l, kulma0, kulma1, n, r, vainSeinat), polku = new Path2D(), kesk = ruudulle(l.x, l.y, l.z); if (!kesk) return;
  const taysi = kulma1 - kulma0 >= Math.PI * 2 - 1e-6;
  monikulmio(polku, (taysi ? [] : [kesk]).concat(pts.map(p => ruudulle(p.x, p.y, l.z))));
  for (let i = 0; i < pts.length - 1; i++) { const a = pts[i], b = pts[i + 1]; if (!a.osui || !b.osui) continue;
    monikulmio(polku, [ruudulle(a.x, a.y, l.z), ruudulle(b.x, b.y, l.z), ruudulle(b.x, b.y, l.z + tila.seinaKorkeus), ruudulle(a.x, a.y, l.z + tila.seinaKorkeus)]); }
  const gc = (gk && ruudulle(gk.x, gk.y, l.z)) || kesk;
  const reuna = ruudulle(l.x + r, l.y, l.z), sade = reuna ? Math.hypot(reuna.x - kesk.x, reuna.y - kesk.y) : 50;
  // liukuma loppuu nollaan monikulmion reunaan mennessä (ennen *1.15 jätti reunalle ~30 % voimaa = terävä raja)
  const gr = cx.createRadialGradient(gc.x, gc.y, 0, gc.x, gc.y, sade);
  gr.addColorStop(0, 'rgba(0,0,0,' + voima + ')'); gr.addColorStop(0.25, 'rgba(0,0,0,' + (voima * 0.85) + ')'); gr.addColorStop(0.55, 'rgba(0,0,0,' + (voima * 0.45) + ')'); gr.addColorStop(0.8, 'rgba(0,0,0,' + (voima * 0.15) + ')'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  for (const k of [cx, sx]) { k.filter = 'blur(' + (tila.pehmeys / tila.resoluutio).toFixed(1) + 'px)';
    k.globalCompositeOperation = 'destination-out'; k.fillStyle = gr; k.fill(polku); k.filter = 'none'; }
  cx.filter = 'blur(' + (tila.pehmeys / tila.resoluutio).toFixed(1) + 'px)';
  if (lampin) { const lg = cx.createRadialGradient(gc.x, gc.y, 0, gc.x, gc.y, sade);
    lg.addColorStop(0, 'rgba(255,150,50,' + (0.22 * lampin) + ')'); lg.addColorStop(1, 'rgba(255,140,40,0)');
    cx.globalCompositeOperation = 'source-over'; cx.fillStyle = lg; cx.fill(polku); }
  cx.filter = 'none';
};

// Hahmon vartalo valoon koko korkeudeltaan clientin oman rajauslaatikon mukaan (kp 21:52 'outo toi varjo tos pään pääl':
// vanha soikio oli z+1:n kohdalla 40 css-px säteellä, joten hattu ja pää jäivät pimeään).
const vartalo = (l, voima) => { let b = null; try { b = e.getRoomObjectBoundingRectangle(huone, l.id, 100, e._activeRoomActiveCanvas); } catch (x) {}
  if (!b || !b.width) return; const R = tila.resoluutio, cxp = (b.x + b.width / 2 + rr.left) / R, cyp = (b.y + b.height / 2 + rr.top) / R;
  const ry = b.height / 2 / R * 1.25, rx = b.width / 2 / R * 1.25;
  for (const k of [cx, sx]) { k.save(); k.translate(cxp, cyp); k.scale(rx / ry, 1); const gr = k.createRadialGradient(0, 0, 0, 0, 0, ry);
    gr.addColorStop(0, 'rgba(0,0,0,' + voima + ')'); gr.addColorStop(0.6, 'rgba(0,0,0,' + (voima * 0.75) + ')'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    k.globalCompositeOperation = 'destination-out'; k.fillStyle = gr; k.fillRect(-ry, -ry, 2 * ry, 2 * ry); k.restore(); } };

// Kaikki valot: pelaajien käsivalot (oma + muut) ja päällä olevat lamput.
const valonlahteet = () => { const out = [], oma = omaIndeksi();
  const n = e.getRoomObjectCount(huone, 100);
  for (let i = 0; i < n; i++) { const o = e.getRoomObjectByIndex(huone, i, 100); if (!o || o.type === 'pet') continue;
    const ese = kadessa(o), v = tila.valot[ese], L = o.getLocation(), oman = o.id === oma;
    if (!v && !oman) continue;
    out.push({ x: L.x, y: L.y, z: L.z, v: v || { ymparys: tila.ilmanValoa }, suunta: o.getDirection().x, oma: oman, ese, id: o.id }); }
  const m = e.getRoomObjectCount(huone, 10);
  for (let i = 0; i < m; i++) { const o = e.getRoomObjectByIndex(huone, i, 10);
    if (!o || !tila.lamppuKuvio.test(o.type) || (tila.ohitaLamput || []).includes(o.type) || !(o.getState(0) > 0)) continue; const L = o.getLocation();
    out.push({ x: L.x, y: L.y, z: L.z, v: tila.lamppu, lamppu: o.type }); }
  return out; };

let raf = 0, viimeVali = null;
const piirra = () => {
  raf = requestAnimationFrame(piirra);
  if (!paalla) return;
  const t0 = performance.now();
  try {
    const cv = kanvas(); if (!cv) return; liita(cv);
    const d = tila.dimmeri || {};
    
    const R = tila.resoluutio, W = Math.ceil(innerWidth / R), H = Math.ceil(innerHeight / R);
    if (verho.width !== W || verho.height !== H) { verho.width = W; verho.height = H; }
    if (savy.width !== W || savy.height !== H) { savy.width = W; savy.height = H; }
    sx.globalCompositeOperation = 'source-over'; sx.clearRect(0, 0, W, H);
    sx.globalAlpha = Math.max(0, Math.min(1, Number(d.voima) || 0)); sx.fillStyle = d.vari || 'rgba(0,0,0,0)'; sx.fillRect(0, 0, W, H); sx.globalAlpha = 1;
    if (!kartta || t0 - kartanAika > 500) { kartta = rakennaKartta(); kartanAika = t0; }
    const c = e._activeRoomActiveCanvas; g = e.getRoomInstanceGeometry(huone, c); rc = e.getRoomInstanceRenderingCanvas(huone, c); rr = cv.getBoundingClientRect();
    cx.globalCompositeOperation = 'source-over'; cx.clearRect(0, 0, W, H); cx.fillStyle = 'rgba(0,0,0,' + tila.tummuus + ')'; cx.fillRect(0, 0, W, H);
    if (!kartta || !g || !rc) return;
    const lepatus = 1 + Math.sin(t0 / 120) * 0.03 + Math.sin(t0 / 47) * 0.02;
    for (const l of valonlahteet()) { const v = l.v, f = v.liekki ? lepatus : 1;
      const th = (l.suunta || 0) * Math.PI / 180, kesk = Math.atan2(-Math.cos(th), Math.sin(th)), eteen = v.keila && l.suunta != null ? tila.eteen : 0;
      // piiri: säteet lähtevät valosta (varjot oikein), liukuman keskipiste on vähän katseen suuntaan -> suunta näkyy hienovaraisesti
      const gk = eteen ? { x: l.x + Math.cos(kesk) * eteen, y: l.y + Math.sin(kesk) * eteen } : null;
      valaise(l, 0, Math.PI * 2, tila.sateet, (v.ymparys + eteen) * f, 1, v.liekki ? 0.7 : 0, gk);
      if (tila.varjoValo > 0) valaise(l, 0, Math.PI * 2, Math.round(tila.sateet / 2), (v.ymparys + eteen) * f, tila.varjoValo, 0, gk, true);   // kalusteiden varjot puolivaloon
      if (v.keila) { const k = v.kulma * Math.PI / 180;
        valaise(l, kesk - k, kesk + k, Math.round(tila.sateet / 4), v.keila * f, tila.keilaVoima, (v.liekki || 0) * 0.5); }
      if (l.id != null) vartalo(l, v.keila || v.ymparys > tila.ilmanValoa ? 0.85 : 0.6);
      if (l.oma) {   // oma hahmo näkyy aina vähän: soikio vartalon kohdalle
                const nimi = (tila.valot[l.ese] || {}).nimi; if (nimi !== viimeVali) { viimeVali = nimi; tila.loki.push({ valo: nimi || 'ei valoa', ese: l.ese }); } } }
  } catch (x) { tila.loki.push({ virhe: String(x && x.stack || x).slice(0, 300) }); cancelAnimationFrame(raf); }
  tila.mitta = Math.round((performance.now() - t0) * 10) / 10;
};
raf = requestAnimationFrame(piirra);
tila.loki.push({ alku: huone, efektit: paalla ? 'päällä' : 'pois' });

return () => { cancelAnimationFrame(raf); removeEventListener('keydown', kuuleKomento, true); savy.remove(); verho.remove();
  if (window.pimeys === tila) delete window.pimeys; };
