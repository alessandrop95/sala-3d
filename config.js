/* Server della sala condivisa: lo stesso progetto Supabase del sito board-games (chiave pubblica, nessun segreto).
   Se il progetto cambia, il sito si aggiorna da solo leggendo `refresh` (il server.json pubblicato da board-games). */
window.SALA_CFG = {
  url: 'https://gwvrujyxhetbheimpsun.supabase.co',
  anon: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd3dnJ1anl4aGV0YmhlaW1wc3VuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMxMjU2NzQsImV4cCI6MjEwODcwMTY3NH0.saoB0waLUPodgj73Emk0ZvObyze66D1A25vrFO64Bcw',
  refresh: '/board-games/server.json',
};
