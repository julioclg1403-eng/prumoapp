/* ============================================================
   ALMOXARIFADO
   Três frentes do mesmo lugar físico, três sub-abas: Equipamentos
   (o que já existia — máquinas e ferramentas), Controle de estoque
   e Refeições (novas, ainda vazias — nascem quando o Julio mandar
   como o almoxarife controla cada uma hoje).
   ============================================================ */

import { useState } from 'react'
import { Icon, Segmentos } from '../components'
import AlmoxarifadoEquipamentos from './almoxarifado-equipamentos'
import AlmoxarifadoEstoque from './almoxarifado-estoque'
import AlmoxarifadoRefeicoes from './almoxarifado-refeicoes'

const ABAS = {
  equipamentos: { rotulo: 'Equipamentos', Tela: AlmoxarifadoEquipamentos },
  estoque: { rotulo: 'Estoque', Tela: AlmoxarifadoEstoque },
  refeicoes: { rotulo: 'Refeições', Tela: AlmoxarifadoRefeicoes },
}

export default function Almoxarifado({ voltar, perfil }) {
  const [aba, setAba] = useState('equipamentos')
  const Tela = ABAS[aba].Tela

  return (
    <>
      <div className="topbar">
        {voltar && <button onClick={voltar} aria-label="Voltar"><Icon name="voltar" size={22} /></button>}
        <div className="grow">
          <div style={{ fontSize: 17, fontWeight: 700 }}>Almoxarifado</div>
          <div className="sub">{ABAS[aba].rotulo}</div>
        </div>
      </div>

      <div className="page" style={{ paddingBottom: 0 }}>
        <Segmentos
          valor={aba}
          onChange={setAba}
          opcoes={Object.entries(ABAS).map(([chave, d]) => ({ valor: chave, rotulo: d.rotulo }))}
        />
      </div>

      <Tela perfil={perfil} />
    </>
  )
}
