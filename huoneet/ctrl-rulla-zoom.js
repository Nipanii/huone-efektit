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
const ASKEL = 0.5;
const RE = () => VW.NitroDevTools && VW.NitroDevTools.roomEngine;
const tila = VW.__huoneCtrlZoom = { versio: 'huone-0.6.0', natiivi: false, loki: [], poistu() {}, aseta: null, tilaNyt: null };
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
    // ei ylärajaa (kp 5.11. 01:10); ei alarajaa: 0.5:n alapuolella askel puolittaa (0.25, 0.125 ...), koska -0.5 veisi nollaan
    const ylos = e.deltaY < 0;
    const uusi = tama > 0.5 || (ylos && tama === 0.5) ? Math.max(0.5, Math.round((tama + (ylos ? ASKEL : -ASKEL)) * 2) / 2)
        : (ylos ? Math.min(0.5, tama * 2) : tama / 2);
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
loki('asennettu');

tila.poistu = () => {
    clearTimeout(varaTimer); window.removeEventListener('wheel', kasittele, { passive: false });
    document.removeEventListener('keydown', enter, true); kuplaPoistu();
    try { const j = VW.kuplaKomennotJono, i = j ? j.indexOf(jonoRivi) : -1; if (i >= 0) j.splice(i, 1); } catch (e) {}   // jos komentomoduuli ei ole vielä lukenut jonoa
    if (VW.__huoneCtrlZoom === tila) delete VW.__huoneCtrlZoom;
};
return tila.poistu;
