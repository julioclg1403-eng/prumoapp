/* ============================================================
   O ÚNICO INTERRUPTOR entre "dados de mentira" e banco real.

   Virou false na Etapa 7: o app agora lê e grava no Supabase.
   O arquivo src/lib/mockData.js continua existindo porque virou
   a origem do supabase-seed.sql — não é mais lido pelo app.
   ============================================================ */

export const USAR_MOCK = false

export const APP_NOME = 'Prumo'
