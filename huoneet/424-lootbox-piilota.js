// Huoneskripti 424 zen den: piilottaa kp:n (kurkkupomo) ja Ezkeyn lootbox-avausten animaation (lähtölaskenta, kela, otsikko) KAIKILTA MUILTA. Muiden avaukset näkyvät kaikille kuten ennen.
// kp 12.11. 09:17-09:23 whisper "voiks piilottaa muilta mun ja ezin boxit · zen denis · kaikki elementit piiloo" + "mun ja ezin ei näy · muiden näkyy" (ensimmäinen versio käänsi tämän väärin päin: piilotti kaikkien muiden avaukset).
// MITEN: clientin .lootbox-ceremony-elementit (LootboxCeremonyView.tsx:202) saavat otsikon "<nimi> avaa lootboxin" (rivit 141/192) ja tuloksen "<nimi> sai: ..." (185).
//   Oletus: jokainen .lootbox-ceremony piilossa (display:none) kunnes otsikko on luettu; näkyviin vasta kun avaaja EI ole piilotettavien listalla (data-kls-ok).
// RAJA: tunnistus on otsikon NIMELLÄ (DOM ei kanna omistajan id:tä). Pelkkä animaatio-overlay: laatikko-esine (lattialla huoneessa) näkyy edelleen. Ei kosketa palvelimeen.
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
const mo = new MutationObserver(tarkista);
mo.observe(document.body, { childList: true, subtree: true, characterData: true });
tarkista();
return () => { try { mo.disconnect(); tyyli.remove(); document.querySelectorAll('.lootbox-ceremony[data-kls-ok]').forEach((e) => e.removeAttribute('data-kls-ok')); } catch (x) {} };
