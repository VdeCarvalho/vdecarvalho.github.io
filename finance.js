(function(root){
  'use strict';
  const factor=(r,n)=>r===0?n:-Math.expm1(-n*Math.log1p(r))/r;
  const monthlyRate=(rate,unit)=>unit==='years'?rate/1200:rate/100;
  function normalize(loans){
    if(!loans.length)throw Error('invalid');
    return loans.map(l=>{
      const p=Number(l.amount),duration=Number(l.duration),rate=Number(l.rate);
      const n=duration*(l.durationUnit==='years'?12:1),r=monthlyRate(rate,l.rateUnit);
      if(!['years','months'].includes(l.durationUnit)||!['years','months'].includes(l.rateUnit)||!String(l.amount).trim()||!String(l.duration).trim()||!String(l.rate).trim()||!Number.isFinite(p)||p<=0||p>1e12||!Number.isInteger(duration)||duration<=0||n>12000||!Number.isFinite(rate)||rate<0||rate>100||Math.abs(rate*100-Math.round(rate*100))>1e-7)throw Error('invalid');
      return {p,n,r,a:p/factor(r,n)};
    });
  }
  function calculate(raw,smooth=false){
    return schedule(normalize(raw),smooth);
  }
// Two-phase simplex for max(c*x), A*x <= b, x >= 0.
// Amounts and present-value equations are scaled before entering the tableau.
function linearProgram(A,b,c){
  const m=b.length,n=c.length,eps=1e-10;
  const D=Array.from({length:m+2},()=>Array(n+2).fill(0));
  const B=Array.from({length:m},(_,i)=>n+i),V=Array.from({length:n+1},(_,i)=>i);V[n]=-1;
  for(let i=0;i<m;i++){for(let j=0;j<n;j++)D[i][j]=A[i][j];D[i][n]=-1;D[i][n+1]=b[i];}
  for(let j=0;j<n;j++)D[m][j]=-c[j];D[m+1][n]=1;
  function pivot(r,s){
    const inv=1/D[r][s];
    for(let i=0;i<m+2;i++)if(i!==r)for(let j=0;j<n+2;j++)if(j!==s)D[i][j]-=D[r][j]*D[i][s]*inv;
    for(let j=0;j<n+2;j++)if(j!==s)D[r][j]*=inv;
    for(let i=0;i<m+2;i++)if(i!==r)D[i][s]*=-inv;
    D[r][s]=inv;[B[r],V[s]]=[V[s],B[r]];
  }
  function simplex(phase){
    const row=phase===1?m+1:m;
    for(let iter=0;iter<100000;iter++){
      let s=-1;
      for(let j=0;j<=n;j++){if(phase===2&&V[j]===-1)continue;if(s===-1||D[row][j]<D[row][s]-eps||(Math.abs(D[row][j]-D[row][s])<=eps&&V[j]<V[s]))s=j;}
      if(D[row][s]>=-eps)return true;
      let r=-1;
      for(let i=0;i<m;i++)if(D[i][s]>eps){const ratio=D[i][n+1]/D[i][s],best=r<0?Infinity:D[r][n+1]/D[r][s];if(r<0||ratio<best-eps||(Math.abs(ratio-best)<=eps&&B[i]<B[r]))r=i;}
      if(r<0)return false;pivot(r,s);
    }
    throw Error('infeasible');
  }
  let r=0;for(let i=1;i<m;i++)if(D[i][n+1]<D[r][n+1])r=i;
  if(D[r][n+1]<-eps){pivot(r,n);if(!simplex(1)||D[m+1][n+1]<-eps||Math.abs(D[m+1][n+1])>eps)throw Error('infeasible');
    for(let i=0;i<m;i++)if(B[i]===-1){let s=-1;for(let j=0;j<=n;j++)if(Math.abs(D[i][j])>eps&&(s<0||V[j]<V[s]))s=j;if(s>=0)pivot(i,s);}
  }
  if(!simplex(2))throw Error('infeasible');
  const x=Array(n).fill(0);for(let i=0;i<m;i++)if(B[i]>=0&&B[i]<n)x[B[i]]=D[i][n+1];return x;
}
function smoothPlan(loans,peakOnly=false,budget=null){
  const ends=[...new Set(loans.map(l=>l.n))].sort((a,b)=>a-b),N=ends.at(-1);
  const phases=ends.map((end,j)=>({start:j?ends[j-1]:0,end,length:end-(j?ends[j-1]:0)}));
  const vars=[];loans.forEach((l,i)=>phases.forEach((phase,j)=>{if(phase.end<=l.n)vars.push({i,j});}));
  const upper=vars.length,lower=upper+1,size=lower+1;
  const scale=loans.reduce((s,l)=>s+l.p/factor(l.r,l.n),0),A=[],b=[];
  function add(row,rhs){A.push(row);b.push(rhs);}
  loans.forEach((l,i)=>{const row=Array(size).fill(0);vars.forEach((v,k)=>{if(v.i===i){const phase=phases[v.j];row[k]=Math.exp(-phase.start*Math.log1p(l.r))*factor(l.r,phase.length)/factor(l.r,l.n);}});const rhs=l.p/factor(l.r,l.n)/scale;add(row,rhs);add(row.map(x=>-x),-rhs);});
  phases.forEach((phase,j)=>{const row=Array(size).fill(0);vars.forEach((v,k)=>{if(v.j===j)row[k]=1;});row[upper]=-1;add(row,0);const low=row.map(x=>-x);low[upper]=0;low[lower]=1;add(low,0);});
  if(budget!==null){const row=Array(size).fill(0);row[upper]=1;add(row,budget/scale);}
  const objective=Array(size).fill(0);objective[upper]=-1;if(!peakOnly)objective[lower]=1;
  let x=linearProgram(A,b,objective);
  if(peakOnly)return x[upper]*scale;
  // Tie-break by total paid, without increasing the optimal spread.
  const spread=Math.max(0,x[upper]-x[lower]);const bound=Array(size).fill(0);bound[upper]=1;bound[lower]=-1;add(bound,spread+1e-10);
  const cost=Array(size).fill(0);vars.forEach((v,k)=>cost[k]=-phases[v.j].length/N);x=linearProgram(A,b,cost);
  const parts=phases.map(()=>loans.map(()=>0));vars.forEach((v,k)=>parts[v.j][v.i]=Math.max(0,x[k])*scale);
  const paths=loans.map((l,i)=>{const path=Array(N+1).fill(0);for(let j=phases.length-1;j>=0;j--){const phase=phases[j];for(let m=phase.end;m>phase.start;m--)path[m-1]=(path[m]+parts[j][i])/(1+l.r);}if(Math.abs(path[0]-l.p)>Math.max(.005,l.p*1e-8))throw Error('infeasible');return path;});
  const rows=[];let hasNegativeAmortization=false;
  phases.forEach((phase,j)=>{for(let m=phase.start;m<phase.end;m++){const payments=[...parts[j]],payment=payments.reduce((s,v)=>s+v,0),interest=loans.reduce((s,l,i)=>{const intr=paths[i][m]*l.r;if(payments[i]<intr-1e-7)hasNegativeAmortization=true;return s+intr;},0),loanBalances=paths.map(path=>path[m+1]);rows.push({month:m+1,payments,payment,interest,principal:payment-interest,balance:loanBalances.reduce((s,v)=>s+v,0),loanBalances});}});
  const periods=[];for(const row of rows){const prev=periods.at(-1);if(prev&&Math.abs(prev.payment-row.payment)<.005)prev.end=row.month;else periods.push({start:row.month,end:row.month,payment:row.payment});}
  const totalPrincipal=loans.reduce((s,l)=>s+l.p,0),total=rows.reduce((s,row)=>s+row.payment,0),values=periods.map(p=>p.payment);
  return {rows,periods,total,totalPrincipal,interest:total-totalPrincipal,months:N,hasNegativeAmortization,approximateSmooth:Math.max(...values)-Math.min(...values)>.005,smoothingMethod:'minimumPhaseRange'};
}

  function schedule(loans,smooth=false,budget=null){return smooth?smoothPlan(loans,false,budget):originalSchedule(loans,false);}
  function originalSchedule(loans,smooth=false){
    const N=Math.max(...loans.map(l=>l.n));
    const balances=loans.map(l=>l.p),rows=[];
    let hasNegativeAmortization=false;
    for(let m=1;m<=N;m++){
      const payments=loans.map(l=>m<=l.n?l.a:0);
      let interest=0,principal=0;
      for(let i=0;i<loans.length;i++){
        const l=loans[i];if(m>l.n)continue;
        const intr=balances[i]*l.r;
        // Adjust final installment only for floating-point residuals.
        if(m===l.n)payments[i]=balances[i]+intr;
        const capital=payments[i]-intr;
        if(capital<-1e-7)hasNegativeAmortization=true;
        // Remaining present value avoids accumulated floating-point error
        // for very long terms and large rates.
        balances[i]=l.a*factor(l.r,l.n-m);
        if(balances[i]<-0.01||!Number.isFinite(balances[i]))throw Error('infeasible');
        if(Math.abs(balances[i])<1e-7)balances[i]=0;
        interest+=intr;principal+=capital;
      }
      rows.push({month:m,payments,payment:payments.reduce((a,b)=>a+b,0),interest,principal,balance:balances.reduce((a,b)=>a+b,0),loanBalances:[...balances]});
    }
    const totalPrincipal=loans.reduce((s,l)=>s+l.p,0),total=rows.reduce((s,r)=>s+r.payment,0);
    const periods=[];
    for(const row of rows){const previous=periods[periods.length-1];if(previous&&Math.abs(previous.payment-row.payment)<.005)previous.end=row.month;else periods.push({start:row.month,end:row.month,payment:row.payment});}
    return {rows,periods,total,totalPrincipal,interest:total-totalPrincipal,months:N,hasNegativeAmortization};
  }
  function solve(raw,target){
    if(!['duration','rate','amount'].includes(target))throw Error('invalid');
    if(!raw.length)throw Error('invalid');
    const solved=raw.map(l=>{
      const read=(key,positive=true)=>{const value=Number(l[key]);if(l[key]===undefined||!String(l[key]).trim()||!Number.isFinite(value)||(positive?value<=0:value<0))throw Error('invalid');return value;};
      if(!['years','months'].includes(l.durationUnit)||!['years','months'].includes(l.rateUnit))throw Error('invalid');
      const a=read('payment');if(a>1e12)throw Error('invalid');
      let p=target==='amount'?0:read('amount'),n=target==='duration'?0:read('duration')*(l.durationUnit==='years'?12:1),r=target==='rate'?0:monthlyRate(read('rate',false),l.rateUnit);
      if(p>1e12||(target!=='duration'&&(!Number.isInteger(Number(l.duration))||n>12000))||(target!=='rate'&&(Number(l.rate)>100||Math.abs(Number(l.rate)*100-Math.round(Number(l.rate)*100))>1e-7)))throw Error('invalid');
      if(target==='amount')p=a*factor(r,n);
      if(target==='duration'){
        if(a<=p*r)throw Error('noPayoff');
        const exact=r===0?p/a:-Math.log((a-p*r)/a)/Math.log1p(r);
        if(!Number.isFinite(exact)||exact>12000+1e-8)throw Error('termLimit');
        n=Math.max(1,Math.ceil(exact-1e-9));
      }
      if(target==='rate'){
        const zero=p/n,tolerance=Math.max(1e-10,zero*1e-12);
        if(a<zero-tolerance)throw Error('noRate');
        if(Math.abs(a-zero)>tolerance){let lo=0,hi=a/p;for(let k=0;k<100;k++){const mid=(lo+hi)/2;if(p/factor(mid,n)>a)hi=mid;else lo=mid;}r=(lo+hi)/2;}
      }
      if(!Number.isFinite(p)||p<=0||p>1e12)throw Error('invalid');
      return {p,n,r,a};
    });
    const N=Math.max(...solved.map(l=>l.n)),rows=[];
    // Backward present values keep long amortization schedules numerically stable.
    const paths=solved.map(l=>{
      const last=target==='duration'?(l.r===0?l.p-l.a*(l.n-1):l.a/l.r*(-Math.expm1((l.n-1)*Math.log1p(l.r)+Math.log((l.a-l.p*l.r)/l.a)))*(1+l.r)):l.a;
      if(!Number.isFinite(last)||last<=0||last>l.a+.01)throw Error('invalid');
      const balances=Array(l.n+1);balances[l.n]=0;
      for(let m=l.n;m>=1;m--)balances[m-1]=(balances[m]+(m===l.n?last:l.a))/(1+l.r);
      if(Math.abs(balances[0]-l.p)>Math.max(.01,l.p*1e-9))throw Error('invalid');
      return {last,balances};
    });
    for(let m=1;m<=N;m++){
      let interest=0,principal=0,balance=0;
      const payments=solved.map((l,i)=>{if(m>l.n)return 0;const path=paths[i],payment=m===l.n?path.last:l.a,intr=path.balances[m-1]*l.r;interest+=intr;principal+=payment-intr;balance+=path.balances[m];return payment;});
      rows.push({month:m,payments,payment:payments.reduce((s,p)=>s+p,0),interest,principal,balance,loanBalances:paths.map(path=>path.balances[Math.min(m,path.balances.length-1)])});
    }
    const totalPrincipal=solved.reduce((s,l)=>s+l.p,0),total=rows.reduce((s,r)=>s+r.payment,0),periods=[];
    for(const row of rows){const previous=periods[periods.length-1];if(previous&&Math.abs(previous.payment-row.payment)<.005)previous.end=row.month;else periods.push({start:row.month,end:row.month,payment:row.payment});}
    return {rows,periods,total,totalPrincipal,interest:total-totalPrincipal,months:N,solved:solved.map((l,i)=>({...l,last:paths[i].last}))};
  }
  function solveGlobal(raw,target,payment,smooth=false){
    const a=Number(payment);
    if(!raw.length||!String(payment).trim()||!Number.isFinite(a)||a<=0||a>1e12)throw Error('invalidSolver');
    // Validate only the known fields using neutral values for the unknown.
    const known=normalize(raw.map(l=>({...l,amount:target==='amount'?1:l.amount,duration:target==='duration'?1:l.duration,durationUnit:target==='duration'?'months':l.durationUnit,rate:target==='rate'?0:l.rate})));
    if(target==='duration'){
      const interest=known.reduce((s,l)=>s+l.p*l.r,0);
      if(a<=interest)throw Error('noPayoff');
      const cost=n=>known.reduce((s,l)=>s+l.p/factor(l.r,n),0);
      if(cost(12000)>a+Math.max(1e-8,a*1e-12))throw Error('termLimit');
      let lo=0,hi=12000;for(let i=0;i<100;i++){const mid=(lo+hi)/2;if(cost(mid)>a)lo=mid;else hi=mid;}
      const exact=(lo+hi)/2,weights=known.map(l=>l.p/factor(l.r,exact));
      const r=solve(raw.map((l,i)=>({...l,payment:weights[i]})),'duration');
      r.globalPayment=a;r.globalRule='commonDuration';return r;
    }
    const N=Math.max(...known.map(l=>l.n));
    if(target==='amount'&&smooth){
      // Allocate the budget equally to active contracts, then discount each
      // contract's payments at its own rate to find its initial principal.
      const payments=Array.from({length:N},(_,m)=>{const active=known.filter(l=>m<l.n).length;return known.map(l=>m<l.n?a/active:0);});
      const paths=known.map((l,i)=>{const balances=Array(N+1).fill(0);for(let m=l.n;m>0;m--)balances[m-1]=(balances[m]+payments[m-1][i])/(1+l.r);if(!Number.isFinite(balances[0])||balances[0]<=0||balances[0]>1e12)throw Error('invalidSolver');return balances;});
      let hasNegativeAmortization=false;
      const rows=payments.map((parts,m)=>{const loanBalances=paths.map(path=>path[m+1]),interest=known.reduce((s,l,i)=>s+paths[i][m]*l.r,0),payment=parts.reduce((s,p)=>s+p,0);if(known.some((l,i)=>parts[i]<paths[i][m]*l.r-1e-7))hasNegativeAmortization=true;return {month:m+1,payments:parts,payment,interest,principal:payment-interest,balance:loanBalances.reduce((s,b)=>s+b,0),loanBalances};});
      const totalPrincipal=paths.reduce((s,path)=>s+path[0],0),total=rows.reduce((s,row)=>s+row.payment,0);
      return {rows,periods:[{start:1,end:N,payment:a}],total,totalPrincipal,interest:total-totalPrincipal,months:N,hasNegativeAmortization,globalPayment:a,globalRule:'flexibleAmounts',solved:known.map((l,i)=>({...l,p:paths[i][0],a:payments[0][i],last:payments[l.n-1][i]}))};
    }
    let loans;
    if(target==='rate'){
      
      const cost=r=>smooth?smoothPlan(known.map(l=>({...l,r})),true):known.reduce((s,l)=>s+l.p/factor(r,l.n),0);
      const tolerance=Math.max(1e-8,a*1e-12);
      if(a<cost(0)-tolerance)throw Error('noRate');
      let rate=0;
      if(a>cost(0)+tolerance){let lo=0,hi=a/Math.min(...known.map(l=>l.p));for(let i=0;i<100;i++){const mid=(lo+hi)/2;if(cost(mid)>a)hi=mid;else lo=mid;}rate=(lo+hi)/2;}
      loans=known.map(l=>({...l,r:rate,a:l.p/factor(rate,l.n)}));
    }else if(target==='amount'){
      // Equal principal shares, explicitly stated in the UI.
      let coefficient;
      coefficient=known.reduce((s,l)=>s+l.a,0);
      const principal=a/coefficient;
      if(!Number.isFinite(principal)||principal<=0||principal>1e12)throw Error('invalidSolver');
      loans=known.map(l=>({...l,p:principal,a:principal/factor(l.r,l.n)}));
    }else throw Error('invalidSolver');
    const result=schedule(loans,smooth,target==='rate'&&smooth?a:null);
    result.solved=loans.map((l,i)=>({...l,last:result.rows[l.n-1].payments[i]}));
    result.globalPayment=a;result.globalRule=target==='rate'?'commonRate':'equalAmounts';
    return result;
  }
  root.LoanMath={factor,monthlyRate,normalize,calculate,solve,solveGlobal};
  if(typeof module!=='undefined')module.exports=root.LoanMath;
})(typeof globalThis!=='undefined'?globalThis:window);
