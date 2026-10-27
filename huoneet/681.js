// Huone 681 (Miinarata): miinat. Huoneskripti, ei osa moottoria (kp 27.10. 17:04 "ne ei kuulu moottoriin", 17:10 "miinat piti olla
// 681 huoneen script koko aja"). Moottori ajaa tämän new Function('kupla', koodi)(api) kun huoneeseen tullaan, ja kutsuu lopussa
// palautettua funktiota kun huoneesta lähdetään tai tämä tiedosto muuttuu. Sama sopimus kuin Resin Messenger-moottorissa.
//
// Muokkaus: muuta tätä tiedostoa ja pushaa mainiin. Huoneessa olevat clientit hakevat muuttuneen version noin 15 s välein
// (+ Pagesin julkaisuviive ~1 min). Versiota EI tarvitse nostaa, eikä moottoriin tarvitse koskea.
// Miinanurmet: lisää tai poista furni-id ASETUS.furnit-listasta. Taikapinolla päällekkäin laitetut nurmet toimivat (ruudut yhdistetään).
// Konsolissa (testaus): miina.loki · miina.lennata = false · miina.muunnelma = 'makaa' | 'pyori' | 'istu' · miina.lepo = 700 · miina.kesto = 1200
const ASETUS = {
  furni: 'fx_explosion',   // räjähdyksen furni-luokka (sen oma animaatio piirretään)
  kesto: 1500,             // ms
  // Laukaisu: wired antaa hahmolle efektin 4 (teleport) kun se astuu miinalle. Natiivi nopea tele ei anna efektiä,
  // joten hyppy suoraan miinaruudusta räjäyttää myös (ks. __liike).
  efekti: 4,
  // kp 27.10. 18:13 "teleportti efekti näkyy edellee liian aikasin": NOPEA tele antaa efektin 235, ei 4 (Habbo-Daybreak
  //   WiredEffectTeleport.java:37-38 NORMAL 4 / FAST 235, :105 lähetys 1 tikin ennen siirtoa). Pidätys ja tunnistus kattavat molemmat.
  efektit: [4, 235],
  furnit: [425447, 425455, 425528, 425463, 425510, 425486, 425487, 425459, 425490, 425456, 425505, 425457, 425506, 425488, 425526,
    425493, 425466, 425503, 425479, 425527, 425454, 425514, 425471, 425461, 425453, 425476, 425518, 425497, 425499, 425502, 425473,
    425452, 425515, 435482, 425470, 425483, 425512, 435377, 425513, 425448, 425462, 425519, 425511],
};

const e0 = window.NitroDevTools && window.NitroDevTools.roomEngine;
const huone = (kupla && kupla.roomId && kupla.roomId()) || (e0 && e0.activeRoomId);
// versio-kenttä: vanha 0.4.x-moottori ottaa window.miinan haltuunsa jos siltä puuttuu versio. Moottori 0.5 pysäyttää 0.4.x:n, tämä on varmistus.
const tila = window.miina = { versio: 'huone-681', huone, lennata: true, muunnelma: null, kesto: null, vali: 1500, lepo: 700, piilotaPohja: true, loki: [] };
const saannot = tila.saannot = [{ furni: ASETUS.furni, kesto: ASETUS.kesto, efekti: ASETUS.efekti, efektit: ASETUS.efektit, furnit: ASETUS.furnit, ruudut: null }];

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
// kp 27.10. 18:24 "hahmo välähtää teleport pisteel ku astuu miinaa": nopea tele siirtää hahmon 1 tiki (500 ms) efektin 235 jälkeen,
//   eli samaan aikaan kun lento vasta alkaa (räjähdys odottaa askeleen miinalle, viive 500). Miinan tunnistuksesta lähtien hyppy (> 1,5 ruutua
//   nykyisestä paikasta) pidätetään (varatut) ja lenna() ottaa sen omakseen; jos lentoa ei tule, se ajetaan viimeistään 1,5 s kuluttua.
const varatut = new Map();   // oid -> { args, aika }
const varaa = (oid) => varatut.set(oid, { args: null, aika: Date.now() });
const purraVaraus = (oid) => { const v = varatut.get(oid); varatut.delete(oid); const e = window.NitroDevTools && window.NitroDevTools.roomEngine;
  if (v && v.args && e) try { e.updateRoomObjectUserLocation.apply(e, v.args); } catch (x) {} };
tila.__jaa = (rid, oid, args) => { const f = lentavat.get(oid); if (f) { f.args = Array.prototype.slice.call(args); return true; }
  const v = varatut.get(oid); if (!v || rid !== huone) return false;
  if (Date.now() - v.aika > 1500) { purraVaraus(oid); return false; }
  const e = window.NitroDevTools && window.NitroDevTools.roomEngine, o = e && e.getRoomObject(rid, oid, 100), L = o && o.getLocation(), uusi = args[2];
  if (!L || !uusi || Math.hypot(uusi.x - L.x, uusi.y - L.y) <= 1.5) return false;
  v.args = Array.prototype.slice.call(args); return true; };
const arpa = (s) => () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const piilota = (o, talteen) => { const sp = (o && o.visualization && o.visualization.sprites) || [];
  for (const s of sp) { if (!talteen.has(s)) talteen.set(s, { a: s.alpha, v: s.visible }); if (s.alpha !== 0 || s.visible) { s.alpha = 0; s.visible = false; if (s.increaseUpdateCounter) s.increaseUpdateCounter(); } } };
tila.lenna = (oid, x, y, z) => {
  const e = window.NitroDevTools && window.NitroDevTools.roomEngine; if (!tila.lennata || !e || oid == null || oid < 0 || lentavat.has(oid)) return false;
  const r = e.activeRoomId, o = e.getRoomObject(r, oid, 100); if (!o) return false;
  const V = o.getLocation().constructor, fig = o.model.getValue('figure'); if (!fig) return false;
  const rnd = arpa((oid * 73856093) ^ (Math.round(x) * 19349663) ^ (Math.round(y) * 83492791) ^ Math.floor(Date.now() / 5000));
  // Kolme muunnelmaa (kp 27.10. 18:08:58 "istumis version, et lentää istuma asennos"): seiso-pyöri / makaa / istu, kukin 1/3.
  //   kp 18:15 "makuuasennos lento on vähä huono. poistetaan ja jätetään se vaan siihen kun osuu maahan": arvonnassa vain istu / pyori (1/2),
  //   makuu vain laskeutumisessa. 'makaa' toimii yhä konsolista (miina.muunnelma) vertailuun.
  const arvo = rnd(), laji = tila.muunnelma || (arvo < 0.4 ? 'istu' : 'pyori'), makaa = laji === 'makaa', istu = laji === 'istu';
  // kp 18:12 "jos hahmo vois lentää ylipäätää kauemmaks räjähdyspisteestä, ei vaa korkeemmalle": matka 1,5-3,5 ruutua (ennen 0,5-1,5), korkeus ennallaan.
  //   kp 18:13 "lennon voimakkuuteen variaatiota, välil mega lento välil normaalimpi": voima 1-3 painotettu pieneen (rnd^3: ~70 % alle 1,7,
  //   ~10 % yli 2,5). kp 18:20 "minimi korkeutta matalemmalle et vois melkee lentää maata pitkin": kaaren huippu 0,3-5 (ennen 2,5-5). Matka = (1,5-3,5) x voima, korkeus kasvaa vähän (x 0,8-1,3) ja kesto (x 0,6-1,4).
  const voima = 1 + 2 * Math.pow(rnd(), 3), kulma = (() => { const k = rnd(), puoli = k < 0.5 ? 0 : Math.PI;   // Res 18:29 "vitun outo kun lensi suoraa kameraa päi": kameran akseli (+x+y) ±30° pois
    return Math.PI / 4 + puoli + (Math.PI / 6) + ((k % 0.5) * 2) * (Math.PI * 2 / 3); })(), matka = (1.5 + rnd() * 2.0) * (1 + 0.5 * (voima - 1)), h = (2.5 + rnd() * 2.5) * (0.8 + 0.25 * (voima - 1));
  // 18:30 Res "takas se kaari · matala kaari pois" -> huippu taas 2,5-5. kp "lento takas lyhyemmäks": voiman vaikutus matkaan puolitettu (max x2, 1,5-7 ruutua).
  // kp 18:08 "keskiverto spinnin määrä vois olla vähemmän" + "molemmat voi olla tosi hitaita välil, iso rng factor":
  //   kierroksia 0,1-2,0, painotettu hitaaseen (rnd^2 -> keskiarvo ~0,73). Ennen 1-3 (ka 2).
  const kierrokset = (0.3 + 0.9 * Math.pow(rnd(), 2)) * (rnd() < 0.5 ? -1 : 1), ms = Math.round((600 + rnd() * 500) * (1 + 0.18 * (voima - 1)));
  // Res 18:32 "pyöriminen vois olla vähemmän rare": pyöriminen 60 % (ennen 50 %), kierroksia 0,4-2 (ennen 0,1-2).
  //   kp 18:33 "tai vähemmän pyörimistä overall": useammin mutta vähemmän, 0,3-1,2 kierrosta.
  // kp 18:32 "välil on oudon pitkää kyl ilmas · jos se ois nopeempi": ilmassa 0,6-1,5 s (ennen 0,5-2,7), voima pidentää enää vähän.
  // kp 18:21 "lensin seinän sisää · teehän siihen collision, tehtii shootterii ettei voi ampuu seinien läpi": lentorata käydään 0,1 ruudun
  //   askelin. Este = kartan ulkopuoli, seinä/tyhjä (seinägeometrian korkeus > 1,5 lähtökorkeuden yli) tai yli 2 korkea kaluste. Ensimmäinen
  //   este pysäyttää lennon 0,6 ruutua ennen sitä. Laskeutumiskorkeus = kohderuudun pinnan korkeus.
  const zA = z || 0, esto = (() => { try { const m = e.getFurnitureStackingHeightMap(r), gw = e.getLegacyWallGeometry(r);
    return (px, py) => { const tx = Math.round(px), ty = Math.round(py); if (!m || !m.validPosition(tx, ty)) return true;
      if (gw && gw.getHeight(tx, ty) - zA > 1.5) return true; return m.getTileHeight(tx, ty) - zA > 2; }; } catch (x) { return () => false; } })();
  let lento = matka; for (let d = 0.1; d <= matka; d += 0.1) if (esto(x + Math.cos(kulma) * d, y + Math.sin(kulma) * d)) { lento = Math.max(0, d - 0.6); break; }
  const dx = Math.cos(kulma) * lento, dy = Math.sin(kulma) * lento;
  const zL = (() => { try { const m = e.getFurnitureStackingHeightMap(r), h2 = m.getTileHeight(Math.round(x + dx), Math.round(y + dy)); return isFinite(h2) && Math.abs(h2 - zA) <= 2 ? h2 : zA; } catch (x) { return zA; } })();
  // Makuu piirtyy vain kahteen suuntaan: clientin AvatarImage.appendAction(lay) pakottaa suunnan 0 -> 4 ja KAIKKI muut -> 2
  //   (Nitro_Render_V3 avatar/AvatarImage.ts:482). Vanha 90/180-kieritys oli siksi aina 2 = jalat oikealle (kp 27.10. 17:39).
  //   Puoli lennon suunnasta ruudulla (ruudun x ~ x - y): vasemmalle lentävä makaa jalat vasemmalle.
  //   kp 18:08 "spinnii myös lay versiossa": makuussa pyöritys = puolen vaihto tasaisesti, päättyy aina lentosuunnan puolelle.
  //   Istuma piirtyy siististi vain parillisiin suuntiin -> istuen pyöritään 2 suunnan askelin.
  const makuuSuunta = (dx - dy) < 0 ? 0 : 90, puolikkaat = Math.max(1, Math.round(2 * Math.abs(kierrokset))), alkuSuunta = makaa ? makuuSuunta / 45 : istu ? 2 * Math.floor(rnd() * 4) : Math.floor(rnd() * 8);
  const suuntaHetkella = t => makaa ? (((puolikkaat - Math.min(puolikkaat, Math.floor(t * (puolikkaat + 1)))) % 2) ? 90 - makuuSuunta : makuuSuunta)
    : istu ? (((alkuSuunta + 2 * Math.floor(t * 4 * Math.abs(kierrokset)) * Math.sign(kierrokset)) % 8) + 8) % 8 * 45
    : (((alkuSuunta + Math.floor(t * 8 * Math.abs(kierrokset)) * Math.sign(kierrokset)) % 8) + 8) % 8 * 45;
  const g = haamuId--, z0 = z || 0, alku = performance.now();
  if (!e.addRoomObjectUser(r, g, new V(x, y, z0), new V(alkuSuunta * 45), alkuSuunta * 45, 1, fig)) return false;
  const vr = varatut.get(oid); varatut.delete(oid);
  const f = { args: (vr && vr.args) || null }, talteen = new Map(); lentavat.set(oid, f);
  let maassa = 0, lepoSuunta = 0;
  const asento = () => { try { const ho = e.getRoomObject(r, g, 100), haluttu = (makaa || maassa) ? 'lay' : istu ? 'sit' : null;
    if (haluttu && ho && ho.model.getValue('figure_posture') !== haluttu) e.updateRoomObjectUserPosture(r, g, haluttu, ''); } catch (x) {} };
  asento(); piilota(o, talteen);
  // kp 18:19 "vähä laginen välil toi lento": ruutu kerrallaan (requestAnimationFrame) 30 ms ajastimen sijaan; piilotetussa välilehdessä setTimeout.
  let ohi = false; const seuraava = () => { if (!ohi) { if (document.hidden) setTimeout(askel, 30); else requestAnimationFrame(askel); } };
  const askel = () => { if (ohi) return;
    const nyt = performance.now(), t = Math.min(1, (nyt - alku) / ms);
    // kp 18:10 "lame et hahmo katoo kokonaan kun tippuu maahan · voisko se ihan lyhyen aikaa makaa maassa siin mihin laskeutuu ·
    //   ottaa huomioon miten päin hahmo oli kun osuu maahan": laskeutuessa haamu jää makaamaan (miina.lepo ms), puoli viimeisestä suunnasta.
    if (t >= 1 && !maassa) { maassa = nyt; const d = suuntaHetkella(1); lepoSuunta = makaa ? d : ((d / 45 + 1) % 8 < 4 ? 90 : 0);
      try { e.updateRoomObjectUserLocation(r, g, new V(x + dx, y + dy, zL), null, false, 0, new V(lepoSuunta), lepoSuunta, true, false, 30); } catch (x) {} }
    if (!maassa) { const suunta = suuntaHetkella(t);
      try { e.updateRoomObjectUserLocation(r, g, new V(x + t * dx, y + t * dy, z0 + (zL - z0) * t + 4 * h * t * (1 - t)), null, false, 0, new V(suunta), suunta, true, false, 16); } catch (x) {} }
    asento(); piilota(e.getRoomObject(r, oid, 100) || o, talteen);
    if (maassa && nyt - maassa >= (tila.lepo || 0)) { ohi = true; try { e.removeRoomObjectUser(r, g); } catch (x) {}
      for (const [s, v] of talteen) { s.alpha = v.a; s.visible = v.v; if (s.increaseUpdateCounter) s.increaseUpdateCounter(); }
      // Pidätetty päivitys on yleensä miinan oma teleport takaisin: hyppy miinaruudusta > 1,5 s räjähdyksen jälkeen laukaisi
      //   __liike-tunnistuksen toiseen kertaan (simulaatio 27.10.: kaksi lentoa yhdestä miinasta). Laskeutuminen nollaa ajan.
      viimeksi.set(oid, Date.now());
      lentavat.delete(oid); if (f.args) try { e.updateRoomObjectUserLocation.apply(e, f.args); } catch (x) {}
      tila.loki.push({ lensi: oid, x, y, laji, voima: Math.round(voima * 100) / 100, matka: Math.round(lento * 10) / 10, este: lento < matka, kierrokset: Math.round(kierrokset * 100) / 100, lepoPuoli: lepoSuunta ? 'oikea' : 'vasen', kulma: Math.round(kulma * 57.3), pidatetty: !!f.args }); }
    seuraava();
  };
  seuraava();
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
tila.__efekti = (rid, oid, fx) => { if (toisto) return; setTimeout(() => tila.__efektiNyt(rid, oid, fx), 60); };

// Teleport-efekti näkyi hahmossa ennen räjähdystä ja paljasti miinan (kp 27.10. 17:37 "teleportti effect spoilaa ku tulee ennen
//   räjähdyst · viivytä sitä"). Efektin 4 päivitys pidätetään (ulompi koukku __efektiPidata) kunnes miina on tunnistettu (60 ms).
//   Jos miina laukesi: pidätys jatkuu räjähdykseen + efektiViive, ja lennon aikana kunnes hahmo laskeutuu, joten efekti näkyy vasta
//   laskeutumispaikassa. Saman hahmon muut efektipäivitykset (esim. efektin poisto) jonoon ja ajetaan järjestyksessä, ettei efekti jää päälle.
tila.efektiViive = 200;
const pidatetyt = new Map();   // oid -> { jono: [args], jatko, ajastin, alku }
let toisto = false;
const vapauta = (oid, pakota) => {
  const p = pidatetyt.get(oid); if (!p) return; clearTimeout(p.ajastin);
  if (!pakota && lentavat.has(oid) && Date.now() - p.alku < 5000) { p.ajastin = setTimeout(() => vapauta(oid), 50); return; }
  pidatetyt.delete(oid);
  const e = window.NitroDevTools && window.NitroDevTools.roomEngine; if (!e) return;
  toisto = true; try { for (const a of p.jono) try { p.jatko.apply(e, a); } catch (x) {} } finally { toisto = false; }
  tila.loki.push({ efekti: 'vapautettu', u: oid, n: p.jono.length, ms: Date.now() - p.alku });
};
tila.__efektiPidata = (rid, oid, args, jatko) => {
  if (toisto || rid !== huone || oid < 0) return false;
  const p = pidatetyt.get(oid); if (p) { p.jono.push(Array.prototype.slice.call(args)); return true; }
  if (!ASETUS.efektit.includes(args[2])) return false;
  pidatetyt.set(oid, { jono: [Array.prototype.slice.call(args)], jatko, alku: Date.now(), ajastin: setTimeout(() => vapauta(oid), 120) });
  tila.__efekti(rid, oid, args[2]);   // tunnistus nyt: sisempi koukku näkee tämän vasta vapautuksessa
  return true;
};
const pidennaEfekti = (oid, ms) => { const p = pidatetyt.get(oid); if (!p) return; clearTimeout(p.ajastin); p.ajastin = setTimeout(() => vapauta(oid), ms); };
tila.__efektiNyt = (rid, oid, fx) => {
  if (rid !== huone || !saannot.length) return;
  const p = paikka.get(oid) || {};
  for (const s of saannot) {
    if (!(s.efektit || [s.efekti]).includes(fx) || !s.ruudut) continue;
    for (const [P, tulossa] of [[p.tgt, true], [p.loc, false]]) {
      if (!P) continue; const x = Math.round(P.x), y = Math.round(P.y); if (!s.ruudut.has(x + ',' + y)) continue;
      const nyt = Date.now(); if (nyt - (viimeksi.get(oid) || 0) < tila.vali) return; viimeksi.set(oid, nyt);
      const viive = tulossa && p.loc && (Math.round(p.loc.x) !== x || Math.round(p.loc.y) !== y) ? 500 : 0;
      tila.loki.push({ u: oid, x, y, tapa: 'efekti' + fx, viive });
      varaa(oid);
      setTimeout(() => { tila.rajayta(x, y, P.z, s.furni, s.kesto); if (!tila.lenna(oid, x, y, P.z)) purraVaraus(oid); }, viive);
      pidennaEfekti(oid, viive + tila.efektiViive);
      return;
    }
    tila.loki.push({ u: oid, efekti: fx, ohi: true, loc: p.loc && [Math.round(p.loc.x), Math.round(p.loc.y)], tgt: p.tgt && [Math.round(p.tgt.x), Math.round(p.tgt.y)] });
  }
};

const ajastin = setInterval(() => {
  const e = window.NitroDevTools && window.NitroDevTools.roomEngine; if (!e || e.activeRoomId !== huone) return;
  for (const [oid, v] of [...varatut]) if (Date.now() - v.aika > 1500) purraVaraus(oid);
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
  if (!e.__miinaEfektiKoukku2) { const ed = e.updateRoomObjectUserEffect; e.__miinaEfektiKoukku2 = true;   // efektin pidätys (ulompi kerros)
    e.updateRoomObjectUserEffect = function (rid, oid) { try { const k = window.miina && window.miina.__efektiPidata; if (k && k(rid, oid, arguments, ed)) return true; } catch (x) {} return ed.apply(this, arguments); }; }
  if (!e.__miinaKoukku) { const orig = e.updateRoomObjectUserLocation; e.__miinaKoukku = true;
    e.updateRoomObjectUserLocation = function (rid, oid, loc, tgt) { try { const k = window.miina && window.miina.__liike; if (k) k(rid, oid, loc, tgt, arguments[10]); } catch (x) {} return orig.apply(this, arguments); }; }
  if (!e.__miinaKoukku2) { const ed = e.updateRoomObjectUserLocation; e.__miinaKoukku2 = true;   // lennon ajan pidätys (ulompi kerros)
    e.updateRoomObjectUserLocation = function (rid, oid) { try { const k = window.miina && window.miina.__jaa; if (k && k(rid, oid, arguments)) return true; } catch (x) {} return ed.apply(this, arguments); }; }
}, 50);

// Pysäytys: moottori kutsuu tätä kun huoneesta lähdetään tai tämä tiedosto muuttuu. Kesken olevat räjähdykset ja lennot päättyvät itse.
return () => {
  clearInterval(ajastin); clearTimeout(esilataus); lentavat.clear();
  for (const oid of [...varatut.keys()]) purraVaraus(oid);
  for (const oid of [...pidatetyt.keys()]) vapauta(oid, true);   // pidätetyt efektit perille, ettei kenenkään efekti jää puuttumaan
  if (window.miina === tila) delete window.miina;
};
