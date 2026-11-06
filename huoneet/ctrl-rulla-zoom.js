// Huoneskripti: Ctrl+rulla pelialueen päällä vaihtaa pelin omaa zoomia (huone 424, kp 6.11. 13:16 "laita samanlailla jakoon se scroll zoom huoneeseen.
//   disabloituu jos livessä"). Sama logiikka kuin kortti userscriptit/ctrl-rulla-zoom/ctrl-rulla-zoom.user.js 0.6.0 (zoom + B22-kuplakorjaus), käärittynä
//   huoneskriptin muotoon: ei @-otsikoita, palauttaa siivousfunktion, uudelleenajo siivoaa edellisen (window.__huoneCtrlZoom).
//   Moottori (moottori.js:66-67) ajaa tämän new Function('kupla', koodi)(api):lla ja kutsuu paluuarvoa huoneesta lähtiessä.
//
// MITEN: :zoom lähettää RoomZoomEvent(roomId, taso), joka päätyy RoomEngine.setRoomInstanceRenderingCanvasScale(roomId, 1, taso, ...). Askel 0.5 (0.5, 1, 1.5 ...),
//   ei ylärajaa, alaraja 1/8 (0.7.2, musta ruutu); 0.5:n alapuolella askel puolittaa/kaksinkertaistaa. wheel-kuuntelija passive:false + preventDefault estää Chromen ctrl+rulla-zoomin
//   vain kun tapahtuma osuu canvakseen; UI:n päällä ja ctrl +/- zoomaavat selainta kuten ennenkin. `:zoombeta [on|pois]` vaihtaa pelizoomin ja selaimen välillä
//   (tila localStorage 'kupla.ctrlZoom', sama kuin kortissa).
//
// ITSESAMMUTUS (kp 13:16 "disabloituu jos livessä"): natiivi toteutus on kupla-cc PR #820 (RoomView.tsx, wheel-kuuntelija canvaksella, kutsuu event.preventDefault()
//   ennen zoomausta). Sen koodissa ei ole luokkaa eikä tyylisääntöä jonka voisi lukea (toisin kuin reply-hypyn chat-reply-jump), eikä muuta kuuntelijoita voi
//   luetella sivun koodista. Siksi tunnistus on TAPAHTUMAKOHTAINEN: tämä skripti kuuntelee ikkunalla KUPLIVAIHEESSA (ei capture), eli vasta kun canvaksen oma
//   kuuntelija on ajettu. Jos ctrl+rulla-tapahtuma on silloin jo defaultPrevented, joku muu (natiivi) on käsitellyt sen -> tämä skripti ei tee mitään (ei tuplaa).
//   Kortti-versio (window.__kuplaCtrlZoom) käsitellään samoin: se ajaa capturessa ensin ja kutsuu preventDefault, ja sen läsnäolo tarkistetaan lisäksi nimeltä.
//   Jos natiivi tulee, tämä ei tarvitse poistoa: jokainen tapahtuma jää natiiville. Havainto näkyy window.__huoneCtrlZoom.natiivi (true kun nähty) ja .loki.
//   B22-kuplakorjaus (PR #819, ChatWidgetView) on idempotentti (asettaa kuplat samaan paikkaan johon korjattu client ne jo laittaisi), joten se ei tuplaa vaikka
//   #819 tulisi livenä; sille ei ole havaittavaa merkkiä, joten se jää päälle. Kortin korjaus (window.__kuplaBubbleZoomFix) ajossa -> tämä ei asenna omaansa.
// RAJA: (1) kaikki muu ctrl+rullan preventDefault joka ajetaan ennen ikkunan kupliva-vaihetta luetaan natiiviksi (origin/main:ssa ei ole sellaista: git grep wheel,
//   vain InventoryPlacement/Floorplan/pulldown/KuplaFixChatImagePreview, eikä huonecanvaksella). (2) Jos jokin UI-elementti pysäyttää wheel-tapahtuman ennen ikkunaa
//   (stopPropagation), tämä ei näe sitä: selain-zoom voi silloin toimia canvaksen päällä (kortti-versio capturessa ei kärsi tästä). (3) Ei testattu oikealla
//   clientilla eikä oikealla natiivibuildillä (PR #820 ei livessä); deltaY=0 -tapahtumat ohitetaan (natiivi ohittaa myös, kortti zoomasi ulos).
if (window.__huoneCtrlZoom) { try { window.__huoneCtrlZoom.poistu(); } catch (e) {} }
const VW = window;
const ASKEL = 1;
const ALIN = 0.125;   // pienin rullatessa (kp 15:16 musta ruutu: 1/128:ssa huone on 1 px ja paluumatkalla karkaa, ks. kasittele)
let ankkuri = null;   // keskipisteen huonepiste (HUONEEN koordinaatit, ks. fokus) liukulukuna omien askelten yli
// pelin zoom erillään selaimen zoomista (0.9.1): moottorin taso = pelitaso * kerroin, kerroin = dprPohja / devicePixelRatio (ks. lohko "Selainzoom erillään")
let kerroin = 1, dprPohja = null;
const pyor = v => Math.round(v * 1e6) / 1e6;
// pelitaso 1 pysyy moottorissa 1:nä (huonekamera seuraa hahmoa VAIN skaalalla tasan 1, RoomEngine.updateRoomCamera), ja muu taso ei saa osua tasan 1:een
//   (esim. 200 %: 2 * 0.5) ettei kamera käynnisty pelitasolla 2
const peliTaso = (E, k = kerroin) => (k === 1 || E === 1) ? E : Math.round(E / k * 1000) / 1000;
const moottoriTaso = (G, k = kerroin) => { if (k === 1 || G === 1) return G; const e = pyor(G * k); return e === 1 ? 1.000001 : e; };
const RE = () => VW.NitroDevTools && VW.NitroDevTools.roomEngine;
const tila = VW.__huoneCtrlZoom = { versio: 'huone-0.9.3', natiivi: false, loki: [], poistu() {}, aseta: null, tilaNyt: null };
// B201 (kp 6.11. 16:42 "huone välil hypähtää vasemmalle paljon ... kun zoomaan ulospäin ... pelin zoomilla", 16:47 "ei silti toistu consistently"):
//   huonekamera (RoomEngine.updateRoomCamera, ajaa VAIN skaalalla tasan 1) kirjoittaa offsetiksi -(kameran oma sijainti) aina kun hahmo liikkuu tai canvaksen
//   koko muuttuu. Moottori päivittää kameran sijainnin raahauksen jälkeen (handleRoomDragging MOUSE_UP: camera.resetLocation(-offset)), mutta EI zoomin
//   jälkeen. Zoom ulos tasolle 1 jättää kameraan vanhan sijainnin (esim. tasolla 2 raahattu: -offset tason 2 pikseleinä), ja seuraava hahmon askel napsauttaa
//   huoneen sinne. Korjaus: kameraSynk tekee saman kuin moottorin raahauksen loppu jokaisen tasolle 1 päättyvän zoomin jälkeen.
const kameraSynk = (re, rid, c) => {
    try {
        if (!re || !c || c.scale !== 1) return false;
        const d = re._roomInstanceDatas && typeof re._roomInstanceDatas.get === 'function' ? re._roomInstanceDatas.get(rid) : null, k = d && d.roomCamera;
        if (!k || typeof k.resetLocation !== 'function') return false;
        const x = -c.screenOffsetX, y = -c.screenOffsetY, l = k.location;
        if (l && l.x === x && l.y === y) return false;
        if (!k.isMoving) { k.centeredLocX = false; k.centeredLocY = false; }   // kuten moottorin raahauksen loppu
        k.resetLocation({ x, y, z: 0 }); vahti.synkkeja++;
        return true;
    } catch (e) { return false; }
};
// vahdin aikaleimat (performance.now): lokirivin konteksti, ks. lohko "Hyppyvahti"
const vahti = { fokus: null, blur: null, nakyvyys: null, resize: null, init: null, rulla: null, rullaN: 0, zoom: null, synkkeja: 0, korjauksia: 0 };
let vartija = () => {}, selainAuki = () => false;   // asetetaan lohkoissa "Hyppyvahti" ja "Selainzoom erillään"
const loki = s => { tila.loki.push(new Date().toTimeString().slice(0, 8) + ' ' + s); if (tila.loki.length > 50) tila.loki.shift(); };
let viime = 0, paalla = true, varaTimer = 0;
try { paalla = localStorage.getItem('kupla.ctrlZoom') !== 'off'; } catch (e) {}
const aseta = v => { paalla = v; try { localStorage.setItem('kupla.ctrlZoom', v ? 'on' : 'off'); } catch (e) {}
    return 'ctrl+rulla: ' + (paalla ? 'pelin zoom' : 'selaimen zoom'); };
const komento = (t, sanat) => { const s = (sanat[0] || '').toLowerCase();
    return aseta(/^(on|päälle|paalle|1)$/.test(s) ? true : /^(pois|off|0)$/.test(s) ? false : !paalla); };
tila.aseta = aseta; tila.tilaNyt = () => ({ paalla });

const kasittele = e => {
    if (!paalla || !e.ctrlKey || !e.deltaY || !(e.target instanceof HTMLCanvasElement)) return;
    // natiivi (PR #820) tai kortti-versio on jo käsitellyt: ei pysäytetä eikä tuplata
    if (e.defaultPrevented || VW.__kuplaCtrlZoom) {
        if (!tila.natiivi && !VW.__kuplaCtrlZoom) { tila.natiivi = true; loki('ctrl+rulla oli jo käsitelty (natiivi?), tämä skripti ei käsittele'); }
        return;
    }
    const re = RE(); if (!re) return;
    const rid = re.activeRoomId; if (rid == null || rid === -1) return;
    e.preventDefault();
    const nyt = performance.now(); if (nyt - viime < 120) return;   // kosketuslevyn sarja yhdeksi askeleeksi
    viime = nyt;
    // animaation aikana askel lasketaan tavoitteesta, ei moottorin skaalasta (nopeat askeleet kertyvät yhdeksi moottorikutsuksi)
    //   Askeleet PELITASOINA (tason luku palauttaa pelitason, ks. reKaariG); moottorille pelitaso * kerroin.
    const tama = anim ? peliTaso(anim.v1) : (re.getRoomInstanceRenderingCanvasScale(rid, 1) || 1);
    // ei ylärajaa (kp 5.11. 01:10); 1:stä ylöspäin vain kokonaisluvut (kp 6.11. 13:44 "scroll zoom pitää poistaa murtoluvut, ei toimi":
    //   sipuli mittasi 1->1.5 ja 2->2.5 ei tee mitään). Alle 1 askel puolittaa (0.5, 0.25 ...) kuten ennen.
    const ylos = e.deltaY < 0;
    const uusi = ylos ? (tama >= 1 ? Math.floor(tama) + ASKEL : Math.min(1, tama * 2))
        : (tama > 1 ? Math.ceil(tama) - ASKEL : Math.max(ALIN, tama / 2));
    if (uusi === tama) return;
    const uusiE = moottoriTaso(uusi);
    vartija(re, rid, uusi);
    if (pehmea(re, rid, uusiE, e.target, uusi)) return;
    zoomaaNyt(re, rid, uusiE);
};

// ---- PEHMEÄ ZOOM (0.8.0 kp 6.11. ~15:00 "smooth-feeling zoom instead of the hard jump"; 0.8.1 kp 15:50 "näkyy tollaset mustat palkit hetken smooth zoomin kaa") ----
// MIKSI: moottori piirtää tasot kerrallaan (kokonaisluvut >= 1, puolikkaat alle 1), joten askel on kova hyppy.
// MITEN: näkyvä skaala v(t) animoidaan vanhasta tavoitteeseen (~150 ms, ease-out) huonecanvaksen CSS transformilla, origona piste jonka moottori pitää
//   paikallaan (canvaksen keskipiste _width/2, _height/2 = setScalen offsetPoint). CSS-suhde = v / moottorin taso, ja moottorin taso pidetään AINA <= v,
//   joten CSS scale >= 1 eikä canvas kutistu koskaan viewportia pienemmäksi (0.8.0:n zoom out ajoi scale < 1 ja paljasti mustan taustan joka sivulta,
//   kp:n kuva 15:50: huone ~x 318-1682, y 163-862 / 2000x1026, kuplat mustalla alueella).
//   Zoom in: moottori pysyy vanhassa, CSS kasvaa, lopussa moottori -> tavoite ja CSS 1. Zoom out: moottori -> tavoite HETI ensimmäisessä render()-kutsussa
//   ja CSS = v / tavoite (> 1), joka laskee 1:een. Moottorin vaihto ja sitä vastaava CSS tehdään canvaksen OMAN render()-kutsun sisällä ennen piirtoa:
//   mitattu robolla :9223 kehyksen järjestys on render() -> ruudun piirto -> muut rAF:t ("CTTTTTTTTS|CS|CS|", C = RoomSpriteCanvas.render, S = näytön
//   piirto), joten uusi kuva ja uusi CSS kootaan samaan kehykseen. rAF päivittää CSS:n animaation aikana.
//   Kuplat siirtyvät puhujan kohdalle moottorin vaihdossa (kaariS -> seuraa): zoom outissa heti alussa, zoom inissä lopussa.
// HINTA (0.9.3): yksi moottorikutsu per ylitetty taso (g kulkee tasojen läpi), ei per tikki.
// VARA: jos huonecanvasta ei löydy DOMista (leveys != _width*dpr) zoom on välitön kuten 0.7.2. Jos render() ei aja (piilotettu välilehti: silloin ei aja
//   rAF:kään), ajastin VARA ms viimeisestä tikistä asettaa tavoitteen ja pudottaa transformin. Selaimen resize kesken: päätetään heti.
// 0.9.3 JATKUVA (kp 17:01 "kun se interpolaatio on done- jos jatkaa zoomausta se jatkuu saumattomasti eteenpäin. nyt se menee asteittain"): ei enää
//   askelkohtaista 150 ms ease-outia joka alkaa alusta joka tikillä. Yksi juokseva TAVOITE (pelitaso, jokainen rullatikki siirtää sitä) ja näkyvä pelitaso g
//   jahtaa sitä log-asteikolla eksponentiaalisesti joka kehys (aikavakio TAU), joten jatkettu rullaus jatkaa samaa liikettä nopeutta katkaisematta.
//   Moottori on aina g:n ALEMPI kelvollinen taso (kokonaisluku >= 1, puolitus < 1) ja vaihtuu kun g ylittää tason; CSS = näkyvä / moottori >= 1 (ei mustia
//   palkkeja). Asettuessa g napsahtaa tavoitteeseen, moottori = tavoite, transform pois. Ankkuri on yhä canvaksen KESKIPISTE (ei hiiren kohta).
const KESTO = 150;   // vartijan ja RAE-vahdin ajoitukset (ei enää siirtymän kesto)
const TAU = 80, VALMIS = 0.001, VARA = 1500;   // aikavakio ms; |ln(g / tavoite)| alle tämän = asettunut; varapudotus ms viimeisestä tikistä
let anim = null;   // { rid, cv, c, g, G1, v1, tl, t0, raf, kaari, alkuR, omaR, vanhaT, vanhaO, ajastin }
const alaG = g => g >= 1 ? Math.floor(g + 1e-9) : Math.pow(2, Math.floor(Math.log2(g) + 1e-9));
const ylaG = g => { const a = alaG(g); return Math.abs(g - a) < 1e-9 ? a : (a >= 1 ? a + 1 : Math.min(1, a * 2)); };
// näkyvä MOOTTORIskaala pelitasolle g: log-interpolaatio viereisten tasojen moottoriarvojen välillä (selainzoomin kerroin mukana, ks. moottoriTaso)
const visE = g => { const a = alaG(g), b = ylaG(g), ea = moottoriTaso(a); if (Math.abs(g - a) < 1e-9 || a === b) return ea;
    const eb = moottoriTaso(b); return Math.exp(Math.log(ea) + Math.log(g / a) / Math.log(b / a) * Math.log(eb / ea)); };
const paivita = a => {   // g kohti tavoitetta kuluneen ajan verran; palauttaa näkyvän moottoriskaalan v ja moottorin tason E
    const t = performance.now(), dt = Math.max(0, t - a.tl); a.tl = t;
    if (a.g !== a.G1) { const g = a.g * Math.exp(Math.log(a.G1 / a.g) * (1 - Math.exp(-dt / TAU))); a.g = Math.abs(Math.log(a.G1 / g)) < VALMIS ? a.G1 : g; }
    const valmis = a.g === a.G1;
    return { valmis, v: valmis ? a.v1 : visE(a.g), E: valmis ? a.v1 : moottoriTaso(alaG(a.g)) };
};
// mittaus (vain kun tila.mittaa = true): askel = rAF (render+piirto jo ajettu tässä kehyksessä), render = render():n jälkeen (uusi piirto)
//   HUOM: worldTransform päivittyy vasta näytön piirrossa (render() jälkeen), joten käytetään näytön PAIKALLISTA muunnosta, jonka render() asettaa.
const mitta = (lahde, a, r) => { if (!tila.mittaa || !a) return; const d = a.c._display, t = d && d.worldTransform;
    (tila.mitat = tila.mitat || []).push({ t: +performance.now().toFixed(1), lahde, r, s: a.c.scale, wt: d ? [d.scale.x, d.x, d.y] : null, maailma: t ? [t.a, t.tx, t.ty] : null, off: [a.c.screenOffsetX, a.c.screenOffsetY] }); };
const huoneCanvas = (c, ehdokas) => {
    const dpr = VW.devicePixelRatio || 1, sopii = el => el instanceof HTMLCanvasElement && Math.abs(el.width - c._width * dpr) <= 2 && Math.abs(el.height - c._height * dpr) <= 2;
    if (sopii(ehdokas)) return ehdokas;
    for (const el of document.querySelectorAll('canvas')) if (sopii(el)) return el;
    return null;
};
const sama = (x, y) => Math.abs(x - y) < 1e-9;
const css = (a, r) => { a.cv.style.transform = 'scale(' + Math.max(1, r) + ')'; };
const omaMuoto = v => /^scale\([\d.e+-]+\)$/.test(v || '');   // tämän skriptin kirjoittama transform-muoto
let viimeCv = null;   // { cv, vanhaT, t } viimeisin canvas jolta transform pudotettiin (hyppyvahdin RAE-tarkistus)
const pudota = (syy) => {
    const a = anim; if (!a) return; anim = null; viimeCv = { cv: a.cv, vanhaT: a.vanhaT, t: performance.now() };
    cancelAnimationFrame(a.raf); clearTimeout(a.ajastin);
    if (a.kaari && a.c.render === a.kaari) { if (a.omaR) a.c.render = a.alkuR; else delete a.c.render; }
    a.cv.style.transform = a.vanhaT; a.cv.style.transformOrigin = a.vanhaO;
    tila.pehmea.viimeisin = syy;
};
const lopeta = (a, syy) => {   // tavoite moottoriin jos ei vielä siellä, sitten transform pois
    const re = RE(); if (re && re.activeRoomId === a.rid && !sama(a.c.scale, a.v1)) zoomaaNyt(re, a.rid, a.v1);
    pudota(syy);
};
const vara = a => { clearTimeout(a.ajastin); a.ajastin = setTimeout(() => { if (anim === a) { tila.pehmea.varapudotuksia++; lopeta(a, 'vara'); } }, VARA); };
// render():n sisällä ENNEN piirtoa: moottorin vaihto + sitä vastaava CSS samaan kehykseen
const ennenPiirtoa = a => {
    const re = RE(); if (!re || re.activeRoomId !== a.rid) { pudota('huone vaihtui'); return; }
    const { v, E } = paivita(a);   // moottori = g:n alempi taso: zoom out vaihtaa heti kun g alittaa tason, zoom in kun g saavuttaa seuraavan
    if (!sama(E, a.c.scale)) { zoomaaNyt(re, a.rid, E); tila.pehmea.moottorikutsuja++; }
    css(a, v / a.c.scale);
};
const askel = () => {
    const a = anim; if (!a) return;
    const { valmis, v } = paivita(a); css(a, v / a.c.scale); mitta('askel', a, v / a.c.scale);
    if (valmis && sama(a.c.scale, a.v1)) { pudota('valmis'); return; }
    a.raf = requestAnimationFrame(askel);
};
// palauttaa true jos animaatio aloitettiin / kohdetta vaihdettiin
const pehmea = (re, rid, uusi, ehdokas, G = null) => {   // uusi = moottorin tavoite, G = sama pelitasona (puuttuu = peliTaso(uusi))
    if (anim) {
        if (anim.rid !== rid) { pudota('huone vaihtui'); return false; }
        paivita(anim); anim.G1 = G != null ? G : peliTaso(uusi); anim.v1 = uusi; anim.t0 = performance.now(); vara(anim); tila.pehmea.uudelleenkohdistuksia++;   // g jatkaa siitä missä on
        if (!anim.raf) anim.raf = requestAnimationFrame(askel);
        return true;
    }
    let c = null; try { c = typeof re.getRoomInstanceRenderingCanvas === 'function' ? re.getRoomInstanceRenderingCanvas(rid, 1) : null; } catch (x) {}
    if (!c || !(c.scale > 0) || !(c._width > 0) || !(c._height > 0) || typeof c.render !== 'function') return false;
    const cv = huoneCanvas(c, ehdokas); if (!cv) { tila.pehmea.eiCanvasta++; return false; }
    // RAE (kp 17:05-17:06 "se näkyy vaan tosi vähän aikaa se rakeisuus ... muutaman kerran se jumittu pidemmäks aikaa", pelizoomilla): jos canvakselle on jäänyt
    //   tämän skriptin muotoinen transform (edellinen instanssi kesken moottorin uudelleenkäynnistyksen tms.), sitä EI oteta palautettavaksi arvoksi
    const a = anim = { rid, cv, c, g: peliTaso(c.scale), G1: G != null ? G : peliTaso(uusi), v1: uusi, tl: performance.now(), t0: performance.now(), raf: 0, ajastin: 0, vanhaT: omaMuoto(cv.style.transform) ? '' : cv.style.transform, vanhaO: omaMuoto(cv.style.transform) ? '' : cv.style.transformOrigin,
        omaR: Object.prototype.hasOwnProperty.call(c, 'render'), alkuR: c.render };
    a.kaari = function () {
        if (anim === a) ennenPiirtoa(a);
        const r = a.alkuR.apply(this, arguments);
        if (anim === a) { mitta('render', a, (a.g === a.G1 ? a.v1 : visE(a.g)) / c.scale); if (a.g === a.G1 && sama(c.scale, a.v1)) { tila.pehmea.napsautuksia++; pudota('piirretty'); } }
        return r;
    };
    c.render = a.kaari;
    cv.style.transformOrigin = (c._width / 2) + 'px ' + (c._height / 2) + 'px';
    tila.pehmea.animaatioita++; vara(a);
    a.raf = requestAnimationFrame(askel);
    return true;
};
tila.pehmea = { animaatioita: 0, uudelleenkohdistuksia: 0, napsautuksia: 0, moottorikutsuja: 0, varapudotuksia: 0, eiCanvasta: 0, viimeisin: null };
const resizePehmea = () => { if (anim) lopeta(anim, 'resize'); };
window.addEventListener('resize', resizePehmea, true);

// Keskipisteen huonepiste HUONEEN koordinaatteina: sprite piirretään näytön paikalliseen x = huone-x + Math.trunc(_width / 2) (RoomSpriteCanvas.ts:736),
//   joten paikallinen piste siirtyy kun canvaksen leveys muuttuu (selainzoom), huonepiste ei. Oma ankkuri jos tila on sama kuin jätimme, muuten kokonaisluvuista.
const fokus = (c, rid) => {
    const sama = ankkuri && ankkuri.rid === rid && ankkuri.s === c.scale && ankkuri.ox === c.screenOffsetX && ankkuri.oy === c.screenOffsetY && ankkuri.w === c._width && ankkuri.h === c._height;
    return sama ? { x: ankkuri.x, y: ankkuri.y } : { x: (c._width / 2 - c.screenOffsetX) / c.scale - Math.trunc(c._width / 2), y: (c._height / 2 - c.screenOffsetY) / c.scale - Math.trunc(c._height / 2) };
};
const zoomaaNyt = (re, rid, uusi, R = null) => {   // R = keskelle jäävä huonepiste (selainzoom: purskeen alusta), oletus fokus()
    // MUSTA RUUTU (kp 6.11. 15:16 "ja taas tuli blackscreen"), mitattu robolla :9223 (tmp/zoom-kuplat/opus/out-e10..e12.json):
    //   moottori laskee uuden offsetin kokonaisluku-offsetista (setter Math.trunc) ja näytön worldTransformista (toLocal), joka on vanha jos
    //   välissä ei ole piirretty (piilotettu välilehti, raskas kehys). 1/32:ssa yksi pikseli = 32 huonepikseliä, takaisin 3:een x96:
    //   edestakainen 6 -> 1/128 -> 6 siirsi hahmon y -796 -> -2790; 6 nopeaa askelta 0.125 -> 4 piilotetulla välilehdellä heitti huoneen ruudun ulos.
    //   Korjaus: (1) alaraja ALIN (alle sen huone on pelkkä piste = musta ruutu); (2) keskipisteen huonepiste pidetään liukulukuna omien askelten yli
    //   ja annetaan moottorille point, jonka toLocal juuri sen hetken (mahdollisesti vanhalla) worldTransformilla palauttaa tarkalleen sen pisteen.
    let c = null; try { c = typeof re.getRoomInstanceRenderingCanvas === 'function' ? re.getRoomInstanceRenderingCanvas(rid, 1) : null; } catch (x) {}
    const t = c && c._display && c._display.worldTransform;
    let P = null, O = null;
    if (c && t && t.a > 0 && t.d > 0 && c.scale > 0 && Number.isFinite(t.tx + t.ty + c.screenOffsetX + c.screenOffsetY) && c._width > 0 && c._height > 0) {
        O = { x: c._width / 2, y: c._height / 2 };
        const F = R || fokus(c, rid), L = { x: F.x + Math.trunc(c._width / 2), y: F.y + Math.trunc(c._height / 2) };
        P = { x: t.a * L.x + t.c * L.y + t.tx, y: t.b * L.x + t.d * L.y + t.ty };
        const s0 = c.scale;
        re.setRoomInstanceRenderingCanvasScale(rid, 1, uusi, P, O, false, true);
        ankkuri = { rid, x: F.x, y: F.y, s: c.scale, ox: c.screenOffsetX, oy: c.screenOffsetY, w: c._width, h: c._height };
        vahti.zoom = { t: performance.now(), s0, s1: c.scale, R: !!R };
        kameraSynk(re, rid, c);
        return;
    }
    ankkuri = null;
    re.setRoomInstanceRenderingCanvasScale(rid, 1, uusi, null, null, false, true);   // keskipisteeseen kuten :zoom
    vahti.zoom = { t: performance.now(), s0: null, s1: uusi, R: false };
    try { kameraSynk(re, rid, re.getRoomInstanceRenderingCanvas(rid, 1)); } catch (x) {}
};

const enter = e => {
    const t = e.target; if (e.key !== 'Enter' || e.isComposing || !t || (t.tagName !== 'INPUT' && t.tagName !== 'TEXTAREA')) return;
    const m = /^\s*:zoombeta(?:\s+(\S+))?\s*$/i.exec(t.value || ''); if (!m) return;
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
    const v = komento('', m[1] ? [m[1]] : []);
    try { Object.getOwnPropertyDescriptor(Object.getPrototypeOf(t), 'value').set.call(t, ''); t.dispatchEvent(new Event('input', { bubbles: true })); } catch (x) { t.value = ''; }
    const d = document.createElement('div'); d.textContent = v;
    d.style.cssText = 'position:fixed;left:50%;bottom:64px;transform:translateX(-50%);z-index:2147483646;padding:5px 10px;font-size:12px;color:#fff;background:#222;border-radius:4px;pointer-events:none';
    document.body.appendChild(d); setTimeout(() => d.remove(), 3000);
};
const jonoRivi = [['zoombeta'], komento, 'ctrl+rulla pelin päällä: pelin zoom vai selaimen zoom: :zoombeta [on|pois]', 'Ctrl+rulla zoom'];
(VW.kuplaKomennotJono = VW.kuplaKomennotJono || []).push(jonoRivi);
varaTimer = setTimeout(() => { if (!VW.kuplaKomennot) document.addEventListener('keydown', enter, true); }, 4000);
// KUPLIVAIHE (ei capture): ajetaan vasta canvaksen oman (natiivin) kuuntelijan jälkeen, jolloin defaultPrevented kertoo että se on jo hoidettu
window.addEventListener('wheel', kasittele, { passive: false });

// ---- B22-kuplakorjaus (kortin 0.6.0 sama koodi; tmp/zoom-kuplat/userscript-patch.js) ----
let kuplaPoistu = () => {};
if (!VW.__kuplaBubbleZoomFix) {
    const SETTLE_MS = 400;               // after the last resize of a burst; React renders have run by then
    const widget = () => document.querySelector('.nitro-chat-widget');
    const chats = () => {
        const w = widget(); if (!w) return null;
        const key = Object.keys(w).find(k => k.startsWith('__reactFiber$')); if (!key) return null;
        for (let f = w[key]; f; f = f.return) {
            if (typeof f.type !== 'function') continue;
            for (const fiber of [ f, f.alternate ]) {
                const first = fiber && fiber.memoizedState;                 // hook 1 = chatMessages
                const list = first && first.memoizedState;
                if (Array.isArray(list) && (!list.length || (('skipMovement' in list[0]) && ('elementRef' in list[0])))) return list;
            }
            return null;                                                      // first function component above the widget div is ChatWidgetView
        }
        return null;
    };
    let burst = null, timer = 0;
    const fixes = [];
    const onResize = () => {
        if (!burst) {
            const w = widget(), list = chats();
            if (!w || !list) return;
            burst = { before: w.offsetHeight, snap: new Map(list.filter(c => c.elementRef).map(c => [ c, c.top ])) };
        }
        clearTimeout(timer);
        timer = setTimeout(() => {
            const b = burst; burst = null;
            const w = widget(); if (!b || !w) return;
            const expected = b.before - w.offsetHeight;                       // what ChatWidgetView's handler is meant to shift by
            const list = chats(); if (!list) return;
            for (const c of list) {
                if (!b.snap.has(c)) continue;                                  // created during the burst: placed by its own mount
                const want = b.snap.get(c) - expected;
                if (c.top !== want) { fixes.push(want - c.top); c.top = want; }   // note: a 6 s scroll tick inside the burst is overwritten (<= 15 px)
            }
        }, SETTLE_MS);
    };
    window.addEventListener('resize', onResize, true);
    tila.kuplat = { chats, fixes };   // fixes: px each bubble had to be moved back (diagnostic)
    kuplaPoistu = () => { clearTimeout(timer); window.removeEventListener('resize', onResize, true); };
} else loki('kortin kuplakorjaus ajossa, omaa ei asenneta');
// ---- Kuplat seuraavat puhujaa pelin zoomissa + raahauksen päällekkäisyys/järjestys (kp 6.11. "kupla seuraa puhujaa toteutetaan zoomiin", "järjestys menee väärin",
//   "kun vie kameraa siirtämällä kuplat sivuun edelleen overlappaa") ----
// MIKSI (mitattu robolla :9223 6.11., tmp/zoom-kuplat/opus-loki.md): (1) pelin zoom ei liikuta kuplia lainkaan (chat-widget ei kuuntele ROOM_ZOOMED) -> puhujat
//   liukuvat kuplien alta (s 2->1: kupla 336 vs puhuja 456 px). (2) Raahauksessa client tarkistaa vain parit joissa toinen kupla on REUNASSA
//   (ChatWidgetView.tsx checkOverlappingChats fromDrag): reunan takia rivin ylös nostettu kupla (ei itse reunassa) jää vanhemman päälle, ja päällekkäisyys
//   jää myös raahauksen takaisin jälkeen (RestoreEdgeLifts ei pääse alas, koska se leikkaa jo valmiiksi). Toistui s=1 ja s=2 samalla asettelulla.
// MITEN: pelin zoom (setRoomInstanceRenderingCanvasScale, myös :zoom ja natiivi #820) ja raahaus/kamera (setRoomInstanceRenderingCanvasOffset) kääritään
//   roomEnginen instanssissa (vain aktiivinen huone, canvas 1). Zoomin jälkeen jokainen kupla siirtyy SIVUSUUNNASSA puhujansa kohdalle (huone-x muistetaan
//   ensimmäisestä näkemästä, kaava RoomEngine.getRoomObjectScreenLocation: x*scale + width/2 + offsetX), sitten kameran nostot palautetaan ja koko pino
//   tarkistetaan: vanhempi kupla aina kokonaan uudemman yläpuolelle samassa sarakkeessa. Raahauksessa sama tarkistus clientin oman rAF-korjauksen JÄLKEEN,
//   ja myös reunan takia nostetut kuplat lasketaan kameran siirtämiksi. Nostot kirjataan edgeLiftiin, joten clientin oma palautus tuo ne takaisin alas.
//   Selainzoomissa (resize-purske) sama sivusiirto 450 ms purskeen jälkeen. Lisäksi zoom-kääre hylkää ei-äärellisen tason (NaN -> musta huone, kp 14:48).
// ITSESAMMUTUS: natiivi korjaus (PR robo/zoom-bubbles-follow) laittaa .nitro-chat-widget[data-camera-follow] -> kääreet päästävät kaiken läpi (NaN-vartija jää).
// RAJA: kuplan vaakapaikka on puhujan paikka VIESTIN hetkellä (kuten raahauksessa), ei kävelevän hahmon nykyinen paikka. Ennen tätä skriptiä tulleiden
//   kuplien huone-x lasketaan niiden nykyisestä paikasta, joten jos selainzoom on jo siirtänyt huonetta niiden alta, ne seuraavat sitä vanhaa paikkaa.
let kameraPoistu = () => {};
{
    const reK = RE();
    const widgetEl = () => document.querySelector('.nitro-chat-widget');
    const natiiviSeuraa = () => { const w = widgetEl(); return !!(w && w.dataset && w.dataset.cameraFollow); };
    const lista = () => {
        const w = widgetEl(); if (!w) return null;
        const key = Object.keys(w).find(k => k.startsWith('__reactFiber$')); if (!key) return null;
        for (let f = w[key]; f; f = f.return) {
            if (typeof f.type !== 'function') continue;
            for (const fiber of [ f, f.alternate ]) {
                const l = fiber && fiber.memoizedState && fiber.memoizedState.memoizedState;
                if (Array.isArray(l) && (!l.length || (l[0] && typeof l[0] === 'object' && ('skipMovement' in l[0]) && ('elementRef' in l[0])))) return l;
            }
            return null;
        }
        return null;
    };
    // sama geometria kuin clientin ChatEdgeLift.ts / DoChatsOverlap.ts (drawnLeft = piirretty paikka, left = puhujan paikka)
    const dl = c => (typeof c.drawnLeft === 'number' ? c.drawnLeft : c.left);
    const reunassa = c => Math.round(dl(c)) !== Math.round(c.left);
    const kameranSiirtama = c => reunassa(c) || c.edgeLift > 0;
    const samaSarake = (a, b) => !(((dl(a) + a.width) < dl(b)) || (dl(a) > (dl(b) + b.width)));
    const tiella = (vanha, uusi) => samaSarake(vanha, uusi) && ((vanha.top + vanha.height) >= uusi.top);
    const paallaPuhujilla = (a, b) => !(((a.left + a.width) < b.left) || (a.left > (b.left + b.width)) || ((a.top + a.height) < b.top) || (a.top > (b.top + b.height)));
    const paallekkain = (a, b, alas) => !(((dl(a) + a.width) < dl(b)) || (dl(a) > (dl(b) + b.width)) || ((a.top + a.height) < (b.top + alas)) || (a.top > (b.top + alas + b.height)));
    // LiftOlderChats (syy 'drag' | 'zoom'): uusimmasta vanhimpaan, vanhempi uudemman yläpuolelle, nosto kirjataan edgeLiftiin
    const nosta = (chats, syy) => {
        const uusin = chats[chats.length - 1]; if (!uusin) return 0;
        const valmiit = [ uusin ]; let n = 0;
        for (let i = chats.length - 2; i >= 0; i--) {
            const vanha = chats[i];
            for (let vartija = 0; vartija <= valmiit.length; vartija++) {
                const esteet = valmiit.filter(u => tiella(vanha, u) && ((syy !== 'drag') || kameranSiirtama(vanha) || kameranSiirtama(u)));
                if (!esteet.length) break;
                const este = esteet.reduce((yl, u) => (u.top < yl.top ? u : yl));
                const ennen = vanha.top;
                vanha.top = este.top - vanha.height - 1;
                vanha.skipMovement = este.skipMovement;
                vanha.edgeLift = (vanha.edgeLift || 0) + (ennen - vanha.top); n++;
            }
            valmiit.push(vanha);
        }
        return n;
    };
    // RestoreEdgeLifts (clientin sama): nostettu kupla alas niin pitkälle kuin tilaa on
    const palauta = chats => {
        for (let kierros = 0; kierros <= chats.length; kierros++) {
            let liikkui = false;
            for (const c of chats) {
                if (!(c.edgeLift > 0)) continue;
                let alas = 0;
                while (alas < c.edgeLift && !chats.some(o => o !== c && paallekkain(o, c, alas + 1))) alas++;
                if (alas <= 0) continue;
                c.top += alas; c.edgeLift -= alas; liikkui = true;
                if (c.edgeLift) continue;
                const vieressa = chats.find(o => o !== c && Math.abs(o.top - c.top) <= 1);
                c.skipMovement = vieressa ? vieressa.skipMovement : false;
            }
            if (!liikkui) break;
        }
    };
    const huoneX = new WeakMap();   // kupla -> puhujan x huoneen koordinaatteina
    const nakyma = (re, rid) => { const c = re.getRoomInstanceRenderingCanvas(rid, 1); return (c && c.scale > 0) ? { s: c.scale, w: c.width, ox: c.screenOffsetX } : null; };
    const k = tila.kamera = { zoomeja: 0, selainzoomeja: 0, siirtoja: 0, nostoja: 0, raahauksia: 0, virheita: 0, hylattyjaZoomeja: 0 };
    const muista = (rid, a, l) => { for (const c of l) if (c.elementRef && !huoneX.has(c) && (typeof c.roomId !== 'number' || c.roomId === rid)) huoneX.set(c, (c.left + c.width / 2 - a.w / 2 - a.ox) / a.s); };
    // a = näkymä jossa kuplat nyt ovat (huone-x muistetaan siitä niille joilla sitä ei vielä ole), b = uusi näkymä
    const seuraa = (rid, a, b, kartoitaPiirtamattomat = true) => {
        if (!a || !b || (a.s === b.s && a.w === b.w && a.ox === b.ox)) return;
        const l = lista(); if (!l || !l.length) return;
        const kartta = x => ((x - a.w / 2 - a.ox) / a.s) * b.s + b.w / 2 + b.ox;
        muista(rid, a, l);
        let n = 0;
        for (const c of l) {
            if (typeof c.roomId === 'number' && c.roomId !== rid) continue;
            if (!c.elementRef) { if (kartoitaPiirtamattomat && c.location && typeof c.location.x === 'number') c.location.x = Math.round(kartta(c.location.x)); continue; }   // ei vielä piirretty: paikka mountissa
            const uusi = Math.round(huoneX.get(c) * b.s + b.w / 2 + b.ox - c.width / 2);
            if (uusi !== c.left) { c.left = uusi; n++; }
        }
        k.zoomeja++; k.siirtoja += n;
        if (!n) return;
        const m = l.filter(c => c.elementRef);
        palauta(m); k.nostoja += nosta(m, 'zoom');
    };
    // SELAINZOOM (mitattu e8: pelin zoom 2, selain 100 -> 80 %: kuplat 160 px sivussa puhujasta, koska huonetta siirretään suoraan offsetilla ilman
    //   ROOM_DRAGia: clientin resize-ankkurointi useRoom.ts + yllä oleva keskitys). Purskeen alussa (capture, ennen clientin käsittelijöitä) huone-x muistiin,
    //   450 ms viimeisen resizen jälkeen (B22-korjauksen 400 ms jälkeen, jotta sen top-korjaus ei kumoa nostoja) kuplat puhujan kohdalle ja pino tarkistetaan.
    let purskeA = null, purskeRid = null, purskeAjastin = 0;
    const resizeAlku = () => {
        if (natiiviSeuraa() || !reK) return;
        if (!purskeA) { try { purskeRid = reK.activeRoomId; purskeA = nakyma(reK, purskeRid); const l = lista(); if (purskeA && l) muista(purskeRid, purskeA, l); } catch (e) { purskeA = null; } }
        clearTimeout(purskeAjastin);
        purskeAjastin = setTimeout(() => {
            const a = purskeA, rid = purskeRid; purskeA = null; if (!a || natiiviSeuraa() || rid !== reK.activeRoomId) return;
            try { const b = nakyma(reK, rid); const l = lista(); if (!b || !l) return;
                muista(rid, b, l);   // purskeen aikana tulleet: paikka on jo uudessa näkymässä, ne eivät liiku
                seuraa(rid, a, b, false); k.selainzoomeja++;
            } catch (e) { k.virheita++; loki('selainzoom-seuranta virhe: ' + e.message); }
        }, 450);
    };
    const raahausKorjaus = () => {
        if (natiiviSeuraa()) return;
        const l = lista(); if (!l || !l.length) return;
        const m = l.filter(c => c.elementRef);
        if (m.some(kameranSiirtama)) { k.raahauksia++; k.nostoja += nosta(m, 'drag'); }
    };
    if (reK && typeof reK.setRoomInstanceRenderingCanvasScale === 'function' && typeof reK.setRoomInstanceRenderingCanvasOffset === 'function') {
        const omatS = Object.prototype.hasOwnProperty.call(reK, 'setRoomInstanceRenderingCanvasScale'), omatO = Object.prototype.hasOwnProperty.call(reK, 'setRoomInstanceRenderingCanvasOffset');
        const alkuS = reK.setRoomInstanceRenderingCanvasScale, alkuO = reK.setRoomInstanceRenderingCanvasOffset;
        const kaariS = function (rid, cid, level, point, offsetPoint, isFlipForced) {
            // VARTIJA (kp 6.11. 14:48): `:zoom` ilman lukua lähettää parseFloat('') = NaN -> RoomEngine: level<1 ? 0.5 : Math.floor(NaN) = NaN -> musta huone.
            //   Ei-äärellinen taso ei pääse moottoriin, paitsi isFlipForced (moottori käyttää silloin -1:tä eikä lue tasoa).
            if (!isFlipForced && (typeof level !== 'number' || !Number.isFinite(level))) { k.hylattyjaZoomeja++; loki('hylätty zoom-taso ' + String(level)); return; }
            // SELAINZOOM ERILLÄÄN: clientin omat kutsut (:zoom, RoomZoomEvent, zoomnapit) antavat PELITASON ilman flagia -> moottorin oma rajaus
            //   (alle 1 -> 0.5, muuten floor, RoomEngine.setRoomInstanceRenderingCanvasScale) ja sitten * kerroin, flag päälle ettei moottori floorita.
            if (kerroin !== 1 && cid === 1 && rid === this.activeRoomId && !isFlipForced && !arguments[6]) {
                k.erotusKutsuja = (k.erotusKutsuja || 0) + 1;
                return kaariS.call(this, rid, cid, moottoriTaso(level < 1 ? 0.5 : Math.floor(level)), point, offsetPoint, false, true);
            }
            if (cid !== 1 || rid !== this.activeRoomId || natiiviSeuraa()) return alkuS.apply(this, arguments);
            let ennen = null; try { ennen = nakyma(this, rid); } catch (e) {}
            const r = alkuS.apply(this, arguments);
            try { seuraa(rid, ennen, nakyma(this, rid)); } catch (e) { k.virheita++; loki('zoom-seuranta virhe: ' + e.message); }
            try { kameraSynk(this, rid, this.getRoomInstanceRenderingCanvas(rid, 1)); } catch (e) {}   // B201: clientin omat napit / :zoom tasolle 1
            return r;
        };
        const kaariO = function (rid, cid) {
            const r = alkuO.apply(this, arguments);
            // clientin oma ROOM_DRAG-korjaus rekisteröi rAF:n tämän kutsun sisällä -> tämä ajetaan sen jälkeen samassa kehyksessä
            if (cid === 1 && rid === this.activeRoomId) requestAnimationFrame(() => { try { raahausKorjaus(); } catch (e) { k.virheita++; loki('raahauskorjaus virhe: ' + e.message); } });
            return r;
        };
        reK.setRoomInstanceRenderingCanvasScale = kaariS; reK.setRoomInstanceRenderingCanvasOffset = kaariO;
        // tason LUKU palauttaa pelitason (zoomnapit RoomToolsWidgetView/RoomWidgetsView puolittavat/tuplaavat sen, RoomView vertaa siihen);
        //   geometria (klikit, kuplat, MessengerPoint, pokemon-merkit) lukee canvas.scale:a suoraan = moottorin taso, joten se pysyy johdonmukaisena CSS-pikseleissä
        const omatG = Object.prototype.hasOwnProperty.call(reK, 'getRoomInstanceRenderingCanvasScale'), alkuG = reK.getRoomInstanceRenderingCanvasScale;
        const kaariG = typeof alkuG === 'function' ? function (rid, cid) { const v = alkuG.apply(this, arguments);
            const oma = (rid === undefined || rid === -1000 || rid === this.activeRoomId) && (cid === undefined || cid === -1 || cid === 1);
            return (kerroin !== 1 && oma && v > 0) ? peliTaso(v) : v; } : null;
        if (kaariG) reK.getRoomInstanceRenderingCanvasScale = kaariG;
        window.addEventListener('resize', resizeAlku, true);
        kameraPoistu = () => {
            window.removeEventListener('resize', resizeAlku, true); clearTimeout(purskeAjastin);
            if (kaariG && reK.getRoomInstanceRenderingCanvasScale === kaariG) { if (omatG) reK.getRoomInstanceRenderingCanvasScale = alkuG; else delete reK.getRoomInstanceRenderingCanvasScale; }
            if (reK.setRoomInstanceRenderingCanvasScale === kaariS) { if (omatS) reK.setRoomInstanceRenderingCanvasScale = alkuS; else delete reK.setRoomInstanceRenderingCanvasScale; }
            if (reK.setRoomInstanceRenderingCanvasOffset === kaariO) { if (omatO) reK.setRoomInstanceRenderingCanvasOffset = alkuO; else delete reK.setRoomInstanceRenderingCanvasOffset; }
        };
    } else loki('roomEngine puuttuu: kuplien zoom-seuranta ei asennettu');
}
// ---- Selainzoom erillään pelin zoomista (0.9.1, kp 6.11. 15:35 "haluun erottaa pelin zoomin ja selain zoomin"; korvaa 0.7.x:n keskityslohkon) ----
// MIKSI: renderöijän resoluutio = devicePixelRatio (DprRenderingMode.ts GetDesiredResolution, useRoom.ts renderer.resize(w, h, dpr), autoDensity), joten
//   huonepikseli on fyysisesti moottorin taso * dpr ja selainzoom (joka muuttaa dpr:ää) kasvattaa huonetta UI:n mukana. Lisäksi clientin resize-käsittelijä
//   (useRoom.ts, #197) ankkuroi offsetin CSS-pikseleihin: huone liukuu (100 % -> 67 % pelitasolla 2: -308/-325 CSS-px, mitattu 0.7.x:ssä).
// MITEN: moottorin taso = pelitaso * kerroin, kerroin = dprPohja / dpr, joten fyysinen koko = pelitaso * dprPohja kuten 100 %:ssa ja näytteistys samassa
//   suhteessa (nearest) -> yhtä terävä. Moottori piirtää murtotasot (mitattu robolla: taso 2.4 -> näyttö 2.4, hahmon laatikko 216x367 = 2.4/3 * 270x459).
//   Geometria (klikit, kuplat, MessengerPoint, pokemon-merkit) lukee canvas.scale:a suoraan, joten se pysyy johdonmukaisena; tason LUKU palauttaa
//   pelitason ja clientin tason ASETUS kerrotaan kertoimella (kamera-lohkon kaariS/kaariG).
//   Keskitys: purskeen ensimmäisessä resize-tapahtumassa (capture, ennen clientin käsittelijää) keskipisteen HUONEPISTE muistiin (fokus: liukuluku omasta
//   ankkurista, joten askeleet eivät kerää Math.trunc-virhettä; 0.9.0 WIP ajelehti ~2 fyys. px per askel). Uusi taso ja keskitys asetetaan canvaksen OMASSA
//   render()-kutsussa ennen piirtoa (sama kehys kuin clientin ankkuroima tila olisi piirretty -> ei välikehystä), vara 500 ms jos render() ei aja.
// POHJA (dprPohja): kerran asennushetkellä. Selainzoom = outerWidth/innerWidth pyöristettynä Chromen zoom-portaisiin, hyväksytään vain jos ikkunan kehys
//   (outerWidth - innerWidth * zoom) on 0-24 DIP (mitattu robolla 16 kaikilla 80-125 %: 1256 - 1240) ja dpr / zoom on tavallinen käyttöjärjestelmäskaala;
//   muuten zoom = 1 (pohja = dpr). Sen jälkeen VAIN dpr:n muutos muuttaa kerrointa, joten sivuun telakoitu DevTools ei sotke myöhemmin.
// RAJA: (1) pelitasolla 1 moottori pysyy 1:ssä (kamera seuraa hahmoa vain skaalalla tasan 1), joten tasolla 1 huone skaalautuu selainzoomin mukana kuten
//   ennen. (2) Ikkunan siirto toiselle näytölle jolla eri käyttöjärjestelmäskaala luetaan selainzoomiksi. (3) DevTools sivulla auki asennushetkellä voi antaa
//   väärän pohjan, jos kehysehto ja OS-skaalaehto osuvat sattumalta. (4) Pelkkä ikkunan koonmuutos (dpr sama) jää clientin #197-ankkuroinnille kuten ennen.
let selainPoistu = () => {};
{
    const kanvas = () => { const re = RE(); if (!re || typeof re.getRoomInstanceRenderingCanvas !== 'function') return null;
        const rid = re.activeRoomId; if (rid == null || rid === -1) return null; try { return re.getRoomInstanceRenderingCanvas(rid, 1) || null; } catch (e) { return null; } };
    const ZOOMIT = [0.25, 1 / 3, 0.5, 2 / 3, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5], OS = [1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 3, 3.5, 4];
    const pohja = () => {
        const dpr = VW.devicePixelRatio || 1, ow = VW.outerWidth || 0, iw = VW.innerWidth || 0;
        let z = 1;
        if (ow > 0 && iw > 0) { const r = ow / iw; let paras = 1; for (const v of ZOOMIT) if (Math.abs(v - r) < Math.abs(paras - r)) paras = v;
            const kehys = ow - iw * paras; if (kehys >= 0 && kehys <= 24) z = paras; }
        const p = dpr / z, os = OS.find(o => Math.abs(o - p) / o < 0.02); return os !== undefined ? os : dpr;
    };
    const kunnossa = c => c && c.scale > 0 && c._width > 0 && c._height > 0;
    // ASETTUMINEN: livessä clientin ankkurointi tulee osin rAF:n JÄLKEEN (ResizeObserver / dpr-MQL-vahti; mitattu robolla 6.11. 16:2x: yksi asetus render()-kutsussa
    //   jäi clientin ankkuroinnin alle, keskipiste liukui ~leveyden muutos / (2 * taso), 110 %: -18.6 huone-px). Siksi purske pysyy auki ASETTUU ms viimeisestä
    //   resize-tapahtumasta tai asetuksesta, ja asetus tehdään uudelleen AINA kun canvaksen koko tai dpr on muuttunut siitä mihin viimeksi asetettiin.
    //   Pelkkä offsetin muutos (raahaus) ei laukaise uudelleenasetusta.
    const ASETTUU = 700;
    let purske = null;   // { rid, c, R, k, G, E, jatetty, loppu, ajastin, kaari, omaR, alkuR }
    selainAuki = () => !!purske;
    const irrota = p => { clearInterval(p.ajastin); if (p.kaari && p.c.render === p.kaari) { if (p.omaR) p.c.render = p.alkuR; else delete p.c.render; } };
    const lopetaP = () => { const p = purske; if (!p) return; purske = null; irrota(p); };
    const tarkista = syy => {
        const p = purske; if (!p) return;
        const re = RE(), c = kanvas(); if (!re || re.activeRoomId !== p.rid || c !== p.c || !kunnossa(c)) { lopetaP(); return; }
        const dpr = VW.devicePixelRatio || 1, kUusi = dprPohja / dpr;   // ei pyöristystä: moottoriTaso pyöristää tuloksen (2 * 1.5 / 2.25 = 1.333333, ei 1.333334)
        const muuttui = p.jatetty ? (p.jatetty.w !== c._width || p.jatetty.h !== c._height || p.jatetty.dpr !== dpr) : Math.abs(kUusi - p.k) > 1e-6;
        if (muuttui) {
            if (p.E !== null && c.scale !== p.E) p.G = peliTaso(c.scale);   // joku muutti tasoa purskeen aikana (rulla, :zoom): sen taso pitää
            kerroin = kUusi; const E = moottoriTaso(p.G);
            if (!(p.G === 1 && c.scale === 1)) zoomaaNyt(re, p.rid, E, p.R);   // pelitaso 1: moottori pysyy 1:ssä, kamera hoitaa kuten ennen
            p.E = c.scale; p.jatetty = { w: c._width, h: c._height, dpr }; p.loppu = performance.now() + ASETTUU;
            tila.erotus = { syy, dprPohja, dpr, kerroin, peli: p.G, moottori: c.scale, n: ((tila.erotus && tila.erotus.n) || 0) + 1 };
        }
        if (performance.now() > p.loppu) lopetaP();
    };
    const alku = () => {   // resize capture: purskeen ensimmäinen tapahtuma, ennen clientin käsittelijää
        if (dprPohja == null) return;
        if (purske) { purske.loppu = performance.now() + ASETTUU; return; }   // kesken: sama huonepiste, ei clientin ankkuroimasta tilasta
        const re = RE(), c = kanvas(); if (!re || !kunnossa(c)) return;
        const rid = re.activeRoomId;
        const p = purske = { rid, c, R: fokus(c, rid), k: kerroin, G: peliTaso(c.scale), E: null, jatetty: null, loppu: performance.now() + ASETTUU, ajastin: 0, kaari: null, omaR: false, alkuR: null };
        if (typeof c.render === 'function') {
            p.omaR = Object.prototype.hasOwnProperty.call(c, 'render'); p.alkuR = c.render;
            p.kaari = function () { if (purske === p) tarkista('render'); return p.alkuR.apply(this, arguments); };
            c.render = p.kaari;
        }
        p.ajastin = setInterval(() => { if (purske === p) tarkista('vara'); }, 250);   // render() ei aja piilotetulla välilehdellä
    };
    // PURSKEEN ALKU = clientin canvaksen koonmuutos (InitializeRoomInstanceRenderingCanvas -> roomEngine.initializeRoomInstanceRenderingCanvas), ENNEN alkuperäistä:
    //   client laskee ankkuroidun offsetin ennen sitä ja asettaa sen vasta sen jälkeen (useRoom.ts resize), joten tässä tila on vielä ankkuroimaton.
    //   Mitattu robolla 6.11. (opus/jarj.js, 100 -> 110 %): clientin ensimmäinen init 4.7 ms ENNEN window resize -tapahtumaa (offset jo -1368 -> -1198 resizessa),
    //   joten pelkkä resize-capture otti huonepisteen clientin ankkuroimasta tilasta. Resize-capture jää varalle (jos tapahtuma tulee ensin).
    const reI = RE(); let kaariI = null; const omatI = !!reI && Object.prototype.hasOwnProperty.call(reI, 'initializeRoomInstanceRenderingCanvas'), alkuI = reI && reI.initializeRoomInstanceRenderingCanvas;
    if (typeof alkuI === 'function') {
        kaariI = function (rid, cid, ww, hh) {
            try { if (cid === 1 && rid === this.activeRoomId) { vahti.init = performance.now(); const c = kanvas(); if (kunnossa(c) && (ww !== c._width || hh !== c._height)) alku(); } } catch (e) {}
            return alkuI.apply(this, arguments);
        };
        reI.initializeRoomInstanceRenderingCanvas = kaariI;
    }
    window.addEventListener('resize', alku, true);
    const vv = VW.visualViewport; if (vv) vv.addEventListener('resize', alku, true);
    dprPohja = pohja(); tila.dprPohja = dprPohja;
    // ladattiin jo zoomattuna: sama polku heti (taso tähän asti ilman kerrointa)
    if (Math.abs(dprPohja / (VW.devicePixelRatio || 1) - 1) > 1e-6) { alku(); tarkista('asennus'); }
    selainPoistu = () => {
        window.removeEventListener('resize', alku, true); if (vv) vv.removeEventListener('resize', alku, true);
        if (kaariI && reI.initializeRoomInstanceRenderingCanvas === kaariI) { if (omatI) reI.initializeRoomInstanceRenderingCanvas = alkuI; else delete reI.initializeRoomInstanceRenderingCanvas; }
        lopetaP();
        if (kerroin !== 1) { const re = RE(), c = kanvas(); const G = kunnossa(c) ? peliTaso(c.scale) : null; kerroin = 1;   // takaisin pelitasolle ilman kerrointa
            if (re && G != null && G !== c.scale) zoomaaNyt(re, re.activeRoomId, G); }
    };
}
// ---- Hyppyvahti + vartija (0.9.2, B201; kp 16:47 "ei silti toistu consistently", 16:48 "joku älykäs fix mikä ei vaadi et osataa toistaa rare bugi") ----
// VAHTI (passiivinen, vain konsoli, ei paketteja): joka kehys keskipisteen huonepiste R; jos se siirtyy yhdessä kehyksessä yli 20 CSS-px (|ΔR| * taso) samassa
//   huoneessa, konsoliin YKSI rivi "[huone-zoom HYPPY] {...}" kontekstin kanssa (offset ennen/jälkeen, pelitaso/moottorin taso, dpr, ikkuna ja canvas, ms
//   viimeisestä fokuksesta / näkyvyydestä / resizesta / canvaksen initistä / rullasta / zoomista, siirtymä kesken, rullatikit purskeessa, kamera).
//   Viimeiset 20 myös __huoneCtrlZoom.hypyt. Ei kirjaa: 3 s huoneeseen tulosta (kamera asettuu), hiiren raahausta (hiiri alhaalla JA moottori raahaa),
//   kameran omaa liukua tasolla 1 (kamera synkassa kummassakin kehyksessä; B201-napsautuksessa se ei ole).
// RAE (kp 17:05-17:07, vain todiste): siirtymä kesken > KESTO + 1500 ms -> pakotettu loppu; 500 ms siirtymän jälkeen canvakselle jäänyt scale() tai
//   backing != CSS * dpr -> rivi "[huone-zoom RAE] {...}" (jäänyt scale() palautetaan).
// VARTIJA (invariantti, ei vaadi toistoa): jokaisella rulla-askeleella aiottu keskipisteen huonepiste talteen syötehetkellä; KESTO + 150 ms jälkeen ja
//   yhden rAF:n päästä (siirtymä ohi) luetaan todellinen. Jos poikkeama > 4 CSS-px, taso on se mihin askel vei, siirtymä ja selainzoom-purske eivät ole kesken,
//   hiiri ei ole alhaalla eikä kamera liiku, offset korjataan YHDEN kerran ja kamera synkataan (kameraSynk). Uusi askel korvaa odottavan tarkistuksen.
//   Korjaus kirjataan konsoliin samassa muodossa ("KORJAUS").
// RAJA: vartija katsoo vain ctrl+rulla-askeleita (ei clientin nappeja / :zoom); kameran hyppy myöhemmin (hahmon askel) näkyy vain vahdissa, ja sen juurisyy
//   korjataan kameraSynk:llä (zoomaaNyt, kaariS ja varapolkuna kehys jossa taso vaihtui 1:een mistä tahansa lähteestä).
let vahtiPoistu = () => {};
{
    const HYPPY = 20, KORJAA = 4;
    const nyt = () => performance.now();
    const ok = c => c && c.scale > 0 && c._width > 0 && c._height > 0;
    const Rraaka = c => ({ x: (c._width / 2 - c.screenOffsetX) / c.scale - Math.trunc(c._width / 2), y: (c._height / 2 - c.screenOffsetY) / c.scale - Math.trunc(c._height / 2) });
    let hiiriAlas = false, edell = null, huoneAlku = 0, rafV = 0, viimeKonsoli = 0, odotus = null;
    const kamera = (re, rid) => { try { const d = re._roomInstanceDatas && re._roomInstanceDatas.get(rid), k = d && d.roomCamera; const l = k && k.location;
        return k ? { loc: l ? [l.x, l.y] : null, liikkuu: !!k.isMoving } : null; } catch (e) { return null; } };
    const nakyma = n => n && { s: n.s, peli: peliTaso(n.s), off: [n.ox, n.oy], wh: [n.w, n.h] };
    const kirjaa = (laji, re, rid, e, n, dx, dy, lisa) => {
        const ms = v => v == null ? null : Math.round(nyt() - v);
        const rivi = { v: tila.versio, laji, klo: new Date().toTimeString().slice(0, 8), rid, hyppy: [Math.round(dx), Math.round(dy)], ennen: nakyma(e), jalkeen: nakyma(n),
            dt: e && n ? Math.round(n.t - e.t) : null, dpr: VW.devicePixelRatio, kerroin: pyor(kerroin), dprPohja, ikkuna: [VW.innerWidth, VW.innerHeight, VW.outerWidth, VW.outerHeight],
            ms: { fokus: ms(vahti.fokus), blur: ms(vahti.blur), nakyvyys: ms(vahti.nakyvyys), resize: ms(vahti.resize), init: ms(vahti.init), rulla: ms(vahti.rulla), zoom: vahti.zoom ? ms(vahti.zoom.t) : null },
            nakyvyys: document.visibilityState, fokusNyt: document.hasFocus(), siirtyma: anim ? { g: pyor(anim.g), G1: pyor(anim.G1), v1: pyor(anim.v1) } : null, selainPurske: selainAuki(),
            rullaTikit: vahti.rullaN, zoom: vahti.zoom ? { s0: vahti.zoom.s0, s1: vahti.zoom.s1 } : null, hiiri: hiiriAlas, raahaa: !!(re && re._activeRoomIsDragged), kamera: kamera(re, rid), ...lisa };
        (tila.hypyt = tila.hypyt || []).push(rivi); if (tila.hypyt.length > 20) tila.hypyt.shift();
        if (nyt() - viimeKonsoli > 1000 || laji === 'KORJAUS') { viimeKonsoli = nyt(); try { console.warn('[huone-zoom ' + laji + '] ' + JSON.stringify(rivi)); } catch (x) {} }
    };
    const kehys = () => {
        rafV = requestAnimationFrame(kehys);
        try {
            const re = RE(), rid = re && re.activeRoomId; const c = (rid != null && rid !== -1) ? re.getRoomInstanceRenderingCanvas(rid, 1) : null;
            if (!ok(c)) { edell = null; return; }
            const R = Rraaka(c), n = { t: nyt(), rid, s: c.scale, ox: c.screenOffsetX, oy: c.screenOffsetY, w: c._width, h: c._height, Rx: R.x, Ry: R.y };
            if (n.s === 1) { const k = kamera(re, rid); n.kl = k && k.loc; }
            // RAE (kp 17:05-17:07, matala prioriteetti, vain todiste): siirtymä jumissa > KESTO + 1500 ms -> pakotetaan loppuun; pudotuksen jälkeen 500 ms
            //   canvakselle jäänyt transform tai backing != CSS * dpr -> rivi "[huone-zoom RAE]" (transform palautetaan, backingiin ei kosketa)
            if (anim && n.t - anim.t0 > KESTO + 1500) { kirjaa('RAE', re, rid, n, n, 0, 0, { syy: 'siirtymä jumissa', css: anim.cv.style.transform }); lopeta(anim, 'vahti'); }
            else if (!anim && viimeCv && n.t - viimeCv.t > 500) { const v = viimeCv; viimeCv = null; const dpr = VW.devicePixelRatio || 1;
                if (omaMuoto(v.cv.style.transform) && v.cv.style.transform !== 'scale(1)' && v.cv.style.transform !== v.vanhaT) { kirjaa('RAE', re, rid, n, n, 0, 0, { syy: 'transform jäi', css: v.cv.style.transform }); v.cv.style.transform = v.vanhaT; }
                if (v.cv.isConnected && (Math.abs(v.cv.width - c._width * dpr) > 2 || Math.abs(v.cv.height - c._height * dpr) > 2)) kirjaa('RAE', re, rid, n, n, 0, 0, { syy: 'backing', backing: [v.cv.width, v.cv.height], odotettu: [c._width * dpr, c._height * dpr] }); }
            const e = edell; edell = n;
            if (!e || e.rid !== rid) { huoneAlku = n.t; return; }
            // B201 varapolku: taso tuli 1:een MILLÄ TAHANSA (myös userscript-kopio tai muu skripti, joka ei kulje zoomaaNyt/kaariS:n kautta) -> kamera synkkaan.
            //   Kattaa myös kameran ilman sijaintia (huoneeseen tultu tasolla != 1: muuten initializeLocation(0,0,0) -> offset (0,0), RoomEngine.ts:1457-1462).
            if (e.s !== 1 && n.s === 1) kameraSynk(re, rid, c);
            if (n.t - huoneAlku < 3000) return;
            const dx = (n.Rx - e.Rx) * n.s, dy = (n.Ry - e.Ry) * n.s;
            if (!(Math.hypot(dx, dy) > HYPPY)) return;
            if (hiiriAlas && re._activeRoomIsDragged) return;
            // kameran oma liuku tasolla 1: kamera oli synkassa (offset = -sijainti) sekä ennen että jälkeen -> kameran siirto, ei hyppy.
            //   B201-napsautus näkyy, koska ennen sitä kameran sijainti EI vastannut offsetia.
            const synkassa = q => q.kl && Math.abs(q.kl[0] + q.ox) < 2 && Math.abs(q.kl[1] + q.oy) < 2;
            if (e.s === 1 && n.s === 1 && synkassa(e) && synkassa(n)) return;
            kirjaa('HYPPY', re, rid, e, n, dx, dy);
        } catch (x) {}
    };
    const tarkasta = (o, yritys) => {
        if (odotus !== o) return;
        const re = RE(); if (!re || re.activeRoomId !== o.rid) { odotus = null; return; }
        let c = null; try { c = re.getRoomInstanceRenderingCanvas(o.rid, 1); } catch (x) {}
        if (!ok(c)) { odotus = null; return; }
        if ((anim || selainAuki()) && yritys < 3) { o.ajastin = setTimeout(() => { o.raf = requestAnimationFrame(() => tarkasta(o, yritys + 1)); }, KESTO + 150); return; }
        odotus = null;
        if (anim || selainAuki() || Math.abs(c.scale - moottoriTaso(o.G)) > 1e-6 || hiiriAlas) return;   // joku muu muutti tilaa: ei korjata
        const R = Rraaka(c), dx = (R.x - o.R.x) * c.scale, dy = (R.y - o.R.y) * c.scale;
        if (!(Math.hypot(dx, dy) > KORJAA)) return;
        const kam = kamera(re, o.rid), e = { t: o.t, s: c.scale, ox: c.screenOffsetX, oy: c.screenOffsetY, w: c._width, h: c._height };
        if (c.scale === 1 && kam && kam.liikkuu) { kirjaa('POIKKEAMA', re, o.rid, e, e, dx, dy, { korjattu: false, syy: 'kamera liikkuu' }); return; }
        const x = c._width / 2 - (o.R.x + Math.trunc(c._width / 2)) * c.scale, y = c._height / 2 - (o.R.y + Math.trunc(c._height / 2)) * c.scale;
        re.setRoomInstanceRenderingCanvasOffset(o.rid, 1, { x, y });
        ankkuri = { rid: o.rid, x: o.R.x, y: o.R.y, s: c.scale, ox: c.screenOffsetX, oy: c.screenOffsetY, w: c._width, h: c._height };
        kameraSynk(re, o.rid, c); vahti.korjauksia++;
        const n = { t: nyt(), s: c.scale, ox: c.screenOffsetX, oy: c.screenOffsetY, w: c._width, h: c._height };
        edell = null;   // oma korjaus ei ole hyppy
        kirjaa('KORJAUS', re, o.rid, e, n, dx, dy, { korjattu: true });
    };
    vartija = (re, rid, G) => {
        let c = null; try { c = re.getRoomInstanceRenderingCanvas(rid, 1); } catch (x) {}
        if (!ok(c)) return;
        if (odotus) { clearTimeout(odotus.ajastin); cancelAnimationFrame(odotus.raf); }
        const o = odotus = { rid, G, R: fokus(c, rid), t: nyt(), ajastin: 0, raf: 0 };
        o.ajastin = setTimeout(() => { o.raf = requestAnimationFrame(() => tarkasta(o, 0)); }, KESTO + 150);
    };
    const kuuntelijat = [
        [VW, 'focus', () => { vahti.fokus = nyt(); }], [VW, 'blur', () => { vahti.blur = nyt(); }], [document, 'visibilitychange', () => { vahti.nakyvyys = nyt(); }],
        [VW, 'resize', () => { vahti.resize = nyt(); }],
        [VW, 'wheel', e => { if (!e.ctrlKey) return; const t = nyt(); if (vahti.rulla == null || t - vahti.rulla > 300) vahti.rullaN = 0; vahti.rullaN++; vahti.rulla = t; }],
        [VW, 'pointerdown', () => { hiiriAlas = true; }], [VW, 'pointerup', () => { hiiriAlas = false; }], [VW, 'pointercancel', () => { hiiriAlas = false; }]];
    for (const [k, n, f] of kuuntelijat) k.addEventListener(n, f, { capture: true, passive: true });
    rafV = requestAnimationFrame(kehys);
    tila.vahti = vahti;
    vahtiPoistu = () => {
        cancelAnimationFrame(rafV); if (odotus) { clearTimeout(odotus.ajastin); cancelAnimationFrame(odotus.raf); odotus = null; } vartija = () => {};
        for (const [k, n, f] of kuuntelijat) k.removeEventListener(n, f, { capture: true, passive: true });
    };
}
loki('asennettu');

tila.poistu = () => {
    vahtiPoistu();
    clearTimeout(varaTimer); window.removeEventListener('wheel', kasittele, { passive: false });
    pudota('poistu'); window.removeEventListener('resize', resizePehmea, true);
    document.removeEventListener('keydown', enter, true); kuplaPoistu(); kameraPoistu(); selainPoistu();
    try { const j = VW.kuplaKomennotJono, i = j ? j.indexOf(jonoRivi) : -1; if (i >= 0) j.splice(i, 1); } catch (e) {}   // jos komentomoduuli ei ole vielä lukenut jonoa
    if (VW.__huoneCtrlZoom === tila) delete VW.__huoneCtrlZoom;
};
return tila.poistu;
