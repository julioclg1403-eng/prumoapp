/* ============================================================
   FÓRMULA DE QUANTIDADE — Produtividade e Medição.

   `service_types.formula` é uma string tipo "largura * comprimento *
   altura" digitada pelo admin no Catálogo de Serviços, referenciando
   as chaves de `campos_dimensao`. Em vez de `eval`/`new Function`
   (executaria QUALQUER código JS que alguém digitasse ali, mesmo
   sendo só o admin — não há motivo pra abrir essa porta), um
   tokenizer + parser recursivo-descendente pequeno, que só entende
   números, +  -  *  /  ( ) e identificadores (as chaves de dimensão).
   Nada além disso passa.
   ============================================================ */

function tokenizar(formula) {
  const tokens = []
  const re = /\s*(?:([0-9]*\.?[0-9]+)|([a-zA-Z_][a-zA-Z0-9_]*)|([+\-*/()]))/g
  let pos = 0
  while (pos < formula.length) {
    re.lastIndex = pos
    const m = re.exec(formula)
    if (!m || m.index !== pos) throw new Error(`Não entendi "${formula.slice(pos, pos + 1)}" na fórmula.`)
    pos = re.lastIndex
    if (m[1] != null) tokens.push({ tipo: 'numero', valor: Number(m[1]) })
    else if (m[2] != null) tokens.push({ tipo: 'identificador', valor: m[2] })
    else if (m[3] != null) tokens.push({ tipo: m[3] })
  }
  return tokens
}

/* Gramática: expr := termo (('+' | '-') termo)*
              termo := fator (('*' | '/') fator)*
              fator := numero | identificador | '(' expr ')' | '-' fator */
function criarParser(tokens) {
  let i = 0
  const espiar = () => tokens[i]
  const consumir = (tipo) => {
    const t = tokens[i]
    if (!t || (tipo && t.tipo !== tipo)) throw new Error('Fórmula com sintaxe inválida.')
    i++
    return t
  }

  function fator(valores) {
    const t = espiar()
    if (!t) throw new Error('Fórmula incompleta.')
    if (t.tipo === 'numero') { consumir(); return t.valor }
    if (t.tipo === 'identificador') {
      consumir()
      if (!(t.valor in valores)) throw new Error(`A fórmula usa "${t.valor}", que não é um campo de dimensão cadastrado.`)
      const v = Number(valores[t.valor])
      if (Number.isNaN(v)) throw new Error(`Preencha "${t.valor}" pra calcular a quantidade.`)
      return v
    }
    if (t.tipo === '(') { consumir(); const v = expr(valores); consumir(')'); return v }
    if (t.tipo === '-') { consumir(); return -fator(valores) }
    throw new Error('Fórmula com sintaxe inválida.')
  }

  function termo(valores) {
    let v = fator(valores)
    while (espiar() && (espiar().tipo === '*' || espiar().tipo === '/')) {
      const op = consumir().tipo
      const d = fator(valores)
      v = op === '*' ? v * d : v / d
    }
    return v
  }

  function expr(valores) {
    let v = termo(valores)
    while (espiar() && (espiar().tipo === '+' || espiar().tipo === '-')) {
      const op = consumir().tipo
      const d = termo(valores)
      v = op === '+' ? v + d : v - d
    }
    return v
  }

  return { avaliar: (valores) => { const v = expr(valores); if (i < tokens.length) throw new Error('Fórmula com sintaxe inválida.'); return v } }
}

/* Valida a fórmula contra a lista de chaves cadastradas (uso no
   Catálogo de Serviços, antes de salvar o tipo) — não precisa de
   valores reais, só confere que ela é sintaticamente válida e só
   referencia chaves conhecidas. */
export function validarFormula(formula, chaves) {
  const valoresFicticios = Object.fromEntries((chaves || []).map((c) => [c, 1]))
  try {
    criarParser(tokenizar(formula)).avaliar(valoresFicticios)
    return { ok: true, erro: null }
  } catch (e) {
    return { ok: false, erro: e.message }
  }
}

/* Calcula a quantidade de verdade a partir das dimensões digitadas
   no formulário de marcação. Devolve null (em vez de lançar) quando
   ainda falta preencher alguma dimensão — o formulário mostra "—"
   até completar, não um erro vermelho a cada tecla. */
export function calcularQuantidade(formula, dimensoes) {
  if (!formula) return null
  try {
    return criarParser(tokenizar(formula)).avaliar(dimensoes || {})
  } catch {
    return null
  }
}
