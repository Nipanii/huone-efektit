# huone-efektit

Huonekohtaiset efektit kupla.cc:hen (esim. miinarata). Client lataa `moottori.js`:n tästä osoitteesta:
https://nipanii.github.io/huone-efektit/moottori.js

## Päivitys

1. Muokkaa `moottori.js` ja **nosta versio kahdesta kohdasta** (`// @version` ja `versio:`). Client ajaa vain uudemman version.
2. Push mainiin. Pages julkaisee noin minuutissa, ja clientit päivittyvät itse: lataaja tarkistaa huoneen vaihtuessa, moottori itse 60 s välein.

Uusi huone tai muutettu ruutulista: muokkaa vain `efektit.json`. Versiota ei tarvitse nostaa, lista haetaan joka huoneeseen tullessa.

Kirjoitusoikeus tähän repoon = koodia jokaisen pelaajan clientissä. Pidä collaboratorit vähissä.
