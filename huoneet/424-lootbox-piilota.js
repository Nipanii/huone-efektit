// Huoneskripti 424 zen den: piilottaa MUIDEN lootbox-avausten animaation (lähtölaskenta, kela, otsikko) kaikilta paitsi avaajalta itseltään ja kp:ltä/Ezkeylta.
// kp 12.11. 09:17-09:18 whisper "voiks piilottaa muilta mun ja ezin boxit · zen denis · kaikki elementit piiloo" + Ezkey "peittää myös kommenttei · moni valittaa".
// MITEN: clientin .lootbox-ceremony-elementit (LootboxCeremonyView.tsx:202) saavat otsikon "<nimi> avaa lootboxin" (rivit 141/192) ja tuloksen "<nimi> sai: ..." (185).
//   Oletus: kaikki .lootbox-ceremony display:none. Oma avaus (otsikko alkaa omalla nimellä) saa data-kls-oma -merkin ja näkyy.
// RAJA: pelkkä animaatio-overlay. Laatikko-esine itse (lattialla huoneessa) näkyy edelleen; sitä ei piiloteta. Ei kosketa palvelimeen eikä muiden kuin tämän clientin näkymään.
const SALLITUT = [282, 123];   // kp, Ezkey: heillä oma lootbox-näkymä normaalina
const d = (o, k) => { const x = o && Object.getOwnPropertyDescriptor(o, k); return x && !x.get ? x.value : undefined; };
const sdm = () => { try { return d(window.NitroDevTools && window.NitroDevTools.roomEngine, '_sessionDataManager'); } catch (x) { return null; } };
const omaId = () => { try { const u = d(sdm(), '_userId'); return u > 0 ? u : 0; } catch (x) { return 0; } };
const omaNimi = () => { try { return String(d(sdm(), '_name') || '').trim(); } catch (x) { return ''; } };
if (SALLITUT.includes(omaId())) return () => {};
const tyyli = document.createElement('style');
tyyli.id = 'kls-piilota-tyyli';
tyyli.textContent = '.lootbox-ceremony:not([data-kls-oma]){display:none!important}';
document.head.appendChild(tyyli);
const tarkista = () => {
  const nimi = omaNimi().toLowerCase();
  document.querySelectorAll('.lootbox-ceremony').forEach((el) => {
    const cap = el.querySelector('.lootbox-caption');
    const t = (cap && cap.textContent || '').trim().toLowerCase();
    if (nimi && (t.startsWith(nimi + ' avaa') || t.startsWith(nimi + ' sai'))) el.setAttribute('data-kls-oma', '1');
  });
};
const mo = new MutationObserver(tarkista);
mo.observe(document.body, { childList: true, subtree: true, characterData: true });
tarkista();
return () => { try { mo.disconnect(); tyyli.remove(); document.querySelectorAll('.lootbox-ceremony[data-kls-oma]').forEach((e) => e.removeAttribute('data-kls-oma')); } catch (x) {} };
