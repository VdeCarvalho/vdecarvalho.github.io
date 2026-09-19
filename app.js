'use strict';
const state={lang:'en',currency:'USD',payment:'',target:'payment',loans:[{id:1,amount:'',duration:'',durationUnit:'years',rate:'',rateUnit:'years'}],mode:'standard',result:null,page:0,all:false,dirty:false,error:null,nextId:2};
const $=s=>document.querySelector(s);
const escapeHTML=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const t=k=>I18N[state.lang][k];
const formatters=new Map();
function formatter(currency=false){const key=state.lang+(currency?state.currency:'');if(!formatters.has(key))formatters.set(key,new Intl.NumberFormat(state.lang,currency?{style:'currency',currency:state.currency}:{}));return formatters.get(key);}
const number=n=>formatter().format(n);
const money=n=>formatter(true).format(Math.abs(n)<1e-7?0:n);
function numeric(value){
  return String(value).trim().replace(/[٠-٩۰-۹०-९০-৯]/g,c=>{let n=c.charCodeAt(0);return String(n-(n>=0x9e6?0x9e6:n>=0x966?0x966:n>=0x6f0?0x6f0:0x660));}).replace(/[٫,]/g,'.');
}
const targets=['payment','duration','rate','interest','total','amount'];
const inverse=()=>['duration','rate','amount'].includes(state.target);
const targetLabel=target=>t(target==='payment'?'monthlyPayment':target);
const smoothNote=()=>state.target==='amount'?t('flexibleAmounts'):t('smoothMethod');
const globalRule=()=>state.target==='duration'?'commonDuration':state.target==='rate'?'commonRate':state.mode==='smooth'?'flexibleAmounts':'equalAmounts';
function globalPayment(){const v=numeric(state.payment);if(!/^\d+(?:\.\d{1,2})?$/.test(v))throw Error('invalidSolver');return v;}
function prepared(){return state.loans.map(l=>{const copy={...l};const keys=['amount','duration','rate'].filter(key=>key!==state.target);for(const key of keys){copy[key]=numeric(l[key]);const pattern=key==='duration'?/^\d+$/:/^\d+(?:\.\d{1,2})?$/;if(!pattern.test(copy[key]))throw Error('invalidSolver');}return copy;});}
function unitSelect(id,field,value,rate=false){return `<select id="${field}-${id}" data-field="${field}" aria-label="${t(rate?'rate':'duration')}"><option value="years" ${value==='years'?'selected':''}>${t(rate?'annual':'years')}</option><option value="months" ${value==='months'?'selected':''}>${t(rate?'monthly':'months')}</option></select>`;}
function field(l,key){
  const unknown=key===state.target,unit=key==='duration'||key==='rate',label=key==='payment'?'monthlyPayment':key;
  const input=unknown?`<span class="computed">${t('computed')}</span>`:`<input id="${key}-${l.id}" data-field="${key}" type="text" inputmode="${key==='duration'?'numeric':'decimal'}" value="${escapeHTML(l[key])}" required autocomplete="off">`;
  return `<div class="${unknown?'unknown-field':''}"><label ${unknown?'':`for="${key}-${l.id}"`}>${t(label)}${key==='rate'?' (%)':''}</label>${unit?`<div class="pair">${input}${unitSelect(l.id,key+'Unit',l[key+'Unit'],key==='rate')}</div>`:`<div class="amount-wrap">${input}${unknown?'':`<span class="currency-tag">${state.currency}</span>`}</div>`}</div>`;
}
function loanForm(l,index){return `<section class="loan" data-id="${l.id}" aria-labelledby="loan-title-${l.id}"><div class="loan-title"><h3 id="loan-title-${l.id}"><span class="loan-number">${number(index+1)}</span>${t('loan')}</h3>${state.loans.length>1?`<button type="button" class="remove" data-remove="${l.id}" aria-label="${t('remove')} ${number(index+1)}">${t('remove')} ×</button>`:''}</div><div class="fields ${''}">${['amount','duration','rate'].map(key=>field(l,key)).join('')}</div></section>`;}
function durationText(n,unit){if(unit==='months')return number(n)+' '+t('months');return number(Math.floor(n/12))+' '+t('years')+(n%12?' · '+number(n%12)+' '+t('months'):'');}
const rateText=(r,unit)=>new Intl.NumberFormat(state.lang,{maximumFractionDigits:6}).format(r*(unit==='years'?1200:100))+'% '+t(unit==='years'?'annual':'monthly');
function solvedValue(l,i){return state.target==='rate'?rateText(l.r,state.loans[i].rateUnit):state.target==='duration'?durationText(l.n,state.loans[i].durationUnit):money(l.p);}
function primaryResult(r){if(state.target==='interest')return money(r.interest);if(state.target==='total')return money(r.total);if(state.target==='amount')return money(r.totalPrincipal);if(state.target==='duration')return durationText(r.months,state.loans.every(l=>l.durationUnit==='years')?'years':'months');if(state.target==='rate')return solvedValue(r.solved[0],0);return (r.approximateSmooth?money(Math.min(...r.periods.map(p=>p.payment)))+' – '+money(Math.max(...r.periods.map(p=>p.payment))):money(r.rows[0].payment))+` <small>${t('perMonth')}</small>`;}
function periodName(p){const years=state.loans.every(l=>l.durationUnit==='years')&&(p.start-1)%12===0&&p.end%12===0;return `${t(years?'years':'months')} ${number(years?(p.start-1)/12+1:p.start)}–${number(years?p.end/12:p.end)}`;}
function results(){
  const r=state.result;if(!r)return state.dirty?`<div class="empty" role="status">${t('dirty')}</div>`:'';
  return `<section class="result" aria-labelledby="result-heading"><div class="result-top"><div><div class="eyebrow" id="result-heading">${targetLabel(state.target)}</div><div class="payment">${primaryResult(r)}</div>${state.target==='payment'?`<div class="hint">${periodName(r.approximateSmooth?{start:1,end:r.months}:r.periods[0])}</div>`:''}</div><span class="badge">${t(r.approximateSmooth?'approximateLabel':state.mode==='smooth'?'smooth':'standard')}</span></div>${r.approximateSmooth?`<p class="amortization-notice" role="note">${t('approximateNotice')}</p>`:''}<dl class="stats"><div><dt>${t('borrowed')}</dt><dd>${money(r.totalPrincipal)}</dd></div><div><dt>${t('interest')}</dt><dd>${money(r.interest)}</dd></div><div><dt>${t('total')}</dt><dd>${money(r.total)}</dd></div></dl></section><section class="card"><h2>${t('phases')}</h2>${r.periods.map(p=>`<div class="period"><div class="period-label"><span>${periodName(p)}</span><div class="period-bar"><i style="width:${Math.max(2,p.payment/Math.max(...r.periods.map(x=>x.payment))*100)}%"></i></div></div><strong>${money(p.payment)} <small>${t('perMonth')}</small></strong></div>`).join('')}</section><section class="card table-card" aria-labelledby="schedule-title"><div class="table-header"><h2 id="schedule-title">${t('schedule')}</h2><span class="hint">${number(r.months)} ${t('months').toLowerCase()}</span></div><div id="table-area">${table()}</div></section><button type="button" class="calculate download" id="download-pdf">${t('downloadPdf')}</button><p class="error" id="pdf-error" role="alert"></p>`;
}
function table(){
  const r=state.result,start=state.all?0:state.page*100,end=state.all?r.rows.length:Math.min(start+100,r.rows.length);
  return `<div class="table-scroll" tabindex="0" role="region" aria-label="${t('schedule')}"><table><thead><tr><th scope="col">${t('month')}</th>${state.loans.length>1?state.loans.map((_,i)=>`<th scope="col">${t('loan')} ${number(i+1)}</th>${r.hasNegativeAmortization?`<th scope="col">${t('balance')} · ${number(i+1)}</th>`:''}`).join(''):''}<th scope="col">${t('payment')}</th><th scope="col">${t('periodInterest')}</th><th scope="col">${t('principal')}</th><th scope="col">${t('balance')}</th></tr></thead><tbody>${r.rows.slice(start,end).map(row=>`<tr><td>${number(row.month)}</td>${state.loans.length>1?row.payments.map((p,i)=>`<td>${money(p)}</td>${r.hasNegativeAmortization?`<td>${money(row.loanBalances[i])}</td>`:''}`).join(''):''}<td><strong>${money(row.payment)}</strong></td><td>${money(row.interest)}</td><td>${money(row.principal)}</td><td>${money(row.balance)}</td></tr>`).join('')}</tbody><tfoot><tr><th scope="row" colspan="${state.loans.length>1?state.loans.length*(r.hasNegativeAmortization?2:1)+1:1}">${t('totalRow')}</th><td>${money(r.total)}</td><td>${money(r.interest)}</td><td>${money(r.totalPrincipal)}</td><td>${money(0)}</td></tr></tfoot></table></div><div class="pagination"><span>${number(start+1)}–${number(end)} / ${number(r.months)}</span>${!state.all&&r.months>100?`<button type="button" data-page="prev" ${state.page===0?'disabled':''} aria-label="${t('previous')}">‹</button><button type="button" data-page="all">${t('all')}</button><button type="button" data-page="next" ${end===r.months?'disabled':''} aria-label="${t('next')}">›</button>`:''}</div>`;
}
function render(){
  document.documentElement.lang=state.lang;document.documentElement.dir=['ar','ur'].includes(state.lang)?'rtl':'ltr';document.title='Loan Calculator';document.querySelector('meta[name="description"]').content=t('intro');
  const names=new Intl.DisplayNames([state.lang],{type:'currency'});
  const ad=side=>`<aside class="ad" id="ad-${side}" aria-label="${t('ad')}"><span>${t('ad')}</span><small>160 × 600</small><small>${t('reserved')}</small><!-- Insert approved AdSense unit here. See README. --></aside>`;
  $('#app').innerHTML=`<header><h1 class="brand"><img src="favicon.svg" alt="">Loan Calculator</h1></header><div class="layout">${ad('left')}<main><aside class="ad-mobile" id="ad-mobile" aria-label="${t('ad')}"><span>${t('ad')}</span><small>${t('reserved')}</small><!-- Mobile AdSense slot --></aside><form id="calculator" class="card" novalidate><div class="preferences"><div><label for="language">${t('language')}</label><select id="language">${LANGUAGES.map(([code,name])=>`<option value="${code}" ${code===state.lang?'selected':''}>${name}</option>`).join('')}</select></div><div><label for="currency">${t('currency')}</label><select id="currency">${CURRENCIES.map(code=>`<option value="${code}" ${code===state.currency?'selected':''}>${code} — ${escapeHTML(names.of(code))}</option>`).join('')}</select></div></div><div class="target-control"><label for="solve-for">${t('solveFor')}</label><select id="solve-for">${targets.map(target=>`<option value="${target}" ${state.target===target?'selected':''}>${targetLabel(target)}</option>`).join('')}</select></div>${inverse()?`<div class="payment-field"><label for="global-payment">${t('monthlyPayment')}</label><div class="amount-wrap"><input id="global-payment" type="text" inputmode="decimal" value="${escapeHTML(state.payment)}" required><span class="currency-tag">${state.currency}</span></div></div>`:''}<div class="section-title"><h2>${t('loans')}</h2></div><div id="loans">${state.loans.map(loanForm).join('')}</div><button class="add" id="add-loan" type="button">＋ ${t('add')}</button>${state.target==='duration'?'':`<div class="mode-row"><span class="label" id="mode-label">${t('mode')}</span><div class="segments" role="radiogroup" aria-labelledby="mode-label">${['standard','smooth'].map(mode=>`<label><input type="radio" name="mode" value="${mode}" ${state.mode===mode?'checked':''}>${t(mode)}</label>`).join('')}</div>${state.mode==='smooth'?`<p class="hint">${smoothNote()}</p>`:''}</div>`}<div class="error" role="alert" id="error">${state.error?t(state.error):''}</div><button class="calculate" type="submit">${t('compute')} <span aria-hidden="true">↗</span></button></form><div id="results" aria-live="polite">${results()}</div><details class="card"><summary>${t('assumptions')}</summary>${[NOTES[state.lang][0],smoothNote(),NOTES[state.lang][2],...(inverse()?[t(globalRule()),t('globalNormal')]:[]),t('durationNote'),t('rateNote')].map(p=>`<p>${p}</p>`).join('')}<a href="https://en.wikipedia.org/wiki/List_of_languages_by_total_number_of_speakers" target="_blank" rel="noopener noreferrer">${t('source')} ↗</a></details><footer>${t('footer')}</footer></main>${ad('right')}</div>`;
}
function invalidate(){state.result=null;state.dirty=true;state.error=null;state.page=0;state.all=false;$('#results').innerHTML=results();$('#error').textContent='';}
document.addEventListener('input',e=>{if(e.target.id==='global-payment'){state.payment=e.target.value;invalidate();}if(e.target.matches('[data-field]')){const l=state.loans.find(l=>l.id===Number(e.target.closest('.loan').dataset.id));l[e.target.dataset.field]=e.target.value;invalidate();}});
document.addEventListener('change',e=>{
  if(e.target.id==='solve-for'){state.target=e.target.value;if(state.target==='duration')state.mode='standard';invalidate();render();$('#solve-for').focus();}
  if(e.target.id==='language'){state.lang=e.target.value;render();$('#language').focus();}
  if(e.target.id==='currency'){state.currency=e.target.value;render();$('#currency').focus();}
  if(e.target.name==='mode'){state.mode=e.target.value;invalidate();render();$(`input[name="mode"][value="${state.mode}"]`).focus();}
});
document.addEventListener('click',e=>{
  if(e.target.closest('#add-loan')){const l={id:state.nextId++,amount:'',duration:'',durationUnit:'years',rate:'',rateUnit:'years'};state.loans.push(l);invalidate();render();$(`#loans .loan:last-child input`)?.focus();}
  const remove=e.target.closest('[data-remove]');if(remove){state.loans=state.loans.filter(l=>l.id!==Number(remove.dataset.remove));invalidate();render();$('#add-loan').focus();}
  const paging=e.target.closest('[data-page]');if(paging&&state.result){if(paging.dataset.page==='all')state.all=true;else state.page+=paging.dataset.page==='next'?1:-1;$('#table-area').innerHTML=table();$('.table-scroll').focus({preventScroll:true});}
});
document.addEventListener('submit',e=>{if(e.target.id!=='calculator')return;e.preventDefault();try{state.result=inverse()?LoanMath.solveGlobal(prepared(),state.target,globalPayment(),state.mode==='smooth'):LoanMath.calculate(prepared(),state.mode==='smooth');state.dirty=false;state.error=null;state.page=0;state.all=false;render();$('#results').scrollIntoView({behavior:'auto',block:'start'});}catch(error){state.result=null;state.error=['infeasible','noPayoff','noRate','termLimit','invalidSolver'].includes(error.message)?error.message:'invalidSolver';render();$('#error').setAttribute('tabindex','-1');$('#error').focus();}});
render();
if(document.modelContext?.registerTool){
  const lifetime=new AbortController();
  try{Promise.resolve(document.modelContext.registerTool({name:'calculate_current_loans',title:'Calculate current loans',description:'Calculate the selected unknown from the loan values and payment mode currently entered in the visible form, then update the payment summary and monthly schedule.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute(input){if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length)throw Error('Expected an empty object.');$('#calculator').requestSubmit();if(state.error)return {error:t(state.error)};return {target:state.target,solved:state.result.solved,currency:state.currency,months:state.result.months,initialPayment:state.result.rows[0].payment,totalRepaid:state.result.total,totalInterest:state.result.interest};}},{signal:lifetime.signal})).catch(()=>{});}catch{}
  window.addEventListener('pagehide',()=>lifetime.abort(),{once:true});
}
function pdfReport(){
  const r=state.result,inputs=state.loans.map((l,i)=>{
    const solved=r.solved?.[i];
    return [t('loan')+' '+number(i+1),...(state.target==='amount'?[]:[t('amount')+': '+money(Number(numeric(l.amount)))]),...(state.target==='duration'?[]:[t('duration')+': '+durationText(Number(numeric(l.duration))*(l.durationUnit==='years'?12:1),l.durationUnit)]),...(state.target==='rate'?[]:[t('rate')+': '+rateText(LoanMath.monthlyRate(Number(numeric(l.rate)),l.rateUnit),l.rateUnit)])];
  });
  const summary=[[t('currency'),state.currency],[t('mode'),t(r.approximateSmooth?'approximateLabel':state.mode==='smooth'?'smooth':'standard')],[t('borrowed'),money(r.totalPrincipal)],[t('interest'),money(r.interest)],[t('total'),money(r.total)]];
  
  if(inverse())summary.push([t('monthlyPayment'),money(Number(numeric(state.payment)))]);
  r.periods.forEach(p=>summary.push([periodName(p),money(p.payment)+' '+t('perMonth')]));
  const notes=[NOTES[state.lang][0],NOTES[state.lang][2]];
  if(inverse())notes.push(t(globalRule()),state.target==='duration'?t('durationNote'):t('globalNormal'));
  if(state.target==='rate')notes.push(t('rateNote'));
  if(state.mode==='smooth')notes.push(smoothNote());

  const tables=[{title:t('schedule')+' · '+state.currency,headers:[t('month'),t('payment'),t('periodInterest'),t('principal'),t('balance')],widths:[.1,.23,.22,.22,.23],rows:r.rows.map(row=>[number(row.month),money(row.payment),money(row.interest),money(row.principal),money(row.balance)])}];
  if(!inverse()&&state.loans.length>1)state.loans.forEach((l,i)=>tables.push({title:t('loan')+' '+number(i+1)+' · '+state.currency,headers:[t('month'),t('payment'),t('balance')],widths:[.14,.43,.43],rows:r.rows.map(row=>[number(row.month),money(row.payments[i]),money(row.loanBalances[i])])}));
  return {notice:r.approximateSmooth?t('approximateNotice'):'',lang:state.lang,rtl:['ar','ur'].includes(state.lang),downloadLabel:t('downloadPdf'),title:t('resultLabel'),primary:{label:targetLabel(state.target),value:primaryResult(r).replace(/<[^>]+>/g,'')},date:new Intl.DateTimeFormat(state.lang,{dateStyle:'long'}).format(new Date()),summary,inputs,notes,tables};
}
document.addEventListener('click',async e=>{
  const button=e.target.closest('#download-pdf');if(!button||button.tagName==='A'||!state.result||button.disabled)return;
  const report=pdfReport();button.disabled=true;button.textContent=t('generating');$('#pdf-error').textContent='';
  try{await LoanPDF.download(report);}catch(error){if($('#pdf-error'))$('#pdf-error').textContent=t('pdfError');}
  finally{button.disabled=false;button.textContent=t('downloadPdf');}
});
