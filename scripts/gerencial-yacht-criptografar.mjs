/* ============================================================
   GERENCIAL YACHT — empacota o painel da obra pra ir dentro do Prumo.

   O HTML do painel leva os dados reais da obra (financeiro, contratos,
   medição da Caixa). Por isso ele NÃO vai em claro pra pasta pública:
   é comprimido (gzip) e criptografado (AES-256-GCM). O arquivo
   criptografado fica em public/gerencial-yacht/obra-yacht.enc (inútil
   sem a chave) e a chave vai pro banco (private.gerencial_arquivos),
   de onde só sai pelo RPC gerencial_yacht_chave(), pra quem é da gestão
   e tem o módulo liberado.

   Uso:
     node scripts/gerencial-yacht-criptografar.mjs "<caminho do .html>" "<saida.sql>"

   Gera o .enc e um .sql com a chave nova. Rode o .sql no SQL Editor
   do Supabase (projeto do Prumo) e APAGUE o .sql. Nunca coloque o .sql
   no git. Pra atualizar o painel depois, é só rodar de novo com o HTML
   novo (chave nova a cada vez), commitar o .enc e rodar o .sql.
   ============================================================ */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createCipheriv, randomBytes } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const [, , entrada, saidaSql] = process.argv
if (!entrada || !saidaSql) {
  console.error('Uso: node scripts/gerencial-yacht-criptografar.mjs "<painel.html>" "<saida.sql>"')
  process.exit(1)
}

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const destino = resolve(raiz, 'public', 'gerencial-yacht', 'obra-yacht.enc')
mkdirSync(dirname(destino), { recursive: true })

const html = readFileSync(entrada)
const comprimido = gzipSync(html, { level: 9 })
const chave = randomBytes(32)
const iv = randomBytes(12)
const cifra = createCipheriv('aes-256-gcm', chave, iv)
// formato do WebCrypto: texto cifrado seguido da etiqueta de autenticação (16 bytes)
const saida = Buffer.concat([cifra.update(comprimido), cifra.final(), cifra.getAuthTag()])
writeFileSync(destino, saida)

writeFileSync(
  resolve(saidaSql),
  `-- NÃO COMMITAR. Rode uma vez no SQL Editor do Supabase do Prumo e apague este arquivo.
insert into private.gerencial_arquivos (nome, chave, iv, atualizado_em)
values ('obra-yacht', '${chave.toString('base64')}', '${iv.toString('base64')}', now())
on conflict (nome) do update set chave = excluded.chave, iv = excluded.iv, atualizado_em = now();
`,
  'utf8',
)

console.log(`HTML original: ${(html.length / 1048576).toFixed(2)} MB`)
console.log(`Comprimido:    ${(comprimido.length / 1048576).toFixed(2)} MB`)
console.log(`Criptografado: ${(saida.length / 1048576).toFixed(2)} MB → ${destino}`)
console.log(`SQL com a chave: ${resolve(saidaSql)} (rode no Supabase e apague)`)
