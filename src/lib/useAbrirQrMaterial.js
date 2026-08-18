/* ============================================================
   PONTA DE CHEGADA DO QR DO ESTOQUE

   A câmera do celular lê a etiqueta, abre `?qr=<materialId>` (e
   `&t=epi` quando a etiqueta é de EPI) — este hook detecta os
   parâmetros assim que os dados da obra terminam de carregar, troca
   de obra sozinho se o material for de outra (o catálogo é por obra,
   o link não sabe qual obra a pessoa está usando agora) e navega
   direto pra tela certa (Almoxarifado ou Segurança) já com a saída
   daquele material pronta pra registrar.

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
    const tipoParam = parametros.get('t')
    /* t=colaborador é de outro QR (useAbrirQrColaborador) — não
       trata aqui, e não marca erro: o outro hook cuida dele. */
    if (!materialId || tipoParam === 'colaborador') { tratado.current = true; return }
    const epi = tipoParam === 'epi'

    tratado.current = true
    window.history.replaceState(null, '', window.location.pathname)

    const material = epi ? dados.materialEpiPorId(materialId) : dados.materialEstoquePorId(materialId)
    if (!material) { dados.avisarErro('Material do QR Code não encontrado.'); return }
    if (!dados.obras.some((o) => o.id === material.worksite_id)) {
      dados.avisarErro('Você não tem acesso à obra deste material.')
      return
    }

    if (material.worksite_id !== dados.obra.id) dados.trocarObra(material.worksite_id)
    if (epi) goto('seguranca', { abrirEpiMaterialId: materialId })
    else goto('equipamentos', { abrirEstoqueMaterialId: materialId })
  }, [dados, goto])
}
