// Huoneskripti 424 zen den: lootbox-suora VAIN kurkkupomolle (id 282). kp 12.11. 08:37-08:38 "en haluu käyttää loaderii · huonescript" · kuiskaus "mulle vaa eka · suodatat pelaajilla".
// Kopio userscriptit/lootbox-suora/lootbox-suora.user.js (re-lab) sellaisenaan + tämä kääre. Muut pelaajat: ei mitään.
// Pysäytys (huoneesta lähtö): paneeli pois, käynnissä oleva ajo pysäytetään.
const SALLITUT = [282, 123];   // kp, Ezkey (kp kuiskaus 08:47 "jaa ezille ja semsille" -> "tai ezille nyt eka")
const omaId = () => { try { const d = (o, k) => { const x = o && Object.getOwnPropertyDescriptor(o, k); return x ? x.value : undefined; }; const e = window.NitroDevTools && window.NitroDevTools.roomEngine; const u = d(d(e, "_sessionDataManager"), "_userId"); return u > 0 ? u : 0; } catch (x) { return 0; } };
if (!SALLITUT.includes(omaId())) return () => {};
// ==UserScript==
// @name         Kupla Lootbox-suora
// @namespace    https://re-lab.local/kupla
// @match        https://kupla.cc/*
// @grant        none
// @run-at       document-idle
// @version      0.3.1
// @kupla-oletus off
// @description  Avaa OMAT lootboxit suoraan inventaarion datasta (ei UI-nappeja, inventaarioikkuna ei sulkeudu). Start/Stop-paneeli vasemmassa alakulmassa. Vain oma client, oma tili.
// @author       re-lab
// ==/UserScript==
//
// kp 2026-11-12 08:08 "suoraan inventoorist" / "huonemoottorin kautta". Sisarskripti lootbox-avaaja ajaa pelin UI:ta (Tavarat-nappi, haku,
// solun valinta, "Avaa lootbox täällä"), ja pelin oma nappi sulkee inventaarion (InventoryFurnitureView.tsx:141 'inventory/hide').
// Tämä skripti ohittaa UI:n: lukee oman inventaarion clientin omasta yhteydestä ja lähettää avauspaketin pelin omalla
// connection.sendPacket(9880,[itemId])-kutsulla (sama kutsu kuin LootboxTransport.ts:8). Mikään ei käynnisty ennen Start-painallusta.
//
// MITÄ LÄHETETÄÄN (vain nämä kaksi, ei muuta):
//   3150  inventaarion pyyntö (tyhjä; FurnitureListComposer, vain luku) -- kerran per Start
//   9880  lootboxin avaus, yksi int = inventaarion item id; vain id, joka tuli 994-vastauksesta JA jonka esinenimi täsmää suodattimeen.
//   Avauksia ei koskaan kahta alle 2 s välein, ja seuraava vasta kun edellisen seremonian overlay (.lootbox-ceremony) on poistunut DOMista.
//
// MITEN CLIENTIN SISÄLMYKSIIN PÄÄSTÄÄN (userscriptistä, sivun kontekstissa):
//   yhteys:   window.NitroDevTools.roomEngine._roomSessionManager -> skannaus (syvyys 4) kunnes löytyy olio jolla on oma kenttä '_cryptoState'
//             (sama kuin nitro/mf-lib.js:81-85). Pelin oma GetConnection() ei ole globaali.
//   inventaario: conn._messages._messageInstancesById.get(994)[0] antaa FurnitureListEvent-luokan; sen uusi instanssi rekisteröidään
//             conn.addMessageEvent():llä ja poistetaan conn.removeMessageEvent():llä heti kun kaikki fragmentit ovat tulleet (tai Stop/virhe).
//             Pelin omaa käsittelijää EI muokata (mf-lib.js:91-93 korvaa list[0]._callBack:n eikä palauta sitä).
//   nimet:    994-paketissa ei ole nimeä; nimi = RoomEngine._sessionDataManager.getFloorItemData(spriteId).name (= pelin roomItem.name.<sprite>,
//             GroupItem.ts:344-351 ; FurnitureDataLoader.ts:181), varalla skannaus kuten nitro/probe-sprites.js:8-13.
//
// SUODATIN: kirjainkoolla, aksenteilla ja välimerkeillä ei ole väliä (tietokannassa nimet ovat ilman aksentteja, esim. "Bo te Cadeau No l",
//   D:/kupla-lahde/main-live/ops/lootbox/candidates.json:657). Suodattimen jokaisen sanan pitää löytyä esineen nimestä. Jos suodatin osuu
//   useampaan ERI nimeen, skripti kieltäytyy ja listaa nimet (tarkenna hakua) -- tarkoituksellinen poikkeama "nimi sisältää suodattimen"
//   -säännöstä, koska muuten väärä laatikkotyyppi voisi mennä läpi; kytkin ALLOW_MANY_NAMES.
//
// RAJAT (ei voitu todentaa ilman elävää clienttiä -- hotellisessio testaa):
//   - Ei ajettu yhtään kertaa oikeaa sivua vasten; kaikki kentät/valitsimet on johdettu client-lähteestä (lista tiedoston lopussa).
//   - Palvelimen virhe (busy/room_busy/no_space/not_lootbox...) tulee pelin ilmoitusikkunaan; skripti ei lue sitä. Onnistuminen todetaan
//     inventaarion uudelleenluvusta (item id poistunut) vähintään 10 s avauksesta; id yhä paikallaan = ajo pysähtyy.
//   - Overlay ei ole ehto: jos sitä ei näy 3 s:ssa (clientin lootboxConfig ei tunne spriteä), odotetaan 10 s ja tarkistetaan inventaario.
//     Jos overlay näkyy, odotetaan että se on poistunut DOMista (taustavälilehdessä rAF ei pyöri -> aikaraja 45 s, ajo pysähtyy).
//   - Toisen pelaajan seremonia samassa huoneessa voidaan tulkita omaksi (seurataan ensimmäistä UUTTA overlayta).
(function () {
  'use strict';
  if (window.__kuplaLootboxSuora) return; window.__kuplaLootboxSuora = true;

  const POLL = 250;               // kyselyväli, ms
  const MIN_GAP = 2000;           // kahden avauksen minimiväli, ms
  const T_INV = 15000;            // kaikki inventaariofragmentit saapuneet
  const T_START = 3000;           // uusi overlay ilmestyy avauspaketin jälkeen; ei ilmesty = clientin config ei tunne spriteä, avaus voi silti onnistua
  const T_NO_OVERLAY_MIN = 10000; // ilman overlayta: odota avauksesta vähintään tämä (palvelimen käyttäjälukko vapautuu ~9 s, LootboxTimeline.java:22)
  const T_CEREMONY = 45000;       // overlay poistuu DOMista (normaali ~14 s; client luovuttaa itse 30 s kohdalla, LootboxStore.ts:54)
  const MAX_CAP = 2000;           // kova katto "max per ajo" -kentälle
  const T_LOCK = 9500;            // palvelimen käyttäjälukko ~9 s avauksesta (LootboxTimeline.java:22) + 0,5 s varaa
  const MIN_FILTER = 4;           // suodattimen vähimmäispituus (aksentit/välimerkit pois)
  const ALLOW_MANY_NAMES = false; // false = kieltäydy jos suodatin osuu useampaan eri nimeen
  const HDR_INV = 3150, HDR_OPEN = 9880, HDR_INV_REPLY = 994;
  const CEREMONY = '.lootbox-ceremony';

  const STOP = { stop: true };
  class Fail extends Error { constructor(m) { super(m); this.fail = true; } }

  let running = false, stopped = false, opened = 0, lastOpenAt = 0;
  const pending = new Set();     // { t, rej } -- kaikki elävät ajastimet, Stop tyhjentää ne
  let readAbort = null;          // käynnissä olevan inventaariluvun peruutus (poistaa koukun)

  const sleep = (ms) => new Promise((res, rej) => {
    if (stopped) return rej(STOP);
    const e = { t: 0, rej };
    e.t = setTimeout(() => { pending.delete(e); stopped ? rej(STOP) : res(); }, ms);
    pending.add(e);
  });
  const waitFor = async (step, fn, ms) => {
    const t0 = Date.now();
    for (;;) {
      if (stopped) throw STOP;
      const v = fn(); if (v) return v;
      if (Date.now() - t0 >= ms) throw new Fail('aikakatkaisu: ' + step);
      await sleep(POLL);
    }
  };
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const dv = (o, k) => { const d = o && Object.getOwnPropertyDescriptor(o, k); return d && !d.get ? d.value : undefined; };   // mf-lib.js:12

  // ---- paneeli ----
  const css = document.createElement('style');
  css.textContent = '#kls-paneeli{position:fixed;left:8px;bottom:320px;z-index:70;width:230px;padding:8px;background:#1f2a37;color:#fff;border:2px solid #000;font:12px/16px sans-serif;box-shadow:2px 2px 0 rgba(0,0,0,.3)}'
    + '#kls-paneeli b{display:block;margin-bottom:4px}#kls-paneeli label{display:block;margin:2px 0}#kls-paneeli input{width:100%;box-sizing:border-box;margin:1px 0 3px;color:#000}'
    + '#kls-paneeli button{margin-right:4px;padding:2px 10px;cursor:pointer}#kls-paneeli .kls-tila{margin-top:6px;min-height:32px;word-break:break-word}';
  document.head.appendChild(css);
  const box = document.createElement('div'); box.id = 'kls-paneeli';
  box.innerHTML = '<b>Lootbox-suora</b>'
    + '<button type="button" class="kls-lue">Lue varasto</button>'
    + '<label>Lootbox varastossa<select class="kls-valinta" style="width:100%;color:#000"><option value="">(paina Lue varasto)</option></select></label>'
    + '<label>Laatikon nimi<input type="text" class="kls-nimi" value=""></label>'
    + '<label>Sprite-id (valinnainen, 2. suodatin)<input type="number" class="kls-sprite" value="" placeholder="esim. 2100114978"></label>'
    + '<label>Max per ajo<input type="number" class="kls-max" value="100" min="1" max="' + MAX_CAP + '"></label>'
    + '<button type="button" class="kls-start">Start</button><button type="button" class="kls-stop" disabled>Stop</button>'
    + '<div>Avattu tällä ajolla: <span class="kls-laskuri">0</span></div><div class="kls-tila">Valmiina. Ei käynnissä.</div>';
  document.body.appendChild(box);
  const elStart = $('.kls-start', box), elStop = $('.kls-stop', box), elCount = $('.kls-laskuri', box), elStatus = $('.kls-tila', box);
  const elName = $('.kls-nimi', box), elMax = $('.kls-max', box), elSprite = $('.kls-sprite', box);
  const status = (s) => { elStatus.textContent = s; try { console.log('[lootbox-suora]', s); } catch (e) {} };
  const setCount = (n) => { elCount.textContent = String(n); };

  // ---- clientin sisälmykset ----
  const getRE = () => {
    const dt = window.NitroDevTools;
    const RE = dt && dt.roomEngine;
    if (!RE) throw new Fail('window.NitroDevTools.roomEngine puuttuu (client ei vielä valmis?)');
    return RE;
  };
  // mf-lib.js:81-85: skannaa _roomSessionManagerista olio jolla on oma kenttä _cryptoState (= SocketConnection, SocketConnection.ts:76)
  const findConn = (RE) => {
    const seen = new Set(); let conn = null;
    const scan = (o, d) => {
      if (!o || conn || d > 4 || typeof o !== 'object' || seen.has(o)) return; seen.add(o);
      if (Object.getOwnPropertyDescriptor(o, '_cryptoState')) { conn = o; return; }
      for (const k of Object.getOwnPropertyNames(o)) { const de = Object.getOwnPropertyDescriptor(o, k); if (de && !de.get && de.value && typeof de.value === 'object') scan(de.value, d + 1); }
    };
    scan(dv(RE, '_roomSessionManager'), 0);
    if (!conn) throw new Fail('yhteysolioa (_cryptoState) ei löydy RoomEngine._roomSessionManagerin alta');
    if (typeof conn.sendPacket !== 'function') throw new Fail('yhteysolion sendPacket puuttuu');
    return conn;
  };
  const roomId = (RE) => { const r = RE.activeRoomId; return (typeof r === 'number' && r > 0) ? r : 0; };
  // probe-sprites.js:8-13 -- varalla jos RoomEngine._sessionDataManager ei ole suoraan luettavissa
  const findSdm = (RE) => {
    const direct = dv(RE, '_sessionDataManager') || RE._sessionDataManager;
    if (direct && typeof direct.getFloorItemData === 'function') return direct;
    const seen = new Set(); let sdm = null;
    const scan = (o, d) => {
      if (!o || sdm || d > 5 || typeof o !== 'object' || seen.has(o)) return; seen.add(o);
      if (typeof o.getFloorItemData === 'function') { sdm = o; return; }
      for (const k of Object.getOwnPropertyNames(o)) { const de = Object.getOwnPropertyDescriptor(o, k); if (de && !de.get && de.value && typeof de.value === 'object') scan(de.value, d + 1); }
    };
    scan(RE, 0);
    if (!sdm) throw new Fail('SessionDataManageria (getFloorItemData) ei löydy -- esineiden nimiä ei voi lukea');
    return sdm;
  };

  // Pyytää inventaarion (3150) ja kerää 994-vastauksen kaikki fragmentit omalla, väliaikaisella viestikäsittelijällä.
  // Palauttaa [{ id, sprite }] (vain lattiaesineet). Koukku poistetaan aina (valmis / aikakatkaisu / Stop / virhe).
  const readInventory = (conn) => new Promise((resolve, reject) => {
    const msgs = dv(conn, '_messages');
    const byId = msgs && dv(msgs, '_messageInstancesById');
    const base = byId && byId.get && (byId.get(HDR_INV_REPLY) || [])[0];
    if (!base) return reject(new Fail('994-käsittelijää (inventaarion vastaus) ei löydy yhteysolion _messages-kartasta'));
    if (typeof conn.addMessageEvent !== 'function' || typeof conn.removeMessageEvent !== 'function') return reject(new Fail('conn.addMessageEvent/removeMessageEvent puuttuu'));
    const items = new Map(), frags = new Set(); let total = 0, ev = null, timer = 0, done = false;
    const finish = (err) => {
      if (done) return; done = true;
      clearTimeout(timer); readAbort = null;
      try { if (ev) conn.removeMessageEvent(ev); } catch (e) {}
      if (err) reject(err); else resolve(Array.from(items.values()));
    };
    try {
      ev = new base.constructor((e) => {
        try {
          const p = e.getParser ? e.getParser() : e._parser;
          const tf = p.totalFragments ?? p._totalFragments, fn = p.fragmentNumber ?? p._fragmentNumber, f = p.fragment || p._fragment;
          if (tf != null) { total = tf; frags.add(fn); }
          if (f) for (const [, v] of f) {          // parseri on kertakäyttöinen, mutta kopioidaan silti heti (mf-lib.js:91-93)
            const id = v.itemId ?? v._itemId, sprite = v.spriteId ?? v._spriteId, wall = v.isWallItem ?? v._isWallItem;
            if (typeof id === 'number' && typeof sprite === 'number' && !wall) items.set(id, { id, sprite });
          }
          if (total > 0 && frags.size >= total) finish();
        } catch (x) { finish(new Fail('994-vastauksen luku epäonnistui: ' + (x && x.message ? x.message : x))); }
      });
      conn.addMessageEvent(ev);
      readAbort = () => finish(STOP);
      timer = setTimeout(() => finish(new Fail('aikakatkaisu: inventaarion vastaus (' + frags.size + '/' + total + ' fragmenttia)')), T_INV);
      if (!conn.sendPacket(HDR_INV, [])) finish(new Fail('sendPacket(3150) palautti false (yhteys ei valmis?)'));
    } catch (x) { finish(x instanceof Fail ? x : new Fail('inventaarion luku: ' + (x && x.message ? x.message : x))); }
  });

  const squash = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const tokensOf = (s) => String(s).split(/\s+/).map(squash).filter(Boolean);

  // ---- ajo ----
  const run = async () => {
    const filter = elName.value.trim();
    const tokens = tokensOf(filter);
    let spriteWanted = elSprite.value.trim() === '' ? null : parseInt(elSprite.value, 10);
    if (spriteWanted !== null && !(spriteWanted > 0)) throw new Fail('sprite-id ei kelpaa');
    const autoPick = spriteWanted === null && tokens.length === 0;   // kp 08:34 "pysähtyi suodatin liian lyhyt": tyhjä kenttä -> valitaan laatikko itse
    if (spriteWanted === null && !autoPick && tokens.join('').length < MIN_FILTER) throw new Fail('suodatin liian lyhyt (väh. ' + MIN_FILTER + ' kirjainta) eikä sprite-id:tä');
    const max = Math.max(1, Math.min(MAX_CAP, parseInt(elMax.value, 10) || 0));
    elMax.value = String(max);

    const RE = getRE();
    if (!roomId(RE)) throw new Fail('et ole huoneessa (lootbox avataan huoneessa)');
    let conn = findConn(RE);
    const sdm = findSdm(RE);

    status('Luetaan inventaario (3150)...');
    const inv = await readInventory(conn);
    if (stopped) throw STOP;

    const nameOf = new Map();
    const names = (sprite) => { if (!nameOf.has(sprite)) { const fd = sdm.getFloorItemData(sprite); nameOf.set(sprite, (fd && fd.name) || ''); } return nameOf.get(sprite); };
    if (autoPick) {
      const kinds = Array.from(new Set(inv.map((it) => it.sprite))).filter((s) => KNOWN_BOX_SPRITES.has(s) || BOXY.test(names(s)));
      if (kinds.length === 0) throw new Fail('varastossa ei tunnistettua lootboxia. Kirjoita laatikon nimi kenttään');
      if (kinds.length > 1) throw new Fail('varastossa ' + kinds.length + ' lootbox-tyyppiä (' + kinds.map(names).join(' | ') + '). Paina Lue varasto ja valitse listasta');
      spriteWanted = kinds[0]; elSprite.value = String(spriteWanted);
    }
    const hits = inv.filter((it) => { if (spriteWanted !== null && it.sprite !== spriteWanted) return false; if (!tokens.length) return true; const n = squash(names(it.sprite)); return n && tokens.every((t) => n.includes(t)); });
    const distinct = Array.from(new Set(hits.map((it) => names(it.sprite))));
    if (!hits.length) { status('Valmis: inventaariossa (' + inv.length + ' lattiaesinettä) ei ole esinettä jonka nimi sisältää "' + filter + '"' + (spriteWanted !== null ? ' ja sprite ' + spriteWanted : '') + '. Avattu 0.'); return; }
    if (distinct.length > 1 && !ALLOW_MANY_NAMES) throw new Fail('suodatin osuu ' + distinct.length + ' eri nimeen (' + distinct.slice(0, 5).join(' | ') + '); tarkenna hakua');
    hits.sort((a, b) => b.id - a.id);                         // uusin id ensin, kuten pelin getLastItem (GroupItem.ts:254)
    const todo = hits.slice(0, max);
    status('Löytyi ' + hits.length + ' kpl "' + distinct[0] + '". Avataan ' + todo.length + '.');

    let sent = 0; const sentIds = [];
    for (const it of todo) {
      if (stopped) throw STOP;
      const RE2 = getRE();
      if (!roomId(RE2)) throw new Fail('et ole enää huoneessa');
      conn = findConn(RE2);                                   // reconnectin jälkeen client pitää UUTTA yhteysolioa (mf-lib.js:98-99)
      const gap = lastOpenAt + MIN_GAP - Date.now();
      if (gap > 0) await sleep(gap);
      if (stopped) throw STOP;
      status('Avataan ' + (opened + 1) + '/' + todo.length + '...');
      // 0.3.0 (kp 08:30-08:31 "liian pitkä odotus noiden välis · tyhmä odotus"): EI odoteta animaatiota eikä lueta varastoa joka
      //   avauksen välissä. Odotetaan vain palvelimen käyttäjälukko (vapautuu ~9 s avauksesta, LootboxTimeline.java:22) + 0,5 s varaa.
      //   Onnistuminen tarkistetaan KERRAN lopuksi varastosta (montako valituista id:istä lähti).
      if (lastOpenAt) { const lock = lastOpenAt + T_LOCK - Date.now(); if (lock > 0) { status('Odotetaan palvelimen lukkoa ' + Math.ceil(lock / 1000) + ' s (' + (sent + 1) + '/' + todo.length + ')...'); await sleep(lock); } }
      if (stopped) throw STOP;
      lastOpenAt = Date.now();
      if (!conn.sendPacket(HDR_OPEN, [it.id])) throw new Fail('sendPacket(9880) palautti false (yhteys ei valmis?)');
      sent++; sentIds.push(it.id); setCount(sent);
    }
    status('Lähetetty ' + sent + '. Tarkistetaan varasto...');
    const rest = lastOpenAt + T_LOCK - Date.now(); if (rest > 0) await sleep(rest);
    const now = await readInventory(findConn(getRE()));
    const still = new Set(now.map((x) => x.id));
    opened = sentIds.filter((id) => !still.has(id)).length; setCount(opened);
    status('Valmis: ' + opened + '/' + sent + ' avattu' + (opened < sent ? ' (' + (sent - opened) + ' jäi varastoon: palvelin hylkäsi? katso pelin ilmoitus)' : '') + (hits.length > todo.length ? ', jäljellä ' + (hits.length - todo.length) : '') + '.');
  };

  const finish = (msg) => {
    running = false; elStart.disabled = false; elStop.disabled = true; elName.disabled = false; elMax.disabled = false;
    pending.forEach((e) => clearTimeout(e.t)); pending.clear();
    if (readAbort) { try { readAbort(); } catch (e) {} }
    if (msg) status(msg);
  };
  elStart.addEventListener('click', () => {
    if (running) return;
    running = true; stopped = false; opened = 0; setCount(0);
    elStart.disabled = true; elStop.disabled = false; elName.disabled = true; elMax.disabled = true;
    run().then(() => finish(), (e) => {
      if (e === STOP) finish('Pysäytetty. Avattu ' + opened + '. (Jo käynnistynyt seremonia jatkuu palvelimella.)');
      else finish('Pysähtyi: ' + (e && e.message ? e.message : e) + '. Avattu ' + opened + '.');
    });
  });
  elStop.addEventListener('click', () => {
    if (!running) return;
    stopped = true;
    pending.forEach((e) => { clearTimeout(e.t); e.rej(STOP); }); pending.clear();
    if (readAbort) { try { readAbort(); } catch (e) {} }
  });
  // ---- pudotusvalikko (kp 2026-11-12 08:26 "laita support molempii · dropdown") ----
  // Palvelimen lootbox-rivit (kupla_lootboxes, server/daybreak/lootbox-*.sql) -> items_base sprite_id. Lisäksi nimiosuma varalle,
  // jos livessä on laatikko jota tässä listassa ei ole (esim. "OG lootbox").
  const KNOWN_BOX_SPRITES = new Set([2100114949, 2100114978, 2100114948, 2100101136, 2100101806, 2100101858, 2100101811, 10322]);
  const BOXY = /loot ?box/i;   // vain nimi jossa lukee lootbox; muut tunnetaan sprite-listasta (laatikko/egg osui tavallisiin esineisiin, mitattu robolla)
  const elRead = $('.kls-lue', box), elPick = $('.kls-valinta', box);
  elRead.addEventListener('click', async () => {
    if (running) return;
    elRead.disabled = true; status('Luetaan varasto...');
    try {
      const RE = getRE(), conn = findConn(RE), sdm = findSdm(RE);
      const inv = await readInventory(conn);
      const groups = new Map();
      for (const it of inv) { const g = groups.get(it.sprite) || { n: 0, name: '' }; g.n++; groups.set(it.sprite, g); }
      for (const [s, g] of groups) { const fd = sdm.getFloorItemData(s); g.name = (fd && fd.name) || ('sprite ' + s); }
      const boxes = [...groups].filter(([s, g]) => KNOWN_BOX_SPRITES.has(s) || BOXY.test(g.name)).sort((a, b) => b[1].n - a[1].n);
      elPick.innerHTML = '';
      const o0 = document.createElement('option'); o0.value = ''; o0.textContent = boxes.length ? '(valitse laatikko)' : '(ei lootboxeja varastossa)'; elPick.appendChild(o0);
      for (const [s, g] of boxes) { const o = document.createElement('option'); o.value = String(s); o.textContent = g.name + ' (' + g.n + ')'; elPick.appendChild(o); }
      status('Varastossa ' + boxes.length + ' lootbox-tyyppiä. Valitse ja paina Start.');
    } catch (e) { status('Varaston luku epäonnistui: ' + (e && e.message ? e.message : e)); }
    elRead.disabled = false;
  });
  elPick.addEventListener('change', () => {
    if (!elPick.value) return;
    elSprite.value = elPick.value; elName.value = '';
    status('Valittu: ' + elPick.options[elPick.selectedIndex].textContent + '. Paina Start.');
  });

  window.__kuplaLootboxSuora = { stop: () => elStop.click(), paneeli: box };
})();

// ---- Riippuvuudet (symboli / kenttä / valitsin -> lähde). Client: D:/kupla-lahde/main-live/client ; DarkUI/src = D, Nitro_Render_V3/packages = R ----
// window.NitroDevTools.roomEngine                         R/../src/DevTools.ts:21-23 (Nitro_Render_V3/src/DevTools.ts)
// RoomEngine._roomSessionManager (oma kenttä)             R/room/src/RoomEngine.ts:63 ; luku dv()-tavalla nitro/mf-lib.js:85
// RoomEngine._sessionDataManager                          R/room/src/RoomEngine.ts:64
// RoomEngine.activeRoomId (getter, -1 = ei huonetta)      R/room/src/RoomEngine.ts:72 (kenttä), lab: nitro/mf-lib.js:97
// SocketConnection._cryptoState (oma kenttä)              R/communication/src/SocketConnection.ts:76 ; skannaus nitro/mf-lib.js:83
// SocketConnection._messages (MessageClassManager)        R/communication/src/SocketConnection.ts:33 ; luku nitro/mf-lib.js:87
// MessageClassManager._messageInstancesById Map<id,[ev]>  R/communication/src/messages/MessageClassManager.ts:8,45-63 ; luku nitro/mf-lib.js:90
// SocketConnection.addMessageEvent / removeMessageEvent   R/communication/src/SocketConnection.ts:1180-1192 (julkiset)
// SocketConnection.sendPacket(header, values): boolean    R/communication/src/SocketConnection.ts:939-947 ; sama kutsu D/api/lootbox/LootboxTransport.ts:8
// 3150 = USER_FURNITURE (lähtevä), tyhjät argumentit      R/communication/src/messages/outgoing/OutgoingHeader.ts:295 ; outgoing/inventory/furni/FurnitureListComposer.ts:9-17
// 994 = USER_FURNITURE (saapuva) -> FurnitureListEvent    R/communication/src/messages/incoming/IncomingHeader.ts:285 ; incoming/inventory/furni/FurnitureListEvent.ts:6-14
// parser.totalFragments / fragmentNumber / fragment(Map)  R/communication/src/messages/parser/inventory/furniture/FurnitureListParser.ts:6-63
// item.itemId / spriteId / isWallItem                     .../parser/inventory/furniture/FurnitureListItemParser.ts:103,118,183
// 9880 = LOOTBOX_OPEN_HEADER, args [abs(itemId)]          D/api/lootbox/LootboxProtocol.ts:8 ; LootboxTransport.ts:8
// SessionDataManager.getFloorItemData(spriteId).name      R/session/src/SessionDataManager.ts:615 ; R/api/src/nitro/session/IFurnitureData.ts:17 ; UI-nimi D/api/inventory/GroupItem.ts:344-351
// .lootbox-ceremony[data-phase]                           D/components/room/widgets/lootbox/LootboxCeremonyView.tsx:121,128,151,202
// overlay poistuu: revealAt+4500+400 / peruutus 2500 / 30 s D/api/lootbox/LootboxStore.ts:8-11,47-55
// palvelin: ei huoneessa/ei omistettu/ei lootbox/busy/room_busy  server/daybreak/lootbox-plugin/.../LootboxService.java:100-140 ; lukko 9 s: LootboxTimeline.java:22

return () => { try { const g = window.__kuplaLootboxSuora; if (g && g.stop) g.stop(); const p = document.querySelector("#kls-paneeli"); if (p) p.remove(); } catch (x) {} window.__kuplaLootboxSuora = undefined; };
