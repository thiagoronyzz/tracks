const $ = id => document.getElementById(id);
const input = $('search'), suggestions = $('suggestions'), errorBox = $('error');
let selected = null, timer = null, requestId = 0, currentResult = null;
const pct = n => (n * 100).toLocaleString('pt-BR', {maximumFractionDigits: 1}) + '%';
const dateBR = s => { const [y,m,d] = s.split('-'); return `${d}/${m}/${y}`; };
function showError(message) { errorBox.textContent = message; errorBox.hidden = !message; }
function clearResults() { $('results').hidden = true; $('empty').hidden = false; }
async function getJSON(url) { const r = await fetch(url); let data; try { data = await r.json(); } catch { throw Error('Não foi possível ler a resposta do servidor.'); } if (!r.ok) throw Error(data.error || 'Não foi possível concluir a solicitação.'); return data; }
function message(text) { suggestions.replaceChildren(); const node=document.createElement('div'); node.className='suggestion-message'; node.textContent=text; suggestions.append(node); suggestions.hidden=false; }
async function doSearch(q) {
  const id=++requestId;
  if(q.trim().length<2){suggestions.hidden=true;return;}
  message('Buscando ações...');
  try {
    const data=await getJSON('/api/search?q='+encodeURIComponent(q));
    if(id!==requestId || selected) return;
    suggestions.replaceChildren();
    if(!data.results.length){message('Nenhuma ação brasileira encontrada. Tente outro nome ou código.');return;}
    for(const item of data.results){
      const button=document.createElement('button'); button.type='button';button.className='suggestion';button.setAttribute('role','option');
      const left=document.createElement('div');const strong=document.createElement('strong');strong.textContent=item.symbol.replace(/\.SA$/,'');const small=document.createElement('small');small.textContent=item.name;left.append(strong,small);
      const exchange=document.createElement('span');exchange.textContent='B3  ↗';button.append(left,exchange);
      button.addEventListener('click',()=>{selected=item; input.value=`${item.symbol.replace(/\.SA$/,'')} · ${item.name}`; suggestions.hidden=true; $('clear').hidden=false; showError('');});
      suggestions.append(button);
    }
    suggestions.hidden=false;
  }catch(e){if(id===requestId) message(e.message);}
}
input.addEventListener('input',()=>{selected=null;requestId++;clearTimeout(timer);$('clear').hidden=!input.value;showError('');if(input.value.trim().length>=2) timer=setTimeout(()=>doSearch(input.value),300);else suggestions.hidden=true;});
input.addEventListener('focus',()=>{if(!selected && input.value.trim().length>=2) doSearch(input.value);});
input.addEventListener('keydown',e=>{if(e.key==='Escape')suggestions.hidden=true;if(e.key==='Enter'){e.preventDefault();if(!suggestions.hidden){const first=suggestions.querySelector('button');if(first)first.click();}else if(selected)$('analyze').click();}});
$('clear').addEventListener('click',()=>{input.value='';selected=null;requestId++;suggestions.hidden=true;$('clear').hidden=true;input.focus();showError('');});
document.addEventListener('click',e=>{if(!e.target.closest('.search-field')) suggestions.hidden=true;});
document.querySelectorAll('[data-query]').forEach(btn=>btn.addEventListener('click',()=>{selected=null;input.value=btn.dataset.query;$('clear').hidden=false;input.focus();doSearch(input.value);}));
$('analyze').addEventListener('click',async()=>{
  showError('');
  if(!selected){showError('Pesquise e selecione uma ação da lista para continuar.');input.focus();if(input.value.trim().length>=2)doSearch(input.value);return;}
  const symbol=selected.symbol,horizon=$('horizon').value;
  suggestions.hidden=true;$('loading').hidden=false;$('analyze').disabled=true;$('empty').hidden=true;$('results').hidden=true;
  try{const data=await getJSON('/api/analyze?symbol='+encodeURIComponent(symbol)+'&horizon='+horizon);currentResult=data;render(data);$('results').hidden=false;}
  catch(e){showError(e.message);clearResults();}
  finally{$('loading').hidden=true;$('analyze').disabled=false;}
});
function render(data){
 const m=data.metrics;
 $('asset-name').textContent=data.name; $('asset-symbol').textContent=data.symbol.replace(/\.SA$/,'');$('asset-date').textContent='Dados até '+dateBR(data.date);
 $('probability').textContent=(m.probability*100).toLocaleString('pt-BR',{maximumFractionDigits:1});$('prob-bar').style.width=(m.probability*100)+'%';
 $('prob-copy').textContent=`Chance estimada de o fechamento ajustado ser maior em ${data.horizon} pregões. Não é uma garantia de alta.`;
 $('price').textContent=new Intl.NumberFormat('pt-BR',{style:'currency',currency:data.currency||'BRL'}).format(data.price);
 $('accuracy').textContent=pct(m.accuracy);$('brier').textContent=m.brier.toLocaleString('pt-BR',{minimumFractionDigits:3,maximumFractionDigits:3});$('baseline').textContent=m.baseline_brier.toLocaleString('pt-BR',{minimumFractionDigits:3,maximumFractionDigits:3});$('sample').textContent=m.count.toLocaleString('pt-BR');
 $('test-date').textContent=`Testes: ${dateBR(m.start)} a ${dateBR(m.end)} (datas das previsões)`;
 const comparison=m.brier < m.baseline_brier ? 'Nos testes, o Brier do modelo foi menor que o da referência simples.' : 'Nos testes, o modelo não superou a referência simples pelo Brier.';
 $('assessment').textContent=comparison+' Isso não garante que o desempenho se repita. Confira também a calibração abaixo.';
 const tbody=$('calibration');tbody.replaceChildren();for(const b of m.bins){const tr=document.createElement('tr');for(const val of [`${b.min}% a ${b.max}%`,b.count,pct(b.predicted),pct(b.observed)]){const td=document.createElement('td');td.textContent=val;tr.append(td);}tbody.append(tr);}
 document.querySelectorAll('[data-days]').forEach(b=>b.classList.toggle('active',b.dataset.days==='252'));drawChart(252);
}
function drawChart(days){
 if(!currentResult)return;
 const values=currentResult.chart.slice(-days);if(values.length<2)return;
 const w=720,h=182,left=54,right=9,top=12,bottom=24, pw=w-left-right, ph=h-top-bottom;
 const vals=values.map(v=>v.close);let min=Math.min(...vals), max=Math.max(...vals);const pad=(max-min)*.12||1;min-=pad;max+=pad;
 const x=i=>left+(i/(values.length-1))*pw, y=v=>top+(max-v)/(max-min)*ph;
 const ns='http://www.w3.org/2000/svg', svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox',`0 0 ${w} ${h}`);svg.setAttribute('preserveAspectRatio','none');svg.setAttribute('role','img');svg.setAttribute('aria-label','Gráfico histórico do fechamento ajustado');
 function node(tag,attrs,text){const el=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))el.setAttribute(k,v);if(text!==undefined)el.textContent=text;svg.append(el);return el;}
 const defs=document.createElementNS(ns,'defs');defs.innerHTML='<linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#9fc99a" stop-opacity="0.33"/><stop offset="100%" stop-color="#9fc99a" stop-opacity="0.02"/></linearGradient>';svg.append(defs);
 for(let i=0;i<4;i++){let yy=top+i*ph/3;node('line',{x1:left,y1:yy,x2:w-right,y2:yy,stroke:'#edf2eb','stroke-width':'1'});node('text',{x:left-9,y:yy+4,'text-anchor':'end',fill:'#9caea0','font-size':'10'},(max-i*(max-min)/3).toLocaleString('pt-BR',{maximumFractionDigits:2}));}
 const coords=values.map((v,i)=>`${x(i).toFixed(2)},${y(v.close).toFixed(2)}`);node('path',{d:`M ${coords.join(' L ')} L ${x(values.length-1)},${top+ph} L ${left},${top+ph} Z`,fill:'url(#chartFill)'});node('polyline',{points:coords.join(' '),fill:'none',stroke:'#4b8c64','stroke-width':'2.5','stroke-linecap':'round','stroke-linejoin':'round','vector-effect':'non-scaling-stroke'});
 [0,Math.floor((values.length-1)/2),values.length-1].forEach((i,j)=>{const [yr,mo]=values[i].date.split('-');node('text',{x:x(i),y:h-3,'text-anchor':j===0?'start':j===2?'end':'middle',fill:'#9caea0','font-size':'10'},`${mo}/${yr}`);});
 $('real-chart').replaceChildren(svg);
}
document.querySelectorAll('[data-days]').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('[data-days]').forEach(x=>x.classList.remove('active'));b.classList.add('active');drawChart(Number(b.dataset.days));}));
