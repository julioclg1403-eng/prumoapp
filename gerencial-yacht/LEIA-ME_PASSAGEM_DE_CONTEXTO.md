# Obra YACHT FAMA — app de consulta + nova aba MEDIÇÃO CAIXA
**Passagem de contexto para outra conversa** · Gellen & Guimarães (Palmas/TO) · Ana Luisa · gerado em 01/11/2026

Leia este arquivo inteiro antes de mexer em qualquer coisa. Ele explica o que é o app, as regras combinadas com a usuária, como o código está organizado e, em detalhe, o **tópico novo: Medição Caixa (pesos FRE da Caixa) + estratégia para chegar a 20% em março/2027**.

---

## 1. O que tem neste pacote

| Pasta | Conteúdo |
|---|---|
| `1_app_pronto/` | `Obra_YACHT_painel_fluxo_orcamento_cronograma.html` — o app completo num único HTML (abre no navegador, sem servidor; ~10,6 MB porque leva os dados e a JSZip embutidos). |
| `2_codigo_fonte/` | Todos os módulos JS, o `template.html`, `build.js`, o pipeline de dados (`test_node.js` → `mkstate.js`) e `logo.png`. |
| `3_medicao_caixa/` | **O tópico novo**: `caixa.js` (módulo isolado `YCX`), a planilha original da Caixa (R03), a R04 atualizada pelo cronograma e a R04-ESTRATEGIA20 (alterações em vermelho). |
| `4_planilhas_de_entrada/` | As planilhas de origem usadas para gerar os dados embutidos. |

### Reconstruir o HTML a partir do código
```
cd 2_codigo_fonte
npm i jszip                 # única dependência (navegador e node)
node test_node.js           # lê as planilhas de 4_planilhas_de_entrada → raw.json
node mkstate.js             # acrescenta a revisão atual da YAC-FLUXO (R10) e a base do ciclo (R09) ao raw.json
node build.js               # gera dist.html (igual ao 1_app_pronto)
```

---

## 2. Regras combinadas com a usuária (não quebrar)
1. **Planilha de entrega YAC-FLUXO**: não se mexe em nada além da aba **FLUXO-BASE**; o que o app altera fica **em vermelho**. Fórmulas e o resto do arquivo intactos.
2. **Nunca contar nada duas vezes** (parcela, contrato, funcionário, tarefa duplicada do cronograma).
3. **Todo download é regerado na hora com os dados atuais**; nome do arquivo leva **data do download e revisão** (ex.: `YAC-FLUXO-R10-26.10.29.xlsx`, `YAC-FINAN-MEDIÇÃO_CAIXA-R04-31.10.26.xlsx`).
4. **Transparência de cálculo**: tudo que é número tem "clique e veja a conta" (memória de cálculo em pop-up).
5. **Atualização só depois de importar todas as obrigatórias** (Pagar&Pago, Contratos, Cronograma, Orçamento). Opcionais: Compras, Pesos, YAC-FLUXO, **Medição Caixa**.
6. Revisão: **R10 = competência out/26**; R11 = mês seguinte; a revisão só avança no botão "Fechar o mês".
7. FLUXO-BASE: serviço planejado → mês = consolidado (pago + a pagar do mês no P&P) + max(planejado − consolidado, 0). Não planejado: mantém o previsto e só sobe onde o relatório passar.
8. Arquivos baixados levam a identidade visual da Gellen & Guimarães (logo em `logo.png`).
9. Interface e textos em **português do Brasil**.

---

## 3. Arquitetura do app (globais e módulos)
Tudo roda no navegador; os módulos também rodam em node (precisam de `globalThis.JSZip`).

| Módulo | Global | Faz |
|---|---|---|
| `parsers.js` | `YP` | Leitor xlsx (JSZip + regex), relatório Pagar&Pago (.xls HTML), FLUXO-BASE, cronograma, orçamento (com insumos `insD`), **`YP.identify(file)`** — descobre o tipo do arquivo (inclui `kind:'caixa'`). |
| `model.js` | `YM` | Monta o modelo `M` (nós da FLUXO-BASE, tarefas sem duplicidade `M.tasks`, lotes `M.lots`, parcelas `M.rp`…). |
| `comparativo.js` | `YO` | Orçamento × gasto, item por item. |
| `contratos.js` | `YC` | Relatório de contratos, vínculo item de contrato ↔ item do orçamento, quantidade executada. |
| `fisico.js` | `YF` | Avanço físico pelos pesos do Prevision (PESO_CRONOGRAMA), curva S, por disciplina/lote/item. |
| `compras.js` | `YK` | Relação de Pedidos de Compras (UAU), prazos, preços. |
| **`caixa.js`** | **`YCX`** | **Medição Caixa (novo)** — ver seção 4. |
| `exporter.js` | `YX` | Gravação da YAC-FLUXO (patch da FLUXO-BASE), comparativo, planejamento, utilitários b64. |
| `app.js` | — | Interface (abas, gráficos SVG, pop-ups de cálculo, importação em etapas, persistência). |

**Dados**: `RAW` (embutido no HTML) = `{ report, fluxobase, crono, orc, contratos, peso, compras, caixa, cur, plano }`.
`RAW.plano` (planejamento, alocações, simulação da Caixa em `RAW.plano.cx`) persiste no `localStorage` (`yacht_plano_v1`) e vai junto no "Baixar HTML atualizado".

**Abas** (ordem atual): Painel · Orçamento × gasto · Cronograma · Linha de balanço · **Medição Caixa** · Serviços · Fluxo · Programação fluxo (antiga "Contratos") · Compras · Vínculos · Atualizar / Exportar.

---

## 4. TÓPICO NOVO — MEDIÇÃO CAIXA (`caixa.js`, global `YCX`)

### 4.1 A planilha da Caixa (`YAC-FINAN-MEDIÇÃO_CAIXA-R03-26.10.26.xlsx`)
- Abas: `LEIA-ME`, `RESUMO`, **`MEDIÇÃO`**, `CURVA`.
- `MEDIÇÃO`: tabela `tbMedicao`, cabeçalho na **linha 10**; EAP FRE em 4 níveis: **Etapa › Sub-Etapa › Serviço › Med** (10 etapas, 52 sub-etapas, 80 serviços, **1.705 Meds**).
- Colunas: `Tipo, Etapa, Desc. Etapa, Sub-Etapa, Desc. Sub-Etapa, Serviço, Desc. Serviço, Cód., Descrição, Un, Qtd, Custo (R$), Peso no nível superior, Incidência FRE, % Acum. anterior, % No mês, % Acum. atual, Saldo a medir, Valor medido no mês (R$), Observação / origem` e depois **uma coluna por mês** `08/2026 … 07/2030` (U…BP) com o **% NO MÊS de cada Med** (não acumulado). Só as linhas `Med` recebem lançamento; o resto é fórmula.
- **Peso = incidência FRE da Caixa** de cada Med (soma 99,97%). É **diferente** dos pesos internos (Prevision) e do orçamento — tratado de forma isolada.
- `L4` (nome `MesMedicao`) = mês da medição (out/26). Custo total (analítico) R$ 88.828.251,41.
- Observação de cada Med: `Cronograma: tarefa A; tarefa B` (1.359 Meds) ou `Sem atividade no cronograma — medir manualmente` (346 Meds).
- `T1/T2`: **META 1 ABRIL**, **META 2 MARÇO** (meta = **20%** acumulado).
- `CURVA`: previsto FRE mês a mês (mês 1 = 08/2026).

### 4.2 API do `YCX`
```js
YCX.is(sheetNames)                 // tem MEDIÇÃO e CURVA?
await YCX.parse(x)                 // x = await YP.openXlsx(buf) → data
  // data = { mesMed:'2026-10', custoTot, metas:['META 1 ABRIL','META 2  MARÇO'], months:['2026-08'…'2030-07'],
  //          mcol:{'2026-10':'W',…}, rows:[Etapa/Sub/Serviço/Med], meds:[{row,cod,d,et,sub,sv,dsv,un,q,custo,w,inc,obs,h:{mês:%}}],
  //          fre:{mês:{p,a}}, incTot }
YCX.lotOf(descMed, lots)           // "Pav. 04 – Tipo 01" → "Pav 04 - Tipo"; fachadas, poços de elevador, cremalheira…
YCX.link(data, M.tasks, M.lots)    // liga cada Med às tarefas do cronograma (nome da observação × lote do pavimento)
YCX.calc(data, refISO, sim?)       // → { meds:{cod:{A:{mês:acum}, mes:{mês:%}, src, fim, ini, F, pr, maisArq}}, G (global acum), Gm (global mês), Gfile (planilha), quando(alvo) }
await YCX.patch(buf, data, res, mesNovo?)                    // grava os % dos Meds (de mesMed em diante) na planilha original
await YCX.patchEstrategia(buf, data, base, sim, taticas, meta, alvo) // idem + vermelho nas células da estratégia, amarelo claro nas só atualizadas pelo cronograma, aba "ESTRATÉGIA 20%"
```
No app o arquivo fica em `RAW.caixa = Object.assign(data, { name, b64 })` (b64 do xlsx original, para gravar por cima).

### 4.3 Regras de cálculo (todas foram validadas recalculando no Excel/LibreOffice)
- **Ligação Med → tarefas**: nome exato da observação; se não houver, prefixo (ex.: `FUN - Bloco P1 (Escavação` → `… + Lastro)`); se o pacote resumo não existir no cronograma (ex.: `FUN - Blocão`), usa as tarefas da mesma disciplina com o mesmo termo **que nenhum outro Med usa** (fôrmas/armação/concretagens do Blocão). Med de pavimento só pega tarefas daquele lote; Med sem pavimento pega todos os lotes.
- **Peso de cada tarefa dentro do Med** = duração (dias corridos).
- **Avanço de uma tarefa** (igual ao físico interno): término real = 100%; iniciada = dias decorridos ÷ duração atual (máx. 95%); o que falta segue linear até o término atual; atrasada recomeça no dia seguinte à data de referência.
- **Meses antes de `mesMed`**: ficam exatamente como estão na planilha (já medidos).
- **De `mesMed` até a referência**: realizado do cronograma; **se a planilha já mede mais, vale a planilha** (`maisArq` sinaliza).
- **Depois da referência**: previsão a partir do acumulado na referência (sem efeito composto).
- **Meds manuais** (sem tarefa) seguem os valores lançados na planilha.
- **Meds marcados com "▶ ESTRATÉGIA"** na observação (planilha reimportada) seguem o plano gravado (`src:'estrategia'`), não o cronograma.
- Global = Σ incidência × acumulado do Med.
- Conferência: out/26 = **8,19%** (R03 dizia 8,17%); mar/27 = **14,88%**; 20% só em **ago/27** pelo cronograma atual.

### 4.4 Simulação (`RAW.plano.cx = { alvo:0.2, meta:'2027-03', serv:{}, med:{} }`)
- `serv[códigoServiço] = { ant: dias, ritmo: fator }` — **antecipar** puxa as tarefas do serviço; **ritmo** comprime o calendário que falta a partir de hoje (0,8 = tudo que falta em 80% do prazo, então os pavimentos seguintes também começam antes).
- `med[códigoMed] = { fim:'AAAA-MM' }` (concluído até o mês) ou `{ parc:{ m:'AAAA-MM', p:0,35 } }` (parcial).
- O que já foi medido não muda.
- Sugestões: Meds que faltam medir na meta, do que pede **menos antecipação** para o que pede mais, até cobrir o que falta.

### 4.5 Estratégia estudada para 20% em março/2027 (`CX_EST` em `app.js`)
O cronograma exportado **não tem coluna de predecessoras**; a sequência foi deduzida pelas datas. Caminho crítico da torre:
Blocão concretado em dez/26 → blocos P17, P1, P4, P2+P124, P6+P9, P3, P5 **em série com uma equipe** (15/02–06/04) → reaterro + enterradas externas (07–13/04) → piso de concreto da torre (14–23/04) → **estrutura da torre só em 26/04/27**.

| Tática | Meds | Ganho em mar/27 |
|---|---|---|
| 1. Blocos periféricos P1–P17 em 2–3 frentes (jan/27) | 2.2.8.08 | +0,08% |
| 2. Reaterro, enterradas externas, piso da torre (liberados pelos blocos) | 2.1.8.01, 2.1.8.02, 8.6.3.03, 7.4.4.03 | +0,32% |
| 3. Torre antecipada 75 dias | serviço 3.1 (`ant:75`) | +0,57% |
| 4. Área externa do térreo (alvenaria, reboco, **calçadas**, contrapiso, muro/pilares, rede pluvial) — não depende da torre | 4.1.7.02, 4.1.8.02, 6.3.3.01, 7.4.4.07, 7.2.1.02, 7.2.5.04, 7.2.5.05, 5.2.1.01, 8.6.5.02 | +0,91% |
| 5. Alvenaria da periferia (fundos) Térreo e G1 — 35% | 4.1.7.01, 4.1.8.01, 4.1.7.03, 4.1.8.03 | +0,27% |
| 6. **Canteiro medido pelo executado (negociar com a Caixa)** | 1.2.01 | +1,45% |
| 7. Entrada de energia + subestação | 8.1.10.01, 8.1.11.01 | +0,45% |
| 8. Ligações definitivas água, esgoto, energia | 9.2.01, 9.2.03, 9.2.02 | +1,23% |

Resultado: **14,88% → 20,17% em mar/27** (20,81% em abr/27). Só com obra física ≈ 17%; as táticas 6, 7 e 8 dependem da Caixa / concessionárias.
A contenção já estava prevista para dez/26–fev/27 (já entra na previsão).

### 4.6 Arquivos gerados
- `YAC-FINAN-MEDIÇÃO_CAIXA-R04-31.10.26.xlsx` — medição atualizada pelo cronograma atual (só grava % dos Meds de out/26 em diante; RESUMO e CURVA recalculam ao abrir).
- `YAC-FINAN-MEDIÇÃO_CAIXA-R04-ESTRATEGIA20-31.10.26.xlsx` — com a estratégia: **173 células em vermelho** (fundo vermelho, letra branca, negrito) em 62 Meds; código/descrição desses Meds em vermelho; observação começa com `▶ ESTRATÉGIA 20% 2027-03: <tática> | …`; 2.168 células em **amarelo claro** = só atualização do cronograma; aba nova **"ESTRATÉGIA 20%"** com resumo, ganho por tática e lista de Meds. Recalculado no LibreOffice: 0 erros; linha global de mar/27 = 20,17%.
- **Reimportar** essa planilha no app faz ela virar a base (Meds da estratégia aparecem em vermelho na tabela).

### 4.7 Interface no app (`app.js`, procure `/* ===== MEDIÇÃO CAIXA ===== */`)
- Funções: `cxBase()` (liga e cacheia em `M._cx`), `cxCalc(sim)`, `cxSim()`, `cxAcomp(el)`, `cxTable()`, `cxConta()` (pop-up do Med), `cxMes()` (o que entra no mês), `cxSimView(el)`, `cxBaixar(sim)`, `cxBaixarEst()`, `cxImport(file)`, `CX_EST`, `cxTat()`.
- **Acompanhamento**: tiles (medido acumulado, planilha R03, previsto FRE, R$ medido, quando chega a 20%, cada meta), curva acumulada (FRE × planilha × cronograma, linha de 20%, marcas das metas, clique no mês), tabela por etapa (incidência Caixa × peso interno, "Caixa ÷ interno"), tabela Etapa›Sub›Serviço›Med com filtro e conta de cada Med, botões "Baixar planilha da Caixa atualizada" e "Trocar planilha".
- **Simulação**: alvo e mês, tiles (sem/com simulação, falta, ritmo necessário), curva, caminho sugerido com "aplicar", alavancas por serviço (antecipar/ritmo), botões "Carregar estratégia 20% em <mês>", "Baixar planilha com a simulação", **"Planilha da estratégia (alterações em vermelho)"**, "Limpar simulação".
- Importação: `YP.identify` reconhece a planilha (`kind:'caixa'`); entra na lista de opcionais da aba Atualizar / Exportar e também pode ser trocada direto na aba.

### 4.8 Para conectar em outro app (mínimo)
```js
// navegador: <script src="jszip.min.js"></script><script src="parsers.js"></script><script src="caixa.js"></script>
const x = await YP.openXlsx(await file.arrayBuffer());
const data = await YCX.parse(x);
YCX.link(data, tarefas, lotes);   // tarefas: [{t:'EST - Estrutura', l:'Pav 04 - Tipo', i,f,bi,bf,ri,rf (ISO 'AAAA-MM-DD')}], sem duplicadas
const base = YCX.calc(data, '2026-10-31');
const sim  = YCX.calc(data, '2026-10-31', { serv:{'3.1':{ant:75}}, med:{'1.2.01':{fim:'2027-03'}} });
console.log(base.G['2027-03'], sim.G['2027-03'], sim.quando(0.20));
const out = await YCX.patch(bufOriginal, data, base);           // Uint8Array do xlsx atualizado
```
O cronograma (`YP.parseCrono`) já entrega as tarefas nesse formato; `M.tasks`/`M.lots` vêm de `YM.build(RAW)`.

---

## 5. Pendências / próximos passos combinados
- Ana vai mandar **planilhas de quantitativos** por pavimento para trocar a divisão por pesos pelas quantidades reais (Linha de balanço › Individual) e acertar os pesos de pavimento da Caixa (Térreo/G1/G2 são maiores que o tipo; a planilha da Caixa usa peso igual).
- Confirmar com a Caixa: medição do canteiro pelo executado; prazos das concessionárias (subestação, ligações).
- Se o próximo cronograma vier com **predecessoras**, usar em vez da sequência deduzida pelas datas.
- 11 Meds estão mais avançados na planilha do que no cronograma (projetos, aprovações, balancins, proteções coletivas) — conferir datas reais no cronograma.
- Projeção de materiais por quantidade × último preço com prazo de pedido (ofertado, não feito).
