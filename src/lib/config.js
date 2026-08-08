/* ============================================================
   O ÚNICO INTERRUPTOR entre "dados de mentira" e banco real.
   Hoje: true  -> o app roda sozinho, sem banco, para você ver e
                  clicar em tudo (Etapa 4).
   Etapa 7: vira false -> as mesmas telas passam a ler e gravar
            no Supabase, sem precisar mexer em tela nenhuma.
   ============================================================ */

export const USAR_MOCK = true

export const APP_NOME = 'Prumo'
