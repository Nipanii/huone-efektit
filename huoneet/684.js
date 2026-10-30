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
const tila = window.pimeys = { versio: 'huone-684 valosim kerros-body', huone, tummuus: 1,  verhoTasoitus: 12, estoKorkeus: 1, seinaKorkeus: 2.4, askel: 0.1,
  sateet: 220, resoluutio: 3, ilmanValoa: 1.8, pehmeys: 34, eteen: 0.7, keilaVoima: 0.35, varjoValo: 0, vartaloVoima: 0, kupoli: 2.2,   // kupoli = valokuvun korkeus ruutuina (kp 23:45 'se ovaali muoto hahmon ympäril on vaa offputting': erillinen vartalosoikio pois, hahmo valaistaan samalla kuvulla)
    // pehmeys = reunan sumennus css-pikseleinä (kp 20:37:40 'aika harsh noi valo reunat', 21:52 'pitäs olla pehmeempi spread')
  // eteen = valopiirin liukuman keskipiste siirtyy näin monta ruutua katseen suuntaan; keilaVoima = keilan voima (kp 21:53 'paljon subtlempi')
  // varjoValo = kalusteen varjoon jäävä osuus valosta (kp 21:55 'partly lit'; kp 23:47 'varjot pitää mennä iha mustaks' -> 0)
  // 23:47: Res 'valo alue isommaks' -> ymparys-arvot n. x1.4; tummuus 0.99 -> 1
  // ymparys = piirin säde ruutuina, keila = keilan pituus ruutuina, kulma = keilan puolikulma asteina, liekki = lämmin sävy + lepatus
  // kp 30.10. 16:52 'tee se :lyhty komento jo. ja :kynttilä' · 'lyhdyllä isompi valo range': 1058 = Lyhty (ymparys 3.5, keila 9.5)
  valot: { 1058: { nimi: 'Lyhty', ymparys: 3.5, keila: 9.5, kulma: 30, liekki: 1 }, 1027: { nimi: 'Kynttilä', ymparys: 2.4, keila: 2.8, kulma: 60, liekki: 1 },
    1113: { nimi: 'LED-kynttilä', ymparys: 2.4, keila: 2.8, kulma: 60 }, 1031: { nimi: 'Soihtu', ymparys: 4.2, keila: 5.5, kulma: 60, liekki: 1 } },
    // kp 20:42:15: kynttilälläkin pitää näkyä enemmän katseen suuntaan kuin selän taakse -> jokaisella käsivalolla leveä keila
  lamppu: { ymparys: 4.2, liekki: 1 }, lamppuKuvio: /lamp|light|vela|candle|torch|lantern/i, ohitaLamput: ['army_c15_light'],   // kp 21:54: kattolamppu teki oudon läikän -> 'laita se pois päältä'
 
  sanat: { lyhty: 'zl684', kynttila: 'zc684' }, dimmeri: { vari: '#2a1050', voima: 0.35 }, loki: [], mitta: 0 };
tila.loki.push = function () { const t = new Date().toTimeString().slice(0, 8); for (const o of arguments) if (o && typeof o === 'object' && !o.t) o.t = t;
  if (this.length > 200) this.splice(0, this.length - 200); return Array.prototype.push.apply(this, arguments); };

const dv = (o, k) => { const d = o && Object.getOwnPropertyDescriptor(o, k); return d && !d.get ? d.value : undefined; };
const istunto = () => { const sm = dv(e, '_roomSessionManager'); return sm && sm.getSession && sm.getSession(huone); };
const omaIndeksi = () => {
  const s = istunto(), i = s && s.ownRoomIndex; if (i != null && i >= 0) return i;
  const ud = s && s.userDataManager, sd = dv(e, '_sessionDataManager') || {}, id = Number(sd._userId || sd.userId || 0), nimi = String(sd._name || sd.userName || '').trim().toLowerCase();
  if (!ud || !ud.getUserDataByIndex || (!id && !nimi)) return null;
  for (const o of (e && e.getRoomObjects && e.getRoomObjects(huone, 100)) || []) { const u = o && ud.getUserDataByIndex(o.id);
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
// kp 29.10. 22:27-22:44 'tää sekoo jos laittaa inventoorin päälle' · 'ei saa huijaa et glitchaa efektin pois' · kauppa sama.
// Syy (mitattu robolla 22:51 kp:n clientin rakenteella): kanvas valittiin KOON mukaan kaikista sivun kanvaksista ja pimeys
//   liitettiin sen sisarukseksi. kp:n clientissa on toinen huoneen kokoinen kanvas (rauhoitetut-ruudut-lisäosa), joka siirtyy
//   inventaarion/kaupan esikatselun viereen kun ikkuna aukeaa -> koko tasapeli -> pimeys liitettiin IKKUNAN sisään (ikkuna
//   musta, huone pimeyden ulkopuolelta näkyvissä). 57ed5e8:n 70 %-kokoraja ei auttanut: se kanvas on koko näkymän kokoinen.
// Nyt ei kokoa eikä arvausta: huoneen kanvas on se, jonka pelin RoomView liittää omaan säiliöönsä (.roomView-background) ja
//   johon se kytkee hiiren (RoomView.tsx: canvas.onmousedown = DispatchMouseEvent). Kerrokset eivät mene pelin (Reactin)
//   DOMiin lainkaan: oma säiliö bodyyn, asemoitu huoneen kanvaksen päälle.
const kanvas = () => { for (const c of document.querySelectorAll('.roomView-background > canvas')) if (typeof c.onmousedown === 'function') return c; return null; };
const kadessa = o => { try { return Number(o.model.getValue('figure_carry_object')) || 0; } catch (x) { return 0; } };

const savy = document.createElement('canvas');   // dimmerin värisävy omana kanvaksena: valot leikkaavat myös sen (div jätti valaistun alueen violetiksi)
const sx = savy.getContext('2d');
savy.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none';
const verho = document.createElement('canvas');   // pimeys, josta valot leikataan; pieni resoluutio venytetään = pehmeät reunat
verho.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none';
// Säiliö bodyssa, huoneen kanvaksen kohdalla. z-index 1 = sama maalausjärjestys kuin ennen kanvaksen vieressä: huoneen kanvaksen
//   yläpuolella ei ole pinoamiskontekstia, ja pelin UI (chat 20, työkalupalkki 70, ikkunat 400+, ...) on kaikki z >= 10 (mitattu 22:55).
const kerros = document.createElement('div');
kerros.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;overflow:hidden;pointer-events:none;z-index:1';
kerros.append(savy, verho);
const cx = verho.getContext('2d');
// Valokartta: kaikki valot SUMMATAAN tähän (lighter) ja sumennetaan KERRAN, sitten leikataan pimeydestä.
// kp 23:40 'kuoppa ... useasta alueesta ... ruma gap, eiks vois tehä et se on yks alue': erillisten muotojen
// leikkaus jätti väliin kuopan; kenttien summa + yksi sumennus = yksi yhtenäinen alue (metapallo-periaate).
const valokartta = document.createElement('canvas'), lx = valokartta.getContext('2d'); let savyt = []; tila.valokartta = valokartta;   // testaus: pimeys.valokartta.toDataURL()
// Säiliö huoneen kanvaksen päälle (sijainti ja koko joka ruudulla, muuttuu vain kun kanvas muuttuu). Palauttaa kanvaksen laatikon.
let ala = '';
const asettele = cv => {
  if (!kerros.isConnected) document.body.appendChild(kerros);
  const r = cv.getBoundingClientRect(), a = r.left + ',' + r.top + ',' + r.width + ',' + r.height;
  if (a !== ala) { ala = a; Object.assign(kerros.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' }); }
  return r;
};

let paalla = true;
try { paalla = localStorage.getItem(MUISTI) !== 'pois'; } catch (x) {}
tila.paalla = (p) => { if (p === undefined) return paalla; paalla = !!p;
  kerros.style.display = paalla ? '' : 'none';
  try { localStorage.setItem(MUISTI, paalla ? 'paalla' : 'pois'); } catch (x) {}
  tila.loki.push({ efektit: paalla ? 'päällä' : 'pois' }); return paalla; };
tila.paalla(paalla);

// Wired-script-hybridi (682.js:153-206, 442 ja zombit-jaettu.js:345-393): :lyhty -> "zl684" (1058), :kynttilä/:kynttila -> "zc684" (1027).
// Palvelin kaiuttaa wf_trg_says_something (piilota=1) -sanat lähettäjälle kuiskauksena (2704) -> niellään handleMessagesissa (suu ei liiku)
// ja piilotetaan mahdollinen puhekupla MutationObserverilla. Huoneen wired antaa käsiesineen; skripti ei anna sitä itse.
const SALAISET = new Set(['zl684', 'zc684']);
let aktiivinen = true, koukkuYhteys = null, koukkuOma = null, koukkuAlkup = null;
const koukku = () => {
  const c = yhteys(); if (!c || typeof c.handleMessages !== 'function') return null;
  if (koukkuYhteys === c) return c;
  const alkup = c.handleMessages;
  const oma = function (...viestit) {
    if (aktiivinen) {
      try {
        let i;
        viestit = viestit.filter(v => {
          const p = v && v.parser;
          if (p && typeof p.message === 'string' && SALAISET.has(p.message.trim().toLowerCase())) {
            if (i === undefined) i = omaIndeksi();
            if (i == null || p.roomIndex === i) return false;
          }
          return true;
        });
        if (!viestit.length) return;
      } catch (x) {}
    }
    return alkup.apply(this, viestit);
  };
  c.handleMessages = oma; koukkuYhteys = c; koukkuOma = oma; koukkuAlkup = alkup; return c;
};
const puraKoukku = () => {
  try {
    if (koukkuYhteys && koukkuYhteys.handleMessages === koukkuOma) {
      if (koukkuAlkup === Object.getPrototypeOf(koukkuYhteys).handleMessages) delete koukkuYhteys.handleMessages;
      else koukkuYhteys.handleMessages = koukkuAlkup;
    }
  } catch (x) {}
};
const KUPLA_RE = /:\s*(zl684|zc684)\s*↩?\s*$/i;
const kuplaPiiloon = el => {
  try { if (KUPLA_RE.test(el.textContent || '') && el.style.display !== 'none') el.style.display = 'none'; } catch (x) {}
};
const kuplat = () => { for (const b of document.querySelectorAll('.bubble-container')) kuplaPiiloon(b); };
const kuplaVahti = new MutationObserver(kuplat);
if (document.body) kuplaVahti.observe(document.body, { childList: true, subtree: true, characterData: true });
const kuplaAjastimet = new Set();
const sanoSalainen = sana => {
  const koodi = String(sana || '').trim(); if (!koodi) return false;
  try {
    koukku();
    const s = istunto(); if (!s || typeof s.sendChatMessage !== 'function') return false;
    s.sendChatMessage(koodi, 0);
    kuplat();
    for (const ms of [30, 300, 1000]) { const a = setTimeout(() => { kuplaAjastimet.delete(a); kuplat(); }, ms); kuplaAjastimet.add(a); }
    return true;
  } catch (x) { tila.loki.push({ salasanaVirhe: String(x) }); return false; }
};
tila._sanoSalainen = sanoSalainen;
koukku();

// Chat-komento: kaapataan Enter ennen pelin omaa käsittelijää (sama kenttä ja tapa kuin pitka-viesti-lisäosassa).
const KENTTA = 'input.nitro-chat-input-control', KOMENTO = /^:efektit(?:\s+(pois|päälle|paalle|on|off))?$/i;
const LYHTY_KOMENTO = /^:lyhty$/i, KYNTTILA_KOMENTO = /^:kynttil[äa]$/i, KOMENTO_LUKKO_MS = 2000;
const komentoLukko = { zl684: 0, zc684: 0 };
const tyhjenna = el => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ''); el.dispatchEvent(new Event('input', { bubbles: true })); };
const ilmoita = teksti => { const d = document.createElement('div');
  d.textContent = teksti;
  d.style.cssText = 'position:fixed;left:50%;top:14%;transform:translateX(-50%);z-index:99999;pointer-events:none;padding:8px 16px;'
    + 'background:rgba(0,0,0,.75);color:#fff;font:bold 15px sans-serif;border-radius:6px;transition:opacity .4s';
  document.body.appendChild(d); setTimeout(() => { d.style.opacity = '0'; }, 1600); setTimeout(() => d.remove(), 2100); };
const kuuleKomento = ev => {
  if (ev.key !== 'Enter' && ev.key !== 'NumpadEnter') return;
  const el = ev.target; if (!(el instanceof HTMLInputElement) || !el.matches(KENTTA)) return;
  const rivi = (el.value || '').trim();
  // kp 30.10. 16:52 ':lyhty' ja ':kynttilä' kaikille pelaajille (ei rataryhmärajausta); lukko 2 s per komento
  const valoSana = LYHTY_KOMENTO.test(rivi) ? 'zl684' : KYNTTILA_KOMENTO.test(rivi) ? 'zc684' : null;
  if (valoSana) {
    ev.preventDefault(); ev.stopImmediatePropagation(); tyhjenna(el);
    const nyt = Date.now(); if (nyt - (komentoLukko[valoSana] || 0) < KOMENTO_LUKKO_MS) return;
    komentoLukko[valoSana] = nyt;
    const ok = sanoSalainen(valoSana);
    tila.loki.push({ komento: valoSana === 'zl684' ? 'lyhty' : 'kynttilä', sana: valoSana, ok });
    return;
  }
  const m = KOMENTO.exec(rivi); if (!m) return;
  // kp 22:28 'ei saa huijaa et glitchaa efektin pois': komento vain rataryhmälle (1 Res, 282 kp, 281 sona, 245 robo), muilta rivi menee chattiin normaalisti
  let oma = null; try { oma = Number(window.NitroDevTools.roomEngine._sessionDataManager.userId); } catch (x) {}
  if (![1, 282, 281, 245].includes(oma)) return;
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
  // kp 23:50: seinä valaistaan vain valopallon pintaan asti (sama h(d) kuin kuvussa), muuten täyskorkea seinä + matala kupu = lovi väliin.
  // Seinäverho yhtenä pintana: korkeus h = seinaKorkeus osumissa, 0 ohi menneissä, ja h tasoitetaan Gaussilla kulman yli,
  // joten osuma-alueiden väliin ei jää pystysuoraa kuoppaa (kp 23:40). Tasoitusleveys = tila.verhoTasoitus säteinä.
  const np = pts.length, Hs = taysi && tila.kupoli > 0 ? tila.kupoli : tila.seinaKorkeus,
    h0 = pts.map(p => { if (!p.osui) return 0; const d = Math.min(r, Math.hypot(p.x - l.x, p.y - l.y)); return Hs * Math.sqrt(Math.max(0, 1 - (d / r) * (d / r))); }), h = new Float32Array(np), w = Math.max(1, Math.round(tila.verhoTasoitus * np / 220));
  for (let i = 0; i < np; i++) { let su = 0, pa = 0; for (let j = -2 * w; j <= 2 * w; j++) { let q = i + j; if (taysi) q = (q + np) % np; else if (q < 0 || q >= np) continue;
    const p = Math.exp(-(j * j) / (2 * w * w)); su += h0[q] * p; pa += p; } h[i] = Math.max(h0[i], pa ? su / pa : 0); }
  for (let i = 0; i < np - (taysi ? 0 : 1); i++) { const a = pts[i], b = pts[(i + 1) % np], ha = h[i], hb = h[(i + 1) % np]; if (ha < 0.05 && hb < 0.05) continue;
    monikulmio(polku, [ruudulle(a.x, a.y, l.z), ruudulle(b.x, b.y, l.z), ruudulle(b.x, b.y, l.z + hb), ruudulle(a.x, a.y, l.z + ha)]); }
  // Valokupu: täysi piiri ei ole litteä lattialäikkä vaan puolipallo. Puolipallo = sen vaakaleikkausten unioni, joten se
  // piirretään kerroksina: korkeudella h = H*j/K leikkaus on kiekko säteellä r*sqrt(1-(j/K)^2), katkaistuna kunkin säteen
  // osumaan. Jokainen kerros on yksinkertainen tähtimäinen monikulmio (vaakatason projektio säilyttää sen), joten unioni on
  // yksi sileä alue ilman itseään leikkaavia ääriviivoja (edellinen 'ylin piste per säde' -versio teki loven ja suikaleen).
  const H = taysi && tila.kupoli > 0 ? tila.kupoli : 0;
  if (H) { const K = 4;
    for (let j = 1; j <= K; j++) { const hh = H * Math.min(j, K - 0.15) / K, dj = r * Math.sqrt(Math.max(0, 1 - (hh / H) * (hh / H))), ker = [];
      for (const p of pts) { const ex = p.x - l.x, ey = p.y - l.y, dd = Math.hypot(ex, ey); if (dd < 1e-3) continue; const d = Math.min(dd, dj);
        ker.push(ruudulle(l.x + ex / dd * d, l.y + ey / dd * d, l.z + hh)); }
      monikulmio(polku, ker); }
  }
  const gc = (gk && ruudulle(gk.x, gk.y, l.z + H * 0.4)) || ruudulle(l.x, l.y, l.z + H * 0.4) || kesk;
  const reuna = ruudulle(l.x + r, l.y, l.z), sade = (reuna ? Math.hypot(reuna.x - kesk.x, reuna.y - kesk.y) : 50) + Math.hypot(gc.x - kesk.x, gc.y - kesk.y);
  // liukuma loppuu nollaan monikulmion reunaan mennessä (ennen *1.15 jätti reunalle ~30 % voimaa = terävä raja)
  const gr = cx.createRadialGradient(gc.x, gc.y, 0, gc.x, gc.y, sade);
  gr.addColorStop(0, 'rgba(255,255,255,' + voima + ')'); gr.addColorStop(0.25, 'rgba(255,255,255,' + (voima * 0.85) + ')'); gr.addColorStop(0.55, 'rgba(255,255,255,' + (voima * 0.45) + ')'); gr.addColorStop(0.8, 'rgba(255,255,255,' + (voima * 0.15) + ')'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  lx.globalCompositeOperation = 'lighter'; lx.fillStyle = gr; lx.fill(polku);
  if (lampin) { const lg = cx.createRadialGradient(gc.x, gc.y, 0, gc.x, gc.y, sade);
    lg.addColorStop(0, 'rgba(255,150,50,' + (0.22 * lampin) + ')'); lg.addColorStop(1, 'rgba(255,140,40,0)'); savyt.push([lg, polku]); }
};

// Hahmon vartalo valoon koko korkeudeltaan clientin oman rajauslaatikon mukaan (kp 21:52 'outo toi varjo tos pään pääl':
// vanha soikio oli z+1:n kohdalla 40 css-px säteellä, joten hattu ja pää jäivät pimeään).
const vartalo = (l, voima) => { let b = null; try { b = e.getRoomObjectBoundingRectangle(huone, l.id, 100, e._activeRoomActiveCanvas); } catch (x) {}
  if (!b || !b.width) return; // kp 21:59 'liian selkee ovaali muoto': painopiste ylävartaloon (lattiapiiri valaisee jalat), laatikko ei kasva yli hahmon, gaussimainen liukuma
  const R = tila.resoluutio, cxp = (b.x + b.width / 2 + rr.left) / R, cyp = (b.y + b.height * 0.4 + rr.top) / R;
  const ry = b.height * 0.5 / R, rx = b.width * 0.5 / R;
  const k = lx; k.save(); k.translate(cxp, cyp); k.scale(rx / ry, 1); const gr = k.createRadialGradient(0, 0, 0, 0, 0, ry);
  for (const [p, m] of [[0, 1], [0.3, 0.8], [0.55, 0.45], [0.8, 0.12], [1, 0]]) gr.addColorStop(p, 'rgba(255,255,255,' + (voima * m) + ')');
  k.globalCompositeOperation = 'lighter'; k.fillStyle = gr; k.fillRect(-ry, -ry, 2 * ry, 2 * ry); k.restore(); };

// Valonlähde itse hehkuu täydellä voimalla (kp 23:46 'light source itemin lightest area on dimmed ... esim lampun lamppu osa'):
// lampun koko kuva-alue leikataan pimeydestä pehmeällä täysvalolla; käsivalolle pieni täysvalo käden korkeudelle.
const hehku = (l) => { let b = null; try { b = l.kalusteId != null ? e.getRoomObjectBoundingRectangle(huone, l.kalusteId, 10, e._activeRoomActiveCanvas)
    : e.getRoomObjectBoundingRectangle(huone, l.id, 100, e._activeRoomActiveCanvas); } catch (x) {}
  if (!b || !b.width) return; const R = tila.resoluutio, kal = l.kalusteId != null;
  const cxp = (b.x + b.width / 2 + rr.left) / R, cyp = (b.y + b.height * (kal ? 0.35 : 0.5) + rr.top) / R;
  const sade = (kal ? Math.max(b.width, b.height) * 0.6 : b.width * 0.3) / R;
  const gr = lx.createRadialGradient(cxp, cyp, 0, cxp, cyp, sade);
  for (const [p, m] of [[0, 1], [0.5, 1], [0.8, 0.5], [1, 0]]) gr.addColorStop(p, 'rgba(255,255,255,' + m + ')');
  lx.globalCompositeOperation = 'lighter'; lx.fillStyle = gr; lx.fillRect(cxp - sade, cyp - sade, 2 * sade, 2 * sade); };

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
    out.push({ x: L.x, y: L.y, z: L.z, v: tila.lamppu, lamppu: o.type, kalusteId: o.id }); }
  return out; };

let raf = 0, viimeVali = null;
const piirra = () => {
  raf = requestAnimationFrame(piirra);
  if (!paalla) return;
  const t0 = performance.now();
  try {
    const cv = kanvas(); if (!cv) return; const kr = asettele(cv);
    const d = tila.dimmeri || {};
    const R = tila.resoluutio, W = Math.max(1, Math.ceil(kr.width / R)), H = Math.max(1, Math.ceil(kr.height / R));
    if (verho.width !== W || verho.height !== H) { verho.width = W; verho.height = H; }
    if (savy.width !== W || savy.height !== H) { savy.width = W; savy.height = H; }
    if (valokartta.width !== W || valokartta.height !== H) { valokartta.width = W; valokartta.height = H; }
    lx.globalCompositeOperation = 'source-over'; lx.clearRect(0, 0, W, H); savyt = [];
    sx.globalCompositeOperation = 'source-over'; sx.clearRect(0, 0, W, H);
    sx.globalAlpha = Math.max(0, Math.min(1, Number(d.voima) || 0)); sx.fillStyle = d.vari || 'rgba(0,0,0,0)'; sx.fillRect(0, 0, W, H); sx.globalAlpha = 1;
    if (!kartta || t0 - kartanAika > 500) { kartta = rakennaKartta(); kartanAika = t0; }
    const c = e._activeRoomActiveCanvas; g = e.getRoomInstanceGeometry(huone, c); rc = e.getRoomInstanceRenderingCanvas(huone, c); rr = { left: 0, top: 0 };   // kerros = huoneen kanvaksen laatikko, joten kanvaksen koordinaatit sellaisenaan
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
      if (l.kalusteId != null || (l.id != null && tila.valot[l.ese])) hehku(l);
      if (l.id != null && tila.vartaloVoima > 0) vartalo(l, tila.vartaloVoima * (v.keila || v.ymparys > tila.ilmanValoa ? 1 : 0.7));
      if (l.oma) {   // oma hahmo näkyy aina vähän: soikio vartalon kohdalle
                const nimi = (tila.valot[l.ese] || {}).nimi; if (nimi !== viimeVali) { viimeVali = nimi; tila.loki.push({ valo: nimi || 'ei valoa', ese: l.ese }); } } }
    const sumennus = 'blur(' + (tila.pehmeys / R).toFixed(1) + 'px)';
    for (const k of [cx, sx]) { k.filter = sumennus; k.globalCompositeOperation = 'destination-out'; k.drawImage(valokartta, 0, 0); k.filter = 'none'; }
    cx.filter = sumennus; cx.globalCompositeOperation = 'source-over'; for (const [lg, p] of savyt) { cx.fillStyle = lg; cx.fill(p); } cx.filter = 'none';
  } catch (x) { tila.loki.push({ virhe: String(x && x.stack || x).slice(0, 300) }); cancelAnimationFrame(raf); }
  tila.mitta = Math.round((performance.now() - t0) * 10) / 10;
};
raf = requestAnimationFrame(piirra);
tila.loki.push({ alku: huone, efektit: paalla ? 'päällä' : 'pois' });

return () => { aktiivinen = false; cancelAnimationFrame(raf); removeEventListener('keydown', kuuleKomento, true);
  kuplaVahti.disconnect(); for (const a of kuplaAjastimet) clearTimeout(a); kuplaAjastimet.clear();
  puraKoukku(); if (typeof queueMicrotask === 'function') queueMicrotask(puraKoukku);
  kerros.remove(); if (window.pimeys === tila) delete window.pimeys; };
