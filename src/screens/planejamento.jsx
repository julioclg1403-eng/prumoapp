/* ============================================================
   PLANEJAMENTO

   Três visões do mesmo trabalho, uma aba só, em ordem de quem
   alimenta quem: Global (o cronograma mestre do projeto inteiro,
   importado da planilha do setor de planejamento — planejamento-
   global.jsx) alimenta o Mensal (a EAP por etapa, avanço físico
   medido contra o previsto — planejamento-mensal.jsx, ex-"Cronograma"),
   que por sua vez é o que o Semanal (o que a obra faz nos próximos
   dias, editável dia a dia — planejamento-semanal.jsx) enxerga pra
   planejar. Eram itens de menu separados; viraram sub-abas porque,
   na prática, quem mexe num sempre acaba olhando o outro.
   ============================================================ */

import { useState } from 'react'
import { Segmentos } from '../components'
import PlanejamentoSemanal from './planejamento-semanal'
import PlanejamentoMensal from './planejamento-mensal'
import PlanejamentoGlobal from './planejamento-global'

const ROTULO_ABA = { global: 'Global', semanal: 'Semanal', mensal: 'Mensal' }

export default function Planejamento({ goto, perfil, params = {} }) {
  const [aba, setAba] = useState(ROTULO_ABA[params.aba] ? params.aba : 'semanal')

  return (
    <>
      <div className="topbar">
        <div className="grow">
          <div style={{ fontSize: 17, fontWeight: 700 }}>Planejamento</div>
          <div className="sub">{ROTULO_ABA[aba]}</div>
        </div>
      </div>

      <div className="page" style={{ paddingBottom: 0 }}>
        <Segmentos
          valor={aba}
          onChange={setAba}
          opcoes={[
            { valor: 'global', rotulo: 'Global' },
            { valor: 'semanal', rotulo: 'Semanal' },
            { valor: 'mensal', rotulo: 'Mensal' },
          ]}
        />
      </div>

      {aba === 'global' && <PlanejamentoGlobal perfil={perfil} />}
      {aba === 'semanal' && <PlanejamentoSemanal goto={goto} perfil={perfil} />}
      {aba === 'mensal' && <PlanejamentoMensal perfil={perfil} goto={goto} />}
    </>
  )
}
