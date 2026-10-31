// Jaetut zombit (pohja: huoneet/684-zombit.js, wired-hybridi: huoneet/682.js).
// kp 30.10. 15:58-16:10: zombit yhteisiä kaikille huoneessa olijoille, jahtaavat ketä tahansa pelaajaa (hitainta; ei botteja eikä
//   Herra-Robottia 245). Ei kiinteitä spawneja: zombi syntyy kävelykelpoiselle lattiaruudulle mahdollisimman kauas kaikista pelaajista
//   (BFS-reittietäisyys, ei linnuntie), deterministisesti siemenestä + tikistä, ei ovelle eikä alle ASETUS.oviEtaisyys ruudun päähän
//   ovesta. Kiinni saanut zombi jää paikalleen syömään/seisomaan uhrin viereen koko kuolemamakuun (ASETUS.kuolemaMakuu, 1500 ms)
//   ajaksi (ei liiku eikä nappaa muita) ja syntyy vasta makuun päätyttyä uudelleen kauas (kp 30.10. 19:54).
// kp 30.10. 16:58-17:02, 17:30-17:31 & 17:36-17:41:
//   1) Zombikohtainen näköetäisyys + vaihtuva hystereesi: jokaiselle zombille arvotaan syntyessä (ja uudelleensyntyessä) oma
//      huomaamisetäisyys väliltä ASETUS.huomaaVali (5..9 ruutua) ja oma luovutusväli väliltä ASETUS.luovutusVali (3..5 ruutua);
//      luopumisraja = oma huomaa + oma luovutusväli. Näköpiirissä olevista valitaan "hitain" (pienin liike ikkunassa, tasapelissä pienin id).
//   2) Liikkeellelähdön reaktioviive: kun zombi huomaa pelaajan, se odottaa oman reaktioviiveensä (ASETUS.reaktioVali 0..3 s per
//      huomaaminen) paikallaan ('std') kääntyneenä kohti pelaajaa ennen jahtiin lähtöä. Jos pelaaja poistuu näköpiiristä odotuksen aikana, odotus peruuntuu.
//   3) Ilman kohdetta zombi vaeltaa pysähtyillen: kulkee muutaman ruudun pätkiä (ASETUS.vaellusAskeleet 2..4, asento 'mv'),
//      seisoo 2..5 s paikallaan (ASETUS.vaellusTauko, asento 'std'), ja jatkaa uuteen satunnaiseen suuntaan (deterministinen PRNG).
//   4) Kiinnijäännin kertyvä kontaktilaskuri (per zombi + pelaaja): samassa ruudussa +1/s (+tikki ms), viereisessä ruudussa +0.5/s,
//      ja ilman kontaktia laskuri hiipuu hitaasti (-0.25/s) eikä nollaudu heti. Kiinnijäänti kun laskuri >= arvottu raja (3..6 s). Usean zombin laskurit kasvavat erikseen.
//   5) Kiinni jääneestä pelaajasta syntyy SAMAAN ruutuun "muuttunut" zombi vasta kuolemamakuun (ASETUS.kuolemaMakuu, 1500 ms) päätyttyä
//      (kun uhri on teleportattu pois): pelaajan oma figuuri zombifioituna (Left 4 Kuplan zZombify-muunnoksella), sekä pysyvä pelaajakohtainen
//      verilammikko (SAILO.lammikot: viimeisin per pelaaja, näkyy kaikille, korvautuu saman pelaajan uudella kuolemalla ja katoaa vain kun pelaaja
//      poistuu huoneesta). Kiinni jäänyt pelaaja EI näe omaa muuttunutta versiotaan, eikä muuttunut jahtaa tai ota kontaktia lähdepelaajaansa.
//      Muuttunut elää vähintään ASETUS.muuttunutMin (120000 ms, säilyy epookin yli) ja despawnaa sen jälkeen heti kun sen ruutu on kokonaan pimeässä.
//      Yksi muuttunut per pelaaja, korkeintaan ASETUS.muuttuneitaMax (4) kerrallaan.
//   6) Nopeuden vaihtelu: jokaiselle zombille arvotaan syntyessä (ja uudelleensyntyessä) oma perusnopeus väliltä ASETUS.askelVali
//      (800..1400 ms/ruutu), ja saman zombin askelväli vaihtelee dynaamisesti joka askeleella (±20 % aaltoilu + satunnaiset lyhyet
//      kiihdytykset/hidastukset). Simulaatio pyörii lyhyellä perustikillä (ASETUS.tikki = 250 ms) ja piirto interpoloidaan zombin omasta askelajasta.
//   7) Ääniveto ja tutkiminen: julkiset viestit ja huudot kuuluvat kuuloetäisyydellä (ASETUS.kuuloVali 12..20 ruutua, huuto x1.5).
//      Yksittäinen ääni painottaa vaellusta ääntä kohti; kun äänen paino >= ASETUS.tutkiRaja (1.8, ~2 viestiä tai huuto), vaeltava
//      zombi katkaisee vaellustauon ja tutkii suoraan BFS-reittiä äänen lähtöruutuun ilman taukoja kunnes on <= 2 ruudun päässä.
// Konsolissa: zombit.loki · zombit.zombit · zombit.muuttuneet · zombit.kohde · zombit.ovi · zombit.safe(true|false) · zombit.asetus · zombit.kuva()
const ASETUS = {
  maara: 3,            // tavallisten zombien määrä (päivittyy pelaajamäärän mukaan: maaraPohja + kohteet, min maaraMin, max maaraMax)
  maaraPohja: 2,       // kp 19:27: pohjamäärä, johon lisätään kohteeksi kelpaavien pelaajien määrä
  maaraMin: 3,         // kp 19:27: tavallisten zombien vähimmäismäärä
  maaraMax: 8,         // kp 19:27: tavallisten zombien enimmäismäärä
  tikki: 250,          // ms; simulaation perustikki (zombin oma askelväli 800..1400 ms ±vaihtelu)
  askelVali: [800, 1400], // ms per ruutu: jokaiselle zombille arvotaan syntyessä ja uudelleensyntyessä oma perusnopeus tältä väliltä
  nopeusVaihtelu: 0.2, // saman zombin nopeuden jatkuva aaltoilu (±20 %) + satunnaiset lyhyet kiihdytykset/hidastukset
  epookki: 1800000,    // ms (30 min); uusi aalto ilman näkyviä hyppyjä (valaistu zombi synkataan vasta pimeässä)
  ikkuna: 10000,       // ms; "hitain" mitataan tältä ajalta
  kohdeTapa: 'hitain', // kohdelogiikka ('hitain' = pienin kuljettu matka ikkunan aikana, tasapelissä pienin käyttäjä-id)
  huomaa: 7,           // ruutua (reittietäisyys): perustason huomaamisetäisyys
  meneta: 11,          // ruutua (reittietäisyys): perustason luopumisraja
  huomaaVali: [5, 9],  // ruutua: jokaiselle zombille arvotaan syntyessä oma huomaamisetäisyys tältä väliltä (5..9)
  luovutusVali: [3, 5], // ruutua: jokaiselle zombille arvotaan syntyessä oma hystereesiväli (3..5; meneta = huomaa + luovutus)
  reaktioVali: [0, 3], // sekuntia (tai ms jos >= 50): kun zombi huomaa pelaajan, se odottaa 0..3 s paikallaan ('std') kohti kääntyneenä ennen jahtia
  vaellusAskeleet: [2, 4], // ruutua: vaeltaessa zombi liikkuu 2..4 ruudun pätkiä ('mv') ennen pysähdystä
  vaellusTauko: [2, 5],    // sekuntia (tai ms jos >= 50): vaeltaessa zombi seisoo 2..5 s ('std') paikallaan pätkien välissä
  kontakti: 3,         // sekuntia (tai ms jos >= 50): oletuskontaktiraja (jos kontaktiMin/kontaktiMax asetetaan samaksi tai kontakti muutetaan)
  kontaktiMin: 0.8,    // kp 20:13 "pidentää se minimi" (oli 0.5; kp 19:46 "kiinni jää 0,5-1,5s", alun perin 3). sekuntia (tai ms jos >= 50): vähimmäiskontaktiraja ennen kiinnijääntiä
  kontaktiMax: 1.5,    // (oli 6) sekuntia (tai ms jos >= 50): enimmäiskontaktiraja (arvotaan deterministisesti 3..6 s per zombi+pelaaja)
  kontaktiSama: 1,     // kertymäkerroin samassa ruudussa (+1 per s eli +tikki ms per tikki)
  kontaktiViereinen: 0,   // kp 20:11 "käy": vain sama ruutu kerryttää (oli 0.5). kertymäkerroin viereisessä ruudussa (+0.5 per s eli +0.5*tikki ms per tikki)
  kontaktiHiipuma: 0.25,  // hiipumakerroin ilman kontaktia (-0.25 per s eli -0.25*tikki ms per tikki; ei nollaudu heti)
  muuttunutMin: 120000, // ms; kiinni jääneestä pelaajasta syntyneen muuttuneen zombin vähimmäiselinaika (2 min) ennen pimeässä despawnausta
  muuttuneitaMax: 4,   // enintään näin monta muuttunutta zombia samaan aikaan huoneessa (vanhin poistuu ensin)
  ilmanValoa: 1.8,     // ruutua: pelaajan perusvalosäde ilman käsiesinettä (jos window.pimeys.ilmanValoa ei ole saatavilla)
  lammikkoVarit: ['#8b0000', '#a30d0d', '#b01212', '#7a0a0a'], // vain punaisen sävyjä (kp 19:09)
  kuuloVali: [12, 20], // ruutua (reittietäisyys): zombikohtainen kuuloetäisyys huoneen julkisille chat-viesteille (huuto x1.5)
  aaniKesto: 30000,    // ms; kuinka kauan chat-ääni vetää vaeltelevia zombeja vinosti puoleensa (hiipuu ajan myötä)
  tutkiRaja: 1.8,      // äänen voimakkuusraja: tämän ylittävä ääni katkaisee vaellustauon heti ja laittaa zombin tutkimaan äänen lähtöruutua
  tutkiEtaisyys: 2,    // ruutua (BFS-reitti): zombi tutkii kunnes on <= N ruudun päässä äänen lähtöruudusta
  vaihtoEro: 3,        // ruutua (kp 19:15): kohde vaihtuu jos toinen pelaaja on vähintään näin paljon lähempänä kuin nykyinen kohde
  vaihtoTn: 0.5,       // todennäköisyys (50 %) vaihtaa selvästi lähempänä olevaan kohteeseen
  vaihtoVali: 3000,    // ms; kohteenvaihdon arvonnan minimiväli ettei arvo joka tikki
  aaniVaihtoTn: [0.6, 1.0], // [puhe, huuto] (kp 19:15; nostettu 23:25 "eivät seuraa ääntä tarpeeksi", oli [0.35, 0.6]): todennäköisyys vaihtaa kohteeksi äänen päästänyt pelaaja lähellä (BFS <= huomaa)
  aaniVaihtoMax: 1.0,  // ryhmän kertyneen äänipainon mukainen maksimitodennäköisyys (kp 23:25: oli 0.8, rajasi huudon)
  kuolemaOvi: { x: 29, y: 5 },   // zk684-teleportin kohde attic15_tele 425376 @29,5 (684-tila.md 16:29); muiden kuoleman tunnistus
  ovi: { x: null, y: null }, // täytetään huoneesta mitattuna; jos null, luetaan clientin huonemallista (vain spawn-etäisyyteen)
  eiSpawnia: [[20, 34, 28, 37]],   // alanurkan tasku (Mesa Escopeta 22,37), kp 30.10. 18:59
  eiZombeja: [[20, 33, 29, 37]],   // kp 19:00 "sen taakse ei saa mennä zombeja"; 21:04 osoitti Gothic-portin 446612 @24,33 -> portin rivi y=33 ja x=29 mukaan (kartta mitattu robolla 21:12)
  oviEtaisyys: 10,     // ruutua (reittietäisyys): ei ovelle eikä alle N ruudun päähän ovesta
  kaukana: 10,         // ruutua (reittietäisyys): vähimmäisetäisyys pelaajista syntyessä (jos mahdollista)
  hajonta: 3,          // ruutua: syntyruutu valitaan kauimpien ruutujen kärjestä (maxEtaisyys - hajonta .. maxEtaisyys)
  ansa: null,          // ei ansaa
  lattiaYli: 0.3,      // zombi kävelee ruudulla jonka pino on enintään näin paljon lattian yli
  kohteet: null,       // null = jahtaa ketä tahansa pelaajaa (ei SALLITUT-rajausta)
  eiKohteena: [245],   // Herra-Robotti (user id 245) ja botit eivät ole kohteita
  turvassa: [1, 282, 281, 245],  // käyttäjä-id:t joille :safe / :kuolematon on sallittu (kp 31.10. 14:58 'samalla whitelistilla :kuolematon komennon · toggleable': Res, kp, sona, robo)
  salasana: 'zk684',   // salainen sana jonka skripti sanoo kiinnijäädessä (wired: wf_trg_says_something -> wf_act_teleport_to)
  kuolemaMakuu: 1500,  // ms (kp 19:25); kiinnijäädessä uhrin hahmo makaa maassa ('lay') tämän ajan ennen zk684-teleporttia
  kuolemaLukko: 5000,  // ms; lukko ettei sama kiinnijäänti lähetä sanaa monta kertaa
  maaliSuojaMs: 6000,  // ms (kp 30.10. 22:16 "res kuoli kun se pääs läpi"); voittokuiskauksen jälkeen pelaaja on näin kauan immuuni zombeille
  siemen: 684,         // deterministisen satunnaislukugeneraattorin siemen
  // kp 30.10. 20:45-20:52 "ei zombit oo nyt shared jos ei oo synkas": johtaja + snapshot. Kanava: ensisijaisesti window.kuplaScripts (aihe z684.synk), varalla VPS-WebSocket (url). Ilman kanavaa paikallinen simulaatio.
  synkka: {
    kaytossa: true,
    url: 'wss://49-12-45-218.sslip.io/r/z684',   // VARAKANAVA: käytössä vain jos window.kuplaScripts puuttuu
    heiMs: 2000,         // EI-johtajan hei-väli (johtaja ei lähetä heitä: sen snapshot on sydämenlyönti)
    kelloMs: 50,         // synkka-ajastimen tikki (lähetysvälit tarkistetaan kuluneesta ajasta)
    snapMs: 400,         // johtajan snapshot-väli (kp 21:02 "0,33s välein"); palvelimen raja 3 lähetystä / 1000 ms / käyttäjä
    hidasMs: 500,        // kanavan 1004-virheen jälkeen snapshot-väli tämä...
    hidasKestoMs: 5000,  // ...näin kauaksi
    valmisMs: 3000,      // tulokas ei vaadi johtajuutta ennen kuin on kuunnellut näin kauan (ei flappia)
    hiljaisuusMs: 10000, // johtaja katoaa jos ei kuulu näin kauan -> seuraava pienin id / paikallinen simulaatio
    uudelleenMs: 5000,   // WebSocket-varakanavan uudelleenyritys
    eiJohtajaksi: [],    // id:t jotka eivät koskaan johda (kp 20:52: robo 245 kuten muut; alkuperäinen speksi: [245])
    siedotaMs: 4000,     // paikallisesti juuri syntynyt lammikko/muuttunut säilyy näin kauan vaikka snapshot ei sitä vielä sisällä
    maxTavuja: 7500,     // viestin enimmäispituus (kuplaScripts 8000 UTF-16-yksikköä, relay 8 kB); yli -> vanhimmat lammikot/muuttuneet pois
    maxLahetysS: 3,      // kuplaScripts: palvelimen raja 3 lähetystä / 1000 ms / käyttäjä (oma liukuva ikkuna)
  },
  figuuri: 'hd-11509-1461.hr-3714-45.ch-3530-1330.lg-11495-1408.sh-3720-82',   // varalla; oikea luetaan huoneen Zombie-botilta
  zombiAsut: [
    'hd-180-1.ch-210-66.lg-270-82.sh-290-80.hr-100-31',
    'hd-600-1.ch-630-62.lg-695-62.sh-725-62.hr-515-33',
    'hd-180-2.ch-215-64.lg-275-64.sh-300-64.hr-115-38',
    'hd-600-2.ch-635-73.lg-700-73.sh-730-73.hr-520-40',
    'hd-190-3.ch-220-89.lg-280-89.sh-305-89.hr-125-42',
    'hd-605-3.ch-640-92.lg-705-92.sh-735-92.hr-525-45',
    'hd-195-4.ch-225-70.lg-285-70.sh-310-70.hr-130-35',
    'hd-610-4.ch-645-80.lg-710-80.sh-740-80.hr-530-37'
  ],
};
Object.defineProperty(ASETUS, 'menetä', { get: () => ASETUS.meneta, set: v => { ASETUS.meneta = v; } });

// ---- Huonekohtaiset arvot (kp 31.10. 15:44-15:48: zombit myös huoneeseen 811 "Hallowen rata (6/6)", siellä ammuttavina).
//   ASETUS yllä = huoneen 684 arvot (ennallaan). HUONEET[huone] kirjoitetaan ASETUKSEN päälle käynnistyksessä; tuntematon huone = 684:n arvot
//   (sama käytös kuin ennen tätä taulua). synkka-avaimet yhdistetään ASETUS.synkka-olioon (muut synkka-arvot säilyvät).
//   - teleKuolema: toisen pelaajan kuolema tunnistetaan > 3 ruudun hypystä kuolemaOvelle (684: zk684-wired-teleportti). 811: ei wiredejä -> pois.
//   - muuttunutKuolemasta: kiinni jääneestä syntyy muuttunut zombi makuun jälkeen (684: uhri on teleportattu pois). 811: uhri jää paikalleen -> pois.
//   - salasana: wired-sana joka sanotaan kiinnijäädessä. 811: '' = ei sanota mitään (kuolema = makuu + run päättyy, ks. kuole()).
//   - ammuttava: WASD + hiiriammunta + tappolaskuri (Left 4 Kupla -valikoima, ks. AMMUNTA). Vain 811.
const HUONEET = {
  684: {
    kuolemaOvi: { x: 29, y: 5 }, eiSpawnia: [[20, 34, 28, 37]], eiZombeja: [[20, 33, 29, 37]],
    salasana: 'zk684', salaisetSanat: ['zk684', 'zl684', 'zc684', '73514k'], siemen: 684,
    teleKuolema: true, muuttunutKuolemasta: true, ammuttava: false,
    synkka: { aihe: 'z684.synk', url: 'wss://49-12-45-218.sslip.io/r/z684' },
  },
  811: {   // sona 31.10. 15:42-15:43: yksi pelaaja kerrallaan, 1 zombi = 1 piste, läpi 25 tapolla, WASD + hiiri. "älä lisää tänne wiredejä".
    kuolemaOvi: null, eiSpawnia: [], eiZombeja: [],   // AVOIN: kiellettyjä alueita ei ole mitattu 811:stä (aulan kopio)
    salasana: '', salaisetSanat: ['za811', 'zl811'], siemen: 811,
    // Pelin aloitus = script->wired-hybridi, SAMA mekanismi kuin 684:n zk684-kuolemateleportti (sanoSalainen + koukku + kuplaPiiloon, 682.js KAIVUKOODI):
    //   vuoroon tulevan pelaajan OMA client sanoo aloitusSanan tavallisena puheena; wired wf_trg_says_something [piilota 1, tarkka 1, vainOmistaja 0] "za811"
    //   + wf_act_teleport_to furni 454246 (Kaupungin päällystys @15,11) siirtää hänet (kp 16:41 "Tarvii script wired hybridin hahmon oikeaan siirtoon").
    aloitusSana: 'za811',
    // Vaihe 1c (sona 17:01-17:02 "kun pelaaja kuolee niin hän menee takaisin ylös" · "Siihen se teleportataan kun peli loppuu"): kun OMA vuoro päättyy
    //   (kuolema / :lopetapeli / mikä tahansa loppu), pelaajan oma client sanoo lopetusSanan kerran -> wired wf_trg_says_something "zl811"
    //   + wf_act_teleport_to furni 511793 (Matto habbox_couture_grand_tapis @2,2 z 7.2). Sama piilotus kuin za811.
    huomaaVali: [10, 16], luovutusVali: [14, 22], reaktioVali: [0, 1],   // kp 18:43 "pitää targettaa enemmän pelaajaa" (684: 5..9, 3..5, 0..3)
    veriKalusteet: true, kiinnijaanti: 'hp',   // kp 18:32 "Vaihdetaan hp tilaan", health packit myöhemmin
    lopetusSana: 'zl811',
    teleKuolema: false, muuttunutKuolemasta: false, ammuttava: true,
    maaraPohja: 4, maaraMin: 5, maaraMax: 8,   // OMA VALINTA (säädettävä): yksinpelaajalle 5 zombia kerrallaan (684:n kaavalla 3)
    tappoRaja: 25,
    askelVali: [667, 1167],   // vaihe 1c, kp 17:14 "lisätään kans zombien base nopeutta vähän": +20 % nopeus (ms/ruutu / 1.2), oli ASETUS.askelVali [800, 1400]. Vain 811.
    // Vaihe 1c, kp 17:07-17:08 "zombien pitäs varmaa kulkee oletuksena kohti safehousee ja hyökätä siihen · nyt ne jää harhailee tonne tien alkuun ·
    //   kunnes targettaa pelaajaa" + 17:09 "se safehouse targettaus ei saa overridee ettei target pelaajaa": KOHTEETON zombi kävelee (ilman vaellustaukoja)
    //   lähimpään safe housen hyökkäysruutuun ja iskee seinää. Pelaajan valinta (valitseKohde: näkö / reaktio / ääni-vaihto / aggro) ajetaan ENNEN
    //   (askel -> vaella vain kun kohdetta ei ole) ja äänen tutkinta (tutkiRaja) menee myös edelle -> safe house on vain oletustavoite.
    //   SAFE HOUSE = nyc_c23_buildingblue -rakennus korokkeella x 1..20, y 1..9 (korkeus 7; jono, sohvat, sängyt, teleportti ylös). Julkisivu
    //   y 10 (x 1..19 dir 0) ja oikea seinä x 21 (y 1..9 dir 90), portaat nyc_c23_steps 15,11 (811-kopio.json). PÄÄTELTY, ei osoitettu: kp ei
    //   osoittanut safe housea -> hyökkäysruudut = maantason ruudut seinän edessä: y 11 (x 2..20, isku pohjoiseen) ja x 22 (y 1..9, isku länteen).
    //   Ruutu kelpaa vain jos moottorin kävelyruudukko hyväksyy sen; jos yksikään ei kelpaa, zombi vaeltaa kuten ennen.
    //   HP-koukku: auktoriteetti vähentää AM.safe.hp (vahinko per isku, iskuMs per zombi), snapshot 'sh' vie muille, nollautuu vuoron alussa.
    //   VAIHE 2 (EI tehty): seinän välkyntä, safe housen HP-palkki näytölle, peli päättyy kun HP 0 (nyt vain loki + window.__zombi811.safeHouse).
    kuljettavatKalusteet: ['cpunk_c15_road', 'val13_grass'],
    eiPeita: ['urban_lamp'],
    safeHouse: { hp: 100, vahinko: 1, iskuMs: 1000, etaisyys: 0, rakennus: 'nyc_c23_buildingblue', valahdysMs: 300,
      ruudut: [[15, 11, 0, -1], [14, 11, 0, -1], [16, 11, 0, -1], [13, 11, 0, -1], [17, 11, 0, -1], [12, 11, 0, -1], [18, 11, 0, -1], [11, 11, 0, -1], [19, 11, 0, -1],
        [10, 11, 0, -1], [20, 11, 0, -1], [9, 11, 0, -1], [8, 11, 0, -1], [7, 11, 0, -1], [6, 11, 0, -1], [5, 11, 0, -1], [4, 11, 0, -1], [3, 11, 0, -1], [2, 11, 0, -1],
        [22, 9, -1, 0], [22, 8, -1, 0], [22, 7, -1, 0], [22, 6, -1, 0], [22, 5, -1, 0], [22, 4, -1, 0], [22, 3, -1, 0], [22, 2, -1, 0], [22, 1, -1, 0]] },
    // kp 16:03 "ei keksitä uudelleen niitä kun ne toimi jo hyvin": aallot ja syntypaikat Left 4 Kuplasta sellaisinaan (shooter-1.15.2.user.js:177-179
    //   zAloitus 6, zKasvu 3, zTaukoMs 6000; :1530-1546 zSynnyta/zAloitaAalto; :1507 zSyntyRuutu: valitut ruudut kiertäen, muuten oviruutu, muuten reunat).
    //   katto = samanaikaisten yläraja (L4K zKatto on johdettu SEN kanavan kaistasta; tässä maaraMax, koska snapshot kantaa kaikki zombit).
    aallot: { aloitus: 10, kasvu: 5, taukoMs: 6000, alkuMs: 1500, katto: 16, syntyRuudut: [],   // kp 18:55 "tarvitaan enemmän": oli 6, 3, 8
      // kp 16:28 "zombeja pitää spawnata myös oikeesta portittomasta päästä": puolet kiertävät synty synnyltä (ovi, oikea pää, ovi, ...).
      //   Oikea pää = tie cpunk_c15_road (811-kopio.json: esineet x 38/40, y 13..17, z 0) sarakkeessa x 41; ensimmäinen kävelykelpoinen kelpaa.
      //   Ei-kävelykelpoinen puoli (esim. ovi korokkeella) ohitetaan ja käytetään seuraavaa.
      puolet: ['ovi', [[41, 15], [41, 14], [41, 16], [41, 13], [41, 17], [40, 15], [40, 14], [40, 16]]] },
    // Vuoro: yksi pelaaja kerrallaan (sona 16:25-16:29, kp 16:25 "Ase pitää olla käytössä vaan pelaajalle", kp 16:43 ":aloitapeli"). Johtaja päättää
    //   vuoron ja synkkaa sen snapshotissa (vu); vain vuoron pelaaja on zombien kohde ja vain hänellä on ase. Ks. AMMUNTA / VUORO.
    vuoro: {
      jono: { x: 15, y: 3, furni: 462161 },   // queue_tile1 462161 = jonon etupää (rivi x 7..15, y 3, dir 90 -> rullaa kohti 15,3; 16,3:ssa army_c15_light)
      alku: { x: 15, y: 11, furni: 454246 },  // aloitusruutu, wiredin teleport-kohde
      jonostaAloitus: true,   // johtaja aloittaa vuoron jonon etupäässä seisovalle (false = vain :aloitapeli)
      laskentaMs: 5000,       // "Peli alkaa" 5 -> 1 (sona 16:28-16:29)
      siirtoMs: 2000,         // sona 16:59 "Ensin siirto ja sitten PELI ALKAA 5-1": aloitusSana + teleport ennen laskentaa
      lepoMs: 4000,           // edellisen pelin loputtua näin kauan ennen seuraavaa (tulos näkyy)
      poissaMs: 4000,         // vuoron pelaaja poissa huoneesta näin kauan -> vuoro päättyy
      kavelyVaraMs: null,     // kohde 6 (kp 18:10 "ihan tyhmä toi et on toi autowalk"): varakävely POIS (oli 3000; arvo palauttaa sen). Jos aloitusSanan jälkeen näin kauan ei olla aloitusruudussa: OMA kävely sinne (sendWalkUpdate, kuin lattiaklikkaus). null = pois
      kasky: [1, 282, 281, 245],   // :aloitapeli / :lopetapeli sallittu (sama lista kuin :kuolematon). null = kaikille
      loppu: { x: 2, y: 2, furni: 511793 },   // sona 17:02: Matto 511793 @2,2 z 7.2 = lopetusSanan wired-teleportin kohde (jo siellä -> ei sanota)
      kamera: true,           // kp 17:01-17:02: L4K:n kameralukko (oma hahmo ruudun keskelle) vuoron pelaajalle koko vuoron ajan. Alt+K vaihtaa. false = pois
    },
    // url null: VPS-varakanavan polku /r/z684 on 684:n; 811:lle ei arvata polkua. Ilman kuplaScriptsiä 811 = paikallinen simulaatio.
    synkka: { aihe: 'z811.synk', url: null },
    eiKohteena: [],   // vuoro rajaa kohteet vuoron pelaajaan (ASETUS.kohteet); robo 245 voi olla testipelaaja :aloitapeli-komennolla
  },
};
// Huone 817 "Rata 6 B" = 811 levennettynä (kp 31.10. 16:10-17:31 "valmistele siirto 817:ään eli samat scriptit toimimaan siellä"): sama peli, kaikki ruudut x+12, y+12
//   (nitro/data/huoneet/811-levea-kopio.json), furni-id:t 817:n omat (mitattu 17:32 vertaa-811-817.js). Wiredit samoilla sanoilla za811/zl811: wired on huonekohtainen.
//   Portit + tie vasemmalle (kp 16:10) EI tässä vielä: tämä on pelkkä siirto.
HUONEET[817] = (() => { const DX = 12, DY = 12, h = JSON.parse(JSON.stringify(HUONEET[811]));
  h.siemen = 817; h.synkka = { aihe: 'z817.synk', url: null };
  h.safeHouse.ruudut = h.safeHouse.ruudut.map(([x, y, ax, ay]) => [x + DX, y + DY, ax, ay]);
  h.aallot.puolet = ['ovi', h.aallot.puolet[1].map(([x, y]) => [x + DX, y + DY]), [[1, 25], [1, 26], [1, 27], [1, 28], [1, 29], [1, 30]]];
  const v = h.vuoro, siirra = (q, furni) => { q.x += DX; q.y += DY; q.furni = furni; };
  siirra(v.jono, 513063); siirra(v.alku, 512772); siirra(v.loppu, 513207);
  // Kohde 5 (kp 18:04, 18:12): aitamekaniikka 817. Palakohtainen HP (50), isku kuten safe house.
  //   Kun pala tuhoutuu: piilotetaan paikallisesti, ruudukko aukeaa, kaikki zombit kulkevat aukosta.
  h.eiZombeja = [[0, 33, 60, 60]];   // kp 19:01 "zombit näky tuol mustalla alueella": aitarivin y33 aukot päästivät etelään
  h.aidat = {
    hp: 20, vahinko: 1, iskuMs: 1000, valahdysMs: 300,
    // kp 18:51-18:52 "targettaa vääriä esteitä" + osoitti Portti 513142: vain portit ovat kohteita.
    palat: [
      { id: 513142, x: 13, y: 28, hp: 20 },
      { id: 513140, x: 13, y: 29, hp: 20 },
      { id: 513141, x: 13, y: 30, hp: 20 },
    ],
    hyokkaysRuudut: [
      [12, 28, 1, 0],
      [12, 29, 1, 0],
      [12, 30, 1, 0],
    ]
  };
  return h; })();
ASETUS.aallot = null;   // 684: ei aaltoja (zombimäärä laskeMaara(P), tapettu syntyy uudelleen). 811: HUONEET[811].aallot
ASETUS.ammuttava = false; ASETUS.teleKuolema = true; ASETUS.muuttunutKuolemasta = true; ASETUS.salaisetSanat = []; ASETUS.tappoRaja = 25;
ASETUS.aloitusSana = ''; ASETUS.lopetusSana = ''; ASETUS.vuoro = null; ASETUS.safeHouse = null; ASETUS.aidat = null;   // 684: ei safe housea (811: HUONEET[811].safeHouse)   // 684: ei vuoroja eikä aloitussanaa (811: HUONEET[811])
ASETUS.synkka.aihe = 'z684.synk';
// Aseet 811:ssä = Left 4 Kuplan aseet SELLAISENAAN (kp 16:02 "otetaan vanha bow ja gun ampumis nopeus siten miten ne oli jo tehty" ·
//   "sword voi kans pitää sellasenaan"): arvot shooter-1.15.2.user.js:505-509 (asetus.vahinko = 1). Zombin HP 60 = shooter :177 zHp.
//   m 'p' = lentävä ammus (nopeus ruutua/s, lento = kantama), 'h' = hitscan. veto = jännitys painettaessa, laukeaa irrotettaessa (lataus 0..1).
//   kp 18:15 "zombit pitäs herkemmin targettaa pelaajaa kun niitä ampuu": aggroSade päälle. Pistooli 8, jousi ja miekka 3 (kp 16:00: pistooli vetää kauempaa, jousi hiljainen).
//   VAIHE 2 / kp 16:01 -koukut (UUTTA, ei L4K:ssa): aani = laukauksen ääniveto (null = hiljainen) · aggroSade = osutun lähellä olevat zombit
//   kohdistavat ampujaan (null = ei) · nollaaKontakti = käyttö nollaa oman kiinnijäämislaskurin kaikilta zombeilta (kp: "miekan käyttö nollais
//   aina kiinni jäämis laskurin") · kontaktiKerroin = kiinnijäännin rajan kerroin ase kädessä (vaihtoehto B).
//   kasi = käsiesine (vaihe 1c, kp 17:00 "ase handitemit puuttuu"): L4K:n oma tapa = `:handitem <id>` chat-komentona (shooter :24-25, :35, :505-509, :587),
//   EI asukanavaa. Pyssy 1126, Jousi 1128, Miekka 1094 (L4K:n kasi-arvot). VIP-komento: ilman VIP:tä ase ei näy kädessä, peli toimii (shooter :101).
ASETUS.aseet = {
  luoti: { ikoni: '🔫', nimi: 'Pistooli', kasi: 1126, m: 'p', tyyli: 'luoti', vari: '#ffd23f', nopeus: 21.6, auto: true, cd: 350, lento: 30, lineaari: [20, 30],
    aani: null, aggroSade: 14, nollaaKontakti: false, kontaktiKerroin: 1 },
  jousi: { ikoni: '🏹', nimi: 'Jousi', kasi: 1128, m: 'p', vari: '#c9c9c9', veto: true, nopeus: 15.12, lento: 14, cd: 1000, vahinko: 20, lataus: [10, 50, 1000], latausLento: [14, 24],
    aani: null, aggroSade: 6, nollaaKontakti: false, kontaktiKerroin: 1 },
  miekka: { ikoni: '🗡️', nimi: 'Miekka', kasi: 1094, m: 'h', vari: '#e8eef7', kantama: 2.5, vahinko: 34, veto: true, hidasKavely: true, cd: 700, lapi: [3, 1000], lapiVahinko: 50, lapiLapi: 50,
    aani: null, aggroSade: 6, nollaaKontakti: true, kontaktiKerroin: 1 },   // nollaaKontakti true = kp:n suosima suunta B (16:01), kp päättää
};
ASETUS.ase = { valittu: 'luoti', jalkiMs: 450, ruumisMs: 1400 };
ASETUS.esteKorkeus = 2;   // shooter 1.13.0 asetus.esteKorkeus (ESTE_KORKEUS :963): esine estää vain jos sen näkyvä korkeus > tämä   // jälki 450 ms = shooter :1727
ASETUS.zombiHp = 60;
// Kiinnijäänti 811:ssä (kp 16:01, kp päättää): 'kontakti' = 684-tyylinen kertyvä laskuri -> kuolema (vaihtoehto B, oletus) ·
//   'hp' = kiinnijäänti vähentää omaa HP:ta ASETUS.hp.purema ja laskuri nollautuu; kuolema vasta kun HP 0 (vaihtoehto A).
ASETUS.kiinnijaanti = 'kontakti';
ASETUS.hp = { max: 100, purema: 15, heal: null };   // max 100 = shooter :154 hp, purema 15 = :177 zPurenta. heal: null | { tapa: 'aika', hpS: 5, viiveMs: 3000 }

const e = window.NitroDevTools && window.NitroDevTools.roomEngine;
const huone = Number((kupla && kupla.roomId && kupla.roomId()) || (e && e.activeRoomId)) || 0;
{ const h = HUONEET[huone] || HUONEET[684];
  for (const [k, v] of Object.entries(h)) {
    if (k === 'synkka') Object.assign(ASETUS.synkka, v);
    else ASETUS[k] = (v && typeof v === 'object') ? JSON.parse(JSON.stringify(v)) : v;
  } }
const dv = (o, k) => { const d = o && Object.getOwnPropertyDescriptor(o, k); return d && !d.get ? d.value : undefined; };
const omaId = () => { const s = e && dv(e, '_sessionDataManager'); return Number((s && (dv(s, '_userId') || s.userId)) || 0); };
if (!e || !huone) return () => {};

const tila = window.zombit = { versio: 'zombit-jaettu 2', huone, asetus: ASETUS, zombit: [], muuttuneet: [], lammikot: [], kohde: null, ovi: null, loki: [], kuolemat: 0, virheet: 0, k: 0 };
const lokiin = o => { o.t = new Date().toTimeString().slice(0, 8); tila.loki.push(o); if (tila.loki.length > 200) tila.loki.shift(); };
const MUISTI = 'zombit.' + huone + '.safe';
const saaSafe = () => Array.isArray(ASETUS.turvassa) && ASETUS.turvassa.includes(omaId());
let safe = false; try { if (saaSafe()) safe = sessionStorage.getItem(MUISTI) === '1'; } catch (x) {}
tila.safe = (v) => {
  if (v === undefined) return safe && saaSafe();
  if (!saaSafe()) { lokiin({ safe: 'estetty (ei ASETUS.turvassa-listalla)', id: omaId() }); return false; }
  safe = !!v; try { sessionStorage.setItem(MUISTI, safe ? '1' : '0'); } catch (x) {}
  lokiin({ safe }); return safe;
};

// ---- yhteys ja istunto
const istunto = () => { const sm = dv(e, '_roomSessionManager'); return sm && sm.getSession && sm.getSession(huone); };
const omaIndeksi = () => {
  const s = istunto(), i = s && s.ownRoomIndex;
  const ud = s && s.userDataManager, sd = dv(e, '_sessionDataManager') || {}, id = Number(sd._userId || sd.userId || 0), nimi = String(sd._name || sd.userName || '').trim().toLowerCase();
  // F9: ownRoomIndex kelpaa vain jos sen käyttäjä on oma id (vanhentunut indeksi -> oma kiinnijäänti hylättiin kuin muiden, välkky ilman kuolemaa)
  const hasI = i != null && i >= 0;
  if (hasI && (!ud || !ud.getUserDataByIndex || !(id > 0))) return i;
  if (hasI) { const u0 = ud.getUserDataByIndex(i); if (u0 && Number(u0.webID) === id) return i; }
  if (!ud || !ud.getUserDataByIndex || (!id && !nimi)) return null;
  for (const o of e.getRoomObjects(huone, 100) || []) { const u = o && ud.getUserDataByIndex(o.id);
    if (u && ((id > 0 && Number(u.webID) === id) || (nimi && String(u.name || '').trim().toLowerCase() === nimi))) return o.id; }
  return hasI ? i : null;
};
const yhteys = () => {
  const nahty = new Set(); let c = null;
  const etsi = (o, d) => { if (!o || c || d > 4 || typeof o !== 'object' || nahty.has(o)) return; nahty.add(o);
    if (Object.getOwnPropertyDescriptor(o, '_cryptoState')) { c = o; return; }
    for (const k of Object.getOwnPropertyNames(o)) { const de = Object.getOwnPropertyDescriptor(o, k); if (de && !de.get && de.value && typeof de.value === 'object') etsi(de.value, d + 1); } };
  etsi(dv(e, '_roomSessionManager'), 0); return c;
};

// ---- ovi: 1) ASETUS.ovi, 2) RoomEntryTileMessageEvent (1664), 3) room_map_data.doors[0], 4) istunto._doorX/doorX, muuten null
const lueOvi = (W, H) => {
  const kelpaa = (x, y, lahde) => (x != null && y != null && isFinite(x) && isFinite(y) && x >= 0 && y >= 0 && (!W || (x < W && y < H)))
    ? { x: Math.floor(Number(x)), y: Math.floor(Number(y)), lahde } : null;
  if (ASETUS.ovi && ASETUS.ovi.x != null && ASETUS.ovi.y != null) {
    const a = kelpaa(ASETUS.ovi.x, ASETUS.ovi.y, 'asetus'); if (a) return a;
  }
  try {
    const c = yhteys(), msgs = c && dv(c, '_messages'), ev = msgs && msgs.getEvents && msgs.getEvents(1664), p = ev && ev[0] && ev[0].parser;
    const a = p && kelpaa(p.x, p.y, 'paketti1664'); if (a) return a;
  } catch (x) {}
  try {
    const ro = e.getRoomOwnObject && e.getRoomOwnObject(huone), rm = ro && ro.model && ro.model.getValue('room_map_data'), d = rm && Array.isArray(rm.doors) && rm.doors[0];
    const a = d && kelpaa(d.x, d.y, 'room_map_data'); if (a) return a;
  } catch (x) {}
  try {
    const s = istunto(), a = s && kelpaa(s._doorX ?? s.doorX, s._doorY ?? s.doorY, 'istunto'); if (a) return a;
  } catch (x) {}
  return null;
};

// ---- satunnaisuus ja ruudukko
const arpa = (n) => { let a = (n >>> 0) || 1; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const NAAP = [[0, -1], [1, 0], [0, 1], [-1, 0], [1, -1], [1, 1], [-1, 1], [-1, -1]];   // kiinteä järjestys = sama valinta kaikilla
let ruudukko = null;
tila.ruudukko = () => ruudukko;

// Monilähteinen BFS-reittietäisyys kävelykelpoisella ruudukolla (kulman oikaisu estetty).
const bfsKentta = (W, H, ok, pisteet) => {
  const d = new Int32Array(W * H).fill(-1), jono = [];
  const alku = (x, y) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return false;
    const i = y * W + x; if (!ok[i]) return false;
    if (d[i] < 0) { d[i] = 0; jono.push(i); }
    return true;
  };
  for (const p of pisteet || []) if (p && isFinite(p.x) && isFinite(p.y)) {
    const rx = Math.round(p.x), ry = Math.round(p.y);
    if (!alku(rx, ry)) for (const [dx, dy] of NAAP) alku(rx + dx, ry + dy);
  }
  for (let q = 0; q < jono.length; q++) {
    const i = jono[q], x = i % W, y = (i - x) / W;
    for (const [dx, dy] of NAAP) {
      const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = ny * W + nx;
      if (ok[j] && d[j] < 0 && (dx === 0 || dy === 0 || (ok[y * W + nx] && ok[ny * W + x]))) { d[j] = d[i] + 1; jono.push(j); }
    }
  }
  return { d, lahteita: jono.length };
};
const kentta = (kx, ky) => bfsKentta(ruudukko.W, ruudukko.H, ruudukko.ok, [{ x: kx, y: ky }]).d;

// shooter-1.15.2.user.js:1022-1031 kitEsteet: kalusteet joiden päälle ei voi astua (!canStandOn) ovat zombeille esteitä
let kitEsteMuisti = null;
const kitEsteet = (rid) => {
  const nyt = Date.now();
  if (kitEsteMuisti && kitEsteMuisti.rid === rid && nyt - kitEsteMuisti.t < 3000) return kitEsteMuisti.s;
  const s = new Set();
  try {
    const sd = dv(e, '_sessionDataManager');
    const objs = (e.getRoomObjects && e.getRoomObjects(rid, 10))
      || (e.getRoomInstance && e.getRoomInstance(rid) && e.getRoomInstance(rid).getRoomObjectsForCategory && e.getRoomInstance(rid).getRoomObjectsForCategory(10))
      || [];
    for (const o of objs) {
      const m = o && o.model, L = o && o.getLocation && o.getLocation();
      if (!m || !L) continue;
      // Kohde 3 lisäys 18:18: vartiotorni 513115 / army_c15_watchtwr @37,26 on este riippumatta tilasta
      const AT = aitaTila();
      if (AT && AT.tuhoutuneetIds && AT.tuhoutuneetIds.has(o.id)) continue;
      const isTower = (o.id === 513115) || (m.getValue && (m.getValue('furniture_type_id') === 8052 || String(o.type || '').includes('watchtwr')));
      let fd = null;
      try { fd = sd && sd.getFloorItemData && sd.getFloorItemData(m.getValue('furniture_type_id')); } catch (x) {}
      if ((fd && fd.canStandOn || (ASETUS.kuljettavatKalusteet || []).includes(String(o.type))) && !isTower) continue;   // kuljettavat: furnidata false mutta litteä (mitattu 817)
      const d = Math.round(((o.getDirection && o.getDirection() && o.getDirection().x) || 0) / 45) % 4;
      let sx = (m.getValue && m.getValue('furniture_size_x')) || 1, sy = (m.getValue && m.getValue('furniture_size_y')) || 1;
      if (d === 2) [sx, sy] = [sy, sx];
      const lx = Math.round(L.x), ly = Math.round(L.y);
      for (let i = 0; i < sx; i++) for (let j = 0; j < sy; j++) s.add((lx + i) + ',' + (ly + j));
    }
  } catch (x) {}
  kitEsteMuisti = { rid, t: nyt, s }; return s;
};

const aukiRuudut = () => { const r = new Set(), A = ASETUS.aidat ? aitaTila() : null; if (!A) return r;
  for (const p of A.palat) { if (!A.tuhoutuneetIds.has(p.id)) continue; let sx = 1, sy = 1; try { const o = e.getRoomObject(huone, p.id, 10), m = o.model, d = Math.round((o.getDirection().x || 0) / 45) % 4; sx = m.getValue('furniture_size_x') || 1; sy = m.getValue('furniture_size_y') || 1; if (d === 2) [sx, sy] = [sy, sx]; } catch (x) {}
    for (let i = 0; i < sx; i++) for (let j = 0; j < sy; j++) r.add((p.x + i) + ',' + (p.y + j)); }
  return r; };
const rakenna = () => {   // zombien kävelyruudut: perustason lattia (|korkeus| < 0.5), matala pino; yhteys oveen tai suurin yhtenäinen lattia-alue
  const hm = e.getFurnitureStackingHeightMap(huone), wg = e.getLegacyWallGeometry(huone); if (!hm || !wg) return null;
  const W = hm.width, H = hm.height, ok = new Uint8Array(W * H), z = new Float32Array(W * H), ke = ASETUS.ammuttava ? kitEsteet(huone) : new Set();   // 684 ennallaan
  const auki = aukiRuudut();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x; if (!wg.isRoomTile(x, y) || (hm._isRoomTile && !hm._isRoomTile[i])) continue;
    const lattia = wg.getHeight(x, y), pino = hm.getTileHeight(x, y); z[i] = pino;
    if (Math.abs(lattia) < 0.5 && (pino - lattia <= ASETUS.lattiaYli || auki.has(x + ',' + y)) && !eiZombeja(x, y) && !ke.has(x + ',' + y)) ok[i] = 1;
  }
  const ovi = lueOvi(W, H); tila.ovi = ovi;
  const yht = new Uint8Array(W * H), jono = [];
  if (ASETUS.aidat) for (const r of [...(ASETUS.aidat.hyokkaysRuudut || []), ...((ASETUS.safeHouse && ASETUS.safeHouse.ruudut) || [])]) { const i = r[1] * W + r[0]; if (ok[i] && !yht[i]) { yht[i] = 1; jono.push(i); } }
  if (ovi) {
    const d0 = ovi.y * W + ovi.x;
    if (ok[d0]) { yht[d0] = 1; jono.push(d0); }
    else for (const [dx, dy] of NAAP) {
      const nx = ovi.x + dx, ny = ovi.y + dy;
      if (nx >= 0 && ny >= 0 && nx < W && ny < H && ok[ny * W + nx] && !yht[ny * W + nx]) { yht[ny * W + nx] = 1; jono.push(ny * W + nx); }
    }
  }
  for (let q = 0; q < jono.length; q++) {
    const i = jono[q], x = i % W, y = (i - x) / W;
    for (const [dx, dy] of NAAP) {
      const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = ny * W + nx;
      if (ok[j] && !yht[j] && (dx === 0 || dy === 0 || (ok[y * W + nx] && ok[ny * W + x]))) { yht[j] = 1; jono.push(j); }
    }
  }
  // Jos ovea ei tunneta tai ovi on eri kerroksessa (esim. 684:n ylätaso z=7), valitaan suurin yhtenäinen perustason lattia-alue.
  if (!jono.length) {
    const nahty = new Uint8Array(W * H); let paras = [];
    for (let i0 = 0; i0 < W * H; i0++) {
      if (!ok[i0] || nahty[i0]) continue;
      const komp = [i0]; nahty[i0] = 1;
      for (let q = 0; q < komp.length; q++) {
        const i = komp[q], x = i % W, y = (i - x) / W;
        for (const [dx, dy] of NAAP) {
          const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const j = ny * W + nx;
          if (ok[j] && !nahty[j] && (dx === 0 || dy === 0 || (ok[y * W + nx] && ok[ny * W + x]))) { nahty[j] = 1; komp.push(j); }
        }
      }
      if (komp.length > paras.length) paras = komp;
    }
    for (const i of paras) yht[i] = 1;
  }
  const ruudut = []; for (let i = 0; i < W * H; i++) if (yht[i]) ruudut.push(i);
  const oviBfs = ovi ? bfsKentta(W, H, yht, [ovi]) : null;
  return { W, H, ok: yht, z, ruudut, ovi, dOvi: oviBfs && oviBfs.lahteita ? oviBfs.d : null };
};
const ansaRuutu = () => {
  if (!ASETUS.ansa) return null;
  try { const o = e.getRoomObject(huone, ASETUS.ansa.furni, 10), L = o && o.getLocation(); if (L) return { x: Math.round(L.x), y: Math.round(L.y) }; } catch (x) {}
  return { x: ASETUS.ansa.x, y: ASETUS.ansa.y };
};

// ---- pelaajat (palvelimen jakama syöte; vain oikeat pelaajat, ei botteja)
const onKohde = p => !!p && !(Array.isArray(ASETUS.eiKohteena) && ASETUS.eiKohteena.includes(p.id)) && (!Array.isArray(ASETUS.kohteet) || ASETUS.kohteet.includes(p.id));
const pelaajat = () => {
  const s = istunto(), ud = s && s.userDataManager, out = [];
  for (const o of e.getRoomObjects(huone, 100) || []) {
    if (!o || o.id < 0 || String(o.type) !== 'user') continue;
    const u = ud && ud.getUserDataByIndex && ud.getUserDataByIndex(o.id);
    if (!u || (u.type != null && Number(u.type) !== 1)) continue;   // userType 1 = oikea pelaaja (botit 3/4, lemmikit 2 pois)
    const id = Number(u.webID) || 0; if (!id) continue;
    const L = o.getLocation(); if (!L) continue;
    let fig = String(u.figure || '');
    let ese = 0, suunta = 0;
    try {
      if (!fig && o.model) fig = String(o.model.getValue('figure') || '');
      if (o.model) ese = Number(o.model.getValue('figure_carry_object')) || 0;
      const d = o.getDirection && o.getDirection();
      if (d && isFinite(d.x)) suunta = Number(d.x) || 0;
    } catch (x) {}
    out.push({ id, i: o.id, x: Math.round(L.x), y: Math.round(L.y), z: Number(L.z) || 0, nimi: u.name, figuuri: fig, ese, suunta });
  }
  return out.sort((a, b) => a.id - b.id);
};

// ---- Left 4 Kupla -figuurimuunnos (D:/re-lab/tmp/shooter/shooter-1.15.2.user.js:316-317, 1275-1299)
const OSA_RE_KAIKKI = /\.q[0-9A-Za-z]{10,}-0(?=\.|$)/g;
const puhdasAsu = f => String(f || '').replace(OSA_RE_KAIKKI, '');
const Z_IHOT = ['1362', '1361', '1360'];
const zOsat = f => String(f || '').split('.').filter(Boolean).map(p => p.split('-')).filter(p => /^[a-z]{2}$/.test(p[0]) && p.length >= 2);
const zPaaId = f => { const p = zOsat(f).find(x => x[0] === 'hd'); return p ? (+p[1] | 0) : 0; };
const zZombify = (fig, o) => {
  const skin = (o && o.skin) || '1362';
  let ps = zOsat(puhdasAsu(fig));
  ps = ps.filter(p => !(o && o.dropHat && (p[0] === 'ha' || p[0] === 'he')) && !(o && o.dropHair && p[0] === 'hr') && !(o && o.dropFace && (p[0] === 'fa' || p[0] === 'ea')));
  ps = ps.map(p => p[0] === 'hd' ? ['hd', (o && o.head) || p[1], skin] : (o && o.dark && ['ch', 'lg', 'sh', 'cc'].includes(p[0])) ? [p[0], p[1], ...p.slice(2).map(() => o.dark)] : p);
  if (!ps.some(p => p[0] === 'hd')) ps.unshift(['hd', (o && o.head) || '3603', skin]);
  return ps.map(p => p.join('-')).join('.');
};
// Kaatuneen pelaajan tartuntamuunnos (shooter-1.15.2.user.js zVariantti + zFigure kun z.tyyppi === 1):
//   iho Z_IHOT-paletista, 30 % pakotettu zombipää (3603/4206) ja tyyppi === 1 varmistaa zombipään (o.head || '3603'),
//   30 % vaatteiden tummennus ('110'), pelaajan omat hiukset/hattu/vaatteet säilyvät.
const zombifioiAsu = (lahdeFig, siemen) => {
  const base = puhdasAsu(lahdeFig) || ASETUS.figuuri;
  const r = arpa(siemen);
  const skin = Z_IHOT[Math.floor(r() * Z_IHOT.length)];
  const pakota = r() < 0.3 ? (r() < 0.5 ? '3603' : '4206') : null;
  const tumma = r() < 0.3 ? '110' : null;
  const hd = zPaaId(base), tavallinen = (hd >= 180 && hd <= 209) || (hd >= 600 && hd <= 629);
  const head = pakota || (tavallinen ? null : ((siemen >>> 0) % 2 ? '4206' : '3603')) || '3603';
  return zZombify(base, { skin, dark: tumma, head });
};

// ---- Valaistus (huoneet/684.js:30-31, 311): ruutu on valaistu jos yksikin pelaaja valaisee sen ymparys-säteellä tai keilalla (ilman seinäestoja)
const OLETUS_VALOT = {
  1058: { nimi: 'Lyhty', ymparys: 3.5, keila: 9.5, kulma: 30, liekki: 1 },
  1027: { nimi: 'Kynttilä', ymparys: 2.4, keila: 2.8, kulma: 60, liekki: 1 },
  1113: { nimi: 'LED-kynttilä', ymparys: 2.4, keila: 2.8, kulma: 60 },
  1031: { nimi: 'Soihtu', ymparys: 4.2, keila: 5.5, kulma: 60, liekki: 1 },
};
const haeValot = () => (window.pimeys && window.pimeys.valot && typeof window.pimeys.valot === 'object') ? window.pimeys.valot : OLETUS_VALOT;
const onValaistu = (zx, zy, P) => {
  const valot = haeValot();
  const ilmanValoa = Number((window.pimeys && window.pimeys.ilmanValoa) ?? ASETUS.ilmanValoa ?? 1.8);
  for (const p of P || []) {
    if (!p || !isFinite(p.x) || !isFinite(p.y)) continue;
    const dx = zx - p.x, dy = zy - p.y, et = Math.hypot(dx, dy);
    const v = (p.ese && (valot[p.ese] || OLETUS_VALOT[p.ese])) || null;
    const ymparys = v && isFinite(Number(v.ymparys)) ? Number(v.ymparys) : (isFinite(ilmanValoa) ? ilmanValoa : 1.8);
    if (et <= ymparys) return true;
    const keila = v && isFinite(Number(v.keila)) ? Number(v.keila) : 0;
    if (keila > 0 && et <= keila && et > 1e-6) {
      const th = (Number(p.suunta) || 0) * Math.PI / 180;
      const kx = Math.sin(th), ky = -Math.cos(th);   // 684.js:311 kesk = atan2(-cos(th), sin(th))
      const puoliKulma = (isFinite(Number(v.kulma)) ? Number(v.kulma) : 30) * Math.PI / 180;
      if ((dx * kx + dy * ky) / et >= Math.cos(puoliKulma) - 1e-9) return true;
    }
  }
  return false;
};

// Tila säilyy skriptin uudelleenlatauksen yli (push käynnistää skriptin uudelleen ~15 s välein).
const SAILO = (window.__zombitJaettu && window.__zombitJaettu.huone === huone)
  ? window.__zombitJaettu
  : (window.__zombitJaettu = { huone, E: -1, K: -1, zombit: [], muuttuneet: [], lammikot: [], aanet: [], makaavat: new Map(), piirretytIdt: new Set(), seuraavaMuuttunutN: 1000, historia: new Map() });
if (!Array.isArray(SAILO.muuttuneet)) SAILO.muuttuneet = [];
if (!Array.isArray(SAILO.lammikot)) SAILO.lammikot = [];
if (!Array.isArray(SAILO.aanet)) SAILO.aanet = [];
if (!(SAILO.maalissa instanceof Map)) SAILO.maalissa = new Map();   // pelaaja-id -> { nimi, saapui, loppuMs }: maalisuoja (ks. kuuleMaali)
if (!(SAILO.makaavat instanceof Map)) SAILO.makaavat = new Map();
if (!(SAILO.piirretytIdt instanceof Set)) SAILO.piirretytIdt = new Set();
if (!(SAILO.seuraavaMuuttunutN >= 1000)) SAILO.seuraavaMuuttunutN = 1000;
tila.muuttuneet = SAILO.muuttuneet;
tila.lammikot = SAILO.lammikot;
tila.makaavat = SAILO.makaavat;

// Siivotaan heti käynnistyksessä KAIKKI vanhat huoneobjektit (SAILO.piirretytIdt ja -950000..-959999) ennen ensimmäistä piirtoa
try {
  for (const g of SAILO.piirretytIdt) try { e.removeRoomObjectUser(huone, g); } catch (x) {}
  SAILO.piirretytIdt.clear();
  for (const o of (e.getRoomObjects(huone, 100) || [])) {
    if (o && o.id <= -950000 && o.id >= -959999) {
      try { e.removeRoomObjectUser(huone, o.id); } catch (x) {}
    }
  }
} catch (x) {}
const historia = SAILO.historia;   // id -> [{k,x,y}]
const kirjaa = (k, P) => {
  const n = Math.max(1, Math.round(ASETUS.ikkuna / ASETUS.tikki));
  for (const p of P) {
    let h = historia.get(p.id); if (!h) historia.set(p.id, h = []);
    h.push({ k, x: p.x, y: p.y }); while (h.length && h[0].k <= k - n) h.shift();
  }
  for (const id of [...historia.keys()]) if (!P.some(p => p.id === id)) historia.delete(id);
};
const liike = (id) => {
  const h = historia.get(id) || []; let s = 0, hyppy = 0;
  for (let i = 1; i < h.length; i++) {
    const a = Math.max(Math.abs(h[i].x - h[i - 1].x), Math.abs(h[i].y - h[i - 1].y));
    s += a; if (a > hyppy) hyppy = a;
  }
  return { s, hyppy };
};
const etaisyysPelaajaan = (dz, p) => {
  const { W, H, ok } = ruudukko;
  if (p.x >= 0 && p.y >= 0 && p.x < W && p.y < H && ok[p.y * W + p.x]) return dz[p.y * W + p.x];
  let paras = -1;
  for (const [dx, dy] of NAAP) {
    const x = p.x + dx, y = p.y + dy;
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    const e = dz[y * W + x];
    if (e >= 0 && (paras < 0 || e + 1 < paras)) paras = e + 1;
  }
  return paras;
};
const tavoitettava = (p) => {
  const { W, H, ok } = ruudukko;
  for (const [dx, dy] of [[0, 0]].concat(NAAP)) {
    const x = p.x + dx, y = p.y + dy;
    if (x >= 0 && y >= 0 && x < W && y < H && ok[y * W + x]) return true;
  }
  return false;
};
const lukuValilta = (pari, oletusMin, oletusMax, rnd) => {
  const a = Array.isArray(pari) ? Number(pari[0]) : NaN, b = Array.isArray(pari) ? Number(pari[1]) : NaN;
  const min = Math.max(0, isFinite(a) ? Math.floor(a) : oletusMin);
  const max = Math.max(min, isFinite(b) ? Math.floor(b) : oletusMax);
  return min + Math.floor(rnd() * (max - min + 1));
};
// Sekunteina (< 50) tai suoraan millisekunteina (>= 50) annetut välit muunnetaan aina millisekunneiksi -> kesto ei riipu ASETUS.tikki-arvosta.
const aikaMs = (v, oletusS) => {
  const n = Number(v);
  if (!isFinite(n) || n < 0) return oletusS * 1000;
  return n >= 50 ? Math.round(n) : Math.round(n * 1000);
};
const aikaValiltaMs = (pari, oletusMinS, oletusMaxS, rnd) => {
  const a = Array.isArray(pari) ? pari[0] : undefined, b = Array.isArray(pari) ? pari[1] : undefined;
  const minMs = aikaMs(a, oletusMinS), maxMs = Math.max(minMs, aikaMs(b, oletusMaxS));
  const askel = (minMs % 1000 === 0 && maxMs % 1000 === 0) ? 1000 : 250;
  const n = Math.floor((maxMs - minMs) / askel);
  return minMs + Math.floor(rnd() * (n + 1)) * askel;
};
const arvoHuomaa = (s0, k, zn) => lukuValilta(ASETUS.huomaaVali, 5, 9, arpa(s0 * 3571 + k * 2903 + zn * 131));
const arvoLuovutus = (s0, k, zn) => lukuValilta(ASETUS.luovutusVali, 3, 5, arpa(s0 * 4421 + k * 1973 + zn * 229));
const arvoKuulo = (s0, k, zn) => lukuValilta(ASETUS.kuuloVali, 12, 20, arpa(s0 * 5801 + k * 2381 + zn * 179));
// kp 20:32-20:43 desync (agentti tmp/agent-684-desync.md kohta 1): tapahtumanoppien siemen 4 s lohkosta (floor(k/16)), ei tarkasta tikistä ->
//   koneet jotka huomaavat saman tapahtuman ±1 tikin eri aikaan saavat saman tuloksen.
const arvoReaktioMs = (s0, k, zn) => aikaValiltaMs(ASETUS.reaktioVali, 0, 3, arpa(s0 * 2749 + Math.floor(k / 16) * 4099 + zn * 193));
const arvoTaukoMs = (rnd) => aikaValiltaMs(ASETUS.vaellusTauko, 2, 5, rnd);
const arvoPerusAskel = (s0, k, zn) => lukuValilta(ASETUS.askelVali, 800, 1400, arpa(s0 * 6311 + k * 3307 + zn * 251));
const hystereesiVali = (z) => {
  const h = Number(ASETUS.huomaa ?? 7), m = Number(ASETUS.menetä ?? ASETUS.meneta ?? 11);
  if ((isFinite(h) && h !== 7) || (isFinite(m) && m !== 11)) return Math.max(0, (isFinite(m) ? m : 11) - (isFinite(h) ? h : 7));
  return Math.max(0, Number(z && z.luovutus != null ? z.luovutus : 4));
};

// Saman zombin dynaaminen nopeusvaihtelu: oma perusnopeus (800..1400 ms) + jatkuva kahden taajuuden aaltoilu (±20 %) +
//   satunnaiset lyhyet kiihdytykset/hidastukset (1..3 askelta) + pieni askelkohtainen vaihtelu, deterministisesti siemenestä.
const alustaNopeus = (z, s0, k, tMs, tikki) => {
  z.perusAskelMs = arvoPerusAskel(s0, k, z.n);
  const rnd = arpa(s0 * 5113 + k * 1789 + z.n * 313);
  z.aaltoVaihe = rnd() * Math.PI * 2;
  z.aaltoTaajuus = (Math.PI * 2) / (4 + rnd() * 4);
  z.aaltoVaihe2 = rnd() * Math.PI * 2;
  z.aaltoTaajuus2 = (Math.PI * 2) / (9 + rnd() * 6);
  z.askelNro = 0;
  z.puuskaAsk = 0;
  z.puuskaKerroin = 0;
  z.askelMs = z.perusAskelMs;
  z.viimeAskelMs = tMs;
  z.seuraavaAskelMs = tMs;
  z.piirtoAskelMs = tikki;
};
const laskeAskelMs = (z, s0, k) => {
  if (!z.perusAskelMs) alustaNopeus(z, s0, z.synty ?? SAILO.E, k * ASETUS.tikki, ASETUS.tikki);
  z.askelNro = (z.askelNro || 0) + 1;
  const rnd = arpa(s0 * 7331 + (z.synty ?? 0) * 4219 + z.n * 163 + z.askelNro * 997);
  const aalto = Math.sin(z.askelNro * z.aaltoTaajuus + z.aaltoVaihe) * 0.7 + Math.sin(z.askelNro * z.aaltoTaajuus2 + z.aaltoVaihe2) * 0.3;
  const vaihtelu = Math.max(0, Number(ASETUS.nopeusVaihtelu ?? 0.2));
  if (z.puuskaAsk > 0) {
    z.puuskaAsk--;
  } else if (rnd() < 0.25) {
    z.puuskaAsk = 1 + Math.floor(rnd() * 3);
    const suunta = rnd() < 0.5 ? -1 : 1;   // -1 = lyhyt pyrähdys, +1 = lyhyt hidastus
    z.puuskaKerroin = suunta * (0.08 + rnd() * 0.12);
  } else {
    z.puuskaKerroin = 0;
  }
  const kohina = (rnd() * 2 - 1) * 0.04;
  const kerroin = Math.max(0.55, Math.min(1.55, 1 + aalto * vaihtelu + (z.puuskaKerroin || 0) + kohina));
  const perus = lukuValilta(ASETUS.askelVali, 800, 1400, () => 0) <= z.perusAskelMs ? z.perusAskelMs : arvoPerusAskel(s0, z.synty ?? k, z.n);
  return Math.max(350, Math.min(2400, Math.round(perus * kerroin)));
};
const asetaAskelAika = (z, s0, k, tMs, tikki) => {
  z.askelMs = laskeAskelMs(z, s0, k);
  z.viimeAskelMs = tMs;
  const pohja = (z.seuraavaAskelMs != null && z.seuraavaAskelMs > tMs - tikki) ? z.seuraavaAskelMs : tMs;
  z.seuraavaAskelMs = Math.max(tMs + tikki, pohja + z.askelMs);
  z.piirtoAskelMs = Math.max(tikki, Math.ceil(z.seuraavaAskelMs / tikki) * tikki - tMs);
};
const varmistaZombi = (z, s0, k, tMs, tikki) => {
  const synty = z.synty ?? SAILO.E;
  if (z.huomaa == null) z.huomaa = arvoHuomaa(s0, synty, z.n);
  if (z.luovutus == null) z.luovutus = arvoLuovutus(s0, synty, z.n);
  if (z.kuulo == null) z.kuulo = arvoKuulo(s0, synty, z.n);
  z.meneta = Math.max(z.huomaa, z.huomaa + hystereesiVali(z));
  if (!z.perusAskelMs || z.viimeAskelMs == null || z.seuraavaAskelMs == null) alustaNopeus(z, s0, synty, tMs, tikki);
};

// ---- Kuolemamakuu (kp 19:25 & 19:54): kiinnijäädessä JOKAINEN client näyttää uhrin hahmon paikallisesti makaavana ('lay')
//   ASETUS.kuolemaMakuu (1500 ms) ajan ennen zk684-teleporttia. Makuun aikana uhri ei voi jäädä uudelleen kiinni, nappaava zombi
//   pysyy paikallaan syömässä/seisomassa uhrin vieressä, ja uhrin muuttunut zombiversio syntyy uhrin ruutuun vasta makuun päätyttyä.
const makuuAjastimet = new Set();
const asetaHahmonAsento = (ri, asento) => {
  if (ri == null || ri < 0 || !e || typeof e.updateRoomObjectUserPosture !== 'function') return false;
  try { e.updateRoomObjectUserPosture(huone, ri, asento, ''); return true; } catch (x) { return false; }
};
const onMakaava = (pid, tMs) => {
  const mk = SAILO.makaavat && SAILO.makaavat.get(pid);
  if (!mk) return false;
  if (tMs != null && tMs >= mk.loppuMs) return false;
  return true;
};
// Maalisuoja (kp 30.10. 22:16): voittokuiskauksen saanut pelaaja ei ole kohde eikä kerrytä kontaktia ennen loppuMs:ää (sama sääntö kaikilla clienteillä)
const onMaalissa = (pid, tMs) => {
  const m = SAILO.maalissa instanceof Map ? SAILO.maalissa.get(pid) : null;
  return !!m && tMs != null && tMs < m.loppuMs;
};
const paivitaMakaavat = (P, tMs, k, tikki, s0) => {
  if (!(SAILO.makaavat instanceof Map) || !SAILO.makaavat.size) return;
  for (const [pid, mk] of [...SAILO.makaavat.entries()]) {
    const p = Array.isArray(P) ? P.find(x => x && x.id === pid) : null;
    const ri = (p && p.i != null) ? p.i : mk.i;
    const telesi = p && isFinite(p.x) && isFinite(p.y) && Math.hypot(p.x - mk.x, p.y - mk.y) > 3;
    const aikaTaynna = (tMs != null && tMs >= mk.loppuMs);
    // kp 20:43 "hahmo näkyy pystyssä kun kuolee ennen ku telee": teleportti tulee verkon yli makuun JÄLKEEN ->
    //   asento pysyy 'lay' teleporttiin asti (telesi), enintään ASETUS.muuttunutViive (2500 ms) makuun jälkeen.
    const asentoAika = (tMs != null && tMs >= mk.loppuMs + Math.max(0, Number(ASETUS.muuttunutViive ?? 2500)));
    if (!p || telesi || asentoAika) {
      if (mk.ajastin) { clearTimeout(mk.ajastin); makuuAjastimet.delete(mk.ajastin); mk.ajastin = null; }
      if (!mk.asentoPalautettu) { asetaHahmonAsento(ri, 'std'); mk.asentoPalautettu = true; }
    } else if (!mk.asentoPalautettu) {
      try {
        const ho = e.getRoomObject && e.getRoomObject(huone, ri, 100);
        const nyk = ho && ho.model && ho.model.getValue && ho.model.getValue('figure_posture');
        if (nyk && nyk !== 'lay') asetaHahmonAsento(ri, 'lay');
      } catch (x) {}
    }
    // kp 20:26 "näkyy hahmo samaa aikaa siin zombin kaa": teleportti näkyy muille vasta verkon yli makuun jälkeen ->
    //   muuttunut syntyy kiinteällä lisäviiveellä (ASETUS.muuttunutViive), sama simulaatioaika kaikilla clienteillä.
    if (tMs != null && tMs >= mk.loppuMs + Math.max(0, Number(ASETUS.muuttunutViive ?? 2500)) && k != null) {
      if (!mk.muuttunutLuotu) {
        mk.muuttunutLuotu = true;
        if (ASETUS.muuttunutKuolemasta !== false) luoMuuttunut(mk, mk.suunta, k, tMs, tikki || Math.max(50, Number(ASETUS.tikki) || 250), s0 || perusSiemen(), P);
      }
      SAILO.makaavat.delete(pid);
    }
  }
};
const aloitaMakuu = (kp, suunta, k, tMs, tikki, s0, P) => {
  if (!kp || !kp.id) return;
  const makuuMs = Math.max(0, Number(ASETUS.kuolemaMakuu ?? 1500));
  const vanha = SAILO.makaavat.get(kp.id);
  if (vanha && vanha.ajastin) { clearTimeout(vanha.ajastin); makuuAjastimet.delete(vanha.ajastin); }
  const zn = ++SAILO.seuraavaMuuttunutN;
  const siem = s0 || perusSiemen();
  const lm = luoLammikko(kp.x, kp.y, zn, kp, k, tMs, siem);
  if (!Array.isArray(SAILO.lammikot)) SAILO.lammikot = [];
  SAILO.lammikot = SAILO.lammikot.filter(l => l && (l.lahdeId ?? l.id) !== kp.id);
  SAILO.lammikot.push(lm);
  // kp 20:06 "kai kuollessa targeted pelaaja resetoituu, vaik ois huutanu": uhrin äänet pois, ettei vanha huuto vedä zombeja hänen peräänsä
  if (Array.isArray(SAILO.aanet)) SAILO.aanet = SAILO.aanet.filter(a => a && a.id !== kp.id);
  paivitaLammikot(P);
  const mk = {
    id: kp.id, i: kp.i, nimi: kp.nimi || null, figuuri: kp.figuuri || figuuri,
    x: kp.x, y: kp.y, suunta: suunta ?? 4, zn, lammikko: lm,
    alkuK: k, alkuMs: tMs, loppuMs: tMs + makuuMs,
    muuttunutLuotu: false, asentoPalautettu: false, ajastin: null,
  };
  if (makuuMs <= 0) {
    SAILO.makaavat.delete(kp.id);
    mk.muuttunutLuotu = true;
    luoMuuttunut(mk, mk.suunta, k, tMs, tikki || Math.max(50, Number(ASETUS.tikki) || 250), siem, P);
    return;
  }
  asetaHahmonAsento(kp.i, 'lay');
  mk.ajastin = setTimeout(() => {
    makuuAjastimet.delete(mk.ajastin);
    mk.ajastin = null;
    if (SAILO.makaavat.get(kp.id) === mk && !mk.asentoPalautettu) {
      mk.asentoPalautettu = true;
      const P2 = pelaajat(), p = P2.find(x => x && x.id === kp.id);
      asetaHahmonAsento((p && p.i != null) ? p.i : mk.i, 'std');
    }
  }, makuuMs + Math.max(0, Number(ASETUS.muuttunutViive ?? 2500)));   // kp 20:43: pystyyn vasta teleportin jälkeen (paivitaMakaavat palauttaa aiemmin jos teleporttasi)
  if (mk.ajastin && typeof mk.ajastin.unref === 'function') mk.ajastin.unref();
  makuuAjastimet.add(mk.ajastin);
  SAILO.makaavat.set(kp.id, mk);
};

// Zombikohtainen kohdevalinta: huomaa pelaajan kun BFS-reittietäisyys <= z.huomaa (5..9),
//   luopuu kun etäisyys > z.meneta (z.huomaa + z.luovutus, 3..5; hystereesi). Muuttunut EI jahtaa omaa lähdepelaajaansa (z.lahdeId).
// kp 19:15: kohteen vaihto jos toinen pelaaja on SELVÄSTI lähempänä (B <= A - vaihtoEro) tai äänen perusteella.
const valitseKohde = (z, dz, P, k, tMs, s0) => {
  if (z.huomaa == null) z.huomaa = arvoHuomaa(perusSiemen(), z.synty ?? SAILO.E, z.n);
  if (z.luovutus == null) z.luovutus = arvoLuovutus(perusSiemen(), z.synty ?? SAILO.E, z.n);
  const huomaa = Math.max(0, Number(z.huomaa));
  const meneta = Math.max(huomaa, huomaa + hystereesiVali(z));
  z.meneta = meneta;

  const ehdokkaat = [];
  let nykyinenEt = -1, nykyinenP = null;

  for (const p of P) {
    if (!onKohde(p)) continue;
    if (onMakaava(p.id, tMs)) continue;   // kuolemamakuun aikana uhria ei jahdata
    if (onMaalissa(p.id, tMs)) continue;   // maalisuojan aikana ei jahdata; nykyinen kohde pudotetaan (-> toinen kohde tai vaellus)
    if (z.muuttunut && p.id === z.lahdeId) continue;   // muuttunut ei jahtaa omaa lähdepelaajaansa
    const et = etaisyysPelaajaan(dz, p);
    if (et < 0) continue;   // yläkerroksessa tai muualla minne zombi ei pääse
    const raja = p.id === z.kohdeId ? meneta : huomaa;
    // kp 19:24 "heti kun on este välissä ei enää targettaa": ammuttavassa näköpiiri mitataan suoraan, ei kävelyreittiä. Kävely kiertää esteen.
    if ((ASETUS.ammuttava ? Math.min(et, Math.hypot(p.x - z.x, p.y - z.y)) : et) > raja) continue;   // näköpiirin ulkopuolella
    // Teleportannut (yli 3 ruutua tikissä = kuoli ja siirtyi ovelle, tai tuli huoneeseen) ei ole kohde ikkunan aikana.
    const l = liike(p.id); if (l.hyppy > 3) continue;
    const m = l.s;
    const obj = { ...p, m, et };
    ehdokkaat.push(obj);
    if (p.id === z.kohdeId) { nykyinenEt = et; nykyinenP = obj; }
  }

  if (!ehdokkaat.length) return null;

  // kp 21:54 "menin zombie jono välii ku jahtas toista · ei tullu mun kimppuu": vieressä (BFS <= ASETUS.vieressa, oletus 1) oleva pelaaja
  //   voittaa aina: jahdatessa vaihto heti ilman arvontaa ja ilman reaktioviivettä, jos hän on lähempänä kuin nykyinen kohde;
  //   ilman kohdetta valitaan lähin vieressä oleva (muuten hitain kuten ennen).
  const vieressaRaja = Math.max(0, Number(ASETUS.vieressa ?? 1));
  const vieressa = ehdokkaat.filter(e => e.et <= vieressaRaja).sort((p, q) => p.et - q.et || p.m - q.m || p.id - q.id)[0] || null;

  // 1. Jos zombi jo jahtaa kohdetta ja nykyinen kohde on yhä kelvollinen:
  if (nykyinenP) {
    // kp 23:25 "proximity voittaa aina · eivät seuraa ääntä tarpeeksi · pitää vaikuttaa targettaukseen enemmän": ääni (A) arvioidaan
    //   ENSIN, lähisäännöt (vieressä, puolet lähempänä) vasta sen jälkeen.
    // A) Äänivaihto (kp 19:15): kun jahtaava zombi kuulee uuden äänen pelaajalta B != kohdeId ja B on lähellä (et <= huomaa; huuto x1.5)
    if (Array.isArray(SAILO.aanet) && SAILO.aanet.length) {
      const kestoMs = Math.max(1000, aikaMs(ASETUS.aaniKesto ?? 30000, 30));
      for (let i = SAILO.aanet.length - 1; i >= 0; i--) {
        const a = SAILO.aanet[i];
        if (!a || (tMs != null && tMs - a.alkuMs >= kestoMs) || (k != null && a.k > k)) continue;
        if (a.id === z.kohdeId) continue;
        if (z.muuttunut && a.id === z.lahdeId) continue;
        const b = ehdokkaat.find(e => e.id === a.id);
        if (!b) continue;
        const aaniRaja = Math.round(huomaa * (a.huuto ? 1.5 : 1));
        if (b.et > aaniRaja) continue;

        // Arvonta kerran per uusi ääniviesti (äänen k / alkuMs + zombin n)
        const aaniAvain = a.id + ':' + (a.alkuMs || a.k);
        if (!z._aaniVaihtoArvottu) z._aaniVaihtoArvottu = new Set();
        if (!z._aaniVaihtoArvottu.has(aaniAvain)) {
          z._aaniVaihtoArvottu.add(aaniAvain);
          const perusTn = Array.isArray(ASETUS.aaniVaihtoTn) ? (a.huuto ? ASETUS.aaniVaihtoTn[1] : ASETUS.aaniVaihtoTn[0]) : 0.4;
          const tn = Math.min(Number(ASETUS.aaniVaihtoMax ?? 0.8), (Number(perusTn) || 0.4) * (a.voima || 1));
          const rndAani = arpa(s0 * 3821 + (a.alkuMs || a.k || 0) * 1109 + z.n * 73);
          if (rndAani() < tn) {
            z._vaihdettuKohteeseen = true;
            return b;
          }
        }
      }
    }

    if (vieressa && vieressa.id !== z.kohdeId && vieressa.et < nykyinenEt) {
      z._vaihdettuKohteeseen = true; z._valitonVaihto = true;
      return vieressa;
    }
    // kp 22:19 "purkka korjaus. jos on puolet lähempänä kuin jahdattava esim niin pitäs riittää": pelaaja, jonka BFS-etäisyys on
    //   enintään ASETUS.vaihtoSuhde (0.5) x nykyisen kohteen etäisyys (ja <= huomaa), vie kohteen aina, ilman arvontaa (normaali reaktioviive).
    const vaihtoSuhde = Number(ASETUS.vaihtoSuhde ?? 0.5);
    if (vaihtoSuhde > 0) {
      const puolet = ehdokkaat.filter(e => e.id !== z.kohdeId && e.et <= huomaa && e.et <= nykyinenEt * vaihtoSuhde)
        .sort((p, q) => p.et - q.et || p.m - q.m || p.id - q.id)[0];
      if (puolet) { z._vaihdettuKohteeseen = true; return puolet; }
    }
    // B) Selvästi lähempänä oleva pelaaja B (B <= A - vaihtoEro)
    const vaihtoEro = Math.max(1, Number(ASETUS.vaihtoEro ?? 3));
    const laheisemmat = ehdokkaat.filter(e => e.id !== z.kohdeId && e.et <= huomaa && e.et <= nykyinenEt - vaihtoEro);
    if (laheisemmat.length) {
      laheisemmat.sort((p, q) => p.et - q.et || p.m - q.m || p.id - q.id);
      const parasB = laheisemmat[0];
      const vaihtoVali = Math.max(500, Number(ASETUS.vaihtoVali ?? 3000));
      const pariAvain = z.kohdeId + '->' + parasB.id;
      if (z._viimeVaihtoAvain !== pariAvain || (tMs != null && tMs - (z._viimeVaihtoMs || 0) >= vaihtoVali)) {
        z._viimeVaihtoAvain = pariAvain;
        z._viimeVaihtoMs = tMs || 0;
        const vaihtoTn = Number(ASETUS.vaihtoTn ?? 0.5);
        const kAika = k ?? Math.floor((tMs || 0) / 250);
        const rndVaihto = arpa(s0 * 4787 + Math.floor(kAika / Math.max(1, Math.round(vaihtoVali / 250))) * 1237 + z.n * 67 + parasB.id * 31);
        if (rndVaihto() < vaihtoTn) {
          z._vaihdettuKohteeseen = true;
          return parasB;
        }
      }
    }

    // Jos ei vaihdettu, pidetään nykyinen kohde
    return nykyinenP;
  }

  // 2. Ei nykyistä kohdetta -> vieressä oleva ensin, muuten hitain (pienin liike ikkunassa, tasapelissä pienin id)
  if (vieressa) return vieressa;
  let paras = null;
  for (const e of ehdokkaat) {
    if (!paras || e.m < paras.m) paras = e;
  }
  return paras;
};
const arvoKontaktiRajaMs = (s0, k, zn, pid) => {
  const kiintea = ASETUS.kontakti !== 3 && ASETUS.kontaktiMin === 3 && ASETUS.kontaktiMax === 6;
  const pari = kiintea ? [ASETUS.kontakti, ASETUS.kontakti] : [ASETUS.kontaktiMin ?? ASETUS.kontakti ?? 3, ASETUS.kontaktiMax ?? ASETUS.kontakti ?? 6];
  return Math.max(250, aikaValiltaMs(pari, 3, 6, arpa(s0 * 4999 + Math.floor(k / 16) * 6151 + zn * 97 + (pid || 0))));
};

// Huoneviestien ääniveto (vaeltaessa): aktiiviset äänet kuuloetäisyydellä painottavat vaellussuuntaa vinosti ääntä kohti.
const etsiAani = (z, dz, k, tMs) => {
  const kestoMs = Math.max(1000, aikaMs(ASETUS.aaniKesto ?? 30000, 30));
  const kuulo = Math.max(1, Number(z.kuulo ?? 16));
  const ryhmat = new Map();
  for (let i = SAILO.aanet.length - 1; i >= 0; i--) {
    const a = SAILO.aanet[i];
    if (!a || tMs - a.alkuMs >= kestoMs) { if (a && tMs - a.alkuMs >= kestoMs) SAILO.aanet.splice(i, 1); continue; }
    if (a.k > k) continue;
    if (z.muuttunut && a.id === z.lahdeId) continue;
    const et = etaisyysPelaajaan(dz, a);
    const raja = Math.round(kuulo * (a.huuto ? 1.5 : 1));
    if (et <= 0 || et > raja) continue;
    const teho = (a.voima || 1) * Math.max(0, 1 - (tMs - a.alkuMs) / kestoMs);
    if (teho <= 0.02) continue;
    const av = a.id || (a.y * 1000 + a.x);
    const vanha = ryhmat.get(av);
    if (vanha) {
      vanha.paino = Math.min(3.5, vanha.paino + teho);
      if (a.alkuMs >= vanha.alkuMs) { vanha.x = a.x; vanha.y = a.y; vanha.alkuMs = a.alkuMs; vanha.et = et; }
    } else {
      ryhmat.set(av, { id: a.id, x: a.x, y: a.y, paino: Math.min(3.5, teho), alkuMs: a.alkuMs, et });
    }
  }
  let paras = null;
  for (const r of ryhmat.values()) if (!paras || r.paino > paras.paino || (r.paino === paras.paino && r.et < paras.et)) paras = r;
  return paras;
};

// Vaellus ilman kohdetta: liikkuu muutaman ruudun pätkiä (vaellusAskeleet 2..4, asento 'mv'),
//   seisoo hetken paikallaan (vaellusTauko 2..5 s, asento 'std'), ja jatkaa uuteen suuntaan (mahdollinen ääniveto painottaa vinosti ääntä kohti).
//   Kun äänen paino >= ASETUS.tutkiRaja (1.8), zombi tutkii ääntä ja kävelee BFS-reittiä suoraan äänen lähtöruutuun ilman vaellustaukoja.
// Kohde 5 (kp 18:04, 18:12): aitamekaniikka 817. Palakohtainen HP, isku safe housen tavoin.
const aitaTila = () => {
  if (!ASETUS.aidat) return null;
  const A = SAILO.aidat && typeof SAILO.aidat === 'object' ? SAILO.aidat : (SAILO.aidat = {});
  if (!Array.isArray(A.palat)) {
    A.palat = (ASETUS.aidat.palat || []).map(p => ({ ...p, max: p.hp || ASETUS.aidat.hp || 50 }));
  }
  if (!(A.tuhoutuneetIds instanceof Set)) A.tuhoutuneetIds = new Set();
  if (!(A.tuhoutuneetRuudut instanceof Set)) A.tuhoutuneetRuudut = new Set();
  if (!(A.iskut >= 0)) A.iskut = 0;
  return A;
};
const nollaaAidat = () => {
  const A = aitaTila(); if (!A) return;
  A.palat = (ASETUS.aidat.palat || []).map(p => ({ ...p, max: p.hp || ASETUS.aidat.hp || 50 }));
  A.tuhoutuneetIds.clear(); A.tuhoutuneetRuudut.clear(); A.iskut = 0; A.viime = 0;
  // Palauta spritejen näkyvyys
  try {
    const ids = new Set((ASETUS.aidat.palat || []).map(p => p.id));
    for (const o of e.getRoomObjects(huone, 10) || []) {
      if (!o || !ids.has(o.id)) continue;
      for (const q of (o.visualization && o.visualization.sprites) || []) {
        if (q.alpha === 0) { q.alpha = 255; if (q.increaseUpdateCounter) q.increaseUpdateCounter(); }
      }
    }
  } catch (x) {}
  kitEsteMuisti = null;
  if (ruudukko) { const r = rakenna(); if (r && r.ruudut.length) ruudukko = r; }
};
const paivitaAitaPiilotukset = () => {
  const A = aitaTila(); if (!A || !A.tuhoutuneetIds.size) return;
  try {
    for (const o of e.getRoomObjects(huone, 10) || []) {
      if (!o || !A.tuhoutuneetIds.has(o.id)) continue;
      for (const q of (o.visualization && o.visualization.sprites) || []) {
        if (q.alpha !== 0) { q.alpha = 0; if (q.increaseUpdateCounter) q.increaseUpdateCounter(); }
      }
    }
  } catch (x) {}
};
let aitaIskut = null, aitaAsti = 0, aitaPaalla = false;
const aitaSavy = (vari) => {
  const A = aitaTila(); if (!A) return;
  try {
    const ids = new Set((ASETUS.aidat.palat || []).map(p => p.id));
    for (const o of e.getRoomObjects(huone, 10) || []) {
      if (!o || !ids.has(o.id) || A.tuhoutuneetIds.has(o.id)) continue;
      for (const q of (o.visualization && o.visualization.sprites) || []) {
        if (q.alpha !== 255 || q.blendMode === 'add') continue;
        if (q.color !== vari) { q.color = vari; if (q.increaseUpdateCounter) q.increaseUpdateCounter(); }
      }
    }
  } catch (x) {}
};
const aitaValahdys = (nyt) => {
  const A = aitaTila(); if (!A) return;
  if (aitaIskut != null && A.iskut > aitaIskut) aitaAsti = nyt + Math.max(50, Number(ASETUS.aidat.valahdysMs) || 300);
  aitaIskut = A.iskut;
  if (nyt < aitaAsti) { aitaPaalla = true; aitaSavy(Math.floor(nyt / 120) % 2 ? 0xff9090 : 0xff2a2a); }
  else if (aitaPaalla) { aitaPaalla = false; aitaSavy(0xffffff); }
};
const kohtiAitaa = (k, tMs, tikki, z, varattu, s0, a, kentat) => {
  const AI = ASETUS.aidat; if (!AI || !ruudukko || z.muuttunut) return false;
  const AT = aitaTila(); if (!AT) return false;
  // kp 19:10 "jäi vasemmalle vaa seisoo": portin 13,28 takana on este, joten yhden palan tuho ei aina avaa reittiä. Hakataan niin kauan kuin safe houselle ei ole reittiä.
  const { W, H, ok } = ruudukko, SH0 = ASETUS.safeHouse;
  if (SH0 && Array.isArray(SH0.ruudut)) { let d0 = kentat && kentat.get('sh'); if (!d0) { d0 = bfsKentta(W, H, ok, SH0.ruudut.filter(r => Array.isArray(r)).map(r => ({ x: r[0], y: r[1] }))).d; if (kentat) kentat.set('sh', d0); } if (d0[z.y * W + z.x] >= 0) return false; }
  const hr = (AI.hyokkaysRuudut || []).filter(r => Array.isArray(r) && ok[r[1] * W + r[0]] && AT.palat.some(p => p.hp > 0 && p.x === r[0] + r[2] && p.y === r[1] + r[3]));
  if (!hr.length) return false;

  let da = kentat && kentat.get('aita');
  if (!da) { da = bfsKentta(W, H, ok, hr.map(r => ({ x: r[0], y: r[1] }))).d; if (kentat) kentat.set('aita', da); }
  const nyt = da[z.y * W + z.x]; if (nyt < 0) return false;

  z.vAsk = 0; z.vTauko = 0; z.vTaukoMs = 0; z.vTaukoAsti = 0; z.vDx = 0; z.vDy = 0;
  if (nyt > 0) {
    let paras = null;
    for (const [dx, dy] of NAAP) {
      const x = z.x + dx, y = z.y + dy, j = y * W + x;
      if (x < 0 || y < 0 || x >= W || y >= H || da[j] < 0 || varattu.has(j) || !(da[j] < nyt)) continue;
      if (a && x === a.x && y === a.y) continue;
      if (dx !== 0 && dy !== 0 && (!ok[z.y * W + x] || !ok[y * W + z.x])) continue;
      if (!paras || da[j] < paras.d) paras = { x, y, d: da[j], dx, dy };
    }
    z.aita = 'kulkee';
    if (paras) { z.x = paras.x; z.y = paras.y; z.suunta = suunnaksi(paras.dx, paras.dy); asetaAskelAika(z, s0, k, tMs, tikki); return true; }
    z.seuraavaAskelMs = tMs + tikki; z.piirtoAskelMs = tikki; return true;
  }

  // perillä hyökkäysruudussa: etsi kohdepala ja iske
  const r = hr.find(q => q[0] === z.x && q[1] === z.y);
  if (r && (r[2] || r[3])) z.suunta = suunnaksi(Math.sign(r[2] || 0), Math.sign(r[3] || 0));
  z.aita = 'iskee'; z.seuraavaAskelMs = tMs + tikki; z.piirtoAskelMs = tikki;

  const iskuMs = Math.max(tikki, Number(AI.iskuMs) || 1000);
  if (!SYNK.seuraa() && tMs - (z.aitaIsku ?? -1e15) >= iskuMs) {
    z.aitaIsku = tMs;
    // Etsi pala johon isketään (esim. ruudussa z.x+r[2], z.y+r[3] tai lähin ehjä pala)
    const tx = z.x + (r ? r[2] : 1), ty = z.y + (r ? r[3] : 0);
    const pala = AT.palat.find(p => (p.x === tx && p.y === ty && p.hp > 0)) || AT.palat.find(p => p.hp > 0);
    if (pala) {
      pala.hp = Math.max(0, pala.hp - Math.max(0, Number(AI.vahinko) || 1));
      AT.iskut++; AT.viime = tMs;
      if (pala.hp <= 0) {
        AT.tuhoutuneetIds.add(pala.id);
        AT.tuhoutuneetRuudut.add(pala.x + ',' + pala.y);
        lokiin({ aitaTuhoutui: pala.id, x: pala.x, y: pala.y, iskut: AT.iskut });
        kitEsteMuisti = null;
        if (ruudukko) { const uusiR = rakenna(); if (uusiR && uusiR.ruudut.length) ruudukko = uusiR; }
      }
    }
  }
  return true;
};

// Vaihe 1c: safe house kohteettoman zombin oletustavoitteena (ASETUS.safeHouse; 684: null -> false heti, vaellus ennallaan).
//   true = tämä tikki hoidettiin (askel kohti tai isku), false = ei safe housea / ei reittiä -> tavallinen vaellus.
//   Deterministinen kuten jahti: sama BFS-kenttä, NAAP-järjestys ja varattu-joukko kaikilla. Isku (HP) vain auktoriteetilla (!SYNK.seuraa()).
const safeHouseTila = () => { if (!ASETUS.safeHouse) return null; const S = SAILO.safeHouse && typeof SAILO.safeHouse === 'object' ? SAILO.safeHouse : (SAILO.safeHouse = {});
  const max = Math.max(1, Number(ASETUS.safeHouse.hp) || 100); if (!(S.max > 0)) S.max = max; if (!(S.hp >= 0)) S.hp = max; if (!(S.iskut >= 0)) S.iskut = 0; return S; };
let shLohkoMuisti = null;
const shLohkot = (SH) => { if (shLohkoMuisti && shLohkoMuisti.SH === SH) return shLohkoMuisti.l;   // kierrossa rakennuksen ympäri, noin 4 ruutua lohkossa
  const r = SH.ruudut.filter(q => Array.isArray(q)).map(q => ({ x: q[0], y: q[1] })), n = r.length || 1, cx = r.reduce((a, q) => a + q.x, 0) / n, cy = r.reduce((a, q) => a + q.y, 0) / n;
  r.sort((p, q) => Math.atan2(p.y - cy, p.x - cx) - Math.atan2(q.y - cy, q.x - cx));
  const l = []; for (let i = 0; i < r.length; i += 4) l.push(r.slice(i, i + 4)); shLohkoMuisti = { SH, l }; return l; };
const kohtiSafeHousea = (k, tMs, tikki, z, varattu, s0, a, kentat) => {
  const SH = ASETUS.safeHouse; if (!SH || !Array.isArray(SH.ruudut) || !SH.ruudut.length || !ruudukko || z.muuttunut) return false;
  const { W, H, ok } = ruudukko;
  const lohkot = shLohkot(SH), li = lohkot.length ? z.n % lohkot.length : -1;
  let ds = null;
  if (li >= 0) { const avain = 'sh' + li; ds = kentat && kentat.get(avain); if (!ds) { ds = bfsKentta(W, H, ok, lohkot[li]).d; if (kentat) kentat.set(avain, ds); } if (ds[z.y * W + z.x] < 0) ds = null; }
  if (!ds) ds = kentat && kentat.get('sh');
  if (!ds) { ds = bfsKentta(W, H, ok, SH.ruudut.filter(r => Array.isArray(r)).map(r => ({ x: r[0], y: r[1] }))).d; if (kentat) kentat.set('sh', ds); }
  const nyt = ds[z.y * W + z.x]; if (nyt < 0) { z.safe = null; return false; }   // ei reittiä / yksikään ruutu ei kelpaa
  z.vAsk = 0; z.vTauko = 0; z.vTaukoMs = 0; z.vTaukoAsti = 0; z.vDx = 0; z.vDy = 0;
  if (nyt > Math.max(0, Number(SH.etaisyys) || 0)) {
    let paras = null;
    for (const [dx, dy] of NAAP) {
      const x = z.x + dx, y = z.y + dy, j = y * W + x;
      if (x < 0 || y < 0 || x >= W || y >= H || ds[j] < 0 || varattu.has(j) || !(ds[j] < nyt)) continue;
      if (a && x === a.x && y === a.y) continue;
      if (dx !== 0 && dy !== 0 && (!ok[z.y * W + x] || !ok[y * W + z.x])) continue;
      if (!paras || ds[j] < paras.d) paras = { x, y, d: ds[j], dx, dy };
    }
    z.safe = 'kulkee';
    if (paras) { z.x = paras.x; z.y = paras.y; z.suunta = suunnaksi(paras.dx, paras.dy); asetaAskelAika(z, s0, k, tMs, tikki); return true; }
    z.seuraavaAskelMs = tMs + tikki; z.piirtoAskelMs = tikki; return true;   // tukossa (toinen zombi edessä): odottaa paikallaan
  }
  // perillä: kääntyy seinää kohti ja iskee (iskuMs välein); seisoo ('std')
  const r = SH.ruudut.find(q => Array.isArray(q) && q[0] === z.x && q[1] === z.y) || SH.ruudut.reduce((b, q) => (Array.isArray(q) && (!b || Math.hypot(q[0] - z.x, q[1] - z.y) < Math.hypot(b[0] - z.x, b[1] - z.y)) ? q : b), null);
  if (r && (r[2] || r[3])) z.suunta = suunnaksi(Math.sign(r[2] || 0), Math.sign(r[3] || 0));
  z.safe = 'iskee'; z.seuraavaAskelMs = tMs + tikki; z.piirtoAskelMs = tikki;
  const S = safeHouseTila(), iskuMs = Math.max(tikki, Number(SH.iskuMs) || 1000);
  if (S && !SYNK.seuraa() && tMs - (z.shIsku ?? -1e15) >= iskuMs) {
    z.shIsku = tMs;
    const ennen = S.hp; S.hp = Math.max(0, S.hp - Math.max(0, Number(SH.vahinko) || 1)); S.iskut++; S.viime = tMs; S.ix = z.x; S.iy = z.y;
    if (ennen > 0 && S.hp <= 0) lokiin({ safeHouse: 'HP 0 (vaihe 2: pelin loppu ei toteutettu)', iskut: S.iskut });
  }
  return true;
};
const vaella = (k, tMs, tikki, z, dz, varattu, s0, a, kentat) => {
  const rnd = arpa(s0 * 1009 + k * 9176 + z.n * 37 + (z.askelNro || 0) * 19);
  const aani = dz ? etsiAani(z, dz, k, tMs) : null;
  z.aaniKohde = aani ? { x: aani.x, y: aani.y, paino: Math.round(aani.paino * 100) / 100 } : null;

  const tutkiRaja = Number(ASETUS.tutkiRaja ?? 1.8);
  const tutkiEtaisyys = Number(ASETUS.tutkiEtaisyys ?? 2);
  const onTutkinta = !!(aani && aani.paino >= tutkiRaja);
  if (!onTutkinta) {
    if (kohtiAitaa(k, tMs, tikki, z, varattu, s0, a, kentat)) return;
    if (kohtiSafeHousea(k, tMs, tikki, z, varattu, s0, a, kentat)) return;
  }   // vaihe 1c (811): oletustavoite, ks. HUONEET[811].safeHouse

  if ((z.vTaukoAsti || 0) > tMs) {
    if (onTutkinta) {
      // tutkiRaja ylittävä ääni katkaisee käynnissä olevan vaellustauon heti
      z.vTaukoAsti = 0;
      z.vTaukoMs = 0;
      z.vTauko = 0;
    } else {
      // Mikä tahansa ääni (paino >= 1) lyhentää käynnissä olevaa vaellustaukoa
      if (aani && aani.paino >= 1.0 && z.vTaukoAsti - tMs > 1250 && z._aaniLyh !== aani.alkuMs) {
        z._aaniLyh = aani.alkuMs;
        z.vTaukoAsti = tMs + Math.max(tikki, Math.round((z.vTaukoAsti - tMs) * 0.45 / tikki) * tikki);
      }
      if (z.vTaukoAsti > tMs) {
        z.vTaukoMs = z.vTaukoAsti - tMs;
        z.vTauko = Math.ceil(z.vTaukoMs / 1000);
        z.seuraavaAskelMs = tMs + tikki;
        z.piirtoAskelMs = tikki;
        return;   // seisoo paikallaan -> px === x, py === y -> asento 'std'
      }
    }
  }
  z.vTaukoMs = 0; z.vTauko = 0; z.vTaukoAsti = 0;

  const { W, H, ok } = ruudukko, ehdokkaat = [];
  for (const [dx, dy] of NAAP) {
    const x = z.x + dx, y = z.y + dy, j = y * W + x;
    if (x < 0 || y < 0 || x >= W || y >= H || !ok[j] || varattu.has(j)) continue;
    if (a && x === a.x && y === a.y) continue;
    if (dx !== 0 && dy !== 0 && (!ok[z.y * W + x] || !ok[y * W + z.x])) continue;
    ehdokkaat.push({ x, y, dx, dy });
  }
  if (!ehdokkaat.length) {
    z.vAsk = 0; z.vDx = 0; z.vDy = 0;
    const taukoMs = arvoTaukoMs(rnd);
    z.vTaukoAsti = tMs + taukoMs; z.vTaukoMs = taukoMs; z.vTauko = Math.ceil(taukoMs / 1000);
    z.seuraavaAskelMs = tMs + tikki; z.piirtoAskelMs = tikki;
    return;
  }

  // "Tutkiminen": kun ryhmän paino >= ASETUS.tutkiRaja (oletus 1.8), vaeltava zombi kävelee REITTIÄ PITKIN
  // (sama BFS-kenttä kentta(aani.x, aani.y)) kohti äänen LÄHTÖRUUTUA (ei pelaajaa) vaellusnopeudella,
  // ilman vaellustaukoja, kunnes on <= 2 ruudun päässä siitä tai ääni hiipuu alle rajan.
  if (onTutkinta) {
    const avain = 'a:' + aani.x + ',' + aani.y;
    let da = kentat && kentat.get(avain);
    if (!da) { da = kentta(aani.x, aani.y); if (kentat) kentat.set(avain, da); }
    const nytD = da[z.y * W + z.x];

    if (nytD > tutkiEtaisyys) {
      let paras = null;
      for (const e of ehdokkaat) {
        const d = da[e.y * W + e.x];
        if (d >= 0 && (nytD < 0 || d < nytD) && (!paras || d < paras.d)) paras = { ...e, d };
      }
      if (paras) {
        z.vDx = paras.dx; z.vDy = paras.dy;
        z.x = paras.x; z.y = paras.y; z.suunta = suunnaksi(paras.dx, paras.dy);
        z.vAsk = 0; // tutkiessa ei vaellusaskelpätkiä eikä taukoja
        z.vTaukoAsti = 0; z.vTaukoMs = 0; z.vTauko = 0;
        asetaAskelAika(z, s0, k, tMs, tikki);
        return;
      }
    }
    // Jos etäisyys on jo <= tutkiEtaisyys (2) tai reittiä ei löydy, jatketaan normaalilla vaelluksella
  }

  if (!(z.vAsk > 0)) {
    z.vAsk = lukuValilta(ASETUS.vaellusAskeleet, 2, 4, rnd);
    z.vDx = 0; z.vDy = 0;
  }

  let valittu = (z.vDx || z.vDy) ? ehdokkaat.find(e => e.dx === z.vDx && e.dy === z.vDy) : null;
  if (!valittu) {
    const vastasuunta = (z.suunta + 4) & 7;
    const muut = ehdokkaat.filter(e => suunnaksi(e.dx, e.dy) !== vastasuunta);
    const joukko = muut.length ? muut : ehdokkaat;
    if (aani && joukko.length > 1) {
      const avain = 'a:' + aani.x + ',' + aani.y;
      let da = kentat && kentat.get(avain);
      if (!da) { da = kentta(aani.x, aani.y); if (kentat) kentat.set(avain, da); }
      const nytD = da[z.y * W + z.x], veto = Math.min(3, aani.paino);
      const suoraDx = Math.sign(aani.x - z.x), suoraDy = Math.sign(aani.y - z.y);
      let summa = 0;
      const painot = joukko.map(e => {
        const d = da[e.y * W + e.x];
        let w = 1;
        if (d >= 0 && nytD >= 0) {
          if (d < nytD) {
            // Vinosti ääntä kohti (sivuviistoon lähestyvä askel) painottuu vahvimmin, jotta liike on kaartamista eikä suoraa jahtia
            const vino = (e.dx !== suoraDx || e.dy !== suoraDy);
            w = (1 + veto * 5) * (vino ? 1.3 : 0.95);
          } else if (d === nytD) {
            w = 1 + veto * 0.65;
          } else {
            w = Math.max(0.05, 1 - veto * 0.6);
          }
        }
        summa += w;
        return w;
      });
      let r = rnd() * summa;
      valittu = joukko[joukko.length - 1];
      for (let i = 0; i < joukko.length; i++) { r -= painot[i]; if (r <= 0) { valittu = joukko[i]; break; } }
    } else {
      valittu = joukko[Math.floor(rnd() * joukko.length)];
    }
    z.vDx = valittu.dx; z.vDy = valittu.dy;
  }
  z.x = valittu.x; z.y = valittu.y; z.suunta = suunnaksi(valittu.dx, valittu.dy);
  z.vAsk--;
  asetaAskelAika(z, s0, k, tMs, tikki);
  if (z.vAsk <= 0) {
    z.vDx = 0; z.vDy = 0;
    const taukoMs = arvoTaukoMs(rnd);
    const askelLoppuMs = Math.ceil(z.seuraavaAskelMs / tikki) * tikki;
    z.vTaukoAsti = askelLoppuMs + taukoMs;
  }
};

// Spawn ilman kiinteitä pisteitä: kävelykelpoinen lattiaruutu mahdollisimman kaukana kaikista pelaajista (BFS-reittietäisyys),
//   ei ovelle eikä alle ASETUS.oviEtaisyys ruudun päähän ovesta, deterministisesti siemenestä + tikistä.
// kp 30.10. 18:59 "tuol on alue mihin ei sais spawnata zombeja" (osoitti Mesa Escopeta 446609 @ 22,37): ASETUS.eiSpawnia = [x0, y0, x1, y1] -suorakaiteet.
const eiSpawnia = (x, y) => (Array.isArray(ASETUS.eiSpawnia) ? ASETUS.eiSpawnia : []).some(r => Array.isArray(r) && x >= r[0] && y >= r[1] && x <= r[2] && y <= r[3]);
const eiZombeja = (x, y) => {
  const lista = Array.isArray(ASETUS.eiZombeja) ? ASETUS.eiZombeja : (Array.isArray(ASETUS.eiSpawnia) ? ASETUS.eiSpawnia : []);
  return lista.some(r => Array.isArray(r) && x >= r[0] && y >= r[1] && x <= r[2] && y <= r[3]);
};
const kaukainen = (P, rnd, varattu) => {
  const { W, H, ok, ruudut, ovi, dOvi } = ruudukko, a = ansaRuutu(), minOvi = Math.max(1, Number(ASETUS.oviEtaisyys) || 0);
  let ehdokkaat = ruudut.filter(i => {
    const x = i % W, y = (i - x) / W;
    if (a && x === a.x && y === a.y) return false;
    if (ovi && x === ovi.x && y === ovi.y) return false;
    if (eiSpawnia(x, y)) return false;
    return true;
  });
  if (!ehdokkaat.length) ehdokkaat = ruudut.slice();
  if (dOvi) {
    const kauasOvesta = ehdokkaat.filter(i => dOvi[i] >= minOvi);
    if (kauasOvesta.length) ehdokkaat = kauasOvesta;
    else {
      let maxOvi = -1; for (const i of ehdokkaat) if (dOvi[i] > maxOvi) maxOvi = dOvi[i];
      if (maxOvi > 0) ehdokkaat = ehdokkaat.filter(i => dOvi[i] >= Math.max(1, maxOvi - 2));
    }
  }
  if (varattu && varattu.size) {
    const vapaat = ehdokkaat.filter(i => !varattu.has(i));
    if (vapaat.length) ehdokkaat = vapaat;
  }
  const pimeat = ehdokkaat.filter(i => !onValaistu(i % W, (i - i % W) / W, P));
  if (pimeat.length) ehdokkaat = pimeat;
  const K = (P || []).filter(onKohde), lahteet = K.length ? K : (P || []);
  const { d: dP, lahteita } = bfsKentta(W, H, ok, lahteet);
  if (!lahteita) {
    const v = ehdokkaat[Math.floor(rnd() * ehdokkaat.length)];
    return { x: v % W, y: (v - v % W) / W };
  }
  const pisteet = ehdokkaat.map(i => [dP[i], i]);
  pisteet.sort((p, q) => q[0] - p[0] || p[1] - q[1]);   // suurin reittietäisyys ensin, tasapelissä ruutuindeksi
  const maxD = pisteet[0][0], kaukana = Math.max(1, Number(ASETUS.kaukana) || 10), hajonta = Math.max(0, Number(ASETUS.hajonta ?? 3));
  const raja = Math.max(Math.min(kaukana, maxD), maxD - hajonta);
  const joukko = pisteet.filter(p => p[0] >= raja);
  const valinta = joukko.length ? joukko : pisteet.slice(0, Math.min(20, pisteet.length));
  const v = valinta[Math.floor(rnd() * valinta.length)][1];
  return { x: v % W, y: (v - v % W) / W };
};

// ---- Värilammikko (per pelaaja, irti muuttuneista) ja muuttunut zombi (kiinni jääneestä pelaajasta)
// kp 30.10. 19:18: SAILO.lammikot = viimeisin lammikko per pelaaja (kiinnijääntiruutu, väri), näkyy kaikille (myös itselle),
//   korvautuu saman pelaajan seuraavalla kuolemalla, ja katoaa VAIN kun pelaaja ei enää ole huoneessa (pelaajat() ei sisällä id:tä).
const paivitaLammikot = (P) => {
  if (!Array.isArray(SAILO.lammikot)) SAILO.lammikot = [];
  if (Array.isArray(P)) {
    const lasna = new Set(P.map(p => p && p.id));
    SAILO.lammikot = SAILO.lammikot.filter(l => l && lasna.has(l.lahdeId ?? l.id));
  }
  tila.muuttuneet = SAILO.muuttuneet;
  tila.lammikot = SAILO.lammikot;
};
const luoLammikko = (x, y, zn, kp, k, tMs, s0) => {
  const rnd = arpa(s0 * 8191 + k * 3517 + zn * 271 + (kp.id || 0) * 53);
  const paletti = Array.isArray(ASETUS.lammikkoVarit) && ASETUS.lammikkoVarit.length ? ASETUS.lammikkoVarit : ['#b01212', '#6fcf3a'];
  const vari = String(paletti[Math.floor(rnd() * paletti.length)]);
  const pisarat = [{ dx: (rnd() - 0.5) * 0.1, dy: (rnd() - 0.5) * 0.1, r: 0.28 + rnd() * 0.08, a: 0.82 }];
  const n = 5 + Math.floor(rnd() * 3);
  for (let i = 0; i < n; i++) {
    const kulma = (i / n) * Math.PI * 2 + (rnd() - 0.5) * 0.7, et = 0.14 + rnd() * 0.22;
    pisarat.push({ dx: Math.cos(kulma) * et, dy: Math.sin(kulma) * et, r: 0.07 + rnd() * 0.1, a: 0.65 + rnd() * 0.2 });
  }
  return { id: kp.id, lahdeId: kp.id, lahdeNimi: kp.nimi || null, n: zn, x, y, vari, pisarat, syntyK: k, syntyMs: tMs };
};
const luoMuuttunut = (kp, suunta, k, tMs, tikki, s0, P) => {
  const lahdeId = kp && (kp.id ?? kp.lahdeId);
  if (!lahdeId) return null;
  if (ruudukko && ruudukko.ok && Number.isFinite(kp.x) && !ruudukko.ok[Math.round(kp.y) * ruudukko.W + Math.round(kp.x)]) return null;   // kp 21:04: ei muuttunutta kielletylle alueelle
  if (SAILO.muuttuneet.some(m => m.lahdeId === lahdeId && m.synty === k)) return null;
  // kp 30.10. 18:58 & 19:18: yksi muuttunut per pelaaja ja yksi lammikko per pelaaja; uusi kuolema korvaa saman pelaajan vanhan
  const zn = kp.zn || (++SAILO.seuraavaMuuttunutN);
  let lm = kp.lammikko || null;
  if (!lm) {
    lm = luoLammikko(kp.x, kp.y, zn, kp, k, tMs, s0);
    if (!Array.isArray(SAILO.lammikot)) SAILO.lammikot = [];
    SAILO.lammikot = SAILO.lammikot.filter(l => l && (l.lahdeId ?? l.id) !== lahdeId);
    SAILO.lammikot.push(lm);
  }

  SAILO.muuttuneet = SAILO.muuttuneet.filter(m => m.lahdeId !== lahdeId);
  const maxM = Math.max(1, Math.floor(Number(ASETUS.muuttuneitaMax ?? 4)));
  while (SAILO.muuttuneet.length >= maxM) SAILO.muuttuneet.shift();
  const m = rakennaMuuttunut(kp, lahdeId, suunta, k, tMs, tikki, s0, lm, zn);
  SAILO.muuttuneet.push(m);
  paivitaLammikot(P);
  return m;
};
// Sivuvaikutukseton rakentaja (synkka käyttää samaa: sama siemen -> sama asu ja arvot kuin johtajalla).
const rakennaMuuttunut = (kp, lahdeId, suunta, k, tMs, tikki, s0, lm, zn) => {
  const siemen = (s0 * 4093 + k * 1301 + (lahdeId || 0) * 89 + zn) >>> 0;
  const huomaa = arvoHuomaa(s0, k, zn), luovutus = arvoLuovutus(s0, k, zn), kuulo = arvoKuulo(s0, k, zn);
  const alkuTaukoMs = 1000;
  const m = {
    n: zn, muuttunut: true, tyyppi: 'muuttunut',
    lahdeId, lahdeNimi: kp.nimi || null, nimi: 'Muuttunut ' + (kp.nimi || ('#' + lahdeId)),
    figuuri: zombifioiAsu(kp.figuuri || figuuri, siemen),
    x: kp.x, y: kp.y, px: kp.x, py: kp.y, kuoli: -1, synty: k, syntyMs: tMs, suunta: (suunta ?? kp.suunta) ?? 4,
    huomaa, luovutus, meneta: huomaa + luovutus, kuulo,
    reaktio: 0, reaktioMs: 0, reaktioAsti: 0,
    kohdeId: null, kohde: null,
    vAsk: 0, vTauko: Math.ceil(alkuTaukoMs / 1000), vTaukoMs: alkuTaukoMs, vTaukoAsti: tMs + alkuTaukoMs, vDx: 0, vDy: 0,
    kontaktit: {}, kontaktiId: null, kontakti: 0, kontaktiRaja: 0, kontaktiMs: 0, kontaktiRajaMs: 0, syoId: null, syoAstiMs: 0,
    lammikko: lm,
  };
  alustaNopeus(m, s0, k, tMs, tikki);
  return m;
};

// ---- simulaatio (deterministinen)
const perusSiemen = () => Number(ASETUS.siemen) || huone || 684;
// kp 19:27: tavallisten zombien määrä kasvaa pelaajamäärän mukaan: maaraPohja (2) + kohteet, min maaraMin (3), max maaraMax (8)
const laskeMaara = (P) => {
  const pohja = Number(ASETUS.maaraPohja ?? 2);
  const min = Math.max(1, Number(ASETUS.maaraMin ?? 3));
  const max = Math.max(min, Number(ASETUS.maaraMax ?? 8));
  const nKohde = Array.isArray(P) ? P.filter(onKohde).length : 0;
  return Math.max(min, Math.min(max, Math.floor(pohja + nKohde)));
};
const luoPerusZombi = (n, eSynty, P, k0, tMs, tikki, s0, varattu) => {
  const { W } = ruudukko;
  const r = kaukainen(P, arpa(s0 * 7919 + eSynty * 101 + n), varattu);
  varattu.add(r.y * W + r.x);
  return rakennaPerusZombi(n, eSynty, r, tMs, tikki, s0);
};
// Sivuvaikutukseton rakentaja (synkka: seuraaja luo johtajan snapshotista puuttuvan zombin annettuun ruutuun r = {x, y}).
const rakennaPerusZombi = (n, eSynty, r, tMs, tikki, s0) => {
  const huomaa = arvoHuomaa(s0, eSynty, n), luovutus = arvoLuovutus(s0, eSynty, n), kuulo = arvoKuulo(s0, eSynty, n);
  const taukoMs = (n % 3) * 1000;
  const zo = {
    n, muuttunut: false, tyyppi: 'perus', x: r.x, y: r.y, px: r.x, py: r.y, kuoli: -1, synty: eSynty, syntyMs: tMs, suunta: 4,
    odottaaSynkkaa: null, poistumassa: false,
    huomaa, luovutus, meneta: huomaa + luovutus, kuulo,
    reaktio: 0, reaktioMs: 0, reaktioAsti: 0,
    kohdeId: null, kohde: null,
    vAsk: 0, vTauko: n % 3, vTaukoMs: taukoMs, vTaukoAsti: tMs + taukoMs, vDx: 0, vDy: 0,
    kontaktit: {}, kontaktiId: null, kontakti: 0, kontaktiRaja: 0, kontaktiMs: 0, kontaktiRajaMs: 0, syoId: null,
  };
  alustaNopeus(zo, s0, eSynty, tMs, tikki);
  return zo;
};
const synkkaaZombi = (z, eSynk, P, k, tMs, tikki, s0, varattu) => {
  const { W } = ruudukko;
  varattu.delete(z.y * W + z.x);
  const r = kaukainen(P, arpa(s0 * 7919 + eSynk * 101 + z.n), varattu);
  varattu.add(r.y * W + r.x);
  const huomaa = arvoHuomaa(s0, eSynk, z.n), luovutus = arvoLuovutus(s0, eSynk, z.n), kuulo = arvoKuulo(s0, eSynk, z.n);
  const taukoMs = (z.n % 3) * 1000;
  z.x = z.px = r.x; z.y = z.py = r.y; z.kuoli = -1; z.syo = false; z.syoId = null; z.syoAstiMs = 0;
  z.synty = eSynk; z.syntyMs = tMs; z.suunta = 4; z.odottaaSynkkaa = null;
  z.huomaa = huomaa; z.luovutus = luovutus; z.meneta = huomaa + hystereesiVali(z); z.kuulo = kuulo;
  z.reaktio = 0; z.reaktioMs = 0; z.reaktioAsti = 0;
  z.kohdeId = null; z.kohde = null;
  z.vAsk = 0; z.vTauko = z.n % 3; z.vTaukoMs = taukoMs; z.vTaukoAsti = tMs + taukoMs; z.vDx = 0; z.vDy = 0;
  z.kontaktit = {}; z.kontaktiId = null; z.kontakti = 0; z.kontaktiRaja = 0; z.kontaktiMs = 0; z.kontaktiRajaMs = 0;
  delete z._asu;
  alustaNopeus(z, s0, eSynk, tMs, tikki);
};
const synkkaaPimeatZombit = (Z, P, k) => {
  if (!ruudukko || !Array.isArray(Z)) return;
  if (SYNK.seuraa()) return;   // synkka: seuraaja ottaa sijainnit johtajan snapshotista, ei oma epookkisynkka
  const tikki = Math.max(50, Number(ASETUS.tikki) || 250), tMs = (k ?? 0) * tikki;
  const { W } = ruudukko, s0 = perusSiemen(), varattu = new Set();
  for (const z of Z.concat(SAILO.muuttuneet || [])) if (z && (z.kuoli < 0 || (z.syo && tMs < (z.syoAstiMs || 0)))) varattu.add(z.y * W + z.x);
  for (const z of Z) {
    if (!z || z.muuttunut || z.odottaaSynkkaa == null) continue;
    if (z.kuoli >= 0 || (z.syo && tMs < (z.syoAstiMs || 0))) continue;
    if (onValaistu(z.x, z.y, P)) continue;
    synkkaaZombi(z, z.odottaaSynkkaa, P, k, tMs, tikki, s0, varattu);
  }
};
const sopeutaMaara = (Z, P, k) => {
  if (!ruudukko || !Array.isArray(Z)) return;
  if (ASETUS.aallot) { if (AMMUNTA) AMMUNTA.aaltoTick(Z, P, k); return; }   // 811: L4K-aallot määräävät zombit
  // synkka: seuraaja noudattaa johtajan zombimäärää (muuten oma laskeMaara(P) voisi poiketa ja zombeja vilkkuisi sisään/ulos)
  const tavoite = (SYNK.seuraa() && SY.maara >= 1) ? SY.maara : laskeMaara(P);
  ASETUS.maara = tavoite;
  const tikki = Math.max(50, Number(ASETUS.tikki) || 250), tMs = (k ?? 0) * tikki;
  const { W } = ruudukko, s0 = perusSiemen();

  if (Z.length <= tavoite) {
    for (const z of Z) if (z) z.poistumassa = false;
  }
  if (Z.length < tavoite) {
    const varattu = new Set();
    for (const z of Z.concat(SAILO.muuttuneet || [])) if (z && (z.kuoli < 0 || (z.syo && tMs < (z.syoAstiMs || 0)))) varattu.add(z.y * W + z.x);
    const kaytossa = new Set(Z.map(z => z.n));
    let seurN = 0;
    while (Z.length < tavoite) {
      while (kaytossa.has(seurN)) seurN++;
      kaytossa.add(seurN);
      Z.push(luoPerusZombi(seurN, k || SAILO.E || 0, P, k, tMs, tikki, s0, varattu));
    }
    return;
  }

  // Kun määrä pienenee: ylimääräiset (suurin n ensin) merkitään poistumaan, mutta poistetaan vasta kun
  //   zombi on pimeässä (!onValaistu) JA ei jahtaa ketään (kohdeId == null) eikä ole syömässä.
  const jarj = [...Z].sort((a, b) => b.n - a.n);
  const ylim = Z.length - tavoite;
  for (let i = 0; i < jarj.length; i++) jarj[i].poistumassa = i < ylim;

  for (let i = 0; i < jarj.length && Z.length > tavoite; i++) {
    const z = jarj[i];
    if (!z.poistumassa) continue;
    if (z.kohdeId != null && (!Array.isArray(P) || !P.some(p => p && p.id === z.kohdeId && onKohde(p)))) {
      z.kohdeId = null; z.kohde = null;
    }
    if (z.kohdeId != null || z.kuoli >= 0 || (z.syo && tMs < (z.syoAstiMs || 0))) continue;
    if (onValaistu(z.x, z.y, P)) continue;
    const idx = Z.indexOf(z);
    if (idx >= 0) Z.splice(idx, 1);
  }
};
const synny = (e1, P, k0) => {
  if (ASETUS.aallot) return [];   // 811: aallot synnyttävät (AMMUNTA.aaltoTick)
  const s0 = perusSiemen(), varattu = new Set(), z = [];
  const tikki = Math.max(50, Number(ASETUS.tikki) || 250), tMs = (k0 ?? 0) * tikki;
  const maara = laskeMaara(P);
  ASETUS.maara = maara;
  for (let n = 0; n < maara; n++) {
    z.push(luoPerusZombi(n, e1, P, k0, tMs, tikki, s0, varattu));
  }
  return z;
};
// Pelaajakohtainen kertyvä ja hitaasti hiipuva kontaktilaskuri per zombi:
//   samassa ruudussa +1/s (+tikki ms), viereisessä ruudussa +0.5/s (+0.5*tikki ms), ei kontaktia -0.25/s (-0.25*tikki ms).
//   Kiinnijäänti kun laskuri >= arvottu raja (3..6 s eli 3000..6000 ms). Usean zombin laskurit kasvavat erikseen.
const paivitaKontaktit = (z, P, k, tMs, tikki, s0, kaatuneet) => {
  if (!z.kontaktit || typeof z.kontaktit !== 'object') z.kontaktit = {};
  const kelvolliset = new Map();
  for (const p of P) {
    if (!onKohde(p) || onMakaava(p.id, tMs) || onMaalissa(p.id, tMs) || (z.muuttunut && p.id === z.lahdeId)) continue;
    kelvolliset.set(p.id, p);
  }
  for (const idStr of Object.keys(z.kontaktit)) {
    const pid = Number(idStr);
    if (!kelvolliset.has(pid) || (kaatuneet && kaatuneet.has(pid))) delete z.kontaktit[idStr];
  }
  const kSama = Math.max(0, Number(ASETUS.kontaktiSama ?? 1));
  const kVier = Math.max(0, Number(ASETUS.kontaktiViereinen ?? 0.5));
  const kHiip = Math.max(0, Number(ASETUS.kontaktiHiipuma ?? 0.25));
  let saalis = null, aktP = null, aktT = null;
  for (const p of kelvolliset.values()) {
    if (kaatuneet && kaatuneet.has(p.id)) continue;
    const voiKoskea = tavoitettava(p) && liike(p.id).hyppy <= 3;
    const etRuutu = voiKoskea ? Math.max(Math.abs(z.x - p.x), Math.abs(z.y - p.y)) : 999;
    // kp 20:40 "jos makaa tos robo nii ei voi kuolla": sängyllä/kalusteella (ei zombien kävelyruutu) zombi ei pääse samaan ruutuun ->
    //   silloin viereinen ruutu kerryttää kuin sama ruutu.
    const kalusteella = etRuutu === 1 && !(ruudukko.ok && ruudukko.ok[p.y * ruudukko.W + p.x]);
    const kerroin = etRuutu === 0 || kalusteella ? kSama : etRuutu === 1 ? kVier : -kHiip;
    let t = z.kontaktit[p.id];
    if (kerroin > 0) {
      if (!t || !(t.ms > 0)) {
        const rajaMs = arvoKontaktiRajaMs(s0, k, z.n, p.id) * (AMMUNTA ? AMMUNTA.kontaktiKerroin(p.id) : 1);   // 811: aseen kerroin (vaihtoehto B); 684: 1
        t = z.kontaktit[p.id] = { ms: 0, rajaMs, laskuri: 0, raja: Math.round((rajaMs / 1000) * 100) / 100, et: etRuutu, kasvaa: true };
      }
      t.ms = Math.min(t.rajaMs, t.ms + tikki * kerroin);
      t.laskuri = Math.round((t.ms / 1000) * 100) / 100;
      t.et = etRuutu;
      t.kasvaa = true;
      if (t.ms >= t.rajaMs) {
        if (!saalis || etRuutu < saalis.et || (etRuutu === saalis.et && p.id === z.kohdeId)) {
          saalis = { p, t, et: etRuutu };
        }
      }
    } else if (t && t.ms > 0) {
      t.ms = Math.max(0, t.ms + tikki * kerroin);
      t.laskuri = Math.round((t.ms / 1000) * 100) / 100;
      t.et = etRuutu;
      t.kasvaa = false;
      if (t.ms <= 0) { delete z.kontaktit[p.id]; t = null; }
    }
    if (t && t.ms > 0) {
      if (!aktT || t.ms > aktT.ms || (t.ms === aktT.ms && p.id === z.kohdeId)) {
        aktP = p; aktT = t;
      }
    }
  }
  return { saalis, aktP, aktT };
};
const askel = (k, Z, P) => {
  kirjaa(k, P);
  const tikki = Math.max(50, Number(ASETUS.tikki) || 250), tMs = k * tikki;
  const a = ansaRuutu(), { W, H } = ruudukko, varattu = new Set(), s0 = perusSiemen(), kentat = new Map();
  paivitaLammikot(P);
  paivitaMakaavat(P, tMs, k, tikki, s0);
  const omaI = omaIndeksi();
  // Toisen pelaajan kuolema: hahmo hyppää > 3 ruutua ovelle (zk684-teleportti) -> lammikko + muuttunut viimeiseen ruutuun.
  if (!(SAILO.viimeSij instanceof Map)) SAILO.viimeSij = new Map();
  { const ov = ruudukko.ovi || ASETUS.kuolemaOvi;   // 684: huoneella ei ovea (doors -1,-1) -> zk684-teleportin kohde
    const teleK = ASETUS.teleKuolema !== false;   // 811: ei wired-teleporttia -> hyppy ei ole kuolema (kuolema tulee vain 'kuoli'-viestinä)
    for (const p of P || []) { if (!p || !p.id) continue; const ed = SAILO.viimeSij.get(p.id);
      // kp 20:53 "zombi tuli portin läpi": maalista ovelle siirtynyt EI ole kuollut -> vain zombien kävelyruudulta (ok, ei eiZombeja-aluetta)
      if (teleK && ed && p.i !== omaI && ov && ruudukko.ok && ruudukko.ok[ed.y * ruudukko.W + ed.x] && Math.hypot(p.x - ed.x, p.y - ed.y) > 3 && Math.hypot(p.x - ov.x, p.y - ov.y) <= 2.5
          && !(SAILO.makaavat instanceof Map && SAILO.makaavat.has(p.id))) {
        try { luoMuuttunut({ id: p.id, nimi: p.nimi, figuuri: p.figuuri, x: ed.x, y: ed.y }, 4, k, tMs, tikki, s0, P); paivitaLammikot(P); } catch (x) {}
      }
      SAILO.viimeSij.set(p.id, { x: p.x, y: p.y }); } }
  synkkaaPimeatZombit(Z, P, k);
  sopeutaMaara(Z, P, k);
  let ekaKohde = null;

  // Muuttuneiden despawn: kun vähintään ASETUS.muuttunutMin (120000 ms) on kulunut JA ruutu on kokonaan pimeässä.
  const minElinaika = Math.max(0, Number(ASETUS.muuttunutMin ?? 120000));
  let poistui = false;
  for (let i = SAILO.muuttuneet.length - 1; i >= 0; i--) {
    const m = SAILO.muuttuneet[i];
    // kp 21:04 "kielletystä huoneesta käveli portin läpi ulos": muuttunut kävelyruudun ulkopuolella (eiZombeja-alue, vanha tila) poistetaan heti
    const ulkona = m && ruudukko && ruudukko.ok && Number.isFinite(m.x) && !ruudukko.ok[Math.round(m.y) * ruudukko.W + Math.round(m.x)];
    if (!m || ulkona || (tMs - (m.syntyMs ?? 0) >= minElinaika && !onValaistu(m.x, m.y, P))) {
      SAILO.muuttuneet.splice(i, 1);
      poistui = true;
    }
  }
  if (poistui) paivitaLammikot(P);

  const kaikki = Z.concat(SAILO.muuttuneet);
  for (const z of kaikki) if (z.kuoli < 0 || (z.syo && tMs < (z.syoAstiMs || 0))) varattu.add(z.y * W + z.x);
  const uudetMuuttuneet = [], kaatuneet = new Set();

  for (const z of kaikki) {
    varmistaZombi(z, s0, k, tMs, tikki);
    if (z.muuttunut && z.synty === k) {
      varattu.add(z.y * W + z.x);
      continue;
    }
    // kp 19:54: kiinnijäännin jälkeen nappaava zombi jää paikalleen uhrin viereen koko kuolemamakuun (ASETUS.kuolemaMakuu)
    //   ajaksi (ei liiku eikä nappaa muita) ja syntyy vasta makuun päätyttyä uudelleen kauas.
    if (z.syo && tMs < (z.syoAstiMs || 0)) {
      z.px = z.x; z.py = z.y;
      z.viimeAskelMs = tMs; z.seuraavaAskelMs = tMs + tikki; z.piirtoAskelMs = tikki;
      varattu.add(z.y * W + z.x);
      continue;
    }
    if (z.muuttunut && z.syo) { z.syo = false; z.syoId = null; z.syoAstiMs = 0; z.seuraavaAskelMs = tMs; }
    if (!z.muuttunut && z.kuoli >= 0 && ASETUS.aallot && z.ammuttu) {   // 811 aallot: ammuttu zombi poistuu (L4K: aallon zombi ei synny uudelleen)
      const iz = Z.indexOf(z); if (iz >= 0) Z.splice(iz, 1);
      continue;
    }
    if (!z.muuttunut && z.kuoli >= 0) {
      const r = kaukainen(P, arpa(s0 * 31 + Math.floor(k / 16) * 101 + z.n), varattu);
      z.x = z.px = r.x; z.y = z.py = r.y; z.kuoli = -1; z.syo = false; z.syoId = null; z.syoAstiMs = 0; z.synty = k; z.syntyMs = tMs; z.odottaaSynkkaa = null;
      z.huomaa = arvoHuomaa(s0, k, z.n); z.luovutus = arvoLuovutus(s0, k, z.n); z.meneta = z.huomaa + hystereesiVali(z); z.kuulo = arvoKuulo(s0, k, z.n);
      z.reaktio = 0; z.reaktioMs = 0; z.reaktioAsti = 0;
      z.kohdeId = null; z.kohde = null; z.vAsk = 0; z.vTauko = 0; z.vTaukoMs = 0; z.vTaukoAsti = 0; z.vDx = 0; z.vDy = 0;
      z.kontaktit = {}; z.kontaktiId = null; z.kontakti = 0; z.kontaktiRaja = 0; z.kontaktiMs = 0; z.kontaktiRajaMs = 0;
      alustaNopeus(z, s0, k, tMs, tikki);
      varattu.add(z.y * W + z.x); continue;
    }

    // Zombi astuu tai päivittää liiketilansa kun sen oma askelväli (seuraavaAskelMs) on täynnä.
    if (tMs >= (z.seuraavaAskelMs || 0)) {
      z.px = z.x; z.py = z.y;
      varattu.delete(z.y * W + z.x);
      const dz = kentta(z.x, z.y);
      const oliKohde = z.kohdeId != null;
      z._vaihdettuKohteeseen = false; z._valitonVaihto = false;
      const kohde = valitseKohde(z, dz, P, k, tMs, s0);
      if (kohde) {
        if (z._valitonVaihto) z.reaktioAsti = tMs;   // jahtaava zombi kääntyy vieressä olevaan heti, ei 0..3 s reaktiota
        else if (!oliKohde || z._vaihdettuKohteeseen) {
          const rMs = arvoReaktioMs(s0, k, z.n);
          z.reaktioAsti = tMs + rMs;
        }
        z.reaktioMs = Math.max(0, (z.reaktioAsti || 0) - tMs);
        z.reaktio = Math.ceil(z.reaktioMs / 1000);
        z.kohdeId = kohde.id; z.kohde = kohde;
        z.vAsk = 0; z.vTauko = 0; z.vTaukoMs = 0; z.vTaukoAsti = 0; z.vDx = 0; z.vDy = 0; z.aaniKohde = null;
        if (!ekaKohde) ekaKohde = kohde;
        if (z.reaktioMs > 0) {
          if (kohde.x !== z.x || kohde.y !== z.y) z.suunta = suunnaksi(Math.sign(kohde.x - z.x), Math.sign(kohde.y - z.y));
          z.viimeAskelMs = tMs; z.seuraavaAskelMs = tMs + tikki; z.piirtoAskelMs = tikki;
        } else {
          let d = kentat.get(kohde.id);
          if (!d) { d = kentta(kohde.x, kohde.y); kentat.set(kohde.id, d); }
          let paras = null; const nyt = d[z.y * W + z.x];
          for (const [dx, dy] of NAAP) {
            const x = z.x + dx, y = z.y + dy, j = y * W + x;
            if (x < 0 || y < 0 || x >= W || y >= H || d[j] < 0 || varattu.has(j)) continue;
            if ((nyt < 0 || d[j] < nyt) && (!paras || d[j] < paras.d)) paras = { x, y, d: d[j], dx, dy };
          }
          if (paras) {
            z.x = paras.x; z.y = paras.y; z.suunta = suunnaksi(paras.dx, paras.dy);
            asetaAskelAika(z, s0, k, tMs, tikki);
          } else {
            if (kohde.x !== z.x || kohde.y !== z.y) z.suunta = suunnaksi(Math.sign(kohde.x - z.x), Math.sign(kohde.y - z.y));
            z.viimeAskelMs = tMs; z.seuraavaAskelMs = tMs + tikki; z.piirtoAskelMs = tikki;
          }
        }
      } else {
        z.kohdeId = null; z.kohde = null; z.reaktio = 0; z.reaktioMs = 0; z.reaktioAsti = 0;
        if (oliKohde) {
          const rnd = arpa(s0 * 1009 + k * 9176 + z.n * 37);
          z.vAsk = 0; z.vDx = 0; z.vDy = 0;
          const taukoMs = arvoTaukoMs(rnd);
          z.vTaukoAsti = tMs + taukoMs; z.vTaukoMs = taukoMs; z.vTauko = Math.ceil(taukoMs / 1000);
        }
        vaella(k, tMs, tikki, z, dz, varattu, s0, a, kentat);
      }
      varattu.add(z.y * W + z.x);
    } else if (z.kohde && !ekaKohde) {
      ekaKohde = z.kohde;
    }

    if (a && z.x === a.x && z.y === a.y) {
      if (z.muuttunut) {
        const idx = SAILO.muuttuneet.indexOf(z);
        if (idx >= 0) { SAILO.muuttuneet.splice(idx, 1); paivitaLammikot(P); }
      } else {
        z.kuoli = k; z.kontaktit = {}; z.kontaktiId = null; z.kontakti = 0; z.kontaktiRaja = 0; z.kontaktiMs = 0; z.kontaktiRajaMs = 0;
      }
      continue;
    }

    // Kiinnijäännin kertyvä kontaktilaskuri (per zombi + pelaaja): +1/s samassa ruudussa, +0.5/s viereisessä, -0.25/s ilman kontaktia.
    let { saalis, aktP, aktT } = paivitaKontaktit(z, P, k, tMs, tikki, s0, kaatuneet);
    // kp 20:39 "mun kuolema ei näkyny sun ruudulla" / desync: vain UHRIN oma kone päättää kiinnijäännin (se lähettää zk684).
    //   Muiden koneiden zombit eivät tapa toisen pelaajaa paikallisesti (tuotti valekuolemia); kuolema näkyy muille ovelle-teleportista.
    if (saalis && saalis.p && saalis.p.id === omaId() && saalis.p.i !== omaI) omaSyyKirjaa('indeksi', { omaI, pI: saalis.p.i });   // F9-diagnostiikka: oma laskuri täyttyi mutta indeksi ei täsmää
    if (saalis && saalis.p && saalis.p.i !== omaI) { if (z.kontaktit) delete z.kontaktit[saalis.p.id]; saalis = null; }
    // F6: oma kiinnijäänti kun kuolema ei voi alkaa (armo/lukko/maali/safe) -> ei paikallista makuuta/lammikkoa ilman kuolemaa
    if (saalis) { const este = kuolemaEste(Date.now()); if (este) { omaSyyKirjaa(este, { zn: z.n }); if (z.kontaktit) delete z.kontaktit[saalis.p.id]; saalis = null; } }
    // 811 vaihtoehto A (ASETUS.kiinnijaanti 'hp'): kiinnijäänti vähentää HP:ta; jos HP > 0, laskuri nollautuu eikä kuolemaa tule
    if (saalis && AMMUNTA && AMMUNTA.purema(saalis.p.id)) { if (z.kontaktit) delete z.kontaktit[saalis.p.id]; saalis = null; }
    if (saalis) {
      const kp = saalis.p;
      const makuuMs = Math.max(0, Number(ASETUS.kuolemaMakuu ?? 1500));
      const loppuMs = tMs + makuuMs;
      if (kp.x !== z.x || kp.y !== z.y) z.suunta = suunnaksi(Math.sign(kp.x - z.x), Math.sign(kp.y - z.y));
      z.px = z.x; z.py = z.y;
      z.viimeAskelMs = tMs; z.seuraavaAskelMs = Math.max(tMs + tikki, loppuMs); z.piirtoAskelMs = tikki;
      z.syo = true; z.syoId = kp.id; z.syoAstiMs = loppuMs; z.viimeSyoId = kp.id; z.viimeSyoK = k; z.viimeSyoMs = tMs;
      kaatuneet.add(kp.id);
      for (const zz of kaikki) {
        if (zz.kontaktit) delete zz.kontaktit[kp.id];
        if (zz.kohdeId === kp.id) { zz.kohdeId = null; zz.kohde = null; zz.reaktio = 0; zz.reaktioMs = 0; zz.reaktioAsti = 0; }
      }
      z.kohdeId = null; z.kohde = null; z.reaktio = 0; z.reaktioMs = 0; z.reaktioAsti = 0;
      z.vAsk = 0; z.vTauko = 0; z.vTaukoMs = 0; z.vTaukoAsti = 0; z.vDx = 0; z.vDy = 0; z.aaniKohde = null;
      z.kontaktit = {}; z.kontaktiId = null; z.kontakti = 0; z.kontaktiRaja = 0; z.kontaktiMs = 0; z.kontaktiRajaMs = 0;
      if (!z.muuttunut) z.kuoli = k;
      uudetMuuttuneet.push({ kp: { id: kp.id, i: kp.i, nimi: kp.nimi, figuuri: kp.figuuri, x: kp.x, y: kp.y }, suunta: z.suunta });
    } else if (aktP && aktT) {
      z.kontaktiId = aktP.id;
      z.kontaktiMs = Math.round(aktT.ms);
      z.kontaktiRajaMs = aktT.rajaMs;
      z.kontakti = Math.round((aktT.ms / 1000) * 10) / 10;
      z.kontaktiRaja = Math.round((aktT.rajaMs / 1000) * 10) / 10;
      if (aktT.et <= 1 && (aktP.x !== z.x || aktP.y !== z.y) && (z.x === z.px && z.y === z.py)) {
        z.suunta = suunnaksi(Math.sign(aktP.x - z.x), Math.sign(aktP.y - z.y));
      }
    } else {
      z.kontaktiId = null; z.kontakti = 0; z.kontaktiRaja = 0; z.kontaktiMs = 0; z.kontaktiRajaMs = 0;
    }
  }

  for (const u of uudetMuuttuneet) {
    aloitaMakuu(u.kp, u.suunta, k, tMs, tikki, s0, P);
  }

  // Tarkista myös askelen lopussa pimeässä despawnaavat muuttuneet (jos muuttunut juuri astui valosta pimeään) ja ylimääräiset zombit.
  let poistuiLopussa = false;
  for (let i = SAILO.muuttuneet.length - 1; i >= 0; i--) {
    const m = SAILO.muuttuneet[i];
    if (!m || (tMs - (m.syntyMs ?? 0) >= minElinaika && !onValaistu(m.x, m.y, P))) {
      SAILO.muuttuneet.splice(i, 1);
      poistuiLopussa = true;
    }
  }
  sopeutaMaara(Z, P, k);
  paivitaLammikot(P);
  return ekaKohde;
};
const suunnaksi = (dx, dy) => ({ '0,-1': 0, '1,-1': 1, '1,0': 2, '1,1': 3, '0,1': 4, '-1,1': 5, '-1,0': 6, '-1,-1': 7 })[dx + ',' + dy] ?? 4;

// ---- piirto (paikalliset hahmot negatiivisilla id:illä + värilammikot kanvaksella lattian päällä, vain tässä clientissä)
let V = null, figuuri = ASETUS.figuuri, seuraavaId = -950001, asut = [];
// kp 30.10. 18:58 & 19:09: tavalliset zombit EIVÄT käytä huoneen pelaajien asuja (kp 19:09: 'näen myös ite kp zombin').
//   Pohjat: Zombie-botit + ASETUS.zombiAsut (~8 geneeristä asua) + vara-asu figuuri, ja jokainen zombifioidaan siemenellä.
const valitseAsu = z => {
  const geneeriset = Array.isArray(ASETUS.zombiAsut) ? ASETUS.zombiAsut : [];
  const lista = [...asut, ...geneeriset, figuuri].filter((f, i, a) => f && a.indexOf(f) === i), n = Math.abs(Number(z.n) || 0) + Math.abs(Number(z.synty ?? SAILO.E) || 0);
  return zombifioiAsu(lista[n % lista.length], (n * 7919 + 104729) >>> 0) || lista[n % lista.length];
};
const valmistele = () => {
  const s = istunto(), ud = s && s.userDataManager; let loydetty = false; const uudetAsut = [];
  for (const o of [...(e.getRoomObjects(huone, 100) || [])].sort((a, b) => a.id - b.id)) {
    if (!V && o.getLocation) V = o.getLocation().constructor;
    const u = ud && ud.getUserDataByIndex && ud.getUserDataByIndex(o.id);
    if (u && /zombi/i.test(String(u.name || '')) && /bot/i.test(String(o.type))) {
      const f = o.model && o.model.getValue('figure');
      if (f) { if (!loydetty) { figuuri = f; loydetty = true; } if (!uudetAsut.includes(f)) uudetAsut.push(f); }
    }
  }
  if (uudetAsut.length) asut = uudetAsut;
  if (!V) { const f = (e.getRoomObjects(huone, 10) || [])[0]; if (f && f.getLocation) V = f.getLocation().constructor; }
  return !!V;
};

// Lammikkokanvas (sama asemointi huoneen kanvaksen päälle kuin 684.js:64,74-89, pimeyskerroksen alle ilman välkkyvää clearRect-hahmoleikkausta, kp 19:38)
try {
  if (typeof document !== 'undefined' && document.querySelectorAll) {
    for (const vanha of document.querySelectorAll('canvas[data-zombit-lammikko]')) vanha.remove();
  }
} catch (x) {}
const huoneKanvas = () => {
  if (typeof document === 'undefined' || !document.querySelectorAll) return null;
  for (const c of document.querySelectorAll('.roomView-background > canvas')) if (typeof c.onmousedown === 'function') return c;
  return null;
};
const lammikkoKanvas = (typeof document !== 'undefined' && document.createElement) ? document.createElement('canvas') : null;
const lctx = lammikkoKanvas && lammikkoKanvas.getContext ? lammikkoKanvas.getContext('2d') : null;
if (lammikkoKanvas) {
  if (lammikkoKanvas.setAttribute) lammikkoKanvas.setAttribute('data-zombit-lammikko', String(huone));
  if (lammikkoKanvas.style) lammikkoKanvas.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;pointer-events:none;z-index:1';
}
let lammikkoAla = '';
const kontaktissaOlevat = (P) => {
  const kaikki = (SAILO.zombit || []).concat(SAILO.muuttuneet || []);
  const idt = new Set();
  for (const z of kaikki) {
    if (!z || z.kuoli >= 0 || z.syo || !z.kontaktit) continue;
    for (const [idStr, t] of Object.entries(z.kontaktit)) {
      if (t && t.ms > 0 && t.kasvaa && (t.et == null || t.et <= 1)) idt.add(Number(idStr));
    }
  }
  if (!idt.size) return [];
  const lista = Array.isArray(P) ? P : pelaajat();
  const tMs = SAILO.K >= 0 ? SAILO.K * Math.max(50, Number(ASETUS.tikki) || 250) : null;
  return lista.filter(p => p && idt.has(p.id) && !onMakaava(p.id, tMs));
};
tila.kontaktissa = () => kontaktissaOlevat().map(p => p.id);
// kp 20:19 "punanen välkky on vaan punanen neliö hahmon päällä · kato shooter logic": shooterin keino (shooter.user.js savyta):
//   hahmon OMIEN spritejen väri (sprite.color) punaiseksi, varjo (alpha<255) ja additiiviset ohitetaan, palautus 0xffffff.
const savytetyt = new Map();   // hahmon roomIndex -> true
const savyta = (id, vari) => {
  try {
    const o = e.getRoomObject(huone, id, 100), sp = (o && o.visualization && o.visualization.sprites) || [];
    for (const s of sp) { if (s.alpha !== 255 || s.blendMode === 'add') continue;
      if (s.color !== vari) { s.color = vari; if (s.increaseUpdateCounter) s.increaseUpdateCounter(); } }
  } catch (x) {}
};
const paivitaValahdys = (kontaktissa) => {
  const nyt = Date.now(), nyky = new Set();
  for (const p of kontaktissa) if (p && p.i != null) { nyky.add(p.i); savytetyt.set(p.i, true); savyta(p.i, Math.floor(nyt / 120) % 2 ? 0xff9090 : 0xff2a2a); }
  for (const id of [...savytetyt.keys()]) if (!nyky.has(id)) { savyta(id, 0xffffff); savytetyt.delete(id); }
};
let veriPeitto = null;
const veriPeittajat = () => { const nyt = Date.now(); if (veriPeitto && nyt - veriPeitto.t < 3000) return veriPeitto.l; const l = [];
  try { const sd = dv(e, '_sessionDataManager');
    for (const o of e.getRoomObjects(huone, 10) || []) { const m = o && o.model, L = o && o.getLocation && o.getLocation(); if (!m || !L) continue;
      const fd = sd && sd.getFloorItemData && sd.getFloorItemData(m.getValue('furniture_type_id')); if (!fd || fd.canStandOn) continue;
      l.push({ id: o.id, x: L.x, y: L.y, syv: L.x + L.y }); } } catch (x) {}
  veriPeitto = { t: nyt, l }; return l; };
const jarjLahella = (lammikot, k) => lammikot.some(lm => lm && Math.abs(lm.x - k.x) <= 8 && Math.abs(lm.y - k.y) <= 8);
const piirraLammikot = () => {
  if (!lammikkoKanvas || !lctx || typeof document === 'undefined' || !document.body) return;
  const lammikot = Array.isArray(SAILO.lammikot) ? SAILO.lammikot : (tila.lammikot || []);
  const kontaktissa = kontaktissaOlevat();
  paivitaValahdys(kontaktissa);
  if (!lammikot.length && !kontaktissa.length) {
    if (lammikkoKanvas.width > 0 && lammikkoKanvas.height > 0) lctx.clearRect(0, 0, lammikkoKanvas.width, lammikkoKanvas.height);
    return;
  }
  const cv = huoneKanvas(); if (!cv || !cv.getBoundingClientRect) return;
  const r = cv.getBoundingClientRect(), a = r.left + ',' + r.top + ',' + r.width + ',' + r.height;
  const W = Math.max(1, Math.round(r.width)), H = Math.max(1, Math.round(r.height));
  if (W <= 1 || H <= 1) return;
  const ac = e._activeRoomActiveCanvas || 1;
  const g = (e.getRoomInstanceGeometry && e.getRoomInstanceGeometry(huone, ac))
    || (ac !== 1 && e.getRoomInstanceGeometry && e.getRoomInstanceGeometry(huone, 1));
  const rc = (e.getRoomInstanceRenderingCanvas && e.getRoomInstanceRenderingCanvas(huone, ac))
    || (ac !== 1 && e.getRoomInstanceRenderingCanvas && e.getRoomInstanceRenderingCanvas(huone, 1));
  if (!g || !rc || typeof g.getScreenPoint !== 'function') return;
  if (lammikkoKanvas.parentNode !== document.body || document.body.firstChild !== lammikkoKanvas) {
    document.body.insertBefore(lammikkoKanvas, document.body.firstChild);
  }
  if (a !== lammikkoAla) { lammikkoAla = a; Object.assign(lammikkoKanvas.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' }); }
  if (lammikkoKanvas.width !== W || lammikkoKanvas.height !== H) { lammikkoKanvas.width = W; lammikkoKanvas.height = H; }
  lctx.clearRect(0, 0, W, H);
  const scale = rc.scale ?? rc._scale ?? 1;
  const rw = rc.width ?? rc._width ?? W, rh = rc.height ?? rc._height ?? H;
  const ox = rc.screenOffsetX ?? rc._screenOffsetX ?? 0, oy = rc.screenOffsetY ?? rc._screenOffsetY ?? 0;
  const ruudulle = (x, y, z) => {
    const p = g.getScreenPoint(V ? new V(x, y, z) : { x, y, z }); if (!p) return null;
    return { x: p.x * scale + rw / 2 + ox, y: p.y * scale + rh / 2 + oy };
  };
  const { z: Z } = ruudukko;
  if (lammikot.length) {
    // kp 20:41 "zombien ympärillä kans joku ihme aura mikä epärendaa noi veret": leikkaus koski KAIKKIA lammikoita hahmon kohdalla.
    //   Nyt syvyysjärjestys (Habbo: x+y): lammikot piirretään takimmaisesta etummaiseen ja kunkin jälkeen pyyhitään vain ne
    //   hahmot, jotka seisovat SAMASSA ruudussa tai sen EDESSÄ (syvyys >= lammikon). Hahmon edessä oleva lammikko jää näkyviin.
    const hahmot = [];
    if (typeof e.getRoomObjectBoundingRectangle === 'function' && r.width > 0) {
      for (const o of e.getRoomObjects(huone, 100) || []) {
        if (!o || String(o.type) !== 'user') continue;
        try { const b = e.getRoomObjectBoundingRectangle(huone, o.id, 100, 1), L = o.getLocation();
          if (b && b.width > 0 && L) hahmot.push({ b, syv: L.x + L.y }); } catch (x) {}
      }
    }
    // kp 18:06 "veri piirtyy kaiken päälle?": kanvas on huoneen päällä, joten myös kalusteet edessä pyyhkivät lammikon (vain 811/817).
    //   Lattiat ja muut joiden päälle voi astua eivät peitä. RAJA: suorakaide, joten kalusteen vierestä voi kadota vähän verta.
    if (ASETUS.veriKalusteet && typeof e.getRoomObjectBoundingRectangle === 'function') for (const k of veriPeittajat()) { if (!jarjLahella(lammikot, k)) continue;
      try { const b = e.getRoomObjectBoundingRectangle(huone, k.id, 10, 1); if (b && b.width > 0) hahmot.push({ b, syv: k.syv }); } catch (x) {} }
    const fx = W / (r.width || 1), fy = H / (r.height || 1);
    const jarj = lammikot.filter(lm => lm && isFinite(lm.x) && isFinite(lm.y)).sort((a, b) => (a.x + a.y) - (b.x + b.y));
    for (const lm of jarj) {
      const zz = Math.max(0, Z[Math.round(lm.y) * ruudukko.W + Math.round(lm.x)] || 0);
      const o = ruudulle(lm.x, lm.y, zz), ex = ruudulle(lm.x + 1, lm.y, zz);
      if (!o || !ex) continue;
      const sc = Math.max(10, Math.abs(ex.x - o.x));
      lctx.save();
      lctx.fillStyle = lm.vari || '#b01212';
      for (const p of lm.pisarat || []) {
        const pt = ruudulle(lm.x + p.dx, lm.y + p.dy, zz);
        if (!pt) continue;
        const rx = Math.max(2, p.r * sc * 0.95), ry = Math.max(1, p.r * sc * 0.46);
        lctx.globalAlpha = p.a || 0.75;
        lctx.beginPath();
        lctx.ellipse(pt.x, pt.y, rx, ry, 0, 0, Math.PI * 2);
        lctx.fill();
      }
      lctx.restore();
      const lsyv = Math.round(lm.x) + Math.round(lm.y);
      for (const h of hahmot) {
        if (h.syv + 0.01 < lsyv) continue;   // hahmo lammikon takana -> lammikko piirtyy sen päälle (oikein)
        const b = h.b, cx = (b.x - r.left + b.width / 2) * fx, cy = (b.y - r.top + b.height * 0.5) * fy;
        lctx.save(); lctx.globalCompositeOperation = 'destination-out'; lctx.beginPath();
        lctx.ellipse(cx, cy, Math.max(2, b.width * 0.24 * fx), Math.max(2, b.height * 0.47 * fy), 0, 0, Math.PI * 2); lctx.fill(); lctx.restore();
      }
    }
  }
  // kp 20:04 välähdys: paivitaValahdys() (spritejen sävy, ei piirretä tälle kanvakselle)
};

const piirretyt = new Map(), piirrettyAsento = new Map();   // n -> objekti-id, n -> viimeksi piirretty asento
const piirra = () => {
  // Zombikohtainen interpolointi: jokainen zombi interpoloidaan omasta viimeisestä askelajastaan (viimeAskelMs) omalla askelvälillään (piirtoAskelMs).
  // Kiinni jäänyt pelaaja EI näe omaa muuttunutta versiotaan (z.muuttunut && z.lahdeId === omaId()).
  const nyt = Date.now(), tikki = Math.max(50, Number(ASETUS.tikki) || 250), { z: Z } = ruudukko, minunId = omaId();
  const nakyvat = new Set();
  const kaikki = tila.zombit.concat(tila.muuttuneet || []);
  for (const z of kaikki) {
    if (z.muuttunut && z.lahdeId === minunId) continue;   // lähdepelaaja ei näe omaa muuttunutta versiotaan
    if (AMMUNTA && AMMUNTA.piilossa(z)) continue;   // 811: ampujan tappama zombi katoaa heti (ruumis piirretään erikseen)
    nakyvat.add(z.n);
    const askelMs = Math.max(1, Number(z.piirtoAskelMs || z.askelMs || tikki));
    const alkuMs = Number(z.viimeAskelMs ?? (SAILO.K * tikki));
    const p = Math.max(0, Math.min(1, (nyt - alkuMs) / askelMs));
    let g = piirretyt.get(z.n);
    const x = z.px + (z.x - z.px) * p, y = z.py + (z.y - z.py) * p, zz = Math.max(0, Z[Math.round(y) * ruudukko.W + Math.round(x)] || 0), sd = z.suunta * 45;
    const asu = (z.muuttunut && z.figuuri) ? z.figuuri : (z._asu || (z._asu = valitseAsu(z)));
    if (AMMUNTA) AMMUNTA.piirtoPaikat.set(z.n, { x, y, z: zz, sn: z.synty });
    if (g == null) {
      g = seuraavaId--;
      if (!e.addRoomObjectUser(huone, g, new V(x, y, zz), new V(sd), sd, 1, asu)) continue;
      piirretyt.set(z.n, g);
      SAILO.piirretytIdt.add(g);
    }
    try {
      e.updateRoomObjectUserLocation(huone, g, new V(x, y, zz), null, false, 0, new V(sd), sd, true, false, 16);
      const liikkuu = (z.x !== z.px || z.y !== z.py) && p < 1, asento = z.kuoli >= 0 && !z.syo ? 'lay' : liikkuu ? 'mv' : 'std';
      if (piirrettyAsento.get(z.n) !== asento) { e.updateRoomObjectUserPosture(huone, g, asento, ''); piirrettyAsento.set(z.n, asento); }
    } catch (x) {}
  }
  for (const [n, g] of [...piirretyt.entries()]) {
    if (!nakyvat.has(n)) {
      try { e.removeRoomObjectUser(huone, g); } catch (x) {}
      piirretyt.delete(n);
      piirrettyAsento.delete(n);
      SAILO.piirretytIdt.delete(g);
      if (AMMUNTA) AMMUNTA.piirtoPaikat.delete(n);
    }
  }
  piirraLammikot();
  if (AMMUNTA) AMMUNTA.piirto();
};
tila.kuva = () => tila.zombit.concat(tila.muuttuneet || []).map(z => ({
  n: z.n, muuttunut: !!z.muuttunut, nimi: z.nimi || ('Zombi ' + z.n), lahdeId: z.lahdeId ?? null, lahdeNimi: z.lahdeNimi ?? null,
  x: z.x, y: z.y, kuoli: z.kuoli, syo: !!z.syo, syoId: z.syoId ?? null, kohde: z.kohdeId ?? null,
  odottaaSynkkaa: z.odottaaSynkkaa ?? null, poistumassa: !!z.poistumassa,
  huomaa: z.huomaa, luovutus: z.luovutus, meneta: z.meneta, kuulo: z.kuulo,
  perusAskelMs: z.perusAskelMs, askelMs: z.askelMs, reaktioMs: z.reaktioMs || 0,
  tila: z.syo ? 'syo' : z.kuoli >= 0 ? 'kuoli' : z.kohdeId != null ? ((z.reaktioMs || 0) > 0 ? 'reagoi' : 'jahtaa') : (z.vTaukoMs || 0) > 0 ? 'seisoo' : 'vaeltaa',
  kontakti: z.kontaktiMs ? (z.kontakti + 's/' + z.kontaktiRaja + 's') : null,
  id: piirretyt.get(z.n) ?? null,
}));

// ---- Huoneen julkisen chatin kuuntelu (RSCE_CHAT_EVENT, sama väylä kuin 681.js:238-247 ja 682.js:242-245) + salaisen sanan nielu
const SALAISET_SANAT = new Set((Array.isArray(ASETUS.salaisetSanat) ? ASETUS.salaisetSanat : []).map(s => String(s).toLowerCase()));   // huonekohtainen (HUONEET); 684: zk684, zl684, zc684, 73514k
let viimeChatAvain = '', viimeChatAika = 0;
const tallennaAani = (roomIndex, teksti, chatType) => {
  if (chatType !== 0 && chatType !== 2) return;   // vain julkinen puhe (0) ja huuto (2); kuiskaus (1) ohitetaan
  const viesti = String(teksti || '').trim();
  if (!viesti || viesti.startsWith(':')) return;
  const ala = viesti.toLowerCase();
  const omaSana = String(ASETUS.salasana || '').trim().toLowerCase();
  if ((omaSana && ala === omaSana) || SALAISET_SANAT.has(ala)) return;
  const nyt = Date.now(), avain = roomIndex + ':' + chatType + ':' + ala;
  if (avain === viimeChatAvain && nyt - viimeChatAika < 150) return;
  viimeChatAvain = avain; viimeChatAika = nyt;
  const P = pelaajat(), puhuja = P.find(p => p.i === Number(roomIndex));
  if (!puhuja || !onKohde(puhuja)) return;
  const tikki = Math.max(50, Number(ASETUS.tikki) || 250);
  // Kiinnitetään ääni tulevaan tikkiin floor(vastaanotto / tikki) + 2, jotta pieni vastaanottoajan ero ei hajota simulaatiota.
  const kAani = Math.floor(nyt / tikki) + 2, huuto = chatType === 2;
  SAILO.aanet.push({ id: puhuja.id, x: puhuja.x, y: puhuja.y, k: kAani, alkuMs: kAani * tikki, voima: huuto ? 1.5 : 1, huuto });
  if (SAILO.aanet.length > 60) SAILO.aanet.shift();
};
const kuuleChat = ev => {
  try {
    if (!ev || (ev.chatType !== 0 && ev.chatType !== 2)) return;
    if (ev.session && ev.session.roomId != null && Number(ev.session.roomId) !== huone) return;
    tallennaAani(ev.objectId, ev.message, ev.chatType);
  } catch (x) {}
};
const vayla = e && e.events;
if (vayla && typeof vayla.addEventListener === 'function') vayla.addEventListener('RSCE_CHAT_EVENT', kuuleChat);
tila._kuuleChat = kuuleChat;
// ---- maalisuoja (kp 30.10. 22:16 "tee teleportista nopeempi maaliin robo, res kuoli kun se pääs läpi. semmonen ei oo kivaa. ei kerennyt siis teleportata"):
//   wiredin voittokuiskaus "%user% pääsi radan N läpi!" (chatType 1, näkyy kaikille huoneessa) -> pelaaja on ASETUS.maaliSuojaMs (6 s) immuuni:
//   zombit eivät valitse häntä eivätkä kerrytä kontaktia (valitseKohde + paivitaKontaktit, sama sääntö johtajalla ja seuraajilla), eikä hänen oma kuole() aja.
//   Pelaaja tunnistetaan NIMESTÄ (ei objectId:stä, 684.js:n kuuleMaali reagoi vain omaan indeksiin). Suojan loppu kiinnitetään tikkiin
//   floor(vastaanotto / tikki) + 2 kuten äänet, jotta pieni vastaanottoajan ero ei hajota simulaatiota. Tilaan kajotaan vain tikissä (ei heti tässä).
const MAALI = /^(.+) pääsi radan \d+ läpi!$/;
const kuuleMaali = ev => {
  try {
    if (!ev || ev.chatType !== 1) return;
    if (ev.session && ev.session.roomId != null && Number(ev.session.roomId) !== huone) return;
    const m = MAALI.exec(String(ev.message || '').trim()); if (!m) return;
    const nimi = m[1].trim(), P = pelaajat();
    const p = P.find(q => q.nimi === nimi) || P.find(q => String(q.nimi || '').toLowerCase() === nimi.toLowerCase());
    if (!p) { lokiin({ maali: nimi, id: null, syy: 'nimeä ei löydy pelaajista' }); return; }
    const nyt = Date.now(), tikki = Math.max(50, Number(ASETUS.tikki) || 250), suojaMs = Math.max(0, Number(ASETUS.maaliSuojaMs ?? 6000));
    const vanha = SAILO.maalissa.get(p.id);
    if (vanha && nyt - vanha.saapui < 2000) return;   // sama kuiskaus kahdesti (tuplatoimitus) ei siirrä loppua
    for (const [pid, v] of SAILO.maalissa) if (!v || nyt - v.loppuMs > 60000) SAILO.maalissa.delete(pid);
    const loppuMs = (Math.floor(nyt / tikki) + 2) * tikki + suojaMs;
    SAILO.maalissa.set(p.id, { nimi, saapui: nyt, loppuMs });
    lokiin({ maali: nimi, id: p.id, suojaMs });
  } catch (x) {}
};
if (vayla && typeof vayla.addEventListener === 'function') vayla.addEventListener('RSCE_CHAT_EVENT', kuuleMaali);
tila._kuuleMaali = kuuleMaali; tila.maalissa = SAILO.maalissa;

// ---- wired-script-hybridi (682.js:153-206, 442): salaisen sanan lähetys + kaiun nielu (suu ei liiku) + puhekuplan piilotus
//   Piilotettavat sanat: salasana (684 kuolema) + aloitusSana (811 pelin aloitus) + lopetusSana (811 pelin loppu, vaihe 1c). Tyhjät pois -> 684:ssä sama joukko kuin ennen ([zk684]).
const piiloSanat = () => [ASETUS.salasana, ASETUS.aloitusSana, ASETUS.lopetusSana].map(v => String(v || '').trim().toLowerCase()).filter(Boolean);
let koukkuYhteys = null, koukkuOma = null, koukkuAlkup = null;
const koukku = () => {
  const c = yhteys(); if (!c || typeof c.handleMessages !== 'function') return null;
  if (koukkuYhteys === c && c.handleMessages === koukkuOma) return c;
  const alkup = c.handleMessages;
  const oma = function (...viestit) {
    const julkiset = [];
    try {
      const sanat = piiloSanat();   // 684: [zk684] (ennallaan) · 811: [za811] (aloitusSana; salasana tyhjä)
      const msgs = dv(c, '_messages');
      const kuiskausLuokat = new Set((msgs && msgs.getEvents && msgs.getEvents(2704) || []).map(x => x && x.constructor));
      const huutoLuokat = new Set((msgs && msgs.getEvents && msgs.getEvents(1036) || []).map(x => x && x.constructor));
      const puheLuokat = new Set((msgs && msgs.getEvents && msgs.getEvents(1446) || []).map(x => x && x.constructor));
      let i;
      viestit = viestit.filter(v => {
        const p = v && v.parser;
        // Palvelin kaiuttaa wf_trg_says_something (piilota=1) -koodin lähettäjälle kuiskauksena (2704) -> niellään, ettei suu liiku eikä kuplaa synny.
        if (sanat.length && p && typeof p.message === 'string' && sanat.includes(p.message.trim().toLowerCase())) {
          if (i === undefined) i = omaIndeksi();
          if (i == null || p.roomIndex === i) return false;
        }
        if (p && typeof p.message === 'string' && typeof p.roomIndex === 'number' && !kuiskausLuokat.has(v.constructor) && p.chatType !== 1) {
          const onHuuto = huutoLuokat.has(v.constructor) || p.chatType === 2;
          const onPuhe = puheLuokat.has(v.constructor) || p.chatType === 0 || (!kuiskausLuokat.size && p.chatType == null);
          if (onHuuto || onPuhe) julkiset.push([p.roomIndex, p.message, onHuuto ? 2 : 0]);
        }
        return true;
      });
      if (!viestit.length) return;
    } catch (x) {}
    const tulos = alkup.apply(this, viestit);
    for (const [ri, msg, ct] of julkiset) tallennaAani(ri, msg, ct);
    return tulos;
  };
  c.handleMessages = oma; koukkuYhteys = c; koukkuOma = oma; koukkuAlkup = alkup; return c;
};
const kuplaPiiloon = el => {
  try {
    for (const sana of piiloSanat()) {
      const esc = sana.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (new RegExp(':\\s*' + esc + '\\s*↩?\\s*$', 'i').test(el.textContent || '') && el.style.display !== 'none') { el.style.display = 'none'; return; }
    }
  } catch (x) {}
};
const kuplat = () => { for (const b of document.querySelectorAll('.bubble-container')) kuplaPiiloon(b); };
const kuplaVahti = new MutationObserver(kuplat);
if (document.body) kuplaVahti.observe(document.body, { childList: true, subtree: true, characterData: true });
const kuplaAjastimet = new Set();
// sanaIn: oletus ASETUS.salasana (684 kuolema); 811 kutsuu ASETUS.aloitusSana (pelin aloitus). Sama lähetys, kaiun nielu ja kuplan piilotus.
const sanoSalainen = (sanaIn) => {
  const sana = String(sanaIn == null ? (ASETUS.salasana || '') : sanaIn).trim(); if (!sana) return false;
  try {
    koukku();
    const s = istunto(); if (!s || typeof s.sendChatMessage !== 'function') return false;
    s.sendChatMessage(sana, 0);
    kuplat();
    for (const ms of [30, 300, 1000]) {
      const aj = setTimeout(kuplat, ms);
      if (aj && typeof aj.unref === 'function') aj.unref();
      kuplaAjastimet.add(aj);
    }
    return true;
  } catch (x) { lokiin({ salasanaVirhe: String(x) }); return false; }
};
tila._sanoSalainen = sanoSalainen;

// ---- oma kiinnijäänti (kp 19:25: paikallinen 'lay' ASETUS.kuolemaMakuu ms ajan ennen zk684-salasanan lähetystä; kp 20:04: iso keskitetty KUOLIT-viesti)
const ilmoita = teksti => {
  const d = document.createElement('div'); d.textContent = teksti;
  d.style.cssText = 'position:fixed;left:50%;top:14%;transform:translateX(-50%);z-index:99999;pointer-events:none;padding:8px 16px;'
    + 'background:rgba(90,0,0,.8);color:#fff;font:bold 15px sans-serif;border-radius:6px;transition:opacity .4s';
  document.body.appendChild(d); setTimeout(() => { d.style.opacity = '0'; }, 1600); setTimeout(() => d.remove(), 2100);
};
const naytaKuolit = () => {
  if (typeof document === 'undefined' || !document.body || !document.createElement) return;
  try {
    if (document.querySelectorAll) {
      for (const v of document.querySelectorAll('[data-zombit-kuolit]')) if (v && v.remove) v.remove();
    }
    const d = document.createElement('div');
    if (d.setAttribute) d.setAttribute('data-zombit-kuolit', '1');
    d.textContent = 'KUOLIT';
    if (d.style) {
      d.style.cssText = 'position:fixed;left:50%;top:42%;transform:translate(-50%,-50%);z-index:100000;pointer-events:none;'
        + 'color:#ff1a1a;font:900 72px/1.1 Impact,"Arial Black",sans-serif;letter-spacing:6px;text-transform:uppercase;'
        + 'text-shadow:0 0 18px rgba(180,0,0,.95),0 4px 12px #000,0 0 4px #000;opacity:1;transition:opacity .6s ease-out';
    }
    document.body.appendChild(d);
    const a1 = setTimeout(() => { kuplaAjastimet.delete(a1); if (d.style) d.style.opacity = '0'; }, 1500);
    const a2 = setTimeout(() => { kuplaAjastimet.delete(a2); if (d.remove) d.remove(); }, 2100);
    for (const a of [a1, a2]) {
      if (a && typeof a.unref === 'function') a.unref();
      kuplaAjastimet.add(a);
    }
  } catch (x) {}
};
const omaRuutu = () => {
  const i = omaIndeksi(); if (i == null || i < 0) return null;
  const o = e.getRoomObject(huone, i, 100), L = o && o.getLocation();
  return L ? { i, x: Math.round(L.x), y: Math.round(L.y) } : null;
};
let kuolemaKaynnissa = 0, safeIlmoitettu = 0, omaViimeSyoK = -1, odottavaKuolema = null, kavelyEstoAsti = 0, kavelyH = null, kavelyAlkup = null, kavelyOma = null;
// 811 (kp 31.10. "kuollessa pystyy kävelee"): shooter pitää kuolleena kävelyn, ammunnan ja klikit poissa koko kuollutAsti-ajan (shooter-1.15.2 :1043 ammu, :2081 wasdTick, :2210 pelikankaalle),
//   tässä kuolema + makuu (kavelyEstoAsti) PLUS odotus lopetus-teleporttiin (kuolemaLukkoAsti): vapautuu kun oma ruutu vaihtuu makuun jälkeen, uusi vuoro alkaa tai varaaika kuluu. Vain jos AMMUNTA (811); 684 ei aseta.
let kuolemaLukkoAsti = 0, kuolemaLukkoRuutu = null;
const kuolemaLukossa = (nyt) => nyt < kavelyEstoAsti || nyt < kuolemaLukkoAsti;
const asennaKavelyEsto = () => {
  try {
    const h = e && e.objectEventHandler; if (!h || typeof h.sendWalkUpdate !== 'function') return;
    if (kavelyH === h && h.sendWalkUpdate === kavelyOma) return;
    const alkup = h.sendWalkUpdate;
    kavelyOma = function (...a) { if (kuolemaLukossa(Date.now())) return; return alkup.apply(this, a); };
    h.sendWalkUpdate = kavelyOma; kavelyH = h; kavelyAlkup = alkup;
  } catch (x) {}
};
const puraKavelyEsto = () => { try { if (kavelyH && kavelyH.sendWalkUpdate === kavelyOma) kavelyH.sendWalkUpdate = kavelyAlkup; } catch (x) {} kavelyH = kavelyOma = kavelyAlkup = null; };
// kp 31.10. 12:41 "jos seisoit vaa paikallaa ja et kuollu nii on problem": syy miksi oma kuolema ei nyt voi alkaa (null = voi).
//   Sama ehto askel():ssä (ei paikallista makuuta/lammikkoa ilman kuolemaa) ja kuole():ssa; viimeisin syy näkyy tila.omaTila():ssa.
let omaSyy = null, omaSyyMs = 0;
const omaSyyKirjaa = (syy, x) => { const nyt = Date.now(); if (syy === omaSyy && nyt - omaSyyMs < 1000) return; omaSyy = syy; omaSyyMs = nyt; lokiin(Object.assign({ omaEiKuole: syy }, x || {})); };
const kuolemaEste = (nyt) => {
  const makuuMs = Math.max(0, Number(ASETUS.kuolemaMakuu ?? 1500)), lukko = Math.max(1000, Number(ASETUS.kuolemaLukko) || 5000);
  if (nyt - ALKU < ARMO) return 'armo';
  if (nyt - kuolemaKaynnissa < Math.max(lukko, makuuMs)) return 'lukko';
  if (onMaalissa(omaId(), nyt)) return 'maali';
  if (safe && saaSafe()) return 'safe';
  return null;
};
const kuole = (syy, kaappari) => {
  const nyt = Date.now(), makuuMs = Math.max(0, Number(ASETUS.kuolemaMakuu ?? 1500));
  const este = kuolemaEste(nyt);
  if (este) {
    if (este === 'safe' && nyt - safeIlmoitettu > 5000) { safeIlmoitettu = nyt; ilmoita(syy + ' (:safe päällä, ei kuolemaa)'); lokiin({ kuolema: syy, safe: true }); }
    omaSyyKirjaa(este, { kuolema: syy });
    return false;
  }
  kuolemaKaynnissa = nyt; tila.kuolemat++; naytaKuolit(); omaSyy = 'kuoli'; omaSyyMs = nyt;
  // kp 21:21 "kuolema ei näkyny se :lay sun ruudul": muut näkivät kuoleman vasta teleportista (makuun JÄLKEEN) -> kerrotaan kuolema kanavalla heti (ensisijainen lähetys)
  try { SYNK.lahetaKuolema(kaappari); } catch (x) {}
  // kp 20:06 "kun makaa pysty kävellä samalla": oman hahmon kävelykomennot estetään makuun ajan (sendWalkUpdate-kääre, puretaan siivouksessa)
  kavelyEstoAsti = nyt + makuuMs + 300; asennaKavelyEsto();
  // kp 20:28 "hahmo edellee liukuu hetken ku kuolee · jos kuolee liikkees": esto pysäyttää vain UUDET kävelyt, palvelimen kesken
  //   oleva reitti jatkui -> kävelykomento omaan nykyruutuun (alkuperäisellä sendWalkUpdatella) pysäyttää hahmon heti.
  try { const r0 = omaRuutu(); if (r0 && kavelyH && typeof kavelyAlkup === 'function') kavelyAlkup.call(kavelyH, r0.x, r0.y); } catch (x) {}
  const o = omaRuutu();
  if (o && o.i != null && makuuMs > 0) asetaHahmonAsento(o.i, 'lay');
  // 811 (ASETUS.salasana tyhjä, ei wiredejä): kuolema = makuu + run päättyy (AMMUNTA.omaKuolema), hahmo jää paikalleen eikä mitään sanota.
  if (!String(ASETUS.salasana || '').trim()) { try { if (AMMUNTA) { kuolemaLukkoAsti = nyt + makuuMs + 300 + Math.max(1000, Number(ASETUS.kuolemaLukkoMaxMs) || 12000); kuolemaLukkoRuutu = o ? { x: o.x, y: o.y } : null; AMMUNTA.omaKuolema(); } } catch (x) {} }
  const laheta = () => {
    const o2 = omaRuutu() || o;
    if (!String(ASETUS.salasana || '').trim()) {
      if (o2 && o2.i != null) asetaHahmonAsento(o2.i, 'std');
      lokiin({ kuolema: syy, tapa: 'ei wirediä (huone ' + huone + '): makuu + run päättyi', ennen: o && [o.x, o.y], makuuMs });
      return;
    }
    const ok = sanoSalainen();
    if (o2 && o2.i != null) asetaHahmonAsento(o2.i, 'std');
    lokiin({ kuolema: syy, tapa: ok ? 'wired-salasana (' + ASETUS.salasana + ')' : 'salasanan lähetys epäonnistui', ennen: o && [o.x, o.y], makuuMs });
  };
  if (makuuMs > 0) {
    // kp 20:02 "mun hahmo ei teleportannu ollenkaa kuoleman jälkee": live-päivitys kesken makuun pyyhki ajastimen -> zk684 jäi lähtemättä.
    //   Odottava lähetys talteen; siivous lähettää sen heti (ks. return-siivous).
    const aj = setTimeout(() => { kuplaAjastimet.delete(aj); odottavaKuolema = null; laheta(); }, makuuMs);
    odottavaKuolema = { aj, laheta };
    if (aj && typeof aj.unref === 'function') aj.unref();
    kuplaAjastimet.add(aj);
  } else {
    laheta();
  }
  return true;
};
const tarkistaOma = () => {
  if (Date.now() - ALKU < ARMO) return;
  const id = omaId();
  if (!onKohde({ id })) return;
  const o = omaRuutu(); if (!o) return;
  const a = ansaRuutu();
  if (a && o.x === a.x && o.y === a.y) return kuole('Astuit ansaan!');
  const tikki = Math.max(50, Number(ASETUS.tikki) || 250);
  const ikkunaK = Math.max(2, Math.round(2500 / tikki));
  for (const z of tila.zombit.concat(tila.muuttuneet || [])) {
    if (z.muuttunut && z.lahdeId === id) continue;
    if (z.viimeSyoId === id && z.viimeSyoK > omaViimeSyoK && SAILO.K - z.viimeSyoK <= ikkunaK) {
      // F6: kulutetaan vasta kun kuole() oikeasti käynnistyi (este -> yritetään uudelleen ikkunan sisällä, ei hiljaista katoamista)
      if (kuole('Zombi sai sinut kiinni!', z)) omaViimeSyoK = z.viimeSyoK ?? SAILO.K;
      return;
    }
  }
};

// ---- synkka (kp 30.10. 20:45-20:52 "ei zombit oo nyt shared jos ei oo synkas · se oli essential"; SYNKKA-SPEKSI.md, RAPORTTI-SYNKKA.md)
//   Johtaja = pienin user id niistä joiden VALMIS-sydämenlyönti (hei v=1 tai snapshot) on kuultu viimeisen hiljaisuusMs (10 s) sisällä. Johtaja lähettää
//   350 ms välein VAIN snapshotin (tikki + zombit + muuttuneet + lammikot; toimii sydämenlyöntinä), ei-johtajat vain heitä ~2 s välein, kanavana
//   window.kuplaScripts (varalla VPS-WebSocket); muut asettavat oman SAILO-tilansa snapshotiin ja
//   jatkavat omaa simulaatiota + interpolointia. Ilman yhteyttä / johtajaa 10 s: nykyinen paikallinen simulaatio. Johtajuuden vaihtuessa mitään ei
//   nollata: uusi johtaja simuloi eteenpäin viimeksi omaksutusta tilasta. Kiinnijäänti pysyy uhrin omalla koneella.
const SY = (SAILO.synk && typeof SAILO.synk === 'object') ? SAILO.synk : (SAILO.synk = {});   // säilyy live-päivityksen yli
if (!(SY.sykkeet instanceof Map)) SY.sykkeet = new Map();   // id -> { t: viimeisin viesti, tv: viimeisin VALMIS-hei/snap } (paikallinen vastaanottoaika)
if (!(SY.liittynyt >= 0)) SY.liittynyt = 0;   // milloin ws avautui ensimmäisen kerran (nollautuu vain tahattomassa katkeamisessa, ei live-päivityksessä)
if (!(SY.snapAika >= 0)) SY.snapAika = 0;
if (!(SY.snapJohtaja >= 0)) SY.snapJohtaja = 0;
if (SY.maara === undefined) SY.maara = null;
SY.odottava = null;
if (!Array.isArray(SY.kuolemat)) SY.kuolemat = [];   // vastaanotetut {t:'kuoli'}-viestit; käsitellään tiki():ssä
let AMMUNTA = null;   // 811: ammuttavat zombit (määritellään SYNKin jälkeen; SYNK kutsuu sitä vain jos ASETUS.ammuttava)
const SYNK = (() => {
  const S = () => ASETUS.synkka || {};
  const AIHE = String((ASETUS.synkka && ASETUS.synkka.aihe) || 'z684.synk');   // kuplaScripts-aihe: [A-Za-z0-9_.:-] (huonekohtainen, HUONEET; 684: z684.synk)
  // Kanava: ensisijaisesti window.kuplaScripts (Resin palvelinpuolen skriptidatakanava, ei ulkoista palvelinta; sama jolla 681 miinat synkattiin),
  //   varakanavana kp:n VPS-WebSocket jos kuplaScripts puuttuu (vanha client). Ilman kumpaakaan: kanava 'ei' = paikallinen simulaatio.
  let ws = null, ksYht = null, kanava = 'ei', suljettu = false, uudelleenAjastin = null, snapAjastin = null, viimeHei = 0, viimeV = null, hidasAsti = 0, viimeSnapMs = 0;
  const lahetysAjat = [];
  const tilasto = {
    lahetettySnap: 0, lahetettyHei: 0, vastaanotettuSnap: 0, omaksuttuSnap: 0, ohitettu: 0, virhe: null, viimeKoko: 0, viimeKEro: null,
    kanavaVirheet: 0, viimeKanavaKoodi: null, hylattyRaja: 0, hylattyKoko: 0, kaikuMs: 0, typistetty: 0, kuunteluUudelleen: 0,
    lahetettyKuolema: 0, vastaanotettuKuolema: 0, omaksuttuKuolema: 0, kuolemaToistoa: 0, kuolemaOhitettu: 0, kuolemaHylatty: 0, kuolemaEiKanavaa: 0, kuolemaVanha: 0,
  };
  const kuoliJono = [];   // lähettämättä jääneet kuolemaviestit {msg, seuraava}: yksi uusinta 400 ms päästä (snapshotit väistyvät sillä välin)
  let kuoliViimeTs = 0, kuoliViimeData = null, kuoliPalvelinRetry = false;
  const num = (v, d) => (typeof v === 'number' && isFinite(v)) ? v : d;
  const ksSaatavilla = () => { const ks = window.kuplaScripts; return (ks && typeof ks.subscribe === 'function' && typeof ks.send === 'function' && typeof ks.on === 'function') ? ks : null; };
  const auki = () => kanava === 'kuplaScripts' ? !!ksYht : !!(ws && ws.readyState === 1);
  const kelvollinenSim = () => !!ruudukko && Array.isArray(SAILO.zombit) && (SAILO.zombit.length > 0 || !!ASETUS.aallot) && SAILO.K >= 0;
  // Valmis johtajaksi: yhteys auki >= valmisMs (on ehtinyt kuulla kuka on paikalla ja omaksua johtajan snapshotit) ja oma simulaatio olemassa.
  const valmis = (nyt) => auki() && SY.liittynyt > 0 && nyt - SY.liittynyt >= Math.max(0, num(S().valmisMs, 3000)) && kelvollinenSim();
  const kelpaa = (id) => id > 0 && !(Array.isArray(S().eiJohtajaksi) && S().eiJohtajaksi.includes(id));
  // Mitattu 31.10.: piilotetun välilehden ajastimet pyörivät jopa 4 s välein -> zombit hyppivät ja osumaennuste ehtii umpeutua (katoaa + ilmestyy uudelleen). Piilotettu ei johda, jos joku muu voi.
  const piilotettu = () => { try { return !!ASETUS.ammuttava && typeof document !== 'undefined' && document.hidden === true; } catch (x) { return false; } };
  const johtajaId = (nyt) => {
    nyt = nyt || Date.now();
    if (!S().kaytossa) return 0;
    const raja = Math.max(1000, num(S().hiljaisuusMs, 10000));
    let paras = 0;
    for (const [id, h] of SY.sykkeet) if (kelpaa(id) && h.tv && nyt - h.tv < raja && (!paras || id < paras)) paras = id;
    const oma = omaId();
    if (oma && kelpaa(oma) && valmis(nyt) && (!paras || (oma < paras && !piilotettu()))) paras = oma;
    return paras;
  };
  // Seuraaja = joku muu on johtaja JA sen snapshot on kuultu < hiljaisuusMs sitten. Muuten (ei yhteyttä / ei johtajaa / hiljaista) paikallinen simulaatio.
  const seuraa = (nyt) => {
    nyt = nyt || Date.now();
    if (!S().kaytossa) return false;
    const j = johtajaId(nyt);
    return !!j && j !== omaId() && SY.snapJohtaja === j && nyt - SY.snapAika < Math.max(1000, num(S().hiljaisuusMs, 10000));
  };
  // Lähetys ei koskaan heitä. kuplaScripts: palvelin rajoittaa 3 lähetystä / 1000 ms / käyttäjä -> oma raja maxLahetysS (3) ja 1004-virheen jälkeen hitaampi snapshot-väli (hidasMs).
  // kp 18:37 "miksi ei lähde samassa viestissä osumat ja suunta": viimeisin suunta (ka) lähtee minkä tahansa viestin mukana. Oma viesti vain jos 3/s rajassa on tilaa,
  //   ja yksi paikka jää osumille. Kanavan raja on silti 3 viestiä/s, joten suunta päivittyy muilla enintään sitä tahtia.
  let katseOdottaa = null, laukauksetOdottaa = [];
  const laheta = (o) => {
    if (!auki()) return false;
    try {
      const nyt = Date.now(), ks = kanava === 'kuplaScripts';
      const ext = {};
      if (katseOdottaa != null) ext.ka = katseOdottaa;
      if (laukauksetOdottaa.length) { ext.la = laukauksetOdottaa.slice(); laukauksetOdottaa.length = 0; }
      const s = JSON.stringify(Object.keys(ext).length ? Object.assign({}, o, ext) : o);
      if (s.length > num(S().maxTavuja, 7500)) { tilasto.hylattyKoko++; return false; }
      while (lahetysAjat.length && nyt - lahetysAjat[0] >= 1000) lahetysAjat.shift();
      if (lahetysAjat.length >= (ks ? Math.max(1, num(S().maxLahetysS, 3)) : 15)) { tilasto.hylattyRaja++; return false; }
      if (ks) ksYht.ks.send(AIHE, s); else ws.send(s);
      lahetysAjat.push(nyt); tilasto.viimeKoko = s.length; katseOdottaa = null; return true;
    } catch (x) { tilasto.virhe = String(x); return false; }
  };
  const heiLaheta = (kysy) => {
    const id = omaId(); if (!(id > 0)) return false;
    const nyt = Date.now(), v = valmis(nyt) && !piilotettu() ? 1 : 0;
    const ok = laheta({ t: 'hei', id, v, q: kysy ? 1 : 0, K: SAILO.K });
    if (ok) { viimeHei = nyt; viimeV = v; tilasto.lahetettyHei++; }
    return ok;
  };

  // ---- snapshot: rakennus (johtaja)
  // Langalla zombit ovat TAULUKOITA (ei avaimia, ~70 B / zombi): KENTAT-järjestys; null = ei arvoa; häntä-nullit karsitaan. l = muuttuneen lahdeId, f = asu.
  const KENTAT = ['n', 'x', 'y', 'px', 'py', 'su', 'ko', 'ku', 'sn', 'sm', 'an', 'pu', 'pk', 'se', 'vi', 'pi', 'va', 'vx', 'vy', 'vt', 're', 'sy', 'sa', 'l', 'f'];
  const pakkaa = (o) => { const a = KENTAT.map(k => (o[k] === undefined ? null : o[k])); while (a.length && a[a.length - 1] === null) a.pop(); return a; };
  const pura = (a) => { const o = {}; if (!Array.isArray(a)) return o; for (let i = 0; i < KENTAT.length && i < a.length; i++) if (a[i] !== null && a[i] !== undefined) o[KENTAT[i]] = a[i]; return o; };
  // opt: { f: false = ei muuttuneiden asuja, l / m = enintään näin monta (UUSIMMAT) lammikkoa / muuttunutta }. Typistetty lista merkitään trl / trm
  //   -> seuraaja ei poista snapshotista puuttuvia paikallisia (puuttuminen ei silloin tarkoita poistoa).
  const rakennaSnap = (opt) => {
    opt = opt || {}; const lMax = opt.l ?? Infinity, mMax = opt.m ?? Infinity, fig = opt.f !== false;
    const tikki = Math.max(50, Number(ASETUS.tikki) || 250), K = SAILO.K, tB = K * tikki;
    const rel = v => (v == null || !isFinite(v)) ? null : Math.round(v - tB);
    const kuvaa = z => {
      const o = {
        n: z.n, x: z.x, y: z.y, px: z.px ?? z.x, py: z.py ?? z.y, su: z.suunta ?? 4, ko: z.kohdeId ?? null, ku: z.kuoli >= 0 ? z.kuoli : -1,
        sn: z.synty ?? 0, sm: rel(z.syntyMs), an: z.askelNro | 0, pu: z.puuskaAsk | 0, pk: Math.round((z.puuskaKerroin || 0) * 1000) / 1000,
        se: rel(z.seuraavaAskelMs), vi: rel(z.viimeAskelMs), pi: z.piirtoAskelMs ?? null,
        va: z.vAsk | 0, vx: z.vDx | 0, vy: z.vDy | 0, vt: z.vTaukoAsti > 0 ? rel(z.vTaukoAsti) : null, re: z.reaktioAsti > 0 ? rel(z.reaktioAsti) : null,
      };
      if (z.syo) { o.sy = z.syoId ?? null; o.sa = rel(z.syoAstiMs); }
      return o;
    };
    const snap = { t: 'snap', id: omaId(), K, E: SAILO.E, z: SAILO.zombit.filter(z => z).map(z => pakkaa(kuvaa(z))), m: [], l: [] };
    const ms = (SAILO.muuttuneet || []).filter(m => m).sort((a, b) => (b.syntyMs ?? 0) - (a.syntyMs ?? 0));
    for (const m of ms.slice(0, mMax)) {
      const o = kuvaa(m); o.l = m.lahdeId; if (fig && m.figuuri) o.f = m.figuuri;
      snap.m.push(pakkaa(o));
    }
    if (ms.length > snap.m.length) snap.trm = 1;
    const ls = (SAILO.lammikot || []).filter(l => l).sort((a, b) => (b.syntyK ?? 0) - (a.syntyK ?? 0));
    for (const l of ls.slice(0, lMax)) snap.l.push([l.lahdeId ?? l.id, l.x, l.y, l.n, l.syntyK]);   // [lahdeId, x, y, n, syntyK]
    if (ls.length > snap.l.length) snap.trl = 1;
    if (ASETUS.ammuttava && AMMUNTA) AMMUNTA.snapLisaa(snap);   // 811: ta (pisteet), kz (tuoreet tapot), tu (päättyneet runit). 684: ei kenttiä -> snapshot ennallaan
    return snap;
  };
  const snapLaheta = () => {
    if (!kelvollinenSim()) return false;
    const max = num(S().maxTavuja, 7500), koko = o => JSON.stringify(o).length;
    const opt = { f: true, l: Infinity, m: Infinity };
    let snap = rakennaSnap(opt), typistys = false;
    // Liian iso: vanhimmat lammikot pois ensin (puolitus), sitten muuttuneiden asut (johdetaan siemenestä), sitten vanhimmat muuttuneet. Zombeja ei typistetä.
    for (let i = 0; i < 16 && koko(snap) > max; i++) {
      typistys = true;
      if (snap.l.length > 0) opt.l = Math.floor(snap.l.length / 2);
      else if (opt.f) opt.f = false;
      else if (snap.m.length > 0) opt.m = Math.floor(snap.m.length / 2);
      else break;
      snap = rakennaSnap(opt);
    }
    if (typistys) tilasto.typistetty++;
    if (koko(snap) > max) { tilasto.hylattyKoko++; return false; }
    if (!laheta(snap)) return false;
    tilasto.lahetettySnap++; return true;
  };

  // ---- snapshot: omaksuminen (seuraaja). Tilaan kajotaan vain tiki():n sisällä (viesti vain tallettaa odottavan snapshotin).
  const omaksuLiike = (z, s, tB, tikki, s0) => {
    const sn = num(s.sn, z.synty ?? 0);
    if (z.synty !== sn || z.huomaa == null || !z.perusAskelMs) {
      // synty-tikki on kaikkien siementen avain -> johdetaan huomaa/luovutus/kuulo/nopeus samoin kuin johtajalla
      z.synty = sn; z.huomaa = arvoHuomaa(s0, sn, z.n); z.luovutus = arvoLuovutus(s0, sn, z.n); z.kuulo = arvoKuulo(s0, sn, z.n);
      z.meneta = z.huomaa + hystereesiVali(z); delete z._asu;
      alustaNopeus(z, s0, sn, tB, tikki);
    }
    // kp 21:17 "nyt zombit tökkii vähä": snapshot nollasi askelen ajoituksen joka 350 ms (tikkikvantisointi ±250 ms).
    //   Sama ruutu ja ajoitus < 300 ms erossa, tai paikallinen täsmälleen askeleen edellä -> paikallinen liike jatkuu, vain tila päivitetään.
    const sSeur = s.se != null ? tB + s.se : tB;
    const sama = z.x === s.x && z.y === s.y && Math.abs(sSeur - (z.seuraavaAskelMs || 0)) < 300;
    const edella = (z.x !== s.x || z.y !== s.y) && z.px === s.x && z.py === s.y && Math.abs(z.x - s.x) <= 1 && Math.abs(z.y - s.y) <= 1;
    if (sama || edella) {
      z.kohdeId = s.ko ?? null; z.kuoli = num(s.ku, -1);
      if (s.sa != null) { z.syo = true; z.syoId = s.sy ?? null; z.syoAstiMs = tB + s.sa; } else { z.syo = false; z.syoId = null; z.syoAstiMs = 0; }
      z.odottaaSynkkaa = null; tilasto.pehmeat = (tilasto.pehmeat || 0) + 1;
      return;
    }
    z.askelNro = num(s.an, 0); z.puuskaAsk = num(s.pu, 0); z.puuskaKerroin = num(s.pk, 0);
    z.x = s.x; z.y = s.y; z.px = num(s.px, s.x); z.py = num(s.py, s.y); z.suunta = num(s.su, z.suunta ?? 4);
    if (s.sm != null) z.syntyMs = tB + s.sm;
    z.viimeAskelMs = s.vi != null ? tB + s.vi : tB; z.seuraavaAskelMs = s.se != null ? tB + s.se : tB;
    if (s.pi != null) z.piirtoAskelMs = s.pi;
    z.kohdeId = s.ko ?? null; z.kohde = null;
    z.vAsk = num(s.va, 0); z.vDx = num(s.vx, 0); z.vDy = num(s.vy, 0);
    z.vTaukoAsti = s.vt != null ? tB + s.vt : 0; z.vTaukoMs = Math.max(0, z.vTaukoAsti - tB); z.vTauko = Math.ceil(z.vTaukoMs / 1000);
    z.reaktioAsti = s.re != null ? tB + s.re : 0; z.reaktioMs = Math.max(0, z.reaktioAsti - tB); z.reaktio = Math.ceil(z.reaktioMs / 1000);
    z.kuoli = num(s.ku, -1);
    if (s.sa != null) { z.syo = true; z.syoId = s.sy ?? null; z.syoAstiMs = tB + s.sa; } else { z.syo = false; z.syoId = null; z.syoAstiMs = 0; }
    z.odottaaSynkkaa = null;
  };
  // Paikallinen syömisikkuna (uhrin oma kone päätti kiinnijäännin) voittaa snapshotin, jos johtaja ei itse kerro syömisestä.
  const paikallinenSyo = (z, s, tB) => !!(z.syo && tB < (z.syoAstiMs || 0) && s.sa == null);
  const omaksuSnap = (snap, P, tB) => {
    const tikki = Math.max(50, Number(ASETUS.tikki) || 250), s0 = perusSiemen(), sieto = Math.max(0, num(S().siedotaMs, 4000));
    const sx = s => s && isFinite(s.x) && isFinite(s.y);
    // 1) tavalliset zombit (paikallinen taulukko muokataan paikallaan; järjestys = johtajan järjestys)
    const Z = SAILO.zombit, vanhat = new Map(Z.map(z => [z.n, z])), uusi = [];
    for (const s of snap.z) {
      if (!sx(s) || !isFinite(s.n)) continue;
      let z = vanhat.get(s.n);
      if (z) vanhat.delete(s.n); else z = rakennaPerusZombi(s.n, num(s.sn, SAILO.E), { x: s.x, y: s.y }, tB, tikki, s0);
      if (ASETUS.ammuttava && AMMUNTA && AMMUNTA.pidaPaikallinen(z, s)) { tilasto.ohitettuTappo = (tilasto.ohitettuTappo || 0) + 1; uusi.push(z); continue; }   // 811: oma tappo odottaa johtajan vahvistusta
      if (paikallinenSyo(z, s, tB)) tilasto.ohitettu++; else omaksuLiike(z, s, tB, tikki, s0);
      uusi.push(z);
    }
    if (!uusi.length && !ASETUS.aallot) return;
    for (const z of vanhat.values()) if (z.syo && tB < (z.syoAstiMs || 0)) uusi.push(z);   // paikallinen syöminen saa loppua
    Z.length = 0; for (const z of uusi) Z.push(z);
    SY.maara = snap.z.length;
    // 2) lammikot (lahdeId, x, y + n ja syntyK -> sama väri ja pisarat siemenestä)
    const lmV = new Map((SAILO.lammikot || []).filter(l => l).map(l => [l.lahdeId ?? l.id, l])), lmU = [];
    for (const s of Array.isArray(snap.l) ? snap.l : []) {
      if (!sx(s) || !isFinite(s.l)) continue;
      const v = lmV.get(s.l); lmV.delete(s.l);
      if (v && v.n === s.n && v.x === s.x && v.y === s.y) { lmU.push(v); continue; }
      const pp = P.find(p => p.id === s.l), k = num(s.k, 0);
      lmU.push(luoLammikko(s.x, s.y, num(s.n, 0), { id: s.l, nimi: pp ? pp.nimi : null }, k, k * tikki, s0));
    }
    // juuri syntynyt paikallinen säilyy; typistetyssä snapshotissa (trl) puuttuminen ei tarkoita poistoa -> kaikki paikalliset säilyvät
    for (const v of lmV.values()) if (v && (snap.trl || tB - num(v.syntyMs, -1e15) < sieto) && !lmU.some(l => l.n === v.n)) lmU.push(v);
    SAILO.lammikot = lmU;
    // 3) muuttuneet
    const lmPer = new Map(lmU.map(l => [l.lahdeId ?? l.id, l]));
    const mV = new Map((SAILO.muuttuneet || []).filter(m => m).map(m => [m.lahdeId, m])), mU = [];
    for (const s of Array.isArray(snap.m) ? snap.m : []) {
      if (!sx(s) || !isFinite(s.l) || !isFinite(s.n)) continue;
      let m = mV.get(s.l); mV.delete(s.l);
      if (!m || m.n !== s.n || (typeof s.f === 'string' && s.f && m.figuuri !== s.f)) {   // EHDOTUS: sama n mutta eri asu (paikallinen muuttunut syntyi eri K:lla -> eri siemen) -> johtajan versio voittaa
        const pp = P.find(p => p.id === s.l), k = num(s.sn, 0);
        m = rakennaMuuttunut({ id: s.l, nimi: pp ? pp.nimi : null, figuuri: pp ? pp.figuuri : null, x: s.x, y: s.y }, s.l, num(s.su, 4), k, k * tikki, tikki, s0, lmPer.get(s.l) || null, s.n);
        if (typeof s.f === 'string' && s.f) m.figuuri = s.f;
      }
      if (paikallinenSyo(m, s, tB)) tilasto.ohitettu++; else omaksuLiike(m, s, tB, tikki, s0);
      mU.push(m);
    }
    for (const m of mV.values()) if (m && (snap.trm || tB - num(m.syntyMs, -1e15) < sieto) && !mU.some(q => q.n === m.n)) mU.push(m);
    const maxM = Math.max(1, Math.floor(Number(ASETUS.muuttuneitaMax ?? 4)));
    while (mU.length > maxM) mU.shift();
    SAILO.muuttuneet = mU;
    for (const q of mU) if (q.n > SAILO.seuraavaMuuttunutN) SAILO.seuraavaMuuttunutN = q.n;
    paivitaLammikot(P);
    if (ASETUS.ammuttava && AMMUNTA) AMMUNTA.omaksu(snap, P);
  };
  const kasitteleSnap = (P, K) => {
    const m = SY.odottava; if (!m) return;
    if (!ruudukko || !Array.isArray(SAILO.zombit) || (!SAILO.zombit.length && !ASETUS.aallot)) return;   // odottaa kunnes oma ruudukko on valmis
    SY.odottava = null;
    const nyt = Date.now();
    if (m.id === omaId() || m.id !== johtajaId(nyt)) return;
    try {
      omaksuSnap(m, P, K * Math.max(50, Number(ASETUS.tikki) || 250));
      tilasto.omaksuttuSnap++; tilasto.viimeKEro = K - num(m.K, K);
    } catch (x) { tilasto.virhe = String(x && x.stack || x).slice(0, 300); lokiin({ synkkaVirhe: tilasto.virhe }); }
  };

  // ---- kuolema (kp 21:21): uhrin kone kertoo kuolemansa kanavalla; muut näyttävät saman makuun + lammikon + syöjän pysähtymisen kuin uhrin kone
  const lahetaKuolema = (kaappari) => {
    const id = omaId(); if (!(id > 0)) return false;
    const mk = SAILO.makaavat instanceof Map ? SAILO.makaavat.get(id) : null;   // aloitaMakuu ehti tallettaa kiinnijäännin ruudun ja suunnan
    const o = mk || omaRuutu();
    if (!o || !isFinite(o.x) || !isFinite(o.y)) return false;
    const msg = { t: 'kuoli', id, x: o.x, y: o.y, su: num(mk ? mk.suunta : (kaappari && kaappari.suunta), 4), K: SAILO.K, zn: kaappari && isFinite(kaappari.n) ? kaappari.n : null };
    if (laheta(msg)) { tilasto.lahetettyKuolema++; kuoliViimeTs = Date.now(); kuoliViimeData = msg; kuoliPalvelinRetry = false; return true; }
    if (!auki()) { tilasto.kuolemaEiKanavaa++; return false; }
    kuoliJono.push({ msg, seuraava: Date.now() + 400 });   // paikallinen 3/s-raja kieltäytyi -> yksi uusinta 400 ms päästä
    return false;
  };
  // 811: oma osuma kanavalle. Paikallinen 3/s-raja kieltäytyi -> jonoon, uusinta 400 ms välein enintään 3 kertaa (vastaanottaja idempotentti: zn+sn).
  const osumaJono = [];
  const lahetaOsuma = (o) => {
    const msg = { t: 'osuma', id: omaId(), zn: o.zn, sn: o.sn, d: o.d, w: o.w, x: o.x, y: o.y, K: SAILO.K };
    if (!(msg.id > 0)) return false;
    if (laheta(msg)) { tilasto.lahetettyOsuma = (tilasto.lahetettyOsuma || 0) + 1; return true; }
    if (!auki()) return false;
    osumaJono.push({ msg, seuraava: Date.now() + 400, yritys: 0 }); return false;
  };
  // 811 vuoro: :aloitapeli / :lopetapeli seuraajalta johtajalle (sama jono ja uusinta kuin osumalla; johtaja tarkistaa kasky-listan ja tilan)
  const lahetaKatse = (k) => { katseOdottaa = k; const nyt = Date.now(); while (lahetysAjat.length && nyt - lahetysAjat[0] >= 1000) lahetysAjat.shift();
    if (kanava === 'kuplaScripts' && lahetysAjat.length >= Math.max(1, num(S().maxLahetysS, 3)) - 1) return false;
    return laheta({ t: 'katse', id: omaId() }); };
  const lahetaLaukaus = (l) => {
    if (l) laukauksetOdottaa.push(l);
    const nyt = Date.now(); while (lahetysAjat.length && nyt - lahetysAjat[0] >= 1000) lahetysAjat.shift();
    if (kanava === 'kuplaScripts' && lahetysAjat.length >= Math.max(1, num(S().maxLahetysS, 3)) - 1) return false;
    return laheta({ t: 'laukaus', id: omaId() });
  };
  const lahetaVuoro = (o) => {
    const msg = { t: 'vuoro', id: omaId(), q: o.q, K: SAILO.K };
    if (!(msg.id > 0)) return false;
    if (laheta(msg)) { tilasto.lahetettyVuoro = (tilasto.lahetettyVuoro || 0) + 1; return true; }
    if (!auki()) return false;
    osumaJono.push({ msg, seuraava: Date.now() + 400, yritys: 0 }); return true;
  };
  const kasitteleKuolemat = (P, K) => {
    if (!SY.kuolemat.length || !ruudukko) return;
    const jono = SY.kuolemat.splice(0), nyt = Date.now(), tikki = Math.max(50, Number(ASETUS.tikki) || 250), tMs = K * tikki, s0 = perusSiemen(), omaI = omaIndeksi();
    for (const m of jono) {
      try {
        if (nyt - m.saapui > 3000) { tilasto.kuolemaVanha++; continue; }
        const p = (P || []).find(q => q && q.id === m.id);
        if (!p || m.id === omaId() || p.i === omaI) { tilasto.kuolemaOhitettu++; continue; }
        if (SAILO.makaavat.has(p.id)) { tilasto.kuolemaToistoa++; continue; }   // idempotentti: makuu jo käynnissä (tuplaviesti tai paikallinen polku)
        if ((SAILO.muuttuneet || []).some(q => q && q.lahdeId === p.id && tMs - (q.syntyMs ?? 0) < 3000)) { tilasto.kuolemaToistoa++; continue; }   // teleportti ehti jo luoda muuttuneen
        const suunta = num(m.su, 4), makuuMs = Math.max(0, Number(ASETUS.kuolemaMakuu ?? 1500)), loppuMs = tMs + makuuMs;
        const kp = { id: p.id, i: p.i, nimi: p.nimi, figuuri: p.figuuri, x: m.x, y: m.y };
        const kaikki = (SAILO.zombit || []).concat(SAILO.muuttuneet || []);
        // 1) syöjä pysyy paikallaan koko makuun (kuten uhrin koneella; viimeSyoId/K jätetään asettamatta -> ei laukaise kenenkään muun kuole()a)
        const z = isFinite(m.zn) ? kaikki.find(q => q && q.n === m.zn) : null;
        for (const zz of kaikki) {
          if (zz.kontaktit) delete zz.kontaktit[p.id];
          if (zz.kohdeId === p.id) { zz.kohdeId = null; zz.kohde = null; zz.reaktio = 0; zz.reaktioMs = 0; zz.reaktioAsti = 0; }
        }
        if (z) {
          if (kp.x !== z.x || kp.y !== z.y) z.suunta = suunnaksi(Math.sign(kp.x - z.x), Math.sign(kp.y - z.y));
          z.px = z.x; z.py = z.y;
          z.viimeAskelMs = tMs; z.seuraavaAskelMs = Math.max(tMs + tikki, loppuMs); z.piirtoAskelMs = tikki;
          z.syo = true; z.syoId = p.id; z.syoAstiMs = loppuMs;
          z.kohdeId = null; z.kohde = null; z.reaktio = 0; z.reaktioMs = 0; z.reaktioAsti = 0;
          z.vAsk = 0; z.vTauko = 0; z.vTaukoMs = 0; z.vTaukoAsti = 0; z.vDx = 0; z.vDy = 0; z.aaniKohde = null;
          z.kontaktit = {}; z.kontaktiId = null; z.kontakti = 0; z.kontaktiRaja = 0; z.kontaktiMs = 0; z.kontaktiRajaMs = 0;
          if (!z.muuttunut) z.kuoli = K;
        }
        // 2) makuu + lammikko + (makuun jälkeen) muuttunut: SAMA polku kuin uhrin koneella
        aloitaMakuu(kp, suunta, K, tMs, tikki, s0, P);
        tilasto.omaksuttuKuolema++;
        if (ASETUS.ammuttava && AMMUNTA) AMMUNTA.pelaajaKuoli(p.id, p.nimi);   // 811: auktoriteetti päättää kuolleen runin
      } catch (x) { tilasto.virhe = String(x && x.stack || x).slice(0, 300); }
    }
  };

  // ---- yhteys
  const viesti = (data) => {
    let m = null; try { m = JSON.parse(String(data)); } catch (x) { return; }
    if (!m || typeof m !== 'object') return;
    const id = Number(m.id); if (!(id > 0) || id === omaId()) return;
    if (m.ka != null && AMMUNTA) AMMUNTA.katseSaapui(id, Number(m.ka));
    if (m.la && Array.isArray(m.la) && AMMUNTA) AMMUNTA.laukauksetSaapui(id, m.la);
    const nyt = Date.now(), raja = Math.max(1000, num(S().hiljaisuusMs, 10000));
    // Yksin oltuaan (kukaan muu ei kuulunut raja-ajan sisällä: verkkokatko / kanavalla ei katkeamisilmoitusta) ensimmäinen kontakti VALMIISEEN vertaiseen
    //   aloittaa 3 s kuuntelun alusta -> ei oteta johtajuutta vanhalla saarekkeen tilalla, vaan omaksutaan ensin vertaisen snapshotit.
    if ((m.t === 'snap' || m.v) && SY.liittynyt > 0 && ![...SY.sykkeet].some(([pid, ph]) => pid !== id && nyt - ph.t < raja)) { SY.liittynyt = nyt; tilasto.kuunteluUudelleen++; }
    const h = SY.sykkeet.get(id) || { t: 0, tv: 0 };
    h.t = nyt; if (m.t === 'snap' || (m.t === 'hei' && m.v)) h.tv = nyt;
    SY.sykkeet.set(id, h);
    if (m.t === 'hei') { if (m.q && johtajaId(nyt) !== omaId()) heiLaheta(false); }   // uusi tulokas kysyy "kuka on paikalla" -> vastaa muut kuin johtaja (johtaja ei lähetä muuta kuin snapshotin)
    else if (m.t === 'snap' && Array.isArray(m.z) && id === johtajaId(nyt)) {
      m.z = m.z.map(pura); m.m = (Array.isArray(m.m) ? m.m : []).map(pura);
      m.l = (Array.isArray(m.l) ? m.l : []).map(a => Array.isArray(a) ? { l: a[0], x: a[1], y: a[2], n: a[3], k: a[4] } : {});
      SY.odottava = m; SY.snapAika = nyt; SY.snapJohtaja = id; tilasto.vastaanotettuSnap++;
    } else if (m.t === 'osuma' && ASETUS.ammuttava && AMMUNTA) {   // 811: ampujan osuma; vain auktoriteetti (johtaja / paikallinen) hyväksyy, tiki():ssä
      AMMUNTA.vastaanota(id, m, nyt); tilasto.vastaanotettuOsuma = (tilasto.vastaanotettuOsuma || 0) + 1;
    } else if (m.t === 'katse') {
    } else if (m.t === 'vuoro' && ASETUS.vuoro && AMMUNTA) {   // 811: vuoropyyntö; vain auktoriteetti käsittelee (vuoroTick)
      AMMUNTA.vuoroVastaanota(id, m); tilasto.vastaanotettuVuoro = (tilasto.vastaanotettuVuoro || 0) + 1;
    } else if (m.t === 'kuoli' && isFinite(m.x) && isFinite(m.y)) {   // oma kaiku on jo suodatettu (id === omaId) ylempänä
      SY.kuolemat.push({ id, x: Math.round(m.x), y: Math.round(m.y), su: m.su, K: m.K, zn: m.zn, saapui: nyt });
      if (SY.kuolemat.length > 16) SY.kuolemat.shift();
      tilasto.vastaanotettuKuolema++;
    }
  };
  const ajastaUudelleen = () => {
    if (suljettu) return;
    if (uudelleenAjastin) clearTimeout(uudelleenAjastin);
    uudelleenAjastin = setTimeout(() => { uudelleenAjastin = null; yhdista(); }, Math.max(1000, num(S().uudelleenMs, 5000)));
  };
  // ---- varakanava: VPS-WebSocket (vain jos window.kuplaScripts puuttuu)
  const yhdista = () => {
    if (suljettu || ws || kanava === 'kuplaScripts' || !S().kaytossa || typeof WebSocket === 'undefined' || !S().url) return;
    let s = null;
    try { s = new WebSocket(S().url); } catch (x) { tilasto.virhe = String(x); ajastaUudelleen(); return; }
    ws = s;
    s.onopen = () => { if (ws !== s || suljettu) return; kanava = 'ws'; if (!(SY.liittynyt > 0)) SY.liittynyt = Date.now(); heiLaheta(true); };
    s.onmessage = ev => { if (ws === s && !suljettu) viesti(ev && ev.data); };
    s.onclose = () => { if (ws !== s) return; ws = null; if (kanava === 'ws') kanava = 'ei'; if (suljettu) return; SY.liittynyt = 0; ajastaUudelleen(); };
    s.onerror = () => { try { s.close(); } catch (x) {} };
  };
  const wsSulje = () => {
    const s = ws; ws = null; if (kanava === 'ws') kanava = 'ei';
    if (s) { try { s.onopen = s.onmessage = s.onclose = s.onerror = null; s.close(); } catch (x) {} }
  };
  // ---- ensisijainen kanava: window.kuplaScripts (subscribe/send/on/unsubscribe). Lähettäjä saa oman viestinsä takaisin (kaiku) -> senderId === oma ohitetaan.
  const ksViesti = (m) => {
    try {
      if (!m || m.topic !== AIHE || typeof m.data !== 'string') return;
      if (Number(m.senderId) === omaId()) { tilasto.kaikuMs = Date.now(); return; }
      viesti(m.data);
    } catch (x) { tilasto.virhe = String(x); }
  };
  const ksVirhe = (e) => {
    // koodi 1004 = kieltäytyi (rate). Ei uudelleenyritysten silmukkaa: lasketaan ja hidastetaan snapshot-väli hidasMs:ään hidasKestoMs ajaksi.
    tilasto.kanavaVirheet++; tilasto.viimeKanavaKoodi = e && e.code != null ? e.code : null;
    if (e && (e.code === 1004 || e.code === 429)) hidasAsti = Date.now() + Math.max(0, num(S().hidasKestoMs, 5000));
    // kuolemaviesti juuri lähetetty ja palvelin kieltäytyi (1004/429) -> yksi uusinta (vastaanottaja on idempotentti, tuplaviesti ei haittaa)
    if (e && (e.code === 1004 || e.code === 429) && kuoliViimeData && !kuoliPalvelinRetry && Date.now() - kuoliViimeTs < 700) {
      kuoliPalvelinRetry = true; kuoliJono.push({ msg: kuoliViimeData, seuraava: Date.now() + 400 });
    }
  };
  const ksOta = () => {
    const ks = ksSaatavilla(); if (!ks) return false;
    const offs = [];
    try {
      const o1 = ks.on('message', ksViesti); if (typeof o1 === 'function') offs.push(o1);
      const o2 = ks.on('error', ksVirhe); if (typeof o2 === 'function') offs.push(o2);
      ks.subscribe(AIHE);
      // hot-reload: vanhan instanssin unsubscribe voi pudottaa uuden tilauksen (palvelimella yksi per käyttäjä+aihe) -> tilataan uudelleen 10 s välein
      const ri = setInterval(() => { try { if (!suljettu) ks.subscribe(AIHE); } catch (x) {} }, 10000); offs.push(() => clearInterval(ri));
      ksYht = { ks, offs }; kanava = 'kuplaScripts';
      if (!(SY.liittynyt > 0)) SY.liittynyt = Date.now();
      heiLaheta(true);
      return true;
    } catch (x) {
      tilasto.virhe = String(x); for (const o of offs) { try { o(); } catch (y) {} }
      return false;
    }
  };
  const ksSulje = () => {
    const y = ksYht; ksYht = null; if (kanava === 'kuplaScripts') kanava = 'ei';
    if (!y) return;
    for (const o of y.offs) { try { o(); } catch (x) {} }
    try { y.ks.unsubscribe(AIHE); } catch (x) {}
  };
  const valitseKanava = () => {
    if (suljettu || !S().kaytossa || kanava === 'kuplaScripts') return;
    if (ksSaatavilla() && ksOta()) {   // kuplaScripts löytyi (myös myöhemmin): vaihdetaan varakanavalta
      wsSulje(); if (uudelleenAjastin) { clearTimeout(uudelleenAjastin); uudelleenAjastin = null; }
      return;
    }
    if (!ws && !uudelleenAjastin) yhdista();
  };
  const ajastinTick = () => {
    try {
      const nyt = Date.now();
      for (const [id, h] of [...SY.sykkeet]) if (nyt - h.t > 60000) SY.sykkeet.delete(id);
      valitseKanava();
      if (!auki()) return;
      if (kuoliJono.length && nyt >= kuoliJono[0].seuraava) {   // kuolemaviestin uusinta (ensisijainen)
        const j = kuoliJono.shift();
        if (laheta(j.msg)) { tilasto.lahetettyKuolema++; kuoliViimeTs = nyt; kuoliViimeData = j.msg; }
        else if ((j.yritys = (j.yritys || 0) + 1) < 3) { j.seuraava = nyt + 400; kuoliJono.unshift(j); }   // paikallinen 3/s-raja (1 s ikkuna) täynnä: uusi yritys 400 ms päästä, enintään 3 uusintaa
        else tilasto.kuolemaHylatty++;
      }
      if (osumaJono.length && nyt >= osumaJono[0].seuraava && !kuoliJono.length) {   // 811: osuman uusinta (kuolemaviesti ensin)
        const j = osumaJono.shift();
        if (laheta(j.msg)) tilasto.lahetettyOsuma = (tilasto.lahetettyOsuma || 0) + 1;
        else if (++j.yritys < 3) { j.seuraava = nyt + 400; osumaJono.unshift(j); }
        else tilasto.osumaHylatty = (tilasto.osumaHylatty || 0) + 1;
      }
      const v = valmis(nyt) ? 1 : 0;
      if (v && johtajaId(nyt) === omaId()) {
        // johtaja: VAIN snapshot (toimii sydämenlyöntinä); 1004:n jälkeen hitaampi väli
        const vali = nyt < hidasAsti ? Math.max(num(S().snapMs, 350), num(S().hidasMs, 500)) : num(S().snapMs, 350);
        if (!kuoliJono.length && !osumaJono.length && nyt - viimeSnapMs >= vali - 20 && snapLaheta()) viimeSnapMs = nyt;   // jonossa oleva kuolemaviesti ohittaa snapshotin
      } else if (nyt - viimeHei >= Math.max(500, num(S().heiMs, 2000)) || v !== viimeV) heiLaheta(false);
    } catch (x) { tilasto.virhe = String(x && x.stack || x).slice(0, 300); }
  };
  const kaynnista = () => {
    if (!S().kaytossa) return;
    // kello tikittää tiheästi (50 ms) ja lähetysvälit (snapMs 350 / hidasMs 500 / heiMs 2000) tarkistetaan kuluneesta ajasta -> 500 ms ei pyöristy 700:ksi
    snapAjastin = setInterval(ajastinTick, Math.max(20, num(S().kelloMs, 50)));
    valitseKanava();
  };
  const sulje = () => {
    suljettu = true;
    if (snapAjastin) { clearInterval(snapAjastin); snapAjastin = null; }
    if (uudelleenAjastin) { clearTimeout(uudelleenAjastin); uudelleenAjastin = null; }
    ksSulje(); wsSulje();   // ks: off() jokaiselle on():lle + unsubscribe; ws: close
  };
  const tiedot = () => {
    const nyt = Date.now(), j = johtajaId(nyt), oma = omaId();
    return {
      kanava,   // 'kuplaScripts' | 'ws' | 'ei'
      rooli: !S().kaytossa ? 'pois' : !auki() ? 'yksin (ei kanavaa)' : j === oma ? 'johtaja' : (seuraa(nyt) ? 'seuraaja' : (j ? 'odottaa snapshotia' : 'yksin')),
      johtaja: j, oma, ws: ws ? ws.readyState : null, valmis: valmis(nyt), snapIkaMs: SY.snapAika ? nyt - SY.snapAika : null,
      kaikuIkaMs: tilasto.kaikuMs ? nyt - tilasto.kaikuMs : null,
      sykkeet: [...SY.sykkeet].map(([id, h]) => ({ id, ikaMs: nyt - h.t, valmisIkaMs: h.tv ? nyt - h.tv : null })), ...tilasto,
    };
  };
  return { seuraa, johtajaId, kasitteleSnap, kasitteleKuolemat, lahetaKuolema, lahetaOsuma, lahetaVuoro, lahetaKatse, lahetaLaukaus, kaynnista, sulje, tiedot, snapLaheta, omaksuSnap, rakennaSnap };
})();
tila.synkka = SYNK.tiedot; tila._synk = SYNK;

// ---- AMMUNTA (huone 811, kp 31.10. 15:44-15:48 "tässä huoneessa ne on sit shootable" · "valikoidusti kupla shooter / left 4 kupla mekaniikkaa"
//   · "ASU KANAVAA EI KÄYTETÄ" · "käytetään room 5 kanavaa"; kp 16:02 "otetaan vanha bow ja gun ampumis nopeus siten miten ne oli jo tehty" ·
//   "sword voi kans pitää sellasenaan"). Lähde: D:/re-lab/tmp/shooter/shooter-1.15.2.user.js (Left 4 Kupla 1.15.2):
//   ASEET (:503-509) arvot sellaisenaan, vahinkoPohja (:829), sateella (:878), kaikkiKohteet/PYORAHDYS/lapiKerroin (:905-925), ammu (:1042),
//   luodiTick (projektiili radalta, :1745), veto/auto (:2133-2145), hiirenVektori (:2163), kamera (:487), WASD (:2037-2094), zHp 60 (:177).
//   EI shooterin verkkoa (datajako / asukanava / paketti 2730 / figure-kehykset / aula / tiimit / gist-lataaja) eikä raakapaketteja
//   (3320/3301/käsiesine): kävely clientin omalla sendWalkUpdatella, jaettu tila tämän tiedoston SYNK-kanavalla (window.kuplaScripts).
//   MALLI: ampujan client päättää osuman PIIRRETTYYN zombiin ja vahingon (kuten L4K 1.15.0 "ampujan client päättää osuman zombiin, isäntä pitää
//   HP:n"); AUKTORITEETTI (johtaja tai paikallinen simulaatio) pitää zombin HP:n (avain n:sn), tappaa kerran ja laskee pisteen -> tuplatappo ei
//   tuplaa (tapettu zombi syntyy uudella sn:llä). Run = pelaajan tapot viime kuolemasta; kuolema päättää runin, tulos talteen; läpi = tapot >= 25.
//   Rajapinta tulostaululle: window['__zombi' + huone] (811: window.__zombi811), ks. julkaise().
AMMUNTA = (() => {
  if (!ASETUS.ammuttava) return null;
  const AM = (SAILO.ammunta && typeof SAILO.ammunta === 'object') ? SAILO.ammunta : (SAILO.ammunta = {});   // säilyy live-päivityksen yli
  if (!AM.pisteet || typeof AM.pisteet !== 'object') AM.pisteet = {};   // pelaaja-id -> { nimi, tapot, lapi, run }
  if (!Array.isArray(AM.kz)) AM.kz = [];             // auktoriteetin hyväksymät tuoreet tapot { n, sn, a, x, y, K, ms }
  if (!Array.isArray(AM.tulokset)) AM.tulokset = []; // päättyneet runit { id, nimi, tapot, lapi, run, syy, t }
  if (!Array.isArray(AM.jono)) AM.jono = [];         // käsiteltävät osumat (omat + vastaanotetut), tiki():ssä
  if (!(AM.zhp instanceof Map)) AM.zhp = new Map();  // auktoriteetti: 'n:sn' -> jäljellä oleva HP (vain vahingoittuneet)
  if (!(AM.odottavat instanceof Map)) AM.odottavat = new Map();   // seuraajan oma tappo: n -> { sn, asti }
  if (!(AM.ennuste instanceof Map)) AM.ennuste = new Map();       // 'n:sn' -> asti (oma ennustettu tappo kunnes johtaja vahvistaa)
  if (!(AM.hpEnn instanceof Map)) AM.hpEnn = new Map();           // 'n:sn' -> { hp, asti } ampujan oma HP-ennuste (piilotus vasta kun <= 0)
  if (!(AM.nahdyt instanceof Set)) AM.nahdyt = new Set();         // tappoavaimet joiden ruumis on jo näytetty tässä clientissä
  const tilasto = { ammuttu: 0, osui: 0, vahinko: 0, hyvaksytty: 0, hylatty: 0, tapettu: 0, vahvistettu: 0, ennusteVanheni: 0, kavely: 0, kavelyKiintio: 0, nollattu: 0 };
  const tikkiMs = () => Math.max(50, Number(ASETUS.tikki) || 250);
  const raja = () => Math.max(1, Number(ASETUS.tappoRaja) || 25);
  const zHpMax = () => Math.max(1, Number(ASETUS.zombiHp) || 60);
  const auktoriteetti = () => !SYNK.seuraa();   // johtaja tai yksin. Seuraaja ottaa pisteet ja HP:t johtajan snapshotista.
  const nimiId = (id, P) => { const p = (P || []).find(q => q && q.id === id); return p ? p.nimi : ((AM.pisteet[id] && AM.pisteet[id].nimi) || null); };
  const piste = (id, nimi) => { let p = AM.pisteet[id]; if (!p) p = AM.pisteet[id] = { nimi: nimi || null, tapot: 0, lapi: 0, run: 1 }; if (nimi) p.nimi = nimi; return p; };

  // ---- aseet: ASETUS.aseet (L4K arvot) + ASETUS.ase.valittu
  const ASEJARJ = ['luoti', 'jousi', 'miekka'];   // näppäimet 1 / 2 / 3
  const aseOf = (w) => (ASETUS.aseet && ASETUS.aseet[w]) || (ASETUS.aseet && ASETUS.aseet.luoti) || {};
  const aseNyt = () => aseOf(ASETUS.ase && ASETUS.ase.valittu);
  const valitseAse = (w) => { if (!ASETUS.aseet || !ASETUS.aseet[w]) return false; ASETUS.ase.valittu = w; veto = null; autoPois();
    if (aseAktiivinen()) kasiin(aseOf(w).kasi);   // vaihe 1c: L4K valitseAse (shooter :825) vaihtaa myös käden
    try { hudPaivita(); } catch (x) {} return true; };
  // ---- käsiesine (vaihe 1c, kp 17:00 "ase handitemit puuttuu"): L4K kasiin() = chat-komento ':handitem <id>' (shooter :586-587, mitattu
  //   L4K:ssa robolla 19.10.: figure_carry_object = id). Lähetys clientin omalla sendChatMessagella = sama kuin pelaaja kirjoittaisi komennon
  //   chattiin. EI asukanavaa (2730 / figure / datajako). VIP-komento: ilman VIP:tä ase ei näy kädessä, peli toimii (shooter :101).
  //   Ei toistoa: sama id ei lähde kahdesti (AM.kasiNyt säilyy live-päivityksen yli). Tyhjennys ':handitem 0' vain jos tämä skripti asetti käden.
  const kasiin = (id) => {
    id = Math.max(0, id | 0); if (AM.kasiNyt === id) return false;
    if (!id && !(AM.kasiNyt > 0)) return false;
    try { const s = istunto(); if (!s || typeof s.sendChatMessage !== 'function') return false; s.sendChatMessage(':handitem ' + id, 0); AM.kasiNyt = id; tilasto.kasi = (tilasto.kasi || 0) + 1; lokiin({ kasi: id }); return true; }
    catch (x) { return false; }
  };
  const latausMs = A => A.lataus ? A.lataus[2] : A.lapi ? A.lapi[1] : 1000;   // shooter :913
  const lapiLyonti = (A, c) => !!(A && A.lapi && c != null && +c >= 1);       // shooter :919
  // shooter :829 vahinkoPohja (asetus.vahinko = 1): täysi miekka lapiVahinko · jousen lataus lineaarisesti · pistoolin lineaari etäisyydestä
  const vahinkoOf = (A, c, d) => {
    if (A.lapiVahinko && c != null && +c >= 1) return A.lapiVahinko;
    if (A.lataus && c != null && isFinite(c)) { const q = Math.max(0, Math.min(1, +c)); if (q >= 1) return Math.max(A.lataus[1], zHpMax());   /* kp 19:30 täysi veto tappaa yhdellä */ return A.lataus[0] + (A.lataus[1] - A.lataus[0]) * q; }
    if (A.lineaari && d != null && isFinite(d)) { const [a0, L] = A.lineaari; return Math.max(0, a0 * (1 - Math.max(0, +d) / L)); }
    return Number(A.vahinko) || 12.5;
  };
  const TAKA_KERROIN = 0.75, OSUMA_SADE = 0.55, PYORAHDYS = -2;   // shooter :120, :913, :1049

  // ---- oma HP ja kiinnijäänti (kp 16:01: vaihtoehto A 'hp' tai B 'kontakti'; kp päättää, ASETUS.kiinnijaanti)
  const hpMax = () => Math.max(1, Number(ASETUS.hp && ASETUS.hp.max) || 100);
  if (!(AM.hp >= 0)) AM.hp = hpMax();
  if (!(AM.hpMuutos >= 0)) AM.hpMuutos = 0;
  const hpTila = () => ASETUS.kiinnijaanti === 'hp';
  // askel(): oma kiinnijäänti. true = selvisi (laskuri nollataan, ei kuolemaa), false = kuolema etenee (kuole()). Vain uhrin oma kone (kuten 684).
  const purema = (pid) => {
    if (!hpTila() || pid !== omaId()) return false;
    AM.hp = Math.max(0, AM.hp - Math.max(0, Number(ASETUS.hp.purema) || 15)); AM.hpMuutos = Date.now();
    lokiin({ purema: pid, hp: AM.hp });
    if (AM.hp > 0) { try { ilmoita('Zombi puri! HP ' + Math.round(AM.hp) + '/' + hpMax()); } catch (x) {} return true; }
    return false;
  };
  // Heal-lähteen kytkentäkohta. Toteutettu: ASETUS.hp.heal = { tapa: 'aika', hpS, viiveMs }. Muut lähteet (safe house, poimittava, tappo)
  //   kutsuvat AMMUNTA.paranna(maara).
  const paranna = (maara) => { const ennen = AM.hp; AM.hp = Math.min(hpMax(), AM.hp + Math.max(0, Number(maara) || 0)); return AM.hp - ennen; };
  let viimeHeal = Date.now();
  const healTick = (nyt) => {
    const h = ASETUS.hp && ASETUS.hp.heal, dt = nyt - viimeHeal; viimeHeal = nyt;
    if (!hpTila() || !h || h.tapa !== 'aika' || AM.hp >= hpMax() || nyt - AM.hpMuutos < Math.max(0, Number(h.viiveMs) || 0)) return;
    paranna((Number(h.hpS) || 0) * dt / 1000);
  };
  // Kiinnijäännin rajan kerroin oman aseen mukaan (vaihtoehto B, esim. miekka iso). Vain oma pelaaja (uhrin kone päättää).
  const kontaktiKerroin = (pid) => { if (pid !== omaId()) return 1; const k = Number(aseNyt().kontaktiKerroin); return k > 0 ? k : 1; };
  // kp 16:01 "miekan käyttö nollais aina kiinni jäämis laskurin": pelaajan kontaktilaskuri pois kaikilta zombeilta (myös muuttuneilta).
  const nollaaKontakti = (pid) => {
    let n = 0;
    for (const z of (SAILO.zombit || []).concat(SAILO.muuttuneet || [])) if (z && z.kontaktit && z.kontaktit[pid]) {
      delete z.kontaktit[pid]; n++; if (z.kontaktiId === pid) { z.kontaktiId = null; z.kontakti = 0; z.kontaktiMs = 0; } }
    tilasto.nollattu += n; if (n) lokiin({ nollaaKontakti: pid, zombeja: n });
    return n;
  };
  // VAIHE 2 -koukut (kp 16:00, eivät vaikuta vaiheessa 1: kaikilla aseilla aani/aggroSade null):
  //   aggro: auktoriteetti hyväksyessään osuman asettaa osutun zombin lähellä (BFS <= A.aggroSade) olevien zombien kohteeksi ampujan.
  //   Deterministinen, koska vain auktoriteetti tekee sen ja snapshot vie kohteen (ko) muille.
  const aggro = (A, z, ampuja, P) => {
    if (!A || !(A.aggroSade > 0) || !ruudukko || !z) return 0;
    const p = (P || []).find(q => q && q.id === ampuja); if (!p || !onKohde(p)) return 0;
    const d = kentta(z.x, z.y), W = ruudukko.W; let n = 0;
    for (const q of SAILO.zombit || []) { if (!q || q === z || q.kuoli >= 0 || q.muuttunut) continue; const et = d[q.y * W + q.x];
      if (et >= 0 && et <= A.aggroSade) { q.kohdeId = ampuja; q.kohde = p; q.reaktioAsti = 0; q.reaktioMs = 0; q.reaktio = 0; q.vAsk = 0; q.vTaukoAsti = 0; n++; } }
    return n;
  };
  //   aani: laukauksen ääniveto (room 5:n kuuloVali/tutkiRaja). SAILO.aanet on deterministinen vain koska jokainen client kuulee saman chatin;
  //   laukauksen tietää vain ampuja -> toteutus vaatii kanavaviestin (osuma-viestin 'a'-kenttä tai harvennettu 'aani'-viesti, palvelimen
  //   raja 3 lähetystä/s) ja auktoriteetin lisäyksen kAani-tikkiin kuten tallennaAani. Vaiheessa 1 kirjataan vain lokiin.
  const aaniLaukaus = (A, minä) => { if (!A || !A.aani || !minä) return false; lokiin({ vaihe2: 'aani', ase: A.nimi }); return false; };

  // ---- auktoriteetti: osuman hyväksyntä (HP 'n:sn'; idempotentti tappo: kuollut/uudelleensyntynyt zombi ei ota osumaa)
  const hyvaksy = (o, K, P) => {
    // 811 vuoro: vain vuoron pelaajan osumat pelin aikana (katsojan / vanhan clientin laukaus ei vahingoita eikä tuo pisteitä)
    if (ASETUS.vuoro && !(AM.vuoro && AM.vuoro.vu && AM.vuoro.vu.id === o.id && AM.vuoro.vu.vaihe === 1)) { tilasto.hylatty++; tilasto.hylattyVuoro = (tilasto.hylattyVuoro || 0) + 1; return false; }
    const z = (SAILO.zombit || []).find(q => q && !q.muuttunut && q.n === o.zn);
    if (!z || z.synty !== o.sn || z.kuoli >= 0) { tilasto.hylatty++; return false; }
    const avain = z.n + ':' + o.sn, dmg = Math.max(0, Math.min(1000, Number(o.d) || 0)); if (!(dmg > 0)) { tilasto.hylatty++; return false; }
    const hp = Math.max(0, (AM.zhp.has(avain) ? AM.zhp.get(avain) : zHpMax()) - dmg);
    tilasto.hyvaksytty++; tilasto.vahinko += dmg;
    aggro(aseOf(o.w), z, o.id, P);   // vaihe 2 -koukku
    if (hp > 0) { AM.zhp.set(avain, Math.round(hp * 10) / 10); return true; }
    AM.zhp.delete(avain);
    z.ammuttu = true; if (AM.aalto && AM.aalto.n) AM.aalto.ku++;
    z.kuoli = K; z.syo = false; z.syoId = null; z.syoAstiMs = 0; z.kohdeId = null; z.kohde = null; z.reaktio = 0; z.reaktioMs = 0; z.reaktioAsti = 0;
    z.kontaktit = {}; z.kontaktiId = null; z.kontakti = 0; z.kontaktiRaja = 0; z.kontaktiMs = 0; z.kontaktiRajaMs = 0;
    const p = piste(o.id, nimiId(o.id, P)); p.tapot++; tilasto.tapettu++;
    if (p.tapot >= raja() && !p.lapi) { p.lapi = 1; lokiin({ lapi: o.id, nimi: p.nimi, tapot: p.tapot }); }
    AM.kz.push({ n: z.n, sn: o.sn, a: o.id, x: z.x, y: z.y, K, ms: K * tikkiMs() });
    while (AM.kz.length > 12) AM.kz.shift();
    if (o.id === omaId()) { AM.ennuste.delete(avain); ilmoitaTappo(p.tapot); }
    if (!AM.nahdyt.has(avain)) { AM.nahdyt.add(avain); ruumis(z.n, o.sn, z.x, z.y); }
    lokiin({ tappo: z.n, sn: o.sn, ampuja: o.id, tapot: p.tapot });
    return true;
  };
  const runLoppu = (id, nimi, syy) => {
    const p = piste(id, nimi);
    AM.tulokset.push({ id, nimi: p.nimi, tapot: p.tapot, lapi: p.lapi, run: p.run, syy, t: Date.now() });
    while (AM.tulokset.length > 20) AM.tulokset.shift();
    lokiin({ runLoppu: id, tapot: p.tapot, lapi: p.lapi, syy });
    p.tapot = 0; p.lapi = 0; p.run++;
    // L4K: kaikki kaatuneet = peli ohi. 811:ssä kuolema päättää runin -> aallot alusta zTaukoMs:n jälkeen (kaikki zombit pois)
    // 811 vuoro: vuoron pelaajan run päättyi -> vuoro päättyy (aallot nollaan, seuraava vuoro aloittaa; ei automaattista uutta aaltoa)
    if (ASETUS.vuoro) { if (auktoriteetti() && AM.vuoro && AM.vuoro.vu && AM.vuoro.vu.id === id) vuoroLopeta(syy, false); return; }
    if (ASETUS.aallot && auktoriteetti()) { const tMs = SAILO.K * tikkiMs(); AM.aalto = { n: 0, k: 0, sp: 0, ku: 0, tauko: 0, alku: tMs + Math.max(0, Number(ASETUS.aallot.taukoMs) || 6000), seur: 0, idx: 0 }; if (Array.isArray(SAILO.zombit)) SAILO.zombit.length = 0; }
  };
  // tiki(): omat ja vastaanotetut osumat. Auktoriteetti hyväksyy; seuraaja tekee vain OMAN tappavan osumansa paikallisesti (optimistinen) ja
  //   lähettää jokaisen oman osumansa johtajalle.
  const kasittele = (P, K) => {
    const nyt = Date.now();
    healTick(nyt);
    for (const [n, v] of [...AM.odottavat]) if (nyt > v.asti) AM.odottavat.delete(n);
    for (const [a, asti] of [...AM.ennuste]) if (nyt > asti) { AM.ennuste.delete(a); tilasto.ennusteVanheni++; }
    for (const [a, v] of [...AM.hpEnn]) if (nyt > v.asti) AM.hpEnn.delete(a);
    if (!AM.jono.length) return;
    const jono = AM.jono.splice(0), auk = auktoriteetti();
    for (const o of jono) {
      if (o.nollaa) { nollaaKontakti(o.id); continue; }   // aseen käyttö (A.nollaaKontakti), käsitellään tiki():ssä
      if (nyt - o.saapui > 3000) { tilasto.hylatty++; continue; }
      if (auk) { hyvaksy(o, K, P); continue; }
      if (!o.oma) continue;   // seuraaja ei päätä muiden osumia (johtaja päättää)
      if (o.tappava) {
        const z = (SAILO.zombit || []).find(q => q && !q.muuttunut && q.n === o.zn);
        if (z && z.synty === o.sn && z.kuoli < 0) { z.kuoli = K; z.ammuttu = true; z.kohdeId = null; z.kohde = null; z.kontaktit = {}; }
        AM.odottavat.set(o.zn, { sn: o.sn, asti: nyt + 2500 });
        AM.ennuste.set(o.zn + ':' + o.sn, nyt + 2500);
      }
      SYNK.lahetaOsuma(o);
    }
  };
  // kp 19:23: vastaanottaja pitää toisen pelaajan katseen myös tämän kävelyaskelten aikana (moottori palauttaa suunnan joka askeleella): muisti 2500 ms, tasaus 30 ms tikillä.
  const katseMuisti = new Map();
  const katseKertaa = () => {
    if (!katseMuisti.size) return; const nyt = Date.now();
    for (const [id, m] of katseMuisti) {
      if (nyt - m.t > 2500) { katseMuisti.delete(id); continue; }
      try { const p = (pelaajat() || []).find(q => q && q.id === id); if (!p) continue; const o = e.getRoomObject(huone, p.i, 100), d = o && o.getDirection(); if (d && d.x !== m.k) { o.setDirection(new d.constructor(m.k, d.y, d.z)); o.model.setValue('head_direction', m.k); } } catch (x) {}
    }
  };
  const katseSaapui = (id, k) => { if (!isFinite(k) || id === omaId()) return; katseMuisti.set(id, { k, t: Date.now() }); const p = (pelaajat() || []).find(q => q && q.id === id); if (!p) return;
    try { const o = e.getRoomObject(huone, p.i, 100), d = o && o.getDirection(); if (d) { o.setDirection(new d.constructor(k, d.y, d.z)); o.model.setValue('head_direction', k); } } catch (x) {} };
  const laukauksetSaapui = (id, lista) => {
    if (id === omaId() || !Array.isArray(lista)) return;
    const nyt = Date.now(), p = (pelaajat() || []).find(q => q && q.id === id);
    for (const item of lista) {
      if (!Array.isArray(item)) continue;
      const tyyppi = item[0], w = typeof item[1] === 'string' ? item[1] : 'luoti';
      const x = Number(item[2]), y = Number(item[3]), z = Number(item[4]) || (p ? p.z : 0);
      const dx = Number(item[5]), dy = Number(item[6]), c = item[7] != null ? Number(item[7]) : undefined;
      if (!isFinite(x) || !isFinite(y) || !isFinite(dx) || !isFinite(dy)) continue;
      const A = aseOf(w);
      if (tyyppi === 'p') {
        const LL = item[8] != null ? Number(item[8]) : (A.lento || 12);
        const este = item[9] != null ? Number(item[9]) : esteMatka(x, y, dx, dy, 40, { z });
        luodit.push({ x, y, z, dx, dy, t0: nyt, w, c, LL, este, pm: null, piirtoVain: true });
      } else if (tyyppi === 'h') {
        const lapi = !!item[8], pituus = item[9] != null ? Number(item[9]) : (A.kantama || 12);
        jaljet.push({ x, y, z, dx, dy, pituus, t0: nyt, vari: A.vari, lapi, w, i: p ? p.i : null });
        while (jaljet.length > 20) jaljet.shift();
      }
    }
  };
  const vastaanota = (id, m, nyt) => {
    if (!isFinite(m.zn) || !isFinite(m.sn)) return;
    AM.jono.push({ id, oma: false, zn: Number(m.zn), sn: Number(m.sn), d: Number(m.d) || 0, x: Number(m.x), y: Number(m.y), saapui: nyt, w: typeof m.w === 'string' ? m.w.slice(0, 12) : 'luoti' });
    if (AM.jono.length > 32) AM.jono.shift();
  };
  // seuraaja: snapshotissa vielä elossa oleva zombi, jonka tämä client juuri tappoi (sama sn), ei herää henkiin ennen vahvistusta
  const pidaPaikallinen = (z, s) => {
    const v = AM.odottavat.get(s.n);
    if (!v) return false;
    if (Number(s.sn) !== v.sn) { AM.odottavat.delete(s.n); return false; }   // johtaja on jo synnyttänyt sen uudelleen -> omaksutaan
    return Date.now() <= v.asti && !(Number(s.ku) >= 0);
  };
  // seuraaja: pisteet, HP:t, tuoreet tapot (ruumis kaikille) ja päättyneet runit johtajan snapshotista
  const omaksu = (snap, P) => {
    vuoroOmaksu(snap);   // 811 vuoro: johtajan päätös voittaa
    if (ASETUS.safeHouse && Array.isArray(snap.sh)) { const S = safeHouseTila(); if (S) { S.hp = Math.max(0, Number(snap.sh[0]) || 0); S.max = Math.max(1, Number(snap.sh[1]) || S.max); S.iskut = snap.sh[2] | 0; S.ix = snap.sh[3]; S.iy = snap.sh[4]; } }   // vaihe 1c
    if (ASETUS.aidat && Array.isArray(snap.ai)) {
      const AT = aitaTila();
      if (AT && Array.isArray(snap.ai[0])) {
        const vanhaTuhCount = AT.tuhoutuneetIds.size;
        for (let i = 0; i < snap.ai[0].length && i < AT.palat.length; i++) {
          AT.palat[i].hp = Number(snap.ai[0][i]) || 0;
          if (AT.palat[i].hp <= 0) {
            AT.tuhoutuneetIds.add(AT.palat[i].id);
            AT.tuhoutuneetRuudut.add(AT.palat[i].x + ',' + AT.palat[i].y);
          }
        }
        AT.iskut = snap.ai[1] | 0;
        if (AT.tuhoutuneetIds.size !== vanhaTuhCount) {
          kitEsteMuisti = null;
          if (ruudukko) { const uusiR = rakenna(); if (uusiR && uusiR.ruudut.length) ruudukko = uusiR; }
        }
      }
    }   // vaihe 1c
    if (snap.ta && typeof snap.ta === 'object') {
      const uusi = {};
      for (const [k, a] of Object.entries(snap.ta)) { const id = Number(k); if (!(id > 0) || !Array.isArray(a)) continue;
        uusi[id] = { nimi: (typeof a[3] === 'string' && a[3]) || nimiId(id, P), tapot: Math.max(0, a[0] | 0), lapi: a[1] ? 1 : 0, run: Math.max(1, a[2] | 0) }; }
      const vanhaOma = AM.pisteet[omaId()];
      AM.pisteet = uusi;
      if (vanhaOma && !uusi[omaId()]) AM.pisteet[omaId()] = vanhaOma;   // oma rivi ei katoa vaikka johtaja ei sitä vielä tunne
    }
    if (ASETUS.aallot && Array.isArray(snap.aa)) {
      const tB = SAILO.K * tikkiMs(), ab = v => v ? tB + v : 0, [n, k, sp, ku, ta, al, se, idx] = snap.aa, vanha = AM.aalto.n;
      AM.aalto = { n: n | 0, k: k | 0, sp: sp | 0, ku: ku | 0, tauko: ab(ta), alku: ab(al), seur: ab(se), idx: idx | 0 };
      if (AM.aalto.n > vanha) aaltoIlmoitus(AM.aalto);
    }
    if (Array.isArray(snap.zh)) { AM.zhp = new Map(); for (const a of snap.zh) if (Array.isArray(a)) AM.zhp.set(a[0] + ':' + a[1], Number(a[2]) || 0); }
    if (Array.isArray(snap.tu)) AM.tulokset = snap.tu.filter(Array.isArray).map(a => ({ id: a[0] | 0, nimi: (typeof a[4] === 'string' && a[4]) || nimiId(a[0] | 0, P), tapot: a[1] | 0, lapi: a[2] ? 1 : 0, run: a[3] | 0, syy: 'kuoli', t: null }));
    if (Array.isArray(snap.kz)) for (const a of snap.kz) {
      if (!Array.isArray(a)) continue;
      const [n, sn, ampuja, x, y] = a, avain = n + ':' + sn;
      // oma ennuste puretaan kun johtaja kertoo tapon: oma -> vahvistettu, toisen -> hävitty kilpa (sama zombi tapettu samaan aikaan, piste toiselle)
      if (AM.ennuste.has(avain)) { AM.ennuste.delete(avain); if (Number(ampuja) === omaId()) tilasto.vahvistettu++; else tilasto.havittyKilpa = (tilasto.havittyKilpa || 0) + 1; }
      if (!AM.nahdyt.has(avain)) { AM.nahdyt.add(avain); ruumis(n, sn, x, y); }
    }
    if (AM.nahdyt.size > 200) AM.nahdyt = new Set([...AM.nahdyt].slice(-100));
  };
  const snapLisaa = (snap) => {
    vuoroSnap(snap);   // 811 vuoro (vu, vn, vv)
    if (ASETUS.safeHouse) { const S = safeHouseTila(); if (S) snap.sh = [Math.round(S.hp * 10) / 10, S.max, S.iskut | 0, S.ix, S.iy]; }   // vaihe 1c
    if (ASETUS.aidat) { const AT = aitaTila(); if (AT) snap.ai = [AT.palat.map(p => Math.round(p.hp * 10) / 10), AT.iskut | 0]; }   // vaihe 1c
    const ta = {}, P = pelaajat(), lasna = new Set(P.map(p => p.id));
    for (const [k, p] of Object.entries(AM.pisteet)) { const id = Number(k); if (!lasna.has(id) && !(p.tapot > 0)) continue;
      ta[id] = [p.tapot | 0, p.lapi ? 1 : 0, p.run | 0, String(p.nimi || '').slice(0, 24)]; }
    snap.ta = ta;
    const rajaMs = SAILO.K * tikkiMs() - 3000;
    snap.kz = AM.kz.filter(t => t.ms >= rajaMs).slice(-8).map(t => [t.n, t.sn, t.a, t.x, t.y]);
    snap.tu = AM.tulokset.slice(-10).map(t => [t.id, t.tapot, t.lapi, t.run, String(t.nimi || '').slice(0, 24)]);
    const elossa = new Set((SAILO.zombit || []).filter(z => z && z.kuoli < 0).map(z => z.n + ':' + z.synty));
    for (const a of [...AM.zhp.keys()]) if (!elossa.has(a)) AM.zhp.delete(a);
    if (ASETUS.aallot) { const a = AM.aalto, tB = SAILO.K * tikkiMs(), rel = v => v ? Math.round(v - tB) : 0; snap.aa = [a.n, a.k, a.sp, a.ku, rel(a.tauko), rel(a.alku), rel(a.seur), a.idx]; }
    snap.zh = [...AM.zhp].slice(0, 16).map(([a, hp]) => { const [n, sn] = a.split(':').map(Number); return [n, sn, hp]; });
  };
  const pelaajaKuoli = (id, nimi) => { if (auktoriteetti()) runLoppu(id, nimi, 'kuoli'); };
  const omaKuolema = () => { if (auktoriteetti()) runLoppu(omaId(), null, 'kuoli'); AM.ennuste.clear(); AM.hp = hpMax(); AM.hpMuutos = 0; veto = null; autoPois(); kasiin(0); };   // vaihe 1c: L4K :835 kasiin(0) kuollessa
  const omaTapot = () => { const p = AM.pisteet[omaId()]; return (p ? p.tapot : 0) + AM.ennuste.size; };
  // vaihe 1c, sona 17:14 "Poista tuo 'Kaadoit zombin (x/25)' Ei sellasta käyttöliittymään ollenkaan.": ei tappoilmoitusta (pisteet näkyvät vuorokerroksessa).
  //   ASETUS.tappoIlmoitus === true palauttaa vanhan (oletus pois). AMMUNTA on vain ammuttavissa huoneissa (811) -> 684 ei muutu.
  const ilmoitaTappo = (t) => { tilasto.tappoIlmoitus = (tilasto.tappoIlmoitus || 0) + 1; if (ASETUS.tappoIlmoitus !== true) return; try { ilmoita(t === raja() ? 'LÄPI! ' + t + ' zombia' : t > raja() ? 'Kaadoit zombin (' + t + ')' : 'Kaadoit zombin (' + t + '/' + raja() + ')'); } catch (x) {} };

  // ---- AALLOT (kp 16:03: Left 4 Kuplasta sellaisinaan; shooter-1.15.2.user.js zIsantaTick :1573-1582, zSynnyta :1529, zAloitaAalto :1544,
  //   zSyntyRuutu :1507, zOvenTila :1491, zReunaRuudut :1203). Vain auktoriteetti synnyttää; seuraaja ottaa zombit ja aaltotilan snapshotista (aa).
  //   aalto n = aloitus + kasvu * (n - 1) zombia (6, 9, 12, ...), yksi kerrallaan max(300 ms, zombin askelaika) välein, enintään katto elossa;
  //   aalto selvä kun kaikki synnytetty ja kaikki kuolleet -> tauko taukoMs -> seuraava. Ensimmäinen alkaa alkuMs kun huoneessa on kohde.
  //   Syntyruutu: aallot.syntyRuudut kiertäen (ensimmäinen vapaa), muuten oviruutu (varattu -> vapaa naapuri; L4K odottaa 3 s, tässä heti),
  //   muuten kävelyalueen reunaruutu arvottuna (deterministinen siemenestä).
  if (!AM.aalto || typeof AM.aalto !== 'object') AM.aalto = { n: 0, k: 0, sp: 0, ku: 0, tauko: 0, alku: 0, seur: 0, idx: 0 };
  const aaltoK = (n) => { const A = ASETUS.aallot || {}; return Math.max(1, Math.min(999, Math.round((Number(A.aloitus) || 6) + (Number(A.kasvu) || 0) * (n - 1)))); };
  const aaltoIlmoitus = (a) => { lokiin({ aalto: a.n, zombeja: a.k }); try { ilmoita('🧟 Aalto ' + a.n + ': ' + a.k + (a.k === 1 ? ' zombi' : ' zombia')); } catch (x) {} };
  const aloitaAalto = (n, tMs) => { AM.aalto = { n, k: aaltoK(n), sp: 0, ku: 0, tauko: 0, alku: 0, seur: tMs + 800, idx: AM.aalto.idx || 0 }; aaltoIlmoitus(AM.aalto); };
  const syntyRuutu = (Z, k) => {
    const { W, H, ok, ovi } = ruudukko, varattu = new Set(Z.filter(z => z && z.kuoli < 0).map(z => z.y * W + z.x));
    const kelpaa = (x, y) => x >= 0 && y >= 0 && x < W && y < H && ok[y * W + x] && !varattu.has(y * W + x) && !eiSpawnia(x, y);
    const omat = ((ASETUS.aallot && ASETUS.aallot.syntyRuudut) || []).filter(p => Array.isArray(p) && kelpaa(p[0], p[1]));
    if (omat.length) { const a = AM.aalto, i = (a.idx || 0) % omat.length; a.idx = i + 1; return { x: omat[i][0], y: omat[i][1] }; }
    // kp 16:28 puolet (811): kierretään puolia synty synnyltä (a.idx, snapshotissa aa[7] -> sama kierto johtajan vaihtuessa). Puoli = 'ovi'
    //   (oviruutu tai vapaa naapuri) tai lista ruutuja (ensimmäinen kelvollinen). Ei kelvollista ruutua -> seuraava puoli.
    const puolet = ASETUS.aallot && Array.isArray(ASETUS.aallot.puolet) ? ASETUS.aallot.puolet : null;
    if (puolet && puolet.length) {
      const a = AM.aalto, i0 = a.idx || 0;
      for (let j = 0; j < puolet.length; j++) {
        const pu = puolet[(i0 + j) % puolet.length]; let r = null;
        if (pu === 'ovi') { if (ovi) { if (kelpaa(ovi.x, ovi.y)) r = { x: ovi.x, y: ovi.y }; else for (const [dx, dy] of NAAP) if (kelpaa(ovi.x + dx, ovi.y + dy)) { r = { x: ovi.x + dx, y: ovi.y + dy }; break; } } }
        else if (Array.isArray(pu)) { const q = pu.find(p => Array.isArray(p) && kelpaa(p[0], p[1])); if (q) r = { x: q[0], y: q[1] }; }
        if (r) { a.idx = (i0 + j + 1) % puolet.length; r.puoli = (i0 + j) % puolet.length; return r; }
      }
    }
    if (ovi) {
      if (kelpaa(ovi.x, ovi.y)) return { x: ovi.x, y: ovi.y };
      for (const [dx, dy] of NAAP) if (kelpaa(ovi.x + dx, ovi.y + dy)) return { x: ovi.x + dx, y: ovi.y + dy };
      return null;
    }
    const reunat = [];
    for (const i of ruudukko.ruudut) { const x = i % W, y = (i - x) / W; if (!kelpaa(x, y)) continue;
      if (!(x + 1 < W && ok[i + 1]) || !(x > 0 && ok[i - 1]) || !(y + 1 < H && ok[i + W]) || !(y > 0 && ok[i - W])) reunat.push({ x, y }); }
    if (!reunat.length) return null;
    return reunat[Math.floor(arpa(perusSiemen() * 7577 + k * 131 + AM.aalto.sp * 17)() * reunat.length)];
  };
  const aaltoTick = (Z, P, k) => {
    if (SYNK.seuraa() || !ruudukko) return;   // seuraaja: johtajan snapshot
    const A = ASETUS.aallot || {}, tikki = tikkiMs(), tMs = (k ?? 0) * tikki, a = AM.aalto;
    const kohteet = (P || []).filter(p => onKohde(p) && tavoitettava(p) && !onMakaava(p.id, tMs));
    if (!a.n) { if (!kohteet.length) return; if (!a.alku) a.alku = tMs + Math.max(0, Number(A.alkuMs) || 1500); else if (tMs >= a.alku) aloitaAalto(1, tMs); return; }
    if (a.sp >= a.k && !Z.length) { if (!a.tauko) a.tauko = tMs + Math.max(0, Number(A.taukoMs) || 6000); else if (tMs >= a.tauko) aloitaAalto(a.n + 1, tMs); return; }
    a.tauko = 0;
    const katto = Math.max(1, Number(A.katto) || Number(ASETUS.maaraMax) || 8);
    if (a.sp >= a.k || tMs < a.seur || Z.length >= katto) return;
    const r = syntyRuutu(Z, k); if (!r) return;
    const kaytossa = new Set(Z.map(z => z.n)); let n = 0; while (kaytossa.has(n)) n++;
    const z = rakennaPerusZombi(n, k, r, tMs, tikki, perusSiemen());
    z.vTauko = 0; z.vTaukoMs = 0; z.vTaukoAsti = 0;
    Z.push(z); a.sp++;
    a.seur = tMs + Math.max(300, Number(z.perusAskelMs) || 1000);
    lokiin({ aaltoSynty: n, aalto: a.n, ruutu: r.x + ',' + r.y, puoli: r.puoli ?? null, sp: a.sp + '/' + a.k });
  };

  // ---- VUORO (811, ASETUS.vuoro): yksi pelaaja kerrallaan. sona 16:25 "Pelaaja joka on siinä rollerilssa on seuraava pelaaja. Sitten kun edellisen
  //   peli loppuu, niin seuraava aloittaa." · kp 16:25 "Ase pitää olla käytössä vaan pelaajalle" · sona 16:28-16:29 "Peli alkaa" 5 -> 1, "Pelaaja Sona
  //   pisteet 0." · kp 16:43 ":aloitapeli komento alkuun testaamista varten" · kp 16:45 "Script vahtii ehtoja koska client lähettää sen".
  //   PÄÄTÖS VAIN AUKTORITEETILLA (johtaja tai yksin): vuoro vu = { id, nimi, vaihe 0 laskenta / 1 peli, alku (peli alkaa, ms), nro, tapa }.
  //   Snapshot kantaa sen (vu), seuraaja omaksuu -> kaksi clientia eivät voi pitää eri pelaajaa vuorossa niin kauan kuin johtaja kuuluu.
  //   Kaikki clientit asettavat ASETUS.kohteet = [vuoron pelaaja] pelin aikana ja [] muuten -> katsojia ei jahdata eikä tapeta (onKohde).
  //   Vuoron pelaajan OMA client sanoo ASETUS.aloitusSanan kerran per vuoro (sanoSalainen: 684:n zk684-mekanismi) -> wired teleporttaa aloitusruutuun.
  if (!AM.vuoro || typeof AM.vuoro !== 'object') AM.vuoro = { vu: null, nro: 0, lepo: 0, poissa: 0, sanottu: 0, kavelty: 0, viimeinen: null, pyynnot: [] };
  if (!Array.isArray(AM.vuoro.pyynnot)) AM.vuoro.pyynnot = [];
  const VT = AM.vuoro;
  const VA = () => ASETUS.vuoro || null;
  // kohde 6 (kp 18:09-18:10 "tos pelin alotuksessa toi peli HUD pitäs tulla heti" · "ei oo vaa ammuttavaa ennen ku peli alkaa" · "HUD heti etee" · "ja ase kätee"):
  //   vuoron pelaajalla ase, HUD ja käsiesine (:handitem) ovat käytössä heti kun vuoro alkaa (vaihe 0: siirto + laskenta), eivät vasta vaiheessa 1. Ennen: vu.vaihe === 1.
  //   Zombeja ei vaiheessa 0 vielä ole (ASETUS.kohteet = [] kunnes peli alkaa, nollaaPeli), joten ammuttavaa ei ole; osuman auktoriteettitarkistus (vaihe === 1) ennallaan.
  const vuoroSallii = () => { if (!VA()) return true; const vu = VT.vu; return !!vu && vu.id === omaId(); };
  const nollaaPeli = () => {   // zombit pois ja aallot alkuun (ei automaattista uutta aaltoa: seuraava vuoro aloittaa)
    if (Array.isArray(SAILO.zombit)) SAILO.zombit.length = 0;
    AM.zhp.clear(); AM.aalto = { n: 0, k: 0, sp: 0, ku: 0, tauko: 0, alku: 0, seur: 0, idx: 0 };
    if (ASETUS.safeHouse) { const S = safeHouseTila(); if (S) { S.hp = S.max; S.iskut = 0; S.viime = 0; } }
    if (ASETUS.aidat) nollaaAidat();   // vaihe 1c: safe house ehjäksi uuden pelin alussa
  };
  const vuoroAloita = (p, tapa, tMs) => {
    const V = VA(), laskenta = Math.max(0, Number(V.laskentaMs ?? 5000));
    const pp = piste(p.id, p.nimi);
    if (pp.tapot > 0) runLoppu(p.id, p.nimi, 'keskeytyi'); else { pp.tapot = 0; pp.lapi = 0; }
    nollaaPeli();
    const alku = tMs + Math.max(0, Number(V.siirtoMs ?? 0)) + laskenta;   // siirto ensin, sitten laskenta (sona 16:59)
    AM.aalto.alku = alku;   // aalto 1 heti kun peli alkaa (aaltoTick: kohde olemassa ja tMs >= alku)
    VT.vu = { id: p.id, nimi: p.nimi || null, vaihe: laskenta > 0 ? 0 : 1, alku, nro: ++VT.nro, tapa };
    VT.poissa = 0;
    lokiin({ vuoro: 'alkaa', id: p.id, nimi: p.nimi, tapa, nro: VT.vu.nro });
  };
  // kirjaa: true = tulos talteen runLoppu:lla (poistui / lopetettu). Kuolema on jo kirjattu runLoppussa (joka kutsuu tätä kirjaa=false).
  const vuoroLopeta = (syy, kirjaa, tMs) => {
    const vu = VT.vu; if (!vu) return false;
    VT.vu = null; VT.poissa = 0; VT.lepo = (tMs ?? SAILO.K * tikkiMs()) + Math.max(0, Number((VA() || {}).lepoMs ?? 4000));
    if (kirjaa) runLoppu(vu.id, vu.nimi, syy);
    VT.viimeinen = { id: vu.id, nimi: vu.nimi, syy, nro: vu.nro, t: Date.now() };
    nollaaPeli(); ASETUS.kohteet = [];
    lokiin({ vuoro: 'päättyi', id: vu.id, syy, nro: vu.nro });
    return true;
  };
  const kaskySallittu = (id) => { const l = (VA() || {}).kasky; return !Array.isArray(l) || l.includes(id); };
  const kasittelePyynto = (r, P, tMs) => {
    if (!kaskySallittu(r.id)) { lokiin({ vuoroPyynto: r.q, id: r.id, hylatty: 'ei kasky-listalla' }); return; }
    if (r.q === 'lopeta') { vuoroLopeta('lopetettu', true, tMs); return; }
    if (r.q !== 'aloita') return;
    if (VT.vu) { lokiin({ vuoroPyynto: 'aloita', id: r.id, hylatty: 'peli käynnissä (' + VT.vu.id + ')' }); return; }
    const p = (P || []).find(q => q && q.id === r.id); if (!p) { lokiin({ vuoroPyynto: 'aloita', id: r.id, hylatty: 'ei huoneessa' }); return; }
    vuoroAloita(p, 'kasky', tMs);
  };
  // :aloitapeli / :lopetapeli tältä clientilta: auktoriteetti käsittelee itse, seuraaja lähettää johtajalle (t:'vuoro')
  const vuoroPyyda = (q) => {
    const id = omaId(); if (!(id > 0) || !VA()) return false;
    if (auktoriteetti()) { VT.pyynnot.push({ id, q, saapui: Date.now() }); return true; }
    return SYNK.lahetaVuoro({ t: 'vuoro', id, q });
  };
  const vuoroVastaanota = (id, m) => { if (!VA() || (m.q !== 'aloita' && m.q !== 'lopeta')) return; VT.pyynnot.push({ id, q: m.q, saapui: Date.now() }); if (VT.pyynnot.length > 8) VT.pyynnot.shift(); };
  let viimeSallii = null;
  const vuoroTick = (P, k) => {
    const V = VA(); if (!V) return;
    const tMs = (k ?? 0) * tikkiMs();
    if (auktoriteetti()) {
      const nyt = Date.now();
      for (const r of VT.pyynnot.splice(0)) if (nyt - r.saapui < 5000) kasittelePyynto(r, P, tMs);
      const vu = VT.vu;
      if (vu) {
        if (!(P || []).some(q => q && q.id === vu.id)) { if (!VT.poissa) VT.poissa = tMs; else if (tMs - VT.poissa >= Math.max(0, Number(V.poissaMs ?? 4000))) vuoroLopeta('poistui', true, tMs); }
        else VT.poissa = 0;
      } else if (V.jonostaAloitus && V.jono && tMs >= (VT.lepo || 0)) {
        // sona 16:25: jonon etupään ruudussa (queue_tile1 462161 @15,3) seisova on seuraava. Pienin id jos useampi (deterministinen).
        const p = (P || []).find(q => q && q.x === V.jono.x && q.y === V.jono.y);
        if (p) vuoroAloita(p, 'jono', tMs);
      }
    } else VT.pyynnot.length = 0;
    const vu = VT.vu;
    if (vu && vu.vaihe === 0 && tMs >= vu.alku) { vu.vaihe = 1; lokiin({ vuoro: 'peli alkoi', id: vu.id, nro: vu.nro }); }   // kaikki: sama alku-aika
    ASETUS.kohteet = vu && vu.vaihe === 1 ? [vu.id] : [];
    const s = vuoroSallii(); if (viimeSallii !== null && s !== viimeSallii) blur(); viimeSallii = s;   // ase pois / päälle kesken: pidetyt napit nollaan
    if (kuolemaLukkoAsti) {   // vapautus: varaaika, uusi vuoro, tai oma ruutu vaihtunut makuun jälkeen (= lopetus-teleportti)
      const n2 = Date.now(), o2 = (P || []).find(q => q && q.id === omaId());
      if (n2 >= kuolemaLukkoAsti || (VT.vu && VT.vu.id === omaId() && VT.omaNro && VT.vu.nro !== VT.omaNro) || (n2 >= kavelyEstoAsti && kuolemaLukkoRuutu && o2 && (o2.x !== kuolemaLukkoRuutu.x || o2.y !== kuolemaLukkoRuutu.y))) { kuolemaLukkoAsti = 0; kuolemaLukkoRuutu = null; }
    }
    omaVuoro(P);
    omaLoppu(P);
  };
  // Vaihe 1c (sona 17:01-17:02 "kun pelaaja kuolee niin hän menee takaisin ylös" · "Siihen se teleportataan kun peli loppuu"): kun OMA vuoro
  //   päättyy millä tavalla tahansa (kuoli / lopetettu / jokin muu loppu), oma client sanoo ASETUS.lopetusSanan KERRAN per vuoro (VT.lopetusSanottu = nro)
  //   -> wired teleporttaa Matolle 511793 @2,2. Kuolemassa odotetaan makuun loppuun (kavelyEstoAsti), ettei teleport katkaise kuolema-animaatiota.
  //   Ei sanota jos hahmo ei ole huoneessa (poistui) tai on jo kohderuudussa. Sama piilotus (piiloSanat) kuin za811:llä.
  const omaLoppu = (P) => {
    const V = VA(), vu = VT.vu, id = omaId(); if (!V || !(id > 0)) return;
    if (vu && vu.id === id) { VT.omaNro = vu.nro; return; }
    const nro = VT.omaNro; if (!nro || VT.lopetusSanottu === nro) return;
    const sana = String(ASETUS.lopetusSana || '').trim(); if (!sana) { VT.lopetusSanottu = nro; return; }
    if (Date.now() < kavelyEstoAsti) return;
    const o = (P || []).find(q => q && q.id === id), L = V.loppu || {};
    if (!o) { VT.lopetusSanottu = nro; lokiin({ vuoro: 'loppu: ei huoneessa, lopetussanaa ei sanota', nro }); return; }
    if (L.x != null && o.x === L.x && o.y === L.y) { VT.lopetusSanottu = nro; lokiin({ vuoro: 'loppu: jo kohderuudussa, ei sanaa', nro }); return; }
    if (sanoSalainen(sana)) { VT.lopetusSanottu = nro; lokiin({ vuoro: 'lopetussana sanottu', sana, nro }); }
  };
  // Vuoron pelaajan oma client: ehdot skriptissä (kp 16:45), viesti on vain wiredin laukaisin. tapa 'jono' -> sanotaan vain jos oma hahmo on yhä
  //   jonon etupään ruudussa (kp 16:43 "script kattoo onko rollejonon alussa oikeassa ruudussa"); tapa 'kasky' (:aloitapeli) -> missä tahansa.
  //   Kerran per vuoro (VT.sanottu = nro, säilyy live-päivityksen yli). Varakävely aloitusruutuun jos teleport ei tullut kavelyVaraMs:ssä.
  const omaVuoro = (P) => {
    const V = VA(), vu = VT.vu, id = omaId(); if (!V || !vu || vu.id !== id) return;
    const o = (P || []).find(q => q && q.id === id); if (!o) return;
    const nyt = Date.now(), alku = V.alku || {};
    if (VT.sanottu !== vu.nro) {
      if (vu.tapa === 'jono' && V.jono && !(o.x === V.jono.x && o.y === V.jono.y)) { if (!VT.eiJonossa || VT.eiJonossa.nro !== vu.nro) { VT.eiJonossa = { nro: vu.nro }; lokiin({ vuoro: 'ei jonon etupäässä, aloitussanaa ei sanota', ruutu: o.x + ',' + o.y }); } }
      else if (o.x === alku.x && o.y === alku.y) { VT.sanottu = vu.nro; VT.sanottuMs = nyt; lokiin({ vuoro: 'jo aloitusruudussa, ei sanaa' }); }
      else if (sanoSalainen(ASETUS.aloitusSana)) { VT.sanottu = vu.nro; VT.sanottuMs = nyt; lokiin({ vuoro: 'aloitussana sanottu', sana: ASETUS.aloitusSana, nro: vu.nro }); }
    }
    const vara = V.kavelyVaraMs;
    if (vara != null && VT.kavelty !== vu.nro && (VT.sanottu === vu.nro || vu.tapa === 'jono') && nyt - (VT.sanottuMs || nyt) >= Math.max(0, Number(vara)) && alku.x != null && !(o.x === alku.x && o.y === alku.y)) {
      VT.kavelty = vu.nro;
      lokiin({ vuoro: 'teleport ei näkynyt ' + vara + ' ms, varakävely', ruutu: o.x + ',' + o.y, ok: kavele(alku.x, alku.y) });
    }
  };
  const vuoroSnap = (snap) => {
    if (!VA()) return;
    const vu = VT.vu, tB = SAILO.K * tikkiMs();
    snap.vu = vu ? [vu.id, String(vu.nimi || '').slice(0, 24), vu.vaihe, Math.round(vu.alku - tB), vu.nro, vu.tapa === 'jono' ? 1 : 0] : null;
    snap.vn = VT.nro; if (VT.viimeinen) snap.vv = [VT.viimeinen.id, String(VT.viimeinen.nimi || '').slice(0, 24), VT.viimeinen.nro, String(VT.viimeinen.syy || ''), Date.now() - (VT.viimeinen.t || 0)];
  };
  const vuoroOmaksu = (snap) => {
    if (!VA() || !('vu' in snap)) return;
    const a = snap.vu, tB = SAILO.K * tikkiMs();
    if (Array.isArray(a)) VT.vu = { id: a[0] | 0, nimi: a[1] || null, vaihe: a[2] ? 1 : 0, alku: tB + (Number(a[3]) || 0), nro: a[4] | 0, tapa: a[5] ? 'jono' : 'kasky' };
    else VT.vu = null;
    if (isFinite(snap.vn)) VT.nro = Math.max(VT.nro, snap.vn | 0);
    if (Array.isArray(snap.vv)) VT.viimeinen = { id: snap.vv[0] | 0, nimi: snap.vv[1] || null, nro: snap.vv[2] | 0, syy: snap.vv[3] || '', t: Date.now() - (Number(snap.vv[4]) || 1e9) };
  };
  // Näyttö kaikille (sona 16:28-16:29): oma DOM-kerros pelin päällä, ei 811.js-ikkunassa (ikkuna on sonan tulostaulu; tila myös window.__zombi811.vuoro)
  let vEl = null;
  try { if (document.querySelectorAll) for (const v of document.querySelectorAll('[data-zombit-vuoro]')) v.remove(); } catch (x) {}
  // sona 17:53: naamakuva nimen vasemmalle, pisteet omassa laatikossa päälaatikon sisällä. Kuva-elementti talteen: pisteen vaihtuessa ei uutta latausta.
  const vuoroNaamat = new Map();
  const vuoroPelaaja = (vu, n) => { const p = (pelaajat() || []).find(q => q && q.id === vu.id); return { nimi: String(vu.nimi || nimiId(vu.id) || vu.id), fig: (p && p.figuuri) || '', n }; };
  const vuoroNaama = (fig) => { let im = vuoroNaamat.get(fig); if (im) return im; im = document.createElement('img'); im.alt = '';
    im.src = 'https://kupla.cc/avatarimage?figure=' + encodeURIComponent(fig) + '&headonly=1&direction=2&head_direction=2';
    if (im.style) im.style.cssText = 'width:34px;height:38px;object-fit:contain;object-position:center bottom;flex:none;margin:0 6px';
    vuoroNaamat.set(fig, im); return im; };
  const vuoroTeksti = () => {
    const vu = VT.vu, nyt = Date.now();
    if (vu && vu.vaihe === 0 && vu.alku - nyt > Math.max(0, Number((VA() || {}).laskentaMs ?? 5000))) return { rivi1: 'Pelaaja ' + (vu.nimi || nimiId(vu.id) || vu.id), rivi2: '', pelaaja: vuoroPelaaja(vu) };   // siirtovaihe
    if (vu && vu.vaihe === 0) return { rivi1: 'Peli alkaa', rivi2: String(Math.max(1, Math.min(5, Math.ceil((vu.alku - nyt) / 1000)))) };
    if (vu) { const n = vu.id === omaId() ? omaTapot() : ((AM.pisteet[vu.id] || {}).tapot | 0); return { rivi1: 'Pelaaja ' + (vu.nimi || nimiId(vu.id) || vu.id) + ' pisteet ' + n, rivi2: '', osat: [['Pelaaja ', 0], [String((vu.nimi || nimiId(vu.id) || vu.id)), 1], [' pisteet ', 0], [String(n), 1]], pelaaja: vuoroPelaaja(vu, n) }; }   // sona 17:01 nimi ja pisteet paksummalla
    const vv = VT.viimeinen;
    if (vv && VT.naytaLoppu === vv.nro && nyt < (VT.loppuAsti || 0)) {
      const t = [...AM.tulokset].reverse().find(q => q && q.id === vv.id), n = t ? t.tapot : 0, nimi = String(vv.nimi || nimiId(vv.id) || vv.id);
      // vaihe 1c, sona 17:06-17:07: kuolemassa "<nimi> kuoli" + pisteet ISOLLA + häivytys. Muut loput (:lopetapeli, poistui): ennallaan.
      if (vv.syy === 'kuoli') return { rivi1: nimi + ' kuoli', rivi2: String(n), kuoli: true, osat: [[nimi, 1], [' kuoli', 0]] };
      return { rivi1: 'Peli päättyi: ' + nimi + ' ' + n + ' pistettä', rivi2: '' };
    }
    return null;
  };
  const vuoroNaytto = () => {
    if (!VA()) return;
    const loppuMs = Math.max(0, Number((VA() || {}).loppuNakyyMs ?? 6000)), haivytysMs = Math.max(0, Number((VA() || {}).haivytysMs ?? 1500));   // sona 17:07-17:08 "näkyvillä 6 sec kun peli loppuu" + häivytys
    const vv = VT.viimeinen; if (vv && VT.nahtyLoppu !== vv.nro) { VT.nahtyLoppu = vv.nro; if (VT.alustettu && Date.now() - (vv.t || 0) < loppuMs + haivytysMs) { VT.naytaLoppu = vv.nro;   /* kp 18:39 vanha kuolema ei näy uudelleen huoneeseen tullessa tai skriptin päivittyessä */ VT.loppuAsti = Date.now() + loppuMs + haivytysMs; } }
    VT.alustettu = true;
    const t = vuoroTeksti();
    if (!t) { if (vEl && vEl.style) vEl.style.display = 'none'; return; }
    if (typeof document === 'undefined' || !document.body || !document.createElement) return;
    if (!vEl) {
      vEl = document.createElement('div'); if (vEl.setAttribute) vEl.setAttribute('data-zombit-vuoro', String(huone));
      if (vEl.style) vEl.style.cssText = 'position:fixed;left:50%;top:7%;transform:translateX(-50%);z-index:99998;pointer-events:none;text-align:center;'
        + 'color:#fff;font:600 26px/1.15 "Arial",sans-serif;letter-spacing:1px;text-shadow:0 2px 4px #000;white-space:nowrap;'
        + 'background:rgba(26,10,12,.88);border:2px solid #6e1f26;border-radius:10px;padding:8px 20px;box-shadow:0 3px 12px rgba(0,0,0,.7)';   // sona 17:01 "taustalle laatikko"
    }
    if (vEl.parentNode !== document.body && document.body.appendChild) document.body.appendChild(vEl);
    // häivytys loppunäytölle: täysi näkyvyys loppuNakyyMs, sitten opacity 1 -> 0 haivytysMs:ssä (sona 17:06 "fade-out animaatio")
    const loppuva = !VT.vu && VT.viimeinen && VT.naytaLoppu === VT.viimeinen.nro, jaljella = (VT.loppuAsti || 0) - Date.now();
    const op = loppuva && haivytysMs > 0 ? Math.max(0, Math.min(1, jaljella / haivytysMs)) : 1;
    if (vEl.style) { vEl.style.opacity = String(Math.round(op * 100) / 100); vEl.style.transition = 'opacity .25s linear'; }
    VT.nayttoOpacity = op;
    const sis = t.rivi1 + (t.rivi2 ? '\n' + t.rivi2 : '') + (t.pelaaja ? '|' + t.pelaaja.fig : '');
    if (vEl.dataset ? vEl.dataset.sis !== sis : vEl.textContent !== sis) {
      if (vEl.dataset) vEl.dataset.sis = sis;
      if (t.pelaaja && vEl.appendChild) { vEl.textContent = ''; const P = t.pelaaja, PAKSU = 'font:700 30px/1.15 "Arial",sans-serif;letter-spacing:1px;color:#ffb347';
        const sp = (teksti, css) => { const x = document.createElement('span'); x.textContent = teksti; if (css && x.style) x.style.cssText = css; return x; };
        const rivi = document.createElement('div'); if (rivi.style) rivi.style.cssText = 'display:flex;align-items:center;justify-content:center';
        rivi.appendChild(sp('Pelaaja')); if (P.fig) rivi.appendChild(vuoroNaama(P.fig)); else rivi.appendChild(sp(' ')); rivi.appendChild(sp(P.nimi, PAKSU));
        if (P.n != null) { const lt = document.createElement('div'); if (lt.style) lt.style.cssText = 'margin-left:14px;padding:2px 12px;background:rgba(0,0,0,.45);border:1px solid #6e1f26;border-radius:7px';
          lt.appendChild(sp('pisteet ')); lt.appendChild(sp(String(P.n), PAKSU)); rivi.appendChild(lt); }
        vEl.appendChild(rivi); }
      else if (t.osat && vEl.appendChild) { vEl.textContent = '';   // sona 17:01: nimi ja pisteet paksummalla, muu teksti ohuempi
        for (const [teksti, paksu] of t.osat) { const sp = document.createElement('span'); sp.textContent = teksti;
          if (paksu && sp.style) sp.style.cssText = 'font:700 30px/1.15 "Arial",sans-serif;letter-spacing:1px;color:#ffb347'; vEl.appendChild(sp); }
        if (t.kuoli && t.rivi2) {   // sona 17:06-17:07: pisteet ISOLLA omalla rivillään (sama oranssi kuin nimi)
          const br = document.createElement('div'); br.textContent = t.rivi2;
          if (br.style) br.style.cssText = 'display:block;font:700 72px/1 "Arial",sans-serif;letter-spacing:1px;color:#ffb347;margin-top:4px'; vEl.appendChild(br); } }
      else vEl.textContent = sis;
      if (vEl.style) { vEl.style.whiteSpace = 'pre'; vEl.style.fontSize = t.rivi2 ? '34px' : '26px'; vEl.style.fontWeight = t.osat ? '600' : '900'; } }
    if (vEl.style) vEl.style.display = '';
    VT.naytto = sis;
  };

  // ---- piirto: ruumis (tapettu zombi makaa ASETUS.ase.ruumisMs), piilotus (ampujan tappama zombi katoaa heti), välähdys osumasta
  const ruumiit = new Map();     // avain -> { g, asti }
  const piilotetut = new Map();  // n -> { sn, asti }
  const valahdys = new Map();    // n -> asti
  const ruumis = (n, sn, x, y) => {
    const avain = n + ':' + sn; if (ruumiit.has(avain) || !V || !ruudukko || !isFinite(x) || !isFinite(y)) return;
    try {
      const g = seuraavaId--, zz = Math.max(0, ruudukko.z[Math.round(y) * ruudukko.W + Math.round(x)] || 0), asu = valitseAsu({ n, synty: sn });
      if (!e.addRoomObjectUser(huone, g, new V(x, y, zz), new V(90), 90, 1, asu)) return;
      SAILO.piirretytIdt.add(g);
      try { e.updateRoomObjectUserPosture(huone, g, 'lay', ''); } catch (x2) {}
      ruumiit.set(avain, { g, asti: Date.now() + Math.max(200, Number(ASETUS.ase.ruumisMs) || 1400) });
    } catch (x2) {}
  };
  // tapettu (kuoli >= 0, ei syö) piilotetaan kunnes se syntyy uudelleen seuraavassa tikissä (<= ~350 ms): ruumis-olio näyttää kuoleman
  const piilossa = (z) => { if (!z.muuttunut && z.kuoli >= 0 && !z.syo) return true; const p = piilotetut.get(z.n); return !!p && p.sn === z.synty && Date.now() < p.asti; };
  // kp 17:59 "laita et vilkkuu punasena samanlail ku pelaaja ku ottaa dmg": S.iskut kasvaa -> rakennuksen spritet vuorottelevat kuten paivitaValahdys.
  //   Seuraajakin näkee, koska iskut tulevat snapshotista.
  //   kp 18:12 "vaan se seinä vilkkuu minkä edessä zombi on": vain iskun lähin rakennuspala.
  let shIskut = null; const shPalat = new Map();   // kalusteen id -> vilkku asti
  const shSavy = (id, vari) => { try { const o = e.getRoomObject(huone, id, 10); for (const q of (o && o.visualization && o.visualization.sprites) || []) {
    if (q.alpha !== 255 || q.blendMode === 'add') continue; if (q.color !== vari) { q.color = vari; if (q.increaseUpdateCounter) q.increaseUpdateCounter(); } } } catch (x) {} };
  const shLahin = (x, y) => { const nimi = ASETUS.safeHouse && ASETUS.safeHouse.rakennus; let par = null, pm = Infinity; if (!nimi || !isFinite(x) || !isFinite(y)) return null;
    try { for (const o of e.getRoomObjects(huone, 10) || []) { if (!o || String(o.type) !== nimi) continue; const L = o.getLocation(), m = Math.hypot(L.x + 0.5 - x, L.y + 0.5 - y); if (m < pm) { pm = m; par = o.id; } } } catch (x2) {}
    return par; };
  const shValahdys = (nyt) => { const S = safeHouseTila(); if (!S) return;
    if (shIskut != null && S.iskut > shIskut) { const id = shLahin(S.ix, S.iy); if (id != null) shPalat.set(id, nyt + Math.max(50, Number(ASETUS.safeHouse.valahdysMs) || 300)); }
    shIskut = S.iskut;
    for (const [id, asti] of [...shPalat]) { if (nyt < asti) shSavy(id, Math.floor(nyt / 120) % 2 ? 0xff9090 : 0xff2a2a); else { shSavy(id, 0xffffff); shPalat.delete(id); } } };
  const piirto = () => {
    shValahdys(Date.now());
    aitaValahdys(Date.now());
    paivitaAitaPiilotukset();
    const nyt = Date.now();
    for (const [a, r] of [...ruumiit]) if (nyt >= r.asti) { try { e.removeRoomObjectUser(huone, r.g); } catch (x) {} SAILO.piirretytIdt.delete(r.g); ruumiit.delete(a); }
    for (const [n, p] of [...piilotetut]) if (nyt >= p.asti) piilotetut.delete(n);
    for (const [n, asti] of [...valahdys]) { const g = piirretyt.get(n); if (g == null) { valahdys.delete(n); continue; }
      if (nyt >= asti) { savyta(g, 0xffffff); valahdys.delete(n); } else savyta(g, 0xff5050); }
    luotiTick(nyt);
    piirraJaljet(nyt);
  };

  // ---- kamera ja tähtäys (shooter :487 kamera, :2163 hiirenVektori; zombit ovat klikattavia kohteita kuten L4K:n hahmot)
  const piirtoPaikat = new Map();   // n -> { x, y, z, sn }: piirra() kirjoittaa, osumatesti lukee
  const suurinKanvas = () => { let paras = null, ala = 0; for (const c of document.querySelectorAll('canvas')) { if (c.hasAttribute && (c.hasAttribute('data-zombit-lammikko') || c.hasAttribute('data-zombit-ammunta'))) continue; const b = c.getBoundingClientRect(); if (b.width * b.height > ala) { ala = b.width * b.height; paras = c; } } return paras; };
  const kamera = () => {
    const rc = e.getRoomInstanceRenderingCanvas && e.getRoomInstanceRenderingCanvas(huone, 1); if (!rc) return null;
    const g = rc.geometry, cv = huoneKanvas() || suurinKanvas(); if (!g || !cv || typeof g.getScreenPoint !== 'function') return null;
    const rect = cv.getBoundingClientRect(), w = rc._width || rc.width || rect.width, h = rc._height || rc.height || rect.height;
    const kx = rect.width / (w || rect.width || 1), ky = rect.height / (h || rect.height || 1);
    const Vc = (g.direction && g.direction.constructor) || V, sc = rc._scale || rc.scale || 1, ox = rc._screenOffsetX ?? rc.screenOffsetX ?? 0, oy = rc._screenOffsetY ?? rc.screenOffsetY ?? 0;
    const f = (x, y, z) => { const p = g.getScreenPoint(new Vc(x, y, z)); return p ? { x: rect.left + ((p.x + w / 2) * sc + ox) * kx, y: rect.top + ((p.y + h / 2) * sc + oy) * ky } : null; };   // L4K 1.6.5: zoom kertoo myös w/2:n
    f.laatikko = bb => bb && bb.width > 0 ? { x: rect.left + bb.x * kx, y: rect.top + bb.y * ky, w: bb.width * kx, h: bb.height * ky } : null;   // shooter :487 kamera (kohde 1: peitto)
    return f;
  };
  const omaPaikka = () => { const i = omaIndeksi(); if (i == null || i < 0) return null; const o = e.getRoomObject(huone, i, 100), L = o && o.getLocation(); return L ? { i, x: Number(L.x), y: Number(L.y), z: Number(L.z) || 0 } : null; };
  let hiiriX = null, hiiriY = null;
  const hiirenVektori = (px, py, minä) => {
    if (px == null) { px = hiiriX; py = hiiriY; } if (px == null) return null;
    const p = kamera(); if (!minä || !p) return null;
    const o = p(minä.x, minä.y, minä.z), ex = p(minä.x + 1, minä.y, minä.z), ey = p(minä.x, minä.y + 1, minä.z); if (!o || !ex || !ey) return null;
    const ax = ex.x - o.x, ay = ex.y - o.y, bx = ey.x - o.x, by = ey.y - o.y, det = ax * by - bx * ay; if (!det) return null;
    let osu = null;   // L4K 1.8.1: klikki zombin kuvan päälle (jalat -> pää, z+3) tähtää sen ruutuun
    for (const [, h] of piirtoPaikat) { const f = p(h.x, h.y, h.z), t = p(h.x, h.y, h.z + 3); if (!f || !t) continue; const k = f.y - t.y; if (k <= 0) continue;
      if (Math.abs(px - f.x) < 0.6 * k && py >= t.y && py <= f.y + 0.6 * k) { const et = Math.hypot(px - f.x, py - (f.y - 0.5 * k)); if (!osu || et < osu.et) osu = { et, x: h.x, y: h.y }; } }
    if (osu) { const ux = osu.x - minä.x, uy = osu.y - minä.y, ul = Math.hypot(ux, uy); if (ul > 0.3) return { dx: ux / ul, dy: uy / ul }; }
    const mx = px - o.x, my = py - o.y, u = (mx * by - bx * my) / det, v = (ax * my - mx * ay) / det, L = Math.hypot(u, v);
    return L < 0.35 ? null : { dx: u / L, dy: v / L };
  };
  // shooter :878 sateella (suora säde, osumasäde R; PYORAHDYS = kaikki suunnat säteellä K). Seinäeste: ruutu joka ei ole huoneen lattiaa.
  const sateella = (x, y, dx, dy, mx, my, K, R) => { const l2 = dx * dx + dy * dy; if (!l2) return null;
    if (R === PYORAHDYS) { const m = Math.hypot(mx - x, my - y); return m >= 0.3 && m <= K ? m : null; }
    const s = ((mx - x) * dx + (my - y) * dy) / l2, matka = s * Math.sqrt(l2);
    if (matka < 0.3 || matka > K) return null; return Math.hypot(x + dx * s - mx, y + dy * s - my) < R ? matka : null; };
  const lattiaa = (x, y) => { try { const wg = e.getLegacyWallGeometry(huone); return !wg || wg.isRoomTile(Math.round(x), Math.round(y)); } catch (x2) { return true; } };
  // ---- kohde 1 (kp 18:05 "miks bullet collision puuttuu" · "ettei voi ampuu seinien läpi"): L4K:n estelogiikka SELLAISENAAN
  //   (shooter-1.15.2.user.js: ESTE_KORKEUS :963, esteKartta :965-984, esteMatka :987-1000, peittoLaatikot :1006-1014, peitossa :1015-1017, lentoZ :2151).
  //   Sovitus (ei logiikkaa): RE() -> e, rid -> huone, inst.getRoomObjectsForCategory(10) -> e.getRoomObjects(huone, 10), asetus.esteKorkeus -> ASETUS.esteKorkeus,
  //   sisäinen `e` -> `ent` (varjostus), huoneRuutu: jos validPosition puuttuu (testimock) lattiaa() ratkaisee, ei muuta.
  const lentoZ = (z0, hz, hd, st) => { if (hz == null || !(hd > 0.3)) return z0; return Math.max(Math.min(0, hz), Math.min(Math.max(4, hz + 1), z0 + (hz - z0) * st / hd)); };   // shooter :2151
  let esteMuisti = null;
  const esteKartta = () => {   // shooter :965
    const nyt = Date.now(); if (esteMuisti && esteMuisti.ek === ASETUS.esteKorkeus && nyt - esteMuisti.t < 1000) return esteMuisti;
    const out = { ek: ASETUS.esteKorkeus, t: nyt, ruudut: new Set(), idt: new Map(), hm: null, seinat: true, peittajat: [] };
    try {
      const cv = e.getRoomInstanceRenderingCanvas(huone, 1), g = cv && cv.geometry, oc = cv && cv._objectCache && cv._objectCache._data; out.hm = e.getFurnitureStackingHeightMap(huone);
      try { const ro = e.getRoomObject(huone, -1, 0), v = ro && ro.model.getValue('room_wall_visibility'); if (v === false || v === 0) out.seinat = false; } catch (x) {}
      if (g) { const Vk = g.direction.constructor, a = g.getScreenPoint(new Vk(0, 0, 0)), b = g.getScreenPoint(new Vk(0, 0, 1)), yks = (a.y - b.y) * (cv._scale || 1);
        if (yks > 0) for (const o of e.getRoomObjects(huone, 10) || []) {
          const bb = e.getRoomObjectBoundingRectangle(huone, o.id, 10, 1), sp = e.getRoomObjectScreenLocation(huone, o.id, 10, 1); if (!bb || !sp || !(bb.height > 0)) continue; const nousu = (sp.y - bb.y) / yks; if (nousu <= 1) continue;
          { const ent = oc && oc.get(String(o.instanceId)), ss = ent && ent._sprites && ent._sprites._sprites; let ala = -1e9, yla = 1e9;   // shooter 1.11.4 zoom + 1.10.7 katosta roikkuva ei ulotu luodin korkeudelle
            if (ss) for (const q of ss) { const t = q._sprite; if (!t || !t._visible || !t._texture) continue; yla = Math.min(yla, q._y); if (/_sd_|shadow/i.test(t._libraryAssetName || '')) continue; ala = Math.max(ala, q._y + t._height); }
            if (ala > -1e9 && (sp.y - (bb.y + (ala - yla) * (cv._scale || 1))) / yks > 1) continue; }
          const l = o.getLocation(), m = o.model, r = Math.round(((o.getDirection() && o.getDirection().x) || 0) / 45) % 4; let sx = m.getValue('furniture_size_x') || 1, sy = m.getValue('furniture_size_y') || 1; if (r === 2) [sx, sy] = [sy, sx];   // shooter 1.11.3
          if (nousu <= ASETUS.esteKorkeus) continue;   // shooter 1.10.9: peittäjiksi vain esteet (matala ruoho ei estä)
          const x0 = Math.round(l.x), y0 = Math.round(l.y); out.peittajat.push({ id: o.id, x0, y0, x1: x0 + sx - 1, y1: y0 + sy - 1 });
          for (let i = 0; i < sx; i++) for (let j = 0; j < sy; j++) { const kk = (Math.round(l.x) + i) + ',' + (Math.round(l.y) + j); out.ruudut.add(kk); out.idt.set(kk, o.id); } } }
    } catch (x) {}
    return esteMuisti = out;
  };
  const esteMatka = (x, y, dx, dy, L = 40, rata = null) => {   // shooter :987
    const k = esteKartta(), hm = k.hm; if (!hm || !(dx || dy)) return Infinity;
    const P = rata ? kamera() : null;
    const kuvassa = (s, kk) => { if (!P || !P.laatikko) return true; const id = k.idt.get(kk); if (id == null) return true; let r = null; try { r = P.laatikko(e.getRoomObjectBoundingRectangle(huone, id, 10, 1)); } catch (x2) {} if (!r) return true;
      const q = P(x + dx * s, y + dy * s, rata.z + lentoZ(1, rata.hz, rata.hd, s)); return !q || (q.x >= r.x && q.x <= r.x + r.w && q.y >= r.y && q.y <= r.y + r.h); };
    const huoneRuutu = (tx, ty) => { try { if (typeof hm.validPosition !== 'function') return lattiaa(tx, ty); return tx >= 0 && ty >= 0 && tx < hm.width && ty < hm.height && hm.validPosition(tx, ty); } catch (x2) { return false; } };
    let px = Math.round(x), py = Math.round(y), ex = px, ey = py, ulkona = !huoneRuutu(px, py);
    for (let s = 0.05; s <= L; s += 0.05) {
      const tx = Math.round(x + dx * s), ty = Math.round(y + dy * s); if (tx === ex && ty === ey) continue; ex = tx; ey = ty;
      if (!huoneRuutu(tx, ty)) { if (!ulkona && k.seinat && (tx < px || ty < py)) return Math.max(0, s - 0.05); ulkona = true; continue; }
      ulkona = false; px = tx; py = ty; if (k.ruudut.has(tx + ',' + ty)) { if (!rata) return s; const kk = tx + ',' + ty; for (let s2 = s; s2 <= L && Math.round(x + dx * s2) === tx && Math.round(y + dy * s2) === ty; s2 += 0.05) if (kuvassa(s2, kk)) return s2; }
    }
    return Infinity;
  };
  const peittoLaatikot = (f, bx, by) => {   // shooter :1006
    const k = esteKartta(), syv = bx + by, out = []; if (!f.laatikko) return out;
    for (const q of k.peittajat) {
      if (q.x1 + q.y1 <= syv + 0.25 || bx < q.x0 - 4 || bx > q.x1 + 4 || by < q.y0 - 4 || by > q.y1 + 4) continue;
      try { if ((ASETUS.eiPeita || []).includes(String(e.getRoomObject(huone, q.id, 10).type))) continue; } catch (x) {}   // kp 19:29 ammus katoaa lampun kohdalla: suorakaide on paljon tolppaa leveämpi
      let r = null; try { r = f.laatikko(e.getRoomObjectBoundingRectangle(huone, q.id, 10, 1)); } catch (x) {}
      if (r) out.push(r);
    }
    return out;
  };
  const peitossa = (f, bx, by, a) => peittoLaatikot(f, bx, by).some(r => a.x >= r.x && a.x <= r.x + r.w && a.y >= r.y && a.y <= r.y + r.h);   // shooter :1015
  const nakyy = (x, y, tx, ty) => { const m = Math.hypot(tx - x, ty - y); if (m < 0.6) return true; try { return esteMatka(x, y, (tx - x) / m, (ty - y) / m, m) >= m - 0.5; } catch (x2) { return true; } };   // shooter :904
  // Elävät, piirretyt zombit kohteina (tavalliset; muuttuneita ei 811:ssä synny)
  const kohteet = () => {
    const out = [];
    for (const z of SAILO.zombit || []) {
      if (!z || z.muuttunut || z.kuoli >= 0 || piilossa(z)) continue;
      const q = piirtoPaikat.get(z.n), ok = q && q.sn === z.synty;
      out.push({ z, x: ok ? q.x : z.x, y: ok ? q.y : z.y });
    }
    return out;
  };
  // Oma osuma zombiin: ennuste (välähdys / piilotus jos tappava), jonoon tiki():lle. Auktoriteetti päättää HP:n.
  const osuma = (k, A, w, c, d, kerroin) => {
    const z = k.z, avain = z.n + ':' + z.synty, dmg = Math.round(vahinkoOf(A, c, d) * (kerroin == null ? 1 : kerroin) * 10) / 10; if (!(dmg > 0)) return;
    tilasto.osui++;
    const nyt = Date.now(), e0 = AM.hpEnn.get(avain), pohja = e0 && nyt < e0.asti ? e0.hp : (AM.zhp.has(avain) ? AM.zhp.get(avain) : zHpMax());
    const hpE = Math.max(0, pohja - dmg), tappava = hpE <= 0;
    AM.hpEnn.set(avain, { hp: hpE, asti: nyt + 900 });
    valahdys.set(z.n, nyt + 120);
    if (tappava) {
      piilotetut.set(z.n, { sn: z.synty, asti: nyt + 2500 });
      AM.nahdyt.add(avain); ruumis(z.n, z.synty, Math.round(k.x), Math.round(k.y));
      if (!auktoriteetti()) ilmoitaTappo(omaTapot() + 1);   // ennuste; auktoriteetti ilmoittaa hyväksyessään
    }
    AM.jono.push({ id: omaId(), oma: true, zn: z.n, sn: z.synty, d: dmg, x: Math.round(k.x), y: Math.round(k.y), saapui: nyt, w, tappava });
  };

  // ---- laukaus (shooter :1042 ammu, valikoiden). Testit kutsuvat suoraan: tila.ammunta.ammuSuuntaan(dx, dy, c)
  const jaljet = [], luodit = [];
  let viimeLaukaus = 0, veto = null, autoT = null, wasdSuunta = [0, 0];
  const autoPois = () => { if (autoT) { clearInterval(autoT); autoT = null; } };
  const ammuSuuntaan = (dx, dy, cIn) => {
    const nyt = Date.now(), w = (ASETUS.ase && ASETUS.ase.valittu) || 'luoti', A = aseNyt();
    if (nyt - viimeLaukaus < Math.max(0, Number(A.cd) || 400)) return { syy: 'cooldown' };
    if (kuolemaLukossa(nyt)) return { syy: 'makaa' };   // kuolemamakuun aikana ei ammuta
    if (!vuoroSallii()) return { syy: 'ei vuoroa' };      // 811 vuoro: vain vuoron pelaaja ampuu
    const minä = omaPaikka(); if (!minä || !(Math.hypot(dx, dy) > 0)) return { syy: 'ei paikkaa' };
    const l = Math.hypot(dx, dy); dx /= l; dy /= l;
    // shooter 0.9.1: WASD-kävelyn aikana yli 120° kävelysuunnasta = ei laukausta (ei jännittäessä / latausaseella)
    // kp 19:20 "ei voi ampuu taakseppäin, sallitaan se": shooterin 0.9.1 rajoitus pois
    viimeLaukaus = nyt; tilasto.ammuttu++;
    const c = (A.lataus || A.lapi) ? (cIn != null ? Math.max(0, Math.min(1, +cIn)) : 0) : undefined;
    if (A.nollaaKontakti) AM.jono.push({ nollaa: true, id: omaId(), saapui: nyt });
    aaniLaukaus(A, minä);
    const x = Math.round(minä.x), y = Math.round(minä.y);
    if (A.m === 'p') {   // projektiili (jousi, pistooli): lentää, osuma lasketaan radalta luotiTickissä (shooter :1745)
      const LL = A.latausLento && c != null ? A.latausLento[0] + (A.latausLento[1] - A.latausLento[0]) * c : (A.lento || 12);
      const este = esteMatka(minä.x, minä.y, dx, dy, 40, { z: minä.z });
      luodit.push({ x: minä.x, y: minä.y, z: minä.z, dx, dy, t0: nyt, w, c, LL, este, pm: null });   // shooter :1054 (rata: kuva-alueen sisällä)
      try { SYNK.lahetaLaukaus(['p', w, Math.round(minä.x * 100) / 100, Math.round(minä.y * 100) / 100, minä.z, Math.round(dx * 1000) / 1000, Math.round(dy * 1000) / 1000, c, Math.round(LL * 100) / 100, Math.round(este * 100) / 100]); } catch (x) {}
      return { lensi: w, c };
    }
    // hitscan (miekka): normaalisti ensimmäinen kohde kantamalla; täysi lataus = pyörähdys, kaikki säteellä lapi[0] (shooter :1049-1062)
    const lapi = lapiLyonti(A, c), KA = lapi ? A.lapi[0] : (A.kantama || 12);
    let osumat = [];
    for (const k of kohteet()) { const m = sateella(x, y, dx, dy, k.x, k.y, KA, lapi ? PYORAHDYS : OSUMA_SADE); if (m != null && nakyy(x, y, k.x, k.y)) osumat.push(Object.assign({ m }, k)); }
    osumat.sort((a, b) => a.m - b.m);
    if (!lapi) osumat = osumat.slice(0, 1);
    const jPituus = lapi ? KA : osumat[0] ? osumat[0].m : KA;
    jaljet.push({ x: minä.x, y: minä.y, z: minä.z, dx, dy, pituus: jPituus, t0: nyt, vari: A.vari, lapi, w, i: minä.i });
    try { SYNK.lahetaLaukaus(['h', w, Math.round(minä.x * 100) / 100, Math.round(minä.y * 100) / 100, minä.z, Math.round(dx * 1000) / 1000, Math.round(dy * 1000) / 1000, c, lapi ? 1 : 0, Math.round(jPituus * 100) / 100]); } catch (x) {}
    while (jaljet.length > 20) jaljet.shift();
    const lapiKerroin = (k) => {   // shooter :923 varjossa: linjalla lähempänä toinen kohde -> lapiLapi %
      const p = A.lapiLapi != null ? +A.lapiLapi : 100; if (p >= 100) return 1;
      const tx = k.x - x, ty = k.y - y, m = Math.hypot(tx, ty); if (m < 0.6) return 1;
      for (const o of osumat) { if (o === k) continue; const ox = o.x - x, oy = o.y - y, s = (ox * tx + oy * ty) / (m * m); if (s <= 0 || s >= 1) continue;
        if (Math.hypot(ox - tx * s, oy - ty * s) < 0.5 && Math.hypot(ox, oy) < m - 0.3) return Math.max(0, p) / 100; }
      return 1;
    };
    osumat.forEach((k, ix) => osuma(k, A, w, c, undefined, lapi ? lapiKerroin(k) : (ix ? TAKA_KERROIN : 1)));
    return { osui: osumat.map(k => k.z.n), lapi };
  };
  const luotiTick = (nyt) => {
    for (let i = luodit.length - 1; i >= 0; i--) {
      const b = luodit[i], A = aseOf(b.w), matka = (nyt - b.t0) / 1000 * (A.nopeus || 8);
      const m0 = b.pm == null ? 0.5 : b.pm; b.pm = matka; const m1 = Math.min(matka, b.LL, b.este);
      let paras = null;
      if (matka > 0.5) for (const k of kohteet()) { const m = sateella(b.x, b.y, b.dx, b.dy, k.x, k.y, m1, OSUMA_SADE); if (m != null && m >= m0 - OSUMA_SADE && m > 0.5 && (!paras || m < paras.m)) paras = Object.assign({ m }, k); }
      if (paras) { luodit.splice(i, 1); if (!b.piirtoVain) osuma(paras, A, b.w, b.c, paras.m, 1); continue; }
      if (matka > b.LL || matka > b.este) luodit.splice(i, 1);
    }
  };
  const ammu = (px, py, c) => { const minä = omaPaikka(); const hv = hiirenVektori(px, py, minä); return hv ? ammuSuuntaan(hv.dx, hv.dy, c) : { syy: 'ei suuntaa' }; };

  // ---- jäljet ja lentävät ammukset omalla kanvaksella, huoneen päällä, ei hiirtä
  const jkanvas = (typeof document !== 'undefined' && document.createElement) ? document.createElement('canvas') : null;
  const jctx = jkanvas && jkanvas.getContext ? jkanvas.getContext('2d') : null;
  try { if (document.querySelectorAll) for (const v of document.querySelectorAll('canvas[data-zombit-ammunta]')) v.remove(); } catch (x) {}
  if (jkanvas) { if (jkanvas.setAttribute) jkanvas.setAttribute('data-zombit-ammunta', String(huone)); if (jkanvas.style) jkanvas.style.cssText = 'position:fixed;left:0;top:0;pointer-events:none;z-index:2'; }
  // ---- zombien HP-palkit (vaihe 1c, kp 17:00 "health bar puuttuu zombeilta"): L4K zombiPiirto (shooter :1683-1688) sellaisenaan:
  //   vain vahingoittuneelle (hp < max tai oma ennuste voimassa; ennusteesta pienempi kuten L4K hpEnn), 30 px, tausta #000a 32x6,
  //   vihreä #8bd24a 4 px, korkeus z + 2.7. HP = auktoriteetin AM.zhp (seuraajalla johtajan snapshotista 'zh') -> näkyy kaikilla, myös katsojilla.
  const hpPalkit = (nyt) => {
    const out = [], max = zHpMax();
    for (const z of SAILO.zombit || []) {
      if (!z || z.muuttunut || z.kuoli >= 0 || piilossa(z)) continue;
      const avain = z.n + ':' + z.synty, e0 = AM.hpEnn.get(avain), hp = AM.zhp.has(avain) ? AM.zhp.get(avain) : max;
      const hh = e0 && nyt < e0.asti ? Math.min(hp, e0.hp) : hp; if (!(hh < max)) continue;
      const q = piirtoPaikat.get(z.n), ok = q && q.sn === z.synty;
      out.push({ n: z.n, x: ok ? q.x : z.x, y: ok ? q.y : z.y, z: ok ? (Number(q.z) || 0) : 0, os: Math.max(0, Math.min(1, hh / max)) });
    }
    return out;
  };
  function nuoli(a, b, karki) {   // shooter :1770-1781 sellaisenaan
    const ctx = jctx, kulma = Math.atan2(a.y - b.y, a.x - b.x), L = 22, K = 7, c = Math.cos(kulma), s = Math.sin(kulma);
    const hx = a.x - c * L, hy = a.y - s * L;
    ctx.lineCap = 'round'; ctx.strokeStyle = '#000'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(a.x, a.y); ctx.stroke();
    ctx.strokeStyle = '#8b5a2b'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(a.x, a.y); ctx.stroke();
    ctx.fillStyle = karki; ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.beginPath();
    ctx.moveTo(a.x + c * 3, a.y + s * 3);
    ctx.lineTo(a.x - Math.cos(kulma - 0.5) * K, a.y - Math.sin(kulma - 0.5) * K); ctx.lineTo(a.x - Math.cos(kulma + 0.5) * K, a.y - Math.sin(kulma + 0.5) * K); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#eee'; ctx.lineWidth = 2;
    for (const sivu of [-0.6, 0.6]) { ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx - Math.cos(kulma + sivu) * 6, hy - Math.sin(kulma + sivu) * 6); ctx.stroke(); }
  }
  // shooter :1805-1822 pyörähdys: kaari kiertää 360° PYOR_MS:ssa, perässä häipyvä vana, lopuksi rengas häipyy; hahmo pyörii 8 suunnan läpi paikallisesti.
  const PYOR_MS = 360, PYOR_KUVA = 2;
  function pyorahdysPiirto(j, nyt, p) {
    const ctx = jctx, ika = nyt - j.t0, vari = j.vari || '#e8eef7', k0 = Math.atan2(j.dy, j.dx); if (ika > PYOR_MS + 350) return;
    const o = j.i != null ? (() => { try { return e.getRoomObject(huone, j.i, 100); } catch (x) { return null; } })() : null;
    if (o) { try { const d = o.getDirection(); if (j.suunta0 == null) j.suunta0 = d.x;
      if (ika < PYOR_MS) { const uusi = (Math.round(j.suunta0 / 45) * 45 + 45 * Math.floor(ika / (PYOR_MS / 8))) % 360; if (d.x !== uusi) o.setDirection(new d.constructor(uusi, d.y, d.z)); }
      else if (!j.palautettu) { j.palautettu = true; o.setDirection(new d.constructor(j.suunta0, d.y, d.z)); } } catch (x) {} }
    const RK = PYOR_KUVA, piste = k => p(j.x + RK * Math.cos(k), j.y + RK * Math.sin(k), j.z + 0.8);
    const kaari = (a0, a1, n) => { ctx.beginPath(); for (let i = 0; i <= n; i++) { const q = piste(a0 + (a1 - a0) * i / n); if (q) i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); } ctx.stroke(); };
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = vari; ctx.shadowColor = vari;
    if (ika < PYOR_MS) {
      const kulku = k0 + 2 * Math.PI * (ika / PYOR_MS);
      for (const [pit, lev, alfa] of [[Math.PI * 0.9, 2, 0.25], [Math.PI * 0.55, 3, 0.5], [Math.PI * 0.25, 4, 0.95]]) { ctx.globalAlpha = alfa; ctx.lineWidth = lev; ctx.shadowBlur = 6; kaari(kulku - pit, kulku, 40); }
    } else { ctx.globalAlpha = Math.max(0, 0.6 * (1 - (ika - PYOR_MS) / 350)); ctx.lineWidth = 2; ctx.shadowBlur = 4; kaari(k0, k0 + 2 * Math.PI, 72); }
    ctx.restore();
  }
  // ---- kohde 2 (kp 18:07 "omalle pelaajalle tosiaa health bar"): oman pelaajan HP-palkki hahmon yläpuolelle, shooter-1.15.2 `palkki` :1862-1866 sellaisenaan
  //   (z+2.9, leveys 40, tausta #000a 42x7, väri >0.5 #3ddc5a / >0.25 #f5c542 / muuten #e5484d, arvo <= 0 -> 💀; osuus = HP / max kuten shooter 1.12.0). HP = AM.hp.
  //   Piirretään kun oma pelaaja on pelissä (vuoroSallii); shooter piirtää omankin palkin aina (:1909). Huom: kiinnijaanti 'kontakti' -tilassa AM.hp ei muutu (täynnä).
  const safeHouseHpPalkki = () => {
    if (!ASETUS.safeHouse) return null;
    const S = safeHouseTila(); if (!S || !(S.max > 0)) return null;
    const r = (ASETUS.safeHouse.ruudut && ASETUS.safeHouse.ruudut[0]) || [15, 11];
    return { x: r[0], y: r[1], z: 7, hp: Math.max(0, S.hp), max: S.max, os: Math.min(1, Math.max(0, S.hp) / S.max) };
  };
  // kp 31.10. "portille health bar": kunkin portin (ASETUS.aidat.palat) HP-palkki portin yläpuolelle; sama tyyli kuin omaP / shP (40 px, 42x7 tausta, väri >0.5/>0.25).
  //   HP aitaTila().palat[i].hp (seuraajilla snap.ai); ei palkkia tuhoutuneelle palalle eikä vuoropelin ulkopuolella (VA() ilman VT.vu). 684: ASETUS.aidat null -> [].
  const gateZ = new Map();   // palan id -> { t, z }: ruudun korkeus object-haulla korkeintaan 2 s välein
  const gateHpPalkit = () => {
    const out = []; if (!ASETUS.aidat || (VA() && !VT.vu)) return out;
    const AT = aitaTila(); if (!AT) return out; const nyt = Date.now();
    for (const pa of AT.palat || []) {
      if (!(pa.hp > 0) || (AT.tuhoutuneetIds && AT.tuhoutuneetIds.has(pa.id))) continue;
      let c = gateZ.get(pa.id); if (!c || nyt - c.t > 2000) { let z = c ? c.z : 0; try { z = Number(e.getRoomObject(huone, pa.id, 10).getLocation().z) || 0; } catch (x) {} c = { t: nyt, z }; gateZ.set(pa.id, c); }
      out.push({ x: pa.x + 0.5, y: pa.y + 0.5, z: c.z + 2.4, os: Math.min(1, Math.max(0, pa.hp) / (pa.max || ASETUS.aidat.hp || 1)) });
    }
    return out;
  };
  const omaHpPalkki = () => { if (!vuoroSallii()) return null; const m = omaPaikka(); return m ? { x: m.x, y: m.y, z: m.z, hp: AM.hp } : null; };
  const piirraJaljet = (nyt) => {
    const kesto = Math.max(50, Number(ASETUS.ase.jalkiMs) || 450);
    while (jaljet.length && nyt - jaljet[0].t0 > (jaljet[0].lapi ? 750 : kesto)) jaljet.shift();
    if (!jkanvas || !jctx || !document.body) return;
    const W = window.innerWidth || 0, H = window.innerHeight || 0;
    const palkit = hpPalkit(nyt), omaP = omaHpPalkki(), shP = safeHouseHpPalkki(), gP = gateHpPalkit();
    if (!jaljet.length && !luodit.length && !palkit.length && !veto && !omaP && !shP && !gP.length) { if (jkanvas.width) jctx.clearRect(0, 0, jkanvas.width, jkanvas.height); return; }
    if (jkanvas.parentNode !== document.body) document.body.appendChild(jkanvas);
    if (jkanvas.width !== W || jkanvas.height !== H) { jkanvas.width = W; jkanvas.height = H; jkanvas.style.width = W + 'px'; jkanvas.style.height = H + 'px'; }
    jctx.clearRect(0, 0, W, H);
    const p = kamera(); if (!p) return;
    for (const j of jaljet) {   // miekka: shooter :1853-1858 sellaisenaan
      if (j.lapi) { pyorahdysPiirto(j, nyt, p); continue; }
      const ika = nyt - j.t0; if (ika > 300) continue; const k0 = Math.atan2(j.dy, j.dx); jctx.save(); jctx.globalAlpha = 1 - ika / 300; jctx.strokeStyle = j.vari || '#e8eef7'; jctx.lineWidth = 4; jctx.lineCap = 'round'; jctx.beginPath();
      for (let i = 0; i <= 12; i++) { const k = k0 - Math.PI / 3 + i * Math.PI / 18, q = p(j.x + 1.2 * Math.cos(k), j.y + 1.2 * Math.sin(k), j.z + 0.8); if (q) i ? jctx.lineTo(q.x, q.y) : jctx.moveTo(q.x, q.y); }
      jctx.stroke(); jctx.restore();
    }
    for (const b of luodit) {   // shooter :1842-1851: lentävä luoti = hehkuva viiru + kärki, jousi = nuoli
      const A = aseOf(b.w), matka = Math.min((nyt - b.t0) / 1000 * (A.nopeus || 8), b.LL, b.este), bx = b.x + b.dx * matka, by = b.y + b.dy * matka;
      if (A.tyyli === 'luoti') {
        const v = Math.min(0.7, matka), a = p(bx, by, b.z + 1), t = p(bx - b.dx * v, by - b.dy * v, b.z + 1); if (!a || !t || peitossa(p, bx, by, a)) continue;   // shooter :1845 peitossa: ei piirretä esteen takana
        jctx.lineCap = 'round'; jctx.strokeStyle = 'rgba(255,200,80,.5)'; jctx.lineWidth = 5; jctx.beginPath(); jctx.moveTo(t.x, t.y); jctx.lineTo(a.x, a.y); jctx.stroke();
        jctx.strokeStyle = '#fff6d0'; jctx.lineWidth = 2; jctx.beginPath(); jctx.moveTo((t.x + a.x) / 2, (t.y + a.y) / 2); jctx.lineTo(a.x, a.y); jctx.stroke();
        jctx.fillStyle = '#fff'; jctx.beginPath(); jctx.arc(a.x, a.y, 2.5, 0, Math.PI * 2); jctx.fill(); continue;
      }
      const a = p(bx, by, b.z + 1), t = p(bx - b.dx * 0.3, by - b.dy * 0.3, b.z + 1); if (a && t && !peitossa(p, bx, by, a)) nuoli(a, t, A.vari);   // shooter :1850
    }
    if (veto) {   // shooter :1867-1868 latauspalkki
      const A = aseNyt(), m = omaPaikka(), sc = m && (A.lataus || A.lapi) && p(m.x, m.y, m.z + 3.3);
      if (sc) { const q = Math.min(1, (nyt - veto.t0) / latausMs(A)), w = 40; jctx.fillStyle = '#000a'; jctx.fillRect(sc.x - w / 2 - 1, sc.y - 1, w + 2, 6); jctx.fillStyle = q >= 1 ? '#ffd23f' : '#9ecbff'; jctx.fillRect(sc.x - w / 2, sc.y, w * q, 4); }
    }
    for (const b of palkit) {   // L4K :1685-1687
      const sc = p(b.x, b.y, b.z + 2.7); if (!sc) continue; const w = 30;
      jctx.fillStyle = '#000a'; jctx.fillRect(sc.x - w / 2 - 1, sc.y - 1, w + 2, 6); jctx.fillStyle = '#8bd24a'; jctx.fillRect(sc.x - w / 2, sc.y, w * b.os, 4);
    }
    if (omaP) {   // shooter :1862-1866 palkki(omaNimi(), hp)
      const sc = p(omaP.x, omaP.y, omaP.z + 2.9);
      if (sc) { const w = 40; jctx.fillStyle = '#000a'; jctx.fillRect(sc.x - w / 2 - 1, sc.y - 1, w + 2, 7);
        const os = Math.min(1, Math.max(0, omaP.hp) / hpMax());
        jctx.fillStyle = os > 0.5 ? '#3ddc5a' : os > 0.25 ? '#f5c542' : '#e5484d'; jctx.fillRect(sc.x - w / 2, sc.y, w * os, 5);
        if (omaP.hp <= 0) { jctx.font = '16px sans-serif'; jctx.fillText('💀', sc.x - 8, sc.y - 4); } }
    }
    if (shP) {   // Safe House HP-palkki: rakennuksen yläpuolella (x 15, y 11, z 7) tai vuorolaatikon alla (kp: "ei näy mistään safe house health")
      let sc = p(shP.x, shP.y, shP.z + 1.5);
      if (!sc && vEl && vEl.getBoundingClientRect) {
        const vr = vEl.getBoundingClientRect();
        if (vr && vr.width > 0) sc = { x: vr.left + vr.width / 2, y: vr.bottom + 12 };
      }
      if (sc) {
        const w = 40;
        jctx.fillStyle = '#000a'; jctx.fillRect(sc.x - w / 2 - 1, sc.y - 1, w + 2, 7);
        const os = shP.os;
        jctx.fillStyle = os > 0.5 ? '#3ddc5a' : os > 0.25 ? '#f5c542' : '#e5484d'; jctx.fillRect(sc.x - w / 2, sc.y, w * os, 5);
        if (shP.hp <= 0) { jctx.font = '16px sans-serif'; jctx.fillText('💀', sc.x - 8, sc.y - 4); }
      }
    }
    for (const g of gP) {   // portit
      const sc = p(g.x, g.y, g.z); if (!sc) continue; const w = 40;
      jctx.fillStyle = '#000a'; jctx.fillRect(sc.x - w / 2 - 1, sc.y - 1, w + 2, 7);
      jctx.fillStyle = g.os > 0.5 ? '#3ddc5a' : g.os > 0.25 ? '#f5c542' : '#e5484d'; jctx.fillRect(sc.x - w / 2, sc.y, w * g.os, 5);
    }
  };

  // ---- WASD (shooter :2037-2094, valikoiden): pidetyt näppäimet joukkona, suunta = summa (W+D vino), maali = oma ruutu + suunta,
  //   uusi maali kun pyöristetty ruutu vaihtuu tai suunta vaihtuu. Kävely clientin omalla sendWalkUpdatella (sama kuin lattiaklikkaus;
  //   kuolemamakuun kävelyesto pätee). Palvelimen raja 10 kävelyä / 2 s (shooter 1.10.0). Ruudun suuntainen tila (shooter 1.6.2 oletus).
  const WASD = { w: [-1, -1], a: [-1, 1], s: [1, 1], d: [1, -1], arrowup: [-1, -1], arrowleft: [-1, 1], arrowdown: [1, 1], arrowright: [1, -1] };
  const pidetyt = new Set(), kavelyAjat = [];
  let wasdMaali = null, chatTila = false;
  const MUISTI_ASE = 'zombit.' + huone + '.ase';
  let aseOn = true; try { aseOn = sessionStorage.getItem(MUISTI_ASE) !== '0'; } catch (x) {}
  // 811 vuoro (kp 16:25 "Ase pitää olla käytössä vaan pelaajalle"): WASD + hiiriammunta vain vuoron pelaajalle pelin aikana; muut kävelevät klikkaamalla.
  const aseAktiivinen = () => aseOn && vuoroSallii();
  const kuljettava = (x, y) => { try { const h = e.getFurnitureStackingHeightMap(huone); if (!h) return false; if (typeof h.validPosition === 'function' && !h.validPosition(x, y)) return false; return h.getTileHeight(x, y) < 60 && lattiaa(x, y); } catch (x2) { return false; } };
  const kavele = (x, y) => {
    const nyt = Date.now(); while (kavelyAjat.length && nyt - kavelyAjat[0] >= 2000) kavelyAjat.shift();
    if (kavelyAjat.length >= 10) { tilasto.kavelyKiintio++; return false; }
    const h = e && e.objectEventHandler; if (!h || typeof h.sendWalkUpdate !== 'function') return false;
    kavelyAjat.push(nyt); tilasto.kavely++;
    try { h.sendWalkUpdate(x, y); } catch (x2) { return false; }
    return true;
  };
  let wasdEste = false;   // shooter :2051 wasdEste (kävelyn este: seinää vasten seistessä katse vapaana)
  const wasdTick = () => {
    wasdEste = false;   // shooter :2079
    if (!aseAktiivinen() || chatTila || !pidetyt.size || kuolemaLukossa(Date.now())) { wasdMaali = null; return; }
    const A = aseNyt(); if (veto && !(A.hidasKavely || A.lataus)) { wasdMaali = null; return; }   // shooter 1.7.6 / 1.10.17
    let dx = 0, dy = 0; for (const k of pidetyt) { dx += WASD[k][0]; dy += WASD[k][1]; }
    dx = Math.sign(dx); dy = Math.sign(dy); if (!dx && !dy) { wasdMaali = null; return; }
    wasdSuunta = [dx, dy];
    const o = omaPaikka(); if (!o) return;
    const tx = Math.round(o.x) + dx, ty = Math.round(o.y) + dy;
    if (!kuljettava(tx, ty)) { wasdEste = true; wasdMaali = null; return; }   // shooter :2089 (siellä wasdEste = !p.liikkuu; liikkuu-tietoa ei ole tässä)
    const avain = tx + ',' + ty; if (avain === wasdMaali) return;
    if (kavele(tx, ty)) wasdMaali = avain;
  };
  const wasdAjastin = setInterval(() => { try { wasdTick(); } catch (x) {} }, 100);
  // ---- kohde 7 (kp 18:22 "hahmo ei pyöri siis hiiren suuntaa" · "niinku og shooteris"): hahmo kääntyy hiiren suuntaan. shooter-1.15.2.user.js:
  //   hiirenKulma :2193 (8 suuntaa: round(atan2(dx,-dy)/45)*45), kääntösilmukka setInterval 30 ms :2194-2203, paikallinen käännös :2201-2202
  //   (o.setDirection(new d.constructor(k, d.y, d.z)); o.model.setValue('head_direction', k)). Ehdot sellaisenaan: ei kun WASD pidossa (paitsi seinää vasten, wasdEste),
  //   ei kuolleena (kavelyEstoAsti), uusi lähetys vain jos kulma vaihtuu tai hahmon oikea suunta eroaa (viimeKatse, 50 / 400 ms).
  //   EI KOPIOITU: lahetaPaketti(3301, ...) (katsepaketti palvelimelle; paketit kielletty, testi G1) -> käännös on vain tällä clientilla (shooter :1804: palvelimen seuraava tilaviesti korjaa),
  //   muut eivät näe suuntaa. wasdIrti (shooter :2194 350 ms) on shooterissa aina 0 (ei koskaan asetettu) -> jätetty pois.
  let viimeKatse = null, viimeKatseAika = 0;
  const hiirenKulma = () => { const h = hiirenVektori(null, null, omaPaikka()); return h ? ((Math.round(Math.atan2(h.dx, -h.dy) * 180 / Math.PI / 45) * 45) % 360 + 360) % 360 : null; };   // shooter :2193
  // kp 18:33 "lähetetään se omaa kanavaa pitkin": suunta muille SYNK-kanavalla (raakapaketti 3301 ei löydy kaikilta, istunnossa ei ole yhteyttä).
  const lahetaKatse = (minä, k) => { try { return SYNK.lahetaKatse(k); } catch (x) { return false; } };
  // kp 19:23: WASD-kävelyn aikana hahmo pitää katseensa hiiren suunnassa. Moottori asettaa suunnan joka askeleella -> oma näkymä: tasataan paikallisesti joka 30 ms tikillä (ei verkkoon),
  //   muille: lähetys kulman vaihtuessa ja virkistys 1000 ms välein (vastaanottaja pitää muistin 2500 ms, katseSaapui + katseKertaa).
  const katseKavellessa = (k) => {
    const nyt = Date.now(), minä = omaPaikka(); if (!minä) return;
    let o = null, d = null; try { o = e.getRoomObject(huone, minä.i, 100); d = o && o.getDirection(); } catch (x) {} if (!o || !d) return;
    if (d.x !== k) { try { o.setDirection(new d.constructor(k, d.y, d.z)); o.model.setValue('head_direction', k); tilasto.katseKavellessa = (tilasto.katseKavellessa || 0) + 1; } catch (x) {} }
    if (k !== viimeKatse || nyt - viimeKatseAika >= 1000) { lahetaKatse(minä, k); viimeKatse = k; viimeKatseAika = nyt; }
  };
  const katseTick = () => {
    if (!aseAktiivinen() || kuolemaLukossa(Date.now())) return;   // shooter :2194 (ohjausOn, kuollut). `pidetyt`-ehto POISTETTU tarkoituksella (kp 19:23): shooter ei käännä WASD-kävelyn aikana, tämä kääntää.
    const k = hiirenKulma(); if (k == null) return;
    if (pidetyt.size && !wasdEste) return katseKavellessa(k);   // kp 19:23 "hahmon pitää kävellä takaperin jos ampuu taaksepäin": ei shooterissa (:2194 ohittaa), uusi
    if (Date.now() - viimeKatseAika < 50) return;
    const minä = omaPaikka(); if (!minä) return;
    let o = null, d = null; try { o = e.getRoomObject(huone, minä.i, 100); d = o && o.getDirection(); } catch (x) {} if (!o || !d) return;
    if (k === viimeKatse && (d.x == null || d.x === k || Date.now() - viimeKatseAika < 400)) return;   // shooter :2198 (minä.suunta = hahmon oikea suunta)
    lahetaKatse(minä, k);   // kp 18:32 "saa käyttää 3301 pakettia": muutkin näkevät suunnan (shooter :2200)
    try { o.setDirection(new d.constructor(k, d.y, d.z)); o.model.setValue('head_direction', k); viimeKatse = k; viimeKatseAika = Date.now(); tilasto.katse = (tilasto.katse || 0) + 1; } catch (x) {}   // shooter :2201-2202
  };
  const katseAjastin = setInterval(() => { try { katseTick(); katseKertaa(); } catch (x) {} }, 30);   // shooter :2203
  const onKentta = el => !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
  const chatPois = () => { chatTila = false; try { if (onKentta(document.activeElement)) document.activeElement.blur(); } catch (x) {} try { hudPaivita(); } catch (x) {} };
  // Vaihe 1c (kp 17:02 "nyt täs ei oo sitä vaihtoo chatin ja pelin välil" · "eli ei voi kirjottaa wasd kontrollien takii samalla"):
  //   L4K:n liike/chat-tila (shooter :2228-2291) sellaisenaan, vain vuoron pelaajalle (aseAktiivinen; katsojien näppäimiin ei kosketa):
  //   PELI (oletus): WASD liikkuu, 1-3 / Q vaihtaa asetta, MUUT tulostuvat näppäimet pysäytetään ennen clientiä (L4K 1.6.3: muuten client
  //   fokusoi chatin ja kirjain jää sinne) ja valitun chat-kentän kirjaimet estetään. CHAT: Enter fokusoi chat-kentän (.nitro-chat-input-container),
  //   Enter lähettää ja chat JÄÄ auki (L4K 1.13.0, fokus palautetaan 0/80/200 ms), Esc tai klikkaus chat-alueen ulkopuolelle palaa peliin,
  //   klikkaus chat-kenttään avaa chatin. Tila näkyy HUD:n sirussa (🎮 PELI / 💬 CHAT).
  const chatKentta = () => { try { return document.querySelector ? document.querySelector('.nitro-chat-input-container input, .nitro-chat-input-container textarea') : null; } catch (x) { return null; } };
  const chatAlueella = el => { try { return !!(el && el.closest && el.closest('.nitro-chat-input-container')); } catch (x) { return false; } };
  const ASEJARJ_N = () => ASEJARJ.filter(w => ASETUS.aseet && ASETUS.aseet[w]);
  const vaihdaAse = (suunta) => { const L = ASEJARJ_N(), i = L.indexOf(ASETUS.ase.valittu); const w = L[((i < 0 ? 0 : i) + suunta + L.length) % L.length]; if (w && valitseAse(w)) { try { ilmoita(aseOf(w).ikoni + ' ' + aseOf(w).nimi); } catch (x) {} } };   // L4K :822 (Q)
  const nappain = ev => {
    const k = String(ev.key || '').toLowerCase();
    if (ev.altKey && k === 'k' && VA()) { if (ev.preventDefault) ev.preventDefault(); kameraVaihda(); return; }   // L4K :2034 Alt+K
    if (!aseAktiivinen() || ev.altKey || ev.ctrlKey || ev.metaKey) return;
    if ((k === 'enter' || k === 'numpadenter') && !ev.isComposing) {
      if (!chatTila) { chatTila = true; const c = chatKentta(); if (c) { ev.preventDefault(); ev.stopImmediatePropagation(); try { c.focus(); } catch (x) {} } try { hudPaivita(); } catch (x) {} }
      else for (const ms of [0, 80, 200]) setTimeout(() => { if (!chatTila) return; const c = chatKentta(); if (c && document.activeElement !== c) try { c.focus(); } catch (x) {} }, ms);
      return;
    }
    if (k === 'escape') { if (chatTila) { if (ev.preventDefault) ev.preventDefault(); chatPois(); } return; }
    if (chatTila) return;
    const tulostuva = String(ev.key || '').length === 1;
    if (WASD[k]) { ev.preventDefault(); ev.stopImmediatePropagation(); if (!pidetyt.has(k)) { pidetyt.add(k); wasdTick(); } return; }
    if (tulostuva && ev.code !== 'Space') {
      ev.preventDefault(); ev.stopImmediatePropagation();
      if (ev.repeat) return;
      if (k === '1' || k === '2' || k === '3') { const w = ASEJARJ[+k - 1]; if (valitseAse(w)) { try { ilmoita(aseOf(w).ikoni + ' ' + aseOf(w).nimi); } catch (x) {} } }
      else if (k === 'q') vaihdaAse(1);
      return;
    }
    if (tulostuva && onKentta(ev.target)) ev.preventDefault();   // välilyönti valittuun kenttään ei kirjoita peli-tilassa
  };
  const nosto = ev => { const k = String(ev.key || '').toLowerCase(); if (pidetyt.delete(k)) { ev.preventDefault(); ev.stopImmediatePropagation(); wasdTick(); } };
  const huoneeseen = ev => !!ev && ev.button === 0 && ev.target && ev.target.tagName === 'CANVAS' && !(ev.target.hasAttribute && ev.target.hasAttribute('data-zombit-ammunta'));
  // Hiiri (shooter :2133-2145, :2211): veto-ase (jousi, miekka) jännittyy painettaessa ja laukeaa irrotettaessa (c = lataus 0..1),
  //   auto-ase (pistooli) tulittaa cd:n tahtiin niin kauan kuin nappi on pohjassa, muut laukeavat painettaessa.
  const hiiri = ev => {
    if (!ev) return;
    if (ev.type === 'pointermove' || ev.type === 'mousemove') { hiiriX = ev.clientX; hiiriY = ev.clientY; return; }
    if ((ev.type === 'pointerdown' || ev.type === 'mousedown') && aseAktiivinen()) {   // L4K :2287-2291
      if (onKentta(ev.target)) { if (!chatTila) { chatTila = true; try { hudPaivita(); } catch (x) {} } return; }
      if (!chatAlueella(ev.target) && (chatTila || onKentta(document.activeElement))) chatPois();
    }
    if (ev.type === 'pointerup' || ev.type === 'mouseup') {
      if (veto && aseAktiivinen()) { const A = aseNyt(), c = Math.min(1, (Date.now() - veto.t0) / latausMs(A)); veto = null; ammu(ev.clientX, ev.clientY, c); wasdTick(); }
      autoPois();
    }
    if (!aseAktiivinen() || !huoneeseen(ev)) return;
    ev.preventDefault(); ev.stopImmediatePropagation();   // vasen klikkaus huoneeseen ampuu eikä kävele (shooter :2211)
    if (ev.type !== 'pointerdown') return;
    if (chatTila) chatPois();
    hiiriX = ev.clientX; hiiriY = ev.clientY;
    const A = aseNyt();
    if (A.veto) { if (!veto && !kuolemaLukossa(Date.now())) veto = { t0: Date.now() }; return; }
    ammu(ev.clientX, ev.clientY);
    if (A.auto && !autoT) autoT = setInterval(() => { if (!aseAktiivinen() || !aseNyt().auto) return autoPois(); ammu(); }, 40);
  };
  const HIIRI_T = ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click', 'pointermove'];
  addEventListener('keydown', nappain, true); addEventListener('keyup', nosto, true);
  for (const t of HIIRI_T) addEventListener(t, hiiri, true);
  const blur = () => { pidetyt.clear(); wasdMaali = null; veto = null; autoPois(); };
  addEventListener('blur', blur);
  const asetaAse = (v) => { aseOn = !!v; try { sessionStorage.setItem(MUISTI_ASE, aseOn ? '1' : '0'); } catch (x) {} blur(); return aseOn; };

  // ---- kameralukko (vaihe 1c, kp 17:01 "eiks meil ollu robo shooteris kameran keskitys pelaajaa" · 17:02 "ku ei voi samaa aikaa drag ja ampuu"):
  //   shooter-1.15.2 :1994-2034 kameraLukitse + kameraKaari sellaisenaan: oman hahmon jalkapiste ruudun keskelle (opittu jalka->laatikon keskusero
  //   per huone+zoom), ajo moottorin _roomManager.update-kääreessä ennen piirtoa, clientin oma updateRoomCameras ohitetaan kun lukko on päällä.
  //   AKTIIVINEN vain kun tämä client on vuorossa (vu.id === oma, laskenta + peli), ja vapautuu itsestään kun vuoro päättyy.
  //   Omat liput (rm.__zombitKamera, e.__zombitKameraCam) ja globaalit (window.__zombitKameraFn/Akt), joten L4K:n oma kääre (__shooterKamera2) ei törmää.
  //   Alt+K vaihtaa (localStorage 'zombit.<huone>.kamera'). ASETUS.vuoro.kamera === false = pois. Chat-kerroksen siirto (kameralukko 1.7.0) jätetty pois kuten L4K:ssa.
  const KAMERA_MUISTI = 'zombit.' + huone + '.kamera';
  let kameraPaalla = true; try { kameraPaalla = localStorage.getItem(KAMERA_MUISTI) !== 'off'; } catch (x) {}
  const kameraOpittu = {};
  let kameraSuljettu = false;
  const kameraAktiivinen = () => { if (kameraSuljettu || !kameraPaalla) return false; const V = VA(); if (!V || V.kamera === false) return false; const vu = VT.vu; return !!vu && vu.id === omaId(); };
  const kameraLukitse = () => {
    if (!kameraAktiivinen()) return;
    try {
      const oma = omaIndeksi(); if (oma == null || oma < 0) return;
      const kangas = e.getRoomInstanceRenderingCanvas(huone, 1); if (!kangas) return;
      const S = e.getRoomObjectScreenLocation(huone, oma, 100, 1); if (!S) return;
      const sk = kangas.scale || 1, cx = kangas.width / sk / 2, cy = kangas.height / sk / 2, avain = huone + ':' + sk;
      if (!kameraOpittu[avain]) { const b = e.getRoomObjectBoundingRectangle(huone, oma, 100, 1); if (b && b.width > 0) kameraOpittu[avain] = [S.x - (b.x + b.width / 2), S.y - (b.y + b.height / 2)]; }
      const k = kameraOpittu[avain]; if (!k) return;
      const dx = Math.round(cx + k[0] - S.x), dy = Math.round(cy + k[1] - S.y); if (!dx && !dy) return;
      const o = e.getRoomInstanceRenderingCanvasOffset(huone, 1); if (!o) return;
      o.x += dx; o.y += dy; e.setRoomInstanceRenderingCanvasOffset(huone, 1, o);
      tilasto.kamera = (tilasto.kamera || 0) + 1;
    } catch (x) {}
  };
  const kameraKaari = () => {
    const rm = e && e._roomManager; if (!rm || typeof rm.update !== 'function') return false;
    window.__zombitKameraFn = kameraLukitse; window.__zombitKameraAkt = kameraAktiivinen;   // kääre kutsuu aina uusinta asennusta (L4K 0.7.1)
    if (!rm.__zombitKamera) { const alkup = rm.update; rm.__zombitKamera = true; rm.update = function () { try { if (window.__zombitKameraFn) window.__zombitKameraFn(); } catch (x) {} return alkup.apply(this, arguments); }; }
    if (typeof e.updateRoomCameras === 'function' && !e.__zombitKameraCam) {
      const alkupCam = e.updateRoomCameras; e.__zombitKameraCam = true;
      e.updateRoomCameras = function () { if (window.__zombitKameraAkt && window.__zombitKameraAkt()) return; return alkupCam.apply(this, arguments); };
    }
    return true;
  };
  let kameraKaaritty = false;
  const kameraRuutu = () => { if (kameraSuljettu) return; requestAnimationFrame(kameraRuutu); if (!kameraKaaritty) kameraKaaritty = kameraKaari(); if (!kameraKaaritty) kameraLukitse(); };
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(kameraRuutu);
  const kameraVaihda = () => { kameraPaalla = !kameraPaalla; try { localStorage.setItem(KAMERA_MUISTI, kameraPaalla ? 'on' : 'off'); } catch (x) {} try { ilmoita('Kameralukko ' + (kameraPaalla ? 'päällä' : 'pois') + ' (Alt+K)'); } catch (x) {} lokiin({ kamera: kameraPaalla }); return kameraPaalla; };

  // ---- HUD (vaihe 1c, kp 17:01 "missä se ase selector on"): L4K 1.11.0 #kupla-shooter-hud (shooter :2360-2375 tyylit, :2526-2543 rakenne,
  //   :3168-3179 päivitys) valikoiden: alhaalla keskellä aseslotit 62x62 numeroineen (näppäin = numero), valittu korostettu sinisellä, klikkaus
  //   valitsee. HP-palkki vain kiinnijaanti 'hp' -tilassa (kontakti-tilassa ei HP:ta). K-siru = tämän runin tapot. L4K:n D-sirua ja tapposyötettä
  //   ei ole (yksi pelaaja, kuolema päättää vuoron). LISÄYS (ei L4K:n HUD:ssa, L4K näytti chat-tilan paneelin otsikossa :3167): tilasiru 🎮 PELI / 💬 CHAT.
  //   Näkyy vain vuoron pelaajalle pelin aikana (aseAktiivinen).
  let hudEl = null; const hudO = { slotit: {}, hp: null, hpI: null, hpT: null, k: null, tila: null, kamera: null };
  try { if (document.querySelectorAll) for (const v of document.querySelectorAll('[data-zombit-hud]')) v.remove(); } catch (x) {}
  const tyyli = (el, t) => { if (el && el.style) el.style.cssText = t; return el; };
  const SLOT = 'width:62px;height:62px;border-radius:9px;background:#1b2c45;border:2px solid #0b1320;position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;color:#dce6f2;padding:0;font:inherit;pointer-events:auto';
  const SLOT_ON = SLOT + ';border-color:#8fb6ff;background:linear-gradient(180deg,#3d7be0,#2a5db5);box-shadow:0 0 12px rgba(61,123,224,.7)';
  const SIRU = 'background:rgba(14,24,40,.94);border:2px solid #283f5d;border-radius:8px;padding:3px 9px;font-weight:bold;font-size:12px;text-align:center;min-width:44px';
  const luoHud = () => {
    if (typeof document === 'undefined' || !document.createElement || !document.body) return null;
    const d = t => document.createElement(t), lisaa = (a, b) => { if (a && a.appendChild) a.appendChild(b); return b; };
    const h = tyyli(d('div'), 'position:fixed;left:50%;bottom:92px;transform:translateX(-50%);z-index:99997;display:none;flex-direction:column;align-items:center;gap:6px;font:12px Ubuntu,sans-serif;color:#dce6f2;user-select:none;pointer-events:none');
    if (h.setAttribute) h.setAttribute('data-zombit-hud', String(huone));
    hudO.hp = lisaa(h, tyyli(d('div'), 'width:330px;height:18px;border-radius:9px;background:#0b1320;border:2px solid #283f5d;position:relative;overflow:hidden;box-shadow:0 3px 10px rgba(0,0,0,.5)'));
    hudO.hpI = lisaa(hudO.hp, tyyli(d('i'), 'position:absolute;left:0;top:0;bottom:0;transition:width .15s'));
    hudO.hpT = lisaa(hudO.hp, tyyli(d('span'), 'position:absolute;inset:0;text-align:center;line-height:14px;font-weight:bold;font-size:11px;text-shadow:0 1px 2px #000'));
    const ala = lisaa(h, tyyli(d('div'), 'display:flex;align-items:flex-end;gap:8px'));
    const slotit = lisaa(ala, tyyli(d('div'), 'display:flex;gap:8px;padding:6px;background:rgba(14,24,40,.94);border:2px solid #283f5d;border-radius:12px;box-shadow:0 4px 14px rgba(0,0,0,.55)'));
    ASEJARJ.forEach((w, i) => {
      const A = aseOf(w), b = tyyli(d('button'), SLOT);
      const nro = lisaa(b, tyyli(d('b'), 'position:absolute;left:4px;top:2px;font-size:10px;color:#8ea3bf')); nro.textContent = String(i + 1);
      const ik = lisaa(b, tyyli(d('em'), 'font-style:normal;font-size:26px;line-height:28px')); ik.textContent = A.ikoni || '';
      const ni = lisaa(b, tyyli(d('small'), 'font-size:10px;color:#8ea3bf;margin-top:2px')); ni.textContent = A.nimi || w;
      const seis = ev => { if (ev && ev.stopPropagation) ev.stopPropagation(); };
      for (const t of ['mousedown', 'mouseup', 'pointerdown', 'pointerup']) if (b.addEventListener) b.addEventListener(t, seis);   // L4K :2531
      b.onclick = ev => { seis(ev); valitseAse(w); try { b.blur(); } catch (x) {} };
      hudO.slotit[w] = b; lisaa(slotit, b);
    });
    const kd = lisaa(ala, tyyli(d('div'), 'display:flex;flex-direction:column;gap:4px'));
    hudO.k = lisaa(kd, tyyli(d('div'), SIRU));
    hudO.tila = lisaa(kd, tyyli(d('div'), SIRU));
    hudO.kamera = lisaa(kd, tyyli(d('div'), SIRU + ';font-weight:normal;font-size:10px'));
    return h;
  };
  const hudTila = () => ({ nakyy: aseAktiivinen(), ase: ASETUS.ase.valittu, chat: chatTila, kamera: kameraAktiivinen(), k: omaTapot(), hp: hpTila() ? Math.round(AM.hp) : null,
    tilaTeksti: chatTila ? '💬 CHAT · Esc = peli' : '🎮 PELI · Enter = chat' });
  const hudPaivita = () => {
    const t = hudTila(); tila.hud = t;
    if (!t.nakyy) { if (hudEl && hudEl.style) hudEl.style.display = 'none'; return t; }
    if (!hudEl) hudEl = luoHud(); if (!hudEl) return t;
    if (hudEl.parentNode !== document.body && document.body.appendChild) document.body.appendChild(hudEl);
    if (hudEl.style) hudEl.style.display = 'flex';
    for (const [w, b] of Object.entries(hudO.slotit)) { const css = w === t.ase ? SLOT_ON : SLOT; if (b.style && b.dataset ? b.dataset.on !== String(w === t.ase) : true) { tyyli(b, css); if (b.dataset) b.dataset.on = String(w === t.ase); } }
    if (hudO.hp && hudO.hp.style) hudO.hp.style.display = t.hp == null ? 'none' : '';
    if (t.hp != null && hudO.hpI && hudO.hpI.style) { const os = Math.max(0, Math.min(1, t.hp / hpMax())); hudO.hpI.style.width = os * 100 + '%';
      hudO.hpI.style.background = os > 0.5 ? 'linear-gradient(180deg,#5ee37c,#2fb34f)' : os > 0.25 ? 'linear-gradient(180deg,#ffd75e,#e0a91e)' : 'linear-gradient(180deg,#ff6b6f,#d83a3f)';   // L4K :3175
      if (hudO.hpT) hudO.hpT.textContent = 'HP ' + t.hp + ' / ' + hpMax(); }
    if (hudO.k) hudO.k.textContent = 'K ' + t.k;
    if (hudO.tila) { hudO.tila.textContent = t.tilaTeksti; if (hudO.tila.style) hudO.tila.style.borderColor = t.chat ? '#e0a91e' : '#283f5d'; }
    if (hudO.kamera) hudO.kamera.textContent = '🎥 ' + (t.kamera ? 'seuraa' : 'vapaa') + ' · Alt+K';
    return t;
  };
  // Ohjauksen vaiheen vaihto (L4K vaiheVahti :2241-2246 + gmPelinAjaksi :2104-2107): kun ase tulee käyttöön / poistuu käytöstä, pidetyt napit,
  //   jännitys ja automaattitulitus pois; käyttöön tullessa chat-tila vain jos chat-kentässä on keskeneräistä tekstiä (L4K 1.15.2), muuten peli.
  //   Clientin oma game mode (kuplafix.gameMode) pois pelin ajaksi, EI palauteta (L4K 0.9.5: palautus lähetti joka kirjaimen omana viestinään).
  //   Käsiesine: käyttöön tullessa valittu ase käteen, poistuessa ':handitem 0' (L4K kasiin(0) kuollessa :835).
  let ohjausOli = null;
  const GM_AVAIN = 'kuplafix.gameMode';
  const gmPois = () => { try { if (JSON.parse(localStorage.getItem(GM_AVAIN)) === true) { localStorage.setItem(GM_AVAIN, 'false'); window.dispatchEvent(new StorageEvent('storage', { key: GM_AVAIN })); lokiin({ gameMode: 'pois pelin ajaksi' }); } } catch (x) {} };
  const ohjausVahti = () => {
    const nyt = aseAktiivinen(); if (nyt === ohjausOli) return; const oli = ohjausOli; ohjausOli = nyt;
    pidetyt.clear(); wasdMaali = null; veto = null; autoPois();
    if (nyt) {
      let a = null; try { a = document.activeElement; } catch (x) {}
      if (onKentta(a) && String(a.value || a.textContent || '').trim()) chatTila = true; else chatPois();
      gmPois(); kasiin(aseNyt().kasi);
    } else { chatTila = false; if (oli !== null) kasiin(0); }
    hudPaivita();
  };

  // ---- julkaisu tulostaululle (811.js voi lukea myöhemmin): window.__zombi811
  const GLOBAALI = '__zombi' + huone;
  const julkaise = () => {
    const id = omaId(), p = AM.pisteet[id] || { tapot: 0, lapi: 0, run: 1 };
    const pel = {}; for (const [k, q] of Object.entries(AM.pisteet)) pel[k] = { nimi: q.nimi, tapot: q.tapot, lapi: !!q.lapi, run: q.run };
    window[GLOBAALI] = {
      versio: 1, huone, raja: raja(), pelaaja: id, tapot: omaTapot(), vahvistetut: p.tapot, lapi: !!p.lapi || omaTapot() >= raja(), run: p.run,
      pelaajat: pel, tulokset: AM.tulokset.map(t => Object.assign({}, t)), ase: aseAktiivinen(), aseNimi: ASETUS.ase.valittu,
      aalto: ASETUS.aallot ? { n: AM.aalto.n, zombeja: AM.aalto.k, jaljella: Math.max(0, AM.aalto.k - AM.aalto.ku), tauko: !!AM.aalto.tauko } : null,
      kiinnijaanti: ASETUS.kiinnijaanti, hp: Math.round(AM.hp), hpMax: hpMax(), rooli: auktoriteetti() ? 'auktoriteetti' : 'seuraaja',
      safeHouse: ASETUS.safeHouse ? (() => { const S = safeHouseTila() || {}; return { hp: S.hp, max: S.max, iskut: S.iskut, iskee: (SAILO.zombit || []).filter(z => z && z.safe === 'iskee' && z.kuoli < 0 && z.kohdeId == null).length }; })() : null,
      aidat: ASETUS.aidat ? (() => { const A = aitaTila() || {}; return { palat: (A.palat || []).map(p => ({ id: p.id, x: p.x, y: p.y, hp: p.hp })), iskut: A.iskut, tuhoutuneet: Array.from(A.tuhoutuneetIds || []) }; })() : null,   // vaihe 1c
      // 811 vuoro: kuka pelaa, vaihe, laskuri (5..1) ja pisteet; teksti = mitä kerros näyttää. null jos huoneessa ei ole vuoroja.
      vuoro: ASETUS.vuoro ? (VT.vu ? { pelaaja: VT.vu.id, nimi: VT.vu.nimi, vaihe: VT.vu.vaihe ? 'peli' : 'laskenta', laskuri: VT.vu.vaihe ? 0 : Math.max(1, Math.min(5, Math.ceil((VT.vu.alku - Date.now()) / 1000))),
        pisteet: VT.vu.id === id ? omaTapot() : ((AM.pisteet[VT.vu.id] || {}).tapot | 0), oma: VT.vu.id === id, nro: VT.vu.nro, tapa: VT.vu.tapa, teksti: VT.naytto || '' }
        : { pelaaja: null, vaihe: null, viimeinen: VT.viimeinen ? Object.assign({}, VT.viimeinen) : null, nro: VT.nro }) : null,
    };
    vuoroNaytto();
    ohjausVahti(); hudPaivita();
  };
  const sulje = () => {
    kameraSuljettu = true; if (window.__zombitKameraFn === kameraLukitse) { window.__zombitKameraFn = null; window.__zombitKameraAkt = null; }   // kääre jää, mutta ei tee mitään
    if (hudEl && hudEl.remove) hudEl.remove();
    clearInterval(wasdAjastin); clearInterval(katseAjastin); autoPois();
    removeEventListener('keydown', nappain, true); removeEventListener('keyup', nosto, true); removeEventListener('blur', blur);
    for (const t of HIIRI_T) removeEventListener(t, hiiri, true);
    for (const r of ruumiit.values()) { try { e.removeRoomObjectUser(huone, r.g); } catch (x) {} SAILO.piirretytIdt.delete(r.g); }
    ruumiit.clear();
    for (const n of valahdys.keys()) { const g = piirretyt.get(n); if (g != null) savyta(g, 0xffffff); }
    for (const id of shPalat.keys()) shSavy(id, 0xffffff); shPalat.clear();
    if (jkanvas && jkanvas.remove) jkanvas.remove();
    if (vEl && vEl.remove) vEl.remove();
    if (window[GLOBAALI] && window[GLOBAALI].huone === huone) delete window[GLOBAALI];
  };
  return { aaltoTick, aalto: () => AM.aalto, kasittele, vastaanota, katseSaapui, laukauksetSaapui, pidaPaikallinen, omaksu, snapLisaa, pelaajaKuoli, omaKuolema, piirto, piilossa, piirtoPaikat, julkaise, sulje,
    ammu, ammuSuuntaan, asetaAse, ase: () => aseOn, valitseAse, aseNyt, runLoppu, tilasto, AM, auktoriteetti, luodit: () => luodit.length, jaljet: () => jaljet.length,
    purema, paranna, kontaktiKerroin, nollaaKontakti, hp: () => AM.hp, wasd: { pidetyt, tick: wasdTick, nappain, nosto }, hiiri,
    vuoroTick, vuoroPyyda, vuoroVastaanota, vuoro: () => VT.vu, VT, vuoroSallii, aseKaytossa: aseAktiivinen, vuoroTeksti,
    omaHpPalkki, safeHouseHpPalkki, gateHpPalkit,
    katse: { tick: katseTick, kulma: hiirenKulma },
    este: { esteMatka, esteKartta, peitossa, peittoLaatikot, lentoZ, kamera },   // kohde 1 (testausta varten, kuten shooter :1018 __kshEste)
    // vaihe 1c
    hpPalkit, kasiin, kasi: () => AM.kasiNyt, kameraAktiivinen, kameraLukitse, kameraVaihda, hudPaivita, hudTila, chat: () => chatTila, vaihdaAse };
})();
tila.ammunta = AMMUNTA;
// Diagnostiikka pelaajan konsoliin: window.zombit.omaTila() -> miksi oma välkky ei johda kuolemaan
tila.omaTila = () => {
  const id = omaId(), omaI = omaIndeksi(), nyt = Date.now();
  let pI = null; try { const P = pelaajat(); const p = (P || []).find(q => q && q.id === id); pI = p ? p.i : null; } catch (x) {}
  const kontaktit = [];
  for (const z of (tila.zombit || []).concat(tila.muuttuneet || [])) { const t = z && z.kontaktit && z.kontaktit[id]; if (t) kontaktit.push({ n: z.n, ms: Math.round(t.ms), raja: t.rajaMs, et: t.et }); }
  const ti = SYNK.tiedot();
  return { omaId: id, omaI, pI, indeksiOk: omaI === pI, kohde: onKohde({ id }), este: kuolemaEste(nyt), viimeSyy: omaSyy, viimeSyyIka: omaSyy ? nyt - omaSyyMs : null,
    hyppy: liike(id).hyppy, kontaktit, kuolemat: tila.kuolemat, virheet: tila.virheet, ajastinElossa: tila.virheet <= 50, rooli: ti.rooli, viimeKEro: ti.viimeKEro };
};

// ---- kello
const ALKU = Date.now(), ARMO = 6000;   // käynnistyksen jälkeen 6 s armoaika
const tiki = () => {
  const nyt = Date.now(), tikki = Math.max(50, Number(ASETUS.tikki) || 250), k = Math.floor(nyt / tikki), e1 = Math.floor(nyt / ASETUS.epookki);
  if (!ruudukko) { ruudukko = rakenna(); if (!ruudukko || !ruudukko.ruudut.length || !valmistele()) { ruudukko = null; return; } }
  koukku();
  const P = pelaajat();
  paivitaLammikot(P);
  if (AMMUNTA) AMMUNTA.vuoroTick(P, k);   // 811 vuoro: ennen zombimäärää ja askelia -> ASETUS.kohteet (vain vuoron pelaaja) on voimassa tämän tikin askelissa
  const maxKirittava = Math.max(30, Math.round(30000 / tikki));
  if (!Array.isArray(SAILO.zombit) || (!SAILO.zombit.length && !ASETUS.aallot) || SAILO.E < 0) {   // 811 aallot: tyhjä lista on laillinen tila (aaltojen välissä)
    SAILO.E = e1;
    tila.zombit = SAILO.zombit = synny(e1, P, k);
    paivitaLammikot(P);
    historia.clear();
    SAILO.K = k - 1;
    lokiin({ epookki: e1, syntyi: tila.zombit.map(z => z.x + ',' + z.y).join(' '), ovi: ruudukko.ovi });
  } else {
    if (tila.zombit !== SAILO.zombit) {
      tila.zombit = SAILO.zombit;
      // kp 19:11: Päivityksen yhteydessä ei saa laukaista vanhaa kiinnijääntiä/zk684:ää (omaViimeSyoK alustetaan nykyiseen SAILO.K-arvoon)
      omaViimeSyoK = SAILO.K;
      lokiin({ jatkettu: SAILO.K });
    }
    if (k - SAILO.K >= maxKirittava) {
      const ohitettuMs = (k - 1 - SAILO.K) * tikki;
      const siirraSynty = ohitettuMs >= Math.max(300000, (Number(ASETUS.epookki) || 1800000) * 0.5);
      for (const z of SAILO.zombit.concat(SAILO.muuttuneet)) {
        if (!z) continue;
        if (siirraSynty && z.syntyMs != null) z.syntyMs += ohitettuMs;
        if (z.viimeAskelMs != null) z.viimeAskelMs += ohitettuMs;
        if (z.seuraavaAskelMs != null) z.seuraavaAskelMs += ohitettuMs;
        if (z.vTaukoAsti > 0) z.vTaukoAsti += ohitettuMs;
        if (z.reaktioAsti > 0) z.reaktioAsti += ohitettuMs;
      }
      SAILO.K = k - 1;
    }
    if (SAILO.E !== e1) {
      SAILO.E = e1;
      if (!SYNK.seuraa() && !ASETUS.aallot) for (const z of SAILO.zombit) if (z && !z.muuttunut) z.odottaaSynkkaa = e1;   // synkka: seuraaja ei aloita omaa epookkisynkkaa
      synkkaaPimeatZombit(SAILO.zombit, P, Math.max(k, SAILO.K));
      lokiin({
        epookki: e1,
        valaistut: tila.zombit.filter(z => z.odottaaSynkkaa != null).map(z => z.n),
        synkatut: tila.zombit.filter(z => z.odottaaSynkkaa == null).map(z => z.n),
        muuttuneita: SAILO.muuttuneet.length,
        lammikoita: SAILO.lammikot.length,
      });
    } else if (SAILO.zombit.some(z => z && z.odottaaSynkkaa != null)) {
      synkkaaPimeatZombit(SAILO.zombit, P, Math.max(k, SAILO.K));
    }
    sopeutaMaara(SAILO.zombit, P, Math.max(k, SAILO.K));
  }
  while (SAILO.K < k) { SAILO.K++; tila.kohde = askel(SAILO.K, tila.zombit, P); }
  if (AMMUNTA) AMMUNTA.kasittele(P, SAILO.K);   // 811: osumat (auktoriteetti hyväksyy / seuraaja ennustaa + lähettää) ennen snapshotia
  SYNK.kasitteleKuolemat(P, SAILO.K);   // kuolemaviestit ENNEN snapshotia: makuu + syöjän pysäytys on jo voimassa kun johtajan tila omaksutaan (paikallinenSyo suojaa)
  SYNK.kasitteleSnap(P, SAILO.K);   // synkka: johtajan snapshot omaksutaan catch-upin JÄLKEEN (muuten uusi tila ajettaisiin vielä kerran eteenpäin)
  paivitaMakaavat(P, SAILO.K * tikki);
  tila.k = SAILO.K;
  if (AMMUNTA) AMMUNTA.julkaise();
};
let rafKaynnissa = true;
const kehys = () => { if (!rafKaynnissa) return; try { if (ruudukko) piirra(); } catch (x) {} requestAnimationFrame(kehys); };
requestAnimationFrame(kehys);
const ajastin = setInterval(() => {
  try { tiki(); if (ruudukko) tarkistaOma(); }
  catch (x) { tila.virheet++; lokiin({ virhe: String(x && x.stack || x).slice(0, 300) }); if (tila.virheet > 50) clearInterval(ajastin); }
}, 100);
const uusiKartta = setInterval(() => { try { if (ruudukko) { const r = rakenna(); if (r && r.ruudut.length) ruudukko = r; } } catch (x) {} }, 5000);
SYNK.kaynnista();   // synkka: kanavan valinta (kuplaScripts / WebSocket-vara) + snapshot/hei-ajastin (purkautuu return-siivouksessa)

// ---- :safe (vain ASETUS.turvassa-listalla oleville; rivi ei lähde palvelimelle)
const KENTTA = 'input.nitro-chat-input-control', KOMENTO = /^:(?:safe|kuolematon)(?:\s+(pois|päälle|paalle|on|off))?$/i;
const kuule = ev => {
  if (ev.key !== 'Enter' && ev.key !== 'NumpadEnter') return;
  const el = ev.target; if (!(el instanceof HTMLInputElement) || !el.matches(KENTTA)) return;
  const mv = AMMUNTA && ASETUS.vuoro && /^:(aloita ?peli|peli ?aloitus|lopeta ?peli)$/i.exec((el.value || '').trim());
  if (mv) {   // 811 (kp 16:43): käsky aloittaa pelin kirjoittajalle / lopettaa käynnissä olevan. Sallittu ASETUS.vuoro.kasky-listalla; rivi ei lähde palvelimelle.
    ev.preventDefault(); ev.stopImmediatePropagation();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ''); el.dispatchEvent(new Event('input', { bubbles: true }));
    const q = /^lopeta/i.test(mv[1]) ? 'lopeta' : 'aloita', l = ASETUS.vuoro.kasky;   // kp 18:56, 19:17 kirjoitti :pelialoitus ja :aloita peli
    if (Array.isArray(l) && !l.includes(omaId())) { ilmoita(':' + mv[1] + ' ei ole sallittu sinulle'); return; }
    const vu = AMMUNTA.vuoro();
    if (q === 'aloita' && vu) { ilmoita('Peli on jo käynnissä: ' + (vu.nimi || vu.id)); return; }
    if (q === 'lopeta' && !vu) { ilmoita('Peliä ei ole käynnissä'); return; }
    ilmoita(AMMUNTA.vuoroPyyda(q) ? (q === 'aloita' ? 'Peli alkaa...' : 'Peli lopetetaan') : 'Pyyntö ei lähtenyt (ei kanavaa)'); return;
  }
  const ma = AMMUNTA && /^:ase(?:\s+(pois|päälle|paalle|on|off))?$/i.exec((el.value || '').trim());
  if (ma) {   // 811: ase (WASD + hiiriammunta) päälle/pois tälle clientille, kaikille sallittu (katsoja voi kävellä klikkaamalla); rivi ei lähde palvelimelle
    ev.preventDefault(); ev.stopImmediatePropagation();
    const s = (ma[1] || '').toLowerCase(), on = AMMUNTA.asetaAse(s ? !(s === 'pois' || s === 'off') : !AMMUNTA.ase());
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ''); el.dispatchEvent(new Event('input', { bubbles: true }));
    ilmoita(on ? ':ase päällä: WASD liikkuu, hiiri ampuu (1 pistooli, 2 jousi, 3 miekka)' : ':ase pois: klikkaus kävelee'); return;
  }
  const m = KOMENTO.exec((el.value || '').trim()); if (!m || !saaSafe()) return;
  ev.preventDefault(); ev.stopImmediatePropagation();
  const s = (m[1] || '').toLowerCase(), uusi = s ? !(s === 'pois' || s === 'off') : !safe;
  tila.safe(uusi); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ''); el.dispatchEvent(new Event('input', { bubbles: true }));
  ilmoita(uusi ? ':kuolematon päällä: zombit eivät tapa sinua' : ':kuolematon pois: zombit tappavat');
};
addEventListener('keydown', kuule, true); tila._kuule = kuule;
lokiin({ alku: huone, safe: safe && saaSafe() });

return () => {
  rafKaynnissa = false; clearInterval(ajastin); clearInterval(uusiKartta); removeEventListener('keydown', kuule, true);
  try { if (AMMUNTA) AMMUNTA.sulje(); } catch (x) {}   // 811: näppäin/hiiri-kuuntelijat, WASD-ajastin, ruumiit, jälkikanvas, window.__zombi811
  try { SYNK.sulje(); } catch (x) {}   // synkka: kuplaScripts off()+unsubscribe, WebSocket, uudelleenyhdistys- ja snapshot-ajastimet
  if (vayla && typeof vayla.removeEventListener === 'function') vayla.removeEventListener('RSCE_CHAT_EVENT', kuuleChat);
  if (vayla && typeof vayla.removeEventListener === 'function') vayla.removeEventListener('RSCE_CHAT_EVENT', kuuleMaali);
  if (lammikkoKanvas && lammikkoKanvas.remove) lammikkoKanvas.remove();
  try {
    if (typeof document !== 'undefined' && document.querySelectorAll) {
      for (const v of document.querySelectorAll('[data-zombit-kuolit]')) if (v && v.remove) v.remove();
    }
  } catch (x) {}
  kuplaVahti.disconnect();
  puraKavelyEsto();
  for (const id of savytetyt.keys()) savyta(id, 0xffffff); savytetyt.clear();
  if (odottavaKuolema) { const k = odottavaKuolema; odottavaKuolema = null; clearTimeout(k.aj); try { k.laheta(); } catch (x) {} }   // ei jätetä kuolemaa lähtemättä
  for (const a of kuplaAjastimet) clearTimeout(a); kuplaAjastimet.clear();
  for (const a of makuuAjastimet) clearTimeout(a); makuuAjastimet.clear();
  try {
    if (koukkuYhteys && koukkuYhteys.handleMessages === koukkuOma) {
      if (koukkuAlkup === Object.getPrototypeOf(koukkuYhteys).handleMessages) delete koukkuYhteys.handleMessages;
      else koukkuYhteys.handleMessages = koukkuAlkup;
    }
  } catch (x) {}
  for (const g of piirretyt.values()) {
    try { e.removeRoomObjectUser(huone, g); } catch (x) {}
    SAILO.piirretytIdt.delete(g);
  }
  piirretyt.clear();
  try {
    for (const g of SAILO.piirretytIdt) try { e.removeRoomObjectUser(huone, g); } catch (x) {}
    SAILO.piirretytIdt.clear();
  } catch (x) {}
  if (window.zombit === tila) delete window.zombit;
};
