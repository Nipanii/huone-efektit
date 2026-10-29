// Huone 683 (Halloween rata 4/6): tyhjä pohja huonekohtaisille efekteille.
// kp 28.10. 16:02:08 "luo tyhjä pohja event huoneille joilla ei vielä ole". Wired-piilotus on erikseen huoneet/hween-wired.js.
// Moottori ajaa tämän new Function('kupla', koodi)(api) huoneeseen tullessa ja kutsuu palautettua funktiota kun huoneesta lähdetään.
//   kupla.roomId() = tämä huone. Mallit: huoneet/681.js (miinat), huoneet/684.js (pimeys), huoneet/656.js (auto).
//
// Sonan inventaario (kankainen pussi). sona 29.10. 14:31-14:32 "Tässä huoneessa on kankainen pussi. Se vois olla inventaario." · "tilaa vaikka 3
//   inventario itemille" · "pussista ei saada mitään, vaan pelaaja saa pussin itsessään joka on se inventario" · "Näkyisi vain tässä huoneessa
//   sen jälkeen kun on klikannut itemiä 'kankainen pussi'". Mitkä esineet pussiin menevät, päätetään myöhemmin -> tässä vain pussi, 3 paikkaa ja API.
//   - Klikkaus furniin PUSSI (REOE_SELECTED, kuten 682.js:487-489) = pelaaja "saa pussin": ruudun keskelle tulee tumma paneeli (pussin kuva + "Pussi"),
//     jossa 3 tyhjää paikkaa. Paneelin voi raahata otsikosta (sona 14:52:59); raahaus ei liikuta hahmoa. Furni jää huoneeseen (muutkin saavat oman pussinsa); mitään ei poisteta eikä lähetetä palvelimelle.
//   - Paneeli näkyy vain tässä huoneessa (moottori pysäyttää skriptin huoneesta lähtiessä, siivous poistaa paneelin) ja vain jos pussi on otettu.
//   - EI pysyvyyttä (sona 29.10. 14:42:21, kp:n kysymykseen "pitääkö esineiden pysyä inventoorissa jos käy huoneesta poissa?": "ei"): pussi ja
//     paikat ovat vain muistissa, huoneesta lähtiessä siivous nollaa kaiken ja huoneeseen tullessa pussi pitää ottaa uudestaan. Ei localStorageä.
//   - Pussin tunnistus: furni-id 444838 (sona Osoita "#osoita:r683:f444838"); varalle luokka hp_sack (FurnitureData "Kankainen pussi").
//   - Akku (sona 29.10. 14:42:56 "Sen jälkeen kun pussi on saatu. Pelaaja voi noutaa ambulanssiin astuessa akun."): kun oma hahmo astuu ambulanssin
//     (furni 434093) ruutuihin ja pussi on, tulee "Akku" pussiin (kuva easter_c23_battery_icon). Ilman pussia: ei mitään (kp 15:17: ilmoitus olisi spoileri).
//     Ruudut luetaan joka tarkistuksessa huoneen objektista (sijainti, furniture_size_x/y, kierto); jos ei luettavissa, varafallback 5,15 1x1 ja console.warn kerran.
// Konsolissa / myöhemmille pulma-askelille: window.kupla683 =
//   .lisaa(nimi, kuvaUrl?)  ensimmäiseen vapaaseen paikkaan; palauttaa paikan (0-2), -1 jos täynnä; sama nimi uudestaan palauttaa vanhan paikan
//   .poista(nimi) true jos oli · .tavarat() [{nimi, kuva}] · .onPussi() · .anna() anna pussi (testi) · .nollaa() pussi ja tavarat pois · .loki
//   Tavarat voi lisätä myös ennen pussin ottoa (paneeli ei vielä näy). kuvaUrl vain http(s):// tai data:image/, muuten paikkaan tulee nimen alku.
// VARIANTIT (kp 29.10.): window.kupla683.variantti(n) vaihtaa pussin ulkoasun (1, 2 tai 3), variantti() palauttaa nykyisen. Vain piirto vaihtuu: sisältö ja "pussi otettu" pysyvät.
//   Alkuvariantti = window.huoneskriptit.pussiVariantti (moottorin `:pussi N` asettaa sen ja kutsuu variantti(N)); puuttuu -> 1.
//   1 = sonan tumma paneeli (yllä, ei muutu). 2 = "iso säkki": huonespriitti 57x57 4x-suurennuksena, tavarat sen sisällä (opacity .62), kapea otsikko "Pussi" + ×.
//   3 = "infostand-kortti": pelin oman furni-infostandin tyyli (client/Nitro-V3/src/components/room/widgets/avatar-info/infostand/InfoStandWidgetFurniView.tsx:540 ja Text.tsx),
//       keskitetty otsikko, säkin kuva ja 3 paikkaa. × kutistaa kortin PILLERIKSI (säkin kuva); pillerin napautus avaa kortin niin että kortin säkkikuva osuu pillerin säkkikuvan päälle
//       (ei ulos ruudulta: siirretään vähimmäismäärä). 2:n × käyttää samaa pilleriä. Kortti, ikkuna ja pilleri raahattavissa (pointer-tapahtumat, touch-action:none).
//   z-index 300 (v2/v3/pilleri): yli työkalupalkin (70/71), huonetyökalujen (71/72) ja infostandin (30), alle DraggableWindow-ikkunoiden (401+, Messenger jne.). Variantti 1 pysyy 1000:ssa.
// EPÄVARMAA LIVENÄ (vain offline-testattu): REOE_SELECTED ei ehkä laukea jos pussi on jo valittuna skriptin käynnistyessä (valitse jokin muu ja klikkaa
//   pussia uudestaan) · paneeli voi peittää pelin ikkunoita (raahattavissa) · z-index 1000 on arvaus pelin omien ikkunoiden suhteen · pussin kuva ja koko (2x) arvattu, ei mitattu.
const e = window.NitroDevTools && window.NitroDevTools.roomEngine;
const huone = kupla.roomId();
if (!e) return;

// ---- ASETUKSET. Pussin tunnistus: id ensisijainen, luokka varalle jos furni vaihtuu (nostettu ja laskettu uudelleen = uusi id).
const PUSSI = { id: 444838, tyyppi: 'hp_sack' };   // tyyppi = classname (FurnitureData id 29109676 "Kankainen pussi"); o.type on luokan nimi (656.js IKKUNA, hween-wired WIRED)
const AMBULANSSI = { id: 434093, x: 5, y: 15 };   // hween_c25_ambulance, lattiafurni. x,y = varafallback, oikea sijainti ja koko luetaan huoneen objektista
const AMBULANSSI_VALI = 250;                      // ms, oman hahmon ruudun tarkistus
const AKKU = 'Akku', AKKU_KUVA = 'https://nipanii.github.io/huone-efektit/kuvat/683-akku.png';   // auton akku pikselitaiteena (sona 15:20:57), Gemini-kuva, tausta poistettu
const PAIKKOJA = 3;
const PANEELI = { z: 1000 };   // keskellä ruutua kun pussi otetaan; raahataan otsikosta (ei peitä pelin ikkunoita pysyvästi: rajataan ikkunaan)
const PUSSI_KUVA = 'https://kupla.cc/swf/dcr/hof_furni/icons/hp_sack_icon.png';
// Varianttien 2 ja 3 pussikuva: huonespriitti hp_sack_64_a_2_0, 57x57 px (hp_sack-64.png, kupla.cc/nitro-assets/bundled/furniture2test1/hp_sack.nitro).
const SAEKKI_URI = 'data:image/png;base64,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', SAEKKI_PX = 57;
const V2_SKAALA = 4, V2_PAIKAT = [[22, 8, 2], [14, 28, 2], [37, 12, 3]];   // v2: säkin skaala; tavaran vasen yläkulma spriitin pikseleinä + tavaran suurennus (kp:n mock)
const V23_Z = 300, PILLI_PAD = 4;   // z: katso otsikko; PILLI_PAD = pillerin sisäreunus, josta säkkikuvan paikka pillerissä lasketaan
const POIMINTA_TEKSTI = 'Otit pussin ja voit nyt kerätä tavaroita siihen.', POIMINTA_MS = 8000;   // sona 15:18:39: 8 s

const vayla = e.events;
const loki = [];
const lokiin = (x) => { x.t = new Date().toTimeString().slice(0, 8); loki.push(x); if (loki.length > 50) loki.shift(); };

// ---- tila (vain muistissa: skripti käynnistyy joka huoneeseen tullessa, joten alkutila on aina "ei pussia, tyhjät paikat")
let pussi = false, paikat = new Array(PAIKKOJA).fill(null);
const kuvaKelpaa = (u) => typeof u === 'string' && /^(https?:\/\/|data:image\/)/i.test(u);
const siisti = (x) => (x && typeof x.nimi === 'string' && x.nimi) ? { nimi: x.nimi.slice(0, 60), kuva: kuvaKelpaa(x.kuva) ? x.kuva : '' } : null;

// ---- paneeli (tumma, pieni, ei peitä huonetta)
let paneeli = null, ruudut = [], vedto = null, otsikko = null;   // vedto = käynnissä oleva raahaus (pointerId + siirtymä)
// Raahaus otsikosta pointer-tapahtumilla (hiiri, kosketus, kynä). setPointerCapture pitää tapahtumat otsikolla, vaikka sormi lähtee sen päältä.
// Paneeli pysyy kokonaan ikkunan sisällä. Otsikon pointerdown ei mene pelille (stopPropagation). touch-action:none estää selaimen vierityksen raahauksen aikana.
const siirra = (ev) => { if (!vedto || !paneeli || ev.pointerId !== vedto.id) return;
  const w = paneeli.offsetWidth || 0, h = paneeli.offsetHeight || 0, iw = window.innerWidth || 0, ih = window.innerHeight || 0;
  const x = Math.min(Math.max(0, ev.clientX - vedto.dx), Math.max(0, iw - w)), y = Math.min(Math.max(0, ev.clientY - vedto.dy), Math.max(0, ih - h));
  paneeli.style.left = x + 'px'; paneeli.style.top = y + 'px'; };
const lopeta = (ev) => { if (!vedto || (ev && ev.pointerId !== undefined && ev.pointerId !== vedto.id)) return; vedto = null; };
// Koko: ruudut 60 px, alle 600 px leveällä ruudussa suhteessa (ruutu 320 px -> 32 px). Paneeli max 92vw (CSS).
const NIMI_K = 16;   // v1 nimirivin korkeus px (sona 15:28:08)
const mitat = () => { const k = Math.min(1, (window.innerWidth || 1024) / 600); return { ruutu: Math.round(60 * k), kuva: Math.round(32 * k) }; };
const rakennaPaneeli = () => {
  if (paneeli) return;
  paneeli = document.createElement('div'); paneeli.className = 'h683-pussi';
  const m = mitat();
  paneeli.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:' + PANEELI.z + ';padding:8px 10px 10px;max-width:92vw;box-sizing:border-box;'
    + 'background:rgba(20,17,26,.92);border:1px solid #4b3f5e;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,.55);font:13px sans-serif;color:#cfc6dc;user-select:none';
  const ots = document.createElement('div'); ots.className = 'h683-otsikko';
  ots.style.cssText = 'display:flex;align-items:center;gap:6px;margin:0 0 6px 2px;font-weight:bold;letter-spacing:.5px;color:#d9a35b;cursor:move;touch-action:none';
  const kuva = document.createElement('img'); kuva.src = PUSSI_KUVA; kuva.alt = ''; kuva.draggable = false;
  kuva.style.cssText = 'height:' + m.kuva + 'px;width:auto;image-rendering:pixelated;pointer-events:none';
  const otsTeksti = document.createElement('span'); otsTeksti.textContent = 'Pussi';
  ots.appendChild(kuva); ots.appendChild(otsTeksti);
  ots.addEventListener('pointerdown', (ev) => { ev.stopPropagation(); if (ev.button && ev.button !== 0) return;
    const r0 = paneeli.getBoundingClientRect ? paneeli.getBoundingClientRect() : { left: 0, top: 0 };
    vedto = { id: ev.pointerId, dx: ev.clientX - r0.left, dy: ev.clientY - r0.top };
    paneeli.style.left = r0.left + 'px'; paneeli.style.top = r0.top + 'px'; paneeli.style.transform = 'none';
    if (ots.setPointerCapture) try { ots.setPointerCapture(ev.pointerId); } catch (x) {} });
  ots.addEventListener('pointermove', siirra);
  ots.addEventListener('pointerup', lopeta);
  ots.addEventListener('pointercancel', lopeta);
  ots.addEventListener('lostpointercapture', lopeta);
  otsikko = ots;
  const rivi = document.createElement('div'); rivi.style.cssText = 'display:flex;gap:8px';
  ruudut = [];
  for (let i = 0; i < PAIKKOJA; i++) {
    const r = document.createElement('div');
    // sona 15:28:08: esineen nimi kuvan alle, ikkuna saa kasvaa hieman -> ruutu on sarake: kuva + NIMI_K px nimirivi
    r.style.cssText = 'width:' + (m.ruutu + 12) + 'px;height:' + (m.ruutu + NIMI_K) + 'px;box-sizing:border-box;display:flex;flex-direction:column;align-items:center;justify-content:center;overflow:hidden;padding:3px 2px 2px;'
      + 'background:#0c0a10;border:1px solid #3a3148;border-radius:6px;text-align:center;font-size:12px;line-height:13px;word-break:break-all';
    rivi.appendChild(r); ruudut.push(r);
  }
  paneeli.appendChild(ots); paneeli.appendChild(rivi);
  // Klikkaus paneeliin ei saa mennä pelille (muuten hahmo kävelee), kuten 682.js:479 nappi.
  for (const t of ['mousedown', 'pointerdown', 'mouseup', 'pointerup', 'click', 'dblclick', 'contextmenu']) paneeli.addEventListener(t, ev => ev.stopPropagation());
  document.body.appendChild(paneeli);
};
const poistaV1 = () => { if (paneeli) { paneeli.remove(); paneeli = null; ruudut = []; vedto = null; } };
const piirraV1 = () => {
  rakennaPaneeli();
  for (let i = 0; i < PAIKKOJA; i++) {
    const r = ruudut[i], t = paikat[i]; r.textContent = ''; r.title = t ? t.nimi : '';
    r.style.borderColor = t ? '#7d6a9a' : '#3a3148';
    if (!t) continue;
    if (t.kuva) { const im = document.createElement('img'); im.src = t.kuva; im.alt = t.nimi; im.draggable = false;
      im.style.cssText = 'max-width:100%;max-height:calc(100% - ' + NIMI_K + 'px);min-height:0;flex:1 1 auto;object-fit:contain;image-rendering:pixelated'; r.appendChild(im);
      const nm = document.createElement('div'); nm.className = 'h683-nimi'; nm.textContent = t.nimi;
      nm.style.cssText = 'flex:none;width:100%;margin-top:2px;font:bold 11px sans-serif;line-height:13px;color:#e6dcf5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;word-break:normal';
      r.appendChild(nm); }
    else r.textContent = t.nimi.slice(0, 8);
  }
};

// ---- variantit 2 ja 3 (kp:n mallit). Variantti 1 (yllä) ei käytä mitään tästä.
const alkuV = Number(window.huoneskriptit && window.huoneskriptit.pussiVariantti);
let variantti = (alkuV === 2 || alkuV === 3) ? alkuV : 1;
let ikk2 = null, v2kerros = null, v2kuva = null, kortti = null, kortKuva = null, v3ruudut = [], pilli = null;
let kiinni = false, ankkuri = null, avaaAnkkuriin = null;   // kiinni = v2/v3 kutistettu pillerille; ankkuri = säkkikuvan vasen yläkulma ruudulla; avaaAnkkuriin = kertakäyttöinen (pillerin napautus)
const sij = { 2: null, 3: null };   // viimeisin ikkunan/kortin paikka {x, y}; null = keskellä
const kerroin = () => Math.min(1, (window.innerWidth || 1024) / 600);   // sama sääntö kuin mitat()
const suorak = (el) => (el && el.getBoundingClientRect) ? el.getBoundingClientRect() : { left: 0, top: 0, width: 0, height: 0 };
const rajaa = (v, lo, hi) => Math.min(Math.max(lo, v), Math.max(lo, hi));
const merkitse = (el, v) => { el.className = 'h683-pussi'; if (el.setAttribute) el.setAttribute('data-h683', v); };
// Kortin paikka niin että sen säkkikuva (kortin sisällä siirtymässä ox,oy) osuu ankkuriin (ax,ay); ei ulos ruudulta: siirretään vähimmäismäärä.
const sijoitaKortti = (ax, ay, ox, oy, w, h, iw, ih) => ({ x: rajaa(ax - ox, 0, iw - w), y: rajaa(ay - oy, 0, ih - h) });
const nielePelilta = (el) => { for (const t of ['mousedown', 'pointerdown', 'mouseup', 'pointerup', 'click', 'dblclick', 'contextmenu']) el.addEventListener(t, ev => ev.stopPropagation()); };
// Raahaus kuten variantti 1 (pointer capture, rajaus ikkunaan), mutta erotetaan napautus raahauksesta: alle 6 px liike = napautus.
// kahva = elementti jota painetaan, juuri = elementti jota siirretään. valmis(liikkui, x, y) kutsutaan nostettaessa; siirretty(x, y) joka siirrolla.
const teeVedettava = (juuri, kahva, siirretty, valmis) => {
  let v = null;
  kahva.addEventListener('pointerdown', (ev) => { ev.stopPropagation(); if (ev.button && ev.button !== 0) return;
    const r0 = suorak(juuri);
    v = { id: ev.pointerId, dx: ev.clientX - r0.left, dy: ev.clientY - r0.top, x0: ev.clientX, y0: ev.clientY, liikkui: false, x: r0.left, y: r0.top };
    juuri.style.left = r0.left + 'px'; juuri.style.top = r0.top + 'px'; juuri.style.transform = 'none';
    if (kahva.setPointerCapture) try { kahva.setPointerCapture(ev.pointerId); } catch (x) {} });
  kahva.addEventListener('pointermove', (ev) => { if (!v || ev.pointerId !== v.id) return;
    if (!v.liikkui && Math.hypot(ev.clientX - v.x0, ev.clientY - v.y0) > 6) v.liikkui = true;
    if (!v.liikkui) return;
    const w = juuri.offsetWidth || 0, h = juuri.offsetHeight || 0, iw = window.innerWidth || 0, ih = window.innerHeight || 0;
    v.x = rajaa(ev.clientX - v.dx, 0, iw - w); v.y = rajaa(ev.clientY - v.dy, 0, ih - h);
    juuri.style.left = v.x + 'px'; juuri.style.top = v.y + 'px'; if (siirretty) siirretty(v.x, v.y); });
  kahva.addEventListener('pointerup', (ev) => { if (!v || ev.pointerId !== v.id) return; const a = v; v = null; if (valmis) valmis(a.liikkui, a.x, a.y); });
  const peru = (ev) => { if (!v || (ev && ev.pointerId !== undefined && ev.pointerId !== v.id)) return; v = null; };
  kahva.addEventListener('pointercancel', peru); kahva.addEventListener('lostpointercapture', peru);
};
const ruksi = (kasittelija) => { const x = document.createElement('div'); x.textContent = '×'; x.title = 'Sulje';
  x.style.cssText = 'cursor:pointer;width:24px;height:22px;line-height:20px;text-align:center;font-size:18px;color:#fff;touch-action:manipulation;flex:none';
  x.addEventListener('pointerdown', ev => ev.stopPropagation());   // ei aloita raahausta
  x.addEventListener('click', (ev) => { ev.stopPropagation(); kasittelija(); }); return x; };
const kuvaEl = (url, css) => { const im = document.createElement('img'); im.src = url; im.alt = ''; im.draggable = false; im.style.cssText = css; return im; };
const taytaPaikka = (r, t) => { r.textContent = ''; r.title = t ? t.nimi : '';
  for (const c of [...r.children]) c.remove();
  r.style.borderColor = t ? '#418db0' : '#ffffff33';
  if (!t) return;
  if (t.kuva) { const im = document.createElement('img'); im.src = t.kuva; im.alt = t.nimi; im.draggable = false; im.style.cssText = 'max-width:100%;max-height:100%;image-rendering:pixelated'; r.appendChild(im); }
  else r.textContent = t.nimi.slice(0, 8); };

// -- variantti 2: iso säkki
const poistaV2 = () => { if (ikk2) { ikk2.remove(); ikk2 = null; v2kerros = null; v2kuva = null; } };
const rakennaV2 = () => {
  if (ikk2) return;
  const k = kerroin(), s = V2_SKAALA * k, koko = Math.round(SAEKKI_PX * s);
  ikk2 = document.createElement('div'); merkitse(ikk2, 'v2');
  ikk2.style.cssText = 'position:fixed;' + (sij[2] ? 'left:' + sij[2].x + 'px;top:' + sij[2].y + 'px;' : 'left:50%;top:50%;transform:translate(-50%,-50%);')
    + 'z-index:' + V23_Z + ';max-width:96vw;box-sizing:border-box;font:13px sans-serif;color:#cfc6dc;user-select:none';
  const kop = document.createElement('div');
  kop.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:2px 2px 2px 10px;background:rgba(20,17,26,.92);border:1px solid #4b3f5e;border-radius:6px 6px 0 0;'
    + 'font-weight:bold;letter-spacing:.5px;color:#d9a35b;cursor:move;touch-action:none';
  const teksti = document.createElement('span'); teksti.textContent = 'Pussi';
  kop.appendChild(teksti); kop.appendChild(ruksi(() => kutistaV2()));
  const laatikko = document.createElement('div'); laatikko.style.cssText = 'position:relative;width:' + koko + 'px;height:' + koko + 'px';
  v2kuva = kuvaEl(SAEKKI_URI, 'display:block;width:' + koko + 'px;height:' + koko + 'px;image-rendering:pixelated;pointer-events:none');
  v2kerros = document.createElement('div'); v2kerros.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none';
  laatikko.appendChild(v2kuva); laatikko.appendChild(v2kerros);
  ikk2.appendChild(kop); ikk2.appendChild(laatikko);
  nielePelilta(ikk2);
  teeVedettava(ikk2, kop, (x, y) => { sij[2] = { x, y }; }, (liikkui, x, y) => { if (liikkui) sij[2] = { x, y }; });
  document.body.appendChild(ikk2);
};
const piirraV2 = () => {
  const k = kerroin(), s = V2_SKAALA * k;
  for (const c of [...v2kerros.children]) c.remove();
  for (let i = 0; i < PAIKKOJA; i++) {
    const t = paikat[i]; if (!t) continue;
    const [px, py, sk] = V2_PAIKAT[i], pos = 'position:absolute;left:' + Math.round(px * s) + 'px;top:' + Math.round(py * s) + 'px;';
    if (t.kuva) { const im = kuvaEl(t.kuva, pos + 'transform-origin:0 0;transform:scale(' + (sk * k) + ');opacity:.62;image-rendering:pixelated;pointer-events:none'); im.title = t.nimi; v2kerros.appendChild(im); }
    else { const d = document.createElement('div'); d.textContent = t.nimi.slice(0, 8); d.title = t.nimi;
      d.style.cssText = pos + 'max-width:' + Math.round(34 * k * sk) + 'px;font:bold ' + Math.max(9, Math.round(11 * k)) + 'px sans-serif;color:#fff;opacity:.85;text-shadow:0 1px 2px #000;word-break:break-all;line-height:1.1';
      v2kerros.appendChild(d); }
  }
};
const kutistaV2 = () => {
  const r = suorak(ikk2), i = suorak(v2kuva);
  if (r.width || r.height || r.left || r.top) sij[2] = { x: r.left, y: r.top };
  ankkuri = { x: i.left, y: i.top }; kiinni = true; poistaV2(); piirra();
};

// -- variantti 3: infostand-kortti. Tyylit pelin client/Nitro-V3/src/components/room/widgets/avatar-info/infostand/InfoStandWidgetFurniView.tsx:540 (kortti), :544-549 (otsikko + × + hr),
//    :603 (linkki: valkoinen, alleviivattu, text-sm) ja common/Text.tsx:68 (small = text-sm = 0.7875rem, tailwind.config.js:68), fontti Ubuntu (tailwind.config.js:77).
const KORTTI_TYYLI = 'background:rgba(28,28,32,.95);box-shadow:inset 0 5px #22222799,inset 0 -4px #12121599;border-radius:.25rem';
const poistaV3 = () => { if (kortti) { kortti.remove(); kortti = null; kortKuva = null; v3ruudut = []; } };
const rakennaV3 = (ank) => {
  if (kortti) return;
  const k = kerroin(), slotti = Math.round(54 * k), kuvaPx = Math.round(SAEKKI_PX * k), leveys = Math.max(150, 3 * slotti + 12 + 16);
  kortti = document.createElement('div'); merkitse(kortti, 'v3');
  kortti.style.cssText = 'position:fixed;left:0;top:0;z-index:' + V23_Z + ';width:' + leveys + 'px;max-width:96vw;box-sizing:border-box;padding:8px;' + KORTTI_TYYLI + ';'
    + 'font:0.7875rem/1.4 Ubuntu,sans-serif;color:#fff;text-align:center;user-select:none;touch-action:none;visibility:hidden';
  const hr = () => { const h = document.createElement('div'); h.style.cssText = 'height:1px;margin:4px 0;background:#0003;opacity:.5'; return h; };
  const kop = document.createElement('div'); kop.style.cssText = 'position:relative;padding:0 24px;min-height:22px;line-height:22px;cursor:move;touch-action:none';
  const otsikko3 = document.createElement('span'); otsikko3.textContent = 'Kankainen pussi'; kop.appendChild(otsikko3);
  const x = ruksi(() => kutistaV3()); x.style.position = 'absolute'; x.style.right = '-2px'; x.style.top = '0'; kop.appendChild(x);
  kortKuva = kuvaEl(SAEKKI_URI, 'display:block;margin:4px auto;width:' + kuvaPx + 'px;height:' + kuvaPx + 'px;image-rendering:pixelated;pointer-events:none');
  const rivi = document.createElement('div'); rivi.style.cssText = 'display:flex;justify-content:center;gap:6px';
  v3ruudut = [];
  for (let i = 0; i < PAIKKOJA; i++) {
    const r = document.createElement('div');
    r.style.cssText = 'width:' + slotti + 'px;height:' + slotti + 'px;box-sizing:border-box;display:flex;align-items:center;justify-content:center;overflow:hidden;'
      + 'background:#121215;border:1px solid #ffffff33;border-radius:.25rem;text-align:center;font-size:11px;line-height:12px;word-break:break-all;color:#fff';
    rivi.appendChild(r); v3ruudut.push(r);
  }
  kortti.appendChild(kop); kortti.appendChild(hr()); kortti.appendChild(kortKuva); kortti.appendChild(hr()); kortti.appendChild(rivi);
  nielePelilta(kortti);
  teeVedettava(kortti, kortti, (px, py) => { sij[3] = { x: px, y: py }; }, (liikkui, px, py) => { if (liikkui) sij[3] = { x: px, y: py }; });
  document.body.appendChild(kortti);
  if (ank) {   // avaus pillerin napautuksesta: säkkikuva täsmälleen pillerin säkkikuvan päälle (mitataan, ei arvata), vähimmäissiirto jos ulos ruudulta
    kortti.style.left = '0px'; kortti.style.top = '0px'; kortti.style.transform = 'none';
    const R = suorak(kortti), I = suorak(kortKuva);
    const p = sijoitaKortti(ank.x, ank.y, I.left - R.left, I.top - R.top, kortti.offsetWidth || R.width, kortti.offsetHeight || R.height, window.innerWidth || 0, window.innerHeight || 0);
    kortti.style.left = p.x + 'px'; kortti.style.top = p.y + 'px'; sij[3] = { x: p.x, y: p.y };
  } else if (sij[3]) { kortti.style.left = sij[3].x + 'px'; kortti.style.top = sij[3].y + 'px'; kortti.style.transform = 'none'; }
  else { kortti.style.left = '50%'; kortti.style.top = '50%'; kortti.style.transform = 'translate(-50%,-50%)'; }
  kortti.style.visibility = 'visible';
};
const piirraV3 = () => { for (let i = 0; i < PAIKKOJA; i++) taytaPaikka(v3ruudut[i], paikat[i]); };
const kutistaV3 = () => { const i = suorak(kortKuva); ankkuri = { x: i.left, y: i.top }; kiinni = true; poistaV3(); piirra(); };

// -- pilleri (v2:n ja v3:n yhteinen "kutistettu" tila): säkkikuva pyöreässä napissa, raahattava, napautus avaa
const poistaPilli = () => { if (pilli) { pilli.remove(); pilli = null; } };
const avaa = () => { kiinni = false; avaaAnkkuriin = ankkuri; piirra(); avaaAnkkuriin = null; };
const naytaPilli = () => {
  if (pilli || !ankkuri) return;
  const kuvaPx = Math.round(SAEKKI_PX * kerroin()), koko = kuvaPx + 2 * PILLI_PAD, iw = window.innerWidth || 0, ih = window.innerHeight || 0;
  const x = rajaa(ankkuri.x - PILLI_PAD, 0, iw - koko), y = rajaa(ankkuri.y - PILLI_PAD, 0, ih - koko);
  ankkuri = { x: x + PILLI_PAD, y: y + PILLI_PAD };   // pysyy ruudulla
  pilli = document.createElement('div'); merkitse(pilli, 'pilli'); pilli.title = 'Pussi';
  pilli.style.cssText = 'position:fixed;left:' + x + 'px;top:' + y + 'px;z-index:' + V23_Z + ';width:' + koko + 'px;height:' + koko + 'px;box-sizing:border-box;padding:' + PILLI_PAD + 'px;'
    + KORTTI_TYYLI.replace('.25rem', '999px') + ';cursor:pointer;touch-action:none;user-select:none';
  pilli.appendChild(kuvaEl(SAEKKI_URI, 'display:block;width:' + kuvaPx + 'px;height:' + kuvaPx + 'px;image-rendering:pixelated;pointer-events:none'));
  nielePelilta(pilli);
  teeVedettava(pilli, pilli, null, (liikkui, px, py) => { if (liikkui) ankkuri = { x: px + PILLI_PAD, y: py + PILLI_PAD }; else avaa(); });
  document.body.appendChild(pilli);
};

// -- piirto: yksi sisäänkäynti. Pussi pois -> kaikki pois; muuten vain aktiivisen variantin elementit.
const piirra = () => {
  if (!pussi) { poistaV1(); poistaV2(); poistaV3(); poistaPilli(); return; }
  if (variantti === 1) { poistaV2(); poistaV3(); poistaPilli(); piirraV1(); return; }
  poistaV1();
  if (kiinni) { poistaV2(); poistaV3(); naytaPilli(); return; }
  poistaPilli();
  if (variantti === 2) { poistaV3(); rakennaV2(); piirraV2(); }
  else { poistaV2(); rakennaV3(avaaAnkkuriin); avaaAnkkuriin = null; piirraV3(); }
};

// ---- ilmoitus kuten 684.js ilmoita()
const ajastimet = new Set();
// sona 15:18:39-54: laatikko ympärille + animaatio että erottuu huoneen muusta käyttöliittymästä, poimintatekstiin pussin kuva.
// vari: { reuna: 'r,g,b', tausta: 'r,g,b' } — sona 15:58 "Voisko sait akun laatikko olla vihree 'positiivinen väri'"; oletus violetti.
const VIHREA = { reuna: '92,200,110', tausta: '14,40,20' };
const ilmoita = (teksti, ms = 1600, kuvaUrl, vari) => { const R = (vari && vari.reuna) || '184,156,224', T = (vari && vari.tausta) || '20,17,26'; const d = document.createElement('div'); d.className = 'h683-pussi';
  d.style.cssText = 'position:fixed;left:50%;top:14%;transform:translateX(-50%);z-index:99999;pointer-events:none;padding:10px 18px;max-width:90vw;box-sizing:border-box;'
    + 'display:flex;align-items:center;gap:12px;background:rgba(' + T + ',.95);color:#fff;font:bold 15px sans-serif;border:2px solid rgb(' + R + ');border-radius:10px;'
    + 'box-shadow:0 0 14px rgba(' + R + ',.6),0 3px 10px rgba(0,0,0,.6);transition:opacity .4s';
  if (kuvaUrl) { const k = document.createElement('img'); k.src = kuvaUrl; k.alt = ''; k.draggable = false; k.style.cssText = 'width:40px;height:40px;object-fit:contain;image-rendering:pixelated;flex:none'; d.appendChild(k); }
  const t = document.createElement('span'); t.textContent = teksti; d.appendChild(t);
  document.body.appendChild(d);
  try { if (d.animate) {   // sisääntulo: pomppaa esiin, sitten reunan hehku sykkii kunnes häviää
    d.animate([{ opacity: 0, transform: 'translateX(-50%) scale(.6)' }, { opacity: 1, transform: 'translateX(-50%) scale(1.08)' }, { transform: 'translateX(-50%) scale(1)' }], { duration: 450, easing: 'ease-out' });
    d.animate([{ boxShadow: '0 0 6px rgba(' + R + ',.35),0 3px 10px rgba(0,0,0,.6)' }, { boxShadow: '0 0 22px rgba(' + R + ',.95),0 3px 10px rgba(0,0,0,.6)' }], { duration: 900, iterations: Infinity, direction: 'alternate', easing: 'ease-in-out' }); } } catch (x) {}
  const a = setTimeout(() => { d.style.opacity = '0'; ajastimet.delete(a); }, ms), b = setTimeout(() => { d.remove(); ajastimet.delete(b); }, ms + 500); ajastimet.add(a); ajastimet.add(b); };

// ---- API
const tila = window.kupla683 = { versio: 'huone-683 pussi 1', huone, loki };
tila.onPussi = () => pussi;
tila.anna = () => { const uusi = !pussi; pussi = true; piirra(); if (uusi) { lokiin({ pussi: 'annettu' }); ilmoita(POIMINTA_TEKSTI, POIMINTA_MS, PUSSI_KUVA); } return uusi; };
tila.tavarat = () => paikat.filter(Boolean).map(t => ({ nimi: t.nimi, kuva: t.kuva }));
tila.lisaa = (nimi, kuvaUrl) => {
  if (typeof nimi !== 'string' || !nimi.trim()) return -1;
  const t = siisti({ nimi: nimi.trim(), kuva: kuvaUrl }), vanha = paikat.findIndex(p => p && p.nimi === t.nimi); if (vanha >= 0) return vanha;
  const i = paikat.indexOf(null); if (i < 0) { lokiin({ lisaa: 'täynnä', nimi: t.nimi }); return -1; }
  paikat[i] = t; piirra(); lokiin({ lisaa: t.nimi, paikka: i }); return i; };
tila.poista = (nimi) => { const i = paikat.findIndex(p => p && p.nimi === String(nimi).trim()); if (i < 0) return false;
  paikat[i] = null; piirra(); lokiin({ poista: String(nimi), paikka: i }); return true; };
tila.nollaa = () => { pussi = false; paikat = new Array(PAIKKOJA).fill(null); kiinni = false; ankkuri = null; avaaAnkkuriin = null; sij[2] = null; sij[3] = null; piirra(); lokiin({ nollaa: 1 }); };
// variantti(n): vaihda ulkoasu 1/2/3 (sisältö ja pussi-tila pysyvät, vain piirretään uudelleen); ilman argumenttia palauttaa nykyisen; virheellinen n ei muuta mitään. Palauttaa aktiivisen variantin.
tila.variantti = (n) => { if (n === undefined || n === null) return variantti; const v = Number(n); if (v !== 1 && v !== 2 && v !== 3) return variantti;
  if (v !== variantti) { variantti = v; if (v === 1) kiinni = false; lokiin({ variantti: v }); piirra(); } return variantti; };

// ---- klikkaus pussiin
const onPussiFurni = (ev) => {
  if (!ev || ev.category !== 10) return false;
  if (ev.objectId === PUSSI.id) return true;
  try { const o = e.getRoomObject(huone, ev.objectId, 10); return !!o && String(o.type || '').toLowerCase() === PUSSI.tyyppi; } catch (x) { return false; }   // varatunnistus luokalla
};
const valittu = (ev) => { try {
  if (!onPussiFurni(ev)) return;
  if (!pussi) tila.anna();   // jo otettu: mitään ei tapahdu
} catch (x) { lokiin({ virhe: String(x) }); } };
if (vayla && vayla.addEventListener) vayla.addEventListener('REOE_SELECTED', valittu); else lokiin({ virhe: 'e.events puuttuu, klikkausta ei kuunnella' });

// ---- BUSSIPYSÄKKI (sona 29.10. 16:22-16:26 "jos klikkaa bussipysäkkii niin tulee näkyvii bussiaikataulu" · "Keksi sä bussaikataulun sisältö" ·
//   "Siinä vois olla arvotus" · "Tee siitä ikkuna jonka voi sulkea" · "Keltainen lappu jossa on mustan bussin kuva", osoitti f433145 Parada de autobus).
//   Klikkaus pysäkkiin avaa keltaisen aikataululapun; vain ✕ sulkee. Ei lähetä mitään palvelimelle.
const PYSAKKI = 433145;
const BUSSI_SVG = '<svg viewBox="0 0 120 60" width="120" height="60"><rect x="6" y="8" width="104" height="38" rx="7" fill="#111"/>' +
  '<rect x="14" y="14" width="16" height="13" fill="#f4d23c"/><rect x="34" y="14" width="16" height="13" fill="#f4d23c"/><rect x="54" y="14" width="16" height="13" fill="#f4d23c"/>' +
  '<rect x="74" y="14" width="16" height="13" fill="#f4d23c"/><rect x="94" y="14" width="10" height="22" fill="#f4d23c"/><circle cx="28" cy="48" r="8" fill="#111" stroke="#f4d23c" stroke-width="3"/>' +
  '<circle cx="88" cy="48" r="8" fill="#111" stroke="#f4d23c" stroke-width="3"/></svg>';
const AIKATAULU = [['21.13', 'Hautausmaa'], ['22.13', 'Hautausmaa'], ['23.13', 'Hautausmaa'], ['00.13', 'Sairaala ✝']];
let lappu = null;
const suljeLappu = () => { if (lappu) { lappu.remove(); lappu = null; } };
const avaaLappu = () => {
  if (lappu) return;   // sona 16:26:48 "X-merkkinä sulkemisesta, muuten se voisi olla näkyvillä kokoajan"
  const d = document.createElement('div'); d.className = 'h683-lappu';
  d.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%) rotate(-1.5deg);z-index:99998;width:300px;padding:16px 18px 14px;' +
    'background:#f4d23c;color:#111;font:14px/1.4 Verdana,sans-serif;box-shadow:4px 6px 0 rgba(0,0,0,.45);border:2px solid #111';
  d.innerHTML = '<div style="position:absolute;right:8px;top:4px;cursor:pointer;font:bold 18px sans-serif" title="Sulje">✕</div>' +
    '<div style="text-align:center">' + BUSSI_SVG + '</div>' +
    '<div style="text-align:center;font-weight:bold;font-size:16px;letter-spacing:1px;margin:4px 0 2px">LINJA 13</div>' +
    '<div style="text-align:center;font-size:12px;margin-bottom:8px">Pysäkki → Hautausmaa → Sairaala</div>' +
    '<table style="width:100%;border-collapse:collapse;font-family:monospace;font-size:14px">' +
    AIKATAULU.map(([k, m]) => '<tr><td style="border-top:1px dashed #111;padding:2px 0">' + k + '</td><td style="border-top:1px dashed #111;text-align:right">' + m + '</td></tr>').join('') +
    '</table><div style="font-size:11px;margin:4px 0 10px">Yöbussi 00.13 lähti viimeisen kerran 13.10. eikä saapunut perille.</div>' +
    '<div style="border-top:2px solid #111;padding-top:8px;font-style:italic">Kuljettaja jätti autonsa kesken matkan. Hän otti mukaansa vain sen, mikä yhdistää virran moottoriin, ' +
    'ja piilotti sen sinne, missä kukaan ei enää odota bussia.</div>';
  d.firstChild.addEventListener('click', ev => { ev.stopPropagation(); suljeLappu(); });
  document.body.appendChild(d); lappu = d; lokiin({ lappu: 'auki' });
};
const pysakkiValittu = (ev) => { try { if (ev && ev.category === 10 && ev.objectId === PYSAKKI) avaaLappu(); } catch (x) { lokiin({ virhe: 'pysäkki: ' + String(x) }); } };
if (vayla && vayla.addEventListener) vayla.addEventListener('REOE_SELECTED', pysakkiValittu);

// ---- akku ambulanssista. Oman hahmon ruutu luetaan samalla idiomilla kuin 681.js omaIndeksi() + naapurit(); ei muokata engineä.
let ambulanssissa = null, varoitettu = false;   // null = ei vielä mitattu (ensimmäinen mittaus ei laukaise)
const omaRuutu = () => {
  const sm = Object.getOwnPropertyDescriptor(e, '_roomSessionManager'); const s = sm && sm.value && sm.value.getSession && sm.value.getSession(huone);
  const i = s && s.ownRoomIndex; if (i == null || i < 0) return null;
  const o = e.getRoomObject(huone, i, 100), L = o && o.getLocation && o.getLocation(); return L ? { x: Math.round(L.x), y: Math.round(L.y) } : null; };
// Alue = ruudut, joihin ambulanssi osuu. Kierto 90/270 vaihtaa leveyden ja korkeuden (681.js:387 sama ehto).
const ambulanssiAlue = () => {
  let x = AMBULANSSI.x, y = AMBULANSSI.y, w = 1, h = 1; const puutteet = [];
  let o = null; try { o = e.getRoomObject(huone, AMBULANSSI.id, 10); } catch (err) { o = null; }
  const L = o && o.getLocation && o.getLocation();
  if (L && isFinite(L.x) && isFinite(L.y)) { x = Math.round(L.x); y = Math.round(L.y); } else puutteet.push('sijainti');
  const m = o && o.model, sx = Number(m && m.getValue && m.getValue('furniture_size_x')), sy = Number(m && m.getValue && m.getValue('furniture_size_y'));
  if (sx > 0 && sy > 0) { w = sx; h = sy; } else puutteet.push('koko');
  const d = o && o.getDirection && o.getDirection();
  if (d && isFinite(d.x)) { if (Math.round(d.x) % 180 === 90) { const t = w; w = h; h = t; } } else puutteet.push('kierto');
  if (puutteet.length && !varoitettu) { varoitettu = true; console.warn('683 ambulanssi: ei luettu (' + puutteet.join(', ') + '), käytetään ' + x + ',' + y + ' ' + w + 'x' + h); }
  return { x, y, w, h };
};
const ambulanssiVali = setInterval(() => { try {
  const r = omaRuutu(); if (!r) return;
  const a = ambulanssiAlue();
  const sisalla = r.x >= a.x && r.x < a.x + a.w && r.y >= a.y && r.y < a.y + a.h;
  const oli = ambulanssissa; ambulanssissa = sisalla;
  if (!sisalla || oli !== false) return;   // laukeaa vain sisään astuttaessa (oli === false), ei joka ruudussa
  if (!pussi) { lokiin({ akku: 'ei pussia' }); return; }   // ei ilmoitusta: spoileri (kp 29.10. 15:17), sona pyysi vain akun saamisviestin
  if (paikat.some(p => p && p.nimi === AKKU)) return;   // jo saatu
  const i = tila.lisaa(AKKU, AKKU_KUVA);
  if (i >= 0) { lokiin({ akku: 'saatu', paikka: i }); ilmoita('Sait akun', 8000, undefined, VIHREA); }   /* sona 15:19:57: 8 s */ else lokiin({ akku: 'pussi täynnä' });   // täynnä: ei ilmoitusta (speksissä ei ole), yritys jatkuu seuraavassa sisääntulossa
} catch (err) { lokiin({ virhe: 'ambulanssi: ' + String(err) }); } }, AMBULANSSI_VALI);

// ---- JOHTOLAATAT: akku ei kelpaa sellaisenaan. sona 29.10. 15:50-15:52 "pelaaja ottaa sen akun. sitte se menee sinne lähetyshuoneesee
// kokeilee ja ei toimi. Sitten kun se astuu tähän … niin tulee viesti että akku tarvitsee erilaisen johdon tms. kirjota paremmin" (osoitti f438211, f438205).
// Laukeaa vain laatalle astuttaessa ja vain jos pussissa on akku; ilman akkua ei mitään (spoileri, kuten ambulanssissa).
const JOHTOLAATAT = [438211, 438205];
let laatalla = null;
const laattaVali = setInterval(() => { try {
  const r = omaRuutu(); if (!r) return;
  // koko laatan ala (2x2), ei vain kulmaruutu: mitattu 16:00 furniture_size 2x2, sona seisoi 32,6/33,6/34,6 eikä mitään tapahtunut
  const paalla = JOHTOLAATAT.some(id => { const o = e.getRoomObject(huone, id, 10), L = o && o.getLocation && o.getLocation(); if (!L) return false;
    const m = o.model, g = k => Number(m && m.getValue && m.getValue(k)); let w = g('furniture_size_x') || 1, h = g('furniture_size_y') || 1;
    const d = o.getDirection && o.getDirection(); if (d && Math.round(d.x) % 180 === 90) { const t = w; w = h; h = t; }
    const x = Math.round(L.x), y = Math.round(L.y); return r.x >= x && r.x < x + w && r.y >= y && r.y < y + h; });
  const oli = laatalla; laatalla = paalla;
  if (!paalla || oli !== false) return;
  if (!pussi || !paikat.some(p => p && p.nimi === AKKU)) { lokiin({ johto: 'ei akkua' }); return; }
  lokiin({ johto: 'viesti' });   // viestin näyttää nyt wired 445889 kuiskauksena (sona 16:12 "chätissä kuiskauksena"), alla oleva kuplasuodatin valitsee
} catch (err) { lokiin({ virhe: 'johtolaatta: ' + String(err) }); } }, AMBULANSSI_VALI);
// ---- YKSI VIESTI KERRALLA (sona 29.10. 16:21 "jos on akku niin tulee toi että akku ei sovi · jos ei ole niin tulee toi että akku on tyhjä"):
//   laatoilla on kaksi wirediä jotka kuiskaavat KAIKILLE: sonan "akku tyhjä" ja 445889 "Akku ei sovi…" (pino 16,9). Wired ei näe pussia, joten
//   skripti piilottaa sen kuplan joka ei kuulu tilanteeseen: akku pussissa -> "tyhjä" pois, muuten "ei sovi" pois. Malli 682.js kuplaPiiloon
//   (kaukoputkiviesti). RAJA: vain puhekupla piiloon, chat-historiaan molemmat jäävät; ilman huone-efektejä pelaaja näkee molemmat (hänellä ei ole pussia).
const ON_AKKU = () => !!(pussi && paikat.some(p => p && p.nimi === AKKU));
const VIESTI_TYHJA = /akku[^]*tyhj/i, VIESTI_EI_SOVI = /Akku ei sovi tähän/i;
const akkuKupla = el => { try { const t = el.textContent || ''; const pois = ON_AKKU() ? VIESTI_TYHJA.test(t) && !VIESTI_EI_SOVI.test(t) : VIESTI_EI_SOVI.test(t);
  if (pois && el.style.display !== 'none') { el.style.display = 'none'; lokiin({ kupla: 'piilotettu', akku: ON_AKKU(), teksti: t.slice(0, 60) }); } } catch (x) {} };
const akkuVahti = new MutationObserver(() => { for (const b of document.querySelectorAll('.bubble-container')) akkuKupla(b); });
akkuVahti.observe(document.body, { childList: true, subtree: true, characterData: true });
// varakierros: 16:42 livetestissä observer oli lakannut laukeamasta (sama instanssi, laattaVali eli, 16:29 piilotus toimi) -> syy auki.
//   Kierros piilottaa sen minkä observer ohitti ja kirjaa 'varakierros', jotta näkyy kumpi sen teki.
const akkuVara = setInterval(() => { for (const b of document.querySelectorAll('.bubble-container')) { const ennen = b.style.display; akkuKupla(b); if (ennen !== 'none' && b.style.display === 'none') lokiin({ kupla: 'varakierros' }); } }, 120);

// ---- PIMENNYS: huoneen irralliset lattiasaarekkeet piilossa kunnes oma hahmo astuu sinne. Malli huoneet/682.js (kaikki mekanismit sieltä).
// sona 29.10. 15:28-15:33 "nää kaikki muut tilat jotka ei oo tässä keskellä on pimennetty, eli että sinne ei näe kunnes astuu wirediin ja menee sinne" ·
//   "samanlainen pimennys joka on huone 3:sessa" (= 682) · "tuo suurin tila kokonaisuudessaan tulisi näkyä kokoajan".
// Alueet johdetaan AJONAIKAA lattiakartasta, ei kovakoodata: lattiaruutu = room_map_data.tileMap[y][x].height >= 0 (sama ehto kuin
//   RoomEngine.updateAreaHide, getAreaHideHoleRectangles), alue = 4-naapuriyhtenäinen ruutujoukko (aukko = ei ruutua). Mitattu robolla 683:ssa
//   29.10.: 4 aluetta (446 / 66 / 96 / 96 ruutua). Suurin on aina näkyvissä; muut vain kun OMA hahmo seisoo siinä (silloin vain se yksi). Kahden suurimman
//   tasapeli -> molemmat ovat "suurin". HUOM: LegacyWallGeometry.isRoomTile EI kelpaa (tosi joka ruudulle, mitattu 683:ssa; 684.js:94 käyttää sitä).
//   - Furnit: alueen määrää furnin origoruutu (getLocation, kuten 682.js:112; mitattu 683:ssa: yhdenkään furnin jalanjälki ei ylitä aluerajaa).
//     furniture_wired_opacity 0 + furniture_wired_click_through 1 (682.js:75), wired-laatikot (wf_) jätetään (682.js:36).
//   - Lattia: RoomEngine.updateAreaHide -reiät (682.js:110), yksi suorakaide / alue (id REIKA+i); jos alueen rajalaatikossa on toisen alueen ruutuja,
//     rivijuoksut (reikä osuu vain olemassa oleviin ruutuihin, joten tyhjät aukot rajalaatikossa eivät haittaa).
//   - Muut pelaajat piilossa alueella: figure_is_muted IGNORED|HIDDEN (682.js:82-90). Oma hahmo ei koskaan piiloon (682.js:119-128) ja jos omaa
//     indeksiä ei tunneta (ownRoomIndex -1 tulohetkellä) ketään ei mykistetä. Oma alue muistetaan kunnes hahmo on toisessa alueessa (teleportin hetki ei välähdytä).
//   - :showrooms (moottori 0.7.0): hs.naytaPiilot päällä = kaikki alueet näkyvät (682.js:105-108).
// Konsolissa: huone683.alueet [{i, n, x0, y0, x1, y1, suurin, nakyy, furneja, hahmoja}] · huone683.oma (oman alueen i) · huone683.pakota(true|false|null|i|[i..]) ·
//   huone683.paivita() · huone683.loki.  EI lähetä mitään palvelimelle.
let pimennysPois = () => {};
{
  const WIRED = /^wf_(trg|act|cnd|xtra|slc|var)_/;
  const REIKA = 6830;   // 682:n 6820:n viereen; alue i käyttää id:tä REIKA+i (reiät -(id*10000+j+1))
  const MYKKA = 6;      // IGNORED | HIDDEN
  const dv = (o, k) => { const d = o && Object.getOwnPropertyDescriptor(o, k); return d && !d.get ? d.value : undefined; };
  const istunto = () => { const sm = dv(e, '_roomSessionManager'); return sm && sm.getSession && sm.getSession(huone); };
  // sama oma-indeksi kuin 682.js:54-60 (ownRoomIndex voi olla -1 hetken huoneeseen tullessa -> käyttäjä-id tai nimi)
  const omaIndeksi = () => { const s = istunto(); const i = s && s.ownRoomIndex; if (i != null && i >= 0) return i;
    const ud = s && s.userDataManager, sd = dv(e, '_sessionDataManager') || {}, id = Number(sd._userId || 0), nimi = String(sd._name || '').trim().toLowerCase();
    if (!ud || !ud.getUserDataByIndex || (!id && !nimi)) return null;
    for (const o of e.getRoomObjects(huone, 100) || []) { const u = o && ud.getUserDataByIndex(o.id);
      if (u && ((id > 0 && Number(u.webID) === id) || (nimi && String(u.name || '').trim().toLowerCase() === nimi))) return o.id; }
    return null; };
  const omaHahmo = () => { const i = omaIndeksi(); return i == null ? null : e.getRoomObject(huone, i, 100); };
  const naytaPiilot = () => { const h = window.huoneskriptit; return !!(h && h.naytaPiilot); };

  // -- alueet lattiakartasta (välimuisti: lasketaan uudelleen vain kun ruutumaski muuttuu)
  let kartta = null;
  const laskeAlueet = () => {
    const o = e.getRoomOwnObject && e.getRoomOwnObject(huone), rm = o && o.model && o.model.getValue('room_map_data'), tm = rm && rm.tileMap;
    if (!tm || !tm.length) return null;
    const H = tm.length; let W = 0; for (const r of tm) if (r && r.length > W) W = r.length;
    const on = new Uint8Array(W * H); for (let y = 0; y < H; y++) { const r = tm[y]; if (r) for (let x = 0; x < r.length; x++) if (r[x] && r[x].height >= 0) on[y * W + x] = 1; }
    if (kartta && kartta.W === W && kartta.H === H && kartta.on.every((v, i) => v === on[i])) return kartta;
    const id = new Int32Array(W * H).fill(-1), raaka = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {   // rivi-sarakejärjestys -> deterministinen tasapelin ratkaisu
      if (!on[y * W + x] || id[y * W + x] >= 0) continue;
      const k = raaka.length, pino = [y * W + x], c = { n: 0, x0: x, y0: y, x1: x, y1: y }; id[y * W + x] = k;
      while (pino.length) { const p = pino.pop(), px = p % W, py = (p - px) / W; c.n++;
        if (px < c.x0) c.x0 = px; if (px > c.x1) c.x1 = px; if (py > c.y1) c.y1 = py;   // y0 on aina ensimmäinen (rivijärjestys)
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = px + dx, ny = py + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H || !on[ny * W + nx] || id[ny * W + nx] >= 0) continue; id[ny * W + nx] = k; pino.push(ny * W + nx); } }
      raaka.push(c);
    }
    const jarj = raaka.map((c, k) => k).sort((a, b) => raaka[b].n - raaka[a].n || a - b);   // koko laskevasti, tasapeli: löytöjärjestys
    const uusi = new Map(jarj.map((k, i) => [k, i])); for (let j = 0; j < id.length; j++) if (id[j] >= 0) id[j] = uusi.get(id[j]);
    const alueet = jarj.map((k, i) => Object.assign({ i }, raaka[k]));
    const max = alueet.length ? alueet[0].n : 0; for (const a of alueet) a.suurin = a.n === max;
    for (const a of alueet) { a.puhdas = true;   // onko rajalaatikossa toisen alueen ruutuja
      for (let y = a.y0; y <= a.y1 && a.puhdas; y++) for (let x = a.x0; x <= a.x1; x++) { const v = id[y * W + x]; if (v >= 0 && v !== a.i) { a.puhdas = false; break; } } }
    return (kartta = { W, H, on, id, alueet });
  };
  const alueRuudussa = (x, y) => { const k = kartta; x = Math.round(x); y = Math.round(y);
    return k && x >= 0 && y >= 0 && x < k.W && y < k.H ? k.id[y * k.W + x] : -1; };

  const pim = window.huone683 = { alueet: [], oma: null, nakyvat: [], pakko: null, piilossa: 0, hahmojaPiilossa: 0, loki: [], pakota(v) { pim.pakko = v; paivita(); }, paivita: () => paivita() };
  const lokiPim = (x) => { x.t = new Date().toTimeString().slice(0, 8); pim.loki.push(x); if (pim.loki.length > 50) pim.loki.shift(); };

  // -- furnit (682.js:74-75): asetettu = vain NÄIDEN piilottamat furnit; näkyvälle alueelle ei kirjoiteta mitään (ei ylikirjoiteta muiden skriptien arvoja)
  const asetettu = new Map();   // furni -> 0 (piilossa)
  const aseta = (o, n) => { try {
    if (n === 0) { if (asetettu.get(o) === 0) return; o.model.setValue('furniture_wired_opacity', 0); o.model.setValue('furniture_wired_click_through', 1); asetettu.set(o, 0); }
    else if (asetettu.has(o)) { o.model.setValue('furniture_wired_opacity', 1); o.model.setValue('furniture_wired_click_through', 0); asetettu.delete(o); }
  } catch (x) {} };
  // -- hahmot (682.js:78-90)
  const mykat = new Map();   // id -> { o, alkup }
  const mykista = (o, on) => { const m = mykat.get(o.id);
    if (on) {
      if (m && m.o !== o) mykat.delete(o.id);
      let alkup = 0; try { alkup = (mykat.get(o.id) || {}).alkup ?? (o.model.getValue('figure_is_muted') || 0); } catch (x) {}
      if (!mykat.has(o.id)) mykat.set(o.id, { o, alkup });
      let nyt = 0; try { nyt = o.model.getValue('figure_is_muted') || 0; } catch (x) {}
      if ((nyt & MYKKA) !== MYKKA) try { e.updateRoomObjectUserAction(huone, o.id, 'figure_is_muted', alkup | MYKKA); } catch (x) {}
    } else if (m) { mykat.delete(o.id); if (m.o === o) try { e.updateRoomObjectUserAction(huone, o.id, 'figure_is_muted', m.alkup); } catch (x) {} }
  };
  // -- lattiareiät: haluttu reikälista (alue -> suorakaiteet) verrataan käytössä olevaan, vain muutos kirjoitetaan
  let reiat = [];   // käytössä olevat suorakaiteet "x,y,w,l" (indeksi = REIKA+indeksi)
  const reikaLista = (k, piilossa) => { const L = [];
    for (const a of k.alueet) { if (!piilossa[a.i]) continue;
      if (a.puhdas) { L.push([a.x0, a.y0, a.x1 - a.x0 + 1, a.y1 - a.y0 + 1].join(',')); continue; }
      for (let y = a.y0; y <= a.y1; y++) { let alku = -1;   // rivijuoksut: vain tämän alueen ruudut
        for (let x = a.x0; x <= a.x1 + 1; x++) { const mine = x <= a.x1 && k.id[y * k.W + x] === a.i;
          if (mine && alku < 0) alku = x; else if (!mine && alku >= 0) { L.push([alku, y, x - alku, 1].join(',')); alku = -1; } } } }
    return L; };
  const reiatAseta = (L) => { if (L.join(';') === reiat.join(';')) return;
    for (let j = 0; j < reiat.length; j++) try { e.updateAreaHide(huone, REIKA + j, false, 0, 0, 0, 0, false); } catch (x) {}
    let ok = true; const uusi = [];
    for (let j = 0; j < L.length; j++) { const [x, y, w, l] = L[j].split(',').map(Number);
      try { if (e.updateAreaHide(huone, REIKA + j, true, x, y, w, l, false) === false) ok = false; } catch (x2) { ok = false; } uusi.push(L[j]); }
    reiat = ok ? uusi : [];   // epäonnistui (huoneobjekti ei vielä valmis) -> yritetään uudestaan seuraavalla kierroksella
    if (!ok) for (let j = 0; j < uusi.length; j++) try { e.updateAreaHide(huone, REIKA + j, false, 0, 0, 0, 0, false); } catch (x) {} };

  const nakyvaksi = (a) => {
    if (naytaPiilot() || a.suurin) return true;   // :showrooms voittaa pakota(false):n (682.js:108)
    const p = pim.pakko;
    if (p === true) return true;
    if (p === false) return false;   // vain suurin
    if (typeof p === 'number') return p === a.i;
    if (Array.isArray(p)) return p.includes(a.i);
    return pim.oma === a.i;   // p == null: oma alue
  };
  const paivita = () => { try {
    const k = laskeAlueet(); if (!k) return;
    // oma alue: muistetaan viimeisin (teleportissa hahmon sijainti voi hetken olla aukossa)
    const oma = omaIndeksi(), omo = oma != null ? e.getRoomObject(huone, oma, 100) : null;
    if (omo && omo.getLocation) { const l = omo.getLocation(), c = l ? alueRuudussa(l.x, l.y) : -1;
      if (c >= 0 && c !== pim.oma) { lokiPim({ oma: c, n: k.alueet[c].n }); pim.oma = c; } }
    if (pim.oma != null && pim.oma >= k.alueet.length) pim.oma = null;   // kartta muuttui
    const nakyy = k.alueet.map(nakyvaksi), piilossa = nakyy.map(v => !v);
    reiatAseta(reikaLista(k, piilossa));
    let pf = 0; const furneja = k.alueet.map(() => 0), hahmoja = k.alueet.map(() => 0), nahdyt = new Set();
    for (const o of e.getRoomObjects(huone, 10) || []) {
      if (!o || !o.model) continue; nahdyt.add(o);
      if (WIRED.test(String(o.type || '').toLowerCase())) continue;
      const l = o.getLocation(), c = l ? alueRuudussa(l.x, l.y) : -1; if (c < 0) continue;   // ei alueella -> ei kosketa
      furneja[c]++; aseta(o, nakyy[c] ? 1 : 0); if (!nakyy[c]) pf++;
    }
    for (const o of [...asetettu.keys()]) if (!nahdyt.has(o)) asetettu.delete(o);   // furni poistettu huoneesta
    pim.piilossa = pf;
    let h = 0; const nahdytH = new Set();
    for (const o of e.getRoomObjects(huone, 100) || []) {
      if (!o || !o.model) continue; nahdytH.add(o.id);
      // oma hahmo ei ole koskaan piilossa itseltään; palautetaan myös vanhan ajon jättämä mykistys (682.js:122-128)
      if (o.id === oma) { mykista(o, false); let nyt = 0; try { nyt = o.model.getValue('figure_is_muted') || 0; } catch (x) {}
        if (nyt & MYKKA) try { e.updateRoomObjectUserAction(huone, o.id, 'figure_is_muted', nyt & ~MYKKA); } catch (x) {}
        continue; }
      const l = o.getLocation(), c = l ? alueRuudussa(l.x, l.y) : -1; if (c >= 0) hahmoja[c]++;
      const piiloon = oma != null && String(o.type) === 'user' && c >= 0 && !nakyy[c];   // omaa indeksiä ei tunneta -> ketään ei piiloteta
      mykista(o, piiloon); if (piiloon) h++;
    }
    for (const id of [...mykat.keys()]) if (!nahdytH.has(id)) mykat.delete(id);
    pim.hahmojaPiilossa = h; pim.nakyvat = nakyy;
    pim.alueet = k.alueet.map((a, i) => ({ i, n: a.n, x0: a.x0, y0: a.y0, x1: a.x1, y1: a.y1, suurin: a.suurin, nakyy: nakyy[i], furneja: furneja[i], hahmoja: hahmoja[i] }));
  } catch (x) { lokiPim({ virhe: String(x) }); } };

  const pimPois = [];
  { const h = window.huoneskriptit; if (h && typeof h.onNaytaPiilot === 'function') pimPois.push(h.onNaytaPiilot(() => paivita())); }   // heti kun :showrooms vaihtuu (682.js:502)
  paivita();
  const pimAjastin = setInterval(paivita, 250);
  pimennysPois = () => {
    clearInterval(pimAjastin);
    for (const f of pimPois) try { f(); } catch (x) {}
    for (let j = 0; j < Math.max(reiat.length, 1); j++) try { e.updateAreaHide(huone, REIKA + j, false, 0, 0, 0, 0, false); } catch (x) {} reiat = [];
    for (const o of [...asetettu.keys()]) try { o.model.setValue('furniture_wired_opacity', 1); o.model.setValue('furniture_wired_click_through', 0); } catch (x) {} asetettu.clear();
    for (const [id, m] of mykat) try { e.updateRoomObjectUserAction(huone, id, 'figure_is_muted', m.alkup); } catch (x) {} mykat.clear();
    if (window.huone683 === pim) delete window.huone683;
  };
}

return () => {
  // siivous: pussi ja paikat nollataan (sona 14:42:21 "ei" pysyvyydelle), paneeli ja ilmoitus pois, kuuntelija pois, API pois
  try { pimennysPois(); } catch (x) {}
  pussi = false; paikat = new Array(PAIKKOJA).fill(null);
  clearInterval(ambulanssiVali); ambulanssissa = null;
  clearInterval(laattaVali); laatalla = null; akkuVahti.disconnect(); clearInterval(akkuVara); suljeLappu(); if (vayla && vayla.removeEventListener) vayla.removeEventListener('REOE_SELECTED', pysakkiValittu);
  kiinni = false; ankkuri = null; avaaAnkkuriin = null; sij[2] = null; sij[3] = null;
  vedto = null; otsikko = null;   // raahauksen kaappaus loppuu kun otsikko poistuu (paneeli poistetaan yllä)
  for (const a of ajastimet) clearTimeout(a); ajastimet.clear();
  for (const d of document.querySelectorAll('.h683-pussi')) d.remove(); paneeli = null; ruudut = [];
  ikk2 = null; v2kerros = null; v2kuva = null; kortti = null; kortKuva = null; v3ruudut = []; pilli = null;
  try { if (vayla && vayla.removeEventListener) vayla.removeEventListener('REOE_SELECTED', valittu); } catch (x) {}
  if (window.kupla683 === tila) delete window.kupla683;
};
