/* Botão "Baixar modelo de planilha" das telas de importação.
   O gerador (ExcelJS) só é carregado quando a pessoa clica. */

import { useState } from 'react'
import { Icon } from './index'

export default function BotaoBaixarModelo({ modelo }) {
  const [baixando, setBaixando] = useState(false)
  const [erro, setErro] = useState('')

  const baixar = async () => {
    setBaixando(true); setErro('')
    try {
      const { baixarModelo } = await import('../lib/modelosPlanilha')
      await baixarModelo(modelo)
    } catch (e) {
      setErro(`Não consegui gerar o modelo. ${e.message || ''}`)
    } finally {
      setBaixando(false)
    }
  }

  return (
    <>
      <button className="btn btn-secondary btn-block" type="button" disabled={baixando} onClick={baixar}>
        <Icon name="relatorio" size={18} /> {baixando ? 'Gerando…' : 'Baixar modelo de planilha (.xlsx)'}
      </button>
      {erro && <div className="alert danger">{erro}</div>}
    </>
  )
}
