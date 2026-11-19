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
