import { createStateClient } from '/shared/state-client.js';
import { getCampus, getClassroom, getServer, serverFor, getTerm, termsInCr,
  taskForCr, crRuntime, campusStats, alertsInCr, desktopAssets, termLabel, termSeat, termIp, termUse, stageLabel } from '/shared/model.js';
import { esc, fmtTime, relTime, pct, tone, pill, defRow, meter, empty, syncLabel, phaseLabel, visLabel } from '/shared/ui.js';

const root = document.getElementById('app');
const client = createStateClient(render);
client.connect();

let view = { page: 'dashboard', campusId: null, classroomId: null, terminalId: null, tab: 'overview' };

function s(){ return client.get(); }
function nav(page, opts={}){ Object.assign(view, {page,...opts}); render(s()); }

function render(state){
  if(!state) return;
  view.campusId = view.campusId || state.demo.focusCampusId;
  root.innerHTML = shellHtml();
  bindEvents();
}

function shellHtml(){
  const state = s();
  const pages = [{id:'dashboard',label:'平台总览'},{id:'classrooms',label:'教室管理'},{id:'assets',label:'桌面资产'},{id:'alerts',label:'告警中心'},{id:'settings',label:'系统运维'}];
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
      <div class="plat-content">${pageContent()}</div>
    </div>
  </div>`;
}

function pageTitle(){
  switch(view.page){
    case 'dashboard': return '平台总览';
    case 'classrooms': return view.classroomId?(view.terminalId?'终端详情':'教室详情'):'教室管理';
    case 'assets': return '桌面资产';
    case 'alerts': return '告警中心';
    case 'settings': return '系统运维';
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
    case 'settings': return settingsPage();
    default: return '';
  }
}


function dashboardPage(){
  const state=s(); const cId=view.campusId;
  const campus=getCampus(state,cId); const server=serverFor(state,cId); const stats=campusStats(state,cId);
  const allAlerts=state.alerts.filter(a=>a.status==='open');
  const crIdsInCampus=new Set(state.classrooms.filter(c=>c.campusId===cId).map(c=>c.id));
  const campusAlerts=allAlerts.filter(a=>crIdsInCampus.has(a.classroomId));
  const recentLogs=state.logs.slice(0,8);
  const logLevelLabel={info:'信息',warn:'警告',error:'错误'};

  /* desktop & storage stats */
  const crsInCampus=state.classrooms.filter(c=>c.campusId===cId);
  const totalDesktops=crsInCampus.reduce((n,c)=>(c.desktopCatalog||[]).length+n,0);
  const totalSnaps=crsInCampus.reduce((n,c)=>(c.snapshotTree||[]).length+n,0);

  return `
  <div class="metric-grid">
    <div class="metric-card"><div class="mc-label">教室数</div><div class="mc-value">${stats.classrooms}</div>
      <div class="mc-sub">已建档 ${stats.registered} · ${esc(campus?.name||'')}</div></div>
    <div class="metric-card"><div class="mc-label">注册终端</div><div class="mc-value">${stats.terminals}</div>
      <div class="mc-sub">教师 ${stats.teachers} · 学生 ${stats.students}</div></div>
    <div class="metric-card"><div class="mc-label">在线率</div><div class="mc-value">${pct(stats.online,stats.terminals)}%</div>
      <div class="mc-sub">在线 ${stats.online} · 离线 ${stats.offline}</div></div>
    <div class="metric-card"><div class="mc-label">活跃告警</div><div class="mc-value${campusAlerts.length?' text-err':''}">${campusAlerts.length}</div>
      <div class="mc-sub">${campusAlerts.length?'需关注':'无告警'}</div></div>
    <div class="metric-card"><div class="mc-label">桌面</div><div class="mc-value">${totalDesktops}</div>
      <div class="mc-sub">服务器存储 ${server?server.storage+'%':'--'}</div></div>
    <div class="metric-card"><div class="mc-label">执行中任务</div><div class="mc-value">${stats.tasks}</div>
      <div class="mc-sub">${stats.tasks?'有任务正在进行':'无执行中任务'}</div></div>
  </div>

  ${server?`<div class="section">
    <div class="section-head"><h3>服务器状态</h3></div>
    <div class="card" style="max-width:700px">
      ${defRow('服务器',server.name)} ${defRow('域名',server.domain||'--',{mono:true})}
      ${defRow('内网 IP',server.internalIp||server.address||'--',{mono:true})} ${defRow('外网 IP',server.externalIp||'--',{mono:true})}
      ${defRow('SSL',server.ssl?pill('已启用','ok'):pill('未启用','err'),{raw:true})}
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-top:12px">
        ${meter('CPU',server.cpu,server.cpu>80?'err':server.cpu>60?'warn':'ok')}
        ${meter('内存',server.memory,server.memory>80?'err':server.memory>60?'warn':'ok')}
        ${meter('存储',server.storage,server.storage>80?'err':server.storage>60?'warn':'ok')}
      </div>
    </div>
  </div>`:''}

  <div class="section">
    <div class="section-head"><h3>教室概况</h3></div>
    <table class="data-table">
      <thead><tr><th>教室</th><th>位置</th><th>阶段</th><th>终端数</th><th>在线</th><th>告警</th><th>任务</th></tr></thead>
      <tbody>${state.classrooms.filter(c=>c.campusId===cId).map(c=>{
        const rt=crRuntime(state,c.id); const tk=taskForCr(state,c.id); const als=alertsInCr(state,c.id);
        return `<tr>
          <td class="clickable" data-nav-cr="${c.id}">${esc(c.name)}</td>
          <td>${esc(c.building)} ${esc(c.floor)}</td>
          <td>${pill(stageLabel(c.stage), c.stage==='deployed'?'ok':c.stage==='blank'?'muted':'info')}</td>
          <td>${rt.total}</td><td>${rt.online}/${rt.total}</td>
          <td>${als.length?`<span class="text-err">${als.length}</span>`:'-'}</td>
          <td>${tk?esc(tk.label):'-'}</td>
        </tr>`;
      }).join('')}</tbody>
    </table>
  </div>

  <div class="section">
    <div class="section-head"><h3>最近日志</h3></div>
    ${recentLogs.length?recentLogs.map(l=>`
      <div style="display:flex;gap:8px;padding:6px 0;font-size:.85rem;border-bottom:1px solid #f1f5f9">
        ${pill(logLevelLabel[l.level]||l.level,tone(l.level==='warn'?'warning':l.level==='info'?'ok':'offline'))}
        <span>${esc(l.title)}</span>
        <span style="color:var(--c-text3);margin-left:auto">${fmtTime(l.at)}</span>
      </div>
    `).join(''):empty('暂无日志')}
  </div>`;
}


function classroomListPage(){
  const state=s(); const crs=state.classrooms.filter(c=>c.campusId===view.campusId);
  const ir = view.importResult || null;
  const showImport = view.showImportPanel;
  const isNew = !view.importTarget || view.importTarget==='_new';

  /* If import wizard is active, show full-page wizard */
  if(showImport) return `
  <div style="margin-bottom:12px">
    <button class="btn btn-ghost btn-sm" data-toggle-import>← 返回教室列表</button>
  </div>
  <div style="max-width:800px">
    <div class="card" style="border-left:3px solid var(--c-brand);margin-bottom:20px">
      <div class="card-header" style="font-size:1.05rem">导入终端清单</div>
      <div style="font-size:.85rem;color:var(--c-text2);margin-bottom:16px">
        选择母机导出的 Excel 终端清单文件，系统将自动读取其中的教室信息和终端列表。<br>
        可以<strong>创建新教室</strong>或<strong>追加到已有教室</strong>。
      </div>

      <div style="margin-bottom:16px;padding:16px;background:var(--c-bg2);border-radius:8px;border:2px dashed var(--c-border);text-align:center">
        <div style="font-size:.9rem;font-weight:600;margin-bottom:4px">选择 Excel 文件</div>
        <div style="font-size:.82rem;color:var(--c-text3)">支持 .xlsx 格式，由终端侧「导出清单」功能生成</div>
      </div>

      <div class="prep-field" style="margin-bottom:12px"><label style="width:100px;font-weight:600;font-size:.85rem">导入目标</label>
        <select data-import-target style="width:280px">
          <option value="_new"${isNew?' selected':''}>创建新教室</option>
          ${crs.map(c=>`<option value="${c.id}"${view.importTarget===c.id?' selected':''}>${esc(c.name)}（追加终端）</option>`).join('')}
        </select>
      </div>

      ${isNew?`
      <div style="border-top:1px solid var(--c-border);padding-top:12px;margin-top:8px">
        <div style="font-size:.85rem;font-weight:600;color:var(--c-text2);margin-bottom:8px">新教室信息（可修改 Excel 中自动填入的内容）</div>
        <div class="prep-field" style="margin-bottom:8px"><label style="width:100px;font-size:.85rem">教室名称</label>
          <input type="text" data-import-cr-name value="${esc(view.importCrName||'')}" placeholder="从 Excel 自动读取" style="width:280px"></div>
        <div class="prep-field" style="margin-bottom:8px"><label style="width:100px;font-size:.85rem">位置</label>
          <input type="text" data-import-cr-building value="${esc(view.importCrBuilding||'')}" placeholder="如：创意楼B座 3F" style="width:280px"></div>
        <div class="prep-field" style="margin-bottom:8px"><label style="width:100px;font-size:.85rem">备注</label>
          <input type="text" data-import-cr-remark value="${esc(view.importCrRemark||'')}" placeholder="可选" style="width:380px"></div>
      </div>
      `:`
      <div style="border-top:1px solid var(--c-border);padding-top:12px;margin-top:8px;font-size:.85rem;color:var(--c-text2)">
        终端将追加到 <strong>${esc(crs.find(c=>c.id===view.importTarget)?.name||'--')}</strong>，已有终端不受影响。
      </div>
      `}

      ${ir?.done?`<div style="color:var(--c-ok);font-size:.85rem;margin:12px 0;padding:8px 12px;background:rgba(34,197,94,.08);border-radius:6px">✓ 已成功导入终端清单${ir.count?' — '+ir.count+' 台终端':''}</div>`:''}
      <div style="display:flex;gap:8px;margin-top:16px">
        <button class="btn btn-primary" data-plat-confirm="import-list"${ir?.done?' disabled':''}>确认导入</button>
        <button class="btn btn-ghost" data-toggle-import>取消</button>
      </div>
    </div>
  </div>`;

  return `
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:8px">
    <div style="font-size:.85rem;color:var(--c-text3)">${crs.length} 个教室</div>
  </div>
  <div class="card" style="max-width:700px;margin-bottom:20px;padding:16px 20px;cursor:pointer;border-left:3px solid var(--c-brand);display:flex;align-items:center;gap:16px" data-toggle-import>
    <div>
      <div style="font-weight:600;font-size:.95rem">导入终端清单</div>
      <div style="font-size:.82rem;color:var(--c-text3)">从母机导出的 Excel 文件导入终端，创建新教室或追加到已有教室</div>
    </div>
  </div>
  <table class="data-table">
    <thead><tr><th>教室名称</th><th>位置</th><th>备注</th><th>阶段</th><th>终端数</th><th>已部署</th><th>在线率</th><th>任务</th></tr></thead>
    <tbody>${crs.map(c=>{
      const rt=crRuntime(state,c.id); const tk=taskForCr(state,c.id);
      return `<tr>
        <td class="clickable" data-nav-cr="${c.id}">${esc(c.name)}</td>
        <td>${esc(c.building)} ${esc(c.floor)}</td><td>${esc(c.remark||'')}</td>
        <td>${pill(stageLabel(c.stage), c.stage==='deployed'?'ok':c.stage==='blank'?'muted':'info')}</td>
        <td>${rt.total}</td><td>${rt.deployed}</td><td>${pct(rt.online,rt.total)}%</td>
        <td>${tk?esc(tk.label):'-'}</td>
      </tr>`;
    }).join('')}</tbody>
  </table>`;
}


function classroomDetailPage(){
  const state=s(); const c=getClassroom(state,view.classroomId); if(!c) return empty('教室不存在');
  const rt=crRuntime(state,c.id); const terms=termsInCr(state,c.id); const alerts=alertsInCr(state,c.id); const tk=taskForCr(state,c.id);
  const tabs=[{l:'总览',k:'overview'},{l:'终端列表',k:'terminals'},{l:'桌面与存储',k:'desktops'},{l:'告警',k:'alerts'}];
  const tab=view.tab||'overview';

  return `
  <div style="margin-bottom:16px">
    <div style="display:flex;align-items:baseline;gap:12px;flex-wrap:wrap">
      <button class="btn btn-ghost btn-sm" data-nav="classrooms">← 教室列表</button>
      <h2 style="font-size:1.2rem">${esc(c.name)}</h2>
    </div>
    <div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:8px;font-size:.85rem;color:var(--c-text2)">
      <span>位置：${pill(c.building+' '+c.floor,'muted')}</span>
      <span>状态：${pill(stageLabel(c.stage), c.stage==='deployed'?'ok':'info')}</span>
      <span>在线：${pill(rt.online+'/'+rt.total, rt.offline>0?'warn':'ok')}</span>
      ${tk?`<span>任务：${pill(tk.label+' — '+phaseLabel(tk.phase),tk.phase==='running'?'info':'ok')}</span>`:''}
      ${c.remark?`<span>备注：${esc(c.remark)}</span>`:''}
    </div>
  </div>
  <div class="tab-bar">${tabs.map(t=>`<div class="tab-item${t.k===tab?' active':''}" data-tab="${t.k}">${t.l}</div>`).join('')}</div>
  ${tab==='overview'?crOverviewTab(c,rt,terms,alerts,tk):''}
  ${tab==='terminals'?crTerminalsTab(c,terms):''}
  ${tab==='desktops'?crDesktopsTab(c):''}
  ${tab==='alerts'?crAlertsTab(c,alerts):''}
  `;
}


function crOverviewTab(c,rt,terms,alerts,tk){
  return `
  <div class="metric-grid">
    <div class="metric-card"><div class="mc-label">终端总数</div><div class="mc-value">${rt.total}</div></div>
    <div class="metric-card"><div class="mc-label">已部署</div><div class="mc-value">${rt.deployed}</div></div>
    <div class="metric-card"><div class="mc-label">在线</div><div class="mc-value text-ok">${rt.online}</div></div>
    <div class="metric-card"><div class="mc-label">离线</div><div class="mc-value${rt.offline?' text-err':''}">${rt.offline}</div></div>
    <div class="metric-card"><div class="mc-label">告警</div><div class="mc-value${alerts.length?' text-err':''}">${alerts.length}</div></div>
  </div>
  ${tk?`<div class="card mb-16">
    <div class="card-header">当前任务 ${pill(phaseLabel(tk.phase),tone(tk.phase))}</div>
    ${defRow('任务',tk.label)} ${defRow('进度',(tk.counts.completed+tk.counts.failed)+'/'+tk.counts.total)}
    ${tk.counts.failed?defRow('失败',tk.counts.failed+' 台'):''} ${defRow('开始时间',fmtTime(tk.startedAt))}
  </div>`:''}
  ${alerts.length?`<div class="section-head"><h3>活跃告警</h3></div>${alerts.slice(0,5).map(a=>alertHtml(a)).join('')}`:''}
  `;
}


function crTerminalsTab(c,terms){
  const onlineTerms = terms.filter(t=>t.online);
  const viewMode = view.termListMode || 'layout';
  const pa = view.platAction || null;
  const par = view.platActionResult || null;
  const sel = view.platSelectedTerms || [];
  const selOnline = sel.filter(id => onlineTerms.some(t=>t.id===id));

  const actions = [
    {k:'shutdown', l:'批量关机', color:'var(--c-warn)', needSel:true},
    {k:'restart', l:'批量重启', color:'var(--c-info)', needSel:true},
    {k:'distribute', l:'部署桌面', color:'var(--c-brand)', needSel:true},
    {k:'ip-mod', l:'修改 IP', color:'var(--c-info)', needSel:true},
    {k:'remote-test', l:'网络测试', color:'var(--c-ok)', needSel:true},
  ];

  return `
  <div class="batch-toolbar">
    <div class="batch-actions">
      ${actions.map(a=>{
        const active = pa === a.k;
        const disabled = a.needSel && selOnline.length === 0 && !active;
        return `<button class="batch-btn${active?' active':''}" data-plat-action="${a.k}" style="--accent:${a.color}"${disabled?' disabled':''}>${a.l}${a.needSel && selOnline.length>0 ? ' ('+selOnline.length+')' : ''}</button>`;
      }).join('')}
      <span class="batch-sep"></span>
      <button class="batch-btn${pa==='broadcast-test'?' active':''}" data-plat-action="broadcast-test" style="--accent:var(--c-warn)">教室广播隔离测试</button>
    </div>
    <div class="batch-sel-summary">
      ${sel.length > 0
        ? `已选 <strong>${sel.length}</strong> 台${selOnline.length!==sel.length ? `（在线 ${selOnline.length}）` : ''}`
        : `<span style="color:var(--c-text3)">点击下方终端进行选择</span>`}
      <a class="batch-sel-link" data-sel-all-online>全选在线</a>
      ${sel.length > 0 ? `<a class="batch-sel-link" data-sel-clear>清除选择</a>` : ''}
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
    <thead><tr><th style="width:32px"><input type="checkbox" data-sel-toggle-all${sel.length===terms.length&&terms.length?' checked':''}></th><th>座位号</th><th>机器名</th><th>用途</th><th>IP</th><th>在线</th></tr></thead>
    <tbody>${terms.map((t,i)=>{
      const checked = sel.includes(t.id);
      return `<tr style="${checked?'background:rgba(59,130,246,.06)':''}">
      <td><input type="checkbox" data-term-chk="${t.id}"${checked?' checked':''}></td>
      <td class="clickable" data-nav-term="${t.id}">${esc(t.seat||'--')}</td>
      <td>${esc(t.name||'未命名')}</td>
      <td>${pill(termUse(t), t.use==='教师终端'?'warn':'muted')}</td>
      <td class="mono">${esc(t.ip||'未分配')}</td>
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
  const accentMap = {shutdown:'var(--c-warn)', restart:'var(--c-info)', distribute:'var(--c-brand)', 'ip-mod':'var(--c-info)', 'remote-test':'var(--c-ok)', 'broadcast-test':'var(--c-warn)'};

  /* ── helper: compact terminal pill list ── */
  function termPills(list, max){
    const show = list.slice(0, max||8);
    const rest = list.length - show.length;
    return show.map(t=>`<span style="display:inline-block;padding:1px 6px;border-radius:3px;font-size:.75rem;background:var(--c-bg2);margin:1px">${esc(t.seat||'--')}</span>`).join('')
      + (rest > 0 ? `<span style="font-size:.75rem;color:var(--c-text3);margin-left:2px">等 ${list.length} 台</span>` : '');
  }

  if(pa==='shutdown'){
    content = `
      <div class="card-header" style="margin:-14px -18px 12px;padding:10px 18px;background:rgba(234,179,8,.06);border-radius:8px 8px 0 0;font-size:.95rem">
        批量关机
      </div>
      <div style="font-size:.85rem;color:var(--c-text2);margin-bottom:10px">
        将向以下 <strong>${selTerms.length}</strong> 台在线终端发送软件关机指令。
      </div>
      <div style="margin-bottom:12px;padding:8px 12px;background:var(--c-bg2);border-radius:6px;line-height:1.7">
        ${termPills(selTerms, 20)}
      </div>
      ${par?.done?`<div style="padding:8px 12px;background:rgba(34,197,94,.06);border-radius:6px;margin-bottom:10px">
        <span class="text-ok" style="font-size:.85rem">✓ 已成功向 ${par.count} 台终端发送关机指令</span>
      </div>`:''}
      <div style="display:flex;gap:8px">
        <button class="btn btn-primary btn-sm" data-plat-confirm="shutdown"${par?.done||!selTerms.length?' disabled':''}>确认关机 (${selTerms.length})</button>
        <button class="btn btn-ghost btn-sm" data-plat-cancel>取消</button>
      </div>`;
  }
  if(pa==='restart'){
    content = `
      <div class="card-header" style="margin:-14px -18px 12px;padding:10px 18px;background:rgba(59,130,246,.06);border-radius:8px 8px 0 0;font-size:.95rem">
        批量重启
      </div>
      <div style="font-size:.85rem;color:var(--c-text2);margin-bottom:10px">
        将向以下 <strong>${selTerms.length}</strong> 台在线终端发送重启指令，终端将在数秒后自动恢复在线。
      </div>
      <div style="margin-bottom:12px;padding:8px 12px;background:var(--c-bg2);border-radius:6px;line-height:1.7">
        ${termPills(selTerms, 20)}
      </div>
      ${par?.done?`<div style="padding:8px 12px;background:rgba(34,197,94,.06);border-radius:6px;margin-bottom:10px">
        <span class="text-ok" style="font-size:.85rem">✓ 已成功向 ${par.count} 台终端发送重启指令</span>
      </div>`:''}
      <div style="display:flex;gap:8px">
        <button class="btn btn-primary btn-sm" data-plat-confirm="restart"${par?.done||!selTerms.length?' disabled':''}>确认重启 (${selTerms.length})</button>
        <button class="btn btn-ghost btn-sm" data-plat-cancel>取消</button>
      </div>`;
  }
  if(pa==='distribute'){
    const sourceCandidates = terms.filter(t=>t.online&&(t.desktops||[]).length>0);
    const selSrc = view.distSrcId || null;
    const srcTerm = selSrc ? terms.find(t=>t.id===selSrc) : null;
    const srcDesktops = srcTerm ? (srcTerm.desktops||[]) : [];
    const selDts = view.distDtIds || [];
    const targetTerms = selTerms.filter(t=>t.id!==selSrc);
    const step = !selSrc ? 1 : (!selDts.length ? 2 : 3);

    content = `
      <div class="card-header" style="margin:-14px -18px 12px;padding:10px 18px;background:rgba(59,130,246,.06);border-radius:8px 8px 0 0;font-size:.95rem">
        批量部署桌面
      </div>
      <div style="display:flex;gap:6px;margin-bottom:14px;font-size:.82rem">
        <span style="padding:3px 10px;border-radius:12px;${step>=1?'background:var(--c-brand);color:#fff':'background:var(--c-bg2)'}">① 选来源终端</span>
        <span style="padding:3px 10px;border-radius:12px;${step>=2?'background:var(--c-brand);color:#fff':'background:var(--c-bg2)'}">② 选部署桌面</span>
        <span style="padding:3px 10px;border-radius:12px;${step>=3?'background:var(--c-brand);color:#fff':'background:var(--c-bg2)'}">③ 选目标终端并确认</span>
      </div>

      <div style="display:grid;grid-template-columns:${srcDesktops.length?'280px 1fr':'1fr'};gap:16px;align-items:start">
        <div>
          <div style="font-size:.82rem;font-weight:600;margin-bottom:6px">来源终端（已有桌面的在线终端）</div>
          <select data-dist-src style="width:100%;padding:6px 8px;border:1px solid var(--c-border);border-radius:4px">
            <option value="">-- 选择来源 --</option>
            ${sourceCandidates.map(t=>`<option value="${t.id}"${t.id===selSrc?' selected':''}>${esc(t.seat||'--')} · ${esc(t.name||'')} · ${(t.desktops||[]).length} 个桌面</option>`).join('')}
          </select>
          ${srcTerm?`<div style="font-size:.78rem;color:var(--c-text3);margin-top:4px">IP: ${esc(srcTerm.ip||'--')}</div>`:''}
        </div>
        ${srcDesktops.length?`<div>
          <div style="font-size:.82rem;font-weight:600;margin-bottom:6px">选择要部署的桌面（可多选）</div>
          <div style="display:flex;flex-direction:column;gap:4px">
            ${srcDesktops.map(d=>{
              const chk=selDts.includes(d.id);
              return `<label style="display:flex;align-items:center;gap:8px;font-size:.82rem;cursor:pointer;padding:6px 10px;border:1px solid ${chk?'var(--c-brand)':'var(--c-border)'};border-radius:6px;background:${chk?'rgba(59,130,246,.06)':'#fff'}">
              <input type="checkbox" data-dist-dt-chk value="${d.id}"${chk?' checked':''}>
              <div style="flex:1">
                <div style="font-weight:600">${esc(d.name)}</div>
                <div style="font-size:.78rem;color:var(--c-text3)">${esc(d.os||'')}${d.dataDisk?' · 数据盘 '+esc(d.dataDisk):''}</div>
              </div>
              ${d.physicalDeploy?pill('物理部署','warn'):''}
            </label>`;}).join('')}
          </div>
        </div>`:''}
      </div>

      ${selDts.length > 0 ? `
      <div style="margin-top:12px;padding:10px 14px;background:var(--c-bg2);border-radius:6px">
        <div style="font-size:.82rem;font-weight:600;margin-bottom:6px">部署模式</div>
        <div style="display:flex;gap:16px;font-size:.82rem">
          <label style="display:flex;align-items:center;gap:4px;cursor:pointer"><input type="radio" name="distMode" data-dist-mode="incremental"${(view.distMode||'incremental')==='incremental'?' checked':''}> 增量更新（仅同步差异，更快）</label>
          <label style="display:flex;align-items:center;gap:4px;cursor:pointer"><input type="radio" name="distMode" data-dist-mode="full"${view.distMode==='full'?' checked':''}> 全量部署（完整覆盖，更可靠）</label>
        </div>
      </div>
      <div style="margin-top:8px;padding:10px 14px;background:var(--c-bg2);border-radius:6px">
        <div style="font-size:.82rem;font-weight:600;margin-bottom:6px">目标终端 · ${targetTerms.length} 台（在下方座位图中选择）</div>
        <div style="line-height:1.7">${termPills(targetTerms, 20)}</div>
      </div>` : ''}

      ${par?.running?`<div style="padding:8px 12px;background:rgba(59,130,246,.06);border-radius:6px;margin-top:10px">
        <span class="text-info" style="font-size:.85rem">⏳ 部署进行中… ${par.progress?par.progress.filter(p=>p.state==='completed').length+'/'+par.progress.length+' 完成':'请查看下方座位图进度'}</span>
      </div>`:''}
      ${par?.done?`<div style="padding:8px 12px;background:rgba(34,197,94,.06);border-radius:6px;margin-top:10px">
        <span class="text-ok" style="font-size:.85rem">✓ 已将 ${par.dtCount||1} 个桌面部署到 ${par.count} 台终端${par.failed?' · <span class="text-err">'+par.failed+' 台失败</span>':''}</span>
      </div>`:''}

      <div style="display:flex;gap:8px;margin-top:12px">
        <button class="btn btn-primary btn-sm" data-plat-confirm="distribute"${(!selSrc||!selDts.length||!targetTerms.length||par?.done||par?.running)?' disabled':''}>确认部署 ${selDts.length?'('+selDts.length+' 桌面 → '+targetTerms.length+' 终端)':''}</button>
        <button class="btn btn-ghost btn-sm" data-plat-cancel>取消</button>
      </div>`;
  }
  if(pa==='ip-mod'){
    const curBase = c.networkBase || '10.0.0';
    const newBase = view.newIpBase || curBase;
    const newStart = view.newIpStart || 20;
    /* Build preview for selected terminals */
    const previewTerms = selTerms.length ? selTerms : [];
    content = `
      <div class="card-header" style="margin:-14px -18px 12px;padding:10px 18px;background:rgba(59,130,246,.06);border-radius:8px 8px 0 0;font-size:.95rem">
        批量修改 IP
      </div>
      <div style="display:grid;grid-template-columns:280px 1fr;gap:16px;align-items:start">
        <div>
          <div style="font-size:.82rem;font-weight:600;margin-bottom:8px">IP 分配规则</div>
          <div class="prep-field" style="margin-bottom:6px"><label style="width:70px">当前网段</label><span class="mono" style="font-size:.82rem">${esc(curBase)}.0/24</span></div>
          <div class="prep-field" style="margin-bottom:6px"><label style="width:70px">新网段</label><input type="text" data-ip-base value="${esc(newBase)}" placeholder="10.22.15" style="width:130px"></div>
          <div class="prep-field" style="margin-bottom:6px"><label style="width:70px">起始位</label><input type="number" data-ip-start value="${newStart}" min="2" max="250" style="width:80px"></div>
          <div class="prep-field" style="margin-bottom:6px"><label style="width:70px">网关</label><input type="text" data-ip-gw value="${esc(view.newIpGw||c.gateway||'')}" placeholder="${esc(curBase)}.1" style="width:130px"></div>
        </div>
        <div>
          <div style="font-size:.82rem;font-weight:600;margin-bottom:8px">IP 变更预览 · ${previewTerms.length} 台终端</div>
          ${previewTerms.length?`
          <div style="max-height:200px;overflow-y:auto">
            <table class="data-table" style="font-size:.78rem">
              <thead><tr><th>座位</th><th>新 IP</th></tr></thead>
              <tbody>${previewTerms.map((t,i)=>{
                const newIp=newBase+'.'+(newStart+i);
                return `<tr><td>${esc(t.seat||'--')}</td>
                  <td class="mono" style="color:var(--c-ok);font-weight:600">${esc(newIp)}</td></tr>`;
              }).join('')}</tbody>
            </table>
          </div>`
          :`<div style="font-size:.82rem;color:var(--c-text3)">请在下方座位图中选择要修改的终端</div>`}
        </div>
      </div>
      ${par?.done?`<div style="padding:8px 12px;background:rgba(34,197,94,.06);border-radius:6px;margin-top:10px">
        <span class="text-ok" style="font-size:.85rem">✓ 已修改 ${par.count} 台终端 IP</span>
      </div>`:''}
      <div style="display:flex;gap:8px;margin-top:12px">
        <button class="btn btn-primary btn-sm" data-plat-confirm="ip-mod"${par?.done||!previewTerms.length?' disabled':''}>确认修改 (${previewTerms.length})</button>
        <button class="btn btn-ghost btn-sm" data-plat-cancel>取消</button>
      </div>`;
  }
  if(pa==='remote-test'){
    content = `
      <div class="card-header" style="margin:-14px -18px 12px;padding:10px 18px;background:rgba(34,197,94,.06);border-radius:8px 8px 0 0;font-size:.95rem">
        终端网络连通性测试
      </div>
      <div style="font-size:.85rem;color:var(--c-text2);margin-bottom:10px">
        逐台测试以下 <strong>${selTerms.length}</strong> 台选中在线终端的网络延迟、带宽、服务器连通性和网关连通性。
      </div>
      <div style="margin-bottom:12px;padding:8px 12px;background:var(--c-bg2);border-radius:6px;line-height:1.7">
        ${termPills(selTerms, 20)}
      </div>
      ${par?.results?`
      <div style="padding:8px 12px;background:${par.results.every(r=>r.serverReachable&&r.gatewayReachable)?'rgba(34,197,94,.06)':'rgba(239,68,68,.06)'};border-radius:6px;margin-bottom:10px">
        <span class="${par.results.every(r=>r.serverReachable&&r.gatewayReachable)?'text-ok':'text-err'}" style="font-size:.85rem">
          ${par.results.every(r=>r.serverReachable&&r.gatewayReachable)?'✓ 全部终端网络正常':'⚠ 有终端网络异常'} · 已测试 ${par.results.length} 台
        </span>
      </div>
      <div style="max-height:260px;overflow-y:auto">
        <table class="data-table" style="font-size:.78rem">
          <thead><tr><th>座位</th><th>机器名</th><th>IP</th><th>延迟</th><th>下行</th><th>上行</th><th>服务器</th><th>网关</th></tr></thead>
          <tbody>${par.results.map(r=>`<tr>
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
        教室广播隔离测试
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


function crDesktopsTab(c){
  const state=s();
  const catalog = c.desktopCatalog || [];
  const images = c.imageStore || [];
  const snaps = c.snapshotTree || [];
  if(!catalog.length && !images.length) return empty('该教室尚无桌面资产', '需通过终端侧部署后导出');

  const disks = catalog.filter(d=>d.dataDisk).map(d=>({ desktop: d.name, disk: d.dataDisk }));

  function snapChain(snapId){
    const chain=[];
    let cur=snaps.find(sn=>sn.id===snapId);
    while(cur){ chain.unshift(cur); cur=snaps.find(sn=>sn.id===cur.parentId); }
    return chain;
  }
  function imageFor(snapId){
    const sn=snaps.find(s=>s.id===snapId);
    return sn?images.find(img=>img.id===sn.imageId):null;
  }
  function termsUsingDesktop(desktopId){
    return termsInCr(state,c.id).filter(t=>(t.desktops||[]).some(d=>d.id===desktopId));
  }
  function fSize(id){ let h=0;for(let i=0;i<id.length;i++) h=((h<<5)-h+id.charCodeAt(i))|0; return (Math.abs(h%40)+8)+'.'+(Math.abs(h>>8)%10)+' GB'; }

  /* Render vertical tree for a single desktop's snapshot chain */
  function renderChainTree(chain, img){
    let html='';
    if(img){
      html+=`<div style="padding:2px 0;font-size:.82rem;display:flex;align-items:center;gap:6px">
        <span style="background:var(--c-info);color:#fff;padding:1px 6px;border-radius:3px;font-size:.78rem">[镜像]</span>
        <span style="font-weight:600">${esc(img.name)}</span>
        <span class="mono" style="color:var(--c-text3);font-size:.78rem">${esc(img.name.replace(/\\s+/g,'_'))}.vhd</span>
        <span style="color:var(--c-text3);font-size:.78rem">${fSize(img.id)}</span>
        <span style="color:var(--c-text3);font-size:.78rem">${fmtTime(img.importedAt)}</span>
      </div>`;
    }
    chain.forEach((sn,i)=>{
      const indent=(i+1)*20;
      html+=`<div style="margin-left:${indent}px;padding:2px 0;font-size:.82rem;display:flex;align-items:center;gap:6px">
        <span style="color:var(--c-text3);font-family:monospace">└─</span>
        <span style="background:var(--c-bg2);padding:1px 6px;border-radius:3px">[快照] ${esc(sn.name)}</span>
        <span class="mono" style="color:var(--c-text3);font-size:.78rem">${esc(sn.name.replace(/\\s+/g,'_'))}.qcow2</span>
        <span style="color:var(--c-text3);font-size:.78rem">${fSize(sn.id)}</span>
        <span style="color:var(--c-text3);font-size:.78rem">${fmtTime(sn.createdAt)}</span>
      </div>`;
    });
    return html;
  }

  /* Build full snapshot tree for all images/snapshots */
  function buildSnapTree(){
    const roots = snaps.filter(sn=>!sn.parentId);
    function children(pid){ return snaps.filter(sn=>sn.parentId===pid); }
    function renderNode(sn, depth){
      const indent = depth * 20;
      const kids = children(sn.id);
      return `<div style="margin-left:${indent}px;padding:2px 0;font-size:.82rem;display:flex;align-items:center;gap:6px">
        <span style="color:var(--c-text3);font-family:monospace">└─</span>
        <span style="background:var(--c-bg2);padding:1px 6px;border-radius:3px">[快照] ${esc(sn.name)}</span>
        <span class="mono" style="color:var(--c-text3);font-size:.78rem">${esc(sn.name.replace(/\\s+/g,'_'))}.qcow2</span>
        <span style="color:var(--c-text3);font-size:.78rem">${fSize(sn.id)}</span>
        <span style="color:var(--c-text3);font-size:.78rem">${fmtTime(sn.createdAt)}</span>
      </div>${kids.map(k=>renderNode(k, depth+1)).join('')}`;
    }
    let html='';
    for(const img of images){
      const imgRoots=roots.filter(sn=>sn.imageId===img.id);
      html+=`<div style="padding:2px 0;font-size:.82rem;display:flex;align-items:center;gap:6px">
        <span style="background:var(--c-info);color:#fff;padding:1px 6px;border-radius:3px;font-size:.78rem">[镜像]</span>
        <span style="font-weight:600">${esc(img.name)}</span>
        <span class="mono" style="color:var(--c-text3);font-size:.78rem">${esc(img.name.replace(/\\s+/g,'_'))}.vhd</span>
        <span style="color:var(--c-text3);font-size:.78rem">${fSize(img.id)}</span>
        <span style="color:var(--c-text3);font-size:.78rem">${fmtTime(img.importedAt)}</span>
      </div>`;
      for(const r of imgRoots) html+=renderNode(r,1);
    }
    return html;
  }

  const expanded = view.expandedDesktops || {};

  return `
  <div style="font-size:.85rem;color:var(--c-text3);margin-bottom:16px">只读视图 — 桌面数据来自终端导出清单和终端自行上报。</div>
  <div style="display:flex;gap:24px;flex-wrap:wrap;margin-bottom:20px;font-size:.88rem;color:var(--c-text2)">
    <span><strong>${catalog.length}</strong> 个桌面</span>
    <span><strong>${snaps.length}</strong> 个快照</span>
    <span><strong>${images.length}</strong> 个基础镜像</span>
    <span><strong>${disks.length}</strong> 个数据盘</span>
  </div>

  ${catalog.map(d=>{
    const chain=snapChain(d.snapshotId);
    const img=imageFor(d.snapshotId);
    const tUsing=termsUsingDesktop(d.id);
    const isExpanded = expanded[d.id];
    return `
  <div class="card mb-16" style="padding:0;overflow:hidden">
    <div style="padding:14px 20px;background:var(--c-bg2);border-bottom:1px solid var(--c-border);display:flex;align-items:center;gap:10px;flex-wrap:wrap">
      <strong style="font-size:1rem">${esc(d.name)}</strong>
      <span style="font-size:.85rem;color:var(--c-text3)">${esc(d.os||'')}</span>
    </div>
    <div style="padding:12px 20px">
      <div style="display:grid;grid-template-columns:auto 1fr;gap:4px 16px;font-size:.85rem;max-width:600px">
        ${d.dataDisk?`<span style="color:var(--c-text3)">数据盘</span><span style="color:var(--c-info);font-weight:500">${esc(d.dataDisk)}</span>`:''}
        <span style="color:var(--c-text3)">备注</span><span>${esc(d.remark||'--')}</span>
        <span style="color:var(--c-text3)">创建时间</span><span>${fmtTime(d.createdAt)}</span>
        <span style="color:var(--c-text3)">更新时间</span><span>${fmtTime(d.editedAt)}</span>
      </div>

      <div style="margin-top:12px;padding-top:10px;border-top:1px solid var(--c-border)">
        <div style="font-size:.82rem;font-weight:600;color:var(--c-text2);margin-bottom:6px">镜像快照文件链</div>
        ${renderChainTree(chain, img)}
      </div>

      <div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--c-border);font-size:.82rem">
        <span style="font-weight:600;color:var(--c-text2)">使用终端：</span>
        <span>${tUsing.length} 台</span>
        ${tUsing.length?` <button class="btn btn-ghost btn-sm" data-expand-dt="${d.id}" style="font-size:.78rem;padding:1px 6px">${isExpanded?'收起':'展开'}</button>`:''}
        ${isExpanded&&tUsing.length?`<div style="margin-top:6px;margin-left:8px">${tUsing.map(t=>`<div style="display:flex;align-items:center;gap:8px;padding:2px 0">
          <a class="clickable" data-nav-term="${t.id}" style="cursor:pointer;text-decoration:underline;color:var(--c-brand)">${esc(t.seat||'--')}</a>
          <span>${esc(t.name||'')}</span>
          <span class="mono" style="color:var(--c-text3)">${esc(t.ip||'')}</span>
          ${pill(t.online?'在线':'离线',tone(t.online?'on':'offline'))}
        </div>`).join('')}</div>`:''}
      </div>
    </div>
  </div>`;
  }).join('')}

  <div class="section-head" style="margin-top:24px"><h3>完整快照依赖树</h3></div>
  <div class="card" style="max-width:900px;padding:16px 20px">
    ${buildSnapTree()}
  </div>

  ${disks.length?`
  <div class="section-head" style="margin-top:24px"><h3>数据盘汇总</h3></div>
  <div class="card" style="max-width:700px">
    <table class="data-table" style="box-shadow:none">
      <thead><tr><th>所属桌面</th><th>数据盘配置</th></tr></thead>
      <tbody>${disks.map(dk=>`<tr><td>${esc(dk.desktop)}</td><td style="font-weight:500">${esc(dk.disk)}</td></tr>`).join('')}</tbody>
    </table>
    <div style="font-size:.82rem;color:var(--c-text3);padding:8px 12px;border-top:1px solid var(--c-border)">共 ${disks.length} 个桌面创建了数据盘</div>
  </div>`:''}
  `;
}

function crAlertsTab(c,alerts){
  if(!alerts.length) return empty('当前无活跃告警');
  const sortMode = view.crAlertSort || 'severity';
  const sortAsc = view.crAlertSortAsc ?? false;
  const dir = sortAsc ? 1 : -1;
  const levelOrder = {high:0,medium:1,low:2};
  const sorted = [...alerts].sort((a,b)=>{
    if(sortMode==='severity'){
      const cmp = (levelOrder[a.level]??9)-(levelOrder[b.level]??9);
      return cmp!==0 ? (sortAsc ? -cmp : cmp) : (new Date(b.at)-new Date(a.at));
    }
    return (new Date(a.at)-new Date(b.at))*dir;
  });
  const arrow = sortAsc ? '↑' : '↓';
  const high=alerts.filter(a=>a.level==='high').length;
  const medium=alerts.filter(a=>a.level==='medium').length;
  const low=alerts.filter(a=>a.level==='low').length;
  return `
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px">
    <div style="display:flex;gap:16px;font-size:.88rem">
      ${high?`<span style="color:var(--c-err);font-weight:600">高 ${high}</span>`:''}
      ${medium?`<span style="color:var(--c-warn);font-weight:600">中 ${medium}</span>`:''}
      ${low?`<span style="color:var(--c-text3)">低 ${low}</span>`:''}
    </div>
    <div style="display:flex;gap:6px">
      <button class="btn btn-sm${sortMode==='time'?' btn-primary':' btn-ghost'}" data-cr-alert-sort="time">按时间 ${sortMode==='time'?arrow:''}</button>
      <button class="btn btn-sm${sortMode==='severity'?' btn-primary':' btn-ghost'}" data-cr-alert-sort="severity">按严重度 ${sortMode==='severity'?arrow:''}</button>
    </div>
  </div>
  ${sorted.map(a=>alertHtml(a,false)).join('')}`;
}

function alertHtml(a, showNav){
  const t=getTerm(s(),a.terminalId);
  const c=showNav?getClassroom(s(),a.classroomId):null;
  const levelLabel={high:'高',medium:'中',low:'低'};
  return `<div class="alert-row ${a.level}">
    <div><div class="al-title">${pill(levelLabel[a.level]||a.level,a.level==='high'?'err':a.level==='medium'?'warn':'muted')} ${esc(a.title)}</div>
      <div class="al-detail">${esc(a.detail)}</div>
      <div class="al-source">
        ${c?`<a class="clickable" data-nav-cr-tab="${c.id}" data-tab-target="alerts" style="cursor:pointer;text-decoration:underline;color:var(--c-brand)">${esc(c.name)}</a> · `:''}
        ${t?`<a class="clickable" data-nav-term="${t.id}" style="cursor:pointer;text-decoration:underline;color:var(--c-brand)">${pill(t.seat||'--','muted')} ${esc(t.name||'')}</a> ${t.ip?`<span class="mono">${esc(t.ip)}</span>`:''}`:''}
      </div></div>
    <div class="al-time">${relTime(a.at)}</div>
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
  const memPct = met.memTotal ? Math.round(met.memUsed/met.memTotal*100) : 0;
  const diskPct = met.diskTotal ? Math.round(met.diskUsed/met.diskTotal*100) : 0;

  return `
  <div style="display:flex;align-items:baseline;gap:12px;margin-bottom:16px;flex-wrap:wrap">
    <button class="btn btn-ghost btn-sm" data-back-cr="${t.classroomId}">← 返回教室</button>
    <h2 style="font-size:1.2rem">${esc(t.name||t.seat||'--')}</h2>
    ${t.seat?pill(t.seat,'muted'):''}
    ${pill(termUse(t), t.use==='教师终端'?'warn':'muted')}
    ${pill(t.online?'在线':'离线',tone(t.online?'on':'offline'))}
    ${isBlank?pill('未部署','muted'):''}
  </div>

  <div class="detail-grid">
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
    </div>
    <div class="card">
      <div class="card-header">硬件信息</div>
      ${(()=>{
        return '';
      })()}
      ${defRow('处理器', t.hw?.cpu||'--')}
      ${defRow('显卡', t.hw?.gpu||'--')}
      ${defRow('内存', t.hw?.mem||'--')}
      ${defRow('硬盘', (t.hw?.diskModel||'--')+' ('+esc(t.hw?.diskSn||'--')+')')}
    </div>
    <div class="card">
      <div class="card-header">运行状态</div>
      <div style="display:flex;flex-direction:column;gap:6px;font-size:.88rem">
        <div style="display:flex;align-items:baseline;gap:6px"><span style="color:${(met.cpu||0)>80?'var(--c-err)':(met.cpu||0)>60?'var(--c-warn)':'var(--c-ok)'}">CPU ${met.cpu||0}%</span><span style="font-size:.75rem;padding:1px 5px;border-radius:3px;background:${(met.cpuTemp||0)>=80?'rgba(239,68,68,.15)':(met.cpuTemp||0)>=65?'rgba(245,158,11,.15)':'rgba(34,197,94,.08)'};color:${(met.cpuTemp||0)>=80?'var(--c-err)':(met.cpuTemp||0)>=65?'var(--c-warn)':'var(--c-ok)'}">${met.cpuTemp||'--'}°C</span></div>
        <div style="display:flex;align-items:baseline;gap:6px"><span style="color:${(met.gpu||0)>80?'var(--c-err)':(met.gpu||0)>60?'var(--c-warn)':'var(--c-ok)'}">GPU ${met.gpu||0}%</span><span style="font-size:.75rem;padding:1px 5px;border-radius:3px;background:${(met.gpuTemp||0)>=80?'rgba(239,68,68,.15)':(met.gpuTemp||0)>=65?'rgba(245,158,11,.15)':'rgba(34,197,94,.08)'};color:${(met.gpuTemp||0)>=80?'var(--c-err)':(met.gpuTemp||0)>=65?'var(--c-warn)':'var(--c-ok)'}">${met.gpuTemp||'--'}°C</span></div>
        <div style="display:flex;align-items:baseline;gap:6px"><span style="color:${memPct>85?'var(--c-err)':memPct>70?'var(--c-warn)':'var(--c-ok)'}">内存 ${met.memUsed||0}/${met.memTotal||0} GB</span><span style="font-size:.72rem;padding:1px 5px;border-radius:3px;background:var(--c-bg2);color:var(--c-text2)">${memPct}%</span></div>
        <div style="display:flex;align-items:baseline;gap:6px"><span style="color:${diskPct>85?'var(--c-err)':diskPct>70?'var(--c-warn)':'var(--c-ok)'}">磁盘 ${met.diskUsed||0}/${met.diskTotal||0} GB</span><span style="font-size:.72rem;padding:1px 5px;border-radius:3px;background:var(--c-bg2);color:var(--c-text2)">${diskPct}%</span></div>
      </div>
      ${defRow('最近心跳', relTime(t.heartbeat))}
    </div>
  </div>

  ${desktops.length?`<div class="card mt-16">
    <div class="card-header">已部署桌面 · ${desktops.length} 个</div>
    <div style="font-size:.82rem;color:var(--c-text3);margin-bottom:8px">数据来自终端自行上报</div>
    ${desktops.map(d=>{
      const isDefault = d.id===bios?.defaultBootId;
      const isPhysical = d.physicalDeploy;
      const inBoot = bios?.bootEntries?.includes(d.id);
      return `<div style="padding:10px 12px;border-bottom:1px solid var(--c-border);display:grid;grid-template-columns:1fr auto;gap:8px;align-items:start">
        <div>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <span style="font-weight:600">${esc(d.name)}</span>
            <span style="font-size:.82rem;color:var(--c-text3)">${esc(d.os||'')}</span>
            ${isDefault?pill('默认启动','info'):''}
            ${isPhysical?pill('物理部署','warn'):''}
            ${!inBoot&&!isPhysical?pill('隐藏','muted'):''}
          </div>
          <div style="display:flex;gap:12px;flex-wrap:wrap;font-size:.82rem;color:var(--c-text3);margin-top:4px">
            ${d.restoreMode?`<span>还原模式：${esc(d.restoreMode)}</span>`:''}
            ${d.dataDisk?`<span style="color:var(--c-info)">数据盘：${esc(d.dataDisk)}</span>`:''}
            ${isPhysical?'<span>仅本机安装，服务器无此桌面</span>':''}
          </div>
        </div>
        <div style="font-size:.78rem;color:var(--c-text3);text-align:right">
          ${d.createdAt?`创建 ${fmtTime(d.createdAt)}<br>`:''}
          ${d.editedAt?`更新 ${fmtTime(d.editedAt)}`:''}
        </div>
      </div>`;
    }).join('')}
  </div>`:''}

  ${item?`<div class="card mt-16">
    <div class="card-header">当前任务 ${pill(taskStateLabel[item.state]||item.state,tone(item.state))}</div>
    ${defRow('任务',tk?.label||'--')} ${defRow('状态',taskStateLabel[item.state]||item.state)}
    ${item.note?defRow('备注',item.note):''} ${item.failReason?defRow('失败原因',item.failReason):''}
  </div>`:''}
  ${alerts.length?`<div class="mt-16 section-head"><h3>告警</h3></div>${alerts.map(a=>alertHtml(a,false)).join('')}`:''}
  `;
}


function assetsPage(){
  const state=s(); const campus=getCampus(state,view.campusId); const server=serverFor(state,view.campusId);
  const crIds = state.classrooms.filter(c=>c.campusId===view.campusId).map(c=>c.id);
  const crsWithDesktops = state.classrooms.filter(c=>crIds.includes(c.id)&&(c.desktopCatalog||[]).length>0);

  const totalDesktops = crsWithDesktops.reduce((n,c)=>(c.desktopCatalog||[]).length+n,0);
  const totalSnaps = crsWithDesktops.reduce((n,c)=>(c.snapshotTree||[]).length+n,0);
  const totalImages = crsWithDesktops.reduce((n,c)=>(c.imageStore||[]).length+n,0);
  const totalDisks = crsWithDesktops.reduce((n,c)=>(c.desktopCatalog||[]).filter(d=>d.dataDisk).length+n,0);

  /* fake file size from id */
  function fSize(id){ let h=0;for(let i=0;i<id.length;i++) h=((h<<5)-h+id.charCodeAt(i))|0; return (Math.abs(h%40)+8)+'.'+(Math.abs(h>>8)%10)+' GB'; }
  /* estimate total storage */
  const estSnaps = crsWithDesktops.flatMap(c=>(c.snapshotTree||[]));
  const estImages = crsWithDesktops.flatMap(c=>(c.imageStore||[]));
  const totalStorageGB = [...estSnaps,...estImages].reduce((sum,item)=>{
    let h=0;for(let i=0;i<item.id.length;i++) h=((h<<5)-h+item.id.charCodeAt(i))|0;
    return sum+(Math.abs(h%40)+8)+((Math.abs(h>>8)%10)/10);
  },0);

  function snapChain(snTree, snapId){
    const chain=[];
    let cur=snTree.find(sn=>sn.id===snapId);
    while(cur){ chain.unshift(cur); cur=snTree.find(sn=>sn.id===cur.parentId); }
    return chain;
  }
  function termsUsingDesktop(crId, desktopId){
    return termsInCr(state,crId).filter(t=>(t.desktops||[]).some(d=>d.id===desktopId));
  }

  /* Build full snapshot tree for a classroom */
  function buildCrTree(c){
    const imgs=c.imageStore||[]; const snTree=c.snapshotTree||[];
    const roots=snTree.filter(sn=>!sn.parentId);
    function children(pid){ return snTree.filter(sn=>sn.parentId===pid); }
    function renderNode(sn,depth){
      const indent=depth*20;
      const prefix=depth>0?'└─ ':'';
      return `<div style="margin-left:${indent}px;padding:2px 0;font-size:.78rem;display:flex;align-items:center;gap:4px;flex-wrap:wrap">
        <span style="color:var(--c-text3);font-family:monospace">${prefix}</span>
        <span style="background:var(--c-bg2);padding:1px 4px;border-radius:2px">[快照] ${esc(sn.name)}</span>
        <span class="mono" style="color:var(--c-text3)">${esc(sn.name.replace(/\s+/g,'_'))}.qcow2</span>
        <span style="color:var(--c-text3)">${fSize(sn.id)}</span>
        <span style="color:var(--c-text3)">${fmtTime(sn.createdAt)}</span>
      </div>${children(sn.id).map(k=>renderNode(k,depth+1)).join('')}`;
    }
    let html='';
    for(const img of imgs){
      const imgRoots=roots.filter(sn=>sn.imageId===img.id);
      html+=`<div style="padding:2px 0;font-size:.78rem;display:flex;align-items:center;gap:4px;flex-wrap:wrap">
        <span style="background:var(--c-info);color:#fff;padding:1px 4px;border-radius:2px;font-size:.72rem">[镜像]</span>
        <span style="font-weight:600">${esc(img.name)}</span>
        <span class="mono" style="color:var(--c-text3)">${esc(img.name.replace(/\s+/g,'_'))}.vhd</span>
        <span style="color:var(--c-text3)">${fSize(img.id)}</span>
        <span style="color:var(--c-text3)">${fmtTime(img.importedAt)}</span>
      </div>`;
      for(const r of imgRoots) html+=renderNode(r,1);
    }
    return html;
  }

  return `
  <div class="section-sub">${esc(campus?.name||'')} — 桌面资产总览（只读，桌面由终端侧管理）</div>

  <div class="metric-grid" style="margin-bottom:20px">
    <div class="metric-card"><div class="mc-label">桌面总数</div><div class="mc-value">${totalDesktops}</div>
      <div class="mc-sub">分布在 ${crsWithDesktops.length} 个教室</div></div>
    <div class="metric-card"><div class="mc-label">镜像</div><div class="mc-value">${totalImages}</div>
      <div class="mc-sub">基础操作系统镜像</div></div>
    <div class="metric-card"><div class="mc-label">快照</div><div class="mc-value">${totalSnaps}</div>
      <div class="mc-sub">快照文件链构成桌面版本</div></div>
    <div class="metric-card"><div class="mc-label">估算存储</div><div class="mc-value">${totalStorageGB.toFixed(0)} GB</div>
      <div class="mc-sub">服务器存储占 ${server?server.storage+'%':'--'}</div></div>
    <div class="metric-card"><div class="mc-label">数据盘</div><div class="mc-value">${totalDisks}</div>
      <div class="mc-sub">VHD 用户数据盘</div></div>
  </div>

  ${crsWithDesktops.length ? crsWithDesktops.map(c=>{
    const catalog = c.desktopCatalog || [];
    const crTermCount = termsInCr(state,c.id).length;
    return `
    <div class="section mb-16">
      <div class="section-head" style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        <h3 class="clickable" data-nav-cr="${c.id}" style="cursor:pointer">${esc(c.name)}</h3>
        <span style="font-size:.82rem;color:var(--c-text3)">
          ${catalog.length} 桌面 · ${(c.snapshotTree||[]).length} 快照 · ${crTermCount} 终端
        </span>
      </div>
      ${catalog.map(d=>{
        const chain=snapChain(c.snapshotTree||[], d.snapshotId);
        const img=chain.length?(c.imageStore||[]).find(im=>im.id===chain[0].imageId):null;
        const tUsing=termsUsingDesktop(c.id, d.id);
        return `
      <div class="asset-card mb-8" style="margin-left:8px;padding:10px 16px;border:1px solid var(--c-border);border-radius:6px">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span style="font-weight:600">${esc(d.name)}</span>
          <span style="font-size:.82rem;color:var(--c-text3)">${esc(d.os||'')}</span>
        </div>
        <div style="font-size:.82rem;color:var(--c-text3);margin-top:4px">
          ${d.dataDisk?`<span style="color:var(--c-info)">${esc(d.dataDisk)}</span> · `:''}${tUsing.length} 台终端在用 · 创建于 ${fmtTime(d.createdAt)} · 更新于 ${fmtTime(d.editedAt)}
        </div>
        <div style="margin-top:6px;margin-left:4px">${(()=>{
          let h='';
          if(img) h+=`<div style="padding:1px 0;font-size:.78rem;display:flex;align-items:center;gap:4px"><span style="background:var(--c-info);color:#fff;padding:0 4px;border-radius:2px;font-size:.72rem">[镜像]</span><span>${esc(img.name)}</span><span class="mono" style="color:var(--c-text3)">${esc(img.name.replace(/\\s+/g,'_'))}.vhd</span><span style="color:var(--c-text3)">${fSize(img.id)}</span></div>`;
          chain.forEach((sn,i)=>{ h+=`<div style="margin-left:${(i+1)*16}px;padding:1px 0;font-size:.78rem;display:flex;align-items:center;gap:4px"><span style="color:var(--c-text3);font-family:monospace">└─</span><span style="background:var(--c-bg2);padding:0 4px;border-radius:2px">[快照] ${esc(sn.name)}</span><span class="mono" style="color:var(--c-text3)">${esc(sn.name.replace(/\\s+/g,'_'))}.qcow2</span><span style="color:var(--c-text3)">${fSize(sn.id)}</span></div>`; });
          return h;
        })()}</div>
      </div>`;}).join('')}
      <details style="margin-left:8px;margin-top:8px">
        <summary style="font-size:.82rem;color:var(--c-text2);cursor:pointer;font-weight:600">完整快照依赖树</summary>
        <div style="margin-top:4px;padding:8px 12px;border:1px solid var(--c-border);border-radius:4px;background:var(--c-bg2)">${buildCrTree(c)}</div>
      </details>
    </div>
  `}).join('') : empty('当前校区无桌面资产','需从终端侧上传桌面后可见')}
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

  return `
  <div class="section-sub">${esc(campus?.name||'')} — ${campusAlerts.length} 条活跃告警</div>
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:12px">
    <div style="display:flex;gap:16px;font-size:.88rem">
      ${high?`<span style="color:var(--c-err);font-weight:600">高 ${high}</span>`:''}
      ${medium?`<span style="color:var(--c-warn);font-weight:600">中 ${medium}</span>`:''}
      ${low?`<span style="color:var(--c-text3)">低 ${low}</span>`:''}
    </div>
    <div style="display:flex;gap:6px">
      <button class="btn btn-sm${sortMode==='time'?' btn-primary':' btn-ghost'}" data-alert-sort="time">按时间 ${sortMode==='time'?arrow:''}</button>
      <button class="btn btn-sm${sortMode==='severity'?' btn-primary':' btn-ghost'}" data-alert-sort="severity">按严重度 ${sortMode==='severity'?arrow:''}</button>
    </div>
  </div>
  ${sorted.length ? sorted.map(a=>alertHtml(a,true)).join('') : empty('当前无活跃告警')}
  `;
}


function settingsPage(){
  const state=s(); const server=serverFor(state,view.campusId); const campus=getCampus(state,view.campusId);
  const stats=campusStats(state,view.campusId);
  const sr = view.settingsResult || {};
  const allCampuses = state.campuses || [];
  return `
  <div class="section">
    <div class="section-head"><h3>授权管理</h3></div>
    <div class="card" style="max-width:640px">
      <div style="font-size:.85rem;color:var(--c-text2);margin-bottom:12px">
        导入或更新产品授权文件（License），授权文件决定可管理的最大终端数量。导入后全域自动生效。
      </div>
      ${defRow('可授权终端总数', String(server?.license||0))}
      ${defRow('已授权终端数', String(stats.terminals))}
      ${defRow('授权状态', (stats.terminals<=(server?.license||0))?pill('正常','ok'):pill('超限','err'), {raw:true})}
      <div style="margin-top:8px">${meter('授权使用率',pct(stats.terminals,server?.license||1),(stats.terminals/(server?.license||1))>0.9?'err':'ok')}</div>
      ${sr.license?`<div style="color:var(--c-ok);font-size:.85rem;margin:8px 0">✓ 授权已更新为 ${sr.license}</div>`:''}
      <div style="margin-top:12px">
        <button class="btn btn-secondary btn-sm" data-settings-action="import-license">导入授权文件</button>
      </div>
    </div>
  </div>
  <div class="section">
    <div class="section-head"><h3>服务器 IP 变更</h3></div>
    <div class="card" style="max-width:600px">
      <div style="font-size:.85rem;color:var(--c-text2);margin-bottom:12px">
        <strong>变更流程：</strong>
        <ol style="margin:8px 0;padding-left:20px;font-size:.85rem">
          <li>在此页面输入新服务器地址，系统向所有<strong>在线终端</strong>推送地址变更通知</li>
          <li>在线终端自动更新本地服务器配置</li>
          <li>物理修改服务器 IP / 重新签发 SSL 证书</li>
          <li><strong>离线终端</strong>需工程师到现场通过终端"网络与服务器"页面手动修改</li>
        </ol>
      </div>
      <div class="prep-field"><label>当前地址</label><span class="mono">${esc(server?.address||'--')}</span></div>
      <div class="prep-field"><label>新地址</label><input type="text" data-server-new-addr placeholder="输入新服务器 IP" value="${esc(view.newServerAddr||'')}"></div>
      ${sr.serverIp?`<div style="color:var(--c-ok);font-size:.85rem;margin:8px 0">✓ 已变更服务器地址，已通知 ${sr.serverIpCount} 台在线终端</div>`:''}
      <button class="btn btn-secondary btn-sm" data-settings-action="server-ip"${!view.newServerAddr?' disabled':''}>通知在线终端并变更</button>
    </div>
  </div>
  <div class="section">
    <div class="section-head"><h3>校区与账号管理</h3></div>
    ${allCampuses.map(cp=>{
      const cpStats = campusStats(state,cp.id);
      return `<div class="card mb-16" style="max-width:640px">
        <div class="card-header">${esc(cp.name)}</div>
        ${defRow('校区 ID', cp.id, {mono:true})}
        <div style="margin-top:10px;font-size:.85rem;font-weight:600;color:var(--c-text2)">管理员账号</div>
        <table class="data-table" style="font-size:.85rem;box-shadow:none;margin-top:4px">
          <thead><tr><th>用户名</th><th>角色</th><th>状态</th></tr></thead>
          <tbody>
            <tr><td>${esc(cp.id.replace(/-/g,'_')+'_admin')}</td><td>校区管理员</td><td>${pill('启用','ok')}</td></tr>
          </tbody>
        </table>
      </div>`;
    }).join('')}
    <div class="card" style="max-width:640px">
      <div class="card-header">全局管理员</div>
      <table class="data-table" style="font-size:.85rem;box-shadow:none">
        <thead><tr><th>用户名</th><th>角色</th><th>管辖范围</th></tr></thead>
        <tbody>
          <tr><td>admin</td><td>系统管理员</td><td>全平台</td></tr>
        </tbody>
      </table>
    </div>
  </div>
  `;
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
    el.addEventListener('click',()=>nav('classrooms',{classroomId:el.dataset.navCr,terminalId:null,tab:'overview',platAction:null,platActionResult:null,platSelectedTerms:[]}));
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
      view.platActionResult=null; view.distSrcId=null; view.distDtIds=[]; view.distMode=null; view.broadcastCrs=[];
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
      try{
        if(act==='shutdown'){
          const r=await client.send('plat-shutdown',{classroomId:crId,terminalIds:selIds});
          view.platActionResult={done:true,count:r.count};
        } else if(act==='restart'){
          const r=await client.send('plat-restart',{classroomId:crId,terminalIds:selIds});
          view.platActionResult={done:true,count:r.count};
        } else if(act==='distribute'){
          const dtIds=view.distDtIds||[];
          const targetIds=selIds.filter(id=>id!==view.distSrcId);
          /* Start progress simulation on grid */
          const progress = targetIds.map(id=>({id,state:'queued',pct:0}));
          view.platActionResult={running:true,progress,dtCount:dtIds.length};
          render(s());
          /* Simulate progressive deployment */
          let tickIdx=0;
          const tickInterval=setInterval(()=>{
            const queued=progress.filter(p=>p.state==='queued');
            const running=progress.filter(p=>p.state==='running');
            /* advance running items */
            running.forEach(p=>{
              p.pct=Math.min(100,p.pct+20+Math.random()*15);
              if(p.pct>=100){ p.state=Math.random()>0.92?'failed':'completed'; p.pct=100; }
            });
            /* start up to 3 queued items per tick */
            queued.slice(0,3).forEach(p=>{p.state='running';p.pct=5+Math.random()*15;});
            tickIdx++;
            const allDone=progress.every(p=>p.state==='completed'||p.state==='failed');
            if(allDone||tickIdx>50){
              clearInterval(tickInterval);
              const completed=progress.filter(p=>p.state==='completed').length;
              const failed=progress.filter(p=>p.state==='failed').length;
              /* Actually send server request to apply changes */
              client.send('plat-distribute',{classroomId:crId,sourceTerminalId:view.distSrcId,desktopIds:dtIds,targetTerminalIds:targetIds}).catch(()=>{});
              view.platActionResult={done:true,count:completed,failed,dtCount:dtIds.length,progress};
            }
            render(s());
          },800);
        } else if(act==='ip-mod'){
          const ipBase=root.querySelector('[data-ip-base]')?.value||'';
          const ipStart=Number(root.querySelector('[data-ip-start]')?.value||20);
          const r=await client.send('plat-ip-mod',{classroomId:crId,newIpBase:ipBase,startOctet:ipStart,terminalIds:selIds});
          view.platActionResult={done:true,count:r.count};
        } else if(act==='remote-test'){
          const r=await client.send('plat-remote-test',{classroomId:crId,terminalIds:selIds});
          view.platActionResult={results:r.results};
        } else if(act==='broadcast-test'){
          const r=await client.send('plat-broadcast-test',{classroomId:crId,classroomIds:view.broadcastCrs||[]});
          view.platActionResult={results:r.results,hasInterference:r.hasInterference};
        } else if(act==='import-list'){
          const target=view.importTarget||'_new';
          const tgtCrId = target==='_new' ? null : target;
          const r=await client.send('plat-import-terminal-list',{classroomId:tgtCrId,campusId:view.campusId,crName:view.importCrName,crRemark:view.importCrRemark});
          view.importResult={done:true,count:r.count||0};
        }
      }catch(e){console.error(e);}
      render(s());
    });
  });

  /* ── Distribute source/desktop selectors ── */
  const distSrcEl=root.querySelector('[data-dist-src]');
  if(distSrcEl){
    distSrcEl.addEventListener('change',()=>{
      view.distSrcId=distSrcEl.value||null;
      view.distDtIds=[]; // reset desktop selection when source changes
      render(s());
    });
  }
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

  /* ── IP base input ── */
  const ipBaseEl=root.querySelector('[data-ip-base]');
  if(ipBaseEl){ ipBaseEl.addEventListener('input',()=>{view.newIpBase=ipBaseEl.value; render(s());}); }
  const ipStartEl=root.querySelector('[data-ip-start]');
  if(ipStartEl){ ipStartEl.addEventListener('input',()=>{view.newIpStart=Number(ipStartEl.value); render(s());}); }
  const ipGwEl=root.querySelector('[data-ip-gw]');
  if(ipGwEl){ ipGwEl.addEventListener('input',()=>{view.newIpGw=ipGwEl.value;}); }

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

  /* ── Settings page actions ── */
  root.querySelectorAll('[data-settings-action]').forEach(el=>{
    el.addEventListener('click',async()=>{
      const act=el.dataset.settingsAction;
      if(!view.settingsResult) view.settingsResult={};
      try{
        if(act==='import-license'){
          const r=await client.send('plat-import-license',{campusId:view.campusId});
          view.settingsResult.license=r.newLicense;
        } else if(act==='server-ip'){
          const addr=view.newServerAddr||root.querySelector('[data-server-new-addr]')?.value||'';
          if(!addr) return;
          const r=await client.send('plat-server-ip-change',{campusId:view.campusId,newAddress:addr});
          view.settingsResult.serverIp=true;
          view.settingsResult.serverIpCount=r.count;
        } else if(act==='import-list'){
          await client.send('plat-import-terminal-list',{campusId:view.campusId});
          view.settingsResult.importList=true;
        }
      }catch(e){console.error(e);}
      render(s());
    });
  });

  /* ── Server new address input ── */
  const srvAddrEl=root.querySelector('[data-server-new-addr]');
  if(srvAddrEl){
    srvAddrEl.addEventListener('input',()=>{
      view.newServerAddr=srvAddrEl.value;
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

  /* ── Import panel toggle ── */
  root.querySelectorAll('[data-toggle-import]').forEach(el=>{
    el.addEventListener('click',()=>{
      view.showImportPanel=!view.showImportPanel;
      view.platActionResult=null;
      render(s());
    });
  });

  /* ── Import target selector ── */
  const impTargetEl=root.querySelector('[data-import-target]');
  if(impTargetEl){
    impTargetEl.addEventListener('change',()=>{
      view.importTarget=impTargetEl.value;
      render(s());
    });
  }

  /* ── Import terminal list inputs ── */
  const impNameEl=root.querySelector('[data-import-cr-name]');
  if(impNameEl){ impNameEl.addEventListener('input',()=>{view.importCrName=impNameEl.value;}); }
  const impBuildingEl=root.querySelector('[data-import-cr-building]');
  if(impBuildingEl){ impBuildingEl.addEventListener('input',()=>{view.importCrBuilding=impBuildingEl.value;}); }
  const impRemarkEl=root.querySelector('[data-import-cr-remark]');
  if(impRemarkEl){ impRemarkEl.addEventListener('input',()=>{view.importCrRemark=impRemarkEl.value;}); }
}
