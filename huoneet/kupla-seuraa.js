// Huoneskripti: kuplat seuraavat puhujaa pelin zoomissa (huone 424, kp 7.11. 11:11 "laita sit huonescriptinä zen denii kupla korjaus, sillee että se menee pois
//   päältä ku tulee livee"). Vain "Kuplat seuraavat" -lohko vanhasta ctrl-rulla-zoom.js:stä (huone-efektit 7869505^, poistettu kun #836 tuli liveen ja vei
//   mukanaan myös tämän), sovitettuna liven zoomiin (kupla-cc #836, RoomZoomController). Ei käsittele zoom-syötettä: ctrl+rulla zoomaa nyt client itse.
// MIKSI: pelin zoom ei liikuta kuplia (chat-widget ei kuuntele ROOM_ZOOMED), joten puhujat liukuvat kuplien alta. Lisäksi #836 tekee kaikki muut kuin kokonaiset
//   tasot moottorin tasona E + CSS-kutistuksena G, eikä silloin kutsu moottorin skaalausta lainkaan (ei ROOM_ZOOMED), ja ruutupaikat ovat G-kertaisia.
// MITEN: ei kääri moottorin metodeja (live zoom kääri ne jo, ja purkaa omansa vain jos ne ovat vielä paikallaan). Joka ruudulla (rAF) luetaan näkymä
//   { s: scale * G, w: width * G, ox: screenOffsetX * G }, G = getRoomInstanceRenderingCanvasScale / canvas.scale (live zoom palauttaa kutistuksen aikana pelitason,
//   muuten moottorin tason, jolloin G = 1). Kun s muuttuu, jokainen kupla siirtyy SIVUSUUNNASSA puhujansa kohdalle (huone-x muistetaan ensimmäisestä näkemästä,
//   kaava RoomEngine.getRoomObjectScreenLocation: x*scale + width/2 + offsetX), sitten kameran nostot palautetaan ja pino tarkistetaan: vanhempi kupla aina
//   kokonaan uudemman yläpuolelle samassa sarakkeessa. Pelkkä offsetin muutos (raahaus) jää clientille. Selainzoom (window resize): huone-x muistetaan resizen
//   alussa (capture, ennen clientin käsittelijöitä) ja kuplat siirretään 450 ms viimeisen muutoksen jälkeen.
// ITSESAMMUTUS: kun live client kantaa tämän korjauksen (kupla-cc PR #835), se laittaa .nitro-chat-widget[data-camera-follow]. Tarkistus käynnistyksessä ja
//   3 s välein; havainnon jälkeen tämä pysäyttää kaiken eikä koske kupliin.
// EI MUKANA: vanhan lohkon raahauksen päällekkäisyyskorjaus (raahausKorjaus). Se jää clientin omaksi (#835 tuo sen).
// RAJA: kuplan vaakapaikka on puhujan paikka VIESTIN hetkellä, ei kävelevän hahmon nykyinen paikka. Ennen tätä skriptiä tulleiden kuplien huone-x lasketaan
//   niiden nykyisestä paikasta.
if (window.__huoneKuplaSeuraa) { try { window.__huoneKuplaSeuraa.poistu(); } catch (e) {} }
const VW = window;
const RE = () => VW.NitroDevTools && VW.NitroDevTools.roomEngine;
const tila = VW.__huoneKuplaSeuraa = { versio: 'kupla-seuraa-1.0.0', natiivi: false, pysaytetty: false, loki: [], poistu() {}, kamera: { zoomeja: 0, selainzoomeja: 0, siirtoja: 0, nostoja: 0, virheita: 0 } };
const k = tila.kamera;
const loki = s => { tila.loki.push(new Date().toTimeString().slice(0, 8) + ' ' + s); if (tila.loki.length > 50) tila.loki.shift(); };

const widgetEl = () => document.querySelector('.nitro-chat-widget');
const natiiviSeuraa = () => { const w = widgetEl(); return !!(w && w.dataset && w.dataset.cameraFollow); };
// chat-widgetin kuplalista: Reactin fiberistä ensimmäinen tilaketju, jonka alkio on kupla (skipMovement + elementRef)
const lista = () => {
    const w = widgetEl(); if (!w) return null;
    const key = Object.keys(w).find(n => n.startsWith('__reactFiber$')); if (!key) return null;
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
const samaSarake = (a, b) => !(((dl(a) + a.width) < dl(b)) || (dl(a) > (dl(b) + b.width)));
const tiella = (vanha, uusi) => samaSarake(vanha, uusi) && ((vanha.top + vanha.height) >= uusi.top);
const paallekkain = (a, b, alas) => !(((dl(a) + a.width) < dl(b)) || (dl(a) > (dl(b) + b.width)) || ((a.top + a.height) < (b.top + alas)) || (a.top > (b.top + alas + b.height)));
// LiftOlderChats (syy 'zoom'): uusimmasta vanhimpaan, vanhempi uudemman yläpuolelle, nosto kirjataan edgeLiftiin
const nosta = chats => {
    const uusin = chats[chats.length - 1]; if (!uusin) return 0;
    const valmiit = [ uusin ]; let n = 0;
    for (let i = chats.length - 2; i >= 0; i--) {
        const vanha = chats[i];
        for (let vartija = 0; vartija <= valmiit.length; vartija++) {
            const esteet = valmiit.filter(u => tiella(vanha, u));
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
// ruudun koordinaateissa: kutistuksen aikana (#836) canvas on W/G x H/G ja CSS-kutistettu kertoimella G, ruutupaikat ovat G-kertaisia
const nakyma = (re, rid) => {
    const c = re.getRoomInstanceRenderingCanvas(rid, 1);
    if (!(c && c.scale > 0 && c.width > 0 && Number.isFinite(c.screenOffsetX))) return null;
    let g = 1;
    try { const peli = re.getRoomInstanceRenderingCanvasScale(rid, 1); const r = peli / c.scale; if (Number.isFinite(r) && r > 0 && r <= 1.000001) g = r; } catch (e) {}
    return { s: c.scale * g, w: c.width * g, ox: c.screenOffsetX * g };
};
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
        const hx = huoneX.get(c); if (typeof hx !== 'number') continue;
        const uusi = Math.round(hx * b.s + b.w / 2 + b.ox - c.width / 2);
        if (uusi !== c.left) { c.left = uusi; n++; }
    }
    k.zoomeja++; k.siirtoja += n;
    if (!n) return;
    const m = l.filter(c => c.elementRef);
    palauta(m); k.nostoja += nosta(m);
};

// SELAINZOOM: huonetta siirretään suoraan offsetilla ilman ROOM_DRAGia. Purskeen alussa (capture, ennen clientin käsittelijöitä) huone-x muistiin, 450 ms
//   viimeisen muutoksen jälkeen kuplat puhujan kohdalle ja pino tarkistetaan (clientin oma resize-korjaus ehtii ensin).
let purskeA = null, purskeRid = null, purskeAjastin = 0;
const purskeLoppu = () => {
    const a = purskeA, rid = purskeRid; purskeA = null;
    const re = RE(); if (!a || !re || natiiviSeuraa() || rid !== re.activeRoomId) return;
    try {
        const b = nakyma(re, rid), l = lista(); if (!b || !l) return;
        muista(rid, b, l);   // purskeen aikana tulleet: paikka on jo uudessa näkymässä, ne eivät liiku
        seuraa(rid, a, b, false); k.selainzoomeja++;
    } catch (e) { k.virheita++; loki('selainzoom-seuranta virhe: ' + e.message); }
};
const pidennaPurske = () => { clearTimeout(purskeAjastin); purskeAjastin = setTimeout(purskeLoppu, 450); };
const resizeAlku = () => {
    if (tila.pysaytetty) return;
    const re = RE(); if (!re || natiiviSeuraa()) return;
    if (!purskeA) { try { purskeRid = re.activeRoomId; purskeA = nakyma(re, purskeRid); const l = lista(); if (purskeA && l) muista(purskeRid, purskeA, l); } catch (e) { purskeA = null; } }
    pidennaPurske();
};

// ZOOM: kutistuksen portaat (#836) eivät kutsu moottorin skaalausta eikä laukaise ROOM_ZOOMEDia, joten näkymää luetaan joka ruudulla. Vain skaalan s muutos
//   siirtää kuplat; pelkkä offsetin tai leveyden muutos (raahaus, kamera, selainzoom) ei, ja purskeen aikana odotetaan purskeen loppua.
let viimeinen = null, viimeinenRid = null, raf = 0, vahti = 0;
const askel = () => {
    if (tila.pysaytetty) return;
    raf = requestAnimationFrame(askel);
    try {
        const re = RE(); if (!re) { viimeinen = null; return; }
        const rid = re.activeRoomId;
        const v = (rid == null || rid === -1) ? null : nakyma(re, rid);
        if (!v) { viimeinen = null; return; }
        const a = viimeinen, sama = a && viimeinenRid === rid; viimeinen = v; viimeinenRid = rid;
        if (!sama) return;
        if (Math.abs(a.s - v.s) < 1e-9) { if (purskeA && (Math.abs(a.w - v.w) > 0.01 || Math.abs(a.ox - v.ox) > 0.01)) pidennaPurske(); return; }
        if (purskeA) return;
        seuraa(rid, a, v);
    } catch (e) { k.virheita++; loki('zoom-seuranta virhe: ' + e.message); }
};

const pysayta = () => {
    tila.pysaytetty = true; cancelAnimationFrame(raf); clearInterval(vahti); clearTimeout(purskeAjastin);
    window.removeEventListener('resize', resizeAlku, true);
};
tila.poistu = () => { pysayta(); if (VW.__huoneKuplaSeuraa === tila) delete VW.__huoneKuplaSeuraa; };
const luovuta = () => { tila.natiivi = true; loki('live client kantaa kuplaseurannan (data-camera-follow): pysähtyy'); pysayta(); };

if (natiiviSeuraa()) { luovuta(); return tila.poistu; }
window.addEventListener('resize', resizeAlku, true);
vahti = setInterval(() => { try { if (natiiviSeuraa()) luovuta(); } catch (e) {} }, 3000);
raf = requestAnimationFrame(askel);
loki('asennettu ' + tila.versio);
return tila.poistu;
