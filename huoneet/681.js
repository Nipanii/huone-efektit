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
  // kp 29.10. 13:07-13:10 vaihtoi reitin: lista = laukaisimen 296529 valinta (node nitro/miinat-wiredista.js), 35 nurmea.
  furnit: [425448, 425447, 425457, 425471, 425491, 425470, 425473, 425456, 425452, 425494, 425461, 425462, 425476, 425511, 425488,
    425499, 425513, 435377, 425507, 425463, 425506, 425490, 425527, 425479, 425519, 425487, 425459, 425512, 435482, 425454, 425455, 425528, 425514, 425453, 425505],
};

const e0 = window.NitroDevTools && window.NitroDevTools.roomEngine;
const huone = (kupla && kupla.roomId && kupla.roomId()) || (e0 && e0.activeRoomId);
// versio-kenttä: vanha 0.4.x-moottori ottaa window.miinan haltuunsa jos siltä puuttuu versio. Moottori 0.5 pysäyttää 0.4.x:n, tämä on varmistus.
const tila = window.miina = { versio: 'huone-681', huone, lennata: true, muunnelma: null, kesto: null, vali: 1500, lepo: 700, piilotaPohja: true, loki: [] };
// Kellonaika jokaiseen lokiriviin (kp 27.10. 19:09): pelaajan chatrivi "äske vaa telesin" pitää voida kohdistaa lokiin.
tila.loki.push = function () { const t = new Date().toTimeString().slice(0, 8); for (const o of arguments) if (o && typeof o === 'object' && !o.t) o.t = t; return Array.prototype.push.apply(this, arguments); };
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
  // kp 27.10. 19:07 + 19:09 "etten nähny räjähdyst" · "äske vaa telesin": lokin mukaan räjähdys piirrettiin, joten mitataan näkyikö
  //   animaatio oikeasti: nakyi = suurin määrä näkyviä animaatiospritejä (ei pohjaa) kerralla. 0 = näkymätön räjähdys.
  //   Piilotetussa välilehdessä visualisointi ei päivity, joten siellä 0 ei kerro mitään.
  let nakyi = 0, uusinnat = 0, viimUusinta = 0;
  const piilo = setInterval(() => { const o = e.getRoomObject(r, id, 10); if (!o || !o.visualization) return; let n = 0;
    for (const s of o.visualization.sprites) { if (/_a_\d+_\d+$/.test(s.name)) { if (tila.piilotaPohja) s.visible = false; }
      else if (s.visible && s.alpha > 0 && s.texture && s.texture.width > 1) n++; }
    if (n > nakyi) nakyi = n;
    // Arvaus, ei mitattu syy: tila 1 voi kadota myös spritejen jo olemassa ollessa (grafiikka vielä latautumatta). Jos animaatiota ei
    //   näy 150 ms tilan asettamisen jälkeen, tila 1 lähetetään uudelleen (enintään 4 kertaa). uusinnat lokiin, jotta näkyy auttoiko.
    const nyt = performance.now(); if (!nakyi && asetettu && nyt - viimUusinta > 150 && uusinnat < 4 && nyt - alku < ms - 300) {
      viimUusinta = nyt; uusinnat++; e.updateRoomObjectFloor(r, id, L, D, 1, data('1')); } }, 16);
  // tila 1 (animaatio) katosi jos se tuli ennen kuin visualisointi oli valmis -> vain pohja näkyi (kp 2/5). Odotetaan spritejä.
  let yrit = 0, asetettu = false; const kaynnista = setInterval(() => { const o = e.getRoomObject(r, id, 10); yrit++;
    if ((o && o.visualization && o.visualization.sprites && o.visualization.sprites.length) || yrit > 30) { clearInterval(kaynnista); e.updateRoomObjectFloor(r, id, L, D, 1, data('1')); asetettu = true; viimUusinta = performance.now(); } }, 30);
  setTimeout(() => { clearInterval(piilo); clearInterval(kaynnista); e.removeRoomObjectFloor(r, id); tila.loki.push({ piirretty: true, x, y, ms: Math.round(performance.now() - alku), nakyi, uusinnat }); }, ms);
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
// kp 27.10. 18:54 "must tulee näkymätön lennon jälkee": piilotus kirjoitti myös visible=false ja palautti tallennetun visible-arvon.
//   Sprite joka oli käyttämätön (visible false) tallennushetkellä mutta jonka hahmo otti käyttöön lennon aikana (esim. tele-efekti)
//   jäi palautuksessa pysyvästi näkymättömäksi, eikä client aseta visibleä uudelleen ennen kuin asu tms. muuttuu (mitattu robolla:
//   sama asu uudelleen ei palauttanut). Nyt piilotus koskee VAIN alphaa, ja palautus antaa alphan 255 jos tallennettu oli 0.
const piilota = (o, talteen) => { const sp = (o && o.visualization && o.visualization.sprites) || [];
  for (const s of sp) { if (!talteen.has(s)) talteen.set(s, { a: s.alpha }); if (s.alpha !== 0) { s.alpha = 0; if (s.increaseUpdateCounter) s.increaseUpdateCounter(); } } };
const palauta = (o, talteen) => { for (const [s, v] of talteen) { s.alpha = v.a > 0 ? v.a : 255; if (s.increaseUpdateCounter) s.increaseUpdateCounter(); } };
// opts (naapurin lento, kp 18:56 "res ei lennä ku mä räjähdän"): kulma = suunta ruudukossa (rad), kerroin = matkan ja korkeuden kerroin.
tila.lenna = (oid, x, y, z, opts) => {
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
    const oma = Math.PI / 4 + puoli + (Math.PI / 6) + ((k % 0.5) * 2) * (Math.PI * 2 / 3); if (!(opts && isFinite(opts.kulma))) return oma;
    // Naapuri: poispäin räjähdyksestä ±15°, mutta sama kameran akselin rajaus (±30° akselista siirretään rajalle).
    let a = opts.kulma + (k - 0.5) * (Math.PI / 6), d = ((a - Math.PI / 4) % Math.PI + Math.PI) % Math.PI;
    if (d < Math.PI / 6) a += Math.PI / 6 - d; else if (d > Math.PI * 5 / 6) a -= d - Math.PI * 5 / 6; return a; })(),
    kerroin = (opts && opts.kerroin > 0) ? opts.kerroin : 1,
    matka = (1.5 + rnd() * 2.0) * (1 + 0.5 * (voima - 1)) * kerroin, h = (2.5 + rnd() * 4.0) * (0.8 + 0.25 * (voima - 1)) * kerroin;
  // 18:30 Res "takas se kaari · matala kaari pois" -> huippu taas 2,5-5. kp "lento takas lyhyemmäks": voiman vaikutus matkaan puolitettu (max x2, 1,5-7 ruutua).
  // kp 18:08 "keskiverto spinnin määrä vois olla vähemmän" + "molemmat voi olla tosi hitaita välil, iso rng factor":
  //   kierroksia 0,1-2,0, painotettu hitaaseen (rnd^2 -> keskiarvo ~0,73). Ennen 1-3 (ka 2).
  const kierrokset = (0.15 + 0.2 * matka) * (0.75 + 0.5 * rnd()) * (rnd() < 0.5 ? -1 : 1), ms = Math.round((600 + rnd() * 500) * (1 + 0.18 * (voima - 1)));
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
      palauta(e.getRoomObject(r, oid, 100) || o, talteen);
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

// Naapuri (kp 27.10. 18:38-18:45 "voi räjäyttää vierustoverin" · "script aktivoi tän wiredin"): kun miina räjähtää, jokainen clientti
//   katsoo onko OMA hahmo enintään naapuriSade ruudun päässä (ei laukaisija itse). Jos on, se klikkaa piilotettua wired-esinettä
//   naapuriKlikki (ClickFurni 443, sama paketti kuin furnin klikkaus). Palvelin ei tarkista etäisyyttä eikä oikeuksia
//   (Habbo-Daybreak ClickFurniMessageEvent), joten huoneen wired (klikkaus -> teleport) siirtää juuri sen naapurin.
//   Vain naapurin oma clientti lähettää, joten yksi räjähdys = enintään yksi klikkaus per naapuri.
tila.naapuriSade = 2;
tila.naapuriKlikki = 442639;
let naapuriViimeksi = 0;
const yhteys = () => {
  const e = window.NitroDevTools && window.NitroDevTools.roomEngine; if (!e) return null;
  const dv = (o, k) => { const d = o && Object.getOwnPropertyDescriptor(o, k); return d && !d.get ? d.value : undefined; };
  const nahty = new Set(); let c = null;
  const etsi = (o, d) => { if (!o || c || d > 4 || typeof o !== 'object' || nahty.has(o)) return; nahty.add(o);
    if (Object.getOwnPropertyDescriptor(o, '_cryptoState')) { c = o; return; }
    for (const k of Object.getOwnPropertyNames(o)) { const de = Object.getOwnPropertyDescriptor(o, k); if (de && !de.get && de.value && typeof de.value === 'object') etsi(de.value, d + 1); } };
  etsi(dv(e, '_roomSessionManager'), 0); return c;
};
// Messenger-skriptien datakanava (window.kuplaScripts). Räjähdyslaskuri (h681.miina) poistettu kp 27.10. 19:45:08 "poista räjähdys
//   counter … se oli vaa testii varten et datajako toimii" — mitattu toimivaksi kolmella clientilla 19:19 (a085992, PAIVAKIRJA 19:20).
//   Kanavaa käyttää nyt vain läpäisyilmoitus alla.
const ks = window.kuplaScripts;
const omaIndeksi = () => {
  const e = window.NitroDevTools && window.NitroDevTools.roomEngine; if (!e) return null;
  const sm = Object.getOwnPropertyDescriptor(e, '_roomSessionManager'); const s = sm && sm.value && sm.value.getSession && sm.value.getSession(huone);
  const i = s && s.ownRoomIndex; return (i == null || i < 0) ? null : i;
};
const nakyvatLaput = new Set();
const jakoPois = [];
if (!ks) tila.loki.push({ jako: 'ei kanavaa', syy: 'window.kuplaScripts puuttuu (vanha client?)' });

// Läpäisyilmoitus kaikille (kp 19:28:12 "läpäsi ilmoitus kaikille vois toimii", 19:30:56 "vasta ku saa ton laatikon auki").
//   kp 21:37:28 "ei tuu ilmotuksii niinku pitäs": versio 1 lähti vain AVAAJAN clientista (sen oma kuiskaus -> kanava h681.lapi), joten
//   avaaja ilman huone-efektejä ei ilmoittanut ketään (mustapekka 21:34). Nyt maalipinossa 1,11 on palvelimen wired 442789
//   (wf_act_show_message, näkyvyys 1 = koko huone, kupla 34): "%user% pääsi radan 2 läpi!" kuiskataan JOKAISELLE huoneessa
//   (WiredEffectWhisper.java:123), joten ilmoitus näkyy kaikille ilman moottoria. Moottori lisää sen päälle bannerin 4 s,
//   kuultuna omalta väylältä (RSCE_CHAT_EVENT, chatType 1, objectId = oma indeksi koska palvelin lähettää h,h).
// 23:27 korjattu: oli (d+) ilman kenoviivaa, joten mikään läpäisy ei osunut ja banneri ei koskaan näkynyt.
const MAALI = /^(.+) pääsi radan (\d+) läpi!$/;
const viimLapi = new Map();
const banneri = (teksti, ms = 4000, px = 26) => {
  const d = document.createElement('div'); d.textContent = teksti;
  d.style.cssText = 'position:fixed;left:50%;top:18%;transform:translate(-50%,0);z-index:99999;pointer-events:none;font:bold ' + px + 'px sans-serif;' +
    'color:#fff;text-shadow:0 0 4px #000,0 0 4px #000,2px 2px 0 #000;white-space:nowrap;transition:opacity .6s';
  document.body.appendChild(d); const l = { d, ajo: 0 }; nakyvatLaput.add(l);
  setTimeout(() => { d.style.opacity = '0'; }, ms); setTimeout(() => { d.remove(); nakyvatLaput.delete(l); }, ms + 700);
};
// kp 22:15 "robo laita miina huoneesee samat kunnon onnittelut ku tokas" · "älä muuta tekstii": sama konfetti + ilotulitus kuin 682.js (9 s),
//   banneri 8 s / 40 px, teksti "selvisi läpi" ennallaan.
const juhla = () => {
  const c = document.createElement('canvas'), w = c.width = innerWidth, h = c.height = innerHeight, g = c.getContext('2d');
  c.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vh;z-index:99998;pointer-events:none';
  document.body.appendChild(c); const l = { d: c, ajo: 0 }; nakyvatLaput.add(l);
  const V = ['#ff7a00', '#a24bff', '#7dff4a', '#ffd23f', '#ff3b3b', '#ffffff'], P = [], t0 = performance.now(), KESTO = 9000;
  const rak = (x, y) => { const v = V[Math.random() * V.length | 0]; for (let i = 0; i < 70; i++) { const a = Math.random() * 6.283, n = 2 + Math.random() * 5;
    P.push({ x, y, vx: Math.cos(a) * n, vy: Math.sin(a) * n, e: 1, v, r: 2 + Math.random() * 2, k: 0 }); } };
  for (let i = 0; i < 160; i++) P.push({ x: Math.random() * w, y: -20 - Math.random() * h * 0.4, vx: (Math.random() - 0.5) * 1.2, vy: 0.8 + Math.random() * 0.8, e: 1, v: V[i % V.length], r: 3 + Math.random() * 4, k: 1, kul: Math.random() * 6.283 });
  let seur = 0;
  const askel = nyt => { const t = nyt - t0; if (t > KESTO + 1500 || !c.isConnected) { c.remove(); nakyvatLaput.delete(l); return; }
    if (t < KESTO && t > seur) { rak(w * (0.15 + Math.random() * 0.7), h * (0.15 + Math.random() * 0.4)); seur = t + 450 + Math.random() * 400; }
    g.clearRect(0, 0, w, h); const haiv = t > KESTO ? 1 - (t - KESTO) / 1500 : 1;
    for (let i = P.length - 1; i >= 0; i--) { const q = P[i]; q.x += q.vx; q.y += q.vy;
      if (q.k) { q.vy = Math.min(q.vy + 0.01, 1.7); q.kul += 0.06; q.vx += Math.sin(q.kul) * 0.03; } else { q.vy += 0.06; q.vx *= 0.985; q.vy *= 0.985; q.e -= 0.012; }
      if (q.e <= 0 || q.y > h + 30) { P.splice(i, 1); continue; }
      g.globalAlpha = Math.max(0, Math.min(1, q.e * haiv)); g.fillStyle = q.v;
      if (q.k) { g.save(); g.translate(q.x, q.y); g.rotate(q.kul); g.fillRect(-q.r, -q.r / 2, q.r * 2, q.r); g.restore(); } else { g.beginPath(); g.arc(q.x, q.y, q.r, 0, 6.283); g.fill(); } }
    l.ajo = requestAnimationFrame(askel); };
  l.ajo = requestAnimationFrame(askel);
};
tila.juhla = () => { banneri('☠ Testi selvisi läpi! ☠', 8000, 40); juhla(); };   // konsolista: miina.juhla()
const vayla = window.NitroDevTools && window.NitroDevTools.roomEngine && window.NitroDevTools.roomEngine.events;
const kuuleMaali = ev => { try {
  if (!ev || ev.chatType !== 1 || ev.objectId !== omaIndeksi()) return;
  const m = MAALI.exec(String(ev.message || '').trim()); if (!m) return;
  const nyt = Date.now(); if (nyt - (viimLapi.get(m[1]) || 0) < 10000) return; viimLapi.set(m[1], nyt);
  tila.loki.push({ lapi: 'saatu', kuka: m[1], t: new Date().toTimeString().slice(0, 8) });
  banneri('☠ ' + m[1] + ' selvisi läpi! ☠', 8000, 40); juhla();
  arkkuLapaisy(m[1]);
} catch (x) { tila.loki.push({ lapi: 'virhe', viesti: String(x) }); } };
if (vayla && vayla.addEventListener) { vayla.addEventListener('RSCE_CHAT_EVENT', kuuleMaali); jakoPois.push(() => vayla.removeEventListener('RSCE_CHAT_EVENT', kuuleMaali)); }
else tila.loki.push({ lapi: 'ei väylää', syy: 'roomEngine.events puuttuu' });

// Naapurin lento (kp 18:56:55 "res ei lennä ku mä räjähdän", 18:38 pienemmällä voimalla): JOKAINEN clientti lennättää kaikki
//   naapuriSade-säteellä olevat hahmot heti, poispäin räjähdyksestä, matka ja korkeus x naapuriVoima. Naapurin tele (wired) tulee
//   lennon aikana ja pidätetään lenna():n omalla __jaa-pidätyksellä, joten hahmo siirtyy pelastuspaikkaan vasta laskeuduttuaan.
tila.naapuriVoima = 0.6;
tila.naapurit = (x, y, laukaisija) => {
  const e = window.NitroDevTools && window.NitroDevTools.roomEngine; if (!e || !(tila.naapuriSade > 0)) return false;
  if (tila.naapuriVoima > 0) for (const u of e.getRoomObjects(huone, 100) || []) {
    const id = u.id, L = u.getLocation && u.getLocation(); if (id == null || id < 0 || id === laukaisija || !L || u.type !== 'user') continue;
    const d = Math.hypot(L.x - x, L.y - y); if (d > tila.naapuriSade) continue;
    const ok = tila.lenna(id, L.x, L.y, L.z, { kulma: d > 0.01 ? Math.atan2(L.y - y, L.x - x) : undefined, kerroin: tila.naapuriVoima });
    tila.loki.push({ naapuriLento: id, ok, etai: Math.round(d * 10) / 10 }); }
  if (!tila.naapuriKlikki) return false;
  const sm = Object.getOwnPropertyDescriptor(e, '_roomSessionManager'); const s = sm && sm.value && sm.value.getSession && sm.value.getSession(huone);
  const oma = s && s.ownRoomIndex; if (oma == null || oma < 0 || oma === laukaisija) return false;
  const o = e.getRoomObject(huone, oma, 100); const L = o && o.getLocation && o.getLocation(); if (!L) return false;
  const etai = Math.hypot(L.x - x, L.y - y); if (etai > tila.naapuriSade) return false;
  const nyt = Date.now(); if (nyt - naapuriViimeksi < 1500) return false; naapuriViimeksi = nyt;
  const c = yhteys(); if (!c || typeof c.sendRawPacket !== 'function') { tila.loki.push({ naapuri: 'ei yhteyttä' }); return false; }
  c.sendRawPacket(443, [tila.naapuriKlikki, 0], 'miina681');
  tila.loki.push({ naapuri: oma, laukaisija, x, y, etai: Math.round(etai * 10) / 10 });
  return true;
};

// Ensimmäinen räjähdys jäi näkymättä, koska efektin grafiikka latautuu vasta ensikäytössä -> esilataus kartan ulkopuolelle.
const esilataus = setTimeout(() => tila.rajayta(-60, -60, 0, ASETUS.furni, 3000), 500);

// Viimeisin miina jää näkyviin (kp 29.10. 12:49 "viimenen ruutu mis pelaaja räjähti nii jää miina esii" · "kunnes räjähtää ite
//   seuraavan kerran" · "muille ei näy toisen pelaajan last mine"). 12:57 muutettu: kaikki näkevät yhden kallon, kenen tahansa viimeisimmän räjähdyksen kohdalla (kp "pitäskö kallot näkyy kaikille" · "viimesin kallo" · "mut näkee vaan yhden kallon" · "tää rata on hemmetin vaikee"). Yksi merkki
//   kerrallaan: uusi räjähdys siirtää sen. Suunta arvotaan kameraan päin, oikealle tai vasemmalle (90 tai 180 = sprite-suunnat 2 ja 4. 270/0 = suunnat 6 ja 0 osoittivat poispäin, kp 12:58 "kallot on taas poispäin"; kp:n 12:54 palaute koski vielä edellistä satunnaisversiota), ei koskaan poispäin (kp 12:53 "ei koskaa poispäin"). Konsolissa: miina.merkkiFurni = '<luokka>' · miina.merkkiFurni = '' (pois).
tila.merkkiFurni = 'LT_skull';
let merkkiId = null;
const merkkiPois = () => { if (merkkiId == null) return; try { const e = window.NitroDevTools.roomEngine; e.removeRoomObjectFloor(e.activeRoomId, merkkiId); } catch (x) {} merkkiId = null; };
tila.merkki = (oid, x, y, z) => {
  if (!tila.merkkiFurni || oid == null) return false;
  const e = window.NitroDevTools && window.NitroDevTools.roomEngine; if (!e) return false;
  const r = e.activeRoomId, V = e.getRoomObjects(r, 100)[0]?.getLocation().constructor; if (!V) return false;
  merkkiPois();
  const id = seuraavaId--;
  if (!e.addFurnitureFloorByTypeName(r, id, tila.merkkiFurni, new V(x, y, z || 0), new V(Math.random() < 0.5 ? 90 : 180), 0, data('0'), NaN, -1, 0, -1, '', true, false)) {
    tila.loki.push({ merkki: 'ei piirtynyt', furni: tila.merkkiFurni, x, y }); return false; }
  merkkiId = id; tila.loki.push({ merkki: [x, y] }); return true;
};

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
        tila.rajayta(x, y, ed.z || 0, s.furni, s.kesto); tila.merkki(oid, x, y, ed.z || 0); tila.lenna(oid, x, y, ed.z || 0); tila.naapurit(x, y, oid); osui = true; break; }
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
    setTimeout(() => { tila.rajayta(x, y, P.z, s.furni, s.kesto); tila.merkki(oid, x, y, P.z); tila.lenna(oid, x, y, P.z); tila.naapurit(x, y, oid); }, viive);
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
      setTimeout(() => { tila.rajayta(x, y, P.z, s.furni, s.kesto); tila.merkki(oid, x, y, P.z); if (!tila.lenna(oid, x, y, P.z)) purraVaraus(oid); tila.naapurit(x, y, oid); }, viive);
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

// Arkku auki läpäisseelle (kp 27.10. 23:35:01 "saisko nii et ku pääsee läpi nii toi chest näkyy auki olevana", 23:35:13 "jos on var 2").
//   Arkku 435843 (army_c15_locker): tila 0 = auki, 1 = kiinni (kaluste-kuva + gw 27.10.). Muutos vain tämän pelaajan clientissä.
//   Oma ratoja_tehty (room:442708) luetaan Wired Menun tarkastuksella: 7012 [1 = käyttäjä, oma huoneindeksi] -> 7111 (Habbo-Daybreak
//   WiredMenuMessageEvent.inspect). Lukuoikeus: huoneen 681 read-maski 15 sisältää EVERYONE-bitin (WiredMenuSettings.java:21), joten
//   jokainen pelaaja saa lukea omansa. Vastaus siepataan yhteyden handleMessages-kutsusta eikä sitä näytetä Wired Menu -ikkunalle.
//   Ehto >= 2: radan 2 läpäisy nostaa arvon kahteen; isompi arvo = myöhempi rata, joten arkku pysyy auki.
const ARKKU = 435843, ARKKU_AUKI = 0, RATA_MUUTTUJA = 'room:442708', RATA_RAJA = 2;
tila.arkku = { arvo: null, auki: false, kysytty: 0 };
let arkkuOdottaa = 0, arkkuYhteys = null, arkkuOma = null, arkkuAlkup = null, arkkuEnnen = null;
const arkkuPakota = () => { try {
  if (!tila.arkku.auki || !e0) return; const o = e0.getRoomObject(huone, ARKKU, 10); if (!o || !o.getState) return;
  const s = o.getState(0); if (s === ARKKU_AUKI) return; if (arkkuEnnen == null) arkkuEnnen = s;
  e0.updateRoomObjectFloor(huone, ARKKU, o.getLocation(), o.getDirection(), ARKKU_AUKI, null);
} catch (x) { tila.loki.push({ arkku: 'virhe', viesti: String(x) }); } };
const arkkuKoukku = () => {
  const c = yhteys(); if (!c || typeof c.handleMessages !== 'function') return null; if (arkkuYhteys === c) return c;
  const alkup = c.handleMessages;
  const oma = function (...viestit) { try { if (arkkuOdottaa && Date.now() - arkkuOdottaa < 5000) {
    const i = omaIndeksi();
    viestit = viestit.filter(v => { const p = v && v.parser;
      if (!p || p.type !== 1 || p.objectId !== i || !Array.isArray(p.values) || !Array.isArray(p.wiredIds)) return true;
      arkkuOdottaa = 0; const r = p.values.find(x => x && x.id === RATA_MUUTTUJA); const arvo = r ? r.value : 0;
      tila.arkku.arvo = arvo; tila.arkku.auki = arvo >= RATA_RAJA; tila.loki.push({ arkku: 'luettu', arvo, auki: tila.arkku.auki });
      arkkuPakota(); return false; });
    if (!viestit.length) return; } } catch (x) { tila.loki.push({ arkku: 'virhe', viesti: String(x) }); }
    return alkup.apply(this, viestit); };
  c.handleMessages = oma; arkkuYhteys = c; arkkuOma = oma; arkkuAlkup = alkup; return c;
};
const arkkuKysy = () => { try {
  const c = arkkuKoukku(), i = omaIndeksi(); if (!c || i == null || typeof c.sendRawPacket !== 'function') return false;
  arkkuOdottaa = Date.now(); tila.arkku.kysytty++; c.sendRawPacket(7012, [1, i], 'miina681'); return true;
} catch (x) { tila.loki.push({ arkku: 'virhe', viesti: String(x) }); return false; } };
const arkkuLapaisy = nimi => { const sdm = e0 && e0._sessionDataManager, o = String((sdm && sdm._name) || '').toLowerCase();
  if (o && String(nimi).toLowerCase() === o) setTimeout(arkkuKysy, 1500); };
tila.arkkuKysy = arkkuKysy;
let arkkuYrit = 0;
const arkkuAloitus = setInterval(() => { if (arkkuKysy() || ++arkkuYrit > 30) clearInterval(arkkuAloitus); }, 1000);
const arkkuAjastin = setInterval(arkkuPakota, 500);

// Wired-laatikoiden piilotus (vain rakentajat näkevät) on 28.10. alkaen yhteinen kaikille Halloween-huoneille: huoneet/hween-wired.js
//   (kp 11:18 "kaikki hween huoneet pitää sit olla tää systeemi"). Tämän tiedoston oma 100 ms kysely poistettiin.

// Pysäytys: moottori kutsuu tätä kun huoneesta lähdetään tai tämä tiedosto muuttuu. Kesken olevat räjähdykset ja lennot päättyvät itse.
return () => {
  clearInterval(arkkuAloitus); clearInterval(arkkuAjastin);
  try { if (arkkuYhteys && arkkuYhteys.handleMessages === arkkuOma) { if (arkkuAlkup === Object.getPrototypeOf(arkkuYhteys).handleMessages) delete arkkuYhteys.handleMessages; else arkkuYhteys.handleMessages = arkkuAlkup; } } catch (x) {}
  try { const o = arkkuEnnen != null && e0 && e0.getRoomObject(huone, ARKKU, 10); if (o) e0.updateRoomObjectFloor(huone, ARKKU, o.getLocation(), o.getDirection(), arkkuEnnen, null); } catch (x) {}
  clearInterval(ajastin); clearTimeout(esilataus); lentavat.clear(); merkkiPois();
  for (const off of jakoPois) try { off(); } catch (x) {}
  for (const l of nakyvatLaput) { cancelAnimationFrame(l.ajo); l.d.remove(); } nakyvatLaput.clear();
  for (const oid of [...varatut.keys()]) purraVaraus(oid);
  for (const oid of [...pidatetyt.keys()]) vapauta(oid, true);   // pidätetyt efektit perille, ettei kenenkään efekti jää puuttumaan
  if (window.miina === tila) delete window.miina;
};
