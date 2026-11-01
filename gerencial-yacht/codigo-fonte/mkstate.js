globalThis.JSZip = require('jszip'); globalThis.btoa=s=>Buffer.from(s,'binary').toString('base64'); globalThis.atob=b=>Buffer.from(b,'base64').toString('binary');
require('./parsers.js'); require('./exporter.js');
const fs=require('fs'); const raw=JSON.parse(fs.readFileSync('raw.json','utf8'));
const buf=p=>{const b=fs.readFileSync(p);return b.buffer.slice(b.byteOffset,b.byteOffset+b.length)};
(async()=>{
  // alterações da R10 = patch da R09 com o relatório de 29/10 (idêntico ao que foi entregue)
  const r=await YX.patchFluxo(buf('../4_planilhas_de_entrada/YAC-FLUXO-R09_base_do_ciclo.xlsx'), raw.report, '2026-10-29', 'R09');
  const r10=fs.readFileSync('../4_planilhas_de_entrada/YAC-FLUXO-R10-26.10.29.xlsx');
  raw.reportHash = YX.hashReport(raw.report);
  raw.cur={ name:'YAC-FLUXO-R10-26.10.29.xlsx', b64: r10.toString('base64'), base: fs.readFileSync('../4_planilhas_de_entrada/YAC-FLUXO-R09_base_do_ciclo.xlsx').toString('base64'), rev:10, mes:'2026-10', target:'2026-11', ref:'2026-10-29', alter:{ revLabel:'R10', ref:'2026-10-29', changes:r.changes.map(c=>({cod:c.cod,desc:c.desc,mes:c.mes,celula:c.celula,leaf:c.leaf,prev:c.prev,rep:c.rep,delta:c.delta,old:c.old,novo:c.novo})), missing:r.missing, skipped:r.skipped } };
  fs.writeFileSync('raw.json', JSON.stringify(raw)); console.log('state ok', raw.cur.alter.changes.length, raw.reportHash);
})().catch(e=>{console.error(e);process.exit(1)});
