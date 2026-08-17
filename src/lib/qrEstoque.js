/* ============================================================
   ETIQUETAS QR DO ESTOQUE

   Compartilhado pelos dois controles de estoque do app — Almoxarifado
   (material de obra) e Segurança (EPI). Cada material ganha um QR
   Code que aponta pra um link do próprio Prumo (?qr=<id do material>,
   com &t=epi quando é EPI). Impresso com o nome embaixo e colado na
   prateleira, qualquer câmera de celular lê o link e abre o app
   direto na tela de dar saída daquele material — sem digitar nada,
   sem catálogo pra abrir na mão (useAbrirQrMaterial.js cuida da
   ponta de chegada, isto aqui cuida da geração/impressão).
   ============================================================ */

import QRCode from 'qrcode'

export function linkQrMaterial(materialId, tipo = 'estoque') {
  const sufixo = tipo === 'epi' ? '&t=epi' : ''
  return `${window.location.origin}${window.location.pathname}?qr=${materialId}${sufixo}`
}

export async function gerarQRDataURL(texto) {
  return QRCode.toDataURL(texto, { margin: 1, width: 260 })
}

function escaparHTML(texto) {
  const div = document.createElement('div')
  div.textContent = texto
  return div.innerHTML
}

/* Abre a aba da impressão — precisa ser chamada SÍNCRONA, direto no
   clique do botão, antes de qualquer `await` (gerar os QR Codes é
   assíncrono). Navegador mais rígido (Safari/iOS, o que o almoxarife
   provavelmente usa) só permite `window.open` fora de um bloqueio de
   pop-up quando ele roda no mesmo tique do gesto do usuário — depois
   de um `await` já não conta mais como clique, e a janela é bloqueada
   em silêncio. Por isso a abertura e o preenchimento são duas funções
   separadas: abre já, preenche quando o QR terminar de gerar. */
export function abrirJanelaEtiquetas() {
  return window.open('', '_blank', 'width=900,height=700')
}

/* `etiquetas`: [{ nome, dataUrl }]. */
export function escreverEtiquetas(janela, etiquetas, tituloObra) {
  const corpo = etiquetas.map((e) => `
    <div class="etiqueta">
      <img src="${e.dataUrl}" alt="QR Code" />
      <div class="nome">${escaparHTML(e.nome)}</div>
    </div>
  `).join('')

  janela.document.write(`<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Etiquetas QR — ${escaparHTML(tituloObra || 'Estoque')}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; margin: 0; padding: 18px; }
  .grade { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
  .etiqueta {
    border: 1px dashed #999; border-radius: 10px; padding: 12px;
    text-align: center; page-break-inside: avoid;
  }
  .etiqueta img { width: 100%; max-width: 170px; height: auto; }
  .etiqueta .nome { margin-top: 8px; font-size: 13px; font-weight: 700; word-break: break-word; }
  @media print {
    .etiqueta { border-color: #ccc; }
  }
</style>
</head>
<body>
  <div class="grade">${corpo}</div>
  <script>window.onload = function () { window.print(); };</script>
</body>
</html>`)
  janela.document.close()
  return true
}
