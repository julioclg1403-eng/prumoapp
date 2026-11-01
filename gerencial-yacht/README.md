# Gerencial Yacht — o painel da obra dentro do Prumo

Aba **Gerencial Yacht** do Prumo (menu lateral, perfil de gestão). É o painel que veio de outro computador/conversa: fluxo, orçamento × gasto, cronograma, linha de balanço, **medição da Caixa**, serviços, programação do fluxo, compras e vínculos. Roda **igual ao original**: o HTML inteiro é aberto numa moldura, sem alterar uma linha dele. Nada novo foi adicionado ao painel.

Tudo o que já foi feito lá está documentado em [`LEIA-ME_PASSAGEM_DE_CONTEXTO.md`](LEIA-ME_PASSAGEM_DE_CONTEXTO.md) (regras combinadas, arquitetura, medição da Caixa, estratégia de 20% em março/2027, pendências). O código-fonte do painel está em [`codigo-fonte/`](codigo-fonte/).

## Como funciona dentro do Prumo
- Tela: `src/screens/gerencial-yacht.jsx`; menu e rota em `src/pages/AppGestao.jsx`; módulo `gerencial` em `MODULOS_RESTRINGIVEIS` (`src/lib/dominio.js`).
- **Segurança:** o painel leva dados reais da obra (financeiro, contratos, medição). Por isso ele **não existe em claro** na pasta pública: está comprimido e criptografado (AES-256-GCM) em `public/gerencial-yacht/obra-yacht.enc`. A chave fica no banco (`private.gerencial_arquivos`, sem leitura direta) e só sai pelo RPC `gerencial_yacht_chave()`, para quem é da **gestão** e tem o módulo "Gerencial Yacht" liberado (admin sempre; usuário com lista de módulos precisa ter `gerencial` marcado em Usuários).
- O navegador baixa o `.enc`, pede a chave, descriptografa e escreve o painel na moldura `public/gerencial-yacht/shell.html`. Essa moldura é a **única** página do Prumo com política de segurança que aceita scripts inline (regra específica em `vercel.json`); ela é vazia e não carrega nada sozinha. O service worker não a guarda.
- O que o painel guarda (planejamento, simulação da Caixa, arquivos importados) fica no `localStorage` deste navegador (`yacht_plano_v1`), como no arquivo original. "Baixar HTML atualizado" continua funcionando.

## Atualizar o painel (novo HTML)
```
node scripts/gerencial-yacht-criptografar.mjs "<painel.html>" "<saida.sql>"
```
1. Gera um novo `public/gerencial-yacht/obra-yacht.enc` e um `.sql` com a chave nova.
2. Rode o `.sql` no SQL Editor do Supabase do Prumo e **apague o arquivo** (nunca commitar).
3. Faça commit/push do `.enc`. (Se o `.sql` for rodado antes do deploy, ou o contrário, a tela avisa "o painel e a chave não combinam" por alguns minutos.)

## Arquivos que se anexam dentro do painel (aba "Atualizar / Exportar")
Os dados atuais já estão embutidos no painel. Para atualizar, anexe lá (o painel só atualiza depois de receber **todas as obrigatórias**):

| | Arquivo | Origem |
|---|---|---|
| Obrigatório | Relatório **Pagar & Pago** | `Pagar_e_Pago_UAU.xls` |
| Obrigatório | Relatório de **Contratos** | `Relatorio_Contratos_UAU.xls` |
| Obrigatório | **Cronograma** (Prevision) | `Cronograma_Prevision_29-10-26.xlsx` |
| Obrigatório | **Orçamento** | `Orcamento_R00.xlsx` |
| Opcional | **Compras** (pedidos UAU) | `PEDIDO_3110_CORRIGIDO.xlsx` |
| Opcional | **Pesos** do cronograma | `PESO_CRONOGRAMA.xlsx` |
| Opcional | **YAC-FLUXO** (revisão atual) | `YAC-FLUXO-R10-26.10.29.xlsx` (base do ciclo: `YAC-FLUXO-R09_base_do_ciclo.xlsx`) |
| Opcional | **Medição Caixa** | `YAC-FINAN-MEDIÇÃO_CAIXA-R03-26.10.26.xlsx` (R04 e R04-ESTRATÉGIA20 são as versões geradas) |

As planilhas **não estão neste repositório** (têm dados financeiros). Estão no pacote original `YACHT_pacote_completo_01-11-26_1.zip` (pastas `4_planilhas_de_entrada/` e `3_medicao_caixa/`).
