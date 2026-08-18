/* ============================================================
   PONTA DE CHEGADA DO QR DE COLABORADOR

   A câmera do celular lê a etiqueta, abre `?qr=<workerId>&t=colaborador`
   — este hook detecta o parâmetro assim que os dados da obra
   terminam de carregar, troca de obra sozinho se o colaborador for
   de outra (o cadastro é por obra, o link não sabe qual obra a
   pessoa está usando agora) e navega direto pra tela de consulta
   (só leitura) daquele colaborador.

   Mesma estrutura de useAbrirQrMaterial.js; ver lá o porquê de rodar
   uma vez só por carregamento de página.
   ============================================================ */

import { useEffect, useRef } from 'react'

export function useAbrirQrColaborador(dados, goto) {
  const tratado = useRef(false)

  useEffect(() => {
    if (tratado.current) return
    if (!dados?.obra) return

    const parametros = new URLSearchParams(window.location.search)
    const workerId = parametros.get('qr')
    const ehColaborador = parametros.get('t') === 'colaborador'
    if (!workerId || !ehColaborador) { tratado.current = true; return }

    tratado.current = true
    window.history.replaceState(null, '', window.location.pathname)

    const trabalhador = dados.colaboradorPorId(workerId)
    if (!trabalhador) { dados.avisarErro('Colaborador do QR Code não encontrado.'); return }
    if (!dados.obras.some((o) => o.id === trabalhador.worksite_id)) {
      dados.avisarErro('Você não tem acesso à obra deste colaborador.')
      return
    }

    if (trabalhador.worksite_id !== dados.obra.id) dados.trocarObra(trabalhador.worksite_id)
    goto('consultaColaborador', { workerId })
  }, [dados, goto])
}
