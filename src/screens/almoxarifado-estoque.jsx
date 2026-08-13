/* ============================================================
   ALMOXARIFADO — CONTROLE DE ESTOQUE
   Ainda não tem modelo de dado — o Julio vai mandar a planilha que
   o almoxarife usa hoje, pra essa tela nascer do jeito que o
   almoxarife já trabalha, não do jeito que a gente imaginou.
   ============================================================ */

import { PageHeader, Vazio } from '../components'

export default function AlmoxarifadoEstoque() {
  return (
    <div className="page">
      <PageHeader
        titulo="Controle de estoque"
        sub="Materiais de almoxarifado — entrada, saída e saldo"
      />
      <div className="card-flat">
        <Vazio
          titulo="Ainda não tem nada aqui"
          texto="Essa aba vai nascer a partir da planilha que o almoxarife já usa pra controlar o estoque — assim que o Julio mandar, a gente monta em cima dela."
        />
      </div>
    </div>
  )
}
