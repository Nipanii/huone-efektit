// Jaettu huoneskripti: ":67"-komento soittaa kirjoittajan hahmolle lyhyen "6-7"-tanssin (~990 ms) kaikille joilla huone-efektit ovat päällä.
// Res 28.10. 23:37 "tee skripti eka joka lisää ja soittaa ton emoten tolla :67 komennolla".
// Pohja: Oliverin lähdekooditason kuvaus (expression 67 -> oma tanssi `dance.sixseven`, kehykset DanceSixSevenAnimation.ts, timeout 990 ms).
//   Kehykset on otettu sellaisenaan (14 kehystä x leftarm/torso/head/rightarm, toiminnot Default/CarryItem/Talk, dx/dy ±1 px: ele on hento).
//   Palvelinosaa (expression 67 kaikuna) ei tarvita: animaatio rekisteröidään clientin omaan AvatarStructureen ajon aikana ja soitetaan paikallisesti.
// Miten: (1) animaatio rekisteröidään `dance.sixseven`-nimellä (+ alias `dance.67`, koska AvatarVisualization rakentaa avaimen
//   toiminto + '.' + parametri ja FIGURE_DANCE on numero: tanssi 67 -> `dance.67`). Rekisteröinti: vz._avatarImage._structure.registerAnimation({nimi: data})
//   (main-live AvatarStructure.ts:115 -> AnimationManager.registerAnimation, haku AvatarStructure.ts:224/342).
//   (2) oma ":67" (chat, huuto, kuiskaus) pudotetaan lähetyksestä send-koukulla (sama tekniikka kuin 656:n ":auto") eikä mene palvelimelle,
//   ja kuplaScripts-väylälle (aihe `tanssi67`) lähtee {t}. (3) jokainen client (lähettäjä omasta kaiustaan) hakee lähettäjän hahmon nimellä,
//   asettaa paikallisesti FIGURE_DANCE=67 (roomEngine.updateRoomObjectUserAction, ei pakettia) ~990 ms ja palauttaa entisen tanssin.
//   Kuplan oikea tila ei muutu: kukaan ei näe tanssia jolla ei ole moottoria.
// Jos rekisteröinti ei onnistu: varatanssi on clientin oma dance.1 samaksi ajaksi. Jos window.kuplaScripts puuttuu: soitetaan vain omalle clientille.
// Konsolista: tanssi67.soita('nimi') · tanssi67.loki
// RAJA: testattu VAIN robon clientissa (CDP 9223): rekisteröinti + soita('herra-robotti') + palautus + siivous, väylä ja send-koukku valeväylällä/valeviestillä
//   (ei yhtään pakettia palvelimelle). EI testattu: oikea kuplaScripts-kaiku toisen pelaajan kautta, oikea ":67" kirjoitettuna chattiin,
//   toisen pelaajan clientin näkymä, istuva/makaava hahmo, 656:n send-koukun kanssa siivousjärjestyksen kaikki permutaatiot.
const e0 = window.NitroDevTools && window.NitroDevTools.roomEngine;
const huone = () => (kupla && kupla.roomId && kupla.roomId()) || (e0 && e0.activeRoomId);
const NIMI = 'dance.sixseven', ALIAS = 'dance.67', NUMERO = 67, VARA = 1, KESTO = 2500, LASKU = 12, TAUKO = 800, AIHE = 'tanssi67', SANA = /^:67$/i;
const tila = window.tanssi67 = { versio: 'tanssi67', loki: [], rekisteroity: false };
// Oliverin kehykset tiiviisti: [leftarm, torso, head, rightarm], kukin 'T<kehys>,dx,dy,dd', T = D Default · C CarryItem · T Talk.
const OSAT = ['leftarm', 'torso', 'head', 'rightarm'], TOIMINTO = { D: 'Default', C: 'CarryItem', T: 'Talk' };
const KEHYKSET = [
  ['D0,-1,1,0', 'D0,0,0,0', 'D0,0,1,0', 'D0,1,1,0'],   ['C0,-1,0,0', 'D0,0,0,0', 'D0,0,0,0', 'C0,1,1,0'],
  ['C0,-1,1,0', 'D0,0,0,0', 'D0,0,1,0', 'C0,1,0,0'],   ['C0,-1,0,0', 'D0,0,0,0', 'D0,0,0,0', 'C0,1,-1,0'],
  ['C0,-1,-1,0', 'D0,0,0,0', 'T0,0,1,0', 'C0,1,0,0'],  ['C0,-1,0,0', 'D0,0,0,0', 'T1,0,0,1', 'C0,1,1,0'],
  ['C0,-1,1,0', 'D0,0,0,0', 'T0,0,0,1', 'C0,1,0,0'],   ['C0,-1,0,0', 'D0,0,0,0', 'T1,0,0,0', 'C0,1,-1,0'],
  ['C0,-1,-1,0', 'D0,0,0,0', 'T0,0,1,0', 'C0,1,0,0'],  ['C0,-1,0,0', 'D0,0,0,0', 'T1,0,0,0', 'C0,1,1,0'],
  ['C0,-1,1,0', 'D0,0,0,0', 'D0,0,1,0', 'C0,1,0,0'],   ['C0,-1,0,0', 'D0,0,0,0', 'D0,0,0,0', 'C0,1,-1,0'],
  ['D0,-1,1,0', 'D0,0,0,0', 'D0,0,1,0', 'D1,1,1,0'],   ['D0,-1,0,0', 'D0,0,0,0', 'D0,0,0,0', 'D0,1,0,0']];
const tieto = nimi => ({ name: nimi, desc: '67 meme gesture', frames: KEHYKSET.map(k => ({ bodyparts: k.map((p, i) => {
  const [kehys, dx, dy, dd] = p.slice(1).split(',').map(Number); return { id: OSAT[i], action: TOIMINTO[p[0]], frame: kehys, dx, dy, dd }; }) })) });

const dv = (o, k) => { const d = o && Object.getOwnPropertyDescriptor(o, k); return d && !d.get ? d.value : undefined; };
const sessio = () => { const sm = Object.getOwnPropertyDescriptor(e0, '_roomSessionManager'); return sm && sm.value && sm.value.getSession && sm.value.getSession(huone()); };
const omaIndeksi = () => { const s = sessio(), i = s && s.ownRoomIndex; return (i == null || i < 0) ? null : i; };
const omaNimi = () => { const s = sessio(), u = s && s.userDataManager && s.userDataManager.getUserDataByIndex(omaIndeksi()); return String((u && u.name) || '').toLowerCase(); };
const hahmot = () => { try { return (e0 && e0.getRoomObjects(huone(), 100)) || []; } catch (x) { return []; } };
const hahmoNimella = nimi => { const s = sessio(), um = s && s.userDataManager; if (!um) return null;
  for (const o of hahmot()) { const u = um.getUserDataByIndex(o.id); if (u && String(u.name || '').toLowerCase() === nimi) return o; } return null; };

// Rekisteröinti: rakenne löytyy mistä tahansa hahmon visualisaatiosta (kaikilla sama AvatarStructure).
let rakenne = null, omat = new Map();   // nimi -> Animation-olio jonka rekisteröimme (siivous poistaa vain ne)
const rekisteroi = () => { try {
  if (rakenne && tila.rekisteroity) return true;
  for (const o of hahmot()) { const st = dv(dv(o.visualization, '_avatarImage'), '_structure'); if (st && typeof st.registerAnimation === 'function') { rakenne = st; break; } }
  if (!rakenne) return false;
  for (const n of [NIMI, ALIAS]) { rakenne.registerAnimation({ [n]: tieto(n) }); const a = rakenne.getAnimation(n); if (a) omat.set(n, a); }
  tila.rekisteroity = omat.size === 2; tila.loki.push({ rekisteroity: [...omat.keys()], kehyksia: KEHYKSET.length }); return tila.rekisteroity;
} catch (x) { tila.loki.push({ rekisterointi: 'virhe', viesti: String(x) }); return false; } };
let yritys = 0; const rekAjastin = setInterval(() => { if (rekisteroi() || ++yritys > 30) clearInterval(rekAjastin); }, 1000); rekisteroi();

// Soitto: paikallinen FIGURE_DANCE (ei pakettia), palautus KESTO ms jälkeen. Rajoitus 1 / 2 s lähettäjää kohti.
const viimeksi = new Map(), soi = new Map();   // nimi -> aika · hahmo-id -> { ajastin, talteen }
const lopeta = id => { const s = soi.get(id); if (!s) return; clearTimeout(s.ajastin); clearInterval(s.vahti); soi.delete(id);
  try { const o = e0.getRoomObject(huone(), id, 100); if (o && (o.model.getValue('figure_dance') || 0) === s.numero) e0.updateRoomObjectUserAction(huone(), id, 'figure_dance', s.talteen); } catch (x) {} };
// kp 28.10. 23:57 "togglee on/off", sitten 29.10. 00:04 "laitetaanko loop pois" (Oliver: "emt miks 67 looppaa"): yksi :67 soittaa kerran (KESTO) ja loppuu itse; :67 kesken tanssin sammuttaa heti.
const soita = (nimi, paalla = true) => { try {
  const n = String(nimi || '').toLowerCase(), nyt = Date.now();
  if (!n) return false; if (nyt - (viimeksi.get(n) || 0) < TAUKO) { tila.loki.push({ ohi: n, syy: 'tauko' }); return false; }
  const o = hahmoNimella(n); if (!o) { tila.loki.push({ ohi: n, syy: 'ei hahmoa huoneessa' }); return false; }
  viimeksi.set(n, nyt);
  if (!paalla) { lopeta(o.id); tila.loki.push({ sammuta: n, id: o.id }); return true; }
  const numero = rekisteroi() ? NUMERO : VARA;
  if (soi.has(o.id)) lopeta(o.id);
  const talteen = o.model.getValue('figure_dance') || 0;
  if (!e0.updateRoomObjectUserAction(huone(), o.id, 'figure_dance', numero)) { tila.loki.push({ ohi: n, syy: 'updateRoomObjectUserAction false' }); return false; }
  // Oliver 29.10. 00:05 "lopeta loop ku kädet laskeutuu ekan kerran": avatarin _frameCounter on jatkuva (mitattu ~12/s) eikä nollaudu tanssin alussa,
  // joten tanssi alkoi satunnaisesta kehyksestä. Nollataan se ja lopetetaan kun kehys LASKU (ensimmäinen kädet alas -kehys) on näkynyt. KESTO on varakatkaisu.
  const ai = dv(o.visualization, '_avatarImage');
  try { if (ai && typeof ai.resetAnimationFrameCounter === 'function') ai.resetAnimationFrameCounter(); else if (ai && typeof dv(ai, '_frameCounter') === 'number') ai._frameCounter = 0; } catch (x) {}
  const vahti = setInterval(() => { try { const f = dv(ai, '_frameCounter'); if (typeof f === 'number' && f >= LASKU + 1) lopeta(o.id); } catch (x) {} }, 40);
  soi.set(o.id, { numero, talteen, vahti, ajastin: setTimeout(() => lopeta(o.id), KESTO) });
  tila.loki.push({ soita: n, id: o.id, numero, talteen }); return true;
} catch (x) { tila.loki.push({ soita: 'virhe', viesti: String(x) }); return false; } };
tila.soita = soita;

// Väylä: oma ":67" -> kuplaScripts; ilman väylää paikallisesti.
const ks = window.kuplaScripts; let ksPois = null;
const laheta = () => { const oma = omaNimi(), h = hahmoNimella(oma), paalla = !(h && soi.has(h.id)); tila.loki.push({ laheta: oma, paalla, kanava: !!ks });
  if (!ks) { soita(oma, paalla); return; }
  try { ks.send(AIHE, JSON.stringify({ t: Date.now(), paalla })); } catch (x) { tila.loki.push({ kanava: 'virhe', viesti: String(x) }); soita(oma, paalla); } };
if (ks) try { ks.subscribe(AIHE);
  ksPois = ks.on('message', m => { try { if (!m || m.topic !== AIHE) return; let d = {}; try { d = JSON.parse(m.data || m.payload || '{}') || {}; } catch (x) {}
    tila.loki.push({ saatu: m.senderName, paalla: d.paalla !== false }); soita(m.senderName, d.paalla !== false); } catch (x) {} });
} catch (x) { tila.loki.push({ kanava: 'virhe', viesti: String(x) }); }

// Send-koukku (656:n kavelyEsto): pudottaa oman ":67"-viestin (chat/huuto [viesti, tyyli, väri]; kuiskaus ['nimi viesti', tyyli] = 2 kenttää).
// Aktiivinen-lippu: jos toinen skripti ehti koukuttaa päälle emmekä voi irrottaa, koukku jää läpikulkevaksi siivouksen jälkeen.
let aktiivinen = true, yhteysOlio = null, koukkuOma = null, koukkuAlkup = null;
const yhteys = () => { const nahty = new Set(); let c = null;
  const etsi = (o, d) => { if (!o || c || d > 4 || typeof o !== 'object' || nahty.has(o)) return; nahty.add(o);
    if (Object.getOwnPropertyDescriptor(o, '_cryptoState')) { c = o; return; }
    for (const k of Object.getOwnPropertyNames(o)) { const de = Object.getOwnPropertyDescriptor(o, k); if (de && !de.get && de.value && typeof de.value === 'object') etsi(de.value, d + 1); } };
  etsi(dv(e0, '_roomSessionManager'), 0); return c; };
const onSana = x => { const a = x && typeof x.getMessageArray === 'function' && x.getMessageArray(); if (!Array.isArray(a) || typeof a[0] !== 'string') return false;
  const s = a[0].trim(); return SANA.test(s) || (a.length === 2 && typeof a[1] === 'number' && /^\S+ :67$/i.test(s)); };
const koukku = () => { const c = yhteys(); if (!c || typeof c.send !== 'function' || yhteysOlio === c) return;
  const alkup = c.send;
  const oma = function (...k) { if (aktiivinen) try { const n = k.length; k = k.filter(x => !onSana(x)); if (k.length < n) { laheta(); if (!k.length) return true; } } catch (x) {}
    return alkup.apply(this, k); };
  c.send = oma; yhteysOlio = c; koukkuOma = oma; koukkuAlkup = alkup; };
// 2 s välein, koska uudelleenyhdistys tuo uuden yhteysolion.
const koukkuAjastin = setInterval(() => { try { koukku(); } catch (x) {} }, 2000); try { koukku(); } catch (x) {}

return () => {
  aktiivinen = false;
  clearInterval(rekAjastin); clearInterval(koukkuAjastin);
  for (const id of [...soi.keys()]) lopeta(id);
  try { if (typeof ksPois === 'function') ksPois(); if (ks) ks.unsubscribe(AIHE); } catch (x) {}
  try { if (yhteysOlio && yhteysOlio.send === koukkuOma) { if (koukkuAlkup === Object.getPrototypeOf(yhteysOlio).send) delete yhteysOlio.send; else yhteysOlio.send = koukkuAlkup; } } catch (x) {}
  try { const am = rakenne && dv(rakenne, '_animationManager'), m = am && (am.animations || dv(am, '_animations')); if (m) for (const [n, a] of omat) if (m.get(n) === a) m.delete(n); } catch (x) {}
  if (window.tanssi67 === tila) delete window.tanssi67;
};
