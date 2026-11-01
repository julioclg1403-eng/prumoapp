// Monta o app num único HTML: node build.js  (precisa de: npm i jszip ; e raw.json gerado por test_node.js + mkstate.js)
const fs=require('fs'), path=require('path'); const D=__dirname;
let t=fs.readFileSync(path.join(D,'template.html'),'utf8');
const raw=fs.readFileSync(path.join(D,'raw.json'),'utf8');
const rep=(k,v)=>{ if(/<\/script/i.test(v) && k!=='/*RAW*/') throw new Error(k+' contém </script'); t=t.replace(k,()=>v); };
rep('/*LOGO*/', fs.readFileSync(path.join(D,'logo.png')).toString('base64'));
rep('/*RAW*/', raw.replace(/</g,'\\u003c'));
rep('/*JSZIP*/', fs.readFileSync(require.resolve('jszip/dist/jszip.min.js'),'utf8'));
for (const [k,f] of [['PARSERS','parsers'],['MODEL','model'],['COMPARATIVO','comparativo'],['CONTRATOS','contratos'],['FISICO','fisico'],['COMPRAS','compras'],['CAIXA','caixa'],['EXPORTER','exporter'],['APP','app']]) rep('/*'+k+'*/', fs.readFileSync(path.join(D,f+'.js'),'utf8'));
fs.writeFileSync(path.join(D,'dist.html'),t); console.log('ok',(t.length/1e6).toFixed(2),'MB');
