/* ============================================================
   ALMOXARIFADO
   Três frentes do mesmo lugar físico, três sub-abas: Equipamentos
   (o que já existia — máquinas e ferramentas), Controle de estoque
   e Refeições (novas, ainda vazias — nascem quando o Julio mandar
   como o almoxarife controla cada uma hoje).
   ============================================================ */

import { useState, useEffect } from 'react'
import { Icon, Segmentos } from '../components'
import AlmoxarifadoEquipamentos from './almoxarifado-equipamentos'
import AlmoxarifadoEstoque from './almoxarifado-estoque'
import AlmoxarifadoRefeicoes from './almoxarifado-refeicoes'

const ABAS = {
  equipamentos: { rotulo: 'Equipamentos', Tela: AlmoxarifadoEquipamentos },
  estoque: { rotulo: 'Estoque', Tela: AlmoxarifadoEstoque },
  refeicoes: { rotulo: 'Refeições', Tela: AlmoxarifadoRefeicoes },
}

export default function Almoxarifado({ voltar, perfil, params = {} }) {
  const [aba, setAba] = useState('equipamentos')

  /* Chegada por QR Code (useAbrirQrMaterial): a tela já existe na
     pilha quando isto muda, então o React não remonta o componente —
     precisa deste efeito pra pular direto pra sub-aba Estoque. */
  useEffect(() => {
    if (params.abrirEstoqueMaterialId) setAba('estoque')
  }, [params.abrirEstoqueMaterialId])

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

      <Tela perfil={perfil} params={params} />
    </>
  )
}
