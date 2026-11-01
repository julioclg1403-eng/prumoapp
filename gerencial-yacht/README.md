# Gerencial Yacht — o painel da obra dentro do Prumo

Aba **Gerencial Yacht** do Prumo (menu lateral, perfil de gestão). É o painel que veio de outro computador/conversa: fluxo, orçamento × gasto, cronograma, linha de balanço, **medição da Caixa**, serviços, programação do fluxo, compras e vínculos. Roda **igual ao original**: o HTML inteiro é aberto numa moldura, sem alterar uma linha dele. Nada novo foi adicionado ao painel.

Tudo o que já foi feito lá está documentado em [`LEIA-ME_PASSAGEM_DE_CONTEXTO.md`](LEIA-ME_PASSAGEM_DE_CONTEXTO.md) (regras combinadas, arquitetura, medição da Caixa, estratégia de 20% em março/2027, pendências). O código-fonte do painel está em [`codigo-fonte/`](codigo-fonte/).

## Como funciona dentro do Prumo
- Tela: `src/screens/gerencial-yacht.jsx`; menu e rota em `src/pages/AppGestao.jsx`; módulo `gerencial` em `MODULOS_RESTRINGIVEIS` (`src/lib/dominio.js`).
- **Segurança:** o painel leva dados reais da obra (financeiro, contratos, medição). Por isso ele **não existe em claro** na pasta pública: está comprimido e criptografado (AES-256-GCM) em `public/gerencial-yacht/obra-yacht.enc`. A chave fica no banco (`private.gerencial_arquivos`, sem leitura direta) e só sai pelo RPC `gerencial_yacht_chave(senha)`, **só para o administrador que acertar a senha própria da aba** (criada por ele na primeira vez, guardada como hash bcrypt; 5 erros seguidos bloqueiam por 15 minutos). Esqueceu a senha? No SQL Editor: `update private.gerencial_acesso set senha_hash = null, tentativas = 0, bloqueado_ate = null;` — a tela pede para criar outra.
- O navegador baixa o `.enc`, pede a chave, descriptografa e escreve o painel na moldura `public/gerencial-yacht/shell.html`. Essa moldura é a **única** página do Prumo com política de segurança que aceita scripts inline (regra específica em `vercel.json`); ela é vazia e não carrega nada sozinha. O service worker não a guarda.
- O que o painel guarda (planejamento, simulação da Caixa, arquivos importados) fica no `localStorage` deste navegador (`yacht_plano_v1`), como no arquivo original. "Baixar HTML atualizado" continua funcionando.

## Atualizar o Gerencial atualiza o resto do Prumo
Ao anexar um arquivo **dentro do painel** (aba Atualizar / Exportar) ou pelo botão **📎 Anexar ao Prumo**, o Prumo identifica o arquivo (`src/lib/gerencialPonte.js`, usando as próprias funções de leitura do painel; o painel não é alterado):
| Arquivo | O que o Prumo faz |
|---|---|
| **Cronograma** (Prevision) | grava sozinho o cronograma tratado (sem as 11 linhas que o painel descarta como duplicadas) na tabela `gerencial_cronograma` → a **Linha de balanço do Início** atualiza. Oferece "Atualizar datas no Planejamento" (tela de importação do Global, com prévia; casa por ID, só atualiza datas, não mexe no Mensal nem nos percentuais). |
| **Planilha de compras** (pedidos UAU) | oferece "Atualizar Suprimentos" (mesma tela de importação do módulo, com prévia de novos, atualizados e removidos) |
| **CONTRATOS-UAU** | oferece "Atualizar Contratos" (idem). O painel não lê esse arquivo; anexe pelo 📎. |
| **Relatório de Contratos (.xls do painel)** | só o painel lê; o Prumo avisa que o módulo Contratos precisa da CONTRATOS-UAU |
Só o cronograma sai do Gerencial. **Valores em dinheiro ficam só dentro do Gerencial** (admin + senha). Na primeira abertura, a Linha de balanço é preenchida com o cronograma que já vem embutido no painel.

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
