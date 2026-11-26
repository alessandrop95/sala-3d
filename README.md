# Sala 3D

Progettista 3D di una sala: pareti, portone, finestre e tetto con le misure reali, pavimento a piastrelle da 1×1 m
(tatami, gomma antitrauma, erba sintetica, legno) e un catalogo di attrezzi da disporre a piacere.
Tutto il testo è in italiano e non serve alcun account.

## Cosa si può fare

- **Attrezzi**: oltre 60 modelli (strutture, pesi, cardio, arti marziali, stile giapponese, arredo e servizi) più quelli con misure tue, modificabili in ogni momento.
- **Decorazioni**: immagini o dipinti (montati come pannello giapponese orizzontale *gaku*, rotolo verticale *kakejiku* o in cornice) e scritte (anche verticali, con carattere a pennello), su parete o sul pavimento.
- **Pareti**: colore di ogni parete, con tavolozza di colori tradizionali giapponesi.
- **Pavimento** a piastrelle da 1×1 m, **metro** per misurare, **posizione esatta** degli oggetti in metri dalle pareti.

## Come funziona la sala condivisa

- Ogni sala ha un codice nel link (`?s=…`). **Chi ha il link modifica la stessa sala**: il link è la chiave, va dato solo a chi deve lavorarci.
- Aprendo il sito senza codice si torna all'ultima sala usata su quel dispositivo; la prima volta ne nasce una nuova.
- Le modifiche arrivano agli altri in un paio di secondi. Se due persone cambiano cose diverse nello stesso momento, le modifiche si uniscono;
  se toccano lo stesso attrezzo vale l'ultima arrivata.
- Senza connessione si continua a lavorare: le modifiche restano sul dispositivo e partono appena torna la rete.
- *Menu → Copia con nuovo link* crea una sala uguale con un link diverso, per provare un'altra disposizione.
- *Menu → Salva progetto su file / Carica progetto* per tenere una copia o riportare una sala salvata.

## File

| File | Contenuto |
|---|---|
| `index.html` | pagina e stile |
| `engine.js` | motore 3D (WebGL2, nessuna libreria esterna) |
| `catalog.js` | catalogo attrezzi e pavimentazioni: per aggiungere un attrezzo basta una voce in `CATALOG` |
| `app.js` | sala, interazione, interfaccia e sincronizzazione |
| `config.js` | indirizzo e chiave pubblica del server |

## Server

Le sale sono salvate nel progetto Supabase del sito [board-games](https://github.com/alessandrop95/board-games):
tabella `sala3d_rooms` e funzioni `sala3d_get` / `sala3d_save` (migrazione `supabase/migrations/20261115140000_sala3d.sql` di quel repository).
La tabella non è leggibile da fuori: si passa solo dalle due funzioni, quindi i codici delle sale non si possono elencare.
`config.js` contiene indirizzo e chiave pubblica; all'avvio il sito legge anche `/board-games/server.json` e, se è cambiato, usa quello.

## Pubblicazione

Sito statico su GitHub Pages, senza passaggi di build: basta pubblicare la cartella così com'è.

A ogni pubblicazione aggiorna la versione in tre punti uguali: `APP_VER` in `app.js`, `version.json` e i `?v=` degli script in `index.html`. Così le pagine rimaste aperte propongono di aggiornarsi e il browser non riusa i file vecchi.

## Modelli 3D veri

Alcuni attrezzi (squat rack, kettlebell, sacco) usano modelli GLB in `models/`, caricati solo con la grafica realistica; finché non sono pronti si vede la versione disegnata. Nel catalogo: `model` (percorso), `modelYaw` (rotazione per avere il fronte verso +Z), `modelBody` (altezza della parte che corrisponde all'attrezzo, il resto sopra sono catene) e `modelFit: 'box'` (adatta anche larghezza e profondità). Autori e licenze in `models/CREDITS.md`.

## Guardare o modificare

All'apertura la sala si può solo guardare (girare, zoomare, misurare, toccare un oggetto per vederne nome e misure). Il pulsante **Modifica** in alto abilita spostamenti, aggiunte, pavimento e misure della sala; **Fine** torna a guardare. La modalità vale solo sul dispositivo e non viene salvata: ogni volta si riparte da Guardare.

## Vista Interno

Nella vista Interno si guida un karateka (karategi bianco, cintura nera) visto alle spalle: W A S D o frecce per camminare (← → / Q E per girarsi, Maiuscolo per correre), pulsanti a schermo sui dispositivi touch, doppio tocco sul pavimento per farlo camminare fin lì. La figura è in `karateka.js`: parti articolate (bacino, busto, testa, braccia, gambe, piedi) e una camminata calcolata dalla fase del passo. La stessa figura, ferma, è l'attrezzo "Karateka 175 cm (scala)".

## Tende

Ogni finestra può avere una tenda nera (Sala → Finestre e portone, oppure "Tende nere a tutte le finestre"). La tenda va dal bastone sopra la finestra fino al davanzale; si apre e si chiude toccandola nella vista, anche senza Modifica, o da Menu → Apri / chiudi le tende. Nei dati è `cur: true` e `cl` (1 chiusa, 0 aperta) sull'apertura.

## Luci (vista di sera)

Pulsante Giorno / Sera sotto le viste. Di sera la sala è illuminata dagli oggetti della categoria Luci LED (strisce, barre a sospensione, chōchin, applique, andon, plafoniera): ogni attrezzo ha `light()` con punti `[x, y, z, intensità, raggio, filtro]`. Intensità (0–200%) e temperatura (2200–6500 K) si regolano con i cursori; le luci vicine si fondono finché sono al massimo 16 (limite dello shader). Tutto questo è una preferenza del dispositivo, non della sala.
