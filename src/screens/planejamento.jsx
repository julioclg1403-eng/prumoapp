/* ============================================================
   PLANEJAMENTO

   Duas visões do mesmo trabalho, uma aba só: Semanal (o que a obra
   faz nos próximos dias, editável dia a dia — planejamento-semanal.jsx)
   e Mensal (o avanço físico por etapa da EAP, medido contra o
   previsto — planejamento-mensal.jsx, ex-"Cronograma"). Eram dois
   itens de menu separados; viraram sub-abas porque, na prática,
   quem mexe num sempre acaba olhando o outro.
   ============================================================ */

import { useState } from 'react'
import { Segmentos } from '../components'
import PlanejamentoSemanal from './planejamento-semanal'
import PlanejamentoMensal from './planejamento-mensal'

export default function Planejamento({ goto, perfil, params = {} }) {
  const [aba, setAba] = useState(params.aba === 'mensal' ? 'mensal' : 'semanal')

  return (
    <>
      <div className="topbar">
        <div className="grow">
          <div style={{ fontSize: 17, fontWeight: 700 }}>Planejamento</div>
          <div className="sub">{aba === 'semanal' ? 'Semanal' : 'Mensal'}</div>
        </div>
      </div>

      <div className="page" style={{ paddingBottom: 0 }}>
        <Segmentos
          valor={aba}
          onChange={setAba}
          opcoes={[
            { valor: 'semanal', rotulo: 'Semanal' },
            { valor: 'mensal', rotulo: 'Mensal' },
          ]}
        />
      </div>

      {aba === 'semanal'
        ? <PlanejamentoSemanal goto={goto} perfil={perfil} />
        : <PlanejamentoMensal perfil={perfil} goto={goto} />}
    </>
  )
}
