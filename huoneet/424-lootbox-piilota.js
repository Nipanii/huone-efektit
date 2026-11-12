// Huoneskripti 424 zen den: piilottaa kp:n (kurkkupomo) ja Ezkeyn lootbox-avausten animaation (lähtölaskenta, kela, otsikko) KAIKILTA MUILTA. Muiden avaukset näkyvät kaikille kuten ennen.
// kp 12.11. 09:17-09:23 whisper "voiks piilottaa muilta mun ja ezin boxit · zen denis · kaikki elementit piiloo" + "mun ja ezin ei näy · muiden näkyy" (ensimmäinen versio käänsi tämän väärin päin: piilotti kaikkien muiden avaukset).
// MITEN: clientin .lootbox-ceremony-elementit (LootboxCeremonyView.tsx:202) saavat otsikon "<nimi> avaa lootboxin" (rivit 141/192) ja tuloksen "<nimi> sai: ..." (185).
//   Oletus: jokainen .lootbox-ceremony piilossa (display:none) kunnes otsikko on luettu; näkyviin vasta kun avaaja EI ole piilotettavien listalla (data-kls-ok).
// RAJA: overlayn tunnistus on otsikon NIMELLÄ (DOM ei kanna omistajan id:tä). Laatikko-esine piilotetaan sprite.visible=false:lla (omistajan nimi + laatikko-tyyppi), vain tämän clientin näkymässä. Ei kosketa palvelimeen.
const PIILOTETUT_NIMET = ['kurkkupomo', 'ezkey'];   // kp (282), Ezkey (123)
const SALLITUT_KATSOJAT = [282, 123];                 // heillä oma näkymä normaalina
const d = (o, k) => { const x = o && Object.getOwnPropertyDescriptor(o, k); return x && !x.get ? x.value : undefined; };
const sdm = () => { try { return d(window.NitroDevTools && window.NitroDevTools.roomEngine, '_sessionDataManager'); } catch (x) { return null; } };
const omaId = () => { try { const u = d(sdm(), '_userId'); return u > 0 ? u : 0; } catch (x) { return 0; } };
if (SALLITUT_KATSOJAT.includes(omaId())) return () => {};
const tyyli = document.createElement('style');
tyyli.id = 'kls-piilota-tyyli';
tyyli.textContent = '.lootbox-ceremony:not([data-kls-ok]){display:none!important}';
document.head.appendChild(tyyli);
const tarkista = () => {
  document.querySelectorAll('.lootbox-ceremony').forEach((el) => {
    const cap = el.querySelector('.lootbox-caption');
    const t = (cap && cap.textContent || '').trim().toLowerCase();
    if (!t) return;                                                       // otsikko ei vielä luettavissa -> pysyy piilossa
    const nimi = t.split(/\s+(avaa|sai)\b/)[0];                          // "<nimi> avaa lootboxin" / "<nimi> sai: ..."
    if (PIILOTETUT_NIMET.includes(nimi)) el.removeAttribute('data-kls-ok'); else el.setAttribute('data-kls-ok', '1');
  });
};
// Lahjapaketti-esine (kp 09:30 "PIILOTA SE ESINE" + 09:31 "jos se filtteröi meidän nimil · muuten ei"): vain LAATIKKO-spritet joiden omistaja on kp tai Ezkey.
// Mitattu robolla: object.model.getValue('furniture_owner_name'|'furniture_type_id') toimii; sprite.visible=false -> getRoomObjectBoundingRectangle [0,0], palautus palauttaa; visualization._alphaMultiplier EI vaikuta.
const LAATIKKO_TYYPIT = new Set([2100114949, 2100114978, 2100114948, 2100101136, 2100101806, 2100101858, 2100101811, 10322]);
// 09:50: pelkkä s.visible=false setInterval:lla EI riittänyt: renderöijä asettaa visible=true joka framella ja piirtää ennen seuraavaa tikkiä (kp:n kuva: paketti näkyi robon clientissä vaikka rect [0,0]).
// Siksi visible lukitaan getterillä joka palauttaa aina false; asetus ohitetaan. Siivous poistaa getterin ja palauttaa arvon.
// 09:58 (Opus): pelkkä getter EI riittänyt: piirtäjä käyttää välimuistia joka päivittyy vain kun spriten _updateCounter / visualisaation
//   _updateSpriteCounter kasvaa, ja getter ohitti asettimen joka niitä kasvattaa (mitattu: vis false mutta _visible true, laskurit paikallaan, paketti kuvassa).
//   Siksi myös _visible=false + laskurit eteenpäin. A-B robolla 09:57: _visible true + laskuri -> paketti kuvassa, _visible false + laskuri -> ei (gw, rinnakkaiskuva).
const lukitse = (s) => { try { if (!s.__klsLukittu) { s.__klsLukittu = true; Object.defineProperty(s, 'visible', { configurable: true, get: () => false, set: () => {} }); }
  if (s._visible !== false) { s._visible = false; s._updateCounter = (s._updateCounter | 0) + 1; return true; } } catch (x) {} return false; };
const vapauta = (s) => { if (!s.__klsLukittu) return; try { delete s.visible; s._visible = false; s.visible = true; s._updateCounter = (s._updateCounter | 0) + 1; } catch (x) {} delete s.__klsLukittu; };
const piilotetut = new Map();   // objekti-id -> visualisaatio
const spritet = (v) => (v && (v._sprites || v.sprites)) || [];
const piilotaLaatikot = () => {
  try {
    const re = window.NitroDevTools && window.NitroDevTools.roomEngine; if (!re) return;
    const rid = re.activeRoomId; if (!(rid > 0)) return;
    const nakyvilla = new Set();
    for (const o of (re.getRoomObjects(rid, 10) || [])) {
      const m = o.model; if (!m) continue;
      const tyyppi = m.getValue('furniture_type_id'); if (!LAATIKKO_TYYPIT.has(tyyppi)) continue;
      const omistaja = String(m.getValue('furniture_owner_name') || '').toLowerCase(); if (!PIILOTETUT_NIMET.includes(omistaja)) continue;
      const v = o.visualization; if (!v) continue;
      nakyvilla.add(o.id); piilotetut.set(o.id, v);
      let muuttui = false; spritet(v).forEach((s) => { if (lukitse(s)) muuttui = true; });
      if (muuttui) v._updateSpriteCounter = (v._updateSpriteCounter | 0) + 1;
    }
    for (const [id, v] of piilotetut) if (!nakyvilla.has(id)) { spritet(v).forEach(vapauta); v._updateSpriteCounter = (v._updateSpriteCounter | 0) + 1; piilotetut.delete(id); }
  } catch (x) {}
};
const ajastin = setInterval(piilotaLaatikot, 50);
// Uusi paketti tulee ~9,5 s välein (mitattu langalta: FURNITURE_FLOOR_REMOVE + _ADD per avaus), joten piilota se jo samalla ruudunpäivityksellä.
let kaynnissa = true; const kehys = () => { if (!kaynnissa) return; piilotaLaatikot(); requestAnimationFrame(kehys); }; requestAnimationFrame(kehys);
const mo = new MutationObserver(tarkista);
mo.observe(document.body, { childList: true, subtree: true, characterData: true });
tarkista();
return () => { try { kaynnissa = false; clearInterval(ajastin); for (const [id, v] of piilotetut) { spritet(v).forEach(vapauta); v._updateSpriteCounter = (v._updateSpriteCounter | 0) + 1; } piilotetut.clear(); mo.disconnect(); tyyli.remove(); document.querySelectorAll('.lootbox-ceremony[data-kls-ok]').forEach((e) => e.removeAttribute('data-kls-ok')); } catch (x) {} };
