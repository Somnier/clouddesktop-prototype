import { createStateClient } from '/shared/state-client.js';
import { getCampus, getClassroom, getServer, serverFor, getTerm, termsInCr,
  taskForCr, crRuntime, campusStats, alertsInCr, desktopAssets, termLabel, termSeat, termIp, termUse, stageLabel } from '/shared/model.js';
import { esc, fmtTime, relTime, pct, tone, pill, defRow, meter, empty, syncLabel, phaseLabel, visLabel } from '/shared/ui.js';

/* Smart comparator: pure numbers → numeric, IP → octet-by-octet, else localeCompare */
const _reNum=/^-?\d+(\.\d+)?$/;
const _reIp=/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;
function smartCmp(a,b){
  if(_reNum.test(a)&&_reNum.test(b)) return Number(a)-Number(b);
  if(_reIp.test(a)&&_reIp.test(b)){const pa=a.split('.'),pb=b.split('.');for(let i=0;i<4;i++){const d=Number(pa[i])-Number(pb[i]);if(d!==0)return d;}return 0;}
  return a.localeCompare(b,'zh');
}

const root = document.getElementById('app');
const client = createStateClient(render);
client.connect();
/* Force periodic re-render for live sparkline/metric views (dashboard + terminal detail) */
setInterval(()=>{
  const st = s();
  if(!st) return;
  if(view.page!=='dashboard' && !view.terminalId) return;
  /* Skip periodic re-render if user has focus on an input to avoid scroll/focus disruption */
  const ae = document.activeElement;
  if(ae && ae !== document.body && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.tagName === 'SELECT')) return;
  render(st);
}, 3000);

let view = { page: 'dashboard', campusId: null, classroomId: null, terminalId: null, tab: 'overview' };
let _isRendering = false;

function s(){ return client.get(); }
function nav(page, opts={}){ Object.assign(view, {page,...opts}); render(s()); }

/* ── Focus & input preservation across innerHTML renders ── */
function _saveFocus(){
  const ae = document.activeElement;
  if(!ae || ae===document.body || ae===root) return null;
  if(ae.tagName !== 'INPUT' && ae.tagName !== 'TEXTAREA' && ae.tagName !== 'SELECT') return null;
  /* Try any data-* attribute as selector (stable, unique across re-renders) */
  for(const attr of ae.getAttributeNames()){
    if(attr.startsWith('data-') && attr !== 'data-orig-idx'){
      const val = ae.getAttribute(attr);
      const selector = val ? '['+attr+'="'+val+'"]' : '['+attr+']';
      return { selector, value: ae.value, selStart: ae.selectionStart, selEnd: ae.selectionEnd, tag: ae.tagName };
    }
  }
  /* Fallback: id */
  if(ae.id) return { selector: '#'+ae.id, value: ae.value, selStart: ae.selectionStart, selEnd: ae.selectionEnd, tag: ae.tagName };
  /* Fallback: name */
  if(ae.name) return { selector: '[name="'+ae.name+'"]', value: ae.value, selStart: ae.selectionStart, selEnd: ae.selectionEnd, tag: ae.tagName };
  return null;
}
function _restoreFocus(saved){
  if(!saved) return;
  const el = root.querySelector(saved.selector);
  if(!el) return;
  if(el.value !== saved.value) el.value = saved.value;
  try { el.focus(); if(saved.selStart != null && el.setSelectionRange) el.setSelectionRange(saved.selStart, saved.selEnd); } catch(e){}
}

function render(state){
  if(!state) return;
  if(_isRendering) return;
  view.campusId = view.campusId || state.demo.focusCampusId;
  const saved = _saveFocus();
  /* Save scroll positions before re-render */
  const scrollEl = root.querySelector('.plat-content');
  const savedScrollTop = scrollEl ? scrollEl.scrollTop : 0;
  const asideEl = root.querySelector('.plat-aside');
  const savedAsideScroll = asideEl ? asideEl.scrollTop : 0;
  /* Save inner scrollable container positions (progress/result tables) */
  const innerScrolls = [];
  root.querySelectorAll('.plat-inner-scroll').forEach((el,i)=>{
    innerScrolls.push(el.scrollTop);
  });
  _isRendering = true;
  root.innerHTML = shellHtml();
  bindEvents();
  _restoreFocus(saved);
  /* Restore scroll positions */
  const newScrollEl = root.querySelector('.plat-content');
  if(newScrollEl && savedScrollTop) newScrollEl.scrollTop = savedScrollTop;
  const newAsideEl = root.querySelector('.plat-aside');
  if(newAsideEl && savedAsideScroll) newAsideEl.scrollTop = savedAsideScroll;
  /* Restore inner scrollable positions */
  root.querySelectorAll('.plat-inner-scroll').forEach((el,i)=>{
    if(innerScrolls[i] != null) el.scrollTop = innerScrolls[i];
  });
  _isRendering = false;
}

function shellHtml(){
  const state = s();
  const pages = [{id:'dashboard',label:'总览'},{id:'classrooms',label:'教室管理'},{id:'assets',label:'桌面资产'},{id:'alerts',label:'告警中心'},{id:'server-change',label:'服务器地址变更'}];
  return `<div class="plat-shell">
    <aside class="plat-side">
      <div class="logo">云桌面管理平台</div>
      <nav class="nav">
        <div class="nav-section">导航</div>
        ${pages.map(p=>`<a class="nav-item${view.page===p.id?' active':''}" data-nav="${p.id}">${esc(p.label)}</a>`).join('')}
        <div class="nav-section" style="margin-top:16px">校区</div>
        ${state.campuses.map(c=>`<a class="nav-item${view.campusId===c.id?' active':''}" data-campus="${c.id}">${esc(c.name)}</a>`).join('')}
      </nav>
    </aside>
    <div class="plat-main">
      <div class="plat-header">
        <div class="title">${pageTitle()}</div>
        <div class="breadcrumb">${breadcrumb()}</div>
      </div>
      <div class="plat-body">
        <div class="plat-content">${pageContent()}</div>
        ${asideContent()}
      </div>
    </div>
  </div>`;
}

function pageTitle(){
  switch(view.page){
    case 'dashboard': return '总览';
    case 'classrooms': return view.classroomId?(view.terminalId?'终端详情':'教室详情'):'教室管理';
    case 'assets': return '桌面资产';
    case 'alerts': return '告警中心';
    case 'server-change': return '服务器地址变更';
    default: return '';
  }
}
function breadcrumb(){
  const parts = [`<a data-nav="dashboard">首页</a>`];
  if(view.page!=='dashboard') parts.push(`<a data-nav="${view.page}">${pageTitle()}</a>`);
  if(view.page==='classrooms'){
    if(view.classroomId){
      const cr = getClassroom(s(), view.classroomId);
      parts.push(`<a data-nav-cr="${view.classroomId}">${esc(cr?.name||'')}</a>`);
      if(view.terminalId){ const t=getTerm(s(),view.terminalId); parts.push(`<span>${esc(t?.name||t?.seat||'')}</span>`); }
    }
  }
  return parts.join(' <span style="opacity:.4">/</span> ');
}
function pageContent(){
  switch(view.page){
    case 'dashboard': return dashboardPage();
    case 'classrooms':
      if(view.terminalId) return terminalDetailPage();
      if(view.classroomId) return classroomDetailPage();
      return classroomListPage();
    case 'assets': return assetsPage();
    case 'alerts': return alertsPage();
    case 'server-change': return serverChangePage();
    default: return '';
  }
}

function asideContent(){
  const state=s(); const cId=view.campusId;
  const server=serverFor(state,cId);
  const crIdsInCampus=new Set(state.classrooms.filter(c=>c.campusId===cId).map(c=>c.id));
  const campusAlerts=state.alerts.filter(a=>a.status==='open'&&crIdsInCampus.has(a.classroomId));
  const recentLogs=state.logs.slice(0,5);
  const logLevelLabel={info:'信息',warn:'警告',error:'错误'};
  const stats=campusStats(state,cId);

  let cards='';
  if(view.page==='dashboard'){
    /* dashboard aside: recent logs (30%) + alerts (70%) */
    const logLimit = Math.min(recentLogs.length, 6);
    cards+=`<div class="aside-card" style="flex:3;min-height:0"><div class="aside-title">最近日志</div>
      ${recentLogs.length?recentLogs.slice(0,logLimit).map(l=>{
        const lTerm=l.terminalId?getTerm(state,l.terminalId):null;
        const lCr=l.classroomId?state.classrooms.find(c=>c.id===l.classroomId):null;
        const hoverParts=[l.source||'系统',l.title,l.detail||''].filter(Boolean);
        const sourceHtml=lTerm
          ?`<a class="clickable" data-nav-term="${lTerm.id}" style="cursor:pointer;font-size:.72rem;font-weight:600;color:var(--c-brand);flex-shrink:0;white-space:nowrap" title="${esc((lCr?lCr.name+' ':'')+'座位 '+(lTerm.seat||''))}">${esc('座位 '+(lTerm.seat||'--'))}</a>`
          :`<span style="font-size:.72rem;font-weight:600;color:${lCr?'var(--c-brand)':'var(--c-text2)'};flex-shrink:0;max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(lCr?lCr.name:(l.source||'系统'))}</span>`;
        return `<div title="${esc(hoverParts.join(' — '))}" style="cursor:default;display:flex;align-items:center;gap:6px;padding:5px 8px;font-size:.82rem;border-bottom:1px solid var(--c-bg2)">
          ${sourceHtml}
          <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(l.title)}</span>
          <span style="color:var(--c-text3);font-size:.7rem;white-space:nowrap;flex-shrink:0;text-align:right">${relTime(l.at)}</span>
        </div>`;
      }).join(''):'<div style="font-size:.8rem;color:var(--c-text3)">暂无日志</div>'}
    </div>`;
    const alertLimit = Math.min(campusAlerts.length, 12);
    cards+=`<div class="aside-card" style="flex:7;min-height:0;overflow-y:auto"><div class="aside-title">活跃告警 (${campusAlerts.length})</div>
      ${campusAlerts.slice(0,alertLimit).map(a=>{
        const t=getTerm(state,a.terminalId);
        const crObj=state.classrooms.find(c=>c.id===a.classroomId);
        const hoverDetail=[crObj?crObj.name:'',t?'座位 '+(t.seat||'--'):'',a.title,a.detail||''].filter(Boolean).join(' — ');
        return `<div class="aside-item" title="${esc(hoverDetail)}" style="display:flex;flex-direction:column;gap:2px;padding:6px 8px;border-bottom:1px solid var(--c-bg2)">
          <div style="display:flex;align-items:center;gap:6px">
            <span style="flex-shrink:0">${pill(a.level==='high'?'高':a.level==='medium'?'中':'低',a.level==='high'?'err':a.level==='medium'?'warn':'muted')}</span>
            <span style="flex:1;font-size:.78rem;color:var(--c-text2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(crObj?crObj.name:'')}</span>
            <span style="flex-shrink:0;color:var(--c-text3);font-size:.7rem;white-space:nowrap">${relTime(a.at)}</span>
          </div>
          <div style="display:flex;align-items:center;gap:6px;padding-left:2px">
            <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.82rem;font-weight:500">${esc(a.title)}</span>
            ${t?`<a class="clickable" data-nav-term="${a.terminalId}" style="flex-shrink:0;font-size:.75rem;padding:1px 6px;background:rgba(59,130,246,.06);border:1px solid rgba(59,130,246,.15);border-radius:3px;color:var(--c-brand);cursor:pointer;white-space:nowrap">${esc(t.seat||'--')}</a>`:''}
          </div>
        </div>`;
      }).join('')}
    </div>`;
  } else if(view.page==='classrooms'){
    if(view.classroomId){
      /* Inside a classroom — show classroom-specific info */
      const cr=state.classrooms.find(c=>c.id===view.classroomId);
      const crAlerts=alertsInCr(state,view.classroomId);
      const rt=crRuntime(state,view.classroomId);
      const hs=cr?healthScore(state,cr.id):0;
      const hsColor=hs>=80?'var(--c-ok)':hs>=50?'var(--c-warn)':'var(--c-err)';
      const barColor=hs>=80?'#22c55e':hs>=50?'#f59e0b':'#ef4444';
      const levelLabel=hs>=80?'优':hs>=50?'良':'差';
      cards+=`<div class="aside-card"><div class="aside-title">教室概况</div>
        <div class="aside-item" style="flex-direction:column;gap:4px">
          <div style="display:flex;justify-content:space-between;align-items:center"><span>健康度</span><span style="font-weight:600;font-size:.82rem;color:${hsColor}">${levelLabel}</span></div>
          <div style="height:6px;background:var(--c-bg2);border-radius:3px;overflow:hidden;width:100%"><div style="height:100%;width:${hs}%;background:${barColor};border-radius:3px"></div></div>
        </div>
        <div class="aside-item" style="justify-content:space-between"><span>终端</span><span>${rt.online}/${rt.total} 在线</span></div>
      </div>`;
      if(crAlerts.length){
        const alertLimit2 = Math.min(crAlerts.length, 10);
        cards+=`<div class="aside-card" style="flex:1;min-height:0;overflow-y:auto"><div class="aside-title">教室告警 (${crAlerts.length})</div>
          ${crAlerts.slice(0,alertLimit2).map(a=>{
            const t=getTerm(state,a.terminalId);
            const crAlertHover=[a.title,t?'座位 '+(t.seat||'--'):'',a.detail||''].filter(Boolean).join(' — ');
            return `<div class="aside-item" title="${esc(crAlertHover)}" style="display:flex;align-items:center;gap:6px;padding:5px 8px;border-bottom:1px solid var(--c-bg2)">
              <span style="flex-shrink:0">${pill(a.level==='high'?'高':a.level==='medium'?'中':'低',a.level==='high'?'err':a.level==='medium'?'warn':'muted')}</span>
              <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.82rem;font-weight:500">${esc(a.title)}</span>
              ${t?`<a class="clickable" data-nav-term="${a.terminalId}" style="flex-shrink:0;font-size:.75rem;color:var(--c-brand);cursor:pointer;white-space:nowrap">${esc(t.seat||'--')}</a>`:''}
              <span style="flex-shrink:0;color:var(--c-text3);font-size:.7rem;white-space:nowrap;text-align:right">${relTime(a.at)}</span>
            </div>`;
          }).join('')}
        </div>`;
      } else {
        cards+=`<div class="aside-card"><div class="aside-title">教室告警</div><div style="font-size:.82rem;color:var(--c-text3);padding:4px 0">无活跃告警</div></div>`;
      }
    } else {
      /* Classroom list — show campus deployment summary */
      const crsInCampus=state.classrooms.filter(c=>c.campusId===cId);
      const totalTerms=stats.terminals;
      cards+=`<div class="aside-card"><div class="aside-title">校区概况</div>
        <div class="aside-item" style="justify-content:space-between"><span>教室</span><span style="font-weight:600">${crsInCampus.length}</span></div>
        <div class="aside-item" style="justify-content:space-between"><span>终端总数</span><span style="font-weight:600">${totalTerms}</span></div>
        <div class="aside-item" style="justify-content:space-between"><span>在线率</span><span style="font-weight:600">${pct(stats.online,stats.terminals)}%</span></div>
        <div class="aside-item" style="justify-content:space-between"><span>活跃告警</span><span style="font-weight:600${campusAlerts.length?' ;color:var(--c-err)':''}">${campusAlerts.length}</span></div>
      </div>`;
    }
  } else if(view.page==='assets'){
    /* assets aside: comprehensive stats */
    const crIds2 = state.classrooms.filter(c=>c.campusId===cId).map(c=>c.id);
    const crsWithDesktops2 = state.classrooms.filter(c=>crIds2.includes(c.id)&&(c.desktopCatalog||[]).length>0);
    /* Count unique desktop names (grouped) */
    const dtNames2 = new Set();
    crsWithDesktops2.forEach(c=>(c.desktopCatalog||[]).forEach(d=>dtNames2.add(d.name)));
    const totalDesktops2 = dtNames2.size;
    const totalSnaps2 = crsWithDesktops2.reduce((n,c)=>(c.snapshotTree||[]).length+n,0);
    const totalImages2 = crsWithDesktops2.reduce((n,c)=>(c.imageStore||[]).length+n,0);
    const estItems2 = [...crsWithDesktops2.flatMap(c=>(c.snapshotTree||[])),...crsWithDesktops2.flatMap(c=>(c.imageStore||[]))];
    const totalStorageGB2 = estItems2.reduce((sum,item)=>{
      let h=0;for(let i=0;i<item.id.length;i++) h=((h<<5)-h+item.id.charCodeAt(i))|0;
      return sum+(Math.abs(h%40)+8)+((Math.abs(h>>8)%10)/10);
    },0);
    cards+=`<div class="aside-card"><div class="aside-title">资产统计</div>
      <div class="aside-item" style="justify-content:space-between"><span>桌面</span><span style="font-weight:600">${totalDesktops2}</span></div>
      <div class="aside-item" style="justify-content:space-between"><span>教室</span><span style="font-weight:600">${crsWithDesktops2.length}</span></div>
      <div class="aside-item" style="justify-content:space-between"><span>镜像</span><span style="font-weight:600">${totalImages2}</span></div>
      <div class="aside-item" style="justify-content:space-between"><span>快照</span><span style="font-weight:600">${totalSnaps2}</span></div>
      <div class="aside-item" style="justify-content:space-between;border-top:1px solid var(--c-border);padding-top:6px"><span>估算存储</span><span style="font-weight:700">${totalStorageGB2.toFixed(0)} GB</span></div>
      <div class="aside-item" style="justify-content:space-between"><span>服务器占用</span><span style="font-weight:600">${server?server.storage+'%':'--'}</span></div>
    </div>`;
  } else if(view.page==='alerts'){
    /* alerts aside: severity counts + top-affected classrooms */
    const high=campusAlerts.filter(a=>a.level==='high').length;
    const medium=campusAlerts.filter(a=>a.level==='medium').length;
    const low=campusAlerts.filter(a=>a.level==='low').length;
    const crAlertMap2 = {};
    campusAlerts.forEach(a=>{ crAlertMap2[a.classroomId]=(crAlertMap2[a.classroomId]||0)+1; });
    const topCrs2 = Object.entries(crAlertMap2).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([id,cnt])=>{
      const cr2=state.classrooms.find(c=>c.id===id);
      return cr2 ? `<div class="aside-item" style="justify-content:space-between"><span>${esc(cr2.name)}</span><span style="font-weight:600">${cnt}</span></div>` : '';
    }).filter(Boolean).join('');
    cards+=`<div class="aside-card"><div class="aside-title">告警统计</div>
      <div class="aside-item" style="justify-content:space-between"><span>总计</span><span style="font-weight:700">${campusAlerts.length} 条</span></div>
      <div class="aside-item" style="justify-content:space-between"><span style="color:var(--c-err)">高严重度</span><span style="font-weight:700;color:var(--c-err)">${high}</span></div>
      <div class="aside-item" style="justify-content:space-between"><span style="color:var(--c-warn)">中严重度</span><span style="font-weight:700;color:var(--c-warn)">${medium}</span></div>
      <div class="aside-item" style="justify-content:space-between"><span>低严重度</span><span style="font-weight:700">${low}</span></div>
    </div>`;
    if(topCrs2) cards+=`<div class="aside-card"><div class="aside-title">告警集中教室</div>${topCrs2}</div>`;
  } else if(view.page==='server-change'){
    /* server change aside: server status */
    if(server) cards+=`<div class="aside-card"><div class="aside-title">服务器状态</div>
      <div class="aside-item" style="justify-content:space-between"><span>名称</span><span style="font-weight:500">${esc(server.name)}</span></div>
      <div class="aside-item" style="justify-content:space-between"><span>当前地址</span><span class="mono" style="font-size:.8rem">${esc(server.address||'--')}</span></div>
      <div class="aside-item" style="justify-content:space-between"><span>CPU</span><span>${server.cpu}%</span></div>
      <div class="aside-item" style="justify-content:space-between"><span>内存</span><span>${server.memory}%</span></div>
      <div class="aside-item" style="justify-content:space-between"><span>SSL</span><span>${server.ssl?'已启用':'未启用'}</span></div>
    </div>`;
  }
  if(!cards) return '';
  return `<aside class="plat-aside">${cards}</aside>`;
}


function sparklineSvg(data, color, w, h){
  if(!data||data.length<2) return '';
  const max=Math.max(...data,1); const min=Math.min(...data,0);
  const range=max-min||1;
  const pts=data.map((v,i)=>`${(i/(data.length-1)*w).toFixed(1)},${(h-(v-min)/range*h).toFixed(1)}`).join(' ');
  const fillPts=pts+` ${w},${h} 0,${h}`;
  return `<svg class="sparkline" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
    <polygon points="${fillPts}" fill="${color}"/>
    <polyline points="${pts}" stroke="${color}"/>
  </svg>`;
}

function healthScore(state,crId){
  const terms=termsInCr(state,crId);
  const alerts=alertsInCr(state,crId);
  if(!terms.length) return 100;
  const n=terms.length;
  /* 1. Alert penalty: affected terminal ratio */
  const affectedByAlert=new Set(alerts.map(a=>a.terminalId).filter(Boolean));
  const alertRatio=n>0?affectedByAlert.size/n:0;
  const alertPenalty=Math.round(alertRatio*60);
  /* 2. Desktop consistency: proportion of inconsistent terminals */
  const dtSigs=terms.filter(t=>t.online&&(t.desktops||[]).length>0).map(t=>(t.desktops||[]).map(d=>d.name).sort().join('|'));
  const sigCounts={}; dtSigs.forEach(sig=>{sigCounts[sig]=(sigCounts[sig]||0)+1;});
  const majorityCount=Math.max(...Object.values(sigCounts),0);
  const inconsistent=dtSigs.length>0?dtSigs.length-majorityCount:0;
  const consistencyRatio=dtSigs.length>0?inconsistent/dtSigs.length:0;
  const consistencyPenalty=Math.round(consistencyRatio*40);
  /* 3. Offline penalty */
  const offlineCount=terms.filter(t=>!t.online).length;
  const offlinePenalty=n>0?Math.round(offlineCount/n*30):0;
  /* 4. Hardware alert severity bonus */
  const highAlerts=alerts.filter(a=>a.level==='high').length;
  const severityBonus=Math.min(20,highAlerts*4);
  /* Score: 100 - penalties, floor at 10 */
  return Math.max(10,Math.min(100,100-alertPenalty-consistencyPenalty-offlinePenalty-severityBonus));
}

function dashboardPage(){
  const state=s(); const cId=view.campusId;
  const campus=getCampus(state,cId); const server=serverFor(state,cId); const stats=campusStats(state,cId);
  const allAlerts=state.alerts.filter(a=>a.status==='open');
  const crIdsInCampus=new Set(state.classrooms.filter(c=>c.campusId===cId).map(c=>c.id));
  const campusAlerts=allAlerts.filter(a=>crIdsInCampus.has(a.classroomId));
  const crsInCampus=state.classrooms.filter(c=>c.campusId===cId);
  const totalDesktops=crsInCampus.reduce((n,c)=>(c.desktopCatalog||[]).length+n,0);
  const totalDiskGB=crsInCampus.reduce((n,c)=>(c.desktopCatalog||[]).reduce((s2,d)=>s2+(d.diskSize||25),0)+n,0);

  /* time-series data from server */
  const hist=server?.monitorHistory||[];
  const cpuHist=hist.map(h=>h.cpu);
  const memHist=hist.map(h=>h.memory);
  const netHist=hist.map(h=>h.net||0);
  const stoPct=server?.storage||0;
  const diskTotalGB=server?.diskTotal||0;
  const diskUsedGB=diskTotalGB?Math.round(diskTotalGB*stoPct/100):0;
  const diskFreeGB=diskTotalGB-diskUsedGB;

  const cpuColor=(server?.cpu||0)>80?'#ef4444':(server?.cpu||0)>60?'#f59e0b':'#22c55e';
  const memColor=(server?.memory||0)>80?'#ef4444':(server?.memory||0)>60?'#f59e0b':'#3b82f6';
  const stoColor=stoPct>85?'#ef4444':stoPct>70?'#f59e0b':'#3b82f6';

  /* Classrooms that are deployed on server — used for both metric card and health section */
  const activeCrs=crsInCampus.filter(c=>c.stage==='deployed');

  return `
  <div class="metric-grid">
    <div class="metric-card"><div class="mc-label">教室</div><div class="mc-value">${activeCrs.length}</div>
      <div class="mc-sub">${esc(campus?.name||'')}${(()=>{const w=activeCrs.filter(c2=>healthScore(state,c2.id)<80).length;return w?` · ${w} 间需关注`:(activeCrs.length?' · 全部正常':'');})()}</div></div>
    <div class="metric-card"><div class="mc-label">在线 / 终端</div><div class="mc-value">${stats.online} <span style="font-size:.7em;color:var(--c-text3)">/</span> ${stats.terminals}</div>
      <div class="mc-sub">在线率 ${pct(stats.online,stats.terminals)}%</div></div>
    <div class="metric-card"><div class="mc-label">桌面资产</div><div class="mc-value">${totalDesktops}</div>
      <div class="mc-sub">占用 ${totalDiskGB} GB</div></div>
    <div class="metric-card"><div class="mc-label">活跃告警</div><div class="mc-value${campusAlerts.length?' text-err':''}">${campusAlerts.length}</div>
      <div class="mc-sub">${campusAlerts.length?'需关注':'无告警'}</div></div>
  </div>

  ${server?`<div class="section">
    <div class="section-head"><h3>服务器状态</h3></div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px">
      <div class="sparkline-wrap">
        <div class="spark-label"><span class="spark-title">CPU</span><span class="spark-value" style="color:${cpuColor}">${server.cpu}%</span></div>
        ${sparklineSvg(cpuHist, cpuColor, 200, 48)}
      </div>
      <div class="sparkline-wrap">
        <div class="spark-label"><span class="spark-title">内存</span><span class="spark-value" style="color:${memColor}">${server.memory}%</span></div>
        ${sparklineSvg(memHist, memColor, 200, 48)}
      </div>
      <div class="sparkline-wrap">
        <div class="spark-label"><span class="spark-title">以太网</span><span class="spark-value" style="color:#6366f1">${netHist.length?netHist[netHist.length-1].toFixed(1):'--'} MB/s</span></div>
        ${sparklineSvg(netHist, '#6366f1', 200, 48)}
      </div>
    </div>
  </div>
  <div class="section">
    <div class="section-head"><h3>服务器存储</h3></div>
    <div>
      <div style="display:flex;align-items:baseline;gap:10px;margin-bottom:8px">
        <span style="font-size:1.6rem;font-weight:700;color:${stoColor}">${stoPct}%</span>
        <span style="font-size:.85rem;color:var(--c-text3)">已用 ${diskUsedGB>=1024?(diskUsedGB/1024).toFixed(1)+' TB':diskUsedGB+' GB'} / 共 ${diskTotalGB>=1024?(diskTotalGB/1024).toFixed(0)+' TB':diskTotalGB+' GB'}</span>
      </div>
      <div style="height:20px;background:var(--c-bg2);border-radius:10px;overflow:hidden;border:1px solid var(--c-border)">
        <div style="height:100%;width:${stoPct}%;background:${stoColor};border-radius:10px;transition:width .3s"></div>
      </div>
      <div style="display:flex;justify-content:space-between;margin-top:6px;font-size:.78rem;color:var(--c-text3)">
        <span>已用 ${diskUsedGB} GB</span>
        <span>可用 ${diskFreeGB} GB</span>
      </div>
    </div>
  </div>`:''}

  <div class="section">
    <div class="section-head"><h3>教室健康度</h3></div>
    ${(()=>{
      const scored=activeCrs.map(c=>({c,hs:healthScore(state,c.id),alerts:alertsInCr(state,c.id)})).sort((a,b)=>a.hs-b.hs);
      if(!scored.length) return '<div style="font-size:.85rem;color:var(--c-text3)">暂无教室</div>';
      const allHealthy = scored.every(x=>x.hs>=80);
      return `${allHealthy?'<div style="padding:12px 16px;background:rgba(34,197,94,.06);border:1px solid rgba(34,197,94,.2);border-radius:8px;margin-bottom:12px;font-size:.88rem;color:var(--c-ok);font-weight:500">所有教室运行正常</div>':''}
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px">
        ${scored.map(({c,hs,alerts:crAlerts})=>{
          const bg=hs>=80?'rgba(34,197,94,.06)':hs>=50?'rgba(245,158,11,.06)':'rgba(239,68,68,.06)';
          const border=hs>=80?'rgba(34,197,94,.2)':hs>=50?'rgba(245,158,11,.25)':'rgba(239,68,68,.25)';
          const color=hs>=80?'var(--c-ok)':hs>=50?'var(--c-warn)':'var(--c-err)';
          const barColor=hs>=80?'#22c55e':hs>=50?'#f59e0b':'#ef4444';
          const levelLabel=hs>=80?'优':hs>=50?'良':'差';
          const rt=crRuntime(state,c.id);
          return `<div class="clickable" data-nav-cr="${c.id}" style="padding:18px 22px;border-radius:8px;background:${bg};border:1px solid ${border};cursor:pointer">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
              <span style="font-weight:600;font-size:.92rem">${esc(c.name)}</span>
              <span style="font-size:.78rem;font-weight:600;color:${color};padding:2px 8px;border-radius:10px;background:${bg};border:1px solid ${border}">${levelLabel}</span>
            </div>
            <div style="height:6px;background:var(--c-bg2);border-radius:3px;overflow:hidden;margin-bottom:6px">
              <div style="height:100%;width:${hs}%;background:${barColor};border-radius:3px;transition:width .3s"></div>
            </div>
            <div style="font-size:.82rem;color:var(--c-text3)">${rt.online}/${rt.total} 在线${crAlerts.length?` · <span style="color:var(--c-err)">${crAlerts.length} 告警</span>`:''}</div>
          </div>`;
        }).join('')}
      </div>`;
    })()}
  </div>
  `;
}


function classroomListPage(){
  const state=s(); const crs=state.classrooms.filter(c=>c.campusId===view.campusId);
  const ir = view.importResult || null;
  const showImport = view.showImportPanel;

  /* Auto-match: simulate reading classroom name from Excel */
  const importName = view.importCrName || '';
  const matchedCr = importName ? crs.find(c=>c.name===importName) : null;

  /* If import wizard is active, show full-page wizard */
  if(showImport) return `
  <div style="margin-bottom:12px">
    <button class="btn btn-ghost btn-sm" data-toggle-import>← 返回教室列表</button>
  </div>
  <div style="max-width:800px">
    <div class="card" style="border-left:3px solid var(--c-brand);margin-bottom:20px">
      <div class="card-header" style="font-size:1.05rem">导入终端清单</div>
      <div style="font-size:.85rem;color:var(--c-text2);margin-bottom:16px">
        选择母机导出的 Excel 终端清单文件，系统将根据文件中的<strong>教室名称自动匹配</strong>。<br>
        名称匹配到已有教室时追加终端，名称不存在时自动新建教室。
      </div>

      <div style="margin-bottom:16px;padding:16px;background:var(--c-bg2);border-radius:8px;border:2px dashed var(--c-border);text-align:center;cursor:pointer" data-import-file-area>
        <div style="font-size:.9rem;font-weight:600;margin-bottom:4px">${view.importFileReady?'✓ 已读取 Excel 文件':'点击选择 Excel 文件'}</div>
        <div style="font-size:.82rem;color:var(--c-text3)">支持 .xlsx 格式，由终端侧「导出清单」功能生成</div>
      </div>

      ${view.importFileReady?`
      <div style="border:1px solid var(--c-border);border-radius:8px;padding:14px 18px;margin-bottom:16px;background:#fff">
        <div style="font-size:.85rem;font-weight:600;color:var(--c-text2);margin-bottom:10px">Excel 读取结果</div>
        <div class="prep-field" style="margin-bottom:8px"><label style="width:100px;font-size:.85rem">教室名称</label>
          <input type="text" data-import-cr-name value="${esc(importName)}" placeholder="Excel 中的教室名称" style="width:280px"></div>
        <div class="prep-field" style="margin-bottom:8px"><label style="width:100px;font-size:.85rem">位置</label>
          <input type="text" data-import-cr-building value="${esc(view.importCrBuilding||'')}" placeholder="如：创意楼B座 3F" style="width:280px"></div>
        <div class="prep-field" style="margin-bottom:8px"><label style="width:100px;font-size:.85rem">备注</label>
          <input type="text" data-import-cr-remark value="${esc(view.importCrRemark||'')}" placeholder="可选" style="width:380px"></div>
        <div style="margin-top:10px;padding:8px 12px;border-radius:6px;font-size:.85rem;${matchedCr
          ?'background:rgba(59,130,246,.06);border:1px solid rgba(59,130,246,.2)'
          :'background:rgba(34,197,94,.06);border:1px solid rgba(34,197,94,.2)'}">
          ${matchedCr
            ?`匹配到已有教室 <strong>${esc(matchedCr.name)}</strong> (${esc(matchedCr.building||'')} ${esc(matchedCr.floor||'')})，终端将追加到该教室。`
            :(importName
              ?`未找到名为「${esc(importName)}」的教室，将<strong>自动新建</strong>。`
              :'请输入教室名称以进行匹配。')}
        </div>
      </div>
      `:''}

      ${ir?.done?`<div style="color:var(--c-ok);font-size:.85rem;margin:12px 0;padding:8px 12px;background:rgba(34,197,94,.08);border-radius:6px">✓ 已成功导入终端清单${ir.count?' ('+ir.count+' 台终端)':''}</div>`:''}
      <div style="display:flex;gap:8px;margin-top:16px">
        <button class="btn btn-primary" data-plat-confirm="import-list"${ir?.done||!view.importFileReady||!importName?' disabled':''}>确认导入</button>
        <button class="btn btn-ghost" data-toggle-import>取消</button>
      </div>
    </div>
  </div>`;

  return `
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:8px">
    <div style="font-size:.85rem;color:var(--c-text3)">${crs.length} 个教室</div>
  </div>
  <div style="max-width:700px;margin-bottom:20px">
    <div class="card" style="padding:16px 20px;cursor:pointer;border-left:3px solid var(--c-brand);display:flex;align-items:center;gap:16px;max-width:50%" data-toggle-import>
      <div>
        <div style="font-weight:600;font-size:.95rem">导入终端清单</div>
        <div style="font-size:.82rem;color:var(--c-text3)">从母机导出的 Excel 文件导入，创建或追加教室</div>
      </div>
    </div>
  </div>
  <table class="data-table">
    <thead><tr><th>教室名称</th><th>位置</th><th>健康度</th><th>终端</th><th>在线率</th><th>告警</th></tr></thead>
    <tbody>${crs.filter(c=>c.stage==='deployed').map(c=>({c,hs:healthScore(state,c.id)})).sort((a,b)=>a.hs-b.hs).map(({c,hs})=>{
      const rt=crRuntime(state,c.id); const als=alertsInCr(state,c.id);
      const hsColor=hs>=80?'var(--c-ok)':hs>=50?'var(--c-warn)':'var(--c-err)';
      const barColor=hs>=80?'#22c55e':hs>=50?'#f59e0b':'#ef4444';
      const levelLabel=hs>=80?'优':hs>=50?'良':'差';
      return `<tr>
        <td class="clickable" data-nav-cr="${c.id}">${esc(c.name)}</td>
        <td>${esc(c.building)} ${esc(c.floor)}</td>
        <td><div style="display:flex;align-items:center;gap:6px"><div style="width:48px;height:6px;background:var(--c-bg2);border-radius:3px;overflow:hidden"><div style="height:100%;width:${hs}%;background:${barColor};border-radius:3px"></div></div><span style="font-size:.78rem;font-weight:600;color:${hsColor}">${levelLabel}</span></div></td>
        <td>${rt.total}</td><td>${pct(rt.online,rt.total)}%</td>
        <td>${als.length?`<span class="text-err">${als.length}</span>`:'-'}</td>
      </tr>`;
    }).join('')}</tbody>
  </table>`;
}


function classroomDetailPage(){
  const state=s(); const c=getClassroom(state,view.classroomId); if(!c) return empty('教室不存在');
  const rt=crRuntime(state,c.id); const terms=termsInCr(state,c.id); const alerts=alertsInCr(state,c.id); const tk=taskForCr(state,c.id);

  /* No tabs — go directly to batch toolbar + terminal list */
  return `
  <div style="margin-bottom:16px">
    <div style="display:flex;align-items:baseline;gap:12px;flex-wrap:wrap">
      <button class="btn btn-ghost btn-sm" data-nav="classrooms">\u2190 教室列表</button>
      <h2 style="font-size:1.2rem">${esc(c.name)}</h2>
    </div>
    <div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:8px;font-size:.85rem;color:var(--c-text2)">
      <span>位置：${pill(c.building+' '+c.floor,'muted')}</span>
      <span>在线：${pill(rt.online+'/'+rt.total, rt.offline>0?'warn':'ok')}</span>
      ${c.remark?`<span>备注：${esc(c.remark)}</span>`:''}
    </div>
  </div>
  ${crTerminalsTab(c,terms)}
  `;
}


function crTerminalsTab(c,terms){
  const onlineTerms = terms.filter(t=>t.online);
  const viewMode = view.termListMode || 'list';
  const pa = view.platAction || null;
  const par = view.platActionResult || null;
  const sel = view.platSelectedTerms || [];
  const selOnline = sel.filter(id => onlineTerms.some(t=>t.id===id));

  /* Unique purposes in this classroom */
  const uses = [...new Set(terms.map(t=>t.use).filter(Boolean))];

  /* 4 action groups — segmented button groups */
  const groups = [
    {label:'教室控制', icon:'', actions:[
      {k:'shutdown', l:'关机', color:'var(--c-warn)', needSel:true},
      {k:'restart', l:'重启', color:'var(--c-info)', needSel:true},
      {k:'block-usb', l:'禁止USB', color:'var(--c-warn)', needSel:true},
      {k:'block-internet', l:'禁止外网', color:'var(--c-warn)', needSel:true},
    ]},
    {label:'部署', icon:'', actions:[
      {k:'distribute', l:'部署桌面', color:'var(--c-brand)', needSel:true},
      {k:'ip-mod', l:'修改IP', color:'var(--c-info)', needSel:true},
    ]},
    {label:'测试', icon:'', actions:[
      {k:'remote-test', l:'网络测试', color:'var(--c-ok)', needSel:true},
      {k:'hw-test', l:'硬件测试', color:'var(--c-info)', needSel:true},
    ]},
    {label:'跨教室测试', icon:'', actions:[
      {k:'broadcast-test', l:'广播隔离测试', color:'var(--c-warn)', needSel:false},
    ]},
  ];

  return `
  <div class="batch-toolbar">
    <div class="batch-groups">
      ${groups.map(g=>`<div class="batch-group">
        <div class="batch-group-label">${g.icon} ${g.label}</div>
        <div class="batch-group-btns">${g.actions.map(a=>{
          const active = pa === a.k;
          const disabled = a.needSel && selOnline.length === 0 && !active;
          return `<button class="batch-btn${active?' active':''}" data-plat-action="${a.k}" style="--accent:${a.color}"${disabled?' disabled':''}>${a.l}${a.needSel && selOnline.length>0 ? ' ('+selOnline.length+')' : ''}</button>`;
        }).join('')}</div>
      </div>`).join('')}
    </div>
    <div class="batch-sel-summary">
      ${sel.length > 0
        ? `已选 <strong>${sel.length}</strong> 台${selOnline.length!==sel.length ? ` (在线 ${selOnline.length})` : ''}`
        : `<span style="color:var(--c-text3)">点击下方终端进行选择</span>`}
      ${uses.length>1?`<span style="position:relative;display:inline-block"><a class="batch-sel-link" data-sel-use-toggle>按用途 ▾</a>${view.showUseDropdown?`<div style="position:absolute;left:0;top:100%;background:#fff;border:1px solid var(--c-border);border-radius:6px;box-shadow:0 4px 12px rgba(0,0,0,.1);z-index:100;min-width:130px;padding:4px 0;margin-top:2px">${uses.map(u=>`<div class="batch-sel-link" data-sel-use="${esc(u)}" style="display:block;padding:6px 14px;cursor:pointer;font-size:.82rem;white-space:nowrap">${esc(u)}</div>`).join('')}</div>`:''}</span>`
      :(uses.length===1?`<a class="batch-sel-link" data-sel-use="${esc(uses[0])}">选${esc(uses[0])}</a>`:'')}
      <a class="batch-sel-link" data-sel-all-online>全选在线</a>      ${sel.length > 0 ? `<a class="batch-sel-link" data-sel-clear>清除</a>` : ''}
    </div>
  </div>

  ${pa ? platActionPanel(pa, par, c, terms) : ''}

  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px">
    <div style="font-size:.85rem;color:var(--c-text3)">
      终端列表 · 共 ${terms.length} 台 · 教师 ${terms.filter(t=>t.use==='教师终端').length} · 学生 ${terms.filter(t=>t.use!=='教师终端').length}
    </div>
    <div style="display:flex;gap:4px">
      <button class="btn btn-ghost btn-sm${viewMode==='layout'?' active':''}" data-term-view="layout">座位图</button>
      <button class="btn btn-ghost btn-sm${viewMode==='list'?' active':''}" data-term-view="list">列表</button>
    </div>
  </div>
  ${viewMode==='layout' ? `
  <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px">
    <button class="btn btn-ghost btn-sm" data-zoom="-10">−</button>
    <span style="font-size:.82rem;min-width:36px;text-align:center">${view.layoutZoom||100}%</span>
    <button class="btn btn-ghost btn-sm" data-zoom="10">+</button>
  </div>` : ''}
  ${viewMode==='layout' ? crLayoutInline(c,terms) : `
  <table class="data-table">
    <thead><tr><th style="width:32px"><input type="checkbox" data-sel-toggle-all${sel.length===terms.length&&terms.length?' checked':''}></th><th>#</th><th>机器名</th><th>座位号</th><th>IP</th><th>用途</th><th>在线</th></tr></thead>
    <tbody>${terms.map((t,i)=>{
      const checked = sel.includes(t.id);
      return `<tr style="${checked?'background:rgba(59,130,246,.06)':''}">
      <td><input type="checkbox" data-term-chk="${t.id}"${checked?' checked':''}></td>
      <td style="font-size:.75rem;color:var(--c-text3)">${i+1}</td>
      <td class="clickable" data-nav-term="${t.id}">${esc(t.name||'未命名')}</td>
      <td>${esc(t.seat||'--')}</td>
      <td class="mono">${esc(t.ip||'未分配')}</td>
      <td>${pill(termUse(t), t.use==='教师终端'?'warn':'muted')}</td>
      <td>${pill(t.online?'在线':'离线',tone(t.online?'on':'offline'))}</td>
    </tr>`;}).join('')}</tbody>
  </table>`}`;
}

function crLayoutInline(c,terms){
  const tk=taskForCr(s(),c.id);
  const zoomPct = view.layoutZoom || 100;
  const cellW = Math.round(88 * zoomPct / 100);
  const cellH = Math.round(44 * zoomPct / 100);
  const fontSize = Math.max(0.55, 0.75 * zoomPct / 100);
  const ipFontSize = Math.max(0.45, 0.58 * zoomPct / 100);
  const sel = view.platSelectedTerms || [];
  const pa = view.platAction || null;
  const par = view.platActionResult || null;
  const isRunning = par?.running;

  function cellHtml(t){
    const executing = tk?.selectedIds?.includes(t.id) && tk?.phase==='running';
    const isBlank = !t.name && !t.ip;
    const selected = sel.includes(t.id);
    const cls = ['layout-cell', t.online?'online':'offline', t.use==='教师终端'?'teacher':'', executing?'executing':'', isBlank?'blank':'', selected?'selected':''].filter(Boolean).join(' ');
    /* If running batch operation, show progress state instead of click-to-select */
    const progItem = par?.progress?.find(p=>p.id===t.id);
    const progState = progItem?.state;
    const progPct = progState==='completed'?100:progState==='failed'?100:progState==='running'?progItem.pct||50:0;
    const progColor = progState==='completed'?'var(--c-ok)':progState==='failed'?'var(--c-err)':progState==='running'?'var(--c-brand)':'transparent';
    return `<div class="${cls}" ${isRunning?'':`data-term-sel="${t.id}"`} title="${esc(t.seat||'')} · ${esc(t.name||'')} · ${esc(t.ip||'无IP')}${t.online?' · 在线':' · 离线'}" style="width:${cellW}px;height:${cellH}px;font-size:${fontSize}rem;display:flex;flex-direction:column;justify-content:center;position:relative;overflow:hidden">
      ${progState?`<div style="position:absolute;left:0;top:0;bottom:0;width:${progPct}%;background:${progColor};opacity:.18;transition:width .4s ease"></div>`:''}
      <div style="position:relative;z-index:1">
        <div class="lc-seat">${t.seat ? esc(t.seat) : '#'+(t.index+1)}</div>
        <div class="lc-ip" style="font-size:${ipFontSize}rem">${t.ip ? esc(t.ip) : '···'}</div>
        ${progState?`<div style="font-size:.55rem;color:${progColor}">${progState==='completed'?'✓':progState==='failed'?'✗':progState==='running'?'…':''}</div>`:''}
      </div>
    </div>`;
  }

  return `
  <div class="layout-grid" style="grid-template-columns:repeat(${c.rows},${cellW}px);grid-template-rows:repeat(${c.cols},${cellH}px);grid-auto-flow:column">
    ${terms.map(t=>cellHtml(t)).join('')}
  </div>`;
}


function platActionPanel(pa, par, c, terms){
  const state=s();
  const sel = view.platSelectedTerms || [];
  const onlineTerms = terms.filter(t=>t.online);
  const onlineSel = sel.filter(id => onlineTerms.some(t=>t.id===id));
  const selTerms = onlineSel.map(id=>terms.find(t=>t.id===id)).filter(Boolean);
  const crsInCampus = state.classrooms.filter(cr=>cr.campusId===view.campusId&&cr.stage==='deployed');

  let content = '';
  const accentMap = {shutdown:'var(--c-warn)', restart:'var(--c-info)', distribute:'var(--c-brand)', 'ip-mod':'var(--c-info)', 'remote-test':'var(--c-ok)', 'broadcast-test':'var(--c-warn)', 'block-internet':'var(--c-warn)', 'block-usb':'var(--c-warn)', 'hw-test':'var(--c-info)'};

  /* ── helper: per-terminal result table ── */
  function resultTable(results, columns){
    if(!results||!results.length) return '';
    return `<div class="plat-inner-scroll" style="max-height:260px;overflow-y:auto;margin-top:10px">
      <table class="data-table plat-sortable" style="font-size:.78rem">
        <thead><tr>${columns.map(c2=>`<th data-sort>${c2.label}</th>`).join('')}<th data-sort>结果</th></tr></thead>
        <tbody>${results.map((r,ri)=>`<tr data-orig-idx="${ri}">
          ${columns.map(c2=>`<td${c2.mono?' class="mono"':''}>${esc(r[c2.key]||'--')}</td>`).join('')}
          <td>${r.ok?pill('成功','ok'):pill('失败','err')}</td>
        </tr>`).join('')}</tbody>
      </table>
    </div>`;
  }

  if(pa==='shutdown'){
    content = `
      <div class="card-header" style="margin:-14px -18px 12px;padding:10px 18px;background:rgba(234,179,8,.06);border-radius:8px 8px 0 0;font-size:.95rem">
        执行关机
      </div>
      <div style="font-size:.85rem;color:var(--c-text2);margin-bottom:10px">
        对选中的 <strong>${selTerms.length}</strong> 台在线终端发送关机指令。
      </div>
      ${par?.done?`<div style="padding:8px 12px;background:rgba(34,197,94,.06);border-radius:6px;margin-bottom:10px">
        <span class="text-ok" style="font-size:.85rem">✓ 已向 ${par.count} 台终端发送关机指令</span>
      </div>
      ${resultTable(par.results,[{key:'seat',label:'座位'},{key:'name',label:'机器名'},{key:'ip',label:'IP',mono:true}])}`:''}
      <div style="display:flex;gap:8px">
        <button class="btn btn-primary btn-sm" data-plat-confirm="shutdown"${par?.done||!selTerms.length?' disabled':''}>确认关机 (${selTerms.length})</button>
        <button class="btn btn-ghost btn-sm" data-plat-cancel>取消</button>
      </div>`;
  }
  if(pa==='restart'){
    content = `
      <div class="card-header" style="margin:-14px -18px 12px;padding:10px 18px;background:rgba(59,130,246,.06);border-radius:8px 8px 0 0;font-size:.95rem">
        执行重启
      </div>
      <div style="font-size:.85rem;color:var(--c-text2);margin-bottom:10px">
        对选中的 <strong>${selTerms.length}</strong> 台在线终端发送重启指令。
      </div>
      ${par?.done?`<div style="padding:8px 12px;background:rgba(34,197,94,.06);border-radius:6px;margin-bottom:10px">
        <span class="text-ok" style="font-size:.85rem">✓ 已向 ${par.count} 台终端发送重启指令</span>
      </div>
      ${resultTable(par.results,[{key:'seat',label:'座位'},{key:'name',label:'机器名'},{key:'ip',label:'IP',mono:true}])}`:''}
      <div style="display:flex;gap:8px">
        <button class="btn btn-primary btn-sm" data-plat-confirm="restart"${par?.done||!selTerms.length?' disabled':''}>确认重启 (${selTerms.length})</button>
        <button class="btn btn-ghost btn-sm" data-plat-cancel>取消</button>
      </div>`;
  }
  if(pa==='distribute'){
    /* Desktop catalog from this classroom */
    const catalog = c.desktopCatalog || [];
    const selDts = view.distDtIds || [];
    const step = !selDts.length ? 1 : 2;

    content = `
      <div class="card-header" style="margin:-14px -18px 12px;padding:10px 18px;background:rgba(59,130,246,.06);border-radius:8px 8px 0 0;font-size:.95rem">
        部署桌面到选中终端
      </div>
      <div style="display:flex;gap:6px;margin-bottom:14px;font-size:.82rem">
        <span style="padding:3px 10px;border-radius:12px;${step>=1?'background:var(--c-brand);color:#fff':'background:var(--c-bg2)'}">① 选择桌面</span>
        <span style="padding:3px 10px;border-radius:12px;${step>=2?'background:var(--c-brand);color:#fff':'background:var(--c-bg2)'}">② 选择部署模式并确认</span>
      </div>

      <div>
        <div style="font-size:.82rem;font-weight:600;margin-bottom:6px">选择要部署的桌面 (可多选)</div>
        ${catalog.length?`<div style="display:flex;flex-direction:column;gap:4px;max-height:220px;overflow-y:auto;padding-right:4px">
          ${catalog.map(d=>{
            const chk=selDts.includes(d.id);
            return `<label style="display:flex;align-items:center;gap:8px;font-size:.82rem;cursor:pointer;padding:6px 10px;border:1px solid ${chk?'var(--c-brand)':'var(--c-border)'};border-radius:6px;background:${chk?'rgba(59,130,246,.06)':'#fff'}">
            <input type="checkbox" data-dist-dt-chk value="${d.id}"${chk?' checked':''}>
            <div style="flex:1">
              <div style="font-weight:600">${esc(d.name)} <span style="font-weight:normal;font-size:.78rem;color:var(--c-text3)">${esc(d.version||'')}</span></div>
              <div style="font-size:.78rem;color:var(--c-text3)">${esc(d.os||'')} · ${d.diskSize||25} GB${(d.dataDisks||[]).length?' · '+(d.dataDisks||[]).map(dd=>'数据盘 '+(dd.size||'')+(dd.drive?' ('+esc(dd.drive)+')':'')).join(' · '):(d.dataDisk?' · 数据盘 '+esc((d.dataDisk||'').replace(/^([A-Z]:)\s*/,'($1) ').replace(/\s*VHD$/,'')):'')}</div>
            </div>
            ${d.physicalDeploy?pill('物理部署','warn'):''}
          </label>`;}).join('')}
        </div>`:`<div style="font-size:.82rem;color:var(--c-text3)">该教室无桌面可部署</div>`}
      </div>

      ${selDts.length > 0 ? `
      <div style="margin-top:12px;padding:10px 14px;background:var(--c-bg2);border-radius:6px">
        <div style="font-size:.82rem;font-weight:600;margin-bottom:6px">部署模式</div>
        <div style="display:flex;gap:16px;font-size:.82rem">
          <label style="display:flex;align-items:center;gap:4px;cursor:pointer"><input type="radio" name="distMode" data-dist-mode="incremental"${(view.distMode||'incremental')==='incremental'?' checked':''}> 增量更新 (仅同步差异，更快)</label>
          <label style="display:flex;align-items:center;gap:4px;cursor:pointer"><input type="radio" name="distMode" data-dist-mode="full"${view.distMode==='full'?' checked':''}> 全量部署 (完整覆盖，更可靠)</label>
        </div>
      </div>` : ''}

      ${par?.running?`<div style="margin-top:10px">
        ${(()=>{
          const pg=par.progress||[];
          const done3=pg.filter(p=>p.state==='completed'||p.state==='failed').length;
          const pct2=pg.length?Math.round(done3/pg.length*100):0;
          return `<div style="margin-bottom:10px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;font-size:.82rem;font-weight:500;color:var(--c-brand)">
              <span>部署进行中…</span><span>${done3}/${pg.length} 完成</span>
            </div>
            <div style="height:16px;background:var(--c-bg2);border-radius:8px;overflow:hidden;border:1px solid var(--c-border)">
              <div style="height:100%;width:${pct2}%;background:var(--c-brand);border-radius:8px;transition:width .3s;display:flex;align-items:center;justify-content:center;font-size:.65rem;color:#fff;font-weight:600;min-width:${pct2>5?'0':'28px'}">${pct2}%</div>
            </div>
          </div>`;
        })()}
        <div class="plat-inner-scroll" style="max-height:300px;overflow-y:auto">
          <table class="data-table" style="font-size:.78rem"><thead><tr><th>座位</th><th>机器名</th><th>进度</th><th>状态</th></tr></thead>
          <tbody>${(par.progress||[]).map(p=>{
            const t=terms.find(tt=>tt.id===p.id);
            const done2=p.state==='completed'||p.state==='failed';
            return `<tr><td>${esc(t?.seat||'--')}</td><td>${esc(t?.name||'--')}</td>
              <td style="width:120px">${done2?'':`<div style="height:6px;background:var(--c-bg2);border-radius:3px;overflow:hidden"><div style="height:100%;width:${Math.round(p.pct)}%;background:var(--c-brand);border-radius:3px;transition:width .3s"></div></div>`}</td>
              <td>${p.state==='completed'?pill('完成','ok'):p.state==='failed'?pill('失败','err'):pill('传输中','info')}</td></tr>`;
          }).join('')}</tbody></table>
        </div>
      </div>`:''}
      ${par?.done?`<div style="margin-top:10px">
        <div style="padding:8px 12px;background:${par.failed?'rgba(239,68,68,.06)':'rgba(34,197,94,.06)'};border-radius:6px;margin-bottom:8px">
          <span class="${par.failed?'text-err':'text-ok'}" style="font-size:.85rem">${par.failed?'⚠':'✓'} 已将 ${par.dtCount||1} 个桌面部署到 ${par.count} 台终端${par.failed?' · '+par.failed+' 台失败':''}</span>
        </div>
        <div class="plat-inner-scroll" style="max-height:260px;overflow-y:auto">
          <table class="data-table plat-sortable" style="font-size:.78rem"><thead><tr><th data-sort>座位</th><th data-sort>机器名</th><th data-sort>结果</th></tr></thead>
          <tbody>${(par.progress||[]).map((p,pi)=>{
            const t=terms.find(tt=>tt.id===p.id);
            return `<tr data-orig-idx="${pi}"><td>${esc(t?.seat||'--')}</td><td>${esc(t?.name||'--')}</td>
              <td>${p.state==='completed'?pill('成功','ok'):pill('失败','err')}</td></tr>`;
          }).join('')}</tbody></table>
        </div>
      </div>`:''}

      <div style="display:flex;gap:8px;margin-top:12px">
        <button class="btn btn-primary btn-sm" data-plat-confirm="distribute"${(!selDts.length||!selTerms.length||par?.done||par?.running)?' disabled':''}>确认部署 ${selDts.length?'('+selDts.length+' 桌面 → '+selTerms.length+' 终端)':''}</button>
        <button class="btn btn-ghost btn-sm" data-plat-cancel>取消</button>
      </div>`;
  }
  if(pa==='ip-mod'){
    const curBase = c.networkBase || '10.0.0';
    const newBase = view.newIpBase || curBase;
    const newStart = view.newIpStart || 20;
    const newMask = view.newIpMask || '255.255.255.0';
    const newGw = view.newIpGw || c.gateway || '';
    const newDns = view.newIpDns || (c.dns||[]).join(',') || '';
    /* Build preview for selected terminals */
    const previewTerms = selTerms.length ? selTerms : [];
    content = `
      <div class="card-header" style="margin:-14px -18px 12px;padding:10px 18px;background:rgba(59,130,246,.06);border-radius:8px 8px 0 0;font-size:.95rem">
        修改终端网络参数
      </div>
      <div style="display:grid;grid-template-columns:280px 1fr;gap:16px;align-items:start">
        <div>
          <div style="font-size:.82rem;font-weight:600;margin-bottom:8px">网络参数</div>
          <div class="prep-field" style="margin-bottom:6px"><label style="width:70px">当前网段</label><span class="mono" style="font-size:.82rem">${esc(curBase)}.0/24</span></div>
          <div class="prep-field" style="margin-bottom:6px"><label style="width:70px">新网段</label><input type="text" data-ip-base value="${esc(newBase)}" placeholder="10.22.15" style="width:130px"></div>
          <div class="prep-field" style="margin-bottom:6px"><label style="width:70px">起始位</label><input type="number" data-ip-start value="${newStart}" min="2" max="250" style="width:80px"></div>
          <div class="prep-field" style="margin-bottom:6px"><label style="width:70px">子网掩码</label><input type="text" data-ip-mask value="${esc(newMask)}" placeholder="255.255.255.0" style="width:130px"></div>
          <div class="prep-field" style="margin-bottom:6px"><label style="width:70px">网关</label><input type="text" data-ip-gw value="${esc(newGw)}" placeholder="${esc(curBase)}.1" style="width:130px"></div>
          <div class="prep-field" style="margin-bottom:6px"><label style="width:70px">DNS</label><input type="text" data-ip-dns value="${esc(newDns)}" placeholder="8.8.8.8,114.114.114.114" style="width:130px"></div>
        </div>
        <div>
          <div style="font-size:.82rem;font-weight:600;margin-bottom:8px">变更预览 · ${previewTerms.length} 台终端</div>
          ${previewTerms.length?`
          <div style="max-height:200px;overflow-y:auto">
            <table class="data-table" style="font-size:.78rem">
              <thead><tr><th>座位</th><th>当前 IP</th><th>新 IP</th></tr></thead>
              <tbody>${previewTerms.map((t,i)=>{
                const newIp=newBase+'.'+(newStart+i);
                return `<tr><td>${esc(t.seat||'--')}</td>
                  <td class="mono">${esc(t.ip||'--')}</td>
                  <td class="mono" style="color:var(--c-ok);font-weight:600">${esc(newIp)}</td></tr>`;
              }).join('')}</tbody>
            </table>
          </div>`
          :`<div style="font-size:.82rem;color:var(--c-text3)">请在下方座位图中选择要修改的终端</div>`}
        </div>
      </div>
      ${par?.done?`<div style="padding:8px 12px;background:${par.failed?'rgba(239,68,68,.06)':'rgba(34,197,94,.06)'};border-radius:6px;margin-top:10px">
        <span class="${par.failed?'text-err':'text-ok'}" style="font-size:.85rem">${par.failed?'⚠':'✓'} 已修改 ${par.count} 台终端网络参数${par.failed?' · '+par.failed+' 台失败':''}</span>
      </div>
      ${resultTable(par.results,[{key:'seat',label:'座位'},{key:'name',label:'机器名'},{key:'oldIp',label:'原 IP',mono:true},{key:'newIp',label:'新 IP',mono:true}])}`:''}
      <div style="display:flex;gap:8px;margin-top:12px">
        <button class="btn btn-primary btn-sm" data-plat-confirm="ip-mod"${par?.done||!previewTerms.length?' disabled':''}>确认修改 (${previewTerms.length})</button>
        <button class="btn btn-ghost btn-sm" data-plat-cancel>取消</button>
      </div>`;
  }
  if(pa==='block-internet'){
    content = `
      <div class="card-header" style="margin:-14px -18px 12px;padding:10px 18px;background:rgba(234,179,8,.06);border-radius:8px 8px 0 0;font-size:.95rem">
        禁止外网访问
      </div>
      <div style="font-size:.85rem;color:var(--c-text2);margin-bottom:10px">
        对选中的 <strong>${selTerms.length}</strong> 台在线终端禁止外网访问，仅保留校园内网和服务器通信。
      </div>
      ${par?.done?`<div style="padding:8px 12px;background:rgba(34,197,94,.06);border-radius:6px;margin-bottom:10px">
        <span class="text-ok" style="font-size:.85rem">✓ 已对 ${par.count} 台终端禁止外网</span>
      </div>
      ${resultTable(par.results,[{key:'seat',label:'座位'},{key:'name',label:'机器名'},{key:'ip',label:'IP',mono:true}])}`:''}
      <div style="display:flex;gap:8px">
        <button class="btn btn-primary btn-sm" data-plat-confirm="block-internet"${par?.done||!selTerms.length?' disabled':''}>确认禁止 (${selTerms.length})</button>
        <button class="btn btn-ghost btn-sm" data-plat-cancel>取消</button>
      </div>`;
  }
  if(pa==='block-usb'){
    content = `
      <div class="card-header" style="margin:-14px -18px 12px;padding:10px 18px;background:rgba(234,179,8,.06);border-radius:8px 8px 0 0;font-size:.95rem">
        禁止USB存储设备
      </div>
      <div style="font-size:.85rem;color:var(--c-text2);margin-bottom:10px">
        对选中的 <strong>${selTerms.length}</strong> 台在线终端禁止 USB 存储设备 (U盘、移动硬盘等)，不影响 USB 键鼠。
      </div>
      ${par?.done?`<div style="padding:8px 12px;background:rgba(34,197,94,.06);border-radius:6px;margin-bottom:10px">
        <span class="text-ok" style="font-size:.85rem">✓ 已对 ${par.count} 台终端禁止 USB 存储</span>
      </div>
      ${resultTable(par.results,[{key:'seat',label:'座位'},{key:'name',label:'机器名'},{key:'ip',label:'IP',mono:true}])}`:''}
      <div style="display:flex;gap:8px">
        <button class="btn btn-primary btn-sm" data-plat-confirm="block-usb"${par?.done||!selTerms.length?' disabled':''}>确认禁止 (${selTerms.length})</button>
        <button class="btn btn-ghost btn-sm" data-plat-cancel>取消</button>
      </div>`;
  }
  if(pa==='hw-test'){
    /* 6 test items in user-specified order, stored in view state for persistence */
    const hwItems = [
      {k:'hw-consistency', l:'硬件一致性'},
      {k:'smart', l:'SMART'},
      {k:'disk-io', l:'硬盘读写速度'},
      {k:'memory', l:'内存'},
      {k:'multi-monitor', l:'显示器'},
      {k:'peripheral', l:'键鼠'}
    ];
    if(!view.hwTestChecked) view.hwTestChecked = hwItems.reduce((o,it)=>{o[it.k]=true;return o;},{});
    const checkedItems = hwItems.filter(it=>view.hwTestChecked[it.k]);
    content = `
      <div class="card-header" style="margin:-14px -18px 12px;padding:10px 18px;background:rgba(59,130,246,.06);border-radius:8px 8px 0 0;font-size:.95rem">
        执行硬件测试
      </div>
      <div style="font-size:.85rem;color:var(--c-text2);margin-bottom:10px">
        对选中的 <strong>${selTerms.length}</strong> 台终端发送自测指令。测试结果将自动上报，异常项将出现在告警中心。
      </div>
      <div style="display:flex;flex-direction:column;gap:4px;margin-bottom:12px">
        ${hwItems.map(it=>`<label style="display:flex;align-items:center;gap:6px;font-size:.82rem;cursor:pointer"><input type="checkbox" data-hw-chk="${it.k}"${view.hwTestChecked[it.k]?' checked':''}> ${esc(it.l)}</label>`).join('')}
      </div>
      <div style="font-size:.72rem;color:var(--c-text3);margin-bottom:10px">仅勾选的项目参与测试。測试结果由终端自测后上报服务器。</div>
      ${par?.done?`<div style="padding:8px 12px;background:${par.failed?'rgba(239,68,68,.06)':'rgba(34,197,94,.06)'};border-radius:6px;margin-bottom:10px">
        <span class="${par.failed?'text-err':'text-ok'}" style="font-size:.85rem">${par.failed?'⚠':'✓'} 硬件测试完成 · ${par.count} 台终端${par.failed?' · '+par.failed+' 台存在异常':' · 全部正常'}</span>
      </div>
      <div class="plat-inner-scroll" style="max-height:300px;overflow-y:auto">
        <table class="data-table plat-sortable" style="font-size:.78rem">
          <thead><tr><th data-sort>座位</th><th data-sort>机器名</th>${(par._testedItems||[]).map(it=>`<th data-sort>${esc(it.l)}</th>`).join('')}<th data-sort>结果</th></tr></thead>
          <tbody>${(par.results||[]).map((r,ri)=>`<tr data-orig-idx="${ri}">
            <td>${esc(r.seat)}</td><td>${esc(r.name)}</td>
            ${(par._testedItems||[]).map(it=>`<td>${r[it.k]?pill('正常','ok'):pill('异常','err')}</td>`).join('')}
            <td>${r.ok?pill('通过','ok'):pill('异常','err')}</td>
          </tr>`).join('')}</tbody>
        </table>
      </div>`:''}
      <div style="display:flex;gap:8px;margin-top:8px">
        <button class="btn btn-primary btn-sm" data-plat-confirm="hw-test"${par?.done||!selTerms.length||!checkedItems.length?' disabled':''}>执行测试 (${selTerms.length})</button>
        <button class="btn btn-ghost btn-sm" data-plat-cancel>取消</button>
      </div>`;
  }
  if(pa==='remote-test'){
    content = `
      <div class="card-header" style="margin:-14px -18px 12px;padding:10px 18px;background:rgba(34,197,94,.06);border-radius:8px 8px 0 0;font-size:.95rem">
        执行网络连通性测试
      </div>
      <div style="font-size:.85rem;color:var(--c-text2);margin-bottom:10px">
        对选中的 <strong>${selTerms.length}</strong> 台在线终端逐台测试网络延迟、带宽、服务器连通性和网关连通性。
      </div>
      ${par?.results?`
      <div style="padding:8px 12px;background:${par.results.every(r=>r.serverReachable&&r.gatewayReachable)?'rgba(34,197,94,.06)':'rgba(239,68,68,.06)'};border-radius:6px;margin-bottom:10px">
        <span class="${par.results.every(r=>r.serverReachable&&r.gatewayReachable)?'text-ok':'text-err'}" style="font-size:.85rem">
          ${par.results.every(r=>r.serverReachable&&r.gatewayReachable)?'✓ 全部终端网络正常':'⚠ 有终端网络异常'} · 已测试 ${par.results.length} 台
        </span>
      </div>
      <div style="display:flex;gap:8px;margin-bottom:8px">
        <button class="btn btn-ghost btn-sm" data-plat-confirm="export-test-report" style="font-size:.78rem">导出测试报告</button>
      </div>
      <div class="plat-inner-scroll" style="max-height:260px;overflow-y:auto">
        <table class="data-table plat-sortable" style="font-size:.78rem">
          <thead><tr><th data-sort>座位</th><th data-sort>机器名</th><th data-sort>IP</th><th data-sort>延迟</th><th data-sort>下行</th><th data-sort>上行</th><th data-sort>服务器</th><th data-sort>网关</th></tr></thead>
          <tbody>${par.results.map((r,ri)=>`<tr data-orig-idx="${ri}">
            <td>${esc(r.seat)}</td><td>${esc(r.name)}</td><td class="mono">${esc(r.ip)}</td>
            <td>${esc(r.latency)}</td><td>${esc(r.bandwidth)}</td><td>${esc(r.upBandwidth||'--')}</td>
            <td>${r.serverReachable?pill('可达','ok'):pill('不可达','err')}</td>
            <td>${r.gatewayReachable?pill('可达','ok'):pill('不可达','err')}</td>
          </tr>`).join('')}</tbody>
        </table>
      </div>`:''}
      <div style="display:flex;gap:8px;margin-top:12px">
        <button class="btn btn-primary btn-sm" data-plat-confirm="remote-test"${par?.results||!selTerms.length?' disabled':''}>执行测试 (${selTerms.length})</button>
        <button class="btn btn-ghost btn-sm" data-plat-cancel>取消</button>
      </div>`;
  }
  if(pa==='broadcast-test'){
    const otherCrs = crsInCampus.filter(cr=>cr.id!==c.id);
    const selCrs = view.broadcastCrs || [];
    content = `
      <div class="card-header" style="margin:-14px -18px 12px;padding:10px 18px;background:rgba(234,179,8,.06);border-radius:8px 8px 0 0;font-size:.95rem">
        执行跨教室广播隔离测试
      </div>
      <div style="font-size:.85rem;color:var(--c-text2);margin-bottom:10px">
        测试本教室 <strong>${esc(c.name)}</strong> 与其他教室之间的广播域隔离。选择对端教室后执行测试，检测是否存在跨教室广播泄漏。
      </div>
      <div style="font-size:.82rem;font-weight:600;margin-bottom:6px">选择对端教室</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px">
        ${otherCrs.map(cr=>{
          const chk=selCrs.includes(cr.id);
          const rt=crRuntime(state,cr.id);
          return `<label style="display:flex;align-items:center;gap:4px;font-size:.82rem;cursor:pointer;padding:5px 12px;border:1px solid ${chk?'var(--c-brand)':'var(--c-border)'};border-radius:6px;background:${chk?'rgba(59,130,246,.06)':'#fff'}">
            <input type="checkbox" data-bcast-cr="${cr.id}"${chk?' checked':''}>
            ${esc(cr.name)} <span style="color:var(--c-text3)">(${rt.online} 在线)</span>
          </label>`;
        }).join('')}
      </div>
      ${par?.results?`
      <div style="padding:8px 12px;background:${par.hasInterference?'rgba(239,68,68,.06)':'rgba(34,197,94,.06)'};border-radius:6px;margin-bottom:10px">
        <span class="${par.hasInterference?'text-err':'text-ok'}" style="font-size:.85rem">
          ${par.hasInterference?'⚠ 检测到跨教室广播泄漏':'✓ 广播域隔离正常'}
        </span>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px">
      ${par.results.map(r=>`<div style="padding:10px 14px;border:1px solid var(--c-border);border-radius:6px;background:#fff">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
          <strong>${esc(c.name)}</strong> <span style="color:var(--c-text3)">↔</span> <strong>${esc(r.peerClassroom)}</strong>
          ${r.leaked?pill('存在泄漏','err'):pill('隔离正常','ok')}
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:.82rem">
          <div style="padding:6px 10px;background:var(--c-bg2);border-radius:4px">
            <div style="font-weight:600;margin-bottom:4px">${esc(c.name)} 侧</div>
            <div>测试终端：${esc(r.localSeat)} (${esc(r.localIp)})</div>
            <div>发送广播包：${r.localSent}</div>
            <div>收到对端包：<span style="color:${r.localRecvForeign>0?'var(--c-err)':'var(--c-ok)'}">${r.localRecvForeign}</span></div>
          </div>
          <div style="padding:6px 10px;background:var(--c-bg2);border-radius:4px">
            <div style="font-weight:600;margin-bottom:4px">${esc(r.peerClassroom)} 侧</div>
            <div>测试终端：${esc(r.peerSeat)} (${esc(r.peerIp)})</div>
            <div>发送广播包：${r.peerSent}</div>
            <div>收到对端包：<span style="color:${r.peerRecvForeign>0?'var(--c-err)':'var(--c-ok)'}">${r.peerRecvForeign}</span></div>
          </div>
        </div>
      </div>`).join('')}
      </div>`:''}
      <div style="display:flex;gap:8px;margin-top:12px">
        <button class="btn btn-primary btn-sm" data-plat-confirm="broadcast-test"${!selCrs.length||par?.results?' disabled':''}>执行测试 (${selCrs.length} 教室)</button>
        <button class="btn btn-ghost btn-sm" data-plat-cancel>取消</button>
      </div>`;
  }
  if(pa==='import-list') return '';
  if(!content) return '';

  return `<div class="batch-detail" style="border-left:3px solid ${accentMap[pa]||'var(--c-border)'}">
    ${content}
  </div>`;
}



function alertHtml(a, showNav){
  const t=getTerm(s(),a.terminalId);
  const c=showNav?getClassroom(s(),a.classroomId):null;
  const levelLabel={high:'高',medium:'中',low:'低'};
  /* Source line: classroom + terminal as distinct clickable chips */
  let sourceLine='';
  if(c||t){
    const parts=[];
    if(c) parts.push(`<a class="clickable" data-nav-cr-tab="${c.id}" data-tab-target="alerts" style="cursor:pointer;display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:4px;background:rgba(59,130,246,.08);color:var(--c-brand);font-size:.78rem;font-weight:500;text-decoration:none;border:1px solid rgba(59,130,246,.15)"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>${esc(c.name)}</a>`);
    if(t&&t.seat) parts.push(`<a class="clickable" data-nav-term="${t.id}" style="cursor:pointer;display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:4px;background:rgba(99,102,241,.08);color:#6366f1;font-size:.78rem;font-weight:500;text-decoration:none;border:1px solid rgba(99,102,241,.15)"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>座位 ${esc(t.seat)}</a>`);
    sourceLine=`<div style="display:flex;align-items:center;gap:6px;margin-top:4px">${parts.join('<span style="color:var(--c-text3);font-size:.7rem">›</span>')}</div>`;
  }
  return `<div class="alert-row ${a.level}" style="flex-direction:column;align-items:stretch;gap:4px">
    <div style="display:flex;align-items:center;gap:6px">
      <span>${pill(levelLabel[a.level]||a.level,a.level==='high'?'err':a.level==='medium'?'warn':'muted')}</span>
      <strong style="font-size:.88rem;flex:1">${esc(a.title)}</strong>
      <span class="al-time">${relTime(a.at)}</span>
    </div>
    <div style="font-size:.82rem;color:var(--c-text2);padding-left:2px">${esc(a.detail)}</div>
    ${sourceLine}
  </div>`;
}


function terminalDetailPage(){
  const state=s(); const t=getTerm(state,view.terminalId); if(!t) return empty('终端不存在');
  const c=getClassroom(state,t.classroomId); const tk=taskForCr(state,t.classroomId); const item=tk?.items.find(i=>i.terminalId===t.id);
  const alerts=state.alerts.filter(a=>a.terminalId===t.id&&a.status==='open');
  const isBlank = !t.name && !t.ip;
  const bios = t.bios;
  const taskStateLabel={queued:'排队中',transferring:'传输中',applying:'写入中',rebooting:'重启中',completed:'已完成',failed:'失败'};
  const desktops = t.desktops || [];
  const defaultDt = desktops.find(d=>d.id===bios?.defaultBootId);
  const met = t.metrics || {};
  const memPct = met.memTotal ? Math.round(Math.min(met.memUsed,met.memTotal)/met.memTotal*100) : 0;
  const diskPct = met.diskTotal ? Math.round(Math.min(met.diskUsed,met.diskTotal)/met.diskTotal*100) : 0;

  /* Sparkline data from terminal history */
  const hist = t._monitorHistory || [];
  const cpuHist = hist.map(h=>h.cpu);
  const memHist = hist.map(h=>h.mem);
  const netHist = hist.map(h=>h.net||0);
  const cpuColor = (met.cpu||0)>80?'#ef4444':(met.cpu||0)>60?'#f59e0b':'#22c55e';
  const memColor = memPct>85?'#ef4444':memPct>70?'#f59e0b':'#3b82f6';
  const diskColor = diskPct>85?'#ef4444':diskPct>70?'#f59e0b':'#3b82f6';
  const diskHist = hist.map(h=>h.disk);

  return `
  <div style="display:flex;align-items:baseline;gap:12px;margin-bottom:16px;flex-wrap:wrap">
    <button class="btn btn-ghost btn-sm" data-back-cr="${t.classroomId}">← 返回教室</button>
    <h2 style="font-size:1.2rem">${esc(t.name||t.seat||'--')}</h2>
    ${t.seat?pill(t.seat,'muted'):''}
    ${pill(termUse(t), t.use==='教师终端'?'warn':'muted')}
    ${pill(t.online?'在线':'离线',tone(t.online?'on':'offline'))}
    ${isBlank?pill('未部署','muted'):''}
  </div>

  <!-- Row 1: 配置 + 外部连接 + 硬件信息 (3 columns) -->
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:16px">
    <div class="card">
      <div class="card-header">配置</div>
      ${defRow('机器名', t.name || '未命名')}
      ${defRow('座位号', t.seat || '未分配')}
      ${defRow('终端用途', termUse(t))}
      ${defRow('IP 地址', t.ip || '未配置', {mono:true})}
      ${defRow('子网掩码', t.subnetMask || '255.255.255.0', {mono:true})}
      ${defRow('网关', t.gateway || '未配置', {mono:true})}
      ${defRow('DNS', (t.dns||[]).join(',') || '未配置', {mono:true})}
    </div>
    <div class="card">
      <div class="card-header">外部连接</div>
      ${defRow('服务器地址', t.serverAddr || '未配置', {mono:true})}
      <div class="def-row"><span class="def-label">服务器状态</span><span class="def-value">${t.serverAddr?pill('已连接','ok'):pill('未配置','muted')}</span></div>
      ${defRow('同步状态', t.sync==='synced'?'已同步':t.sync==='syncing'?'同步中':t.sync==='failed'?'同步失败':'未同步')}
      ${defRow('最近同步', t.lastSyncTime?fmtTime(t.lastSyncTime):'未同步')}
      ${defRow('最近心跳', relTime(t.heartbeat))}
    </div>
    <div class="card">
      <div class="card-header">硬件信息</div>
      <div class="def-row"><span class="def-label">网卡</span><span class="def-value" style="display:flex;flex-direction:column;gap:2px">${(t.macList||[t.mac]).map((m,idx)=>`<span style="font-family:var(--mono);font-size:.82rem">${esc(m||'--')}${idx===0?' '+pill('工作网卡','info'):''}</span>`).join('')}</span></div>
      ${defRow('处理器', t.hw?.cpu||'--')}
      ${defRow('显卡', t.hw?.gpu||'--')}
      ${defRow('内存', t.hw?.mem||'--')}
      ${defRow('硬盘', (t.hw?.diskModel||'--')+' ('+esc(t.hw?.diskSn||'--')+')')}
    </div>
  </div>

  <!-- Row 2: 实时状态 sparklines (same style as dashboard server status) -->
  <div class="section" style="margin-bottom:16px">
    <div class="section-head"><h3>实时状态</h3></div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px">
      <div class="sparkline-wrap">
        <div class="spark-label"><span class="spark-title">CPU</span><span class="spark-value" style="color:${cpuColor}">${met.cpu||0}%</span></div>
        ${sparklineSvg(cpuHist, cpuColor, 200, 48)}
      </div>
      <div class="sparkline-wrap">
        <div class="spark-label"><span class="spark-title">内存</span><span class="spark-value" style="color:${memColor}">${memPct}%</span></div>
        ${sparklineSvg(memHist, memColor, 200, 48)}
      </div>
      <div class="sparkline-wrap">
        <div class="spark-label"><span class="spark-title">以太网</span><span class="spark-value" style="color:#6366f1">${netHist.length?netHist[netHist.length-1].toFixed(1):'--'} MB/s</span></div>
        ${sparklineSvg(netHist, '#6366f1', 200, 48)}
      </div>
    </div>
  </div>

  <!-- Row 3: 存储 (same style as dashboard server storage) -->
  <div class="section" style="margin-bottom:16px">
    <div class="section-head"><h3>存储</h3></div>
    <div>
      <div style="display:flex;align-items:baseline;gap:10px;margin-bottom:8px">
        <span style="font-size:1.6rem;font-weight:700;color:${diskColor}">${diskPct}%</span>
        <span style="font-size:.85rem;color:var(--c-text3)">已用 ${Math.min(met.diskUsed||0,met.diskTotal||0)} GB / 共 ${met.diskTotal||0} GB</span>
      </div>
      <div style="height:20px;background:var(--c-bg2);border-radius:10px;overflow:hidden;border:1px solid var(--c-border)">
        <div style="height:100%;width:${diskPct}%;background:${diskColor};border-radius:10px;transition:width .3s"></div>
      </div>
      <div style="display:flex;justify-content:space-between;margin-top:6px;font-size:.78rem;color:var(--c-text3)">
        <span>已用 ${Math.min(met.diskUsed||0,met.diskTotal||0)} GB</span>
        <span>可用 ${Math.max(0,(met.diskTotal||0)-Math.min(met.diskUsed||0,met.diskTotal||0))} GB</span>
      </div>
    </div>
  </div>

  <!-- Row 4: 桌面 (card-style like terminal side) -->
  ${desktops.length?`<div class="section">
    <div class="section-head"><h3>终端桌面 · ${desktops.length} 个</h3><span style="font-size:.82rem;color:var(--c-text3);margin-left:8px">数据来自终端自行上报</span></div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px">
      ${desktops.map(d=>{
        const isDefault = d.id===bios?.defaultBootId;
        const isPhysical = d.physicalDeploy;
        const inBoot = bios?.bootEntries?.includes(d.id);
        const isHidden = d.visibility==='hidden';
        const uploaded = d.uploaded || d.syncStatus==='synced';
        const dtSize = d.diskSize || 25;
        const dataDisks = d.dataDisks || [];
        return `<div class="card" style="padding:14px 16px${isDefault?';border-left:3px solid var(--c-brand)':''}">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px">
            <strong style="font-size:.95rem">${esc(d.name)}</strong>
            <span style="font-size:.82rem;color:var(--c-text3)">${esc(d.baseImageName||d.os||'')}</span>
          </div>
          <div style="display:flex;align-items:baseline;gap:6px;margin-bottom:6px;flex-wrap:wrap">
            <span style="font-weight:600;font-size:.88rem">${dtSize} GB</span>
            ${dataDisks.length?`<span style="display:inline-block;width:1px;height:12px;background:var(--c-border);margin:0 2px"></span><span style="font-size:.78rem;color:var(--c-text2)">${dataDisks.map(dd=>'数据盘 '+(esc(dd.size)||'')+(dd.drive?' ('+esc(dd.drive)+')':'')).join(' · ')}</span>`
              :(d.dataDisk?`<span style="display:inline-block;width:1px;height:12px;background:var(--c-border);margin:0 2px"></span><span style="font-size:.78rem;color:var(--c-text2)">数据盘 ${esc((d.dataDisk||'').replace(/^([A-Z]:)\s*/,'').replace(/\s*VHD$/,''))}${(d.dataDisk||'').match(/^[A-Z]:/)?` (${(d.dataDisk||'').match(/^([A-Z]:)/)[1]})`:''}</span>`
              :'')}
            <span style="display:inline-block;width:1px;height:12px;background:var(--c-border);margin:0 2px"></span>
            <span style="font-size:.78rem;color:var(--c-text2)">${isPhysical?'物理部署 (独立分区)':'虚拟部署 (VHD)'}</span>
          </div>
          <div style="display:flex;gap:4px;flex-wrap:wrap;align-items:center">
            ${isDefault?pill('默认启动','info'):''}
            ${isPhysical?pill('物理部署','info'):''}
            ${!uploaded?pill('未同步','err'):''}
            ${isHidden?pill('已隐藏','muted'):(!inBoot&&!isPhysical?pill('隐藏','muted'):'')}
          </div>
          <div style="font-size:.75rem;color:var(--c-text3);margin-top:6px">还原策略: ${esc(d.restoreMode||'--')}</div>
          <div style="font-size:.72rem;color:var(--c-text3);margin-top:4px">
            ${d.createdAt?`创建 ${fmtTime(d.createdAt)}`:''} ${d.editedAt?`· 更新 ${fmtTime(d.editedAt)}`:''}
          </div>
        </div>`;
      }).join('')}
    </div>
  </div>`:''}
  ${alerts.length?`<div class="mt-16 section-head"><h3>告警</h3></div>${alerts.map(a=>alertHtml(a,false)).join('')}`:''}
  `;
}


/* ── Assets import flow (exclusive page) ── */
function assetsImportFlow(state){
  const ir = view.importDesktopResult || null;
  return `
  <div style="margin-bottom:12px">
    <button class="btn btn-ghost btn-sm" data-asset-flow-back>← 返回桌面资产</button>
  </div>
  <div style="max-width:700px">
    <div class="card" style="border-left:3px solid var(--c-brand);margin-bottom:20px">
      <div class="card-header" style="font-size:1.05rem">导入桌面</div>
      <div style="font-size:.85rem;color:var(--c-text2);margin-bottom:16px">
        选择桌面包文件 (.cdpkg / .vhd / .img)，导入后桌面为无教室引用状态，需通过部署分发到教室终端。
      </div>

      <div style="margin-bottom:16px;padding:20px;background:var(--c-bg2);border-radius:8px;border:2px dashed var(--c-border);text-align:center;cursor:pointer" data-import-desktop-file-area>
        <div style="font-size:.9rem;font-weight:600;margin-bottom:4px">${view.importDesktopFileReady?'✓ 已读取桌面包文件':'点击选择或拖拽桌面包文件到此处'}</div>
        <div style="font-size:.82rem;color:var(--c-text3)">支持 .cdpkg / .vhd / .img 格式</div>
      </div>

      ${view.importDesktopFileReady?`
      <div style="border:1px solid var(--c-border);border-radius:8px;padding:14px 18px;margin-bottom:16px;background:#fff">
        <div style="font-size:.85rem;font-weight:600;color:var(--c-text2);margin-bottom:10px">桌面信息</div>
        <div class="prep-field" style="margin-bottom:8px"><label style="width:80px;font-size:.85rem">桌面名称</label>
          <input type="text" data-pif-name value="${esc(view.importDesktopName||'导入的桌面')}" placeholder="桌面名称" style="width:280px"></div>
        <div class="prep-field" style="margin-bottom:8px"><label style="width:80px;font-size:.85rem">部署方式</label>
          <select data-pif-physical style="width:200px">
            <option value="false"${(view.importDesktopPhysical||'false')==='false'?' selected':''}>虚拟部署 (VHD)</option>
            <option value="true"${view.importDesktopPhysical==='true'?' selected':''}>物理部署 (独立分区)</option>
          </select></div>
        <div class="prep-field" style="margin-bottom:8px"><label style="width:80px;font-size:.85rem">数据盘</label>
          <select data-pif-disk style="width:200px">
            <option value=""${!view.importDesktopDisk?' selected':''}>不添加数据盘</option>
            <option value="yes"${view.importDesktopDisk==='yes'?' selected':''}>添加数据盘</option>
          </select></div>
        ${view.importDesktopDisk==='yes'?`
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:4px">
          <div class="prep-field"><label style="font-size:.82rem">大小 (GB)</label><div style="display:flex;align-items:center;gap:6px"><input type="number" data-pif-disk-size value="${view.importDesktopDiskSize||50}" min="1" max="2000" style="width:90px"><span style="font-size:.82rem;color:var(--c-text2)">GB</span></div></div>
          <div class="prep-field"><label style="font-size:.82rem">挂载盘符或路径</label><input type="text" data-pif-disk-drive value="${esc(view.importDesktopDiskDrive||'D')}" placeholder="D 或 /data" style="width:100%;box-sizing:border-box"></div>
        </div>`:''}
        <div class="prep-field" style="margin-bottom:8px;margin-top:8px"><label style="width:80px;font-size:.85rem">备注</label>
          <input type="text" data-pif-remark value="${esc(view.importDesktopRemark||'')}" placeholder="可选" style="width:380px"></div>
      </div>`:''}

      ${ir?.done?`<div style="color:var(--c-ok);font-size:.85rem;margin:12px 0;padding:8px 12px;background:rgba(34,197,94,.08);border-radius:6px">✓ ${esc(ir.message)}</div>`:''}
      <div style="display:flex;gap:8px;margin-top:16px">
        <button class="btn btn-primary" data-pif-confirm${ir?.done||!view.importDesktopFileReady?' disabled':''}>确认导入</button>
        <button class="btn btn-ghost" data-asset-flow-back>取消</button>
      </div>
    </div>
  </div>`;
}

/* ── Assets export flow (exclusive page) ── */
function assetsExportFlow(state, crsWithDesktops){
  const deskMap=new Map();
  crsWithDesktops.forEach(c=>{
    (c.desktopCatalog||[]).forEach(d=>{
      const key=d.name;
      if(!deskMap.has(key)) deskMap.set(key,{name:d.name, os:d.os||'', diskSize:d.diskSize||25, id:d.id, classrooms:[]});
      const entry=deskMap.get(key);
      if(!entry.classrooms.find(cr=>cr.id===c.id)) entry.classrooms.push({id:c.id, name:c.name});
    });
  });
  const allDesktops=[...deskMap.values()];
  const selected=view.exportSelectedDesktops||new Set(allDesktops.map(d=>d.name));
  const selDts=allDesktops.filter(d=>selected.has(d.name));
  const total=selDts.reduce((t,d)=>t+(d.diskSize||25),0);
  const exportDir=view.exportDir||'D:\\CloudDesktop\\Export';
  const dateStr=new Date().toISOString().slice(0,10);
  const sep=/^[A-Za-z]:/.test(exportDir)||exportDir.includes('\\')?'\\':'/';
  const dirDisplay=sep==='\\'?exportDir.replace(/\//g,'\\'):exportDir;
  const er = view.exportDesktopResult || null;

  return `
  <div style="margin-bottom:12px">
    <button class="btn btn-ghost btn-sm" data-asset-flow-back>← 返回桌面资产</button>
  </div>
  <div style="max-width:700px">
    <div class="card" style="border-left:3px solid var(--c-text3);margin-bottom:20px">
      <div class="card-header" style="font-size:1.05rem">导出桌面</div>
      <div style="font-size:.85rem;color:var(--c-text2);margin-bottom:12px">将桌面导出为桌面包，便于工程师携带至线下教室导入。</div>

      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <span style="font-size:.78rem;color:var(--c-text2);cursor:pointer;text-decoration:underline" data-pef-toggle>全选 / 取消</span>
        <span style="font-size:.78rem;color:var(--c-text3)">${selDts.length} / ${allDesktops.length}</span>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px;max-height:220px;overflow-y:auto;margin-bottom:12px">
        ${allDesktops.map(d=>{const sel=selected.has(d.name);
          const crLabel=d.classrooms.length<=2?d.classrooms.map(c2=>esc(c2.name)).join('、'):(esc(d.classrooms[0].name)+' 等共 '+d.classrooms.length+' 教室引用');
          return `<div class="clickable" data-pef-dt="${esc(d.name)}" style="display:flex;align-items:center;gap:10px;padding:8px 12px;border:2px solid ${sel?'var(--c-brand)':'var(--c-border)'};border-radius:6px;background:${sel?'rgba(59,130,246,.06)':'transparent'};cursor:pointer;transition:all .15s">
          <div style="width:20px;height:20px;border-radius:4px;background:${sel?'var(--c-brand)':'var(--c-border)'};display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all .15s">${sel?'<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>':''}</div>
          <div style="flex:1;min-width:0">
            <div style="font-size:.85rem;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(d.name)}</div>
            <div style="font-size:.72rem;color:var(--c-text3)">${esc(d.os)} · ${d.diskSize} GB · ${crLabel}</div>
          </div>
        </div>`;}).join('')}
      </div>

      <div style="border-top:1px solid var(--c-border);padding-top:10px;margin-bottom:10px">
        <label style="font-size:.82rem;font-weight:600;display:block;margin-bottom:4px">导出文件夹</label>
        <div style="display:flex;gap:6px;align-items:center">
          <input type="text" data-pef-dir value="${esc(exportDir)}" style="flex:1;padding:6px 10px;border:1px solid var(--c-border);border-radius:4px;font-size:.85rem;font-family:monospace;box-sizing:border-box">
          <button class="btn btn-ghost btn-sm" data-pef-browse style="white-space:nowrap">浏览…</button>
        </div>
      </div>
      ${selDts.length?`<div style="margin-bottom:10px">
        <div style="font-size:.82rem;font-weight:600;margin-bottom:4px">导出文件预览</div>
        <div style="padding:8px 12px;background:var(--c-bg2);border:1px solid var(--c-border);border-radius:4px;font-size:.78rem;font-family:monospace;color:var(--c-brand);word-break:break-all;max-height:90px;overflow-y:auto;line-height:1.6">
          ${selDts.map(d=>esc(dirDisplay)+sep+esc(d.name.replace(/[\\/:*?"<>|]/g,'-'))+'-'+dateStr+'.cdpkg').join('<br>')}
        </div>
      </div>`:''}
      <div style="font-size:.82rem;margin-bottom:12px"><strong>合计</strong> ${selDts.length} 个桌面 · ${total} GB</div>

      ${er?.done?`<div style="color:var(--c-ok);font-size:.85rem;margin:12px 0;padding:8px 12px;background:rgba(34,197,94,.08);border-radius:6px">✓ ${esc(er.message)}</div>`:''}
      <div style="display:flex;gap:8px">
        <button class="btn btn-primary" data-pef-confirm${!selDts.length||er?.done?' disabled':''}>导出 (${selDts.length})</button>
        <button class="btn btn-ghost" data-asset-flow-back>取消</button>
      </div>
    </div>
  </div>`;
}

function assetsPage(){
  const state=s(); const campus=getCampus(state,view.campusId); const server=serverFor(state,view.campusId);
  const crIds = state.classrooms.filter(c=>c.campusId===view.campusId).map(c=>c.id);
  const crsWithDesktops = state.classrooms.filter(c=>crIds.includes(c.id)&&(c.desktopCatalog||[]).length>0);

  /* ── Import flow (exclusive) ── */
  if(view.assetFlowMode==='import') return assetsImportFlow(state);
  /* ── Export flow (exclusive) ── */
  if(view.assetFlowMode==='export') return assetsExportFlow(state, crsWithDesktops);

  /* Group desktops by name across classrooms */
  const groupMap = new Map();
  crsWithDesktops.forEach(c=>{
    (c.desktopCatalog||[]).forEach(d=>{
      const key = d.name;
      /* Parse dataDisk string into structured fields if dataDisks not present */
      const dDisks = d.dataDisks || (d.dataDisk ? [{drive:(d.dataDisk.match(/^([A-Z]:)/)||[])[1]||'', size:(d.dataDisk.match(/(\d+G[B]?)/i)||[])[1]||''}] : []);
      if(!groupMap.has(key)){
        groupMap.set(key, {name:d.name, os:d.os||'', type:d.type||'', diskSize:d.diskSize||0, dataDisks:dDisks, physicalDeploy:!!d.physicalDeploy, restoreMode:c.restoreMode||'--', entries:[]});
      } else {
        /* Merge: prefer non-empty values from subsequent classrooms */
        const g=groupMap.get(key);
        if(!g.diskSize && d.diskSize) g.diskSize=d.diskSize;
        if(!g.dataDisks.length && dDisks.length) g.dataDisks=dDisks;
        if(!g.os && d.os) g.os=d.os;
        if(!g.physicalDeploy && d.physicalDeploy) g.physicalDeploy=true;
      }
      const tUsing = termsInCr(state,c.id).filter(t=>(t.desktops||[]).some(td=>td.id===d.id));
      groupMap.get(key).entries.push({...d, classroomId:c.id, classroomName:c.name, termsUsing:tUsing});
    });
  });
  /* Also include platform-level imported desktops (unreferenced) */
  (state.platformDesktops||[]).forEach(d=>{
    const key=d.name;
    const dDisks=d.dataDisks||[];
    if(!groupMap.has(key)){
      groupMap.set(key,{name:d.name, os:d.os||'', type:d.type||'', diskSize:d.diskSize||0, dataDisks:dDisks, physicalDeploy:!!d.physicalDeploy, restoreMode:d.restoreMode||'--', entries:[]});
    }
    groupMap.get(key).entries.push({...d, classroomId:null, classroomName:'(无教室引用)', termsUsing:[]});
  });
  const allGroups = [...groupMap.values()].map(g=>{
    const totalTerms = g.entries.reduce((n,e)=>n+e.termsUsing.length,0);
    const latestEdit = g.entries.reduce((d,e)=>(!d||e.editedAt>d?e.editedAt:d),null);
    const latestCreate = g.entries.reduce((d,e)=>(!d||e.createdAt>d?e.createdAt:d),null);
    const classroomCount = g.entries.filter(e=>e.classroomId!=null).length;
    return {...g, totalTerms, latestEdit, latestCreate, classroomCount};
  });

  /* sorting */
  const sortKey = view.assetSort || 'name';
  const sortAsc = view.assetSortAsc ?? true;
  const dir = sortAsc ? 1 : -1;
  allGroups.sort((a,b)=>{
    if(sortKey==='name') return a.name.localeCompare(b.name)*dir;
    if(sortKey==='classroom') return (a.classroomCount-b.classroomCount)*dir;
    if(sortKey==='terminals') return (a.totalTerms-b.totalTerms)*dir;
    if(sortKey==='created') return (new Date(a.latestCreate||0)-new Date(b.latestCreate||0))*dir;
    return 0;
  });

  const totalDesktops = allGroups.length;
  const totalSnaps = crsWithDesktops.reduce((n,c)=>(c.snapshotTree||[]).length+n,0);
  const totalImages = crsWithDesktops.reduce((n,c)=>(c.imageStore||[]).length+n,0);

  function fSize(id){ let h=0;for(let i=0;i<id.length;i++) h=((h<<5)-h+id.charCodeAt(i))|0; return (Math.abs(h%40)+8)+'.'+(Math.abs(h>>8)%10)+' GB'; }
  const estSnaps = crsWithDesktops.flatMap(c=>(c.snapshotTree||[]));
  const estImages = crsWithDesktops.flatMap(c=>(c.imageStore||[]));
  const totalStorageGB = [...estSnaps,...estImages].reduce((sum,item)=>{
    let h=0;for(let i=0;i<item.id.length;i++) h=((h<<5)-h+item.id.charCodeAt(i))|0;
    return sum+(Math.abs(h%40)+8)+((Math.abs(h>>8)%10)/10);
  },0);

  const sortArrow = sortAsc ? '↑' : '↓';
  function sortBtn(key,label){ return `<button class="btn btn-sm${sortKey===key?' btn-primary':' btn-ghost'}" data-asset-sort="${key}">${label}${sortKey===key?' '+sortArrow:''}</button>`; }

  const dar = view.deleteAssetResult || null;
  const expanded = view.expandedAssets || {};

  return `
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;max-width:700px;margin-bottom:20px">
    <div class="card" style="padding:16px 20px;cursor:pointer;border-left:3px solid var(--c-brand);display:flex;align-items:center;gap:12px" data-asset-action="import">
      <div>
        <div style="font-weight:600;font-size:.95rem">导入桌面</div>
        <div style="font-size:.82rem;color:var(--c-text3)">从桌面包导入，导入后无教室引用，需通过部署分发</div>
      </div>
    </div>
    <div class="card" style="padding:16px 20px;cursor:pointer;border-left:3px solid var(--c-text3);display:flex;align-items:center;gap:12px" data-asset-action="export">
      <div>
        <div style="font-weight:600;font-size:.95rem">导出桌面</div>
        <div style="font-size:.82rem;color:var(--c-text3)">将桌面导出为桌面包，便于工程师携带至线下教室导入</div>
      </div>
    </div>
  </div>

  ${dar?.done?`<div style="color:var(--c-ok);font-size:.85rem;margin-bottom:12px;padding:8px 12px;background:rgba(34,197,94,.08);border-radius:6px">✓ ${esc(dar.message)}</div>`:''}

  <div style="display:flex;justify-content:flex-end;gap:6px;margin-bottom:12px">
    ${sortBtn('name','名称')} ${sortBtn('classroom','教室数')} ${sortBtn('terminals','终端数')} ${sortBtn('created','创建时间')}
  </div>

  ${allGroups.length?`
  <div style="display:flex;flex-direction:column;gap:12px">
    ${allGroups.map(g=>{
      const unreferenced = g.totalTerms===0;
      const isExpanded = expanded[g.name];
      const multiCr = g.classroomCount > 1;
      return `<div class="card" style="padding:0;overflow:hidden${unreferenced?';border-left:3px solid var(--c-warn)':''}">
        <div style="padding:14px 20px;display:flex;align-items:flex-start;gap:16px;flex-wrap:wrap">
          <div style="flex:1;min-width:200px">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px">
              <strong style="font-size:1rem">${esc(g.name)}</strong>
              <span style="font-size:.82rem;color:var(--c-text3)">${esc(g.os)}</span>
              ${g.classroomCount>0?pill(g.classroomCount+' 教室引用','muted'):pill('无教室引用','warn')}
              ${unreferenced&&g.classroomCount===0?`<span style="font-size:.78rem;color:var(--c-warn);font-weight:500">空闲</span>`:''}
            </div>
            <div style="display:flex;gap:12px;flex-wrap:wrap;font-size:.85rem;color:var(--c-text2);margin-bottom:4px;align-items:center">
              ${g.entries.filter(e=>e.classroomId!=null).map(e=>`<a class="clickable" data-nav-cr="${e.classroomId}" style="cursor:pointer;color:var(--c-brand);font-size:.82rem">${esc(e.classroomName)}</a>`).join('<span style="color:var(--c-text3)">·</span>')}
              ${g.classroomCount===0?'<span style="font-size:.82rem;color:var(--c-text3)">(无教室引用)</span>':''}
              <span style="display:inline-block;width:1px;height:14px;background:var(--c-border)"></span>
              <span style="font-size:.82rem;color:var(--c-text2)">终端引用：<strong>${g.totalTerms}</strong> 台</span>
            </div>
            <div style="display:flex;gap:16px;flex-wrap:wrap;font-size:.85rem;color:var(--c-text2);align-items:center">
              <span style="font-weight:600">${g.diskSize||'--'} GB</span>
              ${(g.dataDisks||[]).length?`<span style="display:inline-block;width:1px;height:14px;background:var(--c-border)"></span><span>${(g.dataDisks||[]).map(dd=>'数据盘 '+(esc(dd.size)||'')+(dd.drive?' ('+esc(dd.drive)+')':'')).join(' · ')}</span>`:''}
              <span style="display:inline-block;width:1px;height:14px;background:var(--c-border)"></span>
              <span style="font-size:.78rem">${g.physicalDeploy?'物理部署 (独立分区)':'虚拟部署 (VHD)'}</span>
            </div>
            <div style="display:flex;gap:12px;flex-wrap:wrap;font-size:.78rem;color:var(--c-text3);margin-top:4px">
              ${g.latestCreate?`<span>创建 ${fmtTime(g.latestCreate)}</span>`:''}
              ${g.latestEdit?`<span>更新 ${fmtTime(g.latestEdit)}</span>`:''}
            </div>
          </div>
          <div style="display:flex;gap:6px;align-items:flex-start;flex-shrink:0">
            ${g.totalTerms>0?`<button class="btn btn-ghost btn-sm" data-expand-asset="${g.name}" style="font-size:.78rem">${isExpanded?'收起':'展开'} ${g.totalTerms} 终端</button>`:''}
            ${unreferenced?`<button class="btn btn-ghost btn-sm" style="color:var(--c-err);font-size:.78rem" data-delete-asset="${g.entries[0].id}" data-delete-cr="${g.entries[0].classroomId}">删除</button>`:''}
          </div>
        </div>
        ${isExpanded?`<div style="border-top:1px solid var(--c-border);background:var(--c-bg2)">
          ${g.entries.filter(e=>e.termsUsing.length).map(e=>`<div style="padding:8px 20px${g.entries.filter(e2=>e2.termsUsing.length).length>1?';border-bottom:1px solid var(--c-border)':''}">
            <div style="font-size:.78rem;font-weight:600;color:var(--c-text2);margin-bottom:6px">${esc(e.classroomName)}</div>
            <div style="display:flex;flex-wrap:wrap;gap:6px">${e.termsUsing.map(t=>`<div style="display:inline-flex;align-items:center;gap:6px;padding:3px 10px;background:#fff;border:1px solid var(--c-border);border-radius:4px;font-size:.8rem">
              <a class="clickable" data-nav-term="${t.id}" style="cursor:pointer;color:var(--c-brand);text-decoration:underline">${esc(t.seat||'--')}</a>
              <span>${esc(t.name||'')}</span>
              ${pill(t.online?'在线':'离线',tone(t.online?'on':'offline'))}
            </div>`).join('')}</div>
          </div>`).join('')}
        </div>`:''}
      </div>`;
    }).join('')}
  </div>`
  :empty('当前校区无桌面资产','需从终端侧上传桌面后可见')}
  `;
}


function alertsPage(){
  const state=s(); const campus=getCampus(state,view.campusId);
  const crIds = new Set(state.classrooms.filter(c=>c.campusId===view.campusId).map(c=>c.id));
  const campusAlerts=state.alerts.filter(a=>a.status==='open'&&crIds.has(a.classroomId));

  const sortMode = view.alertSort || 'severity';
  const sortAsc = view.alertSortAsc ?? false;
  const dir = sortAsc ? 1 : -1;
  const levelOrder = {high:0,medium:1,low:2};
  const sorted = [...campusAlerts].sort((a,b)=>{
    if(sortMode==='severity'){
      const cmp = (levelOrder[a.level]??9)-(levelOrder[b.level]??9);
      return cmp!==0 ? (sortAsc ? -cmp : cmp) : (new Date(b.at)-new Date(a.at));
    }
    return (new Date(a.at)-new Date(b.at))*dir; // default: time
  });

  /* severity summary */
  const high=campusAlerts.filter(a=>a.level==='high').length;
  const medium=campusAlerts.filter(a=>a.level==='medium').length;
  const low=campusAlerts.filter(a=>a.level==='low').length;
  const arrow = sortAsc ? '↑' : '↓';

  /* per-classroom alert counts for top-affected list */
  const crAlertMap = {};
  campusAlerts.forEach(a=>{ crAlertMap[a.classroomId]=(crAlertMap[a.classroomId]||0)+1; });
  const topCrs = Object.entries(crAlertMap).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([id,cnt])=>{
    const cr=state.classrooms.find(c=>c.id===id);
    return cr ? esc(cr.name)+' ('+cnt+')' : '';
  }).filter(Boolean).join(' · ');

  return `
  <div style="display:flex;justify-content:flex-end;align-items:center;margin-bottom:16px;gap:6px">
    <button class="btn btn-sm${sortMode==='time'?' btn-primary':' btn-ghost'}" data-alert-sort="time">按时间 ${sortMode==='time'?arrow:''}</button>
    <button class="btn btn-sm${sortMode==='severity'?' btn-primary':' btn-ghost'}" data-alert-sort="severity">按严重度 ${sortMode==='severity'?arrow:''}</button>
  </div>
  ${sorted.length ? sorted.map(a=>alertHtml(a,true)).join('') : empty('当前无活跃告警')}
  `;
}


function serverChangePage(){
  const state=s(); const server=serverFor(state,view.campusId); const campus=getCampus(state,view.campusId);
  const crIdsSet=new Set(state.classrooms.filter(c=>c.campusId===view.campusId).map(c=>c.id));
  const campusTerms=state.terminals.filter(t=>crIdsSet.has(t.classroomId));
  const offlineTerms = campusTerms.filter(t=>!t.online);
  const onlineTerms = campusTerms.filter(t=>t.online);
  const hasAddr = !!view.newServerAddr;

  /* Persisted result from last push (survives page switches) */
  const hist = view.serverChangeHistory || null;

  /* group terminals by classroom for result display */
  const crGroups=[];
  state.classrooms.filter(c=>c.campusId===view.campusId).forEach(cr=>{
    const ts=campusTerms.filter(t=>t.classroomId===cr.id);
    if(ts.length) crGroups.push({cr,terms:ts,online:ts.filter(t=>t.online).length,offline:ts.filter(t=>!t.online).length});
  });

  /* Group offline terminals by classroom */
  const offByCr={};
  offlineTerms.forEach(t=>{
    const cr2=state.classrooms.find(c=>c.id===t.classroomId);
    const key=cr2?cr2.id:'unknown';
    if(!offByCr[key]) offByCr[key]={cr:cr2,terms:[]};
    offByCr[key].terms.push(t);
  });
  const offlineGroups = Object.entries(offByCr);

  return `
  <div class="section">
    <div class="section-head"><h3>服务器地址变更</h3></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;align-items:start">

      <!-- Left: Input + Confirm -->
      <div>
        <div class="card">
          <div style="font-weight:600;font-size:.92rem;margin-bottom:12px">变更配置</div>
          ${defRow('当前地址',server?.address||'--',{mono:true})}
          ${defRow('在线终端',onlineTerms.length+' 台')}
          ${defRow('离线终端',offlineTerms.length+' 台')}

          <div class="prep-field" style="margin-top:16px"><label style="width:80px;font-weight:600;font-size:.85rem">新地址</label><input type="text" data-server-new-addr placeholder="输入新 IP 或域名" value="${esc(view.newServerAddr||'')}" style="width:100%;box-sizing:border-box"></div>

          ${offlineTerms.length?`
          <div style="margin-top:12px;padding:8px 12px;background:rgba(245,158,11,.06);border:1px solid rgba(245,158,11,.25);border-radius:6px;font-size:.82rem;color:var(--c-text2)">
            <strong style="color:var(--c-warn)">注意：</strong>${offlineTerms.length} 台终端不在线，不会收到推送
          </div>
          <div style="display:flex;flex-direction:column;gap:4px;max-height:160px;overflow-y:auto;margin-top:8px">
            ${offlineGroups.map(([crId,{cr:crObj,terms:ts2}])=>{
              const crName=crObj?crObj.name:'未知教室';
              return '<div style="padding:4px 8px;border:1px solid var(--c-border);border-radius:4px;border-left:3px solid var(--c-warn)">'+
                '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px">'+
                  '<span style="font-size:.82rem;font-weight:600;color:var(--c-text2)">'+esc(crName)+'</span>'+
                  '<span style="font-size:.72rem;color:var(--c-warn)">'+ts2.length+' 台离线</span>'+
                '</div>'+
                '<div style="display:flex;flex-wrap:wrap;gap:3px">'+
                  ts2.map(t2=>'<a class="clickable" data-nav-term="'+t2.id+'" style="font-size:.72rem;padding:1px 5px;background:var(--c-bg2);border-radius:3px;color:var(--c-brand);cursor:pointer;white-space:nowrap" title="'+esc(crName+' 座位 '+(t2.seat||''))+'">'+esc(t2.seat||'--')+'</a>').join('')+
                '</div>'+
              '</div>';
            }).join('')}
          </div>`:''}

          <div style="display:flex;gap:8px;margin-top:16px">
            <button class="btn btn-primary" data-settings-action="server-ip"${!hasAddr?' disabled':''}>确认变更并推送 (${onlineTerms.length} 台)</button>
          </div>

          <div style="margin-top:12px;font-size:.78rem;color:var(--c-text3);line-height:1.6">
            推送完成后，请物理修改服务器网络配置。<br>离线终端可由工程师到场手动修改，或通过母机教室维护批量修改。
          </div>
        </div>
      </div>

      <!-- Right: Result history -->
      <div>
        ${hist?`
        <div class="card" style="padding:0;overflow:hidden">
          <div style="padding:12px 18px;display:flex;justify-content:space-between;align-items:center;background:var(--c-bg2);border-bottom:1px solid var(--c-border)">
            <div>
              <span style="font-weight:600;font-size:.92rem">上次变更结果</span>
              <span style="font-size:.78rem;color:var(--c-text3);margin-left:8px">${hist.at?fmtTime(hist.at):''}</span>
            </div>
            <button class="btn btn-ghost btn-sm" style="font-size:.72rem;color:var(--c-text3)" data-clear-server-history>清除历史</button>
          </div>
          <div style="padding:12px 18px">
            <div style="padding:8px 12px;background:rgba(34,197,94,.06);border:1px solid rgba(34,197,94,.2);border-radius:6px;margin-bottom:12px;font-size:.85rem;color:var(--c-ok);font-weight:500">
              已推送 ${hist.onlineCount||0} 台在线终端${offlineTerms.length?' · '+offlineTerms.length+' 台待手动处理':''}
            </div>
            <div style="display:flex;flex-direction:column;gap:8px;max-height:480px;overflow-y:auto" class="plat-inner-scroll">
              ${crGroups.map(({cr,terms:ts,online:onCnt,offline:offCnt})=>`
              <div style="border:1px solid var(--c-border);border-radius:6px;overflow:hidden${offCnt?';border-left:3px solid var(--c-warn)':''}">
                <div style="padding:8px 14px;display:flex;justify-content:space-between;align-items:center;background:var(--c-bg2)">
                  <span style="font-weight:600;font-size:.85rem">${esc(cr.name)}</span>
                  <div style="font-size:.78rem">
                    <span style="color:var(--c-ok)">${onCnt} 已推送</span>
                    ${offCnt?`<span style="color:var(--c-warn);margin-left:6px">${offCnt} 待处理</span>`:''}
                  </div>
                </div>
                <div style="padding:6px 14px">
                  <div style="display:flex;flex-wrap:wrap;gap:4px">
                    ${ts.map(t=>`<a class="clickable" data-nav-term="${t.id}" style="font-size:.75rem;padding:2px 8px;background:${t.online?'rgba(34,197,94,.06)':'rgba(245,158,11,.06)'};border:1px solid ${t.online?'rgba(34,197,94,.2)':'rgba(245,158,11,.2)'};border-radius:3px;color:var(--c-brand);cursor:pointer;white-space:nowrap" title="${esc(cr.name+' 座位 '+(t.seat||''))}">${esc(t.seat||'--')}</a>`).join('')}
                  </div>
                </div>
              </div>`).join('')}
            </div>
          </div>
        </div>`:`
        <div class="card" style="text-align:center;padding:40px 20px;color:var(--c-text3)">
          <div style="font-size:.92rem;margin-bottom:6px">暂无变更记录</div>
          <div style="font-size:.78rem">确认变更推送后，结果将显示在此处</div>
        </div>`}
      </div>

    </div>
  </div>
  `;
}


/* ── Platform modal helpers ── */
function showPlatConfirm(title, msg, onOk, opts={}){
  const btnClass = opts.danger===false ? 'btn btn-primary' : 'btn btn-danger';
  const ov=document.createElement('div'); ov.className='plat-modal-overlay';
  ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:9999';
  ov.innerHTML=`<div style="background:var(--c-bg);border:1px solid var(--c-border);border-radius:8px;padding:24px 28px;max-width:520px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,.15)">
    <div style="font-weight:700;font-size:1.05rem;margin-bottom:12px">${title}</div>
    <div style="font-size:.88rem;line-height:1.5;margin-bottom:20px;color:var(--c-text2)">${msg}</div>
    <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn btn-ghost" data-pm="cancel">取消</button><button class="${btnClass}" data-pm="ok">确认</button></div>
  </div>`;
  document.body.appendChild(ov);
  ov.querySelector('[data-pm="cancel"]').addEventListener('click',()=>ov.remove());
  ov.querySelector('[data-pm="ok"]').addEventListener('click',()=>{ov.remove();onOk();});
  ov.addEventListener('click',(e)=>{if(e.target===ov)ov.remove();});
}
function showPlatAlert(msg){
  const ov=document.createElement('div'); ov.className='plat-modal-overlay';
  ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:9999';
  ov.innerHTML=`<div style="background:var(--c-bg);border:1px solid var(--c-border);border-radius:8px;padding:24px 28px;max-width:420px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,.15)">
    <div style="font-size:.88rem;line-height:1.5;margin-bottom:16px">${esc(msg)}</div>
    <div style="display:flex;justify-content:flex-end"><button class="btn btn-primary" data-pm="ok">确定</button></div>
  </div>`;
  document.body.appendChild(ov);
  ov.querySelector('[data-pm="ok"]').addEventListener('click',()=>ov.remove());
  ov.addEventListener('click',(e)=>{if(e.target===ov)ov.remove();});
}

function showPlatImportDesktopDialog(){
  /* Step 1: Simulate file/folder selection (matching terminal side flow) */
  const defaultDir = 'D:\\CloudDesktop\\Import';
  const filters = '.cdpkg / .vhd / .img';
  const step1Ov=document.createElement('div'); step1Ov.className='plat-modal-overlay';
  step1Ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:9999';
  step1Ov.innerHTML=`<div style="background:var(--c-bg);border:1px solid var(--c-border);border-radius:8px;padding:24px 28px;max-width:440px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,.15)">
    <div style="font-weight:700;font-size:1.05rem;margin-bottom:12px">导入桌面</div>
    <div style="font-size:.85rem;color:var(--c-text2);margin-bottom:16px;line-height:1.6">
      将通过系统文件对话框选择桌面包文件。<br>
      默认目录：<span style="font-family:monospace;font-size:.82rem;color:var(--c-brand)">${esc(defaultDir)}</span><br>
      支持格式：<span style="font-size:.82rem;color:var(--c-text2)">${esc(filters)}</span>
    </div>
    <div style="display:flex;gap:8px;justify-content:flex-end">
      <button class="btn btn-ghost" data-pm="cancel">取消</button>
      <button class="btn btn-primary" data-pm="select">选择文件</button>
    </div>
  </div>`;
  document.body.appendChild(step1Ov);
  step1Ov.querySelector('[data-pm="cancel"]').addEventListener('click',()=>step1Ov.remove());
  step1Ov.addEventListener('click',(e)=>{if(e.target===step1Ov)step1Ov.remove();});
  step1Ov.querySelector('[data-pm="select"]').addEventListener('click',()=>{
    step1Ov.remove();
    showPlatImportConfigDialog();
  });
}

function showPlatImportConfigDialog(){
  const ov=document.createElement('div'); ov.className='plat-modal-overlay';
  ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:9999';
  ov.innerHTML=`<div style="background:var(--c-bg);border:1px solid var(--c-border);border-radius:8px;padding:24px 28px;max-width:520px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,.15)">
    <div style="font-weight:700;font-size:1.05rem;margin-bottom:4px">导入桌面</div>
    <div style="font-size:.82rem;color:var(--c-text3);margin-bottom:16px">导入后桌面为无人引用状态，需通过部署分发到教室终端</div>
    <div style="display:flex;flex-direction:column;gap:12px">
      <div><label style="font-size:.82rem;font-weight:600;display:block;margin-bottom:4px">桌面名称</label><input type="text" id="pi-name" value="导入的桌面" placeholder="桌面名称" style="width:100%;padding:6px 10px;border:1px solid var(--c-border);border-radius:4px;font-size:.88rem;box-sizing:border-box"></div>
      <div><label style="font-size:.82rem;font-weight:600;display:block;margin-bottom:4px">部署方式</label><select id="pi-physical" style="width:100%;padding:6px 10px;border:1px solid var(--c-border);border-radius:4px;font-size:.88rem">
        <option value="false">虚拟部署 (VHD)</option><option value="true">物理部署 (独立分区)</option></select></div>
      <div><label style="font-size:.82rem;font-weight:600;display:block;margin-bottom:4px">数据盘</label><select id="pi-disk-sel" style="width:100%;padding:6px 10px;border:1px solid var(--c-border);border-radius:4px;font-size:.88rem">
        <option value="">不添加数据盘</option><option value="yes" selected>添加数据盘</option></select></div>
      <div id="pi-disk-detail">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <div><label style="font-size:.82rem;font-weight:600;display:block;margin-bottom:4px">数据盘大小 (GB)</label><div style="display:flex;align-items:center;gap:6px"><input type="number" id="pi-disk-size" value="50" min="1" max="2000" style="width:90px;padding:6px 10px;border:1px solid var(--c-border);border-radius:4px;font-size:.88rem"><span style="font-size:.82rem;color:var(--c-text2)">GB</span></div></div>
          <div><label style="font-size:.82rem;font-weight:600;display:block;margin-bottom:4px">挂载盘符或路径</label><input type="text" id="pi-disk-drive" value="D" placeholder="D 或 /data" style="width:100%;padding:6px 10px;border:1px solid var(--c-border);border-radius:4px;font-size:.88rem;box-sizing:border-box"></div>
        </div>
        <div id="pi-disk-preview" style="margin-top:6px;padding:8px 10px;background:var(--c-bg2);border:1px solid var(--c-border);border-radius:4px;font-size:.78rem;font-family:monospace;line-height:1.6"></div>
      </div>
      <div><label style="font-size:.82rem;font-weight:600;display:block;margin-bottom:4px">备注</label><input type="text" id="pi-remark" value="" placeholder="可选" style="width:100%;padding:6px 10px;border:1px solid var(--c-border);border-radius:4px;font-size:.88rem;box-sizing:border-box"></div>
    </div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:20px">
      <button class="btn btn-ghost" data-pm="cancel">取消</button>
      <button class="btn btn-primary" data-pm="create">导入桌面</button>
    </div>
  </div>`;
  document.body.appendChild(ov);
  const diskSel=ov.querySelector('#pi-disk-sel');
  const detailRow=ov.querySelector('#pi-disk-detail');
  const driveInput=ov.querySelector('#pi-disk-drive');
  const sizeInput=ov.querySelector('#pi-disk-size');
  const previewEl=ov.querySelector('#pi-disk-preview');
  function updatePreview(){
    const raw=(driveInput?.value||'').trim();
    const szNum=parseInt(sizeInput?.value||'50',10)||50;
    const sz=szNum+'GB';
    if(!raw){ previewEl.innerHTML='<span style="color:var(--c-text3)">请输入盘符或路径后预览</span>'; return; }
    const cleanRaw=raw.replace(/[:：\\]+$/,'');
    const isWinDrive=/^[A-Za-z]$/.test(cleanRaw);
    const isUnixPath=raw.startsWith('/');
    let lines=[];
    if(isWinDrive){
      const letter=cleanRaw.toUpperCase();
      lines.push('<span style="color:var(--c-brand)">Windows</span>  '+letter+':\\ ('+sz+' NTFS)');
      lines.push('<span style="color:var(--c-text3)">Unix</span>     /mnt/'+letter.toLowerCase()+' ('+sz+' ext4)');
    } else if(isUnixPath){
      const pathNorm=raw.replace(/\/+$/,'');
      lines.push('<span style="color:var(--c-text3)">Windows</span>  D:\\ ('+sz+' NTFS)');
      lines.push('<span style="color:var(--c-brand)">Unix</span>     '+pathNorm+' ('+sz+' ext4)');
    } else {
      lines.push('<span style="color:var(--c-warn)">提示：请输入盘符 (如 D) 或路径 (如 /data)</span>');
    }
    previewEl.innerHTML=lines.join('<br>');
  }
  function toggleDetail(){ detailRow.style.display=diskSel.value?'':'none'; if(diskSel.value) updatePreview(); }
  toggleDetail();
  diskSel.addEventListener('change',toggleDetail);
  driveInput.addEventListener('input',updatePreview);
  sizeInput.addEventListener('input',updatePreview);
  ov.querySelector('[data-pm="cancel"]').addEventListener('click',()=>ov.remove());
  ov.addEventListener('click',(e)=>{if(e.target===ov)ov.remove();});
  ov.querySelector('[data-pm="create"]').addEventListener('click',async()=>{
    const name=ov.querySelector('#pi-name')?.value||'导入的桌面';
    const hasDisk=diskSel.value==='yes';
    const rawSz=parseInt(sizeInput?.value||'50',10)||50;
    const diskSize=hasDisk?rawSz+'GB':'';
    const rawDrv=(driveInput?.value||'').trim().replace(/[:\uff1a\\]+$/,'');
    const diskDrive=hasDisk?(/^[A-Za-z]$/.test(rawDrv)?rawDrv.toUpperCase()+':':rawDrv||''):'';
    const physical=ov.querySelector('#pi-physical')?.value==='true';
    const remark=ov.querySelector('#pi-remark')?.value||'';
    /* Validation */
    if(!name.trim()){ showPlatAlert('请输入桌面名称'); return; }
    if(hasDisk && !diskDrive){ showPlatAlert('已选择添加数据盘，请输入挂载盘符或路径'); return; }
    if(hasDisk && rawSz<1){ showPlatAlert('数据盘大小不能小于 1 GB'); return; }
    ov.remove();
    try{
      await client.send('plat-import-desktop',{name, os:'Windows 11 23H2', importType:'image',
        dataDiskSize:diskSize, dataDiskDrive:diskDrive, physicalDeploy:physical,
        restoreMode:'还原系统盘，保留数据盘', remark});
      view.deleteAssetResult={done:true,message:'已导入桌面「'+name+'」，当前无教室引用'};
    }catch(e){ console.error(e); }
    render(s());
  });
}

function showPlatExportDesktopDialog(){
  const state=s();
  const crsWithDesktops=state.classrooms.filter(c=>c.campusId===view.campusId&&(c.desktopCatalog||[]).length>0);
  const deskMap=new Map();
  crsWithDesktops.forEach(c=>{
    (c.desktopCatalog||[]).forEach(d=>{
      const key=d.name;
      if(!deskMap.has(key)) deskMap.set(key,{name:d.name, os:d.os||'', diskSize:d.diskSize||25, id:d.id, classrooms:[]});
      const entry=deskMap.get(key);
      if(!entry.classrooms.find(cr=>cr.id===c.id)) entry.classrooms.push({id:c.id, name:c.name});
    });
  });
  const allDesktops=[...deskMap.values()];
  if(!allDesktops.length){ showPlatAlert('当前校区无可导出桌面'); return; }

  let exportDir='D:\\CloudDesktop\\Export';
  const selected=new Set(allDesktops.map(d=>d.name));
  const ov=document.createElement('div'); ov.className='plat-modal-overlay';
  ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:9999';

  function pathSep(raw){ return /^[A-Za-z]:/.test(raw)||raw.includes('\\')?'\\':'/'; }

  function renderDialog(){
    const selDts=allDesktops.filter(d=>selected.has(d.name));
    const total=selDts.reduce((t,d)=>t+(d.diskSize||25),0);
    const dateStr=new Date().toISOString().slice(0,10);
    const sep=pathSep(exportDir);
    const dirDisplay=sep==='\\'?exportDir.replace(/\//g,'\\'):exportDir;
    ov.innerHTML=`<div style="background:var(--c-bg);border:1px solid var(--c-border);border-radius:8px;padding:24px 28px;max-width:580px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,.15);max-height:80vh;display:flex;flex-direction:column">
      <div style="font-weight:700;font-size:1.05rem;margin-bottom:12px">导出桌面</div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <span style="font-size:.78rem;color:var(--c-text2);cursor:pointer;text-decoration:underline" id="pe-toggle">全选 / 取消</span>
        <span id="pe-count" style="font-size:.78rem;color:var(--c-text3)">${selDts.length} / ${allDesktops.length}</span>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px;flex:1;overflow-y:auto;margin-bottom:10px;min-height:0;max-height:200px">
        ${allDesktops.map(d=>{const sel=selected.has(d.name);
          const crLabel=d.classrooms.length<=2?d.classrooms.map(c2=>esc(c2.name)).join('、'):(esc(d.classrooms[0].name)+' 等共 '+d.classrooms.length+' 教室引用');
          return `<div class="pe-card" data-pe-name="${esc(d.name)}" style="display:flex;align-items:center;gap:10px;padding:8px 12px;border:2px solid ${sel?'var(--c-brand)':'var(--c-border)'};border-radius:6px;background:${sel?'rgba(59,130,246,.06)':'transparent'};cursor:pointer;transition:all .15s">
          <div style="width:20px;height:20px;border-radius:4px;background:${sel?'var(--c-brand)':'var(--c-border)'};display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all .15s" class="pe-check">${sel?'<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>':''}</div>
          <div style="flex:1;min-width:0">
            <div style="font-size:.85rem;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(d.name)}</div>
            <div style="font-size:.72rem;color:var(--c-text3)">${esc(d.os)} · ${d.diskSize} GB · ${crLabel}</div>
          </div>
        </div>`;}).join('')}
      </div>
      <div style="border-top:1px solid var(--c-border);padding-top:10px;margin-bottom:10px">
        <label style="font-size:.82rem;font-weight:600;display:block;margin-bottom:4px">导出文件夹</label>
        <div style="display:flex;gap:6px;align-items:center">
          <input type="text" id="pe-dir" value="${esc(exportDir)}" style="flex:1;padding:6px 10px;border:1px solid var(--c-border);border-radius:4px;font-size:.85rem;font-family:monospace;box-sizing:border-box">
          <button class="btn btn-ghost btn-sm" id="pe-browse" style="white-space:nowrap">浏览…</button>
        </div>
      </div>
      ${selDts.length?`<div style="margin-bottom:10px">
        <div style="font-size:.82rem;font-weight:600;margin-bottom:4px">导出文件预览</div>
        <div id="pe-path" style="padding:8px 12px;background:var(--c-bg2);border:1px solid var(--c-border);border-radius:4px;font-size:.78rem;font-family:monospace;color:var(--c-brand);word-break:break-all;max-height:90px;overflow-y:auto;line-height:1.6">
          ${selDts.map(d=>esc(dirDisplay)+sep+esc(d.name.replace(/[\\/:*?"<>|]/g,'-'))+'-'+dateStr+'.cdpkg').join('<br>')}
        </div>
      </div>`:''}
      <div style="border-top:1px solid var(--c-border);padding-top:8px;font-size:.82rem;display:flex;justify-content:space-between;margin-bottom:8px"><strong>合计</strong><span>${selDts.length} 个桌面 · ${total} GB</span></div>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="btn btn-ghost" data-pm="cancel">取消</button>
        <button class="btn btn-primary" data-pm="export"${!selDts.length?' disabled':''}>导出</button>
      </div>
    </div>`;
    bindExportEvents();
  }

  function bindExportEvents(){
    ov.querySelectorAll('.pe-card').forEach(card=>{
      card.addEventListener('click',()=>{
        const name=card.dataset.peName;
        if(selected.has(name)) selected.delete(name); else selected.add(name);
        renderDialog();
      });
    });
    const toggle=ov.querySelector('#pe-toggle');
    if(toggle) toggle.addEventListener('click',()=>{
      if(selected.size===allDesktops.length) selected.clear(); else allDesktops.forEach(d=>selected.add(d.name));
      renderDialog();
    });
    const dirInput=ov.querySelector('#pe-dir');
    if(dirInput) dirInput.addEventListener('input',()=>{ exportDir=dirInput.value; renderDialog(); });
    const browseBtn=ov.querySelector('#pe-browse');
    if(browseBtn) browseBtn.addEventListener('click',()=>{
      showPlatAlert('模拟浏览：已选择 '+exportDir);
    });
    const exportBtn=ov.querySelector('[data-pm="export"]');
    if(exportBtn) exportBtn.addEventListener('click',()=>{
      const selDts=allDesktops.filter(d=>selected.has(d.name));
      if(!selDts.length){ showPlatAlert('请至少选择一个桌面'); return; }
      const total=selDts.reduce((t,d)=>t+(d.diskSize||25),0);
      const names=selDts.map(d=>d.name).join('、');
      ov.remove();
      showPlatAlert('已导出 '+selDts.length+' 个桌面 (共 '+total+' GB) 到 '+exportDir+'\n'+names);
      view.deleteAssetResult={done:true,message:'已导出 '+selDts.length+' 个桌面 (共 '+total+' GB)：'+names};
      render(s());
    });
    const cancelBtn=ov.querySelector('[data-pm="cancel"]');
    if(cancelBtn) cancelBtn.addEventListener('click',()=>ov.remove());
    ov.addEventListener('click',(e)=>{if(e.target===ov)ov.remove();});
  }

  document.body.appendChild(ov);
  renderDialog();
}


function bindEvents(){
  root.querySelectorAll('[data-nav]').forEach(el=>{
    el.addEventListener('click',()=>nav(el.dataset.nav,{classroomId:null,terminalId:null,tab:'overview',platAction:null,platActionResult:null,settingsResult:{}}));
  });
  root.querySelectorAll('[data-campus]').forEach(el=>{
    el.addEventListener('click',()=>{
      view.campusId=el.dataset.campus;
      view.page='dashboard'; view.classroomId=null; view.terminalId=null; view.tab='overview';
      view.platAction=null; view.platActionResult=null; view.settingsResult={};
      render(s());
    });
  });
  root.querySelectorAll('[data-nav-cr]').forEach(el=>{
    el.addEventListener('click',()=>nav('classrooms',{classroomId:el.dataset.navCr,terminalId:null,tab:'terminals',platAction:null,platActionResult:null,platSelectedTerms:[]}));
  });
  root.querySelectorAll('[data-nav-term]').forEach(el=>{
    const tId=el.dataset.navTerm;
    const t=getTerm(s(),tId);
    el.addEventListener('click',()=>nav('classrooms',{terminalId:tId, classroomId:t?.classroomId||view.classroomId}));
  });
  root.querySelectorAll('[data-back-cr]').forEach(el=>{
    el.addEventListener('click',()=>nav('classrooms',{classroomId:el.dataset.backCr,terminalId:null,tab:'terminals'}));
  });
  root.querySelectorAll('[data-tab]').forEach(el=>{
    el.addEventListener('click',()=>{view.tab=el.dataset.tab;view.platAction=null;view.platActionResult=null;view.platSelectedTerms=[];render(s());});
  });
  root.querySelectorAll('[data-zoom]').forEach(el=>{
    el.addEventListener('click',()=>{
      const delta=Number(el.dataset.zoom);
      view.layoutZoom=Math.max(50,Math.min(200,(view.layoutZoom||100)+delta));
      render(s());
    });
  });
  root.querySelectorAll('[data-term-view]').forEach(el=>{
    el.addEventListener('click',()=>{
      view.termListMode=el.dataset.termView;
      render(s());
    });
  });

  /* ── Alert sort ── */
  root.querySelectorAll('[data-alert-sort]').forEach(el=>{
    el.addEventListener('click',()=>{
      const mode=el.dataset.alertSort;
      if(view.alertSort===mode) view.alertSortAsc=!view.alertSortAsc;
      else { view.alertSort=mode; view.alertSortAsc=false; }
      render(s());
    });
  });

  /* ── Platform action toolbar ── */
  root.querySelectorAll('[data-plat-action]').forEach(el=>{
    el.addEventListener('click',()=>{
      const act=el.dataset.platAction;
      view.platAction = view.platAction===act ? null : act;
      view.platActionResult=null; view.distDtIds=[]; view.distMode=null; view.broadcastCrs=[];
      /* preserve platSelectedTerms — don't clear selection */
      render(s());
    });
  });
  root.querySelectorAll('[data-plat-cancel]').forEach(el=>{
    el.addEventListener('click',()=>{view.platAction=null;view.platActionResult=null;render(s());});
  });
  root.querySelectorAll('[data-plat-confirm]').forEach(el=>{
    el.addEventListener('click',async()=>{
      const act=el.dataset.platConfirm;
      const crId=view.classroomId;
      const selIds=view.platSelectedTerms||[];
      const state2=s();
      const allTerms=termsInCr(state2,crId);
      const mkResults=(ids)=>ids.map(id=>{const t=allTerms.find(tt=>tt.id===id);return{seat:t?.seat||'--',name:t?.name||'--',ip:t?.ip||'--',ok:Math.random()>0.05};});
      try{
        if(act==='shutdown'){
          const r=await client.send('plat-shutdown',{classroomId:crId,terminalIds:selIds});
          view.platActionResult={done:true,count:r.count,results:mkResults(selIds)};
        } else if(act==='restart'){
          const r=await client.send('plat-restart',{classroomId:crId,terminalIds:selIds});
          view.platActionResult={done:true,count:r.count,results:mkResults(selIds)};
        } else if(act==='distribute'){
          const dtIds=view.distDtIds||[];
          const targetIds=selIds;
          /* Start progress simulation */
          const progress = targetIds.map(id=>({id,state:'queued',pct:0}));
          view.platActionResult={running:true,progress,dtCount:dtIds.length};
          render(s());
          let tickIdx=0;
          const tickInterval=setInterval(()=>{
            const queued=progress.filter(p=>p.state==='queued');
            const running=progress.filter(p=>p.state==='running');
            running.forEach(p=>{
              p.pct=Math.min(100,p.pct+20+Math.random()*15);
              if(p.pct>=100){ p.state=Math.random()>0.92?'failed':'completed'; p.pct=100; }
            });
            queued.slice(0,3).forEach(p=>{p.state='running';p.pct=5+Math.random()*15;});
            tickIdx++;
            const allDone=progress.every(p=>p.state==='completed'||p.state==='failed');
            if(allDone||tickIdx>50){
              clearInterval(tickInterval);
              const completed=progress.filter(p=>p.state==='completed').length;
              const failed=progress.filter(p=>p.state==='failed').length;
              client.send('plat-distribute',{classroomId:crId,desktopIds:dtIds,targetTerminalIds:targetIds}).catch(()=>{});
              view.platActionResult={done:true,count:completed,failed,dtCount:dtIds.length,progress};
            }
            render(s());
          },800);
        } else if(act==='ip-mod'){
          const ipBase=root.querySelector('[data-ip-base]')?.value||'';
          const ipStart=Number(root.querySelector('[data-ip-start]')?.value||20);
          const ipMask=root.querySelector('[data-ip-mask]')?.value||'255.255.255.0';
          const ipGw=root.querySelector('[data-ip-gw]')?.value||'';
          const ipDns=root.querySelector('[data-ip-dns]')?.value||'';
          const r=await client.send('plat-ip-mod',{classroomId:crId,newIpBase:ipBase,startOctet:ipStart,subnetMask:ipMask,gateway:ipGw,dns:ipDns,terminalIds:selIds});
          const ipResults=selIds.map((id,i)=>{const t=allTerms.find(tt=>tt.id===id);return{seat:t?.seat||'--',name:t?.name||'--',oldIp:t?.ip||'--',newIp:ipBase+'.'+(ipStart+i),ok:Math.random()>0.05};});
          view.platActionResult={done:true,count:r.count,failed:ipResults.filter(r2=>!r2.ok).length,results:ipResults};
        } else if(act==='remote-test'){
          const r=await client.send('plat-remote-test',{classroomId:crId,terminalIds:selIds});
          view.platActionResult={results:r.results};
        } else if(act==='broadcast-test'){
          const r=await client.send('plat-broadcast-test',{classroomId:crId,classroomIds:view.broadcastCrs||[]});
          view.platActionResult={results:r.results,hasInterference:r.hasInterference};
        } else if(act==='block-internet'){
          view.platActionResult={done:true,count:selIds.length,results:mkResults(selIds)};
        } else if(act==='block-usb'){
          view.platActionResult={done:true,count:selIds.length,results:mkResults(selIds)};
        } else if(act==='hw-test'){
          const hwChecked=view.hwTestChecked||{};
          const testedKeys=Object.keys(hwChecked).filter(k=>hwChecked[k]);
          const testedItems=[
            {k:'hw-consistency',l:'硬件一致性'},{k:'smart',l:'SMART'},{k:'disk-io',l:'硬盘读写速度'},
            {k:'memory',l:'内存'},{k:'multi-monitor',l:'显示器'},{k:'peripheral',l:'键鼠'}
          ].filter(it=>testedKeys.includes(it.k));
          const hwResults=selIds.map(id=>{const t=allTerms.find(tt=>tt.id===id);const allOk=Math.random()>0.15;
            const r2={seat:t?.seat||'--',name:t?.name||'--',ok:allOk};
            testedItems.forEach(it=>{r2[it.k]=allOk||Math.random()>0.2;if(!r2[it.k])r2.ok=false;});
            return r2;});
          const hwFailed=hwResults.filter(r2=>!r2.ok).length;
          view.platActionResult={done:true,count:selIds.length,failed:hwFailed,results:hwResults,_testedItems:testedItems};
        } else if(act==='export-test-report'){
          /* simulated export */
        } else if(act==='import-list'){
          const crs=state.classrooms.filter(c=>c.campusId===view.campusId);
          const importName=view.importCrName||'';
          const matchedCr=importName?crs.find(c=>c.name===importName):null;
          const tgtCrId = matchedCr ? matchedCr.id : null;
          const r=await client.send('plat-import-terminal-list',{classroomId:tgtCrId,campusId:view.campusId,crName:view.importCrName,crBuilding:view.importCrBuilding,crRemark:view.importCrRemark});
          view.importResult={done:true,count:r.count||0};
        }
      }catch(e){console.error(e);}
      render(s());
    });
  });

  /* ── Distribute desktop selectors ── */
  root.querySelectorAll('[data-dist-dt-chk]').forEach(el=>{
    el.addEventListener('change',()=>{
      if(!view.distDtIds) view.distDtIds=[];
      const id=el.value;
      if(el.checked){ if(!view.distDtIds.includes(id)) view.distDtIds.push(id); }
      else{ view.distDtIds=view.distDtIds.filter(x=>x!==id); }
      render(s());
    });
  });
  /* ── Distribute deploy mode radio ── */
  root.querySelectorAll('[data-dist-mode]').forEach(el=>{
    el.addEventListener('change',()=>{
      view.distMode=el.dataset.distMode;
      render(s());
    });
  });

  /* ── Hardware test checkboxes (persist in view state) ── */
  root.querySelectorAll('[data-hw-chk]').forEach(el=>{
    el.addEventListener('change',()=>{
      if(!view.hwTestChecked) view.hwTestChecked={};
      view.hwTestChecked[el.dataset.hwChk]=el.checked;
      /* Don't re-render — just update view state for the confirm handler */
    });
  });

  /* ── Broadcast test checkboxes ── */
  root.querySelectorAll('[data-bcast-cr]').forEach(el=>{
    el.addEventListener('change',()=>{
      if(!view.broadcastCrs) view.broadcastCrs=[];
      const crId=el.dataset.bcastCr;
      if(el.checked){ if(!view.broadcastCrs.includes(crId)) view.broadcastCrs.push(crId); }
      else{ view.broadcastCrs=view.broadcastCrs.filter(id=>id!==crId); }
      render(s());
    });
  });

  /* ── IP parameter inputs: update view on input (no re-render), render on blur/change only
     to avoid focus/scroll disruption while typing ── */
  const ipBaseEl=root.querySelector('[data-ip-base]');
  if(ipBaseEl){ ipBaseEl.addEventListener('input',()=>{view.newIpBase=ipBaseEl.value;}); ipBaseEl.addEventListener('blur',()=>{if(!_isRendering) render(s());}); ipBaseEl.addEventListener('change',()=>{render(s());}); }
  const ipStartEl=root.querySelector('[data-ip-start]');
  if(ipStartEl){ ipStartEl.addEventListener('input',()=>{view.newIpStart=Number(ipStartEl.value);}); ipStartEl.addEventListener('blur',()=>{if(!_isRendering) render(s());}); ipStartEl.addEventListener('change',()=>{render(s());}); }
  const ipGwEl=root.querySelector('[data-ip-gw]');
  if(ipGwEl){ ipGwEl.addEventListener('input',()=>{view.newIpGw=ipGwEl.value;}); }
  const ipMaskEl=root.querySelector('[data-ip-mask]');
  if(ipMaskEl){ ipMaskEl.addEventListener('input',()=>{view.newIpMask=ipMaskEl.value;}); ipMaskEl.addEventListener('blur',()=>{if(!_isRendering) render(s());}); ipMaskEl.addEventListener('change',()=>{render(s());}); }
  const ipDnsEl=root.querySelector('[data-ip-dns]');
  if(ipDnsEl){ ipDnsEl.addEventListener('input',()=>{view.newIpDns=ipDnsEl.value;}); }

  /* ── Terminal selection (grid click + table checkbox) ── */
  root.querySelectorAll('[data-term-sel]').forEach(el=>{
    el.addEventListener('click',(e)=>{
      e.stopPropagation();
      if(!view.platSelectedTerms) view.platSelectedTerms=[];
      const id=el.dataset.termSel;
      const idx=view.platSelectedTerms.indexOf(id);
      if(idx>=0) view.platSelectedTerms.splice(idx,1); else view.platSelectedTerms.push(id);
      render(s());
    });
  });
  root.querySelectorAll('[data-term-chk]').forEach(el=>{
    el.addEventListener('change',()=>{
      if(!view.platSelectedTerms) view.platSelectedTerms=[];
      const id=el.dataset.termChk;
      if(el.checked){ if(!view.platSelectedTerms.includes(id)) view.platSelectedTerms.push(id); }
      else{ view.platSelectedTerms=view.platSelectedTerms.filter(x=>x!==id); }
      render(s());
    });
  });
  const selToggleAll=root.querySelector('[data-sel-toggle-all]');
  if(selToggleAll){
    selToggleAll.addEventListener('change',()=>{
      const c=getClassroom(s(),view.classroomId);
      const terms=termsInCr(s(),c?.id);
      view.platSelectedTerms=selToggleAll.checked?terms.map(t=>t.id):[];
      render(s());
    });
  }
  root.querySelectorAll('[data-sel-all-online]').forEach(el=>{
    el.addEventListener('click',()=>{
      const c=getClassroom(s(),view.classroomId);
      const terms=termsInCr(s(),c?.id).filter(t=>t.online);
      view.platSelectedTerms=terms.map(t=>t.id);
      render(s());
    });
  });
  root.querySelectorAll('[data-sel-clear]').forEach(el=>{
    el.addEventListener('click',()=>{
      view.platSelectedTerms=[];
      render(s());
    });
  });

  /* ── Terminal group selection ── */
  root.querySelectorAll('[data-sel-use-toggle]').forEach(el=>{
    el.addEventListener('click',(e)=>{
      e.stopPropagation();
      view.showUseDropdown=!view.showUseDropdown;
      render(s());
    });
  });
  root.querySelectorAll('[data-sel-use]').forEach(el=>{
    el.addEventListener('click',()=>{
      const use=el.dataset.selUse;
      const c=getClassroom(s(),view.classroomId);
      const terms=termsInCr(s(),c?.id).filter(t=>t.online&&t.use===use);
      view.platSelectedTerms=terms.map(t=>t.id);
      view.showUseDropdown=false;
      render(s());
    });
  });

  /* ── Asset sort ── */
  root.querySelectorAll('[data-asset-sort]').forEach(el=>{
    el.addEventListener('click',()=>{
      const key=el.dataset.assetSort;
      if(view.assetSort===key) view.assetSortAsc=!view.assetSortAsc;
      else { view.assetSort=key; view.assetSortAsc=true; }
      render(s());
    });
  });

  /* ── Asset actions (import/export/delete) ── */
  root.querySelectorAll('[data-asset-action]').forEach(el=>{
    el.addEventListener('click',()=>{
      const act=el.dataset.assetAction;
      if(act==='import'){ view.assetFlowMode='import'; view.importDesktopFileReady=false; view.importDesktopResult=null; view.importDesktopDisk=null; }
      if(act==='export'){ view.assetFlowMode='export'; view.exportSelectedDesktops=null; view.exportDesktopResult=null; view.exportDir='D:\\CloudDesktop\\Export'; }
      render(s());
    });
  });
  root.querySelectorAll('[data-asset-flow-back]').forEach(el=>{
    el.addEventListener('click',()=>{view.assetFlowMode=null; render(s());});
  });
  /* Import flow events */
  root.querySelectorAll('[data-import-desktop-file-area]').forEach(el=>{
    el.addEventListener('click',()=>{view.importDesktopFileReady=true; view.importDesktopDisk='yes'; render(s());});
  });
  root.querySelectorAll('[data-pif-name]').forEach(el=>{el.addEventListener('input',()=>{view.importDesktopName=el.value;});});
  root.querySelectorAll('[data-pif-physical]').forEach(el=>{el.addEventListener('change',()=>{view.importDesktopPhysical=el.value; render(s());});});
  root.querySelectorAll('[data-pif-disk]').forEach(el=>{el.addEventListener('change',()=>{view.importDesktopDisk=el.value; render(s());});});
  root.querySelectorAll('[data-pif-disk-size]').forEach(el=>{el.addEventListener('input',()=>{view.importDesktopDiskSize=el.value;});});
  root.querySelectorAll('[data-pif-disk-drive]').forEach(el=>{el.addEventListener('input',()=>{view.importDesktopDiskDrive=el.value;});});
  root.querySelectorAll('[data-pif-remark]').forEach(el=>{el.addEventListener('input',()=>{view.importDesktopRemark=el.value;});});
  root.querySelectorAll('[data-pif-confirm]').forEach(el=>{
    el.addEventListener('click',async()=>{
      const name=view.importDesktopName||'导入的桌面';
      const physical=view.importDesktopPhysical==='true';
      const hasDisk=view.importDesktopDisk==='yes';
      const diskSize=hasDisk?(view.importDesktopDiskSize||50)+'GB':'';
      const rawDrv=(view.importDesktopDiskDrive||'').trim().replace(/[:：\\]+$/,'');
      const diskDrive=hasDisk?(/^[A-Za-z]$/.test(rawDrv)?rawDrv.toUpperCase()+':':rawDrv||''):'';
      const remark=view.importDesktopRemark||'';
      try{
        await client.send('plat-import-desktop',{name, os:'Windows 11 23H2', importType:'image',
          dataDiskSize:diskSize, dataDiskDrive:diskDrive, physicalDeploy:physical,
          restoreMode:'还原系统盘，保留数据盘', remark});
        view.importDesktopResult={done:true,message:'已导入桌面「'+name+'」，当前无教室引用'};
      }catch(e){ console.error(e); }
      render(s());
    });
  });
  /* Export flow events */
  root.querySelectorAll('[data-pef-toggle]').forEach(el=>{
    el.addEventListener('click',()=>{
      const state2=s();const crIds2=state2.classrooms.filter(c=>c.campusId===view.campusId).map(c=>c.id);
      const crs2=state2.classrooms.filter(c=>crIds2.includes(c.id)&&(c.desktopCatalog||[]).length>0);
      const names=new Set();crs2.forEach(c=>(c.desktopCatalog||[]).forEach(d=>names.add(d.name)));
      if(!view.exportSelectedDesktops) view.exportSelectedDesktops=new Set(names);
      if(view.exportSelectedDesktops.size===names.size) view.exportSelectedDesktops=new Set();
      else view.exportSelectedDesktops=new Set(names);
      render(s());
    });
  });
  root.querySelectorAll('[data-pef-dt]').forEach(el=>{
    el.addEventListener('click',()=>{
      const name=el.dataset.pefDt;
      if(!view.exportSelectedDesktops){
        const state2=s();const crIds2=state2.classrooms.filter(c=>c.campusId===view.campusId).map(c=>c.id);
        const crs2=state2.classrooms.filter(c=>crIds2.includes(c.id)&&(c.desktopCatalog||[]).length>0);
        const names=new Set();crs2.forEach(c=>(c.desktopCatalog||[]).forEach(d=>names.add(d.name)));
        view.exportSelectedDesktops=new Set(names);
      }
      if(view.exportSelectedDesktops.has(name)) view.exportSelectedDesktops.delete(name); else view.exportSelectedDesktops.add(name);
      render(s());
    });
  });
  root.querySelectorAll('[data-pef-dir]').forEach(el=>{el.addEventListener('input',()=>{view.exportDir=el.value; render(s());});});
  root.querySelectorAll('[data-pef-browse]').forEach(el=>{el.addEventListener('click',()=>{showPlatAlert('模拟浏览：已选择 '+(view.exportDir||'D:\\CloudDesktop\\Export'));});});
  root.querySelectorAll('[data-pef-confirm]').forEach(el=>{
    el.addEventListener('click',()=>{
      const sel=view.exportSelectedDesktops;
      if(!sel||!sel.size) return;
      const dir=view.exportDir||'D:\\CloudDesktop\\Export';
      view.exportDesktopResult={done:true,message:'已导出 '+sel.size+' 个桌面到 '+dir};
      render(s());
    });
  });
  root.querySelectorAll('[data-delete-asset]').forEach(el=>{
    el.addEventListener('click',async()=>{
      const dtId=el.dataset.deleteAsset;
      const crId=el.dataset.deleteCr;
      try{
        await client.send('plat-delete-desktop-asset',{classroomId:crId,desktopId:dtId});
        view.deleteAssetResult={done:true,message:'已删除桌面及关联的无引用快照和镜像'};
      }catch(e){ console.error(e); }
      render(s());
    });
  });

  /* ── Server address change page actions ── */
  root.querySelectorAll('[data-toggle-offline-detail]').forEach(el=>{
    el.addEventListener('click',()=>{
      view.showOfflineDetail=!view.showOfflineDetail;
      render(s());
    });
  });
  root.querySelectorAll('[data-settings-action]').forEach(el=>{
    el.addEventListener('click',async()=>{
      const act=el.dataset.settingsAction;
      if(!view.settingsResult) view.settingsResult={};
      try{
        if(act==='server-ip'){
          const addr=view.newServerAddr||root.querySelector('[data-server-new-addr]')?.value||'';
          if(!addr) return;
          const r=await client.send('plat-server-ip-change',{campusId:view.campusId,newAddress:addr});
          const onCnt=r.count||0;
          view.settingsResult.serverIp=true;
          view.settingsResult.serverIpCount=onCnt;
          view.settingsResult.done=true;
          /* Persist result as history for right-side display */
          view.serverChangeHistory={at:new Date().toISOString(), onlineCount:onCnt, newAddr:addr};
        }
      }catch(e){console.error(e);}
      render(s());
    });
  });
  root.querySelectorAll('[data-clear-server-history]').forEach(el=>{
    el.addEventListener('click',()=>{
      view.serverChangeHistory=null;
      view.settingsResult={};
      render(s());
    });
  });

  /* ── Server new address input ── */
  const srvAddrEl=root.querySelector('[data-server-new-addr]');
  if(srvAddrEl){
    srvAddrEl.addEventListener('input',()=>{
      view.newServerAddr=srvAddrEl.value;
      const btn=root.querySelector('[data-settings-action="server-ip"]');
      if(btn) btn.disabled=!srvAddrEl.value;
    });
  }

  /* ── Classroom alerts sort ── */
  root.querySelectorAll('[data-cr-alert-sort]').forEach(el=>{
    el.addEventListener('click',()=>{
      const mode=el.dataset.crAlertSort;
      if(view.crAlertSort===mode) view.crAlertSortAsc=!view.crAlertSortAsc;
      else { view.crAlertSort=mode; view.crAlertSortAsc=false; }
      render(s());
    });
  });

  /* ── Navigate to classroom with specific tab ── */
  root.querySelectorAll('[data-nav-cr-tab]').forEach(el=>{
    el.addEventListener('click',()=>{
      const crId=el.dataset.navCrTab;
      const tab=el.dataset.tabTarget||'overview';
      nav('classrooms',{classroomId:crId,terminalId:null,tab,platAction:null,platActionResult:null});
    });
  });

  /* ── Expand/collapse desktop terminal list ── */
  root.querySelectorAll('[data-expand-dt]').forEach(el=>{
    el.addEventListener('click',()=>{
      if(!view.expandedDesktops) view.expandedDesktops={};
      const dtId=el.dataset.expandDt;
      view.expandedDesktops[dtId]=!view.expandedDesktops[dtId];
      render(s());
    });
  });

  /* ── Expand/collapse asset card terminal list ── */
  root.querySelectorAll('[data-expand-asset]').forEach(el=>{
    el.addEventListener('click',()=>{
      if(!view.expandedAssets) view.expandedAssets={};
      const key=el.dataset.expandAsset;
      view.expandedAssets[key]=!view.expandedAssets[key];
      render(s());
    });
  });

  /* ── Import panel toggle ── */
  root.querySelectorAll('[data-toggle-import]').forEach(el=>{
    el.addEventListener('click',()=>{
      view.showImportPanel=!view.showImportPanel;
      view.platActionResult=null; view.importResult=null; view.importFileReady=false;
      view.importCrName=''; view.importCrBuilding=''; view.importCrRemark='';
      render(s());
    });
  });

  /* ── Import file area (simulate file pick) ── */
  root.querySelectorAll('[data-import-file-area]').forEach(el=>{
    el.addEventListener('click',()=>{
      view.importFileReady=true;
      view.importCrName=view.importCrName||'演示教室 A301';
      render(s());
    });
  });

  /* ── Import terminal list inputs ── */
  const impNameEl=root.querySelector('[data-import-cr-name]');
  if(impNameEl){ impNameEl.addEventListener('input',()=>{view.importCrName=impNameEl.value;}); impNameEl.addEventListener('change',()=>{render(s());}); }
  const impBuildingEl=root.querySelector('[data-import-cr-building]');
  if(impBuildingEl){ impBuildingEl.addEventListener('input',()=>{view.importCrBuilding=impBuildingEl.value;}); }
  const impRemarkEl=root.querySelector('[data-import-cr-remark]');
  if(impRemarkEl){ impRemarkEl.addEventListener('input',()=>{view.importCrRemark=impRemarkEl.value;}); }

  /* ── Sortable data tables (result/progress tables) ── */
  root.querySelectorAll('.plat-sortable th[data-sort]').forEach(th=>{
    th.style.cursor='pointer'; th.style.userSelect='none'; th.style.position='relative';
    th.addEventListener('click',()=>{
      const table=th.closest('table'); if(!table) return;
      const idx=[...th.parentElement.children].indexOf(th);
      const tbody=table.querySelector('tbody'); if(!tbody) return;
      const rows=[...tbody.querySelectorAll('tr')];
      const cur=th.classList.contains('sort-asc')?'asc':th.classList.contains('sort-desc')?'desc':'none';
      table.querySelectorAll('th[data-sort]').forEach(h2=>{h2.classList.remove('sort-asc','sort-desc');});
      const next=cur==='none'?'desc':cur==='desc'?'asc':'none';
      if(next!=='none') th.classList.add('sort-'+next);
      if(next==='none'){ rows.sort((a,b)=>Number(a.dataset.origIdx||0)-Number(b.dataset.origIdx||0)); }
      else { rows.sort((a,b)=>{ const va=(a.children[idx]?.textContent||'').trim(); const vb=(b.children[idx]?.textContent||'').trim(); const cmp=smartCmp(va,vb); return next==='asc'?cmp:-cmp; }); }
      rows.forEach((r,i)=>{if(!r.dataset.origIdx)r.dataset.origIdx=String(i);tbody.appendChild(r);});
    });
  });
  root.querySelectorAll('.plat-sortable tbody tr').forEach((r,i)=>{r.dataset.origIdx=String(i);});
}
