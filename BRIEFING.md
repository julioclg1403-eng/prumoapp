# BRIEFING — Prumoapp

> Etapa 1 do fluxo "criar app do zero".
> Base: `GUIA_RECRIAR_APP_SEM_DADOS_REAIS.md` + decisão de incluir WhatsApp.
> Itens marcados **[DECIDIR]** dependem de resposta antes da Etapa 2.

---

## 1. Identidade

| Item | Definição |
|---|---|
| Nome do app | **Prumoapp** |
| Cor principal | **Grafite `#18181B` + laranja `#EA6E1F`** |
| Tom | Ferramenta de trabalho, não rede social. Denso, rápido, legível no sol. |

O nome vem do fio de prumo — o instrumento mais antigo da construção, e a
palavra que já significa "certo, alinhado". Fugimos do prefixo `Constru-`, que
está saturado no mercado brasileiro.

**Pendente:** conferir domínio `.com.br` e busca de marca no INPI antes de
mandar fazer logo ou papelaria.

Dentro do produto, os títulos e o cabeçalho usam só **Prumo**. "Prumoapp" fica
para o domínio, a loja e o material de venda.

### Regra de uso da cor

O laranja é cor universal de aviso. Para ele não competir com os alertas do
próprio app, fica assim — e isso não é preferência, é o que impede o usuário de
ignorar um alerta de verdade:

| Uso | Cor |
|---|---|
| Logo, item ativo do menu, botão de ação principal | Laranja `#EA6E1F` |
| Cabeçalho, menu lateral, texto | Grafite `#18181B` |
| Fundo das telas | Branco / `#FAFAFA` |
| Atrasado, vencido, erro | Vermelho `#C0392B` |
| Concluído, recebido | Verde `#2E7D4F` |
| Em andamento | Azul `#2C6FA8` |

**Âmbar e amarelo ficam fora da paleta de status.** São próximos demais do
laranja da marca — o usuário não distinguiria "botão" de "atenção".

Alerta nunca usa fundo preenchido: usa borda lateral e cor no texto. Fundo
laranja grande em celular no sol vira mancha ilegível.

O guia exige marca, banco e infraestrutura próprios, sem nenhuma herança do
sistema de referência. Isso vale desde o primeiro commit.

---

## 2. Visão em uma frase

Um sistema responsivo que centraliza a rotina de uma obra — diário, efetivo,
planejamento, compras, projetos e pendências — funcionando no celular dentro do
canteiro e no computador do escritório, substituindo papel, mensagem solta e
planilha paralela.

---

## 3. Perfis de usuário

**Campo** — mestre de obras, encarregado.
Mobile-first, botões grandes, poucos passos. Lança diário, presença, atividades,
ocorrências, fotos e requisições. Consulta pendências e equipamentos.

**Gestão** — engenharia, coordenação, administração.
Desktop completo, mas funcional no celular. Indicadores, planejamento,
cronograma, cotação e compra, projetos, contratações, reuniões, revisão dos
cadastros feitos no campo, relatórios.

**Admin** — cadastra e convida usuários. É o único que cria conta para os outros.

Regra dura: **permissão é aplicada no banco, não escondida na tela.** Um usuário
de campo que tente acessar dado de gestão pela URL tem que ser barrado pelo
Supabase, não pelo React.

---

## 4. O dado central

O escopo é a **obra**. Mas a espinha do sistema é a **atividade**, que aparece em
três estados e precisa ser o mesmo registro nos três:

```
atividade planejada  →  atividade executada  →  avanço no cronograma
   (planejamento)          (diário de obra)        (cronograma físico)
```

Se esses três forem cadastros separados, o app vira três planilhas dentro de um
site. É o principal risco de arquitetura do projeto.

Requisição de material, ocorrência, foto e pendência penduram nessa mesma
atividade — é isso que dá rastreabilidade.

---

## 5. Módulos e ordem de construção

Reagrupei as 5 fases do guia em uma ordem que entrega algo utilizável mais cedo.

### Fase 1 — Fundação + diário no ar (o MVP real)

| # | Módulo | Por quê agora |
|---|---|---|
| 1 | Autenticação, organização, obra, perfis, papéis | Sem isso nada existe |
| 2 | Design system e as duas cascas (campo/gestão) | Base visual de todo o resto |
| 3 | Cadastros auxiliares (empresas, colaboradores, locais, materiais) | Alimenta todos os módulos |
| 4 | Diário de obra — modo por equipe (4 etapas) | O coração do produto |
| 5 | Efetivo + fila de revisão de colaborador | Sai de graça do diário |
| 6 | Pendências | Simples e resolve dor imediata |
| 7 | Fotos com compressão no navegador | Sem isso o diário não presta |
| 8 | Lembretes | Adicionado depois — objeto novo, fora do guia |

**Ao fim da Fase 1 o app já é usável na obra de verdade.** Esse é o corte.

### Fase 2 — Planejamento e suprimentos
Planejamento semanal + lote + copiar semana · fechamento semanal · cronograma
físico com importação · requisição → cotação → compra → trânsito → recebimento
parcial · catálogo de materiais.

### Fase 3 — Gestão
Projetos com dependências e simulação de atraso · contratações · visitas, atas e
reunião gerencial · equipamentos · galeria · diário por ambiente.

### Fase 4 — Saídas
Dashboard · relatórios PDF e planilha · medições de pedidos · auditoria ·
desempenho e testes.

---

## 6. Camada WhatsApp *(não está no guia — decisão nova)*

O guia não menciona WhatsApp. Ele entra como **canal**, não como módulo: nada de
"tela de WhatsApp". As mensagens viram os mesmos registros das telas.

### Entrada — o que vira registro *(definido)*

| O que a pessoa manda | Vira | Fase |
|---|---|---|
| Texto: problema visto na obra | Pendência | **1** |
| Texto: andamento de um serviço | Atualização direta da atividade do diário | **1** |
| Texto: "me lembra de X" | Lembrete agendado | **1** |
| Foto + legenda | Foto do diário, com local | **1** |
| Áudio | Transcrição → um dos acima | **1** |
| Texto: "precisa de X, Y, Z" | Rascunho de requisição | 2 |
| Diário completo | — | **Fora.** 4 etapas não cabem em conversa |

#### Travas do registro de serviço pelo WhatsApp

A atualização é direta na atividade — decisão tomada. Como a mesma atividade
também é lançada pelo mestre à noite, entram quatro travas para os dois donos
não se atropelarem:

1. A atividade guarda **quem, quando e por qual canal** foi atualizada.
2. Na etapa 2 do diário, a atividade já aparece com o status que veio do
   WhatsApp e o carimbo visível: *atualizado às 10h32 por Fulano, pelo WhatsApp*.
   O mestre pode sobrescrever; a sobrescrita fica no histórico.
3. **Não-regressão:** mensagem de WhatsApp não desfaz uma atividade concluída.
   Para voltar de concluída, só pelo app, com confirmação.
4. O bot **responde confirmando o que gravou** — "Alvenaria · 5º pav · em
   andamento · gravado". Se leu errado, a pessoa corrige na hora.

Sem a trava 4 o sistema grava interpretação errada em silêncio, que é o pior
resultado possível.

#### Lembretes

Objeto novo, não previsto no guia. Modelo mínimo da Fase 1:

- texto, quem criou, para quem, quando disparar, obra, local opcional, status
- **sem recorrência** na Fase 1 — recorrência multiplica a complexidade
- disparo por agendador no Supabase; se o destinatário estiver fora da janela de
  24h, sai como template

A transcrição de áudio traz um fornecedor a mais (API de transcrição), com
chave e custo próprios — centavos por minuto. Vale, porque na obra a pessoa
fala muito mais do que digita.

Regra fixa: **todo registro exige local**. Se a pessoa não falar, o bot pergunta
antes de fechar — mesma regra que você já validou no outro projeto.

### Saída — o que o app dispara **[DECIDIR]**

Boa notícia: a seção 5.9 do guia **já definiu os gatilhos**. Eles viram templates:

| Gatilho já especificado | Quem recebe |
|---|---|
| Requisição enviada | Gestão |
| Requisição entrou em cotação | Autor |
| Pedido entrou em trânsito | Responsável de campo |
| Entrega atrasada ou parcial | Campo + gestão |
| Pendência vencida | Responsável |
| Diário não lançado até certa hora | Campo + gestão |
| Lembrete na hora marcada | Destinatário |
| **Aviso manual escrito dentro do app** | Quem o autor escolher |

#### Regras da Meta que moldam esses avisos

- Texto livre só vale dentro de 24h desde a última mensagem da pessoa. Fora
  disso, só template aprovado.
- Template com corpo só de variável é rejeitado; variável não pode ser a
  primeira palavra. Molde do aviso manual:

```
Prumo · aviso da engenharia sobre a obra {{1}}.
Mensagem: {{2}}
Responda por aqui se precisar de detalhe.
```

- Corpo idêntico a outro template já aprovado é rejeitado. Os avisos precisam de
  redação diferente entre si, não variações do mesmo texto.
- Submeter como UTILITY. Tom promocional faz a Meta reclassificar para MARKETING
  sozinha, e o custo por mensagem sobe de 5 a 7 vezes.
- Aprovação sai entre minutos e 48h. Cerca de 30% das primeiras submissões são
  rejeitadas — conte com uma rodada de ajuste.

### Arquitetura

```
WhatsApp Cloud API (Meta)
        ↓ webhook
Supabase Edge Function  ──→  Postgres (mesmas tabelas das telas)
        ↑                          │
        └──── envio ───────────────┘  (disparado por trigger/agendamento)
```

Sem n8n, sem Zapster. Uma peça a menos, sem mensalidade de intermediário.

### O item de prazo mais longo do projeto

1. **Chip dedicado.** Número usado na Cloud API não funciona mais no WhatsApp
   comum — não repetir o susto do outro projeto.
2. **Verificação do Meta Business.** Dias, com envio de documento da empresa.
3. **Templates aprovados.** Fora da janela de 24h só sai template pré-aprovado.

Isso corre **em paralelo** à Fase 1, começando já. É burocracia, não código — e
é o único item que pode travar o projeto por motivo que não depende de nós.

---

## 7. Modelo de dados

Aproveito os nomes do guia (seção 7). Todas as tabelas operacionais levam
`organization_id` e `worksite_id`, com RLS por organização, obra e papel.

Adições da camada WhatsApp:

- `whatsapp_contacts` — telefone ↔ usuário ↔ obra ↔ papel
- `whatsapp_messages` — bruto recebido/enviado, para auditoria e reprocessamento
- `notifications` — já previsto no guia; ganha o campo de canal (app / WhatsApp)
- `reminders` — lembretes agendados
- em `daily_activities`: `atualizado_por`, `atualizado_em`, `atualizado_via`

---

## 8. Regras inegociáveis

Do guia, valem desde o dia 1:

1. Chave administrativa nunca no frontend.
2. Papel nunca confiado ao navegador — sempre validado no banco.
3. Arquivo vai para o storage; no banco só o metadado.
4. Data de calendário não vira UTC (senão o diário do dia 5 aparece no dia 4).
5. Arquivar, não apagar.
6. Cálculo derivado (atraso, saldo, total) mora em função compartilhada — tela,
   contador, PDF e planilha têm que dar o mesmo número.
7. Recebimento parcial em transação: ou grava tudo, ou nada.
8. Nenhum dado real em seed, teste, screenshot ou commit.

---

## 9. Decisões

| Decisão | Situação |
|---|---|
| Nome do app | ✅ Prumoapp |
| Escopo da Fase 1 | ✅ os 7 itens da seção 5 |
| **Escopo da v1 (o que vai ao ar primeiro)** | ✅ **núcleo enxuto — ver 9.1** |
| **Telas** | ✅ **feitas direto em código, sem passar pelo Claude Design** |
| Entrada por WhatsApp | ✅ pendência, andamento de serviço, lembrete, foto, áudio |
| Saída por WhatsApp | ✅ os 6 gatilhos da seção 5.9 do guia |
| Cor principal | ✅ grafite + laranja |
| Domínio e INPI | ⬜ conferir |

### 9.1 Recorte da v1 — decidido em 07/08/2026

A Fase 1 da seção 5 tem 8 módulos e continua valendo como destino. Mas o que
vai ao ar **primeiro**, para uso real na obra, é menor:

| Entra na v1 | Fica para a v2 |
|---|---|
| Login e os 3 perfis | Fotos com compressão no navegador |
| Cadastros auxiliares | Lembretes agendados |
| Diário de obra — as 4 etapas | Camada WhatsApp inteira |
| Efetivo + fila de revisão de colaborador | Diário por ambiente |
| Pendências | Planejamento semanal em lote |

Motivo do corte: a camada WhatsApp depende de burocracia externa (chip
dedicado, verificação do Meta Business, aprovação de templates) que leva
semanas e **não depende de código**. Amarrar a primeira entrega a ela seria
travar o app por um motivo que não está nas nossas mãos. A burocracia corre em
paralelo, como a seção 6 já previa.

---

## 10. Aviso honesto sobre tamanho

A especificação completa é um produto grande — 18 módulos, ~40 tabelas,
simulação de grafo de dependências, importação de cronograma, Gantt, medições.
Isso não é um app de fim de semana; é um SaaS. O guia acertou ao dividir em
fases, e eu reforço: **o risco real do projeto não é dificuldade técnica, é
tentar entregar tudo de uma vez e não terminar nada.**

O plano é fechar a Fase 1 inteira, com você usando na obra, antes de abrir a
Fase 2.
