// Huone 681 (Miinarata): miinat. Huoneskripti, ei osa moottoria (kp 27.10. 17:04 "ne ei kuulu moottoriin", 17:10 "miinat piti olla
// 681 huoneen script koko aja"). Moottori ajaa tämän new Function('kupla', koodi)(api) kun huoneeseen tullaan, ja kutsuu lopussa
// palautettua funktiota kun huoneesta lähdetään tai tämä tiedosto muuttuu. Sama sopimus kuin Resin Messenger-moottorissa.
//
// Muokkaus: muuta tätä tiedostoa ja pushaa mainiin. Huoneessa olevat clientit hakevat muuttuneen version noin 15 s välein
// (+ Pagesin julkaisuviive ~1 min). Versiota EI tarvitse nostaa, eikä moottoriin tarvitse koskea.
// Miinanurmet: lisää tai poista furni-id ASETUS.furnit-listasta. Taikapinolla päällekkäin laitetut nurmet toimivat (ruudut yhdistetään).
// Konsolissa (testaus): miina.loki · miina.lennata = false · miina.muunnelma = 'makaa' | 'pyori' · miina.kesto = 1200
const ASETUS = {
  furni: 'fx_explosion',   // räjähdyksen furni-luokka (sen oma animaatio piirretään)
  kesto: 1500,             // ms
  // Laukaisu: wired antaa hahmolle efektin 4 (teleport) kun se astuu miinalle. Natiivi nopea tele ei anna efektiä,
  // joten hyppy suoraan miinaruudusta räjäyttää myös (ks. __liike).
  efekti: 4,
  furnit: [425447, 425455, 425528, 425463, 425510, 425486, 425487, 425459, 425490, 425456, 425505, 425457, 425506, 425488, 425526,
    425493, 425466, 425503, 425479, 425527, 425454, 425514, 425471, 425461, 425453, 425476, 425518, 425497, 425499, 425502, 425473,
    425452, 425515, 435482, 425470, 425483, 425512, 435377, 425513, 425448, 425462, 425519, 425511],
};

const e0 = window.NitroDevTools && window.NitroDevTools.roomEngine;
const huone = (kupla && kupla.roomId && kupla.roomId()) || (e0 && e0.activeRoomId);
// versio-kenttä: vanha 0.4.x-moottori ottaa window.miinan haltuunsa jos siltä puuttuu versio. Moottori 0.5 pysäyttää 0.4.x:n, tämä on varmistus.
const tila = window.miina = { versio: 'huone-681', huone, lennata: true, muunnelma: null, kesto: null, vali: 1500, piilotaPohja: true, loki: [] };
const saannot = tila.saannot = [{ furni: ASETUS.furni, kesto: ASETUS.kesto, efekti: ASETUS.efekti, furnit: ASETUS.furnit, ruudut: null }];

let seuraavaId = -930001;
const edellinen = new Map(), viimeksi = new Map(), paikka = new Map();

const data = (st) => ({ flags: 0, uniqueNumber: 0, uniqueSeries: 0, rarityLevel: -1, state: 0,
  writeRoomObjectModel(m) { m.setValue('furniture_data_format', 0); m.setValue('furniture_data', st); },
  initializeFromRoomObjectModel() {}, parseWrapper() {}, getLegacyString() { return st; },
  compare() { return false; }, setString() {}, getValue() { return ''; } });

// Räjähdys: paikallinen furni (negatiivinen id) ruutuun, tila 1 = animaatio, poisto keston jälkeen. Vain tässä clientissä.
tila.rajayta = (x, y, z, furni = 'fx_explosion', kesto = 1500) => {
  const e = window.NitroDevTools && window.NitroDevTools.roomEngine; if (!e) return false;
  const r = e.activeRoomId, V = e.getRoomObjects(r, 100)[0]?.getLocation().constructor; if (!V) return false;
  const id = seuraavaId--, L = new V(x, y, z), D = new V(0), ms = tila.kesto || kesto;
  if (!e.addFurnitureFloorByTypeName(r, id, furni, L, D, 0, data('0'), NaN, -1, 0, -1, '', true, false)) return false;
  const alku = performance.now();
  const piilo = tila.piilotaPohja ? setInterval(() => { const o = e.getRoomObject(r, id, 10); if (!o) return; for (const s of o.visualization.sprites) if (/_a_\d+_\d+$/.test(s.name)) s.visible = false; }, 16) : null;
  // tila 1 (animaatio) katosi jos se tuli ennen kuin visualisointi oli valmis -> vain pohja näkyi (kp 2/5). Odotetaan spritejä.
  let yrit = 0; const kaynnista = setInterval(() => { const o = e.getRoomObject(r, id, 10); yrit++;
    if ((o && o.visualization && o.visualization.sprites && o.visualization.sprites.length) || yrit > 30) { clearInterval(kaynnista); e.updateRoomObjectFloor(r, id, L, D, 1, data('1')); } }, 30);
  setTimeout(() => { clearInterval(piilo); e.removeRoomObjectFloor(r, id); tila.loki.push({ piirretty: true, x, y, ms: Math.round(performance.now() - alku) }); }, ms);
  return true;
};

// Hahmo lentää räjähdyksessä ilmaan (kp 27.10. 12:16). Vain omassa clientissä: paikallinen kopio hahmosta miinaruutuun, oikea hahmo
//   piiloon (alpha 0) ja sen sijaintipäivitykset pidätetään lennon ajan (__jaa); lopussa viimeisin päivitys ajetaan (kp 12:30, Res
//   "ei näkis itteänsä duplicatena"). Kaksi muunnelmaa ja satunnainen kaari (kp 12:29). Siemen = hahmo + ruutu + 5 s ikkuna,
//   joten eri clientit arpovat useimmiten saman. Pois: miina.lennata = false
let haamuId = -940001;
const lentavat = new Map();   // oid -> { args }
tila.__jaa = (rid, oid, args) => { const f = lentavat.get(oid); if (!f) return false; f.args = Array.prototype.slice.call(args); return true; };
const arpa = (s) => () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const piilota = (o, talteen) => { const sp = (o && o.visualization && o.visualization.sprites) || [];
  for (const s of sp) { if (!talteen.has(s)) talteen.set(s, { a: s.alpha, v: s.visible }); if (s.alpha !== 0 || s.visible) { s.alpha = 0; s.visible = false; if (s.increaseUpdateCounter) s.increaseUpdateCounter(); } } };
tila.lenna = (oid, x, y, z) => {
  const e = window.NitroDevTools && window.NitroDevTools.roomEngine; if (!tila.lennata || !e || oid == null || oid < 0 || lentavat.has(oid)) return false;
  const r = e.activeRoomId, o = e.getRoomObject(r, oid, 100); if (!o) return false;
  const V = o.getLocation().constructor, fig = o.model.getValue('figure'); if (!fig) return false;
  const rnd = arpa((oid * 73856093) ^ (Math.round(x) * 19349663) ^ (Math.round(y) * 83492791) ^ Math.floor(Date.now() / 5000));
  const arvo = rnd(), makaa = tila.muunnelma ? tila.muunnelma === 'makaa' : arvo < 0.5, kulma = rnd() * Math.PI * 2, matka = 0.5 + rnd() * 1.0, h = 2.5 + rnd() * 2.5;
  const kierrokset = (1 + Math.floor(rnd() * 3)) * (rnd() < 0.5 ? -1 : 1), ms = 900 + Math.floor(rnd() * 600), alkuSuunta = Math.floor(rnd() * 8);
  const kieriminen = 2 + Math.floor(rnd() * 3);   // makuu piirtyy vain kahteen suuntaan, 8 suunnan pyöritys välkkyi -> kieritään 90/180 välillä (kp 12:42)
  const dx = Math.cos(kulma) * matka, dy = Math.sin(kulma) * matka;
  const g = haamuId--, z0 = z || 0, alku = performance.now();
  if (!e.addRoomObjectUser(r, g, new V(x, y, z0), new V(alkuSuunta * 45), alkuSuunta * 45, 1, fig)) return false;
  const f = { args: null }, talteen = new Map(); lentavat.set(oid, f);
  const asento = () => { try { const ho = e.getRoomObject(r, g, 100); if (makaa && ho && ho.model.getValue('figure_posture') !== 'lay') e.updateRoomObjectUserPosture(r, g, 'lay', ''); } catch (x) {} };
  asento(); piilota(o, talteen);
  const ajo = setInterval(() => {
    const t = Math.min(1, (performance.now() - alku) / ms), suunta = makaa ? (Math.floor(t * kieriminen) % 2 ? 180 : 90) : (((alkuSuunta + Math.floor(t * 8 * Math.abs(kierrokset)) * Math.sign(kierrokset)) % 8) + 8) % 8 * 45;
    try { e.updateRoomObjectUserLocation(r, g, new V(x + t * dx, y + t * dy, z0 + 4 * h * t * (1 - t)), null, false, 0, new V(suunta), suunta, true, false, 30); } catch (x) {}
    asento(); piilota(e.getRoomObject(r, oid, 100) || o, talteen);
    if (t >= 1) { clearInterval(ajo); try { e.removeRoomObjectUser(r, g); } catch (x) {}
      for (const [s, v] of talteen) { s.alpha = v.a; s.visible = v.v; if (s.increaseUpdateCounter) s.increaseUpdateCounter(); }
      lentavat.delete(oid); if (f.args) try { e.updateRoomObjectUserLocation.apply(e, f.args); } catch (x) {}
      tila.loki.push({ lensi: oid, x, y, makaa, kulma: Math.round(kulma * 57.3), pidatetty: !!f.args }); }
  }, 30);
  return true;
};

// Ensimmäinen räjähdys jäi näkymättä, koska efektin grafiikka latautuu vasta ensikäytössä -> esilataus kartan ulkopuolelle.
const esilataus = setTimeout(() => tila.rajayta(-60, -60, 0, ASETUS.furni, 3000), 500);

// Tunnistus suoraan jokaisesta sijaintipäivityksestä (kp 23:47 "tyhmä tunnistus"): 50 ms kysely ei nähnyt miinaruutua, kun palvelin
//   lähetti askeleen miinalle ja teleportin samassa nipussa. Kutsutaan updateRoomObjectUserLocation-koukusta.
tila.__liike = (rid, oid, loc, tgt, kesto) => {
  if (rid !== huone || !saannot.length || oid < 0) return;
  // Teleport-hyppy ilman räjähdystä 1,5 s sisällä = hukka -> lokiin, jotta hukka näkyy datana.
  if (loc) { const ed = edellinen.get(oid); edellinen.set(oid, { x: loc.x, y: loc.y, z: loc.z, t: tgt ? [Math.round(tgt.x), Math.round(tgt.y)] : null });
    if (ed && Math.hypot(loc.x - ed.x, loc.y - ed.y) > 1.5 && Date.now() - (viimeksi.get(oid) || 0) > 1500) {
      // Nopea tele (Res 27.10. 12:09) ei anna efektiä 4, joten hyppy SUORAAN miinaruudusta (sijainti tai kohde) räjäyttää sen ruudun.
      const ehd = [[Math.round(ed.x), Math.round(ed.y)], ed.t].filter(Boolean);
      let osui = false;
      for (const [x, y] of ehd) { const s = saannot.find(s => s.ruudut && s.ruudut.has(x + ',' + y)); if (!s) continue;
        viimeksi.set(oid, Date.now()); tila.loki.push({ u: oid, x, y, tapa: 'hyppy', viive: 0 });
        tila.rajayta(x, y, ed.z || 0, s.furni, s.kesto); tila.lenna(oid, x, y, ed.z || 0); osui = true; break; }
      if (!osui) tila.loki.push({ u: oid, ohi: true, mista: [Math.round(ed.x), Math.round(ed.y)], kohde: ed.t, nyt: [Math.round(loc.x), Math.round(loc.y)] }); } }
  paikka.set(oid, { loc, tgt });
  for (const [P, tulossa] of [[tgt, true], [loc, false]]) {
    if (!P) continue; const x = Math.round(P.x), y = Math.round(P.y), k = x + ',' + y;
    const s = saannot.find(s => !s.efekti && s.ruudut && s.ruudut.has(k)); if (!s) continue;
    // Teleportin natiiviviiveen aikana hahmo ehtii astua 2-3 miinaruutuun -> yksi räjähdys per hahmo per miina.vali
    const nyt = Date.now(); if (nyt - (viimeksi.get(oid) || 0) < tila.vali) return;
    viimeksi.set(oid + '@' + k, nyt); viimeksi.set(oid, nyt);
    const viive = tulossa && loc && (Math.round(loc.x) !== x || Math.round(loc.y) !== y) ? (kesto > 0 ? kesto : 500) : 0;
    tila.loki.push({ u: oid, x, y, tapa: tulossa ? 'kohde' : 'sijainti', viive });
    setTimeout(() => { tila.rajayta(x, y, P.z, s.furni, s.kesto); tila.lenna(oid, x, y, P.z); }, viive);
    return;
  }
};
// Säännöllä "efekti": N laukaisu on PALVELIMEN oma hetki: wired antaa hahmolle efektin N (teleport = 4) kun se rekisteröi astumisen,
//   ja hahmon kohderuutu on silloin miinaruutu. kp 23:58 "teleport efekti tulee ennen teleporttia, siitä voisit tunnistaa".
//   Efekti tulee juuri ennen samassa nipussa olevaa liikepäivitystä (kohde = miinaruutu) -> arvioidaan 60 ms myöhemmin.
tila.__efekti = (rid, oid, fx) => { setTimeout(() => tila.__efektiNyt(rid, oid, fx), 60); };
tila.__efektiNyt = (rid, oid, fx) => {
  if (rid !== huone || !saannot.length) return;
  const p = paikka.get(oid) || {};
  for (const s of saannot) {
    if (s.efekti !== fx || !s.ruudut) continue;
    for (const [P, tulossa] of [[p.tgt, true], [p.loc, false]]) {
      if (!P) continue; const x = Math.round(P.x), y = Math.round(P.y); if (!s.ruudut.has(x + ',' + y)) continue;
      const nyt = Date.now(); if (nyt - (viimeksi.get(oid) || 0) < tila.vali) return; viimeksi.set(oid, nyt);
      const viive = tulossa && p.loc && (Math.round(p.loc.x) !== x || Math.round(p.loc.y) !== y) ? 500 : 0;
      tila.loki.push({ u: oid, x, y, tapa: 'efekti' + fx, viive });
      setTimeout(() => { tila.rajayta(x, y, P.z, s.furni, s.kesto); tila.lenna(oid, x, y, P.z); }, viive);
      return;
    }
    tila.loki.push({ u: oid, efekti: fx, ohi: true, loc: p.loc && [Math.round(p.loc.x), Math.round(p.loc.y)], tgt: p.tgt && [Math.round(p.tgt.x), Math.round(p.tgt.y)] });
  }
};

const ajastin = setInterval(() => {
  const e = window.NitroDevTools && window.NitroDevTools.roomEngine; if (!e || e.activeRoomId !== huone) return;
  for (const s of saannot) {
    // F5:n jälkeen furnin koko (furniture_size_x/y) puuttuu vielä ensimmäisillä tikeillä -> luettiin 1x1 ja vain 2x2-miinan kulma
    //   laukesi (kp 27.10. 16:57, 43/172 ruutua). Lasketaan uudelleen joka tiki kunnes jokainen furni JA sen koko löytyy,
    //   sen jälkeen 5 s välein (furnia voi siirtää). Furni voi olla monta ruutua (681:n nurmi 2x2) -> kaikki sen ruudut.
    const nyt = Date.now(); if (s.ruudutValmis && nyt - (s.ruudutAika || 0) < 5000) continue;
    const set = new Set(); let kaikki = true;
    for (const id of s.furnit || []) { const o = e.getRoomObject(huone, id, 10), L = o?.getLocation(); if (!L) { kaikki = false; continue; }
      const m = o.model, sx = Number(m?.getValue?.('furniture_size_x')), sy = Number(m?.getValue?.('furniture_size_y'));
      if (!(sx > 0) || !(sy > 0)) kaikki = false;
      const k = Math.round(o.getDirection?.()?.x || 0) % 180 === 90, w = (k ? sy : sx) || 1, h = (k ? sx : sy) || 1;
      for (let dx = 0; dx < w; dx++) for (let dy = 0; dy < h; dy++) set.add((Math.round(L.x) + dx) + ',' + (Math.round(L.y) + dy)); }
    if (set.size) s.ruudut = set;
    s.ruudutValmis = kaikki && set.size > 0; s.ruudutAika = nyt;
  }
  // Koukut asennetaan kerran per client ja ne delegoivat window.miinaan, joten skriptin pysäytys (window.miina pois) tekee niistä
  //   tyhjiä ja seuraava ajo ottaa ne taas käyttöön. Samat liput kuin 0.4.x-moottorilla, joten sen jo asentamia ei asenneta toiseen kertaan.
  if (!e.__miinaEfektiKoukku) { const orig = e.updateRoomObjectUserEffect; e.__miinaEfektiKoukku = true;
    e.updateRoomObjectUserEffect = function (rid, oid, fx) { try { const k = window.miina && window.miina.__efekti; if (k) k(rid, oid, fx); } catch (x) {} return orig.apply(this, arguments); }; }
  if (!e.__miinaKoukku) { const orig = e.updateRoomObjectUserLocation; e.__miinaKoukku = true;
    e.updateRoomObjectUserLocation = function (rid, oid, loc, tgt) { try { const k = window.miina && window.miina.__liike; if (k) k(rid, oid, loc, tgt, arguments[10]); } catch (x) {} return orig.apply(this, arguments); }; }
  if (!e.__miinaKoukku2) { const ed = e.updateRoomObjectUserLocation; e.__miinaKoukku2 = true;   // lennon ajan pidätys (ulompi kerros)
    e.updateRoomObjectUserLocation = function (rid, oid) { try { const k = window.miina && window.miina.__jaa; if (k && k(rid, oid, arguments)) return true; } catch (x) {} return ed.apply(this, arguments); }; }
}, 50);

// Pysäytys: moottori kutsuu tätä kun huoneesta lähdetään tai tämä tiedosto muuttuu. Kesken olevat räjähdykset ja lennot päättyvät itse.
return () => {
  clearInterval(ajastin); clearTimeout(esilataus); lentavat.clear();
  if (window.miina === tila) delete window.miina;
};
