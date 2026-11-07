// Huoneskripti: historiapaneelin (pull-down, kuplan veto alas) kuplat zoomaavat UI-zoomin mukana (huone 424, B219, kp 7.11. 13:23 "Laita b219 huone korjauksena zen deniin
//   testiksi" · "Siis korjaa se zen deniin"). Tyyliskripti, ei logiikkaa: yksi <style>, joka antaa historiakuplille saman zoomin kuin eläville.
// MIKSI: clientin UI-zoom (UiZoom.scss:19-20, kupla-cc 3796edac) zoomaa vain `.nitro-chat-widget > .bubble-container > *`. Historiapaneelin rivit ovat
//   `.nitro-chat-pulldown`:n alla (ChatHistoryPulldownView.tsx), joten mikään UiZoom.scss:n valitsin ei osu niihin: sama viesti on tasolla 1.6 elävänä 560 px leveä ja
//   historiassa 350 px (mitattu 7.11. 12:42 robolla, osoitin 1.6 = taso).
// MITEN: kaksi sääntöä, molemmat vain kun juuri kantaa data-kupla-ui-zoom (kuten clientin oma sääntö), taso luetaan clientin --kupla-ui-zoom -muuttujasta:
//   1) `.nitro-chat-pulldown .chat-pulldown-bubble > * { zoom: var(--kupla-ui-zoom) }`: sama kuin eläville. Kontti itse ei zoomaa (sen left/bottom ovat paneelin
//      px-koordinaatteja, kuten UiZoom.scss:n kommentti sanoo elävistä), sisältö kasvaa kontin sisällä ja kontti mitoittuu sisällön mukaan, joten paneelin asettelu
//      (offsetWidth/offsetHeight, ChatHistoryPulldownView.tsx:416,429) näkee zoomatun koon.
//   2) `.pointer { left: calc(var(--chat-pulldown-pointer-x, 50%) / var(--kupla-ui-zoom)) }`: kuplan häntä on .chat-bubblen sisällä ja sen left on paneelin px:nä
//      (ChatHistoryPulldownView.scss:73-76), joten zoomattu kupla kertoisi sen 1.6:lla ja häntä osoittaisi väärään kohtaan. Jaetaan zoomilla.
// ITSESAMMUTUS (kp 7.11. "disabloituu jos livessä"-linja): kun client zoomaa historiakuplat itse, tämä pysähtyy ja poistaa tyylinsä. Havainto on MITTAUS, ei lippu:
//   oma tyyli kytketään hetkeksi pois (sama synkroninen jakso, ei ruudunpäivitystä välissä), luetaan historiakuplan zoom-ketju (computed zoom kaikilta esivanhemmilta
//   kerrottuna), ja palautetaan. Jos ketju on jo UI-zoomin tasolla ilman meitä, client hoitaa asian. Kohde on oikea historiakupla jos paneeli on auki, muuten
//   piilotettu koekupla jolla on sama DOM-rakenne ja sama vanhempi kuin oikealla paneelilla. Mittaus käynnistyksessä (ennen kuin paneeli ehtii aueta) ja 5 s välein.
//   Päätös kirjataan kerran tila.loki:in, tila.natiivi = true.
// SIIVOUS: huoneesta lähtö (moottori kutsuu paluuarvoa), tila.pois() ja uudelleenajo poistavat tyylin ja ajastimen. UI-zoomin tasoon ei kosketa.
// RAJA: katsoo vain zoomia. Jos clientin tuleva korjaus tekee historiakuplista toisen kokoisia muulla tavalla (esim. suoraan fonttikoolla), mittaus ei tunnista sitä
//   ja kuplat voivat zoomautua kahdesti: silloin skripti pois huone 424:n listalta (huoneet.json).
if (window.__huoneHistoriaZoom) { try { window.__huoneHistoriaZoom.pois(); } catch (e) {} }
const TYYLI_ID = 'huone-historia-zoom-tyyli';
const MUUTTUJA = '--kupla-ui-zoom';
const SAANTO =
    ':root[data-kupla-ui-zoom] .nitro-chat-pulldown .chat-pulldown-bubble > * { zoom: var(' + MUUTTUJA + '); }\n' +
    ':root[data-kupla-ui-zoom] .nitro-chat-pulldown .chat-pulldown-bubble .pointer { left: calc(var(--chat-pulldown-pointer-x, 50%) / var(' + MUUTTUJA + ')); }';

const tila = window.__huoneHistoriaZoom = { versio: 'historia-zoom-1.0.0', natiivi: false, pysaytetty: false, loki: [], mittaus: null, pois() {}, poistu() {} };
const loki = s => { tila.loki.push(new Date().toTimeString().slice(0, 8) + ' ' + s); if (tila.loki.length > 50) tila.loki.shift(); };

const juuri = document.documentElement;
const taso = () => { const v = parseFloat(getComputedStyle(juuri).getPropertyValue(MUUTTUJA)); return (isFinite(v) && v > 0) ? v : 1; };
const ketju = el => { let z = 1; for (; el; el = el.parentElement) { const v = parseFloat(getComputedStyle(el).zoom); if (isFinite(v) && v > 0) z *= v; } return z; };

let tyyli = null;
const asenna = () => {
    tyyli = document.createElement('style'); tyyli.id = TYYLI_ID; tyyli.textContent = SAANTO;
    (document.head || juuri).appendChild(tyyli);
};
const kytke = paalla => { if (tyyli && tyyli.sheet) tyyli.sheet.disabled = !paalla; };

// historiakuplan zoom-ketju ilman omaa tyyliä: oikea kupla jos paneeli on auki, muuten koekupla paneelin omaan vanhempaan (poistetaan heti)
const mittaaIlmanOmaa = () => {
    const oikea = document.querySelector('.nitro-chat-pulldown .chat-pulldown-bubble > .chat-bubble');
    let koe = null, kohde = oikea;
    if (!kohde) {
        koe = document.createElement('div'); koe.className = 'nitro-chat-pulldown';
        koe.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;pointer-events:none';
        koe.innerHTML = '<div class="chat-pulldown-list"><div class="chat-pulldown-canvas"><div class="bubble-container visible chat-pulldown-bubble"><div class="chat-bubble"></div></div></div></div>';
        (document.querySelector('.roomView-background') || document.body).appendChild(koe);
        kohde = koe.querySelector('.chat-bubble');
    }
    kytke(false);
    try { return { ketju: ketju(kohde), lahde: oikea ? 'paneeli' : 'koe' }; }
    finally { kytke(true); if (koe) koe.remove(); }
};

let ajastin = 0;
const pysayta = () => { tila.pysaytetty = true; clearInterval(ajastin); if (tyyli) { tyyli.remove(); tyyli = null; } };
const tarkista = () => {
    if (tila.pysaytetty || !tyyli) return;
    try {
        const t = taso();
        if (!juuri.hasAttribute('data-kupla-ui-zoom') || Math.abs(t - 1) < 0.01) return;   // UI-zoomia ei ole: ei mitattavaa, oma sääntö ei vaikuta
        const m = tila.mittaus = Object.assign({ taso: t }, mittaaIlmanOmaa());
        if (Math.abs(m.ketju - t) < 0.02) { tila.natiivi = true; loki('client zoomaa historiakuplat jo (ketju ' + m.ketju + ' = taso ' + t + ', ' + m.lahde + '): pysähtyy'); pysayta(); }
    } catch (e) { loki('mittaus virhe: ' + e.message); }
};

tila.pois = () => { pysayta(); if (window.__huoneHistoriaZoom === tila) delete window.__huoneHistoriaZoom; };
tila.poistu = tila.pois;   // kupla-seuraa.js ja muut huoneskriptit kutsuvat edellisen kopion .poistu():lla

asenna();
tarkista();
if (!tila.pysaytetty) { ajastin = setInterval(tarkista, 5000); loki('asennettu ' + tila.versio); }
return tila.pois;
