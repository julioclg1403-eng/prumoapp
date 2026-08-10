// Roda uma vez, na mão (`node scripts/gerar-icones.mjs`), pra regenerar os
// ícones do PWA a partir dos SVG-fonte em src/assets/. Não faz parte do
// build normal -- os PNG gerados ficam versionados em public/.
import sharp from 'sharp'
import { mkdirSync } from 'node:fs'

mkdirSync('public', { recursive: true })

const tarefas = [
  ['src/assets/icon-source.svg', 'public/icon-192.png', 192],
  ['src/assets/icon-source.svg', 'public/icon-512.png', 512],
  ['src/assets/icon-source.svg', 'public/apple-touch-icon.png', 180],
  ['src/assets/icon-source.svg', 'public/favicon-32.png', 32],
  ['src/assets/icon-maskable-source.svg', 'public/icon-maskable-512.png', 512],
]

for (const [origem, destino, tamanho] of tarefas) {
  await sharp(origem).resize(tamanho, tamanho).png().toFile(destino)
  console.log(`${destino} (${tamanho}x${tamanho})`)
}
