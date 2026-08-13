/* ============================================================
   ALMOXARIFADO — REFEIÇÕES
   Ainda não tem modelo de dado — falta combinar com o Julio o que
   exatamente essa aba precisa controlar (marmitas por dia? por
   empresa? estoque de mantimento?).
   ============================================================ */

import { PageHeader, Vazio } from '../components'

export default function AlmoxarifadoRefeicoes() {
  return (
    <div className="page">
      <PageHeader
        titulo="Refeições"
        sub="Controle de refeições da obra"
      />
      <div className="card-flat">
        <Vazio
          titulo="Ainda não tem nada aqui"
          texto="Falta combinar o que essa aba precisa controlar — assim que definir com o Julio, a gente monta."
        />
      </div>
    </div>
  )
}
