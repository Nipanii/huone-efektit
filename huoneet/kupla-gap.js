// Kaikkien huoneiden skripti: chat-kuplien väli ei jää auki kun kupla pienenee (B224, PR 0-es/kupla-cc#850, kp 8.11. 02:14 "laita gap fix päälle huonescriptinä" · "kaikille").
//   Väliaikainen hotfix kunnes clientin oma korjaus on livenä: sitten tämä pysäyttää itsensä (ja hotfix-poisto.js poistaa tiedoston listalta).
// MIKSI: ChatWidgetMessageView.tsx:n ResizeObserver käsitteli vain kuplan KASVUN. Kun UI-zoomi laskee (UiZoom.scss zoomaa `.nitro-chat-widget > .bubble-container > *`)
//   kupla pienenee, mutta chat.height jää vanhaan arvoon: kupla pysyy ylhäällä ja pino luulee sen yhä vanhan kokoiseksi, joten väli alla olevaan kuplaan jää
//   (mitattu 8.11. robolla huone 424: zoomi 1.6 -> 1.0, välit 1 px -> 121/28/17/110 px, chat.height != offsetHeight joka kuplalla).
// MITEN (sama logiikka kuin PR 850:n ChatResize.ts, ei uutta käytöstä): jokaiselle `.nitro-chat-widget > .bubble-container`ille oma ResizeObserver. Kupla pienenee ->
//   chat.height = uusi korkeus, kupla lasketaan alas (vanha chat.height - uusi korkeus) eli alareuna pysyy, ja vanhemmat saman sarakkeen kuplat jotka lepäsivät sen
//   vanhan yläreunan päällä (väli -1..2 px) lasketaan perässä, ja ne joiden päällä nämä lepäsivät. Pinottu tila (chatSettings.mode != 0): kaikki vanhemmat alas.
//   Kuplat löytyvät Reactin fiberistä (DOM-solmun __reactFiber -> ChatWidgetMessageView:n props.chat), asetus chat.top = ... kirjoittaa itse style.top:n
//   (ChatBubbleMessage.top-setteri), joten uudelleenrender ei kumoa sitä. Lopuksi kutsutaan clientin omaa onGrow(chat, 0, 0):aa (checkOverlappingChats +
//   recordLive + removeHiddenChats), kuten oikea korjaus tekee. Kasvuun ei kosketa: se on clientin.
//   Oikeassa kuplassa jonka chat.height on jo vanha-suurempi kun skripti käynnistyy (zoomattu ennen skriptiä) tehdään sama korjaus kertaalleen (catch-up).
//   Reunatapaus (kupla ajettu widgetin oikeaan reunaan, clientin "keep the measured size" -haara) ohitetaan kuten clientissä.
// ITSESAMMUTUS (kp 7.11. "disabloituu jos livessä"-linja): havainto on MITTAUS, ei lippu. Oma ResizeObserver luodaan vasta kun solmu on nähty yhden skannauksen
//   ajan, eli clientin oma observer (luodaan kuplan mountissa) on jo olemassa ja sen callback ajetaan ennen omaamme. Kun oma observer näkee kuplan PIENENEVÄN
//   (offsetHeight < edellinen nähty) ja chat.height on jo uuden korkeuden tasolla, client päivitti sen itse (PR 850 livenä): natiivi = true, loki kerran, kaikki pois.
//   Vanhalla clientillä chat.height >= edellinen nähty > uusi korkeus, joten yhtäsuuruus ei voi syntyä ilman clientin korjausta. Jos järjestys silti olisi toinen,
//   korjaus on idempotentti (oma päivitys tekee clientin callbackin amount-nollaksi), ei kaksinkertaista laskua.
// RAJA: katsoo vain korkeuden pienenemistä. Jos clientin rakenne muuttuu (chat-kentät, fiberin props) skripti loggaa tila.loki:iin ja pysähtyy (tila.tuntematon).
// SIIVOUS: huoneesta lähtö EI pysäytä (kaikki-lista), tila.pois()/uudelleenajo/natiivi pysäyttää: observerit pois, ajastin pois. Kuplien tilaan ei jää mitään
//   palautettavaa: korjaus on tavallinen chat.top/chat.height, jonka client olisi itse asettanut.
if (window.__huoneKuplaGap) { try { window.__huoneKuplaGap.pois(); } catch (e) {} }
const tila = window.__huoneKuplaGap = { versio: 'kupla-gap-1.0.0', natiivi: false, tuntematon: false, pysaytetty: false, korjauksia: 0, liitetty: 0, loki: [], pois() {}, poistu() {} };
const loki = s => { tila.loki.push(new Date().toTimeString().slice(0, 8) + ' ' + s); if (tila.loki.length > 50) tila.loki.shift(); };

const VAHAN = 'nitro-chat-widget';
const RESTING_MIN = -1, RESTING_MAX = 2;   // ChatResize.ts: kuinka kaukana ylempi kupla voi olla ja silti "lepää" alemman päällä

const fiberAvain = el => Object.keys(el).find(k => k.indexOf('__reactFiber') === 0);
// ChatWidgetMessageView:n fiber (props: chat, makeRoom, onGrow). Fiberillä on kaksi puuta (alternate): valitaan se jonka juuri on current.
const komponentti = el => {
    const k = fiberAvain(el); if (!k) return null;
    const hae = f0 => { for (let f = f0; f; f = f.return) if (f.memoizedProps && f.memoizedProps.chat && typeof f.type !== 'string') return f; return null; };
    const a = hae(el[k]); if (!a) return null;
    const b = a.alternate; if (!b) return a;
    const juuri = f => { for (; f.return; f = f.return); return f; };
    const cur = f => { const r = juuri(f); return !!(r.stateNode && r.stateNode.current === r); };
    return cur(a) ? a : (cur(b) ? b : a);
};
const kuplaTyyppi = c => !!c && typeof c.top === 'number' && typeof c.height === 'number' && typeof c.width === 'number' && typeof c.left === 'number' && typeof c.drawnLeft === 'number';
const sama = (a, b) => !((a.drawnLeft + a.width) < b.drawnLeft || a.drawnLeft > (b.drawnLeft + b.width));   // DoChatsShareColumn
const kaikki = () => [].slice.call(document.querySelectorAll('.' + VAHAN + ' > .bubble-container'));

// chatSettings.mode (0 = free flow) ChatWidgetView:n hookeista: RoomChatSettings-olio jolla on _mode ja _weight. Ei löydy -> free flow (oletus).
const vapaaVirta = el => {
    try {
        const w = el.parentElement; const k = fiberAvain(w); if (!k) return true;
        let f = w[k]; while (f && typeof f.type === 'string') f = f.return;
        for (let h = f && f.memoizedState, n = 0; h && n < 120; h = h.next, n++) {
            const s = h.memoizedState;
            if (s && typeof s === 'object' && !Array.isArray(s) && '_mode' in s && '_weight' in s) return s._mode === 0;
        }
    } catch (e) {}
    return true;
};

// ResizeChat.lowerRestingChats
const laske = (chat, chats, vanhaYla, maara, lasketut) => {
    for (const vanhempi of chats) {
        if (lasketut.indexOf(vanhempi) >= 0 || !sama(vanhempi, chat)) continue;
        const rako = vanhaYla - (vanhempi.top + vanhempi.height);
        if (rako < RESTING_MIN || rako > RESTING_MAX) continue;
        const ylaEnnen = vanhempi.top;
        vanhempi.top += maara;
        lasketut.push(vanhempi);
        laske(vanhempi, chats, ylaEnnen, maara, lasketut);
    }
};

const korjaa = (el, chat, h, w) => {
    const maara = chat.height - h;                       // pino uskoo kuplan olevan tämän verran korkeampi kuin se on
    const komp = komponentti(el);
    const lista = [];
    for (const e of kaikki()) { const k = komponentti(e); const c = k && k.memoizedProps.chat; if (kuplaTyyppi(c) && c.elementRef) lista.push(c); }   // DOM-järjestys = chatMessages-järjestys
    const ylaEnnen = chat.top;
    chat.height = h;
    chat.top = ylaEnnen + maara;
    if (vapaaVirta(el)) laske(chat, lista, ylaEnnen, maara, [chat]);
    else { const i = lista.indexOf(chat); for (let j = 0; j < i; j++) lista[j].top += maara; }
    tila.korjauksia++;
    const onGrow = komp && komp.memoizedProps && komp.memoizedProps.onGrow;
    if (typeof onGrow === 'function') { try { onGrow(chat, 0, 0); } catch (e) { loki('onGrow virhe: ' + e.message); } }
    loki('korjattu kupla ' + chat.id + ': ' + maara + ' px alas (korkeus ' + (h + maara) + ' -> ' + h + ')');
};

const seuranta = new WeakMap();   // el -> { h, w, ro }
const nahty = new WeakSet();
const observerit = new Set();

const reunassa = (el, chat, w) => { const p = el.parentElement; return !!p && w <= chat.width && (chat.left + w) >= (p.clientWidth - 1); };   // clientin "keep the measured size" -haara

const kasittele = (el, ensimmainen) => {
    if (tila.pysaytetty) return;
    const st = seuranta.get(el); if (!st) return;
    const h = el.offsetHeight, w = el.offsetWidth;
    const eiH = st.h, eiW = st.w; st.h = h; st.w = w;
    const komp = komponentti(el); const chat = komp && komp.memoizedProps.chat;
    if (!chat || chat.elementRef !== el) return;         // ei vielä mountattu loppuun
    if (!kuplaTyyppi(chat)) { tila.tuntematon = true; loki('chat-olion rakenne ei täsmää (kentät top/height/width/left/drawnLeft): pysähtyy'); pysayta(); return; }
    if (ensimmainen) {   // catch-up: zoomattu jo ennen skriptiä
        if (chat.height > h && !reunassa(el, chat, w)) korjaa(el, chat, h, w);
        return;
    }
    if (!(h < eiH)) return;                              // vain pienentyminen; kasvu on clientin
    if (reunassa(el, chat, eiW)) return;
    if (chat.height <= h) {                              // client ehti päivittää korkeuden itse = PR 850 livenä
        tila.natiivi = true; loki('client päivittää pienenevän kuplan korkeuden itse (chat.height ' + chat.height + ' = offsetHeight ' + h + '): pysähtyy'); pysayta(); return;
    }
    korjaa(el, chat, h, w);
};

const liita = el => {
    if (seuranta.has(el)) return;
    const st = { h: el.offsetHeight, w: el.offsetWidth, ro: null };
    seuranta.set(el, st);
    tila.liitetty++;
    let eka = true;
    st.ro = new ResizeObserver(() => { try { const e = eka; eka = false; kasittele(el, e); } catch (e) { loki('virhe: ' + e.message); } });
    observerit.add(st.ro);
    st.ro.observe(el);
};

let ajastin = 0;
const skannaa = () => {
    if (tila.pysaytetty) return;
    for (const el of kaikki()) {
        if (seuranta.has(el)) continue;
        if (nahty.has(el)) liita(el); else nahty.add(el);   // oma observer vasta toisella näkemällä: clientin oma on silloin jo luotu ja ajetaan ensin
    }
};

function pysayta() {
    tila.pysaytetty = true; clearInterval(ajastin);
    observerit.forEach(ro => { try { ro.disconnect(); } catch (e) {} }); observerit.clear();
}
tila.pois = () => { pysayta(); if (window.__huoneKuplaGap === tila) delete window.__huoneKuplaGap; };
tila.poistu = tila.pois;   // muut huoneskriptit kutsuvat edellisen kopion .poistu():lla

// Ensimmäinen skannaus liittää heti jo olemassa olevat kuplat (clientin observer on niille jo luotu kauan sitten); uudet kuplat vasta toisella näkemällä.
for (const el of kaikki()) { nahty.add(el); liita(el); }
ajastin = setInterval(skannaa, 500);
loki('asennettu ' + tila.versio);
return tila.pois;
