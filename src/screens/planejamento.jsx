/* ============================================================
   PLANEJAMENTO

   Três visões do mesmo trabalho, uma aba só. Quem manda em quem é
   o oposto da ordem de leitura: o Semanal (o que a obra faz dia a
   dia, editável — planejamento-semanal.jsx, alimentado pelo
   diário) atualiza o Mensal (a EAP por etapa, avanço físico medido
   contra o previsto — planejamento-mensal.jsx, ex-"Cronograma"),
   e o Mensal é quem alimenta o Global (o espelho do cronograma
   mestre do projeto inteiro, importado da planilha do setor de
   planejamento — planejamento-global.jsx). O Global nunca cria nem
   edita nada no Mensal — só linka pelo nome numa etapa que já
   exista lá. Eram itens de menu separados; viraram sub-abas porque,
   na prática, quem mexe num sempre acaba olhando o outro.
   ============================================================ */

import { useState } from 'react'
import { Segmentos } from '../components'
import PlanejamentoSemanal from './planejamento-semanal'
import PlanejamentoMensal from './planejamento-mensal'
import PlanejamentoGlobal from './planejamento-global'
import PlanejamentoDashboard from './planejamento-dashboard'

const ROTULO_ABA = { global: 'Global', semanal: 'Semanal', mensal: 'Mensal', dashboard: 'Dashboard' }

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
            { valor: 'dashboard', rotulo: 'Dashboard' },
          ]}
        />
      </div>

      {aba === 'global' && <PlanejamentoGlobal perfil={perfil} />}
      {aba === 'semanal' && <PlanejamentoSemanal goto={goto} perfil={perfil} />}
      {aba === 'mensal' && <PlanejamentoMensal perfil={perfil} goto={goto} />}
      {aba === 'dashboard' && <PlanejamentoDashboard />}
    </>
  )
}
