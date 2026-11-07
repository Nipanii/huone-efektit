// Huoneskripti: kuplat seuraavat puhujaansa pelin zoomissa (huone 424, kp 7.11. 14:44 "tarviin ton toimii" · "ne liikkuu aina zoomatessa" · 14:47 "kuplan pitäs
//   aina seurata hahmoa niinku room dragissa seurataan"). Korvaa 1.0.0:n (6d20a82, otettu pois 48f5533), joka laski kuplan paikan väärästä lähtökohdasta.
// MIKSI (mitattu robolla 7.11. 14:49, ui-zoom 1.6, ILMAN skriptiä): ctrl+rulla 1 -> 1.122 siirsi kaikki kuplat 668 px vasemmalle reunaan, eivätkä ne palanneet tasolle 1.
//   Syy on clientin oma: zoomin kutistus (RoomZoomController applySize) kasvattaa canvasin W/G-kokoiseksi ja siirtää offsetin keskipisteen pitämiseksi
//   setRoomInstanceRenderingCanvasOffsetilla, moottori lähettää siitä RoomDragEventin (offsetin muutos moottorin px:nä) ja chat (useChatWidget ROOM_DRAG) siirtää
//   jokaista kuplaa sen verran, vaikka huone ei ruudulla liikkunut. Kokonaisen tason zoom taas ei lähetä mitään, joten kuplat eivät liiku ja puhujat liukuvat alta.
//   1.0.0 muisti kuplan huone-x:n vasta clientin väärän siirron JÄLKEEN, joten virhe jäi pysyväksi.
// MITEN: sama periaate kuin raahauksessa (kupla pysyy samassa huoneen pisteessä), mutta ruudun koordinaatit luetaan moottorista eikä luoteta drag-deltaan:
//   näkymä { s, T }: huoneen piste X on ruudulla X*s + T, s = getRoomInstanceRenderingCanvasScale (pelitaso, kutistus mukana), T = G*(canvas.width/2 + screenOffsetX),
//   G = pelitaso / moottorin taso (sama kaava kuin RoomEngine.getRoomObjectScreenLocation + zoomin kutistuskerroin). Jokaiselle kuplalle muistetaan X siitä näkymästä,
//   jossa se piirrettiin. Kun näkymä muuttuu (zoom, kutistus, selainzoom, raahaus), kuplan left = X*s + T - leveys/2.
//   1) setRoomInstanceRenderingCanvasOffset kääritään: ENNEN alkuperäistä (ennen clientin drag-siirtoa) kuplien X muistetaan edellisestä näkymästä, JÄLKEEN
//      kuplat asetetaan uuteen näkymään samassa tahdissa, joten clientin väärä siirto ei ehdi ruudulle. Tavallinen raahaus tasolla 1 antaa saman tuloksen kuin client.
//   2) joka ruudulla (rAF, piilossa 250 ms välein) näkymä luetaan: kokonaisen tason zoom ja canvasin koon muutos eivät kulje offsetin kautta.
//   Zoomin jälkeen (s muuttui) pino tarkistetaan kuten clientin ChatEdgeLift: vanhempi kupla nostetaan uudemman yläpuolelle, nosto palautetaan kun tilaa on.
// ITSESAMMUTUS: kun live client kantaa seurannan (kupla-cc PR #835), .nitro-chat-widget[data-camera-follow]; tarkistus käynnistyksessä ja 3 s välein.
// RAJA: kuplan paikka on puhujan paikka viestin hetkellä (kuten clientissa), ei kävelevän hahmon nykyinen. Ennen skriptiä jo väärään paikkaan jääneet kuplat jäävät.
if (window.__huoneKuplaSeuraa) { try { window.__huoneKuplaSeuraa.poistu(); } catch (e) {} }
const VW = window;
const RE = () => VW.NitroDevTools && VW.NitroDevTools.roomEngine;
const tila = VW.__huoneKuplaSeuraa = { versio: 'kupla-seuraa-2.0.0', natiivi: false, pysaytetty: false, loki: [], poistu() {},
    kamera: { zoomeja: 0, offsetteja: 0, siirtoja: 0, nostoja: 0, virheita: 0 } };
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
// LiftOlderChats: uusimmasta vanhimpaan, vanhempi uudemman yläpuolelle, nosto kirjataan edgeLiftiin (palautuu kun tilaa on)
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

// näkymä: huoneen piste X (moottorin geometrian yksikkö) on ruudulla X*s + T CSS px (canvas ja chat-widget alkavat samasta kohdasta)
const nakyma = (re, rid) => {
    const c = re.getRoomInstanceRenderingCanvas(rid, 1);
    if (!(c && c.scale > 0 && c.width > 0 && Number.isFinite(c.screenOffsetX))) return null;
    let s = c.scale;
    try { const peli = re.getRoomInstanceRenderingCanvasScale(rid, 1); if (Number.isFinite(peli) && peli > 0 && peli <= c.scale * 1.000001) s = peli; } catch (e) {}
    const g = s / c.scale;
    return { rid, s, T: g * (c.width / 2 + c.screenOffsetX) };
};
const sama = (a, b) => (a && b && a.rid === b.rid && Math.abs(a.s - b.s) < 1e-9 && Math.abs(a.T - b.T) < 0.01);

const huoneX = new WeakMap();   // kupla -> puhujan x huoneen pisteenä
const omaHuone = (c, rid) => (typeof c.roomId !== 'number' || c.roomId === rid);
// kuplat joilla ei vielä ole X:ää: ne ovat näkymässä a (siinä jossa ne piirrettiin)
const muista = (a, l) => { if (!a || !l) return; for (const c of l) if (c.elementRef && !huoneX.has(c) && omaHuone(c, a.rid) && c.width > 0) huoneX.set(c, (c.left + c.width / 2 - a.T) / a.s); };
// näkymästä a näkymään b: piirretyt kuplat X:nsä kohdalle, piirtämättömien paikka (location.x, käytetään mountissa) samalla kartalla
const seuraa = (a, b) => {
    if (!a || !b || a.rid !== b.rid || sama(a, b)) return;
    const l = lista(); if (!l || !l.length) return;
    muista(a, l);
    let n = 0;
    for (const c of l) {
        if (!omaHuone(c, b.rid)) continue;
        if (!c.elementRef) { if (c.location && typeof c.location.x === 'number') c.location.x = Math.round(((c.location.x - a.T) / a.s) * b.s + b.T); continue; }
        const hx = huoneX.get(c); if (typeof hx !== 'number') continue;
        const uusi = Math.round(hx * b.s + b.T - c.width / 2);
        if (Math.abs(uusi - c.left) >= 1) { c.left = uusi; n++; }
    }
    k.siirtoja += n;
    if (Math.abs(a.s - b.s) < 1e-9) return;   // pelkkä raahaus: pino on clientin (ChatWidgetView ROOM_DRAG)
    k.zoomeja++;
    const m = l.filter(c => c.elementRef && omaHuone(c, b.rid));
    palauta(m); k.nostoja += nosta(m);
};

let viimeinen = null;   // näkymä, jossa kuplat nyt ovat

// 1) offset: clientin ROOM_DRAG-siirto korvataan saman tahdin sisällä
const re0 = RE();
let kaare = null;
if (re0 && typeof re0.setRoomInstanceRenderingCanvasOffset === 'function') {
    const alkup = re0.setRoomInstanceRenderingCanvasOffset, oma = Object.prototype.hasOwnProperty.call(re0, 'setRoomInstanceRenderingCanvasOffset');
    const kaarija = function (roomId, canvasId) {
        let a = null;
        if (!tila.pysaytetty && canvasId === 1 && roomId === this.activeRoomId) {
            try { a = (viimeinen && viimeinen.rid === roomId) ? viimeinen : nakyma(this, roomId); muista(a, lista()); } catch (e) { a = null; }
        }
        const tulos = alkup.apply(this, arguments);
        if (a) {
            try { const b = nakyma(this, roomId); if (b) { k.offsetteja++; seuraa(a, b); viimeinen = b; } }
            catch (e) { k.virheita++; loki('offset-seuranta virhe: ' + e.message); }
        }
        return tulos;
    };
    re0.setRoomInstanceRenderingCanvasOffset = kaarija;
    kaare = () => { if (re0.setRoomInstanceRenderingCanvasOffset === kaarija) { if (oma) re0.setRoomInstanceRenderingCanvasOffset = alkup; else delete re0.setRoomInstanceRenderingCanvasOffset; } };
}

// 2) joka ruutu: kokonaisen tason zoom (RoomSpriteCanvas.setScale kirjoittaa offsetin suoraan) ja canvasin koon muutos
let raf = 0, varaAjastin = 0, vahti = 0;
const tarkista = () => {
    if (tila.pysaytetty) return;
    try {
        const re = RE(); if (!re) { viimeinen = null; return; }
        const rid = re.activeRoomId;
        const v = (rid == null || rid === -1) ? null : nakyma(re, rid);
        if (!v) { viimeinen = null; return; }
        const a = viimeinen;
        if (!a || a.rid !== v.rid || sama(a, v)) { muista(v, lista()); viimeinen = v; return; }
        seuraa(a, v); viimeinen = v;
    } catch (e) { k.virheita++; loki('zoom-seuranta virhe: ' + e.message); }
};
const askel = () => { if (tila.pysaytetty) return; raf = requestAnimationFrame(askel); tarkista(); };

const pysayta = () => { tila.pysaytetty = true; cancelAnimationFrame(raf); clearInterval(varaAjastin); clearInterval(vahti); if (kaare) kaare(); };
tila.poistu = () => { pysayta(); if (VW.__huoneKuplaSeuraa === tila) delete VW.__huoneKuplaSeuraa; };
const luovuta = () => { tila.natiivi = true; loki('live client kantaa kuplaseurannan (data-camera-follow): pysähtyy'); pysayta(); };

if (natiiviSeuraa()) { luovuta(); return tila.poistu; }
vahti = setInterval(() => { try { if (natiiviSeuraa()) luovuta(); } catch (e) {} }, 3000);
varaAjastin = setInterval(() => { if (document.hidden) tarkista(); }, 250);   // rAF ei aja piilotetussa välilehdessä
tarkista();
raf = requestAnimationFrame(askel);
loki('asennettu ' + tila.versio + (kaare ? '' : ' (offsetin kääre puuttuu: vain ruutu kerrallaan)'));
return tila.poistu;
