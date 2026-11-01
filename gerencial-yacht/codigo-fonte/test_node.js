globalThis.JSZip = require('jszip');
require('./contratos.js'); require('./fisico.js'); require('./compras.js'); require('./caixa.js'); require('./parsers.js');
const fs=require('fs');
const mk=p=>({name:p, arrayBuffer: async()=>{const b=fs.readFileSync(p);return b.buffer.slice(b.byteOffset,b.byteOffset+b.length);}});
(async()=>{
  const files=['../4_planilhas_de_entrada/Pagar_e_Pago_UAU.xls','../4_planilhas_de_entrada/YAC-FLUXO-R10-26.10.29.xlsx','../4_planilhas_de_entrada/Cronograma_Prevision_29-10-26.xlsx','../4_planilhas_de_entrada/Orcamento_R00.xlsx','../4_planilhas_de_entrada/Relatorio_Contratos_UAU.xls','../4_planilhas_de_entrada/PESO_CRONOGRAMA.xlsx','../4_planilhas_de_entrada/PEDIDO_3110_CORRIGIDO.xlsx','../4_planilhas_de_entrada/YAC-FINAN-MEDIÇÃO_CAIXA-R03-26.10.26.xlsx'];
  const raw={};
  for(const f of files){const t=Date.now(); const r=await YP.identify(mk(f)); raw[r.kind]=r.data; if(r.kind==='caixa'){ raw.caixa.name=require('path').basename(f); raw.caixa.b64=fs.readFileSync(f).toString('base64'); } console.log(r.kind, (Date.now()-t)+'ms');}
  const rp=raw.report; console.log('report',rp.length, rp.reduce((a,x)=>a+x.pg,0).toFixed(2), rp.reduce((a,x)=>a+x.ap,0).toFixed(2), rp[0]);
  const fb=raw.fluxobase; const C=Object.values(fb.nodes).filter(n=>n.lv==='C');
  console.log('fb nodes',Object.keys(fb.nodes).length,'C',C.length,'orc',C.reduce((a,n)=>a+n.orc,0).toFixed(2),'ins',fb.insumos.length,'links',Object.keys(fb.orcLinks).length,'months',fb.months[0],fb.months.at(-1));
  const tot=m=>C.reduce((a,n)=>a+(n.prev[m]||0),0);
  console.log('prev 2026-10..2027-01',['2026-10','2026-11','2026-12','2027-01'].map(tot).map(v=>v.toFixed(2)));
  console.log('crono',raw.crono.tasks.length,raw.crono.gerado,raw.crono.tasks[0]);
  console.log('orc',raw.orc.comps.length,raw.orc.rev,raw.orc.data,raw.orc.comps.reduce((a,x)=>a+x.tot,0).toFixed(2),raw.orc.comps.reduce((a,x)=>a+x.mo,0).toFixed(2));
  fs.writeFileSync('raw.json',JSON.stringify(raw));
})().catch(e=>{console.error(e);process.exit(1)});
