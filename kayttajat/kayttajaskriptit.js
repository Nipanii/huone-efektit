// Käyttäjäkohtaiset skriptit (versio 0.2.1). Moottori (0.6.2+) ajaa tämän kaikissa huoneissa huoneet.json:n "kaikki"-listalta.
// Tämä skripti sisältää KAIKEN käyttäjälogiikan; moottori ei tiedä kenestäkään mitään (kp 28.10. 15:07-15:12 "lisää res whitelistille",
//   "ja se auto updatee", "whitelist ei saa välttämättä antaa kaikkia scriptejä yhdelle henkilölle").
// Hakee 15 s välein kayttajat.json:n samasta Pagesista: { ryhmat: [ { nimi, kayttajat: [id], skriptit: [{ polku, globaali }] } ] }.
//   Oman id:n skriptit = niiden ryhmien skriptien yhdiste, joissa oma id on. Ei muuta.
// Per skripti: globaali puuttuu -> ajetaan. Globaalilla on versio ja se on vanhempi kuin haettu @version -> globaali.pois(), sitten ajetaan
//   (jos pois() puuttuu: jätetään käyntiin ja merkitään "vaatii uudelleenlatauksen"). Sama tai uudempi -> ei kosketa (kp:n lataaja voi olla uudempi).
//   Globaali ilman versiota (esim. true) = versio tuntematon -> ei kosketa, paitsi jos tämä skripti itse käynnisti sen (silloin tunnetaan ajettu @version).
// Pysäytys (moottori kutsuu): pysäyttää haun ja kutsuu pois() vain niille instansseille, jotka TÄMÄ käynnisti.
// Tila: window.kayttajaskriptit = { versio, id, ajossa: {polku: versio}, vaatiiLatauksen: [polku], virhe, haettu, tiedosto, paivita() }.
// OPT-IN (0.2.0, kp 30.10. 01:13 "betamese opt in kans · eli oletuksena off. :betamese laittaa pääl"; Res 01:14 "infektoitiin sillä mitään kysymättä"):
//   ryhmä jolla "optin": "<nimi>" ajetaan vain kun localStorage kupla-optin-<nimi> = 'on' (oletus pois). Chat-komento :<nimi> vaihtaa tilan
//   (Enter kaapataan ennen peliä kuten moottorin :hw, rivi ei lähde palvelimelle) ja vain jos oma id on sen ryhmässä; muille rivi menee chattiin.
//   Pois kytkettäessä TÄMÄN käynnistämät skriptit pysäytetään pois():lla; muualta käynnistetyt (esim. kp:n lataaja) jäävät ennalleen.
// Testikäyttö: window.kayttajaskriptitTiedosto = 'kayttajat-testi.json' ennen käynnistystä.
const POHJA = 'https://nipanii.github.io/huone-efektit/';
const VERSIO = '0.2.1';
const S = { versio: VERSIO, id: 0, ajossa: {}, vaatiiLatauksen: [], virhe: null, haettu: null, tiedosto: window.kayttajaskriptitTiedosto || 'kayttajat.json', pysaytetty: false };
const omat = {};   // polku -> { globaali, versio, g }  (vain TÄMÄN käynnistämät)
try { if (window.kayttajaskriptit && typeof window.kayttajaskriptit.pysayta === 'function') window.kayttajaskriptit.pysayta(); } catch (e) {}
window.kayttajaskriptit = S;

const dvh = (o, k) => { const d = o && Object.getOwnPropertyDescriptor(o, k); return d && !d.get ? d.value : undefined; };
const omaId = () => { const re = window.NitroDevTools && window.NitroDevTools.roomEngine, u = dvh(dvh(re, '_sessionDataManager'), '_userId'); return u > 0 ? u : 0; };
const uudempi = (a, b) => { const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); return false; };
const hae = async (polku) => { const v = await fetch(POHJA + polku + '?t=' + Date.now(), { cache: 'no-store' });
  if (!v.ok) throw new Error('HTTP ' + v.status + ' ' + polku); return v.text(); };
const virhe = (viesti) => { S.virhe = { viesti: String(viesti), aika: new Date().toTimeString().slice(0, 8) }; console.warn('[kayttajaskriptit] ' + viesti); };
const poisKutsu = (g) => { try { g.pois(); return true; } catch (e) { virhe('pois() kaatui: ' + e); return true; } };
const optinAvain = (n) => 'kupla-optin-' + n;
const optinPaalla = (n) => { try { return localStorage.getItem(optinAvain(n)) === 'on'; } catch (e) { return false; } };
let optinRyhmat = {};   // optin-nimi -> [id], viimeisimmästä kayttajat.json:sta
const merkitseLatauksen = (p, on) => { const i = S.vaatiiLatauksen.indexOf(p); if (on && i < 0) S.vaatiiLatauksen.push(p); if (!on && i >= 0) S.vaatiiLatauksen.splice(i, 1); };

const pysaytaOma = (p) => {
  const o = omat[p]; if (!o) return; delete omat[p]; delete S.ajossa[p]; merkitseLatauksen(p, false);
  const g = window[o.globaali];
  if (g && g === o.g && typeof g.pois === 'function') { poisKutsu(g); if (window[o.globaali] === g) { try { delete window[o.globaali]; } catch (e) {} } }
};

const kasittele = async (p, globaali) => {
  const koodi = await hae(p);
  const v = ((koodi.match(/\/\/\s*@version\s+([^\r\n]+)/) || [])[1] || '').trim();
  const nyt = window[globaali];
  const oma = omat[p];
  if (nyt !== undefined) {
    const tunnettu = (nyt && typeof nyt.versio === 'string' && nyt.versio) || (oma && oma.g === nyt && oma.versio) || '';
    if (!tunnettu || !v || !uudempi(v, tunnettu)) { if (oma && oma.g !== nyt) delete omat[p]; return; }   // tuntematon, sama tai uudempi: ei kosketa
    if (typeof nyt.pois !== 'function') { merkitseLatauksen(p, true); return; }   // ei voi pysäyttää: jää käyntiin
    poisKutsu(nyt);
    if (window[globaali] === nyt) { try { delete window[globaali]; } catch (e) {} }
    delete omat[p]; delete S.ajossa[p]; merkitseLatauksen(p, false);
  }
  if (S.pysaytetty) return;
  try { (0, eval)(koodi); }
  catch (e) { virhe(p + ' kaatui: ' + e); return; }
  omat[p] = { globaali, versio: v, g: window[globaali] }; S.ajossa[p] = v; merkitseLatauksen(p, false);
};

let kesken = false;
S.paivita = async () => {
  if (S.pysaytetty || kesken) return; kesken = true;
  try {
    S.id = omaId(); S.haettu = new Date().toTimeString().slice(0, 8);
    if (!S.id) return;
    let j; try { j = JSON.parse(await hae(S.tiedosto)); } catch (e) { virhe('haku ' + S.tiedosto + ': ' + e); return; }
    const mina = new Map();   // polku -> globaali; oman id:n ryhmien yhdiste
    optinRyhmat = {};
    for (const r of (j.ryhmat || [])) if (r.optin) (optinRyhmat[r.optin] = optinRyhmat[r.optin] || []).push(...(r.kayttajat || []));
    S.optin = {}; for (const n of Object.keys(optinRyhmat)) if (optinRyhmat[n].includes(S.id)) S.optin[n] = optinPaalla(n);
    for (const r of (j.ryhmat || [])) if ((r.kayttajat || []).includes(S.id) && (!r.optin || optinPaalla(r.optin))) for (const s of (r.skriptit || [])) if (s && s.polku && !mina.has(s.polku)) mina.set(s.polku, s.globaali);
    for (const p of Object.keys(omat)) if (!mina.has(p)) pysaytaOma(p);   // poistettu oikeus tai skripti
    for (const [p, g] of mina) { if (S.pysaytetty) break; try { await kasittele(p, g); } catch (e) { virhe(p + ': ' + e); } }
  } finally { kesken = false; }
};
const KENTTA = 'input.nitro-chat-input-control';
const ilmoita = (el, teksti) => {   // erillinen toast: chat-kentän placeholder (pelaajamäärä) jää rauhaan (Res 30.10. 01:20)
  const r = el.getBoundingClientRect(), d = document.createElement('div'); d.textContent = teksti;
  d.style.cssText = 'position:fixed;z-index:99999;left:' + Math.round(r.left) + 'px;top:' + Math.round(r.top - 34) + 'px;padding:4px 10px;border-radius:6px;background:rgba(20,20,30,.9);color:#fff;font:12px sans-serif;pointer-events:none';
  document.body.appendChild(d); setTimeout(() => d.remove(), 3000); console.info('[kayttajaskriptit] ' + teksti); };
const kuule = (ev) => {
  if (ev.key !== 'Enter' && ev.key !== 'NumpadEnter') return;
  const el = ev.target; if (!(el instanceof HTMLInputElement) || !el.matches(KENTTA)) return;
  const m = (el.value || '').trim().match(/^:([a-z0-9_-]+)$/i); if (!m) return;
  const n = m[1].toLowerCase(), id = omaId(); if (!optinRyhmat[n] || !optinRyhmat[n].includes(id)) return;
  ev.preventDefault(); ev.stopImmediatePropagation();
  const uusi = !optinPaalla(n); try { localStorage.setItem(optinAvain(n), uusi ? 'on' : 'off'); } catch (e) {}
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ''); el.dispatchEvent(new Event('input', { bubbles: true }));
  ilmoita(el, n + ': ' + (uusi ? 'päällä' : 'pois') + (uusi ? '' : ' (F5 jos jotain jäi näkyviin)'));
  S.paivita();
};
addEventListener('keydown', kuule, true);
S.pysayta = () => { S.pysaytetty = true; clearInterval(S._tiki); removeEventListener('keydown', kuule, true); for (const p of Object.keys(omat)) pysaytaOma(p); if (window.kayttajaskriptit === S) delete window.kayttajaskriptit; };
S._tiki = setInterval(S.paivita, 15000);
S.paivita();
return S.pysayta;
