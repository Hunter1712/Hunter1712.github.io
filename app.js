const $=id=>document.getElementById(id);
const fetchJSON=async url=>{const r=await fetch(url);if(!r.ok)throw new Error(`Failed to load ${url}`);return r.json()};

const S={leagues:[],currentLeague:null,currentView:'predict',teams:[],season:null,predictionsCache:{},standingsCache:{},resultsCache:{}};

const SUN='<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>';
const MOON='<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>';

function initTheme(){
  const saved=localStorage.getItem('yaza-theme');
  const pref=window.matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light';
  const t=saved||pref;
  document.documentElement.setAttribute('data-theme',t);
  const btn=$('theme-toggle');
  if(btn)btn.innerHTML=t==='dark'?MOON:SUN;
}
function toggleTheme(){
  const cur=document.documentElement.getAttribute('data-theme');
  const nxt=cur==='dark'?'light':'dark';
  document.documentElement.setAttribute('data-theme',nxt);
  localStorage.setItem('yaza-theme',nxt);
  const btn=$('theme-toggle');
  if(btn)btn.innerHTML=nxt==='dark'?MOON:SUN;
}

async function navigate(view){
  S.currentView=view;
  document.querySelectorAll('.nav-tab').forEach(t=>t.classList.toggle('active',t.dataset.view===view));
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  const pg=$(('page-'+view));
  if(pg){pg.classList.add('active');pg.innerHTML='<div class="dots"><span></span><span></span><span></span></div>';}
  if(!S.currentLeague)return;
  if(view==='predict')renderPredictPage();
  else if(view==='standings')renderStandingsPage();
  else if(view==='results')renderResultsPage(1);
}

function selSeason(seasons,cur,action){
  if(!seasons||seasons.length<2)return'';
  const id='ss-'+(cur||'none').replace(/[^a-z0-9]/gi,'');
  return`<select class="sel" id="${id}" data-action="${action}">${seasons.map(s=>`<option value="${s}"${s===cur?' selected':''}>${s}</option>`).join('')}</select>`;
}
document.addEventListener('change',function(e){
  const sel=e.target;
  if(!sel.id||!sel.id.startsWith('ss-'))return;
  S.season=sel.value;
  const action=sel.dataset.action;
  if(action==='standings')renderStandingsPage();
  else if(action==='results')renderResultsPage(1);
});

function leagueSelectHTML(){
  const groups={};
  S.leagues.forEach(l=>{
    if(!groups[l.country_id])groups[l.country_id]={name:l.country,flag:l.flag,leagues:[]};
    groups[l.country_id].leagues.push(l);
  });
  let html='';
  Object.entries(groups).forEach(([cid,g])=>{
    html+=`<optgroup label="${g.name}">`;
    g.leagues.forEach(l=>{html+=`<option value="${l.id}"${l.id===S.currentLeague?' selected':''}>${l.flag||''} ${l.name}</option>`;});
    html+=`</optgroup>`;
  });
  return html;
}

function selectLeague(lid){
  S.currentLeague=lid||null;
  S.season=(S.leagues.find(l=>l.id===lid)||{}).latest||null;
  if(lid)navigate(S.currentView);
  else{document.querySelectorAll('.page').forEach(p=>{if(p.id&&p.id.startsWith('page-'))p.innerHTML='';});}
}

async function renderPredictPage(){
  const lg=S.leagues.find(l=>l.id===S.currentLeague);
  const pg=$('page-predict');if(!pg)return;
  if(!lg){
    pg.innerHTML=`<div class="card" style="text-align:center;padding:3rem"><div class="sec-head">Select a League</div><div class="sec-sub">Choose a league from above to start predicting</div></div>`;
    return;
  }
  const teamOpts=lg.teams.map(t=>`<option value="${t.replace(/"/g,'&quot;')}">${t}</option>`).join('');
  pg.innerHTML=`
    <select class="league-header" id="league-header" onchange="selectLeague(this.value)">${leagueSelectHTML()}</select>
    <div class="matchup">
      <div><div class="card-label">Home</div><select id="sel-home">${teamOpts}</select></div>
      <div class="vs-col"><span>VS</span></div>
      <div><div class="card-label">Away</div><select id="sel-away">${teamOpts}</select></div>
    </div>
    <button class="predict-btn" onclick="runPrediction()">PREDICT</button>
    <div class="error-msg" id="error-msg"></div>
    <div class="result" id="pred-result"></div>`;
  const sa=$('sel-away');if(sa&&lg.teams.length>1)sa.selectedIndex=Math.min(1,lg.teams.length-1);
}

async function runPrediction(){
  const home=$('sel-home'),away=$('sel-away');
  if(!home||!away)return;
  const hv=home.value,av=away.value;
  if(hv===av){showError('Select two different teams');return;}
  const btn=document.querySelector('.predict-btn');if(btn){btn.disabled=true;btn.textContent='CALCULATING…';}
  hideError();
  try{
    if(!S.predictionsCache[S.currentLeague]){
      S.predictionsCache[S.currentLeague]=await fetchJSON(`data/predictions/${S.currentLeague}.json`);
    }
    const d=S.predictionsCache[S.currentLeague];
    const arr=d[hv][av];
    if(!arr)throw new Error('No prediction available for this matchup');
    const hi=d._t.indexOf(hv);
    const ai=d._t.indexOf(av);
    renderPredResult({
      home_team: hv, away_team: av,
      hw: arr[0], dr: arr[1], aw: arr[2],
      exp_h: arr[3], exp_a: arr[4],
      top_scores: arr[5], h2h: arr[6],
      home_form: d._f[hi], away_form: d._f[ai],
      home_str: d._s[hi], away_str: d._s[ai],
    });
  }catch(e){showError(e.message);}
  finally{if(btn){btn.disabled=false;btn.textContent='PREDICT';}}
}

function renderPredResult(d){
  const pr=$('pred-result');if(!pr)return;
  const top=d.top_scores||[];
  const verdictTxt=top.length?`Most likely: ${top[0].h}-${top[0].a} (${(top[0].p*100).toFixed(1)}%)`:'Insufficient data';
  const verdictCls=top.length&&top[0].p>0.07?'ok':'warn';
  const expH=d.exp_h!=null?d.exp_h:0,expA=d.exp_a!=null?d.exp_a:0,xgTotal=expH+expA||1;
  const hf=d.home_form||[],af=d.away_form||[];
  const h2h=d.h2h||{home_wins:0,draws:0,away_wins:0,matches:[]};
  const h2hMatches=(h2h.matches||[]).slice(-5).reverse();
  const hs=d.home_str||{att_home:0,def_home:0,att_away:0,def_away:0};
  const as=d.away_str||{att_home:0,def_home:0,att_away:0,def_away:0};
  pr.innerHTML=`
    <div class="stat-strip">
      <div class="stat-box hw"><div class="stat-label">Home Win</div><div class="stat-val">${d.hw||0}%</div><div class="stat-desc">${d.home_team||'?'}</div></div>
      <div class="stat-box dr"><div class="stat-label">Draw</div><div class="stat-val">${d.dr||0}%</div><div class="stat-desc">Either</div></div>
      <div class="stat-box aw"><div class="stat-val">${d.aw||0}%</div><div class="stat-label">Away Win</div><div class="stat-desc">${d.away_team||'?'}</div></div>
    </div>
    <div class="bar-track-h"><div class="bar-fill-h" style="width:${d.hw||0}%;background:linear-gradient(90deg,var(--accent),var(--accent-fade));border-radius:4px 0 0 4px"></div><div class="bar-fill-h" style="width:${d.dr||0}%;background:var(--amber);transition-delay:.1s"></div><div class="bar-fill-h" style="width:${d.aw||0}%;background:var(--red);border-radius:0 4px 4px 0;transition-delay:.2s"></div></div>
    <div class="xg-strip">
      <div class="xg-card"><div class="xg-team">${d.home_team||'?'}</div><div class="xg-label">Expected Goals</div><div class="xg-val">${d.exp_h!=null?d.exp_h.toFixed(2):'-'}</div></div>
      <div class="xg-card"><div class="xg-team">${d.away_team||'?'}</div><div class="xg-label">Expected Goals</div><div class="xg-val">${d.exp_a!=null?d.exp_a.toFixed(2):'-'}</div></div>
    </div>
    <div class="xg-bar-wrap"><div style="display:flex;height:6px;gap:2px;border-radius:3px;overflow:hidden"><div style="height:100%;background:var(--accent);width:${expH/xgTotal*100}%"></div><div style="height:100%;background:var(--surface);width:${Math.max(0,100-(expH/xgTotal*100)-((expA/xgTotal)*100))}%"></div><div style="height:100%;background:var(--red);width:${expA/xgTotal*100}%"></div></div></div>
    <div class="pred-section">
      <div class="eyebrow">Recent Form</div>
      <div class="form-guide">
        <div class="fg-row"><span class="fg-team">${d.home_team||'?'}</span><div class="form-strip">${hf.map(f=>`<span class="badge ${f}">${f}</span>`).join('')||'<span class="fg-na">—</span>'}</div></div>
        <div class="fg-row"><span class="fg-team">${d.away_team||'?'}</span><div class="form-strip">${af.map(f=>`<span class="badge ${f}">${f}</span>`).join('')||'<span class="fg-na">—</span>'}</div></div>
      </div>
    </div>
    <div class="pred-section">
      <div class="eyebrow">Head to Head</div>
      <div class="h2h-summary"><span class="h2h-num hw">${h2h.home_wins}W</span><span class="h2h-num dr">${h2h.draws}D</span><span class="h2h-num aw">${h2h.away_wins}L</span></div>
      <div class="h2h-matches">${h2hMatches.length?h2hMatches.map(m=>`<div class="h2h-match"><span class="h2h-date">${m.date||''}</span><span class="h2h-score">${m.score||'?-?'}</span><span class="h2h-teams">${m.home||'?'} vs ${m.away||'?'}</span></div>`).join(''):'<div class="h2h-na">No recent meetings</div>'}</div>
    </div>
    <div class="pred-section">
      <div class="eyebrow">Most Likely Scores</div>
      <div class="score-grid">${top.slice(0,6).map(s=>`<div class="score-cell"><span class="sc-score">${s.h}-${s.a}</span><span class="sc-pct">${(s.p*100).toFixed(1)}%</span></div>`).join('')}</div>
    </div>
    <div class="pred-section">
      <div class="eyebrow">Team Strengths</div>
      <div class="str-table">
        <div class="str-row str-hdr"><span class="str-label"></span><span class="str-val">${d.home_team||'?'}</span><span class="str-val">${d.away_team||'?'}</span></div>
        <div class="str-row"><span class="str-label">Home Attack</span><span class="str-val ${hs.att_home>as.att_home?'hi':''}">${hs.att_home.toFixed(2)}x</span><span class="str-val ${as.att_home>hs.att_home?'hi':''}">${as.att_home.toFixed(2)}x</span></div>
        <div class="str-row"><span class="str-label">Home Defense</span><span class="str-val ${hs.def_home>as.def_home?'lo':''}">${hs.def_home.toFixed(2)}x</span><span class="str-val ${as.def_home>hs.def_home?'lo':''}">${as.def_home.toFixed(2)}x</span></div>
        <div class="str-row"><span class="str-label">Away Attack</span><span class="str-val ${hs.att_away>as.att_away?'hi':''}">${hs.att_away.toFixed(2)}x</span><span class="str-val ${as.att_away>hs.att_away?'hi':''}">${as.att_away.toFixed(2)}x</span></div>
        <div class="str-row"><span class="str-label">Away Defense</span><span class="str-val ${hs.def_away>as.def_away?'lo':''}">${hs.def_away.toFixed(2)}x</span><span class="str-val ${as.def_away>hs.def_away?'lo':''}">${as.def_away.toFixed(2)}x</span></div>
      </div>
    </div>
    <div class="verdict ${verdictCls}">${verdictTxt}</div>`;
  pr.classList.add('visible');
  pr.scrollIntoView({behavior:'smooth',block:'start'});
}

function showError(msg){const e=$('error-msg');if(e){e.textContent=msg;e.style.display='block';}}
function hideError(){const e=$('error-msg');if(e)e.style.display='none';}

async function renderStandingsPage(){
  const lg=S.leagues.find(l=>l.id===S.currentLeague);
  const pg=$('page-standings');if(!pg)return;
  if(!lg){
    pg.innerHTML=`<div class="card" style="text-align:center;padding:3rem"><div class="sec-head">Select a League</div><div class="sec-sub">Pick a league to view standings</div></div>`;
    return;
  }
  const season=S.season||lg.latest||'';
  if(!S.standingsCache[S.currentLeague]){
    S.standingsCache[S.currentLeague]=await fetchJSON(`data/standings/${S.currentLeague}.json`);
  }
  const seasonData=S.standingsCache[S.currentLeague];
  const rows=seasonData[season]||[];
  const seasons=lg.seasons||[];
  pg.innerHTML=`
    <select class="league-header" id="league-header" onchange="selectLeague(this.value)">${leagueSelectHTML()}</select>
    <div class="rank-controls">
      <div class="min-matches-wrap">Season: ${selSeason(seasons,season,'standings')}</div>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th data-col="pos" onclick="sortStandings('pos')">#</th>
          <th data-col="team" onclick="sortStandings('team')">Team</th>
          <th class="num" data-col="played" onclick="sortStandings('played')">P</th>
          <th class="num" data-col="won" onclick="sortStandings('won')">W</th>
          <th class="num" data-col="drawn" onclick="sortStandings('drawn')">D</th>
          <th class="num" data-col="lost" onclick="sortStandings('lost')">L</th>
          <th class="num" data-col="gf" onclick="sortStandings('gf')">GF</th>
          <th class="num" data-col="ga" onclick="sortStandings('ga')">GA</th>
          <th class="num" data-col="gd" onclick="sortStandings('gd')">GD</th>
          <th class="num" data-col="points" onclick="sortStandings('points')">Pts</th>
          <th>Form</th>
        </tr></thead>
        <tbody id="standings-body">${rows.map((r,i)=>{
          if(!r)return'';
          const pc=p=>p<=4?'ucl':p<=6?'el':p>=rows.length-2?'rel':'';
          const gd=r.gd||0;
          return `<tr><td class="rank-n"><span class="pos-dot ${pc(i+1)}">${r.pos||i+1}</span></td>
            <td class="team-name">${r.team||'?'}</td>
            <td class="num">${r.played||0}</td>
            <td class="num">${r.won||0}</td>
            <td class="num">${r.drawn||0}</td>
            <td class="num">${r.lost||0}</td>
            <td class="num">${r.gf||0}</td>
            <td class="num">${r.ga||0}</td>
            <td class="num" style="color:${gd>0?'var(--accent)':gd<0?'var(--red)':'inherit'};font-weight:600">${gd>0?'+':''}${gd}</td>
            <td class="num points">${r.points||0}</td>
            <td><div class="form-strip">${(r.form||[]).map(f=>`<span class="badge ${f}">${f}</span>`).join('')||''}</div></td>
          </tr>`;
        }).join('')}</tbody>
      </table>
    </div>
    <div style="display:flex;gap:16px;flex-wrap:wrap;font-size:10px;font-family:'DM Mono',monospace;color:var(--muted)">
      <span><span class="pos-dot ucl" style="width:auto;padding:1px 6px;border-radius:3px">UCL</span> Champions League</span>
      <span><span class="pos-dot el" style="width:auto;padding:1px 6px;border-radius:3px">EL</span> Europa League</span>
      <span><span class="pos-dot rel" style="width:auto;padding:1px 6px;border-radius:3px">REL</span> Relegation</span>
    </div>`;
}

let standingsSort={col:'pos',asc:true};
function sortStandings(col){
  const tbody=$('standings-body');if(!tbody)return;
  const rows=Array.from(tbody.querySelectorAll('tr'));
  const asc=standingsSort.col===col?!standingsSort.asc:true;
  standingsSort={col,asc};
  document.querySelectorAll('th.sorted').forEach(th=>th.classList.remove('sorted'));
  document.querySelector(`th[data-col="${col}"]`).classList.add('sorted');
  const mult=asc?1:-1;
  rows.sort((a,b)=>{
    const va=a.querySelector(`td:nth-child(${col==='team'?2:col==='pos'?1:col==='played'?3:col==='won'?4:col==='drawn'?5:col==='lost'?6:col==='gf'?7:col==='ga'?8:col==='gd'?9:col==='points'?10:1})`);
    const vb=b.querySelector(`td:nth-child(${col==='team'?2:col==='pos'?1:col==='played'?3:col==='won'?4:col==='drawn'?5:col==='lost'?6:col==='gf'?7:col==='ga'?8:col==='gd'?9:col==='points'?10:1})`);
    if(!va||!vb)return 0;
    if(col==='team')return va.textContent.localeCompare(vb.textContent)*mult;
    return (parseFloat(va.textContent)-parseFloat(vb.textContent))*mult;
  });
  rows.forEach(r=>tbody.appendChild(r));
}

async function renderResultsPage(page=1){
  const lg=S.leagues.find(l=>l.id===S.currentLeague);
  const pg=$('page-results');if(!pg)return;
  if(!lg){
    pg.innerHTML=`<div class="card" style="text-align:center;padding:3rem"><div class="sec-head">Select a League</div><div class="sec-sub">Pick a league to view results</div></div>`;
    return;
  }
  const season=S.season||lg.latest;
  if(!S.resultsCache[S.currentLeague]){
    S.resultsCache[S.currentLeague]=await fetchJSON(`data/results/${S.currentLeague}.json`);
  }
  const allResults=S.resultsCache[S.currentLeague][season]||[];
  const total=allResults.length,per=50,pages=Math.ceil(total/per)||1;
  const start=(page-1)*per;
  const results=allResults.slice(start,start+per);
  pg.innerHTML=`
    <select class="league-header" id="league-header" onchange="selectLeague(this.value)">${leagueSelectHTML()}</select>
    <div class="rank-controls">
      <div class="min-matches-wrap">Season: ${selSeason(lg.seasons||[],season,'results')}</div>
      <div style="font-family:'DM Mono',monospace;font-size:.65rem;color:var(--muted)">${total} matches</div>
    </div>
    <div id="results-list">${results.map(m=>matchCardHTML(m)).join('')}</div>
    ${pages>1?`<div class="page-controls">${page>1?`<button class="page-btn" onclick="renderResultsPage(${page-1})">← Prev</button>`:''}<span class="page-info">${page}/${pages}</span>${page<pages?`<button class="page-btn" onclick="renderResultsPage(${page+1})">Next →</button>`:''}</div>`:''}`;
}

function matchCardHTML(m){
  if(!m)return'';
  const cls=m.result==='H'?'hw':m.result==='A'?'aw':'dr';
  return`<div class="match-card">
    <div class="mc-date">${(m.date||'').slice(5)}<br><span style="font-size:8px;color:var(--muted)">MD${m.matchday||''}</span></div>
    <div class="mc-team home">${m.home_team||'?'}</div>
    <div class="mc-score ${cls}">${m.home_goals!=null?m.home_goals:'?'}-${m.away_goals!=null?m.away_goals:'?'}</div>
    <div class="mc-team">${m.away_team||'?'}</div>
    <div class="mc-season">${((m.season||'').replace('/20','/').replace('20','')||'')}</div>
  </div>`;
}

initTheme();
(async function boot(){
  try{
    const d=await fetchJSON('data/leagues.json');
    S.leagues=d;
    const first=S.leagues.find(l=>l.tier===1)||S.leagues[0];
    S.currentLeague=first.id;
    S.season=first.latest;
    document.getElementById('loading').classList.add('hidden');
    await navigate('predict');
  }catch(e){
    document.getElementById('loading').innerHTML=`<div style="text-align:center;color:var(--red);font-family:'DM Mono',monospace;font-size:.8rem">Data files not found<br><span style="color:var(--muted);font-size:.7rem">Run: python generate.py &nbsp;|&nbsp; For local preview: python -m http.server 8080</span></div>`;
  }
})();
