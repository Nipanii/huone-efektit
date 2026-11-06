// Huoneskripti: Ctrl+rulla pelialueen päällä vaihtaa pelin omaa zoomia (huone 424, kp 6.11. 13:16 "laita samanlailla jakoon se scroll zoom huoneeseen.
//   disabloituu jos livessä"). Sama logiikka kuin kortti userscriptit/ctrl-rulla-zoom/ctrl-rulla-zoom.user.js 0.6.0 (zoom + B22-kuplakorjaus), käärittynä
//   huoneskriptin muotoon: ei @-otsikoita, palauttaa siivousfunktion, uudelleenajo siivoaa edellisen (window.__huoneCtrlZoom).
//   Moottori (moottori.js:66-67) ajaa tämän new Function('kupla', koodi)(api):lla ja kutsuu paluuarvoa huoneesta lähtiessä.
//
// MITEN: :zoom lähettää RoomZoomEvent(roomId, taso), joka päätyy RoomEngine.setRoomInstanceRenderingCanvasScale(roomId, 1, taso, ...). Askel 0.5 (0.5, 1, 1.5 ...),
//   ei ylä- eikä alarajaa; 0.5:n alapuolella askel puolittaa/kaksinkertaistaa. wheel-kuuntelija passive:false + preventDefault estää Chromen ctrl+rulla-zoomin
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
const RE = () => VW.NitroDevTools && VW.NitroDevTools.roomEngine;
const tila = VW.__huoneCtrlZoom = { versio: 'huone-0.7.1', natiivi: false, loki: [], poistu() {}, aseta: null, tilaNyt: null };
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
    const tama = re.getRoomInstanceRenderingCanvasScale(rid, 1) || 1;
    // ei ylärajaa (kp 5.11. 01:10); 1:stä ylöspäin vain kokonaisluvut (kp 6.11. 13:44 "scroll zoom pitää poistaa murtoluvut, ei toimi":
    //   sipuli mittasi 1->1.5 ja 2->2.5 ei tee mitään). Alle 1 askel puolittaa (0.5, 0.25 ...) kuten ennen.
    const ylos = e.deltaY < 0;
    const uusi = ylos ? (tama >= 1 ? Math.floor(tama) + ASKEL : Math.min(1, tama * 2))
        : (tama > 1 ? Math.ceil(tama) - ASKEL : tama / 2);
    if (uusi === tama) return;
    re.setRoomInstanceRenderingCanvasScale(rid, 1, uusi, null, null, false, true);   // keskipisteeseen kuten :zoom
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
            if (cid !== 1 || rid !== this.activeRoomId || natiiviSeuraa()) return alkuS.apply(this, arguments);
            let ennen = null; try { ennen = nakyma(this, rid); } catch (e) {}
            const r = alkuS.apply(this, arguments);
            try { seuraa(rid, ennen, nakyma(this, rid)); } catch (e) { k.virheita++; loki('zoom-seuranta virhe: ' + e.message); }
            return r;
        };
        const kaariO = function (rid, cid) {
            const r = alkuO.apply(this, arguments);
            // clientin oma ROOM_DRAG-korjaus rekisteröi rAF:n tämän kutsun sisällä -> tämä ajetaan sen jälkeen samassa kehyksessä
            if (cid === 1 && rid === this.activeRoomId) requestAnimationFrame(() => { try { raahausKorjaus(); } catch (e) { k.virheita++; loki('raahauskorjaus virhe: ' + e.message); } });
            return r;
        };
        reK.setRoomInstanceRenderingCanvasScale = kaariS; reK.setRoomInstanceRenderingCanvasOffset = kaariO;
        window.addEventListener('resize', resizeAlku, true);
        kameraPoistu = () => {
            window.removeEventListener('resize', resizeAlku, true); clearTimeout(purskeAjastin);
            if (reK.setRoomInstanceRenderingCanvasScale === kaariS) { if (omatS) reK.setRoomInstanceRenderingCanvasScale = alkuS; else delete reK.setRoomInstanceRenderingCanvasScale; }
            if (reK.setRoomInstanceRenderingCanvasOffset === kaariO) { if (omatO) reK.setRoomInstanceRenderingCanvasOffset = alkuO; else delete reK.setRoomInstanceRenderingCanvasOffset; }
        };
    } else loki('roomEngine puuttuu: kuplien zoom-seuranta ei asennettu');
}
// ---- Selainzoom pitää huoneen keskellä (kp 6.11. 14:00 "selain zoom ei pidä huoneen sijaintia ruudulla samana ... pitää keskittää samanlail ku huone zoom") ----
// MIKSI: kun pelin zoom != 1, huonekamera (RoomEngine.updateRoomCamera) on pois päältä ja clientin resize-käsittelijä (useRoom.ts, PR #197) ankkuroi huoneen
//   CSS-pikseleihin: offset -= scale * (uusi leveys - vanha leveys) / 2. Selainzoom muuttaa viewportin CSS-kokoa, joten huone liukuu nurkkaan (zoom out) tai ulos
//   (zoom in). Pelin oma zoom taas pitää viewportin keskipisteessä olevan huonepisteen keskellä. Keskitys = ankkurointi + (uusi - vanha leveys) / 2 per akseli.
//   MITATTU oikealla Chrome-sivuzoomilla (WM_COMMAND, robo :9223, scale 2): 100 % -> 67 % huone -308/-325 CSS-px pois keskeltä, 150 %: +213/+226; tämän kanssa 0.
// MILLOIN: vain kun devicePixelRatio on vaihtunut (selainzoom) ja pelin zoom != 1. Pelkkä ikkunan koonmuutos jää #197:n käyttäytymiseen.
// ITSESAMMUTUS: client asettaa window.__kuplaZoomKeskitys = true kun natiivi korjaus (PR robo/browser-zoom-room-center) on livessä -> tämä ei tee mitään.
let selainPoistu = () => {};
{
    let viimeW = null, viimeH = null, viimeDpr = VW.devicePixelRatio || 1, odottaaZoom = false, odotusAika = 0;
    const kanvas = () => { const re = RE(); if (!re || typeof re.getRoomInstanceRenderingCanvas !== 'function') return null;
        const rid = re.activeRoomId; if (rid == null || rid === -1) return null; return re.getRoomInstanceRenderingCanvas(rid, 1) || null; };
    const korjaa = () => {
        const c = kanvas(); if (!c) return;
        const s = c.scale || 1, w = c.width / s, h = c.height / s;
        const dpr = VW.devicePixelRatio || 1;
        if (Math.abs(dpr - viimeDpr) > 1e-6) { odottaaZoom = true; odotusAika = performance.now(); viimeDpr = dpr; }
        if (viimeW === null || (w === viimeW && h === viimeH)) { viimeW = w; viimeH = h; return; }   // ensimmäinen havainto tai clientin käsittelijä ei ole vielä ehtinyt
        if (odottaaZoom && performance.now() - odotusAika > 1000) odottaaZoom = false;
        if (odottaaZoom) {
            odottaaZoom = false;
            if (VW.__kuplaZoomKeskitys) { if (!tila.natiiviKeskitys) { tila.natiiviKeskitys = true; loki('natiivi selainzoom-keskitys havaittu, tämä ei tee mitään'); } }
            else if (s !== 1) {
                const dx = (w - viimeW) / 2, dy = (h - viimeH) / 2;
                c.screenOffsetX = Math.trunc(c.screenOffsetX + dx); c.screenOffsetY = Math.trunc(c.screenOffsetY + dy);
                tila.keskityksia = (tila.keskityksia || 0) + 1; tila.viimeKeskitys = { dx, dy, s };
            }
        }
        viimeW = w; viimeH = h;
    };
    // heti (jos clientin käsittelijä ehti ensin) ja uudestaan ennen piirtoa (jos ei ehtinyt tai se rekisteröityi uudelleen meidän jälkeemme)
    const onResize = () => { korjaa(); requestAnimationFrame(korjaa); };
    window.addEventListener('resize', onResize);
    const vv = VW.visualViewport; if (vv) vv.addEventListener('resize', onResize);
    setTimeout(korjaa, 0);   // alkutila muistiin
    selainPoistu = () => { window.removeEventListener('resize', onResize); if (vv) vv.removeEventListener('resize', onResize); };
}
loki('asennettu');

tila.poistu = () => {
    clearTimeout(varaTimer); window.removeEventListener('wheel', kasittele, { passive: false });
    document.removeEventListener('keydown', enter, true); kuplaPoistu(); kameraPoistu(); selainPoistu();
    try { const j = VW.kuplaKomennotJono, i = j ? j.indexOf(jonoRivi) : -1; if (i >= 0) j.splice(i, 1); } catch (e) {}   // jos komentomoduuli ei ole vielä lukenut jonoa
    if (VW.__huoneCtrlZoom === tila) delete VW.__huoneCtrlZoom;
};
return tila.poistu;
