# huone-efektit (huoneskriptit)

Huonekohtaiset skriptit kupla.cc:hen (esim. miinarata). Client lataa `moottori.js`:n tästä osoitteesta:
https://nipanii.github.io/huone-efektit/moottori.js

Repon nimi ja tiedostonimi `moottori.js` pysyvät toistaiseksi, koska clientin `roomScripts.ts` osoittaa niihin.
Siirrossa Resin repoon nimi `huone-efektit` ei periydy (kp 27.10.), ja osoite vaihdetaan client-PR:llä.

## Rakenne

- `moottori.js`: pelkkä lataaja. Huoneeseen tullessa se katsoo `huoneet.json`:sta onko huoneella skriptejä, hakee ja ajaa ne,
  ja pysäyttää ne kun huoneesta lähdetään. Ei yhdenkään huoneen logiikkaa.
- `huoneet.json`: huone-id -> skriptien polut tässä repossa.
- `huoneet/<huone-id>.js`: huoneen oma skripti. Ajetaan `new Function('kupla', koodi)(api)`, ja sen pitää palauttaa funktio,
  joka siivoaa (ajastimet pois jne.). Sama muoto kuin Resin Messenger-moottorin huoneskripteillä, joten siirto sinne on sama tiedosto.
- `efektit.json`: vanhan 0.4.x-moottorin lista. Tarpeeton kun kaikki clientit ovat päivittyneet 0.5:een.

## Muokkaus

- Huoneen skripti (esim. miinojen furnilista): muokkaa `huoneet/<id>.js` ja pushaa. Huoneessa olevat clientit hakevat muutoksen
  noin 15 s välein (+ Pagesin julkaisuviive ~1 min). Versiota ei tarvitse nostaa.
- Uusi huone: lisää se `huoneet.json`:iin ja luo `huoneet/<id>.js`.
- Moottori: muokkaa `moottori.js` ja **nosta versio kahdesta kohdasta** (`// @version` ja `versio:`). Client ajaa vain uudemman version.

Kirjoitusoikeus tähän repoon = koodia jokaisen pelaajan clientissä. Pidä collaboratorit vähissä.
