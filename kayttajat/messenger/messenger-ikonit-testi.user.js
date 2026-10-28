// ==UserScript==
// @name         kupla: Messenger-ikonit testi (salama Skriptit-välilehdelle, Toiminto- ja Osoita-napeille)
// @namespace    kupla
// @version      0.1.7
// @description  ESIKATSELU: Skriptit-välilehden [+] vaihtuu salama-ikoniksi, chatin Toiminto- ja Osoita-napit saavat ikonin (hover-teksti säilyy). Valinnat localStorage: 'ikonit-salama' = keltainen | valkoinen (oletus keltainen), 'ikonit-osoita' = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 (oletus 9 = hiiren osoitin, 8 = tähtäin). Valinta luetaan latauksessa.
// @match        https://kupla.cc/*
// @grant        none
// @run-at       document-idle
// @kupla-oletus on
// @kupla-ryhma  Testattavat
// ==/UserScript==
// kp 2026-10-28 14:13 "skriptit tabiin salama icon jos asseteista löytyy ... emojeiden käyttöä pitäs välttää koska device kohtasta miltä näyttää. eli nyt skriptit tabissa on vaa toi +"
// kp 2026-10-28 14:14 "chat näkymään: Toiminto napin tilalle tulis se sama salama. osoita napin tilallekin kun sais jonkun symbolin niin ois tosi kova. napeissa hover teksti kertoo mitä ne on."
(() => {
  if (window.__kuplaMessengerIkonit) return;
  // Kuvat base64-data-URI:na. Lähteet ja koot kommentoitu.
  // Salama 13x17: Nitro_Render_V3/packages/assets/src/assets/variablefx/images/variablefx_icon_energy.png
  const SALAMA = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAA0AAAARCAYAAAAG/yacAAAA6klEQVR4nJWSMU7EMBBF32TDcgAkToBEsyfgFLSrrbkJt6HiEumRkGg4QSg4QOz5FE6cODERjDSFR36eP39skliGmZWFRUgygHYN+HBJh++XXI9d4OrR87mpPlkBpi4ANskzM3l/LNjYBYANtO1087YL5JlylxEAONxBc/KsophdUoLiR6r4c3U2APpAc3LawrEJWF0eXpPU66ck1YDZgD4QP+HwMG8idgH/mgEAAwq9/t7AbbtrRiPJpgTg/lxIq7lXXy71pW6gpSF7AACSGH+FfLjI+6NSWfyW/wZK6I+ApPlHjFLrM6ziByLF96xTOaWeAAAAAElFTkSuQmCC';
  // Osoita 1 (30x22): DarkUI/src/assets/images/stackhelper/slider-pointer.png (selkeä osoitinnuoli)
  // Osoita 2 (21x21): DarkUI/src/assets/images/friends/swf/friendlist_go_room.png (mene huoneeseen)
  // Osoita 3 (17x15): DarkUI/src/assets/images/icons/arrows.png (kaksoisnuoli)
  const OSOITA = {
    '1': { url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAB4AAAAWCAYAAADXYyzPAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAEKSURBVHgBtZVdDkQwFIVvx2wFGxCrsRx2It5tA+/EYqaTI9NOI/1L9Z5EUNqvX12poH8k5QnGeYVeEsbLOROEv8iASikfHeM4kiH0CYE19Gnquo6G46E0wdu2UWrO87zOZVlS27aq2brswSJIiRCClmXRt2Qxf7s6N01DsbGtkoL/zBVci7IYI5i4z9xpPE0TxaaqKnLBsRo2czZjE24zdxq7LFLhMMev1nXd1cZujKjiO45Dt7FV9f3ZPM/U971qlqzGDiiKq2Crah8UF6zGLijCVtU+KJLNWG0QMVBEG6tvYg6Qkn3fg1BEb4vIuq7XbFODrXUYhiBUga8+lDdeqAl+Cpe36yLU4Qs9DrW9Qz1PLgAAAABJRU5ErkJggg==', w: 30, h: 22 },
    '2': { url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABUAAAAVCAYAAACpF6WWAAAAsUlEQVR4Aa3SMQ5BURBAUbZhGcQOtFRsRqGwDIXKMqxCr7MDCxgZyS3eSCaX+MltvpmTF+9Pmidc/onVYhb77fLd+bAZ4n3OABuQpTYLgzLcVuY8auda8EeUPrHHdZoxoKt7A5p/PD/mLZtAc7eivAT3lb2K0nAKeWp2C1pA0ONtXWCHRlei9+cJ2KO7yzyXmwos0VwSATvUxA07tEmA4vaJAQF+/UkJ0KMkQIeKJPrPXtqypx4Uaf0FAAAAAElFTkSuQmCC', w: 21, h: 21 },
    '3': { url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABEAAAAPCAYAAAACsSQRAAAACXBIWXMAAA7DAAAOwwHHb6hkAAAAkElEQVR42mN4+fIhAwgDwX8YGx3jkwPLwxQ59Kz/j00xPjkkNRBFidvuYijGJ4fVJWYV03EahEsOxZB161b8x6UYnxyKIZQahOIsmGJYOIA0oRuETQ5rTCArAmkmKEfIAFwugMmB5dFjAJsBuOSQXEmZARjpBIcteA3ASCfYFOGTw5pOcCnCJ4c1neDKZPjkAAIsY7DeQ9VOAAAAAElFTkSuQmCC', w: 17, h: 15 },
    // Osoita 4 (30x26): https://kupla.cc/swf/dcr/hof_furni/icons/antique_c21_magnifyinglass_icon.png (Todistusaineisto, suurennuslasi)
    '4': { url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAB4AAAAaCAYAAACgoey0AAABiElEQVR42u2WsUoDQRCG7x1E8B1sfADBt0hrJVhYpJFAkDQiCIEUIlgIgqJN2pDCSgsbG1FQU9hYiIgIlhYWG2Zg9v6dm3XvNHeVCz+TO8J+/7+7c3dZVm04pdoHg54nF4HqNOCBH68Prr+zybVOAzyRQKTuDbYZfns95ntafzEQJMR0CCADpFkYKCSkSTUgdm3ByxgI9guXtWzClGIG3OfbHUsvqdZP6YbHu4Gx/cGW63Y2uMYM+BvfX++sFBgNaiCJgOfjobu/ueRK13hmBO4TGw8I83STLCCmJagkpt/G0uep11bmWP3WQiCEnxx0Wal9JSCljSx1DhaoTitGsM30WZDkVK2VwJXDxAH0dPLitX70WIDLIbT2mWoJYJ5WJkUgaan95OHyH90FViekgCYYoYuroyC1QNEAdYHAywILYA3FxLj/sS6o+sgM9lDgIjEG4CyVuNLLAeEoBXV1fBiYPSxQI/XsX/yWBHrYm2/ss8ebIujV2fI/vHm46u/m4KoFGx2/hk4BN9dMTRfEf4MAAAAASUVORK5CYII=', w: 30, h: 26 },
    // Osoita 5 (30x30): https://kupla.cc/swf/dcr/hof_furni/icons/fantasy_c22_trainingtarget_icon.png (Maalitaulu, tähtäin)
    '5': { url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAB4AAAAeCAYAAAA7MK6iAAAB1UlEQVR42r1Xu23DUAz0BkZmEJANAjcpMoELA0GaTOHSVSYw4kXcZYgskS5zKHgCzrh370h9LMQAIct+4vGOfHzUZjPv04/Yqp+b45/vj8r633P/dX693a8ZROW4WLkvgBoEApEglrF0DjPTIOeyTx0+PB6suWcQ8BRw+yADPB0ug70dr8O1ez4O1yyIKeDNAwwGA5gGAQM4F18GbJkCiJ2/bLeVuaAccwc+iSmATrtd/7nf9+9dN3znADhAgGf5bgpI5QNgZsw+Yt4Ac05YYoCCXbmq1PhPwUvwmm8GTmVmaeFY17MaCGxKrqu9qrllpwyq7ZID1HwXn66rVd3JsWXQrIvpeqSr+ESQ5fkKGKzLIpdbAMOB+w3rmbXKzXmu5OOKLg9HuQU7VkEZY/9zgVVSc764oiOp9TDIpNb93OQ4ahxRcWkQEdvR4opaJeTWXEdMx9hqE2lYa29Wx2zYv657cWFxRdvjMOrT2qPZtJKdzNq5ql7NckenEoNxC436dCSzZa2FxmewOxbxPzOdMww03QngPHGwCu5ej0Mn8eLRR6eQe0cfe1qp/NGwx8GO5TUdb7lBsPzZbG22zrL5OhvmOYe6bpW3CR3wo179L+9R9760/QG4I0ipWvW7lAAAAABJRU5ErkJggg==', w: 30, h: 30 },
    // Osoita 6 (30x18): https://kupla.cc/swf/dcr/hof_furni/icons/hween_c25_arrow_icon.png (Arrow, nuoli)
    '6': { url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAB4AAAASCAYAAABM8m7ZAAAAiUlEQVR42mNgwAT/kTBdwf9fP5+AMb0d8P/06W1gjOYA2loKwzDLYQ6gheVwy2aWxPw/vbANjNEdQAvLwYaCDCfkAJpYDLOckANoEtyjDsBiON0cgNdhQ8EBNHMUIQf8r2/rpmmI4HQArS3G6gCYxXS1HGbp9PnLwJjWFv8PjY7DwDAH0Dyu8WEAG7A2Yy/RYdoAAAAASUVORK5CYII=', w: 30, h: 18 },
    // Osoita 7 (18x28): https://kupla.cc/swf/dcr/hof_furni/icons/circus_c24_cardhand_icon.png (Pelikäsi, käsi)
    '8': { url: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxNSIgaGVpZ2h0PSIxNSIgdmlld0JveD0iMCAwIDE1IDE1IiBzaGFwZS1yZW5kZXJpbmc9ImNyaXNwRWRnZXMiPjxyZWN0IHg9IjUiIHk9IjIiIHdpZHRoPSIxIiBoZWlnaHQ9IjEiIGZpbGw9IiNkOGQ4ZDgiLz48cmVjdCB4PSI2IiB5PSIyIiB3aWR0aD0iMSIgaGVpZ2h0PSIxIiBmaWxsPSIjZDhkOGQ4Ii8+PHJlY3QgeD0iNyIgeT0iMiIgd2lkdGg9IjEiIGhlaWdodD0iMSIgZmlsbD0iI2Q4ZDhkOCIvPjxyZWN0IHg9IjgiIHk9IjIiIHdpZHRoPSIxIiBoZWlnaHQ9IjEiIGZpbGw9IiNkOGQ4ZDgiLz48cmVjdCB4PSI5IiB5PSIyIiB3aWR0aD0iMSIgaGVpZ2h0PSIxIiBmaWxsPSIjZDhkOGQ4Ii8+PHJlY3QgeD0iNCIgeT0iMyIgd2lkdGg9IjEiIGhlaWdodD0iMSIgZmlsbD0iI2Q4ZDhkOCIvPjxyZWN0IHg9IjEwIiB5PSIzIiB3aWR0aD0iMSIgaGVpZ2h0PSIxIiBmaWxsPSIjZDhkOGQ4Ii8+PHJlY3QgeD0iMyIgeT0iNCIgd2lkdGg9IjEiIGhlaWdodD0iMSIgZmlsbD0iI2Q4ZDhkOCIvPjxyZWN0IHg9IjExIiB5PSI0IiB3aWR0aD0iMSIgaGVpZ2h0PSIxIiBmaWxsPSIjZDhkOGQ4Ii8+PHJlY3QgeD0iMiIgeT0iNSIgd2lkdGg9IjEiIGhlaWdodD0iMSIgZmlsbD0iI2Q4ZDhkOCIvPjxyZWN0IHg9IjEyIiB5PSI1IiB3aWR0aD0iMSIgaGVpZ2h0PSIxIiBmaWxsPSIjZDhkOGQ4Ii8+PHJlY3QgeD0iMiIgeT0iNiIgd2lkdGg9IjEiIGhlaWdodD0iMSIgZmlsbD0iI2Q4ZDhkOCIvPjxyZWN0IHg9IjEyIiB5PSI2IiB3aWR0aD0iMSIgaGVpZ2h0PSIxIiBmaWxsPSIjZDhkOGQ4Ii8+PHJlY3QgeD0iMiIgeT0iNyIgd2lkdGg9IjEiIGhlaWdodD0iMSIgZmlsbD0iI2Q4ZDhkOCIvPjxyZWN0IHg9IjEyIiB5PSI3IiB3aWR0aD0iMSIgaGVpZ2h0PSIxIiBmaWxsPSIjZDhkOGQ4Ii8+PHJlY3QgeD0iMiIgeT0iOCIgd2lkdGg9IjEiIGhlaWdodD0iMSIgZmlsbD0iI2Q4ZDhkOCIvPjxyZWN0IHg9IjEyIiB5PSI4IiB3aWR0aD0iMSIgaGVpZ2h0PSIxIiBmaWxsPSIjZDhkOGQ4Ii8+PHJlY3QgeD0iMiIgeT0iOSIgd2lkdGg9IjEiIGhlaWdodD0iMSIgZmlsbD0iI2Q4ZDhkOCIvPjxyZWN0IHg9IjEyIiB5PSI5IiB3aWR0aD0iMSIgaGVpZ2h0PSIxIiBmaWxsPSIjZDhkOGQ4Ii8+PHJlY3QgeD0iMyIgeT0iMTAiIHdpZHRoPSIxIiBoZWlnaHQ9IjEiIGZpbGw9IiNkOGQ4ZDgiLz48cmVjdCB4PSIxMSIgeT0iMTAiIHdpZHRoPSIxIiBoZWlnaHQ9IjEiIGZpbGw9IiNkOGQ4ZDgiLz48cmVjdCB4PSI0IiB5PSIxMSIgd2lkdGg9IjEiIGhlaWdodD0iMSIgZmlsbD0iI2Q4ZDhkOCIvPjxyZWN0IHg9IjEwIiB5PSIxMSIgd2lkdGg9IjEiIGhlaWdodD0iMSIgZmlsbD0iI2Q4ZDhkOCIvPjxyZWN0IHg9IjUiIHk9IjEyIiB3aWR0aD0iMSIgaGVpZ2h0PSIxIiBmaWxsPSIjZDhkOGQ4Ii8+PHJlY3QgeD0iNiIgeT0iMTIiIHdpZHRoPSIxIiBoZWlnaHQ9IjEiIGZpbGw9IiNkOGQ4ZDgiLz48cmVjdCB4PSI3IiB5PSIxMiIgd2lkdGg9IjEiIGhlaWdodD0iMSIgZmlsbD0iI2Q4ZDhkOCIvPjxyZWN0IHg9IjgiIHk9IjEyIiB3aWR0aD0iMSIgaGVpZ2h0PSIxIiBmaWxsPSIjZDhkOGQ4Ii8+PHJlY3QgeD0iOSIgeT0iMTIiIHdpZHRoPSIxIiBoZWlnaHQ9IjEiIGZpbGw9IiNkOGQ4ZDgiLz48cmVjdCB4PSI3IiB5PSIwIiB3aWR0aD0iMSIgaGVpZ2h0PSIxIiBmaWxsPSIjZDhkOGQ4Ii8+PHJlY3QgeD0iMCIgeT0iNyIgd2lkdGg9IjEiIGhlaWdodD0iMSIgZmlsbD0iI2Q4ZDhkOCIvPjxyZWN0IHg9IjciIHk9IjEiIHdpZHRoPSIxIiBoZWlnaHQ9IjEiIGZpbGw9IiNkOGQ4ZDgiLz48cmVjdCB4PSIxIiB5PSI3IiB3aWR0aD0iMSIgaGVpZ2h0PSIxIiBmaWxsPSIjZDhkOGQ4Ii8+PHJlY3QgeD0iNyIgeT0iMyIgd2lkdGg9IjEiIGhlaWdodD0iMSIgZmlsbD0iI2Q4ZDhkOCIvPjxyZWN0IHg9IjMiIHk9IjciIHdpZHRoPSIxIiBoZWlnaHQ9IjEiIGZpbGw9IiNkOGQ4ZDgiLz48cmVjdCB4PSI3IiB5PSI0IiB3aWR0aD0iMSIgaGVpZ2h0PSIxIiBmaWxsPSIjZDhkOGQ4Ii8+PHJlY3QgeD0iNCIgeT0iNyIgd2lkdGg9IjEiIGhlaWdodD0iMSIgZmlsbD0iI2Q4ZDhkOCIvPjxyZWN0IHg9IjciIHk9IjEwIiB3aWR0aD0iMSIgaGVpZ2h0PSIxIiBmaWxsPSIjZDhkOGQ4Ii8+PHJlY3QgeD0iMTAiIHk9IjciIHdpZHRoPSIxIiBoZWlnaHQ9IjEiIGZpbGw9IiNkOGQ4ZDgiLz48cmVjdCB4PSI3IiB5PSIxMSIgd2lkdGg9IjEiIGhlaWdodD0iMSIgZmlsbD0iI2Q4ZDhkOCIvPjxyZWN0IHg9IjExIiB5PSI3IiB3aWR0aD0iMSIgaGVpZ2h0PSIxIiBmaWxsPSIjZDhkOGQ4Ii8+PHJlY3QgeD0iNyIgeT0iMTMiIHdpZHRoPSIxIiBoZWlnaHQ9IjEiIGZpbGw9IiNkOGQ4ZDgiLz48cmVjdCB4PSIxMyIgeT0iNyIgd2lkdGg9IjEiIGhlaWdodD0iMSIgZmlsbD0iI2Q4ZDhkOCIvPjxyZWN0IHg9IjciIHk9IjE0IiB3aWR0aD0iMSIgaGVpZ2h0PSIxIiBmaWxsPSIjZDhkOGQ4Ii8+PHJlY3QgeD0iMTQiIHk9IjciIHdpZHRoPSIxIiBoZWlnaHQ9IjEiIGZpbGw9IiNkOGQ4ZDgiLz48cmVjdCB4PSI3IiB5PSI3IiB3aWR0aD0iMSIgaGVpZ2h0PSIxIiBmaWxsPSIjZDhkOGQ4Ii8+PC9zdmc+', w: 15, h: 15 },
    // Osoita 8 (15x15): itse piirretty pikseli-SVG, tähtäin (rengas + viivat), #d8d8d8 (kp 15:02 "oisko vaikka crosshair")
    '9': { url: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMSIgaGVpZ2h0PSIxNyIgdmlld0JveD0iMCAwIDExIDE3IiBzaGFwZS1yZW5kZXJpbmc9ImNyaXNwRWRnZXMiPjxyZWN0IHg9IjAiIHk9IjAiIHdpZHRoPSIxIiBoZWlnaHQ9IjEiIGZpbGw9IiMwMDAiLz48cmVjdCB4PSIwIiB5PSIxIiB3aWR0aD0iMSIgaGVpZ2h0PSIxIiBmaWxsPSIjMDAwIi8+PHJlY3QgeD0iMSIgeT0iMSIgd2lkdGg9IjEiIGhlaWdodD0iMSIgZmlsbD0iIzAwMCIvPjxyZWN0IHg9IjAiIHk9IjIiIHdpZHRoPSIxIiBoZWlnaHQ9IjEiIGZpbGw9IiMwMDAiLz48cmVjdCB4PSIxIiB5PSIyIiB3aWR0aD0iMSIgaGVpZ2h0PSIxIiBmaWxsPSIjZmZmIi8+PHJlY3QgeD0iMiIgeT0iMiIgd2lkdGg9IjEiIGhlaWdodD0iMSIgZmlsbD0iIzAwMCIvPjxyZWN0IHg9IjAiIHk9IjMiIHdpZHRoPSIxIiBoZWlnaHQ9IjEiIGZpbGw9IiMwMDAiLz48cmVjdCB4PSIxIiB5PSIzIiB3aWR0aD0iMSIgaGVpZ2h0PSIxIiBmaWxsPSIjZmZmIi8+PHJlY3QgeD0iMiIgeT0iMyIgd2lkdGg9IjEiIGhlaWdodD0iMSIgZmlsbD0iI2ZmZiIvPjxyZWN0IHg9IjMiIHk9IjMiIHdpZHRoPSIxIiBoZWlnaHQ9IjEiIGZpbGw9IiMwMDAiLz48cmVjdCB4PSIwIiB5PSI0IiB3aWR0aD0iMSIgaGVpZ2h0PSIxIiBmaWxsPSIjMDAwIi8+PHJlY3QgeD0iMSIgeT0iNCIgd2lkdGg9IjEiIGhlaWdodD0iMSIgZmlsbD0iI2ZmZiIvPjxyZWN0IHg9IjIiIHk9IjQiIHdpZHRoPSIxIiBoZWlnaHQ9IjEiIGZpbGw9IiNmZmYiLz48cmVjdCB4PSIzIiB5PSI0IiB3aWR0aD0iMSIgaGVpZ2h0PSIxIiBmaWxsPSIjZmZmIi8+PHJlY3QgeD0iNCIgeT0iNCIgd2lkdGg9IjEiIGhlaWdodD0iMSIgZmlsbD0iIzAwMCIvPjxyZWN0IHg9IjAiIHk9IjUiIHdpZHRoPSIxIiBoZWlnaHQ9IjEiIGZpbGw9IiMwMDAiLz48cmVjdCB4PSIxIiB5PSI1IiB3aWR0aD0iMSIgaGVpZ2h0PSIxIiBmaWxsPSIjZmZmIi8+PHJlY3QgeD0iMiIgeT0iNSIgd2lkdGg9IjEiIGhlaWdodD0iMSIgZmlsbD0iI2ZmZiIvPjxyZWN0IHg9IjMiIHk9IjUiIHdpZHRoPSIxIiBoZWlnaHQ9IjEiIGZpbGw9IiNmZmYiLz48cmVjdCB4PSI0IiB5PSI1IiB3aWR0aD0iMSIgaGVpZ2h0PSIxIiBmaWxsPSIjZmZmIi8+PHJlY3QgeD0iNSIgeT0iNSIgd2lkdGg9IjEiIGhlaWdodD0iMSIgZmlsbD0iIzAwMCIvPjxyZWN0IHg9IjAiIHk9IjYiIHdpZHRoPSIxIiBoZWlnaHQ9IjEiIGZpbGw9IiMwMDAiLz48cmVjdCB4PSIxIiB5PSI2IiB3aWR0aD0iMSIgaGVpZ2h0PSIxIiBmaWxsPSIjZmZmIi8+PHJlY3QgeD0iMiIgeT0iNiIgd2lkdGg9IjEiIGhlaWdodD0iMSIgZmlsbD0iI2ZmZiIvPjxyZWN0IHg9IjMiIHk9IjYiIHdpZHRoPSIxIiBoZWlnaHQ9IjEiIGZpbGw9IiNmZmYiLz48cmVjdCB4PSI0IiB5PSI2IiB3aWR0aD0iMSIgaGVpZ2h0PSIxIiBmaWxsPSIjZmZmIi8+PHJlY3QgeD0iNSIgeT0iNiIgd2lkdGg9IjEiIGhlaWdodD0iMSIgZmlsbD0iI2ZmZiIvPjxyZWN0IHg9IjYiIHk9IjYiIHdpZHRoPSIxIiBoZWlnaHQ9IjEiIGZpbGw9IiMwMDAiLz48cmVjdCB4PSIwIiB5PSI3IiB3aWR0aD0iMSIgaGVpZ2h0PSIxIiBmaWxsPSIjMDAwIi8+PHJlY3QgeD0iMSIgeT0iNyIgd2lkdGg9IjEiIGhlaWdodD0iMSIgZmlsbD0iI2ZmZiIvPjxyZWN0IHg9IjIiIHk9IjciIHdpZHRoPSIxIiBoZWlnaHQ9IjEiIGZpbGw9IiNmZmYiLz48cmVjdCB4PSIzIiB5PSI3IiB3aWR0aD0iMSIgaGVpZ2h0PSIxIiBmaWxsPSIjZmZmIi8+PHJlY3QgeD0iNCIgeT0iNyIgd2lkdGg9IjEiIGhlaWdodD0iMSIgZmlsbD0iI2ZmZiIvPjxyZWN0IHg9IjUiIHk9IjciIHdpZHRoPSIxIiBoZWlnaHQ9IjEiIGZpbGw9IiNmZmYiLz48cmVjdCB4PSI2IiB5PSI3IiB3aWR0aD0iMSIgaGVpZ2h0PSIxIiBmaWxsPSIjZmZmIi8+PHJlY3QgeD0iNyIgeT0iNyIgd2lkdGg9IjEiIGhlaWdodD0iMSIgZmlsbD0iIzAwMCIvPjxyZWN0IHg9IjAiIHk9IjgiIHdpZHRoPSIxIiBoZWlnaHQ9IjEiIGZpbGw9IiMwMDAiLz48cmVjdCB4PSIxIiB5PSI4IiB3aWR0aD0iMSIgaGVpZ2h0PSIxIiBmaWxsPSIjZmZmIi8+PHJlY3QgeD0iMiIgeT0iOCIgd2lkdGg9IjEiIGhlaWdodD0iMSIgZmlsbD0iI2ZmZiIvPjxyZWN0IHg9IjMiIHk9IjgiIHdpZHRoPSIxIiBoZWlnaHQ9IjEiIGZpbGw9IiNmZmYiLz48cmVjdCB4PSI0IiB5PSI4IiB3aWR0aD0iMSIgaGVpZ2h0PSIxIiBmaWxsPSIjZmZmIi8+PHJlY3QgeD0iNSIgeT0iOCIgd2lkdGg9IjEiIGhlaWdodD0iMSIgZmlsbD0iI2ZmZiIvPjxyZWN0IHg9IjYiIHk9IjgiIHdpZHRoPSIxIiBoZWlnaHQ9IjEiIGZpbGw9IiNmZmYiLz48cmVjdCB4PSI3IiB5PSI4IiB3aWR0aD0iMSIgaGVpZ2h0PSIxIiBmaWxsPSIjZmZmIi8+PHJlY3QgeD0iOCIgeT0iOCIgd2lkdGg9IjEiIGhlaWdodD0iMSIgZmlsbD0iIzAwMCIvPjxyZWN0IHg9IjAiIHk9IjkiIHdpZHRoPSIxIiBoZWlnaHQ9IjEiIGZpbGw9IiMwMDAiLz48cmVjdCB4PSIxIiB5PSI5IiB3aWR0aD0iMSIgaGVpZ2h0PSIxIiBmaWxsPSIjZmZmIi8+PHJlY3QgeD0iMiIgeT0iOSIgd2lkdGg9IjEiIGhlaWdodD0iMSIgZmlsbD0iI2ZmZiIvPjxyZWN0IHg9IjMiIHk9IjkiIHdpZHRoPSIxIiBoZWlnaHQ9IjEiIGZpbGw9IiNmZmYiLz48cmVjdCB4PSI0IiB5PSI5IiB3aWR0aD0iMSIgaGVpZ2h0PSIxIiBmaWxsPSIjZmZmIi8+PHJlY3QgeD0iNSIgeT0iOSIgd2lkdGg9IjEiIGhlaWdodD0iMSIgZmlsbD0iI2ZmZiIvPjxyZWN0IHg9IjYiIHk9IjkiIHdpZHRoPSIxIiBoZWlnaHQ9IjEiIGZpbGw9IiNmZmYiLz48cmVjdCB4PSI3IiB5PSI5IiB3aWR0aD0iMSIgaGVpZ2h0PSIxIiBmaWxsPSIjZmZmIi8+PHJlY3QgeD0iOCIgeT0iOSIgd2lkdGg9IjEiIGhlaWdodD0iMSIgZmlsbD0iI2ZmZiIvPjxyZWN0IHg9IjkiIHk9IjkiIHdpZHRoPSIxIiBoZWlnaHQ9IjEiIGZpbGw9IiMwMDAiLz48cmVjdCB4PSIwIiB5PSIxMCIgd2lkdGg9IjEiIGhlaWdodD0iMSIgZmlsbD0iIzAwMCIvPjxyZWN0IHg9IjEiIHk9IjEwIiB3aWR0aD0iMSIgaGVpZ2h0PSIxIiBmaWxsPSIjZmZmIi8+PHJlY3QgeD0iMiIgeT0iMTAiIHdpZHRoPSIxIiBoZWlnaHQ9IjEiIGZpbGw9IiNmZmYiLz48cmVjdCB4PSIzIiB5PSIxMCIgd2lkdGg9IjEiIGhlaWdodD0iMSIgZmlsbD0iI2ZmZiIvPjxyZWN0IHg9IjQiIHk9IjEwIiB3aWR0aD0iMSIgaGVpZ2h0PSIxIiBmaWxsPSIjZmZmIi8+PHJlY3QgeD0iNSIgeT0iMTAiIHdpZHRoPSIxIiBoZWlnaHQ9IjEiIGZpbGw9IiNmZmYiLz48cmVjdCB4PSI2IiB5PSIxMCIgd2lkdGg9IjEiIGhlaWdodD0iMSIgZmlsbD0iIzAwMCIvPjxyZWN0IHg9IjciIHk9IjEwIiB3aWR0aD0iMSIgaGVpZ2h0PSIxIiBmaWxsPSIjMDAwIi8+PHJlY3QgeD0iOCIgeT0iMTAiIHdpZHRoPSIxIiBoZWlnaHQ9IjEiIGZpbGw9IiMwMDAiLz48cmVjdCB4PSI5IiB5PSIxMCIgd2lkdGg9IjEiIGhlaWdodD0iMSIgZmlsbD0iIzAwMCIvPjxyZWN0IHg9IjEwIiB5PSIxMCIgd2lkdGg9IjEiIGhlaWdodD0iMSIgZmlsbD0iIzAwMCIvPjxyZWN0IHg9IjAiIHk9IjExIiB3aWR0aD0iMSIgaGVpZ2h0PSIxIiBmaWxsPSIjMDAwIi8+PHJlY3QgeD0iMSIgeT0iMTEiIHdpZHRoPSIxIiBoZWlnaHQ9IjEiIGZpbGw9IiNmZmYiLz48cmVjdCB4PSIyIiB5PSIxMSIgd2lkdGg9IjEiIGhlaWdodD0iMSIgZmlsbD0iI2ZmZiIvPjxyZWN0IHg9IjMiIHk9IjExIiB3aWR0aD0iMSIgaGVpZ2h0PSIxIiBmaWxsPSIjMDAwIi8+PHJlY3QgeD0iNCIgeT0iMTEiIHdpZHRoPSIxIiBoZWlnaHQ9IjEiIGZpbGw9IiNmZmYiLz48cmVjdCB4PSI1IiB5PSIxMSIgd2lkdGg9IjEiIGhlaWdodD0iMSIgZmlsbD0iI2ZmZiIvPjxyZWN0IHg9IjYiIHk9IjExIiB3aWR0aD0iMSIgaGVpZ2h0PSIxIiBmaWxsPSIjMDAwIi8+PHJlY3QgeD0iMCIgeT0iMTIiIHdpZHRoPSIxIiBoZWlnaHQ9IjEiIGZpbGw9IiMwMDAiLz48cmVjdCB4PSIxIiB5PSIxMiIgd2lkdGg9IjEiIGhlaWdodD0iMSIgZmlsbD0iI2ZmZiIvPjxyZWN0IHg9IjIiIHk9IjEyIiB3aWR0aD0iMSIgaGVpZ2h0PSIxIiBmaWxsPSIjMDAwIi8+PHJlY3QgeD0iNCIgeT0iMTIiIHdpZHRoPSIxIiBoZWlnaHQ9IjEiIGZpbGw9IiMwMDAiLz48cmVjdCB4PSI1IiB5PSIxMiIgd2lkdGg9IjEiIGhlaWdodD0iMSIgZmlsbD0iI2ZmZiIvPjxyZWN0IHg9IjYiIHk9IjEyIiB3aWR0aD0iMSIgaGVpZ2h0PSIxIiBmaWxsPSIjZmZmIi8+PHJlY3QgeD0iNyIgeT0iMTIiIHdpZHRoPSIxIiBoZWlnaHQ9IjEiIGZpbGw9IiMwMDAiLz48cmVjdCB4PSIwIiB5PSIxMyIgd2lkdGg9IjEiIGhlaWdodD0iMSIgZmlsbD0iIzAwMCIvPjxyZWN0IHg9IjEiIHk9IjEzIiB3aWR0aD0iMSIgaGVpZ2h0PSIxIiBmaWxsPSIjMDAwIi8+PHJlY3QgeD0iNCIgeT0iMTMiIHdpZHRoPSIxIiBoZWlnaHQ9IjEiIGZpbGw9IiMwMDAiLz48cmVjdCB4PSI1IiB5PSIxMyIgd2lkdGg9IjEiIGhlaWdodD0iMSIgZmlsbD0iI2ZmZiIvPjxyZWN0IHg9IjYiIHk9IjEzIiB3aWR0aD0iMSIgaGVpZ2h0PSIxIiBmaWxsPSIjZmZmIi8+PHJlY3QgeD0iNyIgeT0iMTMiIHdpZHRoPSIxIiBoZWlnaHQ9IjEiIGZpbGw9IiMwMDAiLz48cmVjdCB4PSIwIiB5PSIxNCIgd2lkdGg9IjEiIGhlaWdodD0iMSIgZmlsbD0iIzAwMCIvPjxyZWN0IHg9IjUiIHk9IjE0IiB3aWR0aD0iMSIgaGVpZ2h0PSIxIiBmaWxsPSIjMDAwIi8+PHJlY3QgeD0iNiIgeT0iMTQiIHdpZHRoPSIxIiBoZWlnaHQ9IjEiIGZpbGw9IiNmZmYiLz48cmVjdCB4PSI3IiB5PSIxNCIgd2lkdGg9IjEiIGhlaWdodD0iMSIgZmlsbD0iI2ZmZiIvPjxyZWN0IHg9IjgiIHk9IjE0IiB3aWR0aD0iMSIgaGVpZ2h0PSIxIiBmaWxsPSIjMDAwIi8+PHJlY3QgeD0iNSIgeT0iMTUiIHdpZHRoPSIxIiBoZWlnaHQ9IjEiIGZpbGw9IiMwMDAiLz48cmVjdCB4PSI2IiB5PSIxNSIgd2lkdGg9IjEiIGhlaWdodD0iMSIgZmlsbD0iI2ZmZiIvPjxyZWN0IHg9IjciIHk9IjE1IiB3aWR0aD0iMSIgaGVpZ2h0PSIxIiBmaWxsPSIjZmZmIi8+PHJlY3QgeD0iOCIgeT0iMTUiIHdpZHRoPSIxIiBoZWlnaHQ9IjEiIGZpbGw9IiMwMDAiLz48cmVjdCB4PSI2IiB5PSIxNiIgd2lkdGg9IjEiIGhlaWdodD0iMSIgZmlsbD0iIzAwMCIvPjxyZWN0IHg9IjciIHk9IjE2IiB3aWR0aD0iMSIgaGVpZ2h0PSIxIiBmaWxsPSIjMDAwIi8+PC9zdmc+', w: 11, h: 17 },
    // Osoita 9 (oletus, 11x17): itse piirretty pikseli-SVG, klassinen hiiren nuoliosoitin (kp 15:02 "tietokoneen hiiri-osoitin")
    '7': { url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABIAAAAcCAYAAABsxO8nAAABIUlEQVR42qWVsQ4BQRCGPYhSIhLeQqK5RuUBtArv4N6ABr1EqVAQiShFtEqFVn+FRFb+idnMbg4za5M/kpP58v1z7lQqtuPeST4E4JMCCwDPR0Gxgmi41808gHM+rEwwt15OCcQwCTVbSROAGvUafSZZxSCGJVvFoGQrWY33ZbaSgYm01MBcvPDifg1gv+rRl7fTlgaRy2bhxsMeXUMiy8/LxTAGMDzoNH2OywldB/hXJTfqZ94E4VoAAKayYZNvRqrlYlgaxc8ZYICravGO2IoDm/0sl/V0oLiW1iaoFlcCWLsfv+yyWvw7UtlICMJ1NLfbQ9qtaqmJ6emGNkC7eR5AzCBYAASgvENJLy62siz140PKsH/+CANYqlHpW9A6/AIq2mU0iK0CzQAAAABJRU5ErkJggg==', w: 18, h: 28 }
  };
  let salama = 'keltainen', osoita = '9';
  try {
    salama = localStorage.getItem('ikonit-salama') === 'valkoinen' ? 'valkoinen' : 'keltainen';
    const o = localStorage.getItem('ikonit-osoita'); if (['1', '2', '3', '4', '5', '6', '7', '8', '9'].includes(o)) osoita = o;
  } catch (_) {}
  const O = OSOITA[osoita];
  const valkoinen = salama === 'valkoinen';
  // 0.1.5: ryhmän Mykistä/Mykistetty + Jäsenet ikoneiksi (kp 15:34 "mykistä napille joku valmis mute icon pelin asseteista", 15:35 "Jäsenet napille vois kans ettii omaa icon").
  // Kaiutin 29x20: DarkUI/src/assets/flash/settings/sound_on.png / sound_off.png (asetusten äänikuvakkeet). Jäsenet 13x11: DarkUI/src/assets/images/navigator/icons/room_group.png.
  // 0.1.6: kaiutin oli väärä (kp 15:42 "laitoit jonku hemmetin torven"); kp 15:44 valitsi "mykistetty-kupla pieni" =
  //   Nitro_Render_V3/packages/assets/src/assets/avatar_additions/images/avatar_addition_user_muted_small.png (25x24). Sama ikoni molemmissa tiloissa, natiivi is-active näyttää tilan.
  const MYKISTYS = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABkAAAAYCAYAAAAPtVbGAAABBElEQVR4nK2VQRKDIAxFfzodZ1x5AnMDb9Fj9xa66TacwBOkG8W0BQnFv1CM8J9+YCCkpZm6R1QqKACIyN8EZs7CAEBFRK+QiCgSaVwGSIFuf+dSIdr+IhbGcWw2DSHENjPjftbhKrniejHjdayabK0JYo3t3SsX5KHHarQAW2+GhBB+DB+q7vlzx/UkOn1uhuQiqp74dV2LnfeIPHNh/e65F9/mALAsS+z3XTvTHqzO81zsXKtpmgCAYlzDMFwKsH47hLhyg5W0+VG8GCkAtES3RfThnVvsH8snBe37Hl3XIZFA8fjNAi0oATj18WxGAo4YagG1UmzH9N72Dqz9CmvsHvsG8toDaYWfMygAAAAASUVORK5CYII=';
  const AANI = MYKISTYS, MYKISTETTY = MYKISTYS;
  const JASENET = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAA0AAAALCAIAAAAr0JA2AAAABnRSTlMAVQD/AAAgzXPHAAAACXBIWXMAAAsSAAALEgHS3X78AAAAX0lEQVR42mMI/c+AjOAAXRxNkWDvWwhCU0qiOjhAVofsAKiit4IVEARRCiT/bYYiiFIs6hZc+0+xOohSBlQAUcQAV/N/5klkBBL5PxMZQZUD5YCGwUmIOqBhcJKBeAAAzyaUZW/CQC4AAAAASUVORK5CYII=';
  const NIMET = { toiminto: 'Toiminto', osoita: 'Osoita', ilmianna: 'Ilmianna', mykista: 'Mykistä', mykistetty: 'Mykistetty', jasenet: 'Jäsenet' };
  let lopetettu = false;

  const style = document.createElement('style'); style.id = 'kmi-tyyli';
  style.textContent =
    '.nitro-card.kupla-messenger .km-icon.scripts{width:13px;height:17px;font:0/0 a;background-image:url(' + SALAMA + ')}' +
    '.nitro-card.kupla-messenger .km-icon.scripts::before{content:none}' +
    // 0.1.3: gap:0, koska natiivi .km-btn gap 6px + piilotettu 0 px tekstisolmu siirsi ikonia 3 px vasemmalle (mitattu robolla).
    '.km-btn[data-kmi]{font-size:0;color:transparent;min-width:26px;display:inline-flex;align-items:center;justify-content:center;gap:0}' +
    '[data-kmi]::before{content:"";display:inline-block;width:13px;height:17px;background:center/contain no-repeat url(' + SALAMA + ');image-rendering:pixelated}' +
    '.km-btn[data-kmi="toiminto"]::before{filter:grayscale(1) brightness(1.7);opacity:.6}' +
    '.km-btn[data-kmi="toiminto"]:hover::before{opacity:1}' +
    '[data-kmi="osoita"]::before{width:' + O.w + 'px;height:' + O.h + 'px;background-image:url(' + O.url + ')}' +
    // 0.1.4: Ilmianna = Kupla Hubin punainen "!" (SupportToolsView.tsx:789 icon="!", scss 29x29, radius 4px, #a52f3b, valkoinen bold 15px). kp 14:53 "oisko toi siihen ilmoita tilalle?"
    '.km-btn[data-kmi="ilmianna"]{width:28px;min-width:28px;padding:0;border-radius:4px;background:#a52f3b;box-shadow:none}' +
    '.km-btn[data-kmi="ilmianna"]:hover{background:#b93a47}' +
    '[data-kmi="mykista"]::before{width:13px;height:12px;background-size:13px 12px;image-rendering:pixelated;background-image:url(' + AANI + ');filter:none}' +
    '[data-kmi="mykistetty"]::before{width:13px;height:12px;background-size:13px 12px;image-rendering:pixelated;background-image:url(' + MYKISTETTY + ');filter:none}' +
    '[data-kmi="jasenet"]::before{width:13px;height:11px;background-image:url(' + JASENET + ');filter:none}' +
    // 0.1.7 (kp 15:55 "siirrä toi roskis mute napin oikeelle puolelle ryhmästä"): flex-order, ei DOM-siirtoa (React omistaa järjestyksen).
    ".km-mh-actions>[data-kmi=\"mykista\"],.km-mh-actions>[data-kmi=\"mykistetty\"]{order:1}.km-mh-actions>.km-btn:has(.km-icon.remove){order:2}.km-mh-actions>.km-btn.is-square:last-child{order:3}" +
    '.km-btn[data-kmi="ilmianna"]::before{content:"!";width:auto;height:auto;background:none;color:#fff;font:700 15px/1 Arial,sans-serif;image-rendering:auto;filter:none;opacity:1}' +
    (valkoinen
      ? '.nitro-card.kupla-messenger .km-icon.scripts{filter:brightness(0) invert(1)}' + '[data-kmi]::before{filter:brightness(0) invert(1)}'
      : '');
  document.head.appendChild(style);

  // Napit: .km-btn, jonka trimmed textContent on täsmälleen Toiminto tai Osoita. Hover-teksti (title) ei katoa.
  // 0.1.1: vain kirjoituskentän napit, ei koodidialogin Toiminto/Lisäosa-valintaa (MessengerCode.tsx:71 .km-code-actions).
  //   Natiivi title on pelkkä selitys ("Jaa koodi, jonka ..."), joten kun nimi ei enää näy napissa, title alkaa nimellä.
  //   React kirjoittaa titlen takaisin kun sen prop muuttuu (Osoita: failed), siksi havainnoija kuuntelee myös title-attribuuttia.
  // 0.1.7 (kp 15:52 "ryhmässä ruksi sanoo sulje kanava eikä ryhmä"): natiivi MessengerChannelPane.tsx:136 käyttää samaa
  //   'Sulje kanava' -tekstiä myös ryhmälle. Vain data-conversation-kind="group" -näkymässä, alkuperäinen palautuu pois():ssa.
  const sulje = b => {
    if (b.title !== 'Sulje kanava' || !b.closest('.km-main[data-conversation-kind="group"]')) return;
    b.setAttribute('data-kmi-sulje', b.title); b.title = 'Sulje ryhmä'; b.setAttribute('aria-label', 'Sulje ryhmä');
  };
  const kasittele = b => {
    if (b.closest('.km-dialog')) return;
    sulje(b);
    const t = b.textContent.trim();
    const laji = t === 'Toiminto' ? 'toiminto' : t === 'Osoita' ? 'osoita' : t === 'Ilmianna' && b.classList.contains('is-danger') ? 'ilmianna' : t === 'Mykistä' ? 'mykista' : t === 'Mykistetty' ? 'mykistetty' : t === 'Jäsenet' ? 'jasenet' : null;
    if (!laji) return;
    if (b.getAttribute('data-kmi') !== laji) b.setAttribute('data-kmi', laji);
    const nimi = NIMET[laji];
    if (!b.title) { b.title = nimi; b.setAttribute('data-kmi-t', '1'); }
    else if (!b.title.startsWith(nimi)) { b.setAttribute('data-kmi-alkup', b.title); b.title = nimi + ': ' + b.title; }
    if (!b.hasAttribute('aria-label')) { b.setAttribute('aria-label', nimi); b.setAttribute('data-kmi-a', '1'); }
  };
  const kaikki = () => { ajastettu = false; if (lopetettu) return; document.querySelectorAll('.km-btn').forEach(kasittele); };

  let ajastettu = false;
  const havainnoija = new MutationObserver(() => { if (!ajastettu && !lopetettu) { ajastettu = true; setTimeout(kaikki, 120); } });
  havainnoija.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['title'] });
  kaikki();

  window.__kuplaMessengerIkonit = {
    versio: '0.1.7',
    pois() {
      lopetettu = true;
      havainnoija.disconnect();
      document.getElementById('kmi-tyyli') && document.getElementById('kmi-tyyli').remove();
      document.querySelectorAll('[data-kmi-t]').forEach(b => b.removeAttribute('title'));
      document.querySelectorAll('[data-kmi-alkup]').forEach(b => { b.title = b.getAttribute('data-kmi-alkup'); });
      document.querySelectorAll('[data-kmi-a]').forEach(b => b.removeAttribute('aria-label'));
      document.querySelectorAll('[data-kmi-sulje]').forEach(b => { b.title = b.getAttribute('data-kmi-sulje'); b.setAttribute('aria-label', b.title); });
      for (const a of ['data-kmi', 'data-kmi-t', 'data-kmi-a', 'data-kmi-alkup', 'data-kmi-sulje']) document.querySelectorAll('[' + a + ']').forEach(el => el.removeAttribute(a));
      delete window.__kuplaMessengerIkonit;
      return 'poistettu';
    }
  };
})();
