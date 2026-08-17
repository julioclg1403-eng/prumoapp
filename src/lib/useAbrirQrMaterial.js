/* ============================================================
   PONTA DE CHEGADA DO QR DO ESTOQUE

   A câmera do celular lê a etiqueta, abre `?qr=<materialId>` — este
   hook detecta o parâmetro assim que os dados da obra terminam de
   carregar, troca de obra sozinho se o material for de outra (o
   catálogo de estoque é por obra, o link não sabe qual obra o
   almoxarife está usando agora) e navega direto pro Almoxarifado já
   com a saída daquele material pronta pra registrar.

   Roda uma vez só por carregamento de página (`tratado`): depois de
   ler o parâmetro ele já limpa a URL, então recarregar a página não
   reabre a mesma tela sozinho de novo.
   ============================================================ */

import { useEffect, useRef } from 'react'

export function useAbrirQrMaterial(dados, goto) {
  const tratado = useRef(false)

  useEffect(() => {
    if (tratado.current) return
    if (!dados?.obra) return

    const parametros = new URLSearchParams(window.location.search)
    const materialId = parametros.get('qr')
    if (!materialId) { tratado.current = true; return }

    tratado.current = true
    window.history.replaceState(null, '', window.location.pathname)

    const material = dados.materialEstoquePorId(materialId)
    if (!material) { dados.avisarErro('Material do QR Code não encontrado.'); return }
    if (!dados.obras.some((o) => o.id === material.worksite_id)) {
      dados.avisarErro('Você não tem acesso à obra deste material.')
      return
    }

    if (material.worksite_id !== dados.obra.id) dados.trocarObra(material.worksite_id)
    goto('equipamentos', { abrirEstoqueMaterialId: materialId })
  }, [dados, goto])
}
