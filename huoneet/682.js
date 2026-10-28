// Huone 682 (Halloween rata 3/6 (ruoka)): piiloalue, joka näkyy vasta kun oma hahmo on siellä.
//
// kp 28.10. 16:43:46 "niin tuo alue minne pääsee kun teleporttaa pitäs näkyä vasta kun sinne pääsee" · 16:44:42 "tehdään scriptillä se
//   jos mahdollista" · 16:44:48 "se on tosi sus wired" · 16:46:17 "robo lattia pitää myös piilottaa sitten".
// Alue = korotettu taso z 26 huoneen vasemmassa reunassa (x 1-6, y 26-39): xmas_c22_woodenfloor-lattiapalat, sänky, keittiö, tuolit,
//   ja teleportin kohde Nuolilaatta 438305 (6,28). Mitattu robolla 28.10. 16:51 (kp:n osoitus #osoita:p:682:-1053,-677,-300,-240
//   on huonepikseleissä ja osuu tason yläosaan; raja on tässä ruutuina, ettei se riipu kamerasta).
// Piilotus kuten hween-wired.js: furniture_wired_opacity 0 + furniture_wired_click_through 1 (FurnitureVisualization.ts:245-258).
//   Ne eivät nollaudu itsestään, joten ajastin vain vaihtaa tilaa kun oma hahmo tulee alueelle tai lähtee sieltä, ja ottaa mukaan
//   myöhemmin lisätyt furnit. Wired-laatikot jätetään hween-wired.js:lle (muuten näyttäminen paljastaisi ne kaikille).
// Lattia: tason oma lattia on huoneen korkeuskarttaa (x 1-6, y 26-39, korkeus 26, ympärillä tyhjää), ei furnia (kp 17:14:57 "oot
//   piilottanu sen alueen tavarat mut et lattiaa"). Se piilotetaan clientin omalla aluepiilolla RoomEngine.updateAreaHide
//   (RoomEngine.ts:665-693 -> lattiareiät RoomPlaneParser.addFloorHole), vain tässä clientissä, 0 pakettia. Reikä osuu vain
//   suorakaiteen olemassa oleviin ruutuihin, ja tässä suorakaiteessa niitä on vain tasolla. REIKA = keksitty furni-id (reikien id:t
//   -(id*10000+i+1)); aluepiilo-widget reagoi vain omaan avoimeen furniinsa. Mitattu robolla 17:20: 14 reikää, taso pois kuvasta.
// 18:10 (kp 17:43:03 "pelaajat kans jotka on siel huonees nii pitäs olla hidden toisilta pelaajilta jotka ei oo siel" · 17:43:13 "viestit
//   menee läpi" · 17:43:35 "jos variable on 3 niin sitten ei piiloteta huonetta enää millää alueella" · 17:52:43 "tästä pitää tulla
//   samanlailla ilmoitus kaikille huoneessa kun joku pääsee läpi" · 17:55:48 "pitää käyttää tätä teleskooppia" · 17:55:54 "ja sit vaan
//   sillä näkee noi zombit" · 17:56:07 overlay · 17:56:15 "seuraa hiirtä" · 17:56:29 "aukee vaan olemalla sen viereisillä ruuduilla ja
//   klikkaamalla sitä" · 17:57:13 "ainoo poikkeus … info kortti oikeessa alakulmassa" · 17:58:50 lapio · 17:59:17 "jakoavain kädessä
//   lapparia ei saa voida ottaa" -> 18:03:37 "korjaus: ei saa pystyy ottaa lapioo jos on jo vetänyt pelin" · 18:04:20-18:04:31 "jos ottaa
//   lapion se työkalu kädessä niin script lähettää :handitem 0 ja näyttää hahmokortissa 'Lapio'" · "se näkyy vaan itelle" · 18:00:07-18:00:41 kaivunappi lapion kuvalla kaivukohdan päälle, vain samassa x,y:ssä):
//   - Hahmojen piilotus: RoomObjectVariable figure_is_muted bitit IGNORED 2 | HIDDEN 4 (ObjectAvatarMutedUpdateMessage.ts:8,11) ->
//     AvatarVisualization palauttaa NO_SPRITES: ei hahmoa, varjoa eikä klikkausaluetta. Asetetaan updateRoomObjectUserAction-
//     reitillä kuten DarkUI:n kuplafix/hiddenUsers.ts:29-32, alkuperäinen arvo palautetaan. Chat-kuplat tulevat silti läpi.
//   - Zombibotit (rentable_bot, nimessä "zombi") ovat piilossa aina, paitsi kaukoputken läpi katsottaessa.
//   - Muuttuja: oma ratoja_tehty luetaan kuten 681.js (7012 [1, oma indeksi] -> 7111); 682:n viite on 442825 (PAIVAKIRJA 27.10. 22:53).
//     ARVAUS: id muotoa 'room:442825' kuten 681:n 'room:442708'; kaikki luetut id:t näkyvät huone682.muuttujat.
// RAJA: koskee vain pelaajia joilla huoneskriptimoottori on päällä. Lapio on vain tämän clientin tieto (palvelin ei anna käsitavaraa).
// Konsolissa: huone682.piilossa · huone682.nakyy · huone682.pakota(true|false|null) · huone682.kaukoputki(true|false) · huone682.lapio(true|false).
const e = window.NitroDevTools && window.NitroDevTools.roomEngine;
const huone = kupla.roomId();
if (!e) return;

const ALUE = { x0: 0, x1: 7, y0: 25, y1: 40, zMin: 20 };
const WIRED = /^wf_(trg|act|cnd|xtra|slc|var)_/;
const REIKA = 6820;
const KAUKOPUTKI = 432401;
const LAPI = [431443, 431429];   // Kaupunki sarake, Kaupunki aita kaukoputken vieressä: klikkaus läpi
const KAIVUT = [432388, 432308, 432379, 432383, 432359, 432385, 432303, 432378, 432304, 432386, 432358, 432387, 432384, 432389, 432381,
  432380, 432377, 432306, 432302, 432374, 432376, 432375, 432357];   // wf_cnd_trggrer_on_frn 439570 (1,14) + 439571 (1,15)
const RATA_MUUTTUJA = 'room:442825', RATA_RAJA = 3;
const MYKKA = 6;   // IGNORED | HIDDEN
const sisalla = (l) => l && l.x >= ALUE.x0 && l.x <= ALUE.x1 && l.y >= ALUE.y0 && l.y <= ALUE.y1 && l.z >= ALUE.zMin;
const tila = window.huone682 = { piilossa: 0, nakyy: false, pakko: null, valmis: false, arvo: null, muuttujat: null, kysytty: 0,
  hahmojaPiilossa: 0, putkiAuki: false, onLapio: false, loki: [], pakota(v) { tila.pakko = v; paivita(); } };
const lokiin = (x) => { x.t = new Date().toTimeString().slice(0, 8); tila.loki.push(x); if (tila.loki.length > 50) tila.loki.shift(); };

const dv = (o, k) => { const d = o && Object.getOwnPropertyDescriptor(o, k); return d && !d.get ? d.value : undefined; };
const istunto = () => { const sm = dv(e, '_roomSessionManager'); return sm && sm.getSession && sm.getSession(huone); };
const omaIndeksi = () => { const s = istunto(); const i = s && s.ownRoomIndex; return (i == null || i < 0) ? null : i; };
const omaHahmo = () => { const i = omaIndeksi(); return i == null ? null : e.getRoomObject(huone, i, 100); };
const omaAlueella = () => { const o = omaHahmo(); return !!(o && sisalla(o.getLocation())); };
const omaNimi = () => String((dv(e, '_sessionDataManager') || {})._name || '');
const kasi = () => { const o = omaHahmo(); try { return (o && o.model.getValue('figure_carry_object')) || 0; } catch (x) { return 0; } };
const yhteys = () => {
  const nahty = new Set(); let c = null;
  const etsi = (o, d) => { if (!o || c || d > 4 || typeof o !== 'object' || nahty.has(o)) return; nahty.add(o);
    if (Object.getOwnPropertyDescriptor(o, '_cryptoState')) { c = o; return; }
    for (const k of Object.getOwnPropertyNames(o)) { const de = Object.getOwnPropertyDescriptor(o, k); if (de && !de.get && de.value && typeof de.value === 'object') etsi(de.value, d + 1); } };
  etsi(dv(e, '_roomSessionManager'), 0); return c;
};
const pois = [];

// ---- Alueen furnit + lattia
const asetettu = new Map();   // furni -> 0 (piilossa) / 1 (näkyy)
const aseta = (o, n) => { if (asetettu.get(o) === n) return; try { o.model.setValue('furniture_wired_opacity', n); o.model.setValue('furniture_wired_click_through', n ? 0 : 1); asetettu.set(o, n); } catch (x) {} };

// ---- Hahmot: alueella olevat muilta + zombit ilman kaukoputkea
const mykat = new Map();   // id -> { o, alkup }
const zombi = (o) => { if (!/bot/i.test(String(o.type || ''))) return false;
  const s = istunto(), ud = s && s.userDataManager, u = ud && ud.getUserDataByIndex && ud.getUserDataByIndex(o.id);
  return !u || !u.name || /zombi/i.test(u.name); };
const mykista = (o, on) => { const m = mykat.get(o.id);
  if (on) {
    if (m && m.o !== o) mykat.delete(o.id);
    let alkup = 0; try { alkup = (mykat.get(o.id) || {}).alkup ?? (o.model.getValue('figure_is_muted') || 0); } catch (x) {}
    if (!mykat.has(o.id)) mykat.set(o.id, { o, alkup });
    let nyt = 0; try { nyt = o.model.getValue('figure_is_muted') || 0; } catch (x) {}
    if ((nyt & MYKKA) !== MYKKA) try { e.updateRoomObjectUserAction(huone, o.id, 'figure_is_muted', alkup | MYKKA); } catch (x) {}
  } else if (m) { mykat.delete(o.id); if (m.o === o) try { e.updateRoomObjectUserAction(huone, o.id, 'figure_is_muted', m.alkup); } catch (x) {} }
};
// Zombibotit: client piilottaa figure_is_muted-lipun (IGNORED|HIDDEN) vain tyypille 'user' (AvatarVisualization.updateIgnoreHiddenState),
//   joten rentable_bot-hahmon visualisointiin asetetaan instanssikohtainen ohitus, joka tyhjentää sprite-listan.
const botit = new Map();   // id -> o
const botPiiloon = (o, on) => { try { const v = o.visualization; if (!v) return;
  if (on) {
    botit.set(o.id, o); v.__piilo682 = true;
    if (!Object.prototype.hasOwnProperty.call(v, 'updateIgnoreHiddenState')) v.updateIgnoreHiddenState = function () { const h = !!this.__piilo682; if (h === this._hiddenByIgnore) return; this._hiddenByIgnore = h; this.updateSpriteCounter++; };
    v.updateIgnoreHiddenState();
  } else {
    if (!botit.has(o.id) && !Object.prototype.hasOwnProperty.call(v, 'updateIgnoreHiddenState')) return;
    botit.delete(o.id); v.__piilo682 = false; v.updateIgnoreHiddenState(); delete v.updateIgnoreHiddenState; delete v.__piilo682;
  }
} catch (x) {} };

const paivita = () => {
  tila.nakyy = tila.pakko == null ? (tila.valmis || omaAlueella()) : !!tila.pakko;
  const n = tila.nakyy ? 1 : 0; let piilossa = 0;
  if (tila.reika !== !n) { try { e.updateAreaHide(huone, REIKA, !n, ALUE.x0, ALUE.y0, ALUE.x1 - ALUE.x0 + 1, ALUE.y1 - ALUE.y0 + 1, false); tila.reika = !n; } catch (x) {} }
  for (const o of e.getRoomObjects(huone, 10) || []) {
    if (!o || !o.model || WIRED.test(String(o.type || '').toLowerCase()) || !sisalla(o.getLocation())) continue;
    aseta(o, n); if (!n) piilossa++;
  }
  tila.piilossa = piilossa;
  // Kaupunki sarake + Kaupunki aita peittävät kaukoputken viereiset ruudut (kp yv 18:38 "noista pitää sit mennä click läpi" · "vaikee kävellä
  //   kaukoputken eteen"): klikkaus läpi, näkyvyys ennallaan. Sama mallikenttä kuin alueen furneilla yllä.
  for (const id of LAPI) { const f = e.getRoomObject(huone, id, 10); if (f && f.model && f.model.getValue('furniture_wired_click_through') !== 1) try { f.model.setValue('furniture_wired_click_through', 1); } catch (x) {} }
  const oma = omaIndeksi(); let h = 0; const nahdyt = new Set();
  for (const o of e.getRoomObjects(huone, 100) || []) {
    if (!o || !o.model || o.id === oma) continue; nahdyt.add(o.id);
    const z = zombi(o), piiloon = z ? !tila.putkiAuki : (String(o.type) === 'user' && !tila.nakyy && sisalla(o.getLocation()));
    if (z) botPiiloon(o, piiloon); else { mykista(o, piiloon); botPiiloon(o, false); } if (piiloon) h++;
  }
  for (const id of [...mykat.keys()]) if (!nahdyt.has(id)) mykat.delete(id);
  for (const id of [...botit.keys()]) if (!nahdyt.has(id)) botit.delete(id);
  tila.hahmojaPiilossa = h;
  putkiTarkista(); lapioTarkista();
};

// ---- Muuttuja: ratoja_tehty >= 3 -> ei piilotusta (sama luku kuin 681.js:n arkku)
let odottaa = 0, koukkuYhteys = null, koukkuOma = null, koukkuAlkup = null;
const koukku = () => {
  const c = yhteys(); if (!c || typeof c.handleMessages !== 'function') return null; if (koukkuYhteys === c) return c;
  const alkup = c.handleMessages;
  const oma = function (...viestit) { try { if (odottaa && Date.now() - odottaa < 5000) {
    const i = omaIndeksi();
    viestit = viestit.filter(v => { const p = v && v.parser;
      if (!p || p.type !== 1 || p.objectId !== i || !Array.isArray(p.values) || !Array.isArray(p.wiredIds)) return true;
      odottaa = 0; tila.muuttujat = p.values.map(x => x && (x.id + '=' + x.value));
      const r = p.values.find(x => x && x.id === RATA_MUUTTUJA); const arvo = r ? r.value : 0;
      tila.arvo = arvo; tila.valmis = arvo >= RATA_RAJA; lokiin({ muuttuja: 'luettu', arvo, valmis: tila.valmis }); paivita(); return false; });
    if (!viestit.length) return; } } catch (x) { lokiin({ muuttuja: 'virhe', viesti: String(x) }); }
    return alkup.apply(this, viestit); };
  c.handleMessages = oma; koukkuYhteys = c; koukkuOma = oma; koukkuAlkup = alkup; return c;
};
const kysy = () => { try {
  const c = koukku(), i = omaIndeksi(); if (!c || i == null || typeof c.sendRawPacket !== 'function') return false;
  odottaa = Date.now(); tila.kysytty++; c.sendRawPacket(7012, [1, i], 'h682'); return true;
} catch (x) { lokiin({ muuttuja: 'virhe', viesti: String(x) }); return false; } };
tila.kysy = kysy;
let kysyYrit = 0;
const kysyAloitus = setInterval(() => { if (kysy() || ++kysyYrit > 30) clearInterval(kysyAloitus); }, 1000);

// ---- Läpäisyilmoitus kaikille (sama kuin 681.js: show_message 443482 "%user% pääsi radan 3 läpi!" näkyvyys 1 kuiskataan jokaiselle)
const MAALI = /^(.+) pääsi radan (\d+) läpi!$/;
const LAPIO = /^Löysit lapion/;
// Wired-viestikuplat pois kun ne eivät kuulu tilanteeseen (kp 18:39 "EDELLEEN tulee 'Näet teleskoopilla …' ennen kaukoputken painamista" ·
//   "tulee heti kun kävelee viereen" · 18:46:39 "ettei tuu uudestaan tää löysit lapion viesti" · "tai scriptiin ei oikeestaan välii"):
//   kaukoputkiviesti vain putken ollessa auki, lapioviesti vain ensimmäisellä kerralla. Wired-viesti on chat-bubble-34 omassa bubble-containerissa.
let piiloLapio = 0;
const KAUKOVIESTI = /Näet teleskoopilla/i;
const kuplaPiiloon = el => { try { const t = el.textContent || '';
  if ((KAUKOVIESTI.test(t) && !tila.putkiAuki) || (/Löysit lapion/.test(t) && Date.now() - piiloLapio < 4000)) { if (el.style.display !== 'none') el.style.display = 'none'; } } catch (x) {} };
// Puhekuplat paikalleen putken ajaksi (kp 18:50:22 "puhekuplat pitäs lukita paikalleen jotenkin kun käyttää kaukoputkea"): chat-widget siirtää
//   kuplia vaakasuunnassa kameran mukana, ja putki panoroi joka hiiren liikkeellä. Putken auetessa jokaisen kuplan style.left talteen ja
//   palautetaan aina kun widget muuttaa sitä; putken aikana syntynyt kupla lukitaan ensimmäiseen paikkaansa. top saa elää (kuplat nousevat).
//   Koko kuplajoukko käydään läpi joka muutoksella: kupla voi syntyä tyhjänä ja saada tekstinsä vasta myöhemmin (18:50 yksi jäi näkyviin).
let kuplaLeft = new WeakMap();
const kuplat = () => { for (const b of document.querySelectorAll('.bubble-container')) { kuplaPiiloon(b);
  if (!tila.putkiAuki) continue; const l = kuplaLeft.get(b); if (l == null) kuplaLeft.set(b, b.style.left); else if (b.style.left !== l) b.style.left = l; } };
const kuplaVahti = new MutationObserver(kuplat);
const viimLapi = new Map();
const laput = new Set();
const banneri = teksti => {
  const d = document.createElement('div'); d.textContent = teksti;
  d.style.cssText = 'position:fixed;left:50%;top:18%;transform:translate(-50%,0);z-index:2147483100;pointer-events:none;font:bold 26px sans-serif;' +
    'color:#fff;text-shadow:0 0 4px #000,0 0 4px #000,2px 2px 0 #000;white-space:nowrap;transition:opacity .6s';
  document.body.appendChild(d); laput.add(d);
  setTimeout(() => { d.style.opacity = '0'; }, 4000); setTimeout(() => { d.remove(); laput.delete(d); }, 4700);
};
const vayla = e.events;
const kuule = ev => { try {
  if (!ev || ev.chatType !== 1 || ev.objectId !== omaIndeksi()) return;
  const viesti = String(ev.message || '').trim();
  if (LAPIO.test(viesti)) { if (tila.onLapio || tila.valmis) { piiloLapio = Date.now(); return; } lapioSaatu(); return; }
  const m = MAALI.exec(viesti); if (!m) return;
  const nyt = Date.now(); if (nyt - (viimLapi.get(m[1]) || 0) < 10000) return; viimLapi.set(m[1], nyt);
  lokiin({ lapi: m[1] }); banneri('☠ ' + m[1] + ' pääsi läpi! ☠');
  if (m[1].toLowerCase() === omaNimi().toLowerCase()) setTimeout(kysy, 1500);
} catch (x) { lokiin({ lapi: 'virhe', viesti: String(x) }); } };

// ---- Kaukoputki: viereisestä ruudusta klikkaus avaa, hiirtä seuraava ympyrä, zombit näkyvät vain sen läpi
let putki = null, hiiri = { x: innerWidth / 2, y: innerHeight / 2 }, viimKlikki = 0, piirto = 0;
const vieressa = () => { const o = omaHahmo(), t = e.getRoomObject(huone, KAUKOPUTKI, 10); if (!o || !t) return false;
  const a = o.getLocation(), b = t.getLocation(); const dx = Math.abs(Math.round(a.x) - Math.round(b.x)), dy = Math.abs(Math.round(a.y) - Math.round(b.y));
  return Math.max(dx, dy) <= 1 && (dx + dy) > 0; };
// Suurennuslasi (kp 18:19:09 "kameran pitäs liikkuu kaukoputken avulla myös" · 18:19:21 "zoomilla ei nyt näe zombeja kun ei voi zoomed in
//   kuvaa liikuttaa sinne zombien luokse" · 18:20 "ei siis pitäs ollenkaa joutuu viemää reunoille" · 18:20:31-44 "draggaa huonetta automaattisesti
//   vastakkaiseen suuntaan" · "kaukoputki silloin on keskitettynä ja zoomattuna ja liikkuu hiiren mukaan kun huone liikkuu"): aukko pysyy ruudun
//   keskellä, ja kamera siirtyy joka hiiren liikkeellä niin, että keskellä näkyy suurennettuna se mikä zoomaamattomassa näkymässä oli hiiren
//   kohdalla. Zoom ZOOM-kertainen ruudun keskeltä -> piste d keskeltä on zoomattuna ZOOM*d:ssä, siirto (keski - hiiri) * ZOOM tuo sen keskelle.
//   Sama offset-kutsu kuin raahaus (RoomEngine.ts:1297). Ei animaatiosilmukkaa: toimii myös piilotetussa välilehdessä.
let panAlku = null;
const panoroi = () => { try {
  if (!panAlku) return;
  const o = e.getRoomInstanceRenderingCanvasOffset(huone, 1); if (!o) return;
  const k = ZOOM, x = panAlku.x + (innerWidth / 2 - hiiri.x) * k, y = panAlku.y + (innerHeight / 2 - hiiri.y) * k;
  if (Math.round(o.x) !== Math.round(x) || Math.round(o.y) !== Math.round(y)) e.setRoomInstanceRenderingCanvasOffset(huone, 1, new o.constructor(x, y));
} catch (x) { lokiin({ panVirhe: String(x) }); } };
const piirra = () => { piirto = 0; if (!putki) return;
  const c = putki, g = c.getContext('2d'), w = innerWidth, h = innerHeight, d = devicePixelRatio || 1;
  if (c.width !== Math.round(w * d) || c.height !== Math.round(h * d)) { c.width = Math.round(w * d); c.height = Math.round(h * d); }
  g.setTransform(d, 0, 0, d, 0, 0); g.globalCompositeOperation = 'source-over'; g.clearRect(0, 0, w, h);
  const R = Math.max(90, Math.min(170, Math.min(w, h) * 0.2)), x = w / 2, y = h / 2;
  g.fillStyle = 'rgba(4,4,8,0.97)'; g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.arc(x, y, R, 0, Math.PI * 2); g.fill();
  g.globalCompositeOperation = 'source-over';
  // Lens: cool tint over the aperture, then the existing dark vignette at the edge
  const t = g.createRadialGradient(x, y, 0, x, y, R); t.addColorStop(0, 'rgba(180,210,255,0.04)'); t.addColorStop(1, 'rgba(120,150,200,0.10)');
  g.fillStyle = t; g.beginPath(); g.arc(x, y, R, 0, Math.PI * 2); g.fill();
  const v = g.createRadialGradient(x, y, R * 0.55, x, y, R); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.55)');
  g.fillStyle = v; g.beginPath(); g.arc(x, y, R, 0, Math.PI * 2); g.fill();
  // Glass reflections, clipped to the aperture: soft arc upper-left, small glint, faint reflection lower-right
  g.save(); g.beginPath(); g.arc(x, y, R, 0, Math.PI * 2); g.clip();
  const hl = g.createLinearGradient(x - R * 0.57, y - R * 0.57, x, y); hl.addColorStop(0, 'rgba(255,255,255,0.18)'); hl.addColorStop(1, 'rgba(255,255,255,0)');
  g.lineCap = 'round'; g.lineWidth = R * 0.16; g.strokeStyle = hl; g.beginPath(); g.arc(x, y, R * 0.8, Math.PI * 1.1, Math.PI * 1.5); g.stroke();
  g.lineWidth = R * 0.06; g.strokeStyle = 'rgba(255,255,255,0.06)'; g.beginPath(); g.arc(x, y, R * 0.82, Math.PI * 0.15, Math.PI * 0.5); g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.arc(x - R * 0.42, y - R * 0.42, R * 0.06, 0, Math.PI * 2); g.fill();
  g.restore();
  // Brass tube rim: thick metallic ring just outside the aperture (inner edge at R), dark inner lip, two bright band lines
  const ro = R * 1.12, rg = g.createLinearGradient(x - ro, y - ro, x + ro, y + ro);
  rg.addColorStop(0, '#4a3415'); rg.addColorStop(0.35, '#d8b062'); rg.addColorStop(0.65, '#7a5a24'); rg.addColorStop(1, '#3a2810');
  g.lineWidth = R * 0.12; g.strokeStyle = rg; g.beginPath(); g.arc(x, y, R + R * 0.06, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,0.6)'; g.beginPath(); g.arc(x, y, R + 1, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 1; g.strokeStyle = 'rgba(255,230,170,0.45)';
  g.beginPath(); g.arc(x, y, R + R * 0.03, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.arc(x, y, R + R * 0.11, 0, Math.PI * 2); g.stroke();
  // Small centre mark (clicks go to the exact centre): plus with a 3 px gap, dark outline under a light stroke
  g.beginPath(); g.moveTo(x - 13, y); g.lineTo(x - 3, y); g.moveTo(x + 3, y); g.lineTo(x + 13, y);
  g.moveTo(x, y - 13); g.lineTo(x, y - 3); g.moveTo(x, y + 3); g.lineTo(x, y + 13);
  g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,0.5)'; g.stroke();
  g.lineWidth = 1.5; g.strokeStyle = 'rgba(255,255,255,0.55)'; g.stroke();
  // Infostand-kortit viimeisenä läpi, ettei messinkikehä tai lasi peitä niitä
  g.globalCompositeOperation = 'destination-out';
  for (const el of document.querySelectorAll('.nitro-infostand-container')) { const r = el.getBoundingClientRect(); if (r.width && r.height) g.fillRect(r.left - 4, r.top - 4, r.width + 8, r.height + 8); }
  g.globalCompositeOperation = 'source-over';
  g.font = '13px sans-serif'; g.textAlign = 'center'; g.fillStyle = 'rgba(255,255,255,0.55)'; g.fillText('Esc tai kävele pois sulkee', w / 2, h - 18);
};
const pyyda = () => { if (!piirto) piirto = requestAnimationFrame(piirra); };
// Hiiri lukitaan putkeen (Pointer Lock, kp 18:40-18:41 "hiiri näkyy edelleen … chat input alueelle" · "ei voi painaa zombeja kun hiiri on
//   sellasella kielletyllä alueella" · "hiiri voi töksähtää edelleen ruudun reunoihin vaikka se ei näy"): lukittuna kursoria ei ole lainkaan,
//   liike tulee movementX/Y:nä eikä ruudun reuna rajoita, ja kaikki klikkaukset osuvat putkeen -> keskelle. Raja ±1,5 ruutua ettei kamera karkaa.
const lukittu = () => putki && document.pointerLockElement === putki;
const liike = ev => {
  if (lukittu()) { const w = innerWidth, h = innerHeight;
    hiiri = { x: Math.max(-w, Math.min(2 * w, hiiri.x + (ev.movementX || 0))), y: Math.max(-h, Math.min(2 * h, hiiri.y + (ev.movementY || 0))) }; }
  else hiiri = { x: ev.clientX, y: ev.clientY };
  if (putki) { panoroi(); pyyda(); } };
// Esc vapauttaa lukon selaimen puolella eikä keydownia tule, joten lukon katoaminen sulkee putken.
let oliLukittu = false;
const lukko = () => { if (lukittu()) oliLukittu = true; else if (oliLukittu) { oliLukittu = false; if (putki) kaukoputki(false); } };
const nappain = ev => { if (ev.key === 'Escape' && putki) kaukoputki(false); };
// Klikkaus aukon keskelle (kp 18:35:42 "aukon keskiosalla pitää pystyy click" · 18:36:28 "se ruksi voidaa pitää et voi click"): kursori on
//   piilossa ja missä tahansa, joten huonekanvakselle tuleva oikea painallus pysäytetään ja lähetetään uudestaan ruudun keskeltä. preventDefault
//   pointerdownissa estää selaimen omat mousedown/up-tapahtumat, joten ne lähetetään itse samaan kohtaan. UI-elementit (infokortti, napit) eivät
//   ole kanvaksia, joten niihin klikkaus menee normaalisti.
const KESKELLE = { pointerdown: ['pointerdown', 'mousedown'], pointerup: ['pointerup', 'mouseup'], click: ['click'] };
//   Ylös ja click ohjataan vain jos saman painalluksen alas ohjattiin: putken avannut painallus (alas ennen avausta) ei saa päästää irti keskeltä.
let ohjattu = false;
const keskelle = ev => { try {
  if (!putki || !ev.isTrusted || !(ev.target instanceof HTMLCanvasElement)) return;
  if (ev.type === 'pointerdown') ohjattu = true; else if (!ohjattu) return; else if (ev.type === 'click') ohjattu = false;
  ev.stopImmediatePropagation(); ev.preventDefault();
  const x = innerWidth / 2, y = innerHeight / 2;
  // Putki itse ottaa klikkaukset (kursori piilossa kaikkialla): kohde on se mikä on keskellä putken alla.
  let kohde = ev.target;
  if (kohde === putki) { putki.style.pointerEvents = 'none'; kohde = document.elementFromPoint(x, y); putki.style.pointerEvents = 'auto'; if (!kohde) return; }
  const s = { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, screenX: x, screenY: y,
    button: ev.button, buttons: ev.buttons, ctrlKey: ev.ctrlKey, shiftKey: ev.shiftKey, altKey: ev.altKey, metaKey: ev.metaKey, view: window };
  for (const t of KESKELLE[ev.type]) kohde.dispatchEvent(t.startsWith('pointer')
    ? new PointerEvent(t, { ...s, pointerId: ev.pointerId, pointerType: ev.pointerType, isPrimary: ev.isPrimary }) : new MouseEvent(t, s));
} catch (x) { lokiin({ klikkiVirhe: String(x) }); } };
// Zoom 2 avatessa, edellinen takaisin suljettaessa (kp 18:10-18:13:56 "kaukoputkeen jonkun zoomin" · "zoom 2 ois hyvä" · "avaamiseen").
//   Sama kutsu kuin :zoom 2 (useChatInputWidget.ts:111 -> RoomWidgetsView.tsx:23 -> RoomEngine.ts:472).
const ZOOM = 2;
let zoomEnnen = null;
const zoomaa = (on) => { try {
  if (on) { const o = e.getRoomInstanceRenderingCanvasOffset(huone, 1); zoomEnnen = { s: e.getRoomInstanceRenderingCanvasScale(huone, 1), o };
    e.setRoomInstanceRenderingCanvasScale(huone, 1, ZOOM);
    const z = e.getRoomInstanceRenderingCanvasOffset(huone, 1); panAlku = z ? { x: z.x, y: z.y } : null; panoroi(); }
  else if (zoomEnnen != null) { e.setRoomInstanceRenderingCanvasScale(huone, 1, zoomEnnen.s);
    if (zoomEnnen.o) e.setRoomInstanceRenderingCanvasOffset(huone, 1, zoomEnnen.o); zoomEnnen = null; panAlku = null; }
} catch (x) { lokiin({ zoomVirhe: String(x) }); } };
// Kursori piiloon putken ajaksi (kp 18:34:21 "hiiri elää omaa elämäänsä kaukoputki overlayssa, ei oo enää hidden"): aukko on keskellä, joten
//   näkyvä kursori harhailisi mustan päällä.
let kursori = null;
const kaukoputki = (on) => {
  if (on && !putki) {
    putki = document.createElement('canvas');
    putki.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vh;z-index:2147483000;pointer-events:auto;cursor:none';
    kursori = document.createElement('style'); kursori.textContent = 'canvas{cursor:none!important}'; document.head.appendChild(kursori);
    document.body.appendChild(putki); tila.putkiAuki = true; zoomaa(true); lokiin({ kaukoputki: 'auki' }); paivita(); pyyda();
    try { const p = putki.requestPointerLock(); if (p && p.catch) p.catch(x => lokiin({ lukko: 'ei: ' + String(x).slice(0, 80) })); } catch (x) { lokiin({ lukko: 'ei: ' + String(x).slice(0, 80) }); }
  } else if (!on && putki) { const p0 = putki; if (document.pointerLockElement === p0) try { document.exitPointerLock(); } catch (x) {}
    oliLukittu = false; kuplaLeft = new WeakMap(); putki.remove(); putki = null; if (kursori) { kursori.remove(); kursori = null; } tila.putkiAuki = false; zoomaa(false); lokiin({ kaukoputki: 'kiinni' }); paivita(); }
};
tila.kaukoputki = kaukoputki;
const putkiTarkista = () => { if (putki) { if (!vieressa()) kaukoputki(false); else pyyda(); } };
const valittu = ev => { try {
  if (!ev || ev.objectId !== KAUKOPUTKI || ev.category !== 10) return;
  const nyt = Date.now(); if (nyt - viimKlikki < 350) return; viimKlikki = nyt;
  if (putki) kaukoputki(false); else if (vieressa()) kaukoputki(true);
} catch (x) {} };

// ---- Lapio: "Löysit lapion!" -> käsitavara "Lapio" omassa infokortissa + kaivunappi kaivukohdan päällä
const AVAIN = 'h682.lapio';
try { tila.onLapio = sessionStorage.getItem(AVAIN) === '1'; } catch (x) {}
const lapio = (on) => { tila.onLapio = !!on; try { on ? sessionStorage.setItem(AVAIN, '1') : sessionStorage.removeItem(AVAIN); } catch (x) {} lapioTarkista(); };
tila.lapio = lapio;
let lapioAika = 0;
const lapioSaatu = () => {
  if (tila.valmis) { lokiin({ lapio: 'ei, rata jo läpäisty' }); return; }
  const k = kasi(); lapioAika = Date.now();
  if (k) { try { const s = istunto(); s && s.sendChatMessage && s.sendChatMessage(':handitem 0', 0); } catch (x) {} lokiin({ lapio: 'kädessä ' + k + ' -> :handitem 0' }); }
  lokiin({ lapio: 'saatu' }); lapio(true); };
const LAPIO_SVG = '<svg viewBox="0 0 32 32" width="26" height="26"><g transform="rotate(-35 16 16)"><rect x="10" y="1.5" width="12" height="4" rx="2" fill="#8a5a2b" stroke="#222" stroke-width="1.2"/><rect x="14.5" y="4" width="3" height="14" fill="#a06a35" stroke="#222" stroke-width="1.2"/><rect x="13.5" y="17" width="5" height="3" fill="#888" stroke="#222" stroke-width="1"/><path d="M9 20h14v4c0 4-3 7-7 7s-7-3-7-7z" fill="#cfd3d6" stroke="#222" stroke-width="1.4" stroke-linejoin="round"/></g></svg>';
let nappi = null;
const kaivu = () => { try { const s = istunto(); if (s && s.sendChatMessage) { s.sendChatMessage('dig', 0); lokiin({ kaivu: 'dig' }); } } catch (x) { lokiin({ kaivu: 'virhe', viesti: String(x) }); } };
const kangas = () => { let b = null, a = 0; for (const c of document.querySelectorAll('canvas')) { if (c === putki) continue; const r = c.getBoundingClientRect(); if (r.width * r.height > a) { a = r.width * r.height; b = r; } } return b; };
const koko = f => { try { const m = f.model, d = f.getDirection(), sx = m.getValue('furniture_size_x') || 1, sy = m.getValue('furniture_size_y') || 1;
  return d && Math.round(d.x) % 180 === 90 ? [sy, sx] : [sx, sy]; } catch (x) { return [1, 1]; } };
const lapioTarkista = () => {
  if (tila.onLapio && Date.now() - lapioAika > 3000) { const k = kasi(); if (k) { lokiin({ lapio: 'pois, kädessä ' + k }); tila.onLapio = false; try { sessionStorage.removeItem(AVAIN); } catch (x) {} } }
  // käsitavara omaan infokorttiin (palvelin ei tiedä lapiosta)
  const nimi = omaNimi();
  for (const el of document.querySelectorAll('.nitro-infostand')) {
    const oma = nimi && [...el.querySelectorAll('*')].some(x => x.children.length === 0 && x.textContent.trim() === nimi);
    const rivi = el.querySelector('.h682-lapio');
    if (tila.onLapio && oma && !rivi) { const r = document.createElement('div'); r.className = 'h682-lapio text-white small';
      r.style.cssText = 'border-top:1px solid rgba(255,255,255,.25);margin-top:4px;padding-top:4px;font-size:12px'; r.textContent = 'Kädessä: Lapio'; el.appendChild(r); }
    else if (rivi && !(tila.onLapio && oma)) rivi.remove();
  }
  // kaivunappi: kun oma hahmo seisoo millä tahansa kaivukohdan ruudulla (furni voi olla 2x1, käännettynä mitat vaihtuvat)
  let kohde = null, kohdeKoko = [1, 1]; const o = omaHahmo();
  if (tila.onLapio && o) { const l = o.getLocation(), x = Math.round(l.x), y = Math.round(l.y);
    for (const id of KAIVUT) { const f = e.getRoomObject(huone, id, 10); if (!f) continue; const fl = f.getLocation(), fx = Math.round(fl.x), fy = Math.round(fl.y), [sx, sy] = koko(f);
      if (x >= fx && x < fx + sx && y >= fy && y < fy + sy) { kohde = id; kohdeKoko = [sx, sy]; break; } } }
  if (!kohde) { if (nappi) { nappi.remove(); nappi = null; } return; }
  let p = null; try { p = e.getRoomObjectScreenLocation(huone, kohde, 10); } catch (x) {}
  if (!p) return; const r = kangas() || { left: 0, top: 0 };
  if (!nappi) { nappi = document.createElement('button'); nappi.type = 'button'; nappi.title = 'Kaiva'; nappi.innerHTML = LAPIO_SVG;
    nappi.style.cssText = 'position:fixed;z-index:2147482000;width:40px;height:40px;border-radius:50%;border:2px solid #222;background:rgba(240,220,170,.95);' +
      'display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0;transform:translate(-50%,-100%);box-shadow:0 2px 6px rgba(0,0,0,.5)';
    nappi.addEventListener('mousedown', ev => ev.stopPropagation()); nappi.addEventListener('click', ev => { ev.stopPropagation(); kaivu(); });
    document.body.appendChild(nappi); }
  // furnin keskelle: ruutu (dx,dy) on ruudulla ((dx-dy)*32, (dx+dy)*16) * skaala
  let k = 1; try { k = e.getRoomInstanceRenderingCanvasScale(huone, 1) || 1; } catch (x) {}
  const dx = (kohdeKoko[0] - 1) / 2, dy = (kohdeKoko[1] - 1) / 2;
  nappi.style.left = (r.left + p.x + (dx - dy) * 32 * k) + 'px'; nappi.style.top = (r.top + p.y + (dx + dy) * 16 * k - 30) + 'px';
};

if (vayla && vayla.addEventListener) {
  vayla.addEventListener('RSCE_CHAT_EVENT', kuule); pois.push(() => vayla.removeEventListener('RSCE_CHAT_EVENT', kuule));
  vayla.addEventListener('REOE_SELECTED', valittu); pois.push(() => vayla.removeEventListener('REOE_SELECTED', valittu));
} else lokiin({ vayla: 'roomEngine.events puuttuu' });
for (const t of Object.keys(KESKELLE)) { window.addEventListener(t, keskelle, true); pois.push(() => window.removeEventListener(t, keskelle, true)); }
document.addEventListener('pointermove', liike, { capture: true, passive: true }); pois.push(() => document.removeEventListener('pointermove', liike, { capture: true }));
kuplaVahti.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['style'] }); pois.push(() => kuplaVahti.disconnect());
document.addEventListener('pointerlockchange', lukko); pois.push(() => document.removeEventListener('pointerlockchange', lukko));
document.addEventListener('keydown', nappain, true); pois.push(() => document.removeEventListener('keydown', nappain, true));
window.addEventListener('resize', pyyda); pois.push(() => window.removeEventListener('resize', pyyda));

paivita();
const ajastin = setInterval(paivita, 250);

return () => {
  clearInterval(ajastin); clearInterval(kysyAloitus);
  for (const f of pois) try { f(); } catch (x) {}
  kaukoputki(false); if (piirto) cancelAnimationFrame(piirto);
  if (nappi) nappi.remove(); for (const el of document.querySelectorAll('.h682-lapio')) el.remove();
  for (const d of laput) d.remove();
  if (koukkuYhteys && koukkuYhteys.handleMessages === koukkuOma) koukkuYhteys.handleMessages = koukkuAlkup;
  try { e.updateAreaHide(huone, REIKA, false, 0, 0, 0, 0, false); } catch (x) {}
  for (const id of LAPI) try { const f = e.getRoomObject(huone, id, 10); if (f && f.model) f.model.setValue('furniture_wired_click_through', 0); } catch (x) {}
  for (const o of asetettu.keys()) try { o.model.setValue('furniture_wired_opacity', 1); o.model.setValue('furniture_wired_click_through', 0); } catch (x) {}
  for (const [id, m] of mykat) try { e.updateRoomObjectUserAction(huone, id, 'figure_is_muted', m.alkup); } catch (x) {}
  for (const o of [...botit.values()]) botPiiloon(o, false);
  if (window.huone682 === tila) delete window.huone682;
};
