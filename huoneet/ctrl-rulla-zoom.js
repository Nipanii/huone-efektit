// Huoneskripti: Ctrl+rulla pelialueen päällä vaihtaa pelin omaa zoomia (huone 424, kp 6.11. 13:16 "laita samanlailla jakoon se scroll zoom huoneeseen.
//   disabloituu jos livessä"). Sama logiikka kuin kortti userscriptit/ctrl-rulla-zoom/ctrl-rulla-zoom.user.js 0.6.0 (zoom + B22-kuplakorjaus), käärittynä
//   huoneskriptin muotoon: ei @-otsikoita, palauttaa siivousfunktion, uudelleenajo siivoaa edellisen (window.__huoneCtrlZoom).
//   Moottori (moottori.js:66-67) ajaa tämän new Function('kupla', koodi)(api):lla ja kutsuu paluuarvoa huoneesta lähtiessä.
//
// MITEN: :zoom lähettää RoomZoomEvent(roomId, taso), joka päätyy RoomEngine.setRoomInstanceRenderingCanvasScale(roomId, 1, taso, ...). Askel 0.5 (0.5, 1, 1.5 ...),
//   0.12.0: ylaraja 4, alaraja 1/8 (0.7.2, musta ruutu); rullatikki kertoo tason suhteella 2^(1/6) (taulukko TASOT). wheel-kuuntelija passive:false + preventDefault estää Chromen ctrl+rulla-zoomin
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
// TASOT (0.12.0, kp 6.11. 21:32 "jos ei oo teknistä estettä nii tehää noi"): joka rullatikki kertoo pelitason suhteella r = 2^(1/6) (~1.1225) molempiin suuntiin,
//   TASOT[k] = 2^(k/6), k = -18..12 (1/8 ... 4; 1, 2, 4, 1/2 ... tasan 2:n potensseja). Taso 1, 2 ja 4 menee suoraan moottorille. Muut ovat kutistustasoja
//   (lohko "PIENI"): alle 1 moottori 1 ja G = taso; yli 1 moottori E = ceil(taso) ja G = taso / E (2.24 ... 2.83: E 3; 3.17, 3.56: E 4).
//   Aiemmat taulukot (VALI 1 ... 2, PIENET alle 1, kokonaisluvut 2 -> 3 -> 4 ...) korvattu tällä yhdellä.
// 0.13.0 (kp 6.11. 22:21 "sisääpäi tyssää aika aikasee", 22:21 "kyl kestää"): yläraja 4 -> 8, alaraja 1/8 -> 1/4 (kp 22:23) (k = -12..18). Moottori E = ceil(taso) 5 ... 8.
// 0.14.0 (kp 6.11. 22:13 "et se tunnistaa ton browser scaling jne ja tekee JOTAIN jos on huonot setit"; Shorp: Windows 1920x1080 150 % -> dpr 1.5): lohko "DPR-SNAP" alla. Kun devicePixelRatio ei ole
//   kokonaisluku, rullaportaat ovat tasot n / dpr (n = kokonaisluku laite-px per taide-px) ja ne piirretään pikselintarkasti; kokonaisluku-dpr:llä ja snap("pois"):lla kaikki kuten 0.13.0.
const TASOT = []; for (let k = -12; k <= 18; k++) TASOT.push(Math.pow(2, k / 6));
const tasoAskel = (x, ylos) => {   // seuraava taso taulukossa; rajalla (yli 8 ylös, alle 1/4 alas) sama taso eli ei askelta
    const L = snapPaalla() ? snapLadder() : TASOT;   // 0.14.0: murto-dpr -> tasot n / dpr
    if (ylos) { for (const v of L) if (v > x + 1e-6) return v; return x; }
    for (let i = L.length - 1; i >= 0; i--) if (L[i] < x - 1e-6) return L[i];
    return x;
};
const onVali = u => PIENI.paalla && u > 1 + 1e-6 && Math.abs(u - Math.round(u)) > 1e-6;   // yli 1, ei kokonaisluku: moottori ceil(u) + kutistus
// LIUKU pois 0.10.1 (kp 6.11. 20:36 "otetaa se interpoloitu zoom efekti pois. siis se animaatio tasojen välis", Res: pikselien uudelleenasettuminen
//   sattuu silmään nurmikkohuoneessa): joka askel on välitön. Lohko "PEHMEÄ ZOOM" jää koodiin (true palauttaa liu'un), RAE-vahti ja kamera ennallaan.
const LIUKU = false;
const ALIN = 0.25;   // 0.13.0 kp 22:23 "max outward zoom vaik 0.25" (oli 0.125). pienin rullatessa (kp 15:16 musta ruutu: 1/128:ssa huone on 1 px ja paluumatkalla karkaa, ks. kasittele)
let ankkuri = null;   // keskipisteen huonepiste (HUONEEN koordinaatit, ks. fokus) liukulukuna omien askelten yli
// pelin zoom erillään selaimen zoomista (0.9.1): moottorin taso = pelitaso * kerroin, kerroin = dprPohja / devicePixelRatio (ks. lohko "Selainzoom erillään")
let kerroin = 1, dprPohja = null;
const pyor = v => Math.round(v * 1e6) / 1e6;
// KOON TILAT (0.9.4, kp 6.11. 17:42 "en tykkää että peli rakeutuu", "haluun testailla eri ratkaisuja. kukaan ei tule käyttämään noita rakeisia"):
//   miten pelitaso G muutetaan moottorin tasoksi kun selainzoom (dpr) poikkeaa pohjasta. Vaihto ajossa: __huoneCtrlZoom.tila('pikseli'), muistetaan
//   localStorage 'kupla.ctrlZoomTila'. MITATTU robolla 6.11. 17:51 (backing rAF:ssa, tmp/zoom-kuplat/opus/px.js, px-v1.json): terävyys riippuu siitä onko
//   MOOTTORIN taso kokonaisluku, ei fyysisestä koosta. pikseli 100 %:ssa: moottori 3.333 * 1.5 = tasan 5 fyys. px, silti juoksut 4/6/5 (22 % floor/ceil-
//   juoksuja), kun kokonaislukutaso 3 (4.5 fyys. px) antaa 4/5 (78 %). Moottori siis pyöristää murtotason CSS-pikseleihin ennen dpr:ää (päätelty mittauksesta).
//   Siksi OLETUS = taso.
//   pikseli: moottori * dpr = lähin kokonaisluku tavoitteesta G * dprPohja. Alle 1: 1 / kokonaisluku. Rakeinen paitsi kun moottori sattuu lähes kokonaisluvuksi.
//   taso:    moottori = lähin kokonaislukutaso (alle 1: puolitus) tavoitteesta G * kerroin: terävä, koko poikkeaa (125 %, taso 3: moottori 2, -16.7 %).
//   vanha:   selainzoom skaalaa huoneen kuten ennen 0.9.x (kerroin 1, ei keskitystä selainzoomissa).
//   tarkka:  moottori = G * kerroin tarkalleen (0.9.1-0.9.3): koko tarkka, murtotaso rakeutuu. Vain vertailuun.
const TILAT = ['pikseli', 'taso', 'vanha', 'tarkka'], OLETUS = 'taso';
let kokoTila = OLETUS;
try { const s = localStorage.getItem('kupla.ctrlZoomTila'); if (TILAT.includes(s)) kokoTila = s; } catch (e) {}
// muuttaako tila moottorin tasoa (kaariS / kaariG / poistu); pikseli voi muuttaa 100 %:ssakin (pohja 1.5: taso 3 = 4.5 fyys. px -> 5)
const muuntaa = () => kokoTila === 'pikseli' || (kokoTila !== 'vanha' && kerroin !== 1);
// pelitaso 1 pysyy moottorissa 1:nä (huonekamera seuraa hahmoa VAIN skaalalla tasan 1, RoomEngine.updateRoomCamera), ja muu taso ei saa osua tasan 1:een
//   (esim. 200 %: 2 * 0.5) ettei kamera käynnisty pelitasolla 2
// 0.12.2 (kp 6.11. 21:55 "125 % selainzoomilla zoom hyppii ja nykii"): taso-tilassa kerrointa EI käytetä kun portaat (PIENI.paalla) ovat päällä. Kutistusportaat (alle 1, 1 ... 4 ei-kokonaisluvut,
//   E * G = pelitaso) eivät koskaan käyttäneet sitä, joten kokonaislukuportaat (2, 4) jotka käyttivät (k 0.8: taso 2 -> moottori 2, taso 4 -> moottori 3, ja peliTaso(2) luki 3)
//   rikkoivat portaikon: näkyvä koko ei ollut monotoninen eikä suhde 2^(1/6) (mitattu: tmp/zoom-kuplat/selain/loki.md). Nyt näkyvä koko = pelitaso / k joka portaalla.
const kPorras = (k, t) => (t === 'taso' && PIENI.paalla) ? 1 : k;
const moottoriTaso = (G, k = kerroin, t = kokoTila) => {
    if (G === 1) return 1;
    k = kPorras(k, t);
    let e;
    if (t === 'pikseli') {   // d = dpr jolle kerroin laskettiin (k = dprPohja / dpr)
        const d = (dprPohja || VW.devicePixelRatio || 1) / k, p = G * k * d;
        e = p >= 1 ? Math.max(1, Math.round(p)) / d : 1 / (Math.max(1, Math.round(1 / p)) * d);
    } else if (t === 'taso') {   // ei koskaan tasan 1 (se on pelitason 1 moottoritaso): yli 1 vähintään 2, alle 1 enintään 0.5
        const p = G * k; return G > 1 ? Math.max(2, Math.round(p)) : Math.min(0.5, Math.pow(2, Math.round(Math.log2(p)))); }
    else if (t === 'vanha' || k === 1) return G;
    else e = G * k;
    e = pyor(e); return e === 1 ? 1.000001 : e;
};
// käänteinen: pelitaso jonka moottoriTaso on E (lähin E / k:ta, jos usea pelitaso osuu samaan moottoritasoon: taso-tila suurella selainzoomilla); muuten E / k
const peliTaso = (E, k = kerroin, t = kokoTila) => {
    if (E === 1) return 1;
    k = kPorras(k, t);
    const g0 = E / k; if (t === 'vanha' || (t === 'tarkka' && k === 1)) return E;
    if (t !== 'tarkka' && g0 > 0) {
        const ehd = [], f = Math.floor(g0), l = Math.floor(Math.log2(g0));
        for (let i = f - 1; i <= f + 2; i++) if (i >= 2) ehd.push(i);
        for (let i = l - 1; i <= l + 2; i++) if (i <= -1) ehd.push(Math.pow(2, i));
        let paras = null; for (const g of ehd) if (Math.abs(moottoriTaso(g, k, t) - E) < 1e-5 && (paras === null || Math.abs(Math.log(g / g0)) < Math.abs(Math.log(paras / g0)))) paras = g;
        if (paras !== null) return paras;
    }
    return Math.round(g0 * 1000) / 1000;
};
const RE = () => VW.NitroDevTools && VW.NitroDevTools.roomEngine;
const tila = VW.__huoneCtrlZoom = { versio: 'huone-0.14.0', natiivi: false, loki: [], poistu() {}, aseta: null, tilaNyt: null };
// B201 (kp 6.11. 16:42 "huone välil hypähtää vasemmalle paljon ... kun zoomaan ulospäin ... pelin zoomilla", 16:47 "ei silti toistu consistently"):
//   huonekamera (RoomEngine.updateRoomCamera, ajaa VAIN skaalalla tasan 1) kirjoittaa offsetiksi -(kameran oma sijainti) aina kun hahmo liikkuu tai canvaksen
//   koko muuttuu. Moottori päivittää kameran sijainnin raahauksen jälkeen (handleRoomDragging MOUSE_UP: camera.resetLocation(-offset)), mutta EI zoomin
//   jälkeen. Zoom ulos tasolle 1 jättää kameraan vanhan sijainnin (esim. tasolla 2 raahattu: -offset tason 2 pikseleinä), ja seuraava hahmon askel napsauttaa
//   huoneen sinne. Korjaus: kameraSynk tekee saman kuin moottorin raahauksen loppu jokaisen tasolle 1 päättyvän zoomin jälkeen.
// B211 (kp 6.11. 23:13 "mul se oikeestaa vasta snäppää ku zoom sanoo 0.89"; robolla toistettu 6.11., tmp/dpr-snap/loki.md): moottorin kamera (RoomEngine.updateRoomCamera) laskee
//   uudelleen vain kun canvaksen koko, geometria, kohteen paikka tai isMoving muuttuu. Paluu tasolle 1 (E=2 -> 1 tai kutistus -> 1) palauttaa canvaksen TÄSMÄLLEEN siihen kokoon jonka kamera
//   kirjasi viimeksi (screenWd/Ht päivittyy vain kun scale === 1), joten mikään ehto ei täyty eikä hahmoa keskitetä; 0.89:ssä canvas on 1408x1475 != 1254x1313 ja kamera keskittää.
//   Korjaus: keskita = true nollaa kameran muistaman koon (setterit RoomCamera.ts:114,124), jolloin seuraava updateRoomCameras lukee koon "muuttuneeksi" ja keskittää kuten 0.89:ssä.
//   Hyppyvahdin oma korjaus (keskita = false) ei saa keskittää.
const kameraSynk = (re, rid, c, keskita = true) => {
    try {
        if (!re || !c || c.scale !== 1) return false;
        const d = re._roomInstanceDatas && typeof re._roomInstanceDatas.get === 'function' ? re._roomInstanceDatas.get(rid) : null, k = d && d.roomCamera;
        if (!k || typeof k.resetLocation !== 'function') return false;
        const x = -c.screenOffsetX, y = -c.screenOffsetY, l = k.location;
        if (keskita) { try { k.screenWd = 0; k.screenHt = 0; } catch (e) {} }
        if (l && l.x === x && l.y === y) return false;
        if (!k.isMoving) { k.centeredLocX = false; k.centeredLocY = false; }   // kuten moottorin raahauksen loppu
        k.resetLocation({ x, y, z: 0 }); vahti.synkkeja++;
        return true;
    } catch (e) { return false; }
};
// vahdin aikaleimat (performance.now): lokirivin konteksti, ks. lohko "Hyppyvahti"
const vahti = { fokus: null, blur: null, nakyvyys: null, resize: null, init: null, rulla: null, rullaN: 0, zoom: null, synkkeja: 0, korjauksia: 0 };
let vartija = () => {}, selainAuki = () => false, vaihdaTila = () => 'zoomtila: selainzoom-lohko ei asentunut';   // asetetaan lohkoissa "Hyppyvahti" ja "Selainzoom erillään"
let paivitaNappi = () => {};
// alle 1 kutistus (0.10.0, lohko "PIENI"): tila tässä, koska kuplien näkymä ja selainzoom-lohko lukevat sitä ennen lohkon ajoa
const PIENI = { paalla: true, G: null, E: 1, alku: null, res: null, rid: null, tausta: null, backing: null, snap: null };
tila.pieni = PIENI;
let kuplaSeuraa = () => {}, kuplaNakyma = () => null;   // asetetaan lohkossa "Kuplat seuraavat"   // lohko "Tilanappi"
const loki = s => { tila.loki.push(new Date().toTimeString().slice(0, 8) + ' ' + s); if (tila.loki.length > 50) tila.loki.shift(); };
let viime = 0, paalla = true, varaTimer = 0;
try { paalla = localStorage.getItem('kupla.ctrlZoom') !== 'off'; } catch (e) {}
const aseta = v => { paalla = v; try { localStorage.setItem('kupla.ctrlZoom', v ? 'on' : 'off'); } catch (e) {}
    return 'ctrl+rulla: ' + (paalla ? 'pelin zoom' : 'selaimen zoom'); };
const komento = (t, sanat) => { const s = (sanat[0] || '').toLowerCase();
    return aseta(/^(on|päälle|paalle|1)$/.test(s) ? true : /^(pois|off|0)$/.test(s) ? false : !paalla); };
tila.aseta = aseta; tila.tilaNyt = () => ({ paalla });

// ---- DPR-SNAP (0.14.0) ----
// MIKSI: kun dpr ei ole kokonaisluku (Windows 125 / 150 / 175 %, selain 110 % jne.) yksi taide-pikseli on laitepikseleinä murtoluku ja Chrome näytteistää sen 1 tai 2 px leveäksi vuoronperään: rakeinen.
//   MITATTU robolla (dpr 1.5 = Windows 150 %), tmp/dpr-snap/loki.md, juoksuanalyysi (osuus juoksuista jotka ovat n:n monikertoja, n = odotettu laite-px per taide-px):
//   taso 1 (1.5 px/taide-px) 0.42 = epätasainen; taso 2 (3 px) 0.98 = terävä; taso 4/3 (2 px) nykyisellä kutistuspolulla 0.30 (sumea), moottorin murtotaso 4/3 0.37 (moottori pyöristää).
// MITEN: pelitasot ovat n / dpr (n = 1, 2, 3 ...), jolloin pelitaso * dpr = n laite-px per taide-px. Piirto: moottori AINA tasolla 1, rendereri W/G x H/G CSS-px resoluutiolla res = n
//   (= G * dpr, kokonaisluku, joten spritejen paikat ovat kokonaislukuja laite-px:inä), canvas CSS scale(G = n / dpr) ja image-rendering: pixelated. Puskuri on silloin tasan laitepikselin kokoinen
//   (ei välikuvaa kuten kutistuspolulla E * dpr, 2.25 kertaa laite-px tasolla 4/3) ja kuva kulkee Chromen läpi 1:1. pixelated on PAKOLLINEN: ilman sitä sama kuva mitattiin 0.24 (Chromen
//   kompositointi on bilineaarinen skaalan 1.33333 pyöristyksen takia). Mitattu kaikilla n = 2 ... 12 (0.99 ... 0.95).
//   Rullaportaat: alle n = 1 (taide-px < 1 laite-px, tarkkaa kuvaa ei ole) jatketaan 2^(1/6) -portailla 1 / dpr:stä alas ALIN:iin (vanha pehmeä kutistus); n / dpr ylös 8:aan. Taso 1 EI ole
//   portaalla: se on rakeinen (n = dpr). Huoneeseen tulo ja client-napit "1" laskeutuvat lähimpään porrastasoon (log-etäisyys): dpr 1.5 -> 4/3 (n = 2), dpr 1.25 -> 0.8 (n = 1).
//   Kamera: moottori on tasolla 1 kaikilla porrastasoilla, joten kamera seuraa hahmoa myös zoomattuna (ennen vain tasolla 1 ja kutistuksessa; E >= 2 ei seurannut).
// KYTKIN: 'auto' (oletus) = snap kun dpr ei ole kokonaisluku; 'off' = kuten 0.13.0. Konsoli: __huoneCtrlZoom.snap('pois') / snap('auto') / snap() = tila. Muistetaan localStorage 'kupla.ctrlZoomSnap'.
// RAJA: (1) kokonaisluku-dpr:llä rullaportaat (2^(1/6)) ovat edelleen rakeiset välitasoilla (kp pitää portaat). (2) alle 1 / dpr tasot ovat pehmeä kutistus. (3) porrasvälit ovat suuria
//   alhaalla (n 1 -> 2 on 2-kertainen), tasaisia vasta n >= 8. (4) kuvaa ei ole tarkistettu muulla kuin robon dpr 1.5:lla (+ emuloidut arvot ks. loki).
const SNAP_OLETUS = 'off', YLA = 8;
let snapTila = SNAP_OLETUS;
try { const s = localStorage.getItem('kupla.ctrlZoomSnap'); if (s === 'auto' || s === 'off') snapTila = s; } catch (e) {}
const DPR = () => VW.devicePixelRatio || 1;
const fraktio = d => Math.abs(d - Math.round(d)) > 1e-3;
const snapPaalla = () => PIENI.paalla && snapTila === 'auto' && fraktio(DPR());
const snapTasot = d => { const a = [], m1 = 1 / d; for (let j = 1; m1 * Math.pow(2, -j / 6) >= ALIN - 1e-9; j++) a.unshift(m1 * Math.pow(2, -j / 6)); for (let n = 1; n / d <= YLA + 1e-9; n++) a.push(n / d); return a; };
let snapD = null, snapL = [];
const snapLadder = () => { const d = DPR(); if (d !== snapD) { snapD = d; snapL = snapTasot(d); } return snapL; };
const lahin = (L, G) => { let p = L[0]; for (const v of L) if (Math.abs(Math.log(v / G)) < Math.abs(Math.log(p / G))) p = v; return p; };
const lahinSnap = G => lahin(snapLadder(), G);
// porrastaso M -> piirto (ks. yllä); false jos M ei ole n / dpr (alle n = 1: vanha kutistus)
const snapAseta = (re, rid, M) => {
    const d = DPR(), n = Math.round(M * d);
    if (!(n >= 1) || Math.abs(M * d - n) > 1e-4 || M > YLA + 1e-6) return false;
    pudota('snap');
    return pieniAseta(re, rid, n / d, null, 1, { n });
};
// taso G samaa polkua kuin rullatikin loppu (kasittele); true jos asetettiin
const tasoAseta = (re, rid, G) => {
    if (snapPaalla() && snapAseta(re, rid, lahinSnap(G))) return true;
    if (PIENI.paalla && G < 1 - 1e-6) { pudota('pieni'); return pieniAseta(re, rid, G); }
    if (onVali(G)) { pudota('pieni'); const E = Math.ceil(G - 1e-6); return pieniAseta(re, rid, G / E, null, E); }
    if (PIENI.G) { pieniPois(re, rid, moottoriTaso(G)); return true; }
    zoomaaNyt(re, rid, moottoriTaso(G)); return true;
};
tila.asetaTaso = G => { const re = RE(), rid = re && re.activeRoomId; if (!re || rid == null || rid === -1) return false; return tasoAseta(re, rid, G); };
tila.snapTasot = () => snapLadder().slice();
const snapKomento = v => {
    const s = String(v === undefined ? '' : v).toLowerCase();
    if (/^(pois|off|0)$/.test(s)) snapTila = 'off'; else if (/^(auto|on|paalle|päälle|1)$/.test(s)) snapTila = 'auto';
    else return 'zoom-snap: ' + snapTila + ', dpr ' + DPR() + (snapPaalla() ? ' -> snap PÄÄLLÄ' : ' -> ei snappia') + '. Käyttö: __huoneCtrlZoom.snap("auto" | "pois")';
    try { localStorage.setItem('kupla.ctrlZoomSnap', snapTila); } catch (e) {}
    snapCv = null;
    try { const re = RE(), rid = re && re.activeRoomId; if (re && rid != null && rid !== -1) { const G = re.getRoomInstanceRenderingCanvasScale(rid, 1) || 1; tasoAseta(re, rid, snapPaalla() ? G : lahin(TASOT, G)); } } catch (e) { loki('snap-vaihto virhe: ' + e.message); }
    loki('snap ' + snapTila); return 'zoom-snap: ' + snapTila + (snapPaalla() ? ' (dpr ' + DPR() + ': porrastasot n / dpr)' : ' (ei käytössä: dpr ' + DPR() + ')');
};
tila.snap = snapKomento;
// huoneeseen tulo / uusi canvas / dpr:n muutos: laskeudu lähimpään porrastasoon kerran per canvas (ei taistele käyttäjää vastaan: sen jälkeen vain rulla ja client-napit)
let snapCv = null, snapDprViim = null;
const snapVahti = setInterval(() => { try {
    const re = RE(); if (!re) return; const rid = re.activeRoomId; if (rid == null || rid === -1) return;
    const c = re.getRoomInstanceRenderingCanvas(rid, 1); if (!c) return; const d = DPR();
    if (!snapPaalla()) { snapCv = null; snapDprViim = d; return; }
    if (snapCv === c && snapDprViim === d) return;
    snapCv = c; snapDprViim = d;
    if (PIENI.snap && PIENI.rid === rid && pC === c) return;   // jo porrastasolla (dpr:n muutoksen hoitaa PIENI:n resize-käsittelijä)
    const G = re.getRoomInstanceRenderingCanvasScale(rid, 1) || 1;
    if (tasoAseta(re, rid, G)) loki('snap: huoneeseen tulo / dpr ' + d + ' -> taso ' + +(re.getRoomInstanceRenderingCanvasScale(rid, 1) || 0).toFixed(3));
} catch (e) { loki('snap-vahti virhe: ' + e.message); } }, 400);

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
    // 0.12.1 (kp 6.11. 21:53 "laskee jokaisen scrollin eikä et hyväksyy vaa tietyl nopeudel niit"): ei aikarajaa (oli 120 ms). Jokainen
    //   hiiren lovi (|deltaY| >= 50) on askel; kosketuslevyn pienet deltat kertyvät samaan suuntaan kunnes summa >= 50.
    const d = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaMode === 2 ? e.deltaY * 800 : e.deltaY;
    viime = (Math.sign(viime) === Math.sign(d) ? viime : 0) + d;
    if (Math.abs(viime) < 50) return;
    viime = 0;
    // animaation aikana askel lasketaan tavoitteesta, ei moottorin skaalasta (nopeat askeleet kertyvät yhdeksi moottorikutsuksi)
    //   Askeleet PELITASOINA (tason luku palauttaa pelitason, ks. reKaariG); moottorille pelitaso * kerroin.
    const tama = PIENI.G ? PIENI.E * PIENI.G : anim ? peliTaso(anim.v1) : (re.getRoomInstanceRenderingCanvasScale(rid, 1) || 1);
    // ei ylärajaa (kp 5.11. 01:10); 1:stä ylöspäin vain kokonaisluvut (kp 6.11. 13:44 "scroll zoom pitää poistaa murtoluvut, ei toimi":
    //   sipuli mittasi 1->1.5 ja 2->2.5 ei tee mitään). Alle 1: kutistus (lohko "PIENI") ottaa minkä tahansa kertoimen, joten askel on taulukko TASOT
    //   (0.10.1 kp 6.11. 20:32 "1 jälkeen tulee kyl mega jump"); ilman kutistusta (rendereriä ei löydy) moottori puolittaa kuten 0.9.4.
    const ylos = e.deltaY < 0;
    const puolita = x => ylos ? Math.min(1, x * 2) : Math.max(ALIN, x / 2);
    const seurVanha = x => ylos ? (x >= 1 ? Math.floor(x) + ASKEL : puolita(x)) : (x > 1 ? Math.ceil(x) - ASKEL : puolita(x));   // kuten 0.9.4 (ei kutistusta)
    const seur = x => PIENI.paalla ? tasoAskel(x, ylos) : seurVanha(x);
    // 0.9.4 taso-tila: kaksi pelitasoa voi osua samaan moottoritasoon (125 %: 2 ja 3 -> 2), silloin askel jatkuu seuraavaan joka näkyy
    let uusi = seur(tama), nytE = null;
    try { nytE = PIENI.G ? null : anim ? anim.v1 : re.getRoomInstanceRenderingCanvas(rid, 1).scale; } catch (x) {}   // PIENI: moottori on 1 kaikilla alle-1 tasoilla, ei ohitusta
    for (let i = 0; i < 4 && nytE != null && !onVali(uusi) && (uusi >= 1 || !PIENI.paalla) && sama(moottoriTaso(uusi), nytE); i++) { const s = seur(uusi); if (s === uusi) break; uusi = s; }
    if (uusi === tama) return;
    if (snapPaalla() && snapAseta(re, rid, uusi)) return;   // 0.14.0: porrastaso n / dpr
    // alle 1: moottori pysyy 1:ssä ja kuva kutistetaan (lohko "PIENI"); rendereriä ei löydy -> moottorin taso kuten 0.9.4
    if (PIENI.paalla && uusi < 1) { pudota('pieni'); if (pieniAseta(re, rid, uusi)) return; uusi = puolita(tama); if (uusi === tama) return; }   // vara: moottorin puolikkaat
    // uusi > 1, ei kokonaisluku: moottori E = ceil(uusi) + kutistus G = uusi / E; rendereriä ei löydy -> lähin kokonaisluku askeleen suuntaan
    if (onVali(uusi)) { pudota('pieni'); const E = Math.ceil(uusi - 1e-6); if (pieniAseta(re, rid, uusi / E, null, E)) return; uusi = ylos ? E : E - 1; }
    // kutistuksesta pois: moottori suoraan uuden tason moottoritasolle (1 tai 2), välitön
    if (PIENI.G) { pieniPois(re, rid, moottoriTaso(uusi)); return; }
    const uusiE = moottoriTaso(uusi);
    vartija(re, rid, uusi);
    if (LIUKU && pehmea(re, rid, uusiE, e.target, uusi)) return;
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
    // ruudun koordinaateissa: alle 1 -tilassa (lohko "PIENI") canvas on kutistettu CSS:llä kertoimella G
    const nakyma = (re, rid) => { const c = re.getRoomInstanceRenderingCanvas(rid, 1); if (!(c && c.scale > 0)) return null;
        const g = (PIENI.G && rid === PIENI.rid) ? PIENI.G : 1; return { s: c.scale * g, w: c.width * g, ox: c.screenOffsetX * g }; };
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
    kuplaNakyma = (re, rid) => { try { return nakyma(re, rid); } catch (e) { return null; } };
    kuplaSeuraa = (rid, a, b) => { if (natiiviSeuraa()) return; try { seuraa(rid, a, b); } catch (e) { k.virheita++; loki('pieni-kuplaseuranta virhe: ' + e.message); } };
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
            if (muuntaa() && cid === 1 && rid === this.activeRoomId && !isFlipForced && !arguments[6]) {
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
            return (muuntaa() && oma && v > 0) ? peliTaso(v) : v; } : null;
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
        const dpr = VW.devicePixelRatio || 1, kUusi = kokoTila === 'vanha' ? 1 : dprPohja / dpr;   // vanha: selainzoom skaalaa huoneen; ei pyöristystä: moottoriTaso pyöristää tuloksen (2 * 1.5 / 2.25 = 1.333333, ei 1.333334)
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
        // alle 1 (lohko "PIENI"): purske ei aja, vaan näkyvän keskipisteen huonepiste muistetaan ENNEN clientin ankkurointia (client pitää canvaksen
        //   vasemman yläkulman paikallaan, joten kutistetussa canvaksessa keskipiste karkaisi) ja PIENI asettaa uudelleen sillä. Kerroin päivittyy pieni-tilasta poistuttaessa (oma koonmuutos avaa purskeen).
        if (PIENI.G) { const c = kanvas(); if (!PIENI.omaKoko && !PIENI.P && kunnossa(c)) PIENI.P = keskiPiste(c); return; }
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
    //   0.9.4: vanha ei muuta mitään; pikseli 100 %:ssa (kerroin 1) asettaa tason suoraan (pohja 1.5: taso 3 -> 3.333333 = 5 fyys. px)
    if (kokoTila !== 'vanha' && Math.abs(dprPohja / (VW.devicePixelRatio || 1) - 1) > 1e-6) { alku(); tarkista('asennus'); }
    else if (muuntaa()) { const re = RE(), c = kanvas(); if (re && kunnossa(c) && c.scale !== 1) { const E = moottoriTaso(peliTaso(c.scale)); if (!sama(E, c.scale)) zoomaaNyt(re, re.activeRoomId, E); } }
    // TILAN VAIHTO ajossa: pelitaso luetaan vanhalla tilalla, sitten sama pelitaso uudella (keskipiste pysyy, ks. zoomaaNyt)
    vaihdaTila = (t, syy) => {
        t = String(t || '').toLowerCase();
        if (!TILAT.includes(t)) return 'zoomtila nyt: ' + kokoTila + ' (vaihtoehdot: ' + TILAT.join(', ') + ')';
        const re = RE(), c = kanvas();
        let G = null;
        if (anim) { G = anim.G1; pudota('tila'); } else if (kunnossa(c)) G = peliTaso(c.scale);
        lopetaP();
        kokoTila = t; try { localStorage.setItem('kupla.ctrlZoomTila', t); } catch (e) {}
        kerroin = t === 'vanha' ? 1 : dprPohja / (VW.devicePixelRatio || 1);
        if (re && kunnossa(c) && G != null && !(G === 1 && c.scale === 1)) { const E = moottoriTaso(G); if (!sama(E, c.scale)) zoomaaNyt(re, re.activeRoomId, E); }
        loki('tila ' + t + (syy ? ' (' + syy + ')' : '') + ': pelitaso ' + G + ' -> moottori ' + (c ? c.scale : null));
        paivitaNappi();
        return 'zoomtila: ' + t + ' (pelitaso ' + G + ', moottori ' + (c ? c.scale : '-') + ', fyys. ' + (c ? +(c.scale * (VW.devicePixelRatio || 1)).toFixed(3) : '-') + ' px)';
    };
    selainPoistu = () => {
        window.removeEventListener('resize', alku, true); if (vv) vv.removeEventListener('resize', alku, true);
        if (kaariI && reI.initializeRoomInstanceRenderingCanvas === kaariI) { if (omatI) reI.initializeRoomInstanceRenderingCanvas = alkuI; else delete reI.initializeRoomInstanceRenderingCanvas; }
        lopetaP();
        if (muuntaa()) { const re = RE(), c = kanvas(); const G = kunnossa(c) ? peliTaso(c.scale) : null; kerroin = 1;   // takaisin pelitasolle ilman kerrointa
            if (re && G != null && G !== c.scale) zoomaaNyt(re, re.activeRoomId, G); }
    };
}
// ---- Tilanappi (0.9.4, kp 17:42 "pieni kytkin ruudulle jos helppo"): pois oletuksena, koska huoneskripti ajaa jokaisen kävijän clientissä.
//   __huoneCtrlZoom.nappi(true) näyttää (muistetaan localStorage 'kupla.ctrlZoomNappi'), klikkaus kiertää tilat. Klikki ei mene canvakselle (oma elementti).
let nappiPoistu = () => {};
{
    let el = null;
    const nayta = () => {
        if (el) return; el = document.createElement('button'); el.type = 'button'; el.title = 'ctrl+rulla zoomin kokotila (klikkaa vaihtaaksesi)';
        el.style.cssText = 'position:fixed;right:8px;bottom:72px;z-index:2147483645;padding:2px 6px;font:11px/1.3 monospace;color:#fff;background:rgba(20,20,20,.75);border:1px solid #666;border-radius:4px;cursor:pointer';
        const pysayta = e => e.stopPropagation();
        for (const n of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'wheel']) el.addEventListener(n, pysayta);
        el.addEventListener('click', e => { e.stopPropagation(); const i = TILAT.indexOf(kokoTila); vaihdaTila(TILAT[(i + 1) % TILAT.length], 'nappi'); });
        document.body.appendChild(el); paivitaNappi();
    };
    const piilota = () => { if (el) { el.remove(); el = null; } };
    paivitaNappi = () => { if (el) el.textContent = 'zoom: ' + kokoTila; };
    tila.nappi = v => { const p = v === undefined ? !el : !!v; try { localStorage.setItem('kupla.ctrlZoomNappi', p ? '1' : '0'); } catch (e) {} if (p) nayta(); else piilota(); return 'tilanappi ' + (p ? 'näkyvissä' : 'piilossa'); };
    try { if (localStorage.getItem('kupla.ctrlZoomNappi') === '1') nayta(); } catch (e) {}
    nappiPoistu = piilota;
}
tila.tila = t => vaihdaTila(t, 'konsoli'); tila.tilat = TILAT.slice();
Object.defineProperty(tila, 'kokoTila', { get: () => kokoTila, enumerable: true });

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
            // alle 1 -tila (lohko "PIENI"): canvaksen transform ja backing ovat sen omia, ei RAE-tarkistusta
            else if (!anim && viimeCv && n.t - viimeCv.t > 500 && !PIENI.G) { const v = viimeCv; viimeCv = null; const dpr = VW.devicePixelRatio || 1;
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
        kameraSynk(re, o.rid, c, false); vahti.korjauksia++;
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

// ---- PIENI: alle 1 kutistus + pehmennys (0.10.0; kp 6.11. 18:30 "entä jos alle 1 ei käytä room enginee rendaa niit, vaa rendaa 1 tasol ja skaalaa
//   vaa pienemmäks kuvana", 20:00 "no tehdään kutistus + pehmennys") ----
// MIKSI: moottori piirtää alle 1:n tasot lähin naapuri -näytteistyksellä (GetRenderer.ts bindSource pakottaa scaleMode 'nearest'), joten 0.5 pudottaa joka toisen
//   pikselin: "suttuinen" (Salvador, Laatikko, kp 6.11.). Natiivisti moottori pakottaa kaiken alle 1:n 0.5:ksi (setRoomInstanceRenderingCanvasScale:
//   level < 1 ? 0.5), eikä kamera seuraa hahmoa skaalalla != 1 (RoomEngine.ts:1309 updateRoomCamera).
// MITEN: pelitaso G < 1 -> moottori pysyy tasolla 1 (kamera toimii), rendereri ja huonecanvas W/G x H/G CSS-px:iin ja canvas-elementti kutistetaan CSS:llä
//   scale(G) (origo 0 0, image-rendering auto = selaimen pehmennys). Resoluutio min(dpr, GPU:n sivuraja, piirtopuskuri): selain leikkaa WebGL-puskurin
//   pinta-alaa hiljaa (mitattu 6.11.: backing 7440x7884 -> drawingBuffer 5595x5929, kuva näkyi vain kaistaleena), joten puskuri luetaan koon jälkeen
//   ja resoluutiota pienennetään samassa suhteessa.
//   Hiiri: dispatchMouseEvent x,y / G. Ruutupaikat (kuplat, valikot, nimet): getRoomObjectScreenLocation / BoundingRectangle * G, vain aktiivinen huone,
//   canvas 1 eikä kategoria 0 (moottori laskee kameran rajat sillä, RoomEngine.ts:1324; ilman rajausta kamera siirsi huoneen pois keskeltä, mitattu 6.11. 19:03).
//   Tason LUKU = G; clientin suurennuslasi / :zoom alle 1 -> sama polku (lähin 2:n potenssi 1/8 ... 1/2; moottori antaisi aina 0.5).
//   Taustaväri (useRoom.ts: NitroSprite(WHITE) canvas.masterin lapsi 0, koko = rendereri) venytetään samaan kokoon ja palautetaan.
//   Kuplat: näkymän vaihto (päälle / pois / G / selainzoom) siirtää näkyvät kuplat puhujan kohdalle (lohko "Kuplat seuraavat"; nakyma laskee G:n mukaan).
//   Selainzoom kesken: clientin resize (useRoom.ts) palauttaa normaalin koon -> rAF:ssa, kaikkien resize-käsittelijöiden jälkeen, asetetaan uudelleen uudella
//   dpr:llä; lohko "Selainzoom erillään" ei aja purskettaan tässä tilassa, vain kerroin päivittyy tasoja >= 1 varten.
//   Huone vaihtuu / canvas luodaan uudelleen: vahti (400 ms) palauttaa CSS:n ja rendererin koon, client asettaa uuden huoneen itse.
//   VARA: jos rendereriä ei löydy (React-puu muuttunut), alle 1 menee moottorin kautta kuten 0.9.4.
// RAJA: (1) ei liukua 1:n ja alle 1:n välillä (vaihto on välitön). (2) alle 1 ei käytä selainzoomin kerrointa: huone skaalautuu selaimen mukana kuten tasolla 1.
//   (3) tasoilla 0.25 ja 0.125 puskuri on selaimen pinta-alarajassa (~32 Mpx, ~130 MB GPU-muistia) ja resoluutio < dpr.
// VALI (0.11, yleistetty 0.12.0): taso > 1 ei kokonaisluku. Moottori E = ceil(taso) (2, 3 tai 4; kokonaisluku, terävä), canvas/rendereri W/G x H/G CSS-px, CSS scale(G),
//   G = taso / E. PIENI.G on aina KUTISTUS (hiiri, ruutupaikat, kuplanäkymä käyttävät sitä sellaisenaan), PELITASO = PIENI.E * PIENI.G (tason luku, askeleet).
//   E = 1 alle 1 -tasoilla (kuten 0.10.0). Moottori ei seuraa hahmoa tasolla > 1 (RoomEngine.ts:1256), joten kamera ei seuraa, kuten ei nytkään tasolla 2.
//   Puskuri W/G x H/G x res = (E / taso)^2 kertaa tason 1 pinta-ala: 3.19x (1.12), 2.27x (1.26), 1.79x (2.24), 1.59x (3.17), 1.26x (3.56), alle jo tuetun G = 0.5:n (4x).
let pR = null, pC = null, pCv = null, pVahti = 0, pRaf = 0, pJalki = 0;
// KAMERAN JÄLKI (mitattu robolla 6.11. 20:19: 1 -> 0.5 kaikki 8 kuplaa 17 px sivussa): moottorin tasolla 1 kamera keskittää huoneen heti kun se mahtuu
//   suurennettuun canvakseen (offset -112 -> -80 = 32 huone-px = 16 ruutu-px), JÄLKEEN kuplaseurannan. Odotetaan kunnes offset on pysynyt 3 kehystä ja kamera
//   ei liiku (enintään 1.5 s), sitten kuplat puhujan kohdalle uudessa näkymässä. Raahaus kesken -> ei mitään (clientin oma ROOM_DRAG hoitaa).
const kameraJalki = (re, rid, a) => {
    cancelAnimationFrame(pJalki); const t0 = performance.now(); let ed = null, vakaa = 0;
    const f = () => { pJalki = 0; if (!re || re.activeRoomId !== rid || re._activeRoomIsDragged) return; const c = re.getRoomInstanceRenderingCanvas(rid, 1); if (!c) return;
        const d = re._roomInstanceDatas && typeof re._roomInstanceDatas.get === 'function' ? re._roomInstanceDatas.get(rid) : null, cam = d && d.roomCamera;
        const n = c.screenOffsetX + ',' + c.screenOffsetY + ',' + c._width; vakaa = (n === ed && !(cam && cam.isMoving)) ? vakaa + 1 : 0; ed = n;
        if (vakaa >= 3 || performance.now() - t0 > 1500) { kuplaSeuraa(rid, a, kuplaNakyma(re, rid)); return; }
        pJalki = requestAnimationFrame(f); };
    pJalki = requestAnimationFrame(f);
};
const aktiivinen = re => !!(PIENI.G && re && re.activeRoomId === PIENI.rid);
let pieniR = null;
const etsiRenderer = () => {
    if (pieniR && !pieniR.destroyed && pieniR.canvas && pieniR.canvas.isConnected) return pieniR;
    const isR = v => v && typeof v === 'object' && typeof v.resize === 'function' && v.renderPipes && ('backBuffer' in v);
    const roots = [...document.querySelectorAll('body, body *')].slice(0, 400).filter(e => Object.keys(e).some(k => k.startsWith('__reactContainer$')));
    let found = null, n = 0; const seen = new Set();
    const look = v => { if (found || !v || typeof v !== 'object') return; if (isR(v)) { found = v; return; } try { for (const k of Object.keys(v)) { if (isR(v[k])) { found = v[k]; return; } } } catch (e) {} };
    for (const r of roots) { const key = Object.keys(r).find(k => k.startsWith('__reactContainer$')); const stack = [r[key]];
        while (stack.length && !found && n < 300000) { const f = stack.pop(); n++; if (!f || seen.has(f)) continue; seen.add(f);
            look(f.memoizedProps); look(f.stateNode);
            let st = f.memoizedState, d = 0; while (st && d < 60 && !found) { look(st.memoizedState); if (st.memoizedState && st.memoizedState.current) look(st.memoizedState.current); st = st.next; d++; }
            if (f.child) stack.push(f.child); if (f.sibling) stack.push(f.sibling); } }
    pieniR = found; return found;
};
const gpuRaja = R => { try { const gl = R.gl; return Math.min(gl.getParameter(gl.MAX_RENDERBUFFER_SIZE), gl.getParameter(gl.MAX_TEXTURE_SIZE)); } catch (e) { return 8192; } };
const keskiPiste = c => ({ x: (c._width / 2 - c.screenOffsetX) / c.scale - Math.trunc(c._width / 2), y: (c._height / 2 - c.screenOffsetY) / c.scale - Math.trunc(c._height / 2) });
// 0.10.1: keskipiste liukulukuna omien askelten yli (11 askelta 1 -> 0.125: offsetin Math.trunc kertyi 5 huone-px:n ajelehdinnaksi testissä P5).
//   Muistettu piste kelpaa vain jos offset ja koko ovat yhä ne jotka itse asetimme; kamera, raahaus tai client -> lasketaan uudelleen.
let pMuisti = null;
const pieniKeski = (rid, c) => (pMuisti && pMuisti.rid === rid && pMuisti.c === c && pMuisti.ox === c.screenOffsetX && pMuisti.oy === c.screenOffsetY && pMuisti.w === c._width) ? pMuisti.P : keskiPiste(c);
const pieniMuista = (rid, c, P) => { pMuisti = c ? { rid, c, P, ox: c.screenOffsetX, oy: c.screenOffsetY, w: c._width } : null; };
// huoneen taustaväri: clientin NitroSprite(NitroTexture.WHITE) canvas.masterin ensimmäisenä lapsena (useRoom.ts)
const taustaSprite = c => { try { const m = c && c.master, b = m && m.children && m.children[0], t = b && b.texture, T = t && t.constructor;
    return (T && t === T.WHITE) ? b : null; } catch (e) { return null; } };
const asetaKoko = (re, rid, R, W2, H2, res, P, E = 1) => {   // rendereri + huonecanvas + tausta uuteen kokoon, huonepiste P keskelle (taso 1)
    let w = W2, h = H2;
    PIENI.omaKoko = true;   // oma koonmuutos ei ole selainzoomia (lohko "Selainzoom erillään" alku)
    try { R.resize(W2, H2, res); const s = R.view && R.view.screen; if (s && s.width) { w = s.width; h = s.height; }
        re.initializeRoomInstanceRenderingCanvas(rid, 1, w, h); } finally { PIENI.omaKoko = false; }
    re.setRoomInstanceRenderingCanvasOffset(rid, 1, { x: Math.trunc(w / 2 - (P.x + Math.trunc(w / 2)) * E), y: Math.trunc(h / 2 - (P.y + Math.trunc(h / 2)) * E) });
    const b = taustaSprite(re.getRoomInstanceRenderingCanvas(rid, 1)); if (b) { b.width = w; b.height = h; } PIENI.tausta = !!b;
    // 0.11.1 (kp 6.11. 21:21 "välil nopee välähdys mustana", 21:23 "occasional musta flashbang pitää korjaa"): R.resize tyhjentää WebGL-puskurin,
    //   ja jos tickerin piirto ei osu samaan kehykseen (korkea Hz / maxFPS; robolla 60 Hz 0/12 ei toistunut) tyhjä puskuri näkyy mustana. Piirretään heti.
    try { const c2 = re.getRoomInstanceRenderingCanvas(rid, 1); if (c2 && typeof c2.render === 'function') c2.render(-1, true); if (R.lastObjectRendered) R.render(R.lastObjectRendered); } catch (e) {}
    return { w, h };
};
const pieniTyhja = () => { PIENI.P = null; PIENI.G = null; PIENI.snap = null; PIENI.E = 1; PIENI.alku = null; PIENI.rid = null; pC = null; pCv = null; clearInterval(pVahti); pVahti = 0; cancelAnimationFrame(pRaf); pRaf = 0; };
// irti ilman huonetta (huone vaihtui, canvas luotiin uudelleen, poistu): CSS takaisin, rendereri normaaliin kokoon jos se on yhä suurennettu
const pieniIrti = syy => {
    const a = PIENI.alku, R = pR, cv = pCv;
    if (cv && a) { cv.style.transform = a.css[0]; cv.style.transformOrigin = a.css[1]; cv.style.imageRendering = a.css[2]; }
    try { const s = R && !R.destroyed && R.view && R.view.screen; if (a && s && s.width > a.W * 1.01) R.resize(a.W, a.H, a.res * (VW.devicePixelRatio || 1) / a.dpr); } catch (e) {}
    if (a) loki('pieni irti: ' + syy);
    pieniTyhja();
};
const pieniAseta = (re, rid, G, Pyli = null, E = 1, snap = null) => {   // snap = { n }: res = n, pixelated (lohko "DPR-SNAP")   // Pyli = keskelle jäävä huonepiste (selainzoom: muistettu ennen clientin ankkurointia)
    let c = typeof re.getRoomInstanceRenderingCanvas === 'function' ? re.getRoomInstanceRenderingCanvas(rid, 1) : null; const R = c ? etsiRenderer() : null; if (!c || !R || !R.canvas) { loki('pieni: renderer/canvas puuttuu, moottorin taso'); return false; }
    if (PIENI.alku && (PIENI.rid !== rid || pC !== c || pR !== R)) pieniIrti('uusi huone/canvas');
    const ennen = kuplaNakyma(re, rid), cv = R.canvas;
    if (PIENI.alku && !sama(c.scale, E)) { Pyli = Pyli || pieniKeski(rid, c); zoomaaNyt(re, rid, E, Pyli); c = re.getRoomInstanceRenderingCanvas(rid, 1); }   // 0.12.0: moottoritaso vaihtuu kutistustilassa (E 3 -> 4); keskipiste otetaan ENNEN
    if (!PIENI.alku) {
        if (c.scale !== E) { zoomaaNyt(re, rid, E); c = re.getRoomInstanceRenderingCanvas(rid, 1); }
        PIENI.alku = { W: c._width, H: c._height, res: R.resolution, dpr: VW.devicePixelRatio || 1, css: [cv.style.transform, cv.style.transformOrigin, cv.style.imageRendering] };
        PIENI.rid = rid; pC = c; pR = R; pCv = cv;
        clearInterval(pVahti); pVahti = setInterval(() => { const re2 = RE(); if (!PIENI.alku) return;
            if (!re2 || re2.activeRoomId !== PIENI.rid || re2.getRoomInstanceRenderingCanvas(PIENI.rid, 1) !== pC || pR.destroyed) pieniIrti('huone vaihtui'); }, 400);
    }
    const P = Pyli || pieniKeski(rid, c), W = PIENI.alku.W, H = PIENI.alku.H, W2 = Math.ceil(W / G - 1e-6), H2 = Math.ceil(H / G - 1e-6), dpr = VW.devicePixelRatio || 1;
    let res = snap ? snap.n : Math.min(dpr, Math.floor(gpuRaja(R) / Math.max(W2, H2) * 1000) / 1000);
    PIENI.G = G; PIENI.E = E; PIENI.snap = snap;
    let k = asetaKoko(re, rid, R, W2, H2, res, P, E);
    if (!snap) try { const gl = R.gl, sx = gl.drawingBufferWidth / cv.width, sy = gl.drawingBufferHeight / cv.height;
        if (sx < 0.999 || sy < 0.999) { res = Math.floor(res * Math.min(sx, sy) * 0.98 * 1000) / 1000; k = asetaKoko(re, rid, R, W2, H2, res, P, E); } } catch (e) {}
    PIENI.res = res; PIENI.backing = [cv.width, cv.height]; pieniMuista(rid, re.getRoomInstanceRenderingCanvas(rid, 1), P);
    cv.style.transformOrigin = '0 0'; cv.style.transform = 'scale(' + G + ')'; cv.style.imageRendering = snap ? 'pixelated' : 'auto';
    kameraSynk(re, rid, re.getRoomInstanceRenderingCanvas(rid, 1));
    kuplaSeuraa(rid, ennen, kuplaNakyma(re, rid)); kameraJalki(re, rid, kuplaNakyma(re, rid));
    loki('pieni ' + (E * G) + (snap ? ' [snap n=' + snap.n + ']' : '') + (E !== 1 ? ' (moottori ' + E + ', kutistus ' + G + ')' : '') + ': canvas ' + k.w + 'x' + k.h + ' res ' + res + ' backing ' + cv.width + 'x' + cv.height + (PIENI.tausta ? '' : ' (ei taustaa)'));
    return true;
};
const pieniPois = (re, rid, E2 = null) => {   // E2 = moottoritaso johon mennään (zoomataan ENNEN koon palautusta, ettei välitilaa piirretä)
    const a = PIENI.alku, R = pR; if (!a || !R) { pieniTyhja(); return; }
    const c = re.getRoomInstanceRenderingCanvas(rid, 1);
    if (!c || rid !== PIENI.rid || c !== pC) { pieniIrti('pois toisessa huoneessa'); return; }
    if (E2 !== null && !sama(c.scale, E2)) { zoomaaNyt(re, rid, E2); PIENI.E = c.scale; }
    const ennen = kuplaNakyma(re, rid), P = pieniKeski(rid, c), cv = pCv, res = a.res * (VW.devicePixelRatio || 1) / a.dpr;   // selainzoom kesken: uusi dpr
    PIENI.G = null;
    cv.style.transform = a.css[0]; cv.style.transformOrigin = a.css[1]; cv.style.imageRendering = a.css[2];
    asetaKoko(re, rid, R, a.W, a.H, res, P, PIENI.E);
    pieniTyhja(); pieniMuista(rid, re.getRoomInstanceRenderingCanvas(rid, 1), P);
    kameraSynk(re, rid, re.getRoomInstanceRenderingCanvas(rid, 1));
    kuplaSeuraa(rid, ennen, kuplaNakyma(re, rid)); kameraJalki(re, rid, kuplaNakyma(re, rid));
};
let pieniPoistu = () => {};
{
    const re = RE(), kaaret = [];
    const kaari = (nimi, f) => { if (!re || typeof re[nimi] !== 'function') return; const oma = Object.prototype.hasOwnProperty.call(re, nimi), alku = re[nimi]; const k = f(alku); re[nimi] = k; kaaret.push([nimi, oma, alku, k]); };
    kaari('dispatchMouseEvent', alku => function (cid, x, y) { if (cid === 1 && aktiivinen(this)) { const a = Array.from(arguments); a[1] = x / PIENI.G; a[2] = y / PIENI.G; return alku.apply(this, a); } return alku.apply(this, arguments); });
    const ulko = (re2, rid, cat, cid) => aktiivinen(re2) && rid === re2.activeRoomId && cat !== 0 && (cid === undefined || cid === -1 || cid === 1);
    kaari('getRoomObjectScreenLocation', alku => function (rid, oid, cat, cid) { const p = alku.apply(this, arguments); if (p && ulko(this, rid, cat, cid)) { p.x *= PIENI.G; p.y *= PIENI.G; } return p; });
    kaari('getRoomObjectBoundingRectangle', alku => function (rid, oid, cat, cid) { const r = alku.apply(this, arguments); if (r && ulko(this, rid, cat, cid)) { r.x *= PIENI.G; r.y *= PIENI.G; r.width *= PIENI.G; r.height *= PIENI.G; } return r; });
    kaari('getRoomInstanceRenderingCanvasScale', alku => function (rid, cid) { const v = alku.apply(this, arguments); return (aktiivinen(this) && (rid === undefined || rid === -1000 || rid === this.activeRoomId) && (cid === undefined || cid === -1 || cid === 1)) ? PIENI.E * PIENI.G : v; });
    kaari('setRoomInstanceRenderingCanvasScale', alku => function (rid, cid, level, point, offsetPoint, isFlipForced) {
        const oma = cid === 1 && rid === this.activeRoomId && !isFlipForced && !arguments[6] && PIENI.paalla && typeof level === 'number' && Number.isFinite(level);
        if (oma && level > 0 && snapPaalla() && snapAseta(this, rid, lahinSnap(level))) return;   // 0.14.0: client-napit / :zoom -> porrastaso (1 -> lähin)
        if (oma && level < 1) { const G = Math.max(ALIN, Math.min(0.5, Math.pow(2, Math.round(Math.log2(Math.max(level, 1e-9))))));   // suurennuslasi / :zoom alle 1
            if (pieniAseta(this, rid, G)) return; }
        else if (oma && PIENI.G) pieniPois(this, rid);
        return alku.apply(this, arguments); });
    // clientin resize (useRoom.ts, myös visualViewport resize/scroll) palauttaa normaalin koon: asetetaan uudelleen rAF:ssa, kaikkien käsittelijöiden jälkeen
    const uudelleen = () => { if (!PIENI.G) return; cancelAnimationFrame(pRaf); pRaf = requestAnimationFrame(() => { pRaf = 0;
        const re2 = RE(); if (!PIENI.G || !PIENI.alku) return; if (!re2 || re2.activeRoomId !== PIENI.rid) { pieniIrti('huone vaihtui'); return; }
        const G = PIENI.G, a = PIENI.alku, c = re2.getRoomInstanceRenderingCanvas(PIENI.rid, 1); if (!c) return;
        if (Math.abs(c._width - a.W / G) > 2 || Math.abs(c._height - a.H / G) > 2) { a.W = c._width; a.H = c._height; }   // client asetti uuden normaalikoon
        const P = PIENI.P; PIENI.P = null; try { const sn = PIENI.snap; if (sn) pieniAseta(re2, PIENI.rid, sn.n / DPR(), P, 1, sn); else pieniAseta(re2, PIENI.rid, G, P, PIENI.E); } catch (e) { loki('pieni uudelleen virhe: ' + e.message); } }); };
    const vvP = VW.visualViewport;
    window.addEventListener('resize', uudelleen); if (vvP) { vvP.addEventListener('resize', uudelleen); vvP.addEventListener('scroll', uudelleen); }
    pieniPoistu = () => { cancelAnimationFrame(pJalki); try { const re2 = RE(); if (PIENI.G && re2 && re2.activeRoomId === PIENI.rid) pieniPois(re2, re2.activeRoomId); else pieniIrti('poistu'); } catch (e) {}
        window.removeEventListener('resize', uudelleen); if (vvP) { vvP.removeEventListener('resize', uudelleen); vvP.removeEventListener('scroll', uudelleen); }
        for (const [nimi, oma, alku, k] of kaaret.reverse()) if (re[nimi] === k) { if (oma) re[nimi] = alku; else delete re[nimi]; } };
}
loki('asennettu');

// ZOOMITASO FPS:n ALLE (0.12.0, kp 6.11. 21:34 "fps alla zoom level, fps komento on mulla aktiivinen", 21:35 "tai lisää vaa mulle"): vain kurkkupomolle, aina päällä, ei komentoa.
//   Käyttäjä: moottorin _sessionDataManager (_userId 282 tai _name 'kurkkupomo', sama lähde kuin 424.js omaId; clientin oma väite, vain ulkonäköä). Tason luku =
//   getRoomInstanceRenderingCanvasScale (pelitaso). FPS-elementti: lehtielementti jonka teksti on /^d+s*FPS$/i; tyyli luetaan siitä, label asetetaan sen alle.
//   Ei FPS-elementtiä -> label vasempaan yläkulmaan. Päivitys 100 ms:n välein (DOM kirjoitetaan vain kun teksti tai paikka muuttuu).
const OMISTAJA_ID = 282, FPS_RE = /^\d+\s*FPS$/i;
const onOmistaja = () => { try { const d = (o, k) => { const x = o && Object.getOwnPropertyDescriptor(o, k); return x && !x.get ? x.value : undefined; };
    const sd = d(RE(), '_sessionDataManager'); return d(sd, '_userId') === OMISTAJA_ID || String(d(sd, '_name') || '').toLowerCase() === 'kurkkupomo'; } catch (x) { return false; } };
let nayttoEl = null, fpsEl = null, fpsHaku = 0;
const etsiFps = () => {
    if (fpsEl && fpsEl.isConnected && FPS_RE.test((fpsEl.textContent || '').trim())) return fpsEl;
    const nyt = performance.now(); if (nyt - fpsHaku < 500) return fpsEl && fpsEl.isConnected ? fpsEl : null; fpsHaku = nyt;
    fpsEl = null;
    for (const el of document.querySelectorAll('body *')) if (el !== nayttoEl && el.childElementCount === 0 && FPS_RE.test((el.textContent || '').trim())) { fpsEl = el; break; }
    return fpsEl;
};
const paivitaNaytto = () => {
    if (!onOmistaja()) { if (nayttoEl) { nayttoEl.remove(); nayttoEl = null; } return; }
    const re = RE(); let g = null; try { g = re && re.activeRoomId != null && re.activeRoomId !== -1 ? re.getRoomInstanceRenderingCanvasScale(re.activeRoomId, 1) : null; } catch (x) {}
    if (!(g > 0)) { if (nayttoEl) nayttoEl.style.display = 'none'; return; }
    if (!nayttoEl) { nayttoEl = document.createElement('div'); nayttoEl.id = 'huone-ctrlzoom-taso'; document.body.appendChild(nayttoEl); }
    const f = etsiFps(); let st = 'position:fixed;pointer-events:none;z-index:2147483000;white-space:nowrap;';
    if (f) { const r = f.getBoundingClientRect(), cs = getComputedStyle(f);
        st += 'left:' + r.left + 'px;top:' + r.bottom + 'px;font:' + (cs.font || (cs.fontSize + ' ' + cs.fontFamily)) + ';color:' + cs.color + ';text-shadow:' + cs.textShadow + ';letter-spacing:' + cs.letterSpacing + ';'; }
    else st += 'left:4px;top:4px;font:12px monospace;color:#fff;text-shadow:0 0 2px #000;';
    if (nayttoEl.style.cssText !== st) nayttoEl.style.cssText = st;
    const txt = 'zoom ' + String(+g.toFixed(2)); if (nayttoEl.textContent !== txt) nayttoEl.textContent = txt;
};
const nayttoAjastin = setInterval(() => { try { paivitaNaytto(); } catch (x) {} }, 100);

tila.poistu = () => {
    clearInterval(snapVahti); pieniPoistu(); vahtiPoistu(); clearInterval(nayttoAjastin); if (nayttoEl) nayttoEl.remove();
    clearTimeout(varaTimer); window.removeEventListener('wheel', kasittele, { passive: false });
    pudota('poistu'); window.removeEventListener('resize', resizePehmea, true);
    document.removeEventListener('keydown', enter, true); kuplaPoistu(); kameraPoistu(); selainPoistu(); nappiPoistu();
    try { const j = VW.kuplaKomennotJono, i = j ? j.indexOf(jonoRivi) : -1; if (i >= 0) j.splice(i, 1); } catch (e) {}   // jos komentomoduuli ei ole vielä lukenut jonoa
    if (VW.__huoneCtrlZoom === tila) delete VW.__huoneCtrlZoom;
};
return tila.poistu;
