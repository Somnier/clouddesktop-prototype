import { createStateClient } from '/shared/state-client.js';
import { getClassroom, getTerm, termsInCr, taskForCr, crRuntime, alertsInCr, termLabel, termSeat, termIp, termUse, stageLabel } from '/shared/model.js';
import { esc, fmtTime, relTime, pct, tone, pill, chip, defRow, meter, empty, syncLabel, phaseLabel } from '/shared/ui.js';

const root = document.getElementById('app');
const client = createStateClient(render);
client.connect();

function s(){ return client.get(); }
function demo(){ return s().demo; }
function cr(){ return getClassroom(s(), demo().focusClassroomId); }
function mt(){ return getTerm(s(), demo().motherId); }
function snapName(snapshotId){ const sn=(cr()?.snapshotTree||[]).find(s=>s.id===snapshotId); return sn?sn.name:null; }
async function act(a,p={}){ try{await client.send(a,p);}catch(e){console.warn(e.message);} }

let dragSrcId = null;

function bindTableSort(){
  root.querySelectorAll('.data-table th[data-sort]').forEach(th=>{
    th.addEventListener('click',()=>{
      const table=th.closest('table'); if(!table) return;
      const idx=[...th.parentElement.children].indexOf(th);
      const tbody=table.querySelector('tbody'); if(!tbody) return;
      const rows=[...tbody.querySelectorAll('tr')];
      const cur=th.classList.contains('sort-asc')?'asc':th.classList.contains('sort-desc')?'desc':'none';
      table.querySelectorAll('th[data-sort]').forEach(h=>{h.classList.remove('sort-asc','sort-desc');});
      const next=cur==='none'?'desc':cur==='desc'?'asc':'none';
      if(next!=='none') th.classList.add('sort-'+next);
      if(next==='none'){ rows.sort((a,b)=>Number(a.dataset.origIdx||0)-Number(b.dataset.origIdx||0)); }
      else { rows.sort((a,b)=>{ const va=(a.children[idx]?.textContent||'').trim(); const vb=(b.children[idx]?.textContent||'').trim(); const na=parseFloat(va),nb=parseFloat(vb); const cmp=(!isNaN(na)&&!isNaN(nb))?na-nb:va.localeCompare(vb,'zh'); return next==='asc'?cmp:-cmp; }); }
      rows.forEach((r,i)=>{if(!r.dataset.origIdx)r.dataset.origIdx=String(i);tbody.appendChild(r);});
    });
  });
  root.querySelectorAll('.data-table tbody tr').forEach((r,i)=>{r.dataset.origIdx=String(i);});
}

function showTermConfirm(title,msg,onOk,opts={}){
  const btnClass = opts.danger===false ? 'btn btn-primary' : 'btn btn-danger';
  const ov=document.createElement('div'); ov.className='t-modal-overlay';
  ov.innerHTML=`<div class="t-modal"><div class="t-modal-title">${title}</div><div class="t-modal-msg">${msg}</div><div class="t-modal-actions"><button class="btn btn-ghost" data-tm="cancel">取消</button><button class="${btnClass}" data-tm="ok">确认</button></div></div>`;
  document.body.appendChild(ov);
  ov.querySelector('[data-tm="cancel"]').addEventListener('click',()=>ov.remove());
  ov.querySelector('[data-tm="ok"]').addEventListener('click',()=>{ov.remove();onOk();});
  ov.addEventListener('click',(e)=>{if(e.target===ov)ov.remove();});
}
function showTermAlert(msg){
  const ov=document.createElement('div'); ov.className='t-modal-overlay';
  ov.innerHTML=`<div class="t-modal"><div class="t-modal-msg">${esc(msg)}</div><div class="t-modal-actions"><button class="btn btn-primary" data-tm="ok">确定</button></div></div>`;
  document.body.appendChild(ov);
  ov.querySelector('[data-tm="ok"]').addEventListener('click',()=>ov.remove());
  ov.addEventListener('click',(e)=>{if(e.target===ov)ov.remove();});
}

function showExportDoneDialog(){
  const m=mt();
  const dts=(m?.desktops||[]).filter(d=>d.visibility!=='hidden');
  const dtList=dts.map(d=>`<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:.82rem"><span>${esc(d.name)}</span><span style="color:var(--t-text2)">${d.diskSize||25} GB</span></div>`).join('');
  const totalSize=dts.reduce((s,d)=>s+(d.diskSize||25),0);
  const body=`<div style="margin-bottom:10px;font-size:.82rem;color:var(--t-text2)">以下桌面将导出到指定目录：</div>
${dtList}
<div style="border-top:1px solid var(--t-border);margin-top:8px;padding-top:6px;font-size:.82rem;display:flex;justify-content:space-between"><strong>合计</strong><span>${dts.length} 个桌面 · ${totalSize} GB</span></div>
<div style="margin-top:10px;padding:8px 12px;background:var(--t-panel);border:1px solid var(--t-border);border-radius:4px;font-size:.78rem;font-family:monospace;color:var(--t-accent)">E:\\desktop-export-${new Date().toISOString().slice(0,10)}.cdpkg</div>`;
  showTermConfirm('导出桌面',body,()=>{
    showTermAlert(`已导出 ${dts.length} 个桌面 (共 ${totalSize} GB)`);
  },{danger:false});
}

function showImportDialog(){
  /* Use Electron open dialog if available, otherwise simulate */
  if(window.electronAPI?.isElectron){
    window.electronAPI.showOpenDialog({
      title: '导入桌面',
      defaultPath: 'E:\\CloudDesktop',
      filters: [
        { name: '桌面文件', extensions: ['cdpkg','vhd','img'] },
        { name: '所有文件', extensions: ['*'] }
      ],
      properties: ['openFile']
    }).then(result => {
      if(!result.canceled && result.filePaths?.length){
        showCreateDesktopDialog('导入的桌面');
      }
    });
  } else {
    const defaultDir = 'E:\\CloudDesktop';
    const filters = '.cdpkg / .vhd / .img';
    showTermConfirm('导入桌面','将通过系统"选择文件"对话框选择桌面文件。<br>默认目录：<span style="font-family:monospace;font-size:.85rem;color:var(--t-accent)">'+esc(defaultDir)+'</span><br>支持格式：<span style="font-size:.85rem;color:var(--t-text2)">'+esc(filters)+'</span><br><br>点击确认模拟选择文件。',()=>{
      showCreateDesktopDialog('导入的桌面');
    },{danger:false});
  }
}

function showCreateDesktopDialog(defaultName){
  const ov=document.createElement('div'); ov.className='t-modal-overlay';
  ov.innerHTML=`<div class="t-modal" style="max-width:480px">
    <div class="t-modal-title" style="color:var(--t-text)">导入桌面</div>
    <div class="t-modal-msg">请配置桌面信息：</div>
    <div class="prep-field"><label>桌面名称</label><input type="text" id="cd-name" value="${esc(defaultName)}" placeholder="桌面名称"></div>
    <div class="prep-field"><label>部署方式</label><select id="cd-physical">
      <option value="false">虚拟部署 (VHD)</option>
      <option value="true">物理部署 (独立分区)</option>
    </select></div>
    <div class="prep-field"><label>数据盘</label><select id="cd-disk-sel">
      <option value="">不添加数据盘</option>
      <option value="yes" selected>添加数据盘</option>
    </select></div>
    <div id="cd-disk-detail-row">
      <div class="prep-field"><label>数据盘大小</label><select id="cd-disk-size">
        <option value="20GB">20 GB</option>
        <option value="50GB" selected>50 GB</option>
        <option value="100GB">100 GB</option>
      </select></div>
      <div class="prep-field"><label>数据盘盘符</label><input type="text" id="cd-disk-drive" value="D:" placeholder="D:"></div>
    </div>
    <div class="prep-field"><label>备注</label><input type="text" id="cd-remark" value="" placeholder="可选"></div>
    <div class="t-modal-actions">
      <button class="btn btn-ghost" data-tm="cancel">取消</button>
      <button class="btn btn-primary" data-tm="create">导入桌面</button>
    </div>
  </div>
</div>`;
  document.body.appendChild(ov);
  /* Toggle data disk detail visibility */
  const diskSel=ov.querySelector('#cd-disk-sel');
  const detailRow=ov.querySelector('#cd-disk-detail-row');
  function toggleDetail(){ detailRow.style.display=diskSel.value?'':'none'; }
  toggleDetail();
  diskSel.addEventListener('change',toggleDetail);
  ov.querySelector('[data-tm="cancel"]').addEventListener('click',()=>ov.remove());
  ov.addEventListener('click',(e)=>{if(e.target===ov)ov.remove();});
  ov.querySelector('[data-tm="create"]').addEventListener('click',()=>{
    const name = ov.querySelector('#cd-name')?.value||defaultName;
    const hasDisk = ov.querySelector('#cd-disk-sel')?.value === 'yes';
    const diskSize = hasDisk ? (ov.querySelector('#cd-disk-size')?.value || '') : '';
    const diskDrive = hasDisk ? (ov.querySelector('#cd-disk-drive')?.value||'D:') : '';
    const physical = ov.querySelector('#cd-physical')?.value==='true';
    const remark = ov.querySelector('#cd-remark')?.value||'';
    ov.remove();
    act('create-desktop-from-file',{
      name, os:'Windows 11 23H2', importType:'image',
      dataDiskSize:diskSize, dataDiskDrive:diskDrive,
      physicalDeploy:physical, restoreMode:'还原系统盘，保留数据盘', remark
    });
  });
}

/* ── Local input cache to survive SSE re-renders ── */
const _inputCache = {};
let _lastScreen = null;
let _isRendering = false; /* guard: prevents blur handlers firing during innerHTML replacement */
let _serverCheckTimer = null; /* single timer for server connection check — prevents stacking */

function _triggerServerCheck(){
  if(_serverCheckTimer){ clearTimeout(_serverCheckTimer); _serverCheckTimer = null; }
  act('set-flag',{serverConnStatus:'checking'});
  _serverCheckTimer = setTimeout(()=>{
    _serverCheckTimer = null;
    act('set-flag',{serverConnStatus:'ok'});
  }, 1800);
}

function _cacheAllInputs(){
  root.querySelectorAll('input, textarea, select').forEach(el=>{
    const key = el.id || el.dataset?.rule || el.dataset?.grid || el.name;
    if(!key) return;
    _inputCache[key] = el.value;
  });
}
function _restoreAllInputs(){
  root.querySelectorAll('input, textarea, select').forEach(el=>{
    const key = el.id || el.dataset?.rule || el.dataset?.grid || el.name;
    if(!key || !(key in _inputCache)) return;
    if(el.value !== _inputCache[key]) el.value = _inputCache[key];
  });
}
function _cacheScrollPositions(){
  const positions = {};
  root.querySelectorAll('.page-scroll').forEach((el,i)=>{
    if(el.scrollTop > 0) positions['ps-'+i] = el.scrollTop;
  });
  return positions;
}
function _restoreScrollPositions(positions){
  root.querySelectorAll('.page-scroll').forEach((el,i)=>{
    const key = 'ps-'+i;
    if(positions[key]) el.scrollTop = positions[key];
  });
}

function render(state){
  if(!state) return;
  /* Clear input cache on screen change */
  const curScreen = state.demo?.motherScreen;
  if(_lastScreen !== curScreen){
    Object.keys(_inputCache).forEach(k=>delete _inputCache[k]);
    if(_serverCheckTimer){ clearTimeout(_serverCheckTimer); _serverCheckTimer = null; }
    _lastScreen = curScreen;
  }
  /* Save ALL dirty input values before re-render */
  _cacheAllInputs();
  /* Preserve focused element */
  const ae = document.activeElement;
  let focusSel = null, focusStart = null, focusEnd = null;
  if(ae && ae !== document.body && root.contains(ae)){
    if(ae.id) focusSel = '#' + ae.id;
    else if(ae.dataset?.rule) focusSel = '[data-rule="'+ae.dataset.rule+'"]';
    else if(ae.dataset?.grid) focusSel = '[data-grid="'+ae.dataset.grid+'"]';
    else if(ae.tagName==='INPUT'||ae.tagName==='SELECT'||ae.tagName==='TEXTAREA'){
      if(ae.name) focusSel = '[name="'+ae.name+'"]';
    }
    if(focusSel){ focusStart = ae.selectionStart; focusEnd = ae.selectionEnd; }
  }
  /* Save scroll positions */
  const scrollPos = _cacheScrollPositions();
  _isRendering = true;
  root.innerHTML = shellHtml();
  bindAll();
  /* Restore ALL cached input values */
  _restoreAllInputs();
  /* Restore scroll positions */
  _restoreScrollPositions(scrollPos);
  /* Restore focus */
  if(focusSel){
    const el = root.querySelector(focusSel);
    if(el){
      el.focus();
      if(typeof el.setSelectionRange === 'function' && focusStart != null){
        try { el.setSelectionRange(focusStart, focusEnd); } catch(e){}
      }
    }
  }
  _isRendering = false;
}


function shellHtml(){
  const m=mt(); const c=cr();
  return `<div class="term-shell">
    <div class="term-topbar">
      <div class="brand">云桌面管理系统</div>
      <div class="status">
        <span class="dot ${m?.online?'dot-ok':'dot-err'}"></span><span class="status-label ${m?.online?'sol':'sol-err'}">${m?.online?'在线':'离线'}</span>
        <span class="sep">|</span>
        <span>座位: ${esc(m?.seat||'--')}</span>
        <span class="sep">|</span>
        <span>机器名: ${esc(m?.name||'未命名')}</span>
        <span class="sep">|</span>
        <span>IP: <span class="mono">${m?.ip?esc(m.ip):'未配置'}</span></span>
        <span class="sep">|</span>
        <button class="btn-exit" data-act="exit-to-desktop">⏻ 退出</button>
      </div>
    </div>
    <div class="term-body">${screenContent(demo().motherScreen)}</div>
  </div>`;
}


function screenContent(screen){
  switch(screen){
    case 'home': return homeScreen();
    case 'local-info': return localInfoScreen();
    case 'local-network': return localNetworkScreen();
    case 'local-desktop': return localDesktopScreen();
    case 'takeover': return takeoverScreen();
    case 'workbench': return workbenchScreen();
    /* New 教室维护 flow — 4 steps */
    case 'deploy-prep': return deployPrepScreen();
    case 'deploy-grid': return deployGridScreen();
    case 'deploy-bind': return deployBindScreen();
    case 'deploy-progress': case 'deploy-result': return deployTransferScreen();
    /* Standalone IP / server modification */
    case 'maint-ip': return maintIpScreen();
    case 'maint-progress': case 'maint-result': return taskProgressScreen('maintenance');
    /* Desktop editing */
    case 'desktop-rebooting': return transientScreen('正在重启进入桌面…','系统将在桌面编辑完成后自动返回');
    case 'desktop-editor': return desktopEditorScreen();
    case 'desktop-merging': return transientScreen('正在合并桌面…','请稍候，系统正在合并编辑');
    /* Other */
    case 'export-list': return exportScreen();
    case 'fault-replace': return faultReplaceScreen();
    case 'fault-reset': return faultResetScreen();
    default: return '<div class="section-title">画面: '+esc(screen)+'</div>';
  }
}
function transientScreen(title,sub){
  return '<div class="page"><div style="display:flex;flex-direction:column;align-items:center;justify-content:center;flex:1;text-align:center;padding:40px 20px"><div style="font-size:1.5rem;margin-bottom:12px">'+esc(title)+'</div><div style="color:var(--t-text2);font-size:.95rem">'+esc(sub)+'</div></div></div>';
}


function stepBar(labels, current){
  return `<div class="step-bar">${labels.map((l,i)=>`<div class="step-item${i===current?' active':''}${i<current?' done':''}">${l}</div>`).join('')}</div>`;
}

/* Compute seat label from grid coordinates and rules */
function seatLabel(row, col, rules){
  const start = (rules.startLetter||'A').charCodeAt(0);
  const flow = rules.seatFlow||'col'; // col=列优先(default), row=行优先
  let letter, num;
  if(flow==='col'){ letter=String.fromCharCode(start+col); num=row+1; }
  else { letter=String.fromCharCode(start+row); num=col+1; }
  return letter+String(num).padStart(2,'0');
}


/* ═══════════════════════════════════════════════════
   HOME SCREEN — simplified, big vertical buttons only
   ═══════════════════════════════════════════════════ */
function homeScreen(){
  const m=mt();
  return `<div class="page" style="display:flex;flex-direction:column;align-items:center;justify-content:center">
  <div style="display:flex;flex-direction:column;gap:12px;width:100%;max-width:420px;padding:0 16px">
    <button class="btn btn-primary" style="padding:16px;font-size:1.05rem;justify-content:center" data-act="open-local-info">设置本机</button>
    <button class="btn btn-primary" style="padding:16px;font-size:1.05rem;justify-content:center" data-act="open-local-network">设置服务器</button>
    <button class="btn btn-primary" style="padding:16px;font-size:1.05rem;justify-content:center" data-act="open-local-desktop">管理桌面</button>
    <button class="btn btn-primary" style="padding:16px;font-size:1.05rem;justify-content:center" data-act="open-fault-reset-direct">重置终端</button>
    <button class="btn btn-primary" style="padding:16px;font-size:1.05rem;justify-content:center" data-act="open-fault-replace-direct">替换故障终端</button>
    <button class="btn btn-primary" style="padding:16px;font-size:1.05rem;justify-content:center" data-act="open-takeover">网络同传</button>
  </div>
</div>`;
}


/* ═══════════════════════════════════════════════════
   LOCAL SCREENS — unchanged
   ═══════════════════════════════════════════════════ */
function localInfoScreen(){
  const m=mt(); const c=cr();
  /* For blank classrooms, show all-empty fields (simulate first-time setup) */
  const isBlank = !c || c.stage==='blank';
  return `<div class="page" style="display:flex;flex-direction:column;align-items:center">
  <div style="max-width:520px;width:100%">
  <div class="section-title"><button class="btn btn-ghost" data-act="go-home">←</button> 设置本机</div>
  <div class="card" style="width:100%">
    <div class="prep-field"><label>机器名</label><input type="text" id="li-name" value="${esc(m.name||'')}" placeholder="输入机器名"></div>
    <div class="prep-field"><label>座位号</label><input type="text" id="li-seat" value="${esc(m.seat||'')}" placeholder="A01"></div>
    <div style="border-top:1px solid var(--t-border);margin:16px 0 12px;padding-top:12px">
      <div style="font-size:.82rem;color:var(--t-text3);margin-bottom:8px">网络配置</div>
    </div>
    <div class="prep-field"><label>IP 地址</label><input type="text" id="li-ip" value="${esc(m.ip||'')}" placeholder="10.21.31.20"></div>
    <div class="prep-field"><label>子网掩码</label><input type="text" id="li-mask" value="${esc(m.subnetMask||'')}" placeholder="255.255.255.0"></div>
    <div class="prep-field"><label>网关</label><input type="text" id="li-gw" value="${esc(m.gateway||'')}" placeholder="10.x.x.1"></div>
    <div class="prep-field"><label>DNS</label><input type="text" id="li-dns" value="${esc((m.dns||[]).join(','))}" placeholder="8.8.8.8, 114.114.114.114"></div>
    <div style="display:flex;gap:8px;margin-top:12px">
      <button class="btn btn-primary" data-save="local-info">保存</button>
    </div>
  </div>
  </div>
  </div>`;
}


function localNetworkScreen(){
  const m=mt();
  /* Display addr: prefer unsaved pending value from flags, fall back to persisted */
  const displayAddr = demo().flags?.pendingServerAddr ?? m.serverAddr ?? '';
  const hasAddr = !!displayAddr;
  /* Derive connection status from demo flags.
     When connFlag is null (page just entered, go-home cleared it), treat as "will check"
     to avoid a brief "未连接" flash before the auto-check kicks in. */
  const connFlag = demo().flags?.serverConnStatus;
  const isChecking = connFlag==='checking' || (connFlag==null && hasAddr);
  const connOk = connFlag==='ok';
  const connStatus = isChecking ? 'checking' : !hasAddr ? 'none' : connOk ? 'ok' : 'fail';
  return `<div class="page" style="display:flex;flex-direction:column;align-items:center">
  <div style="max-width:520px;width:100%">
  <div class="section-title"><button class="btn btn-ghost" data-act="go-home">←</button> 设置服务器</div>
  <div class="card" style="width:100%">
    <div class="prep-field"><label>服务器地址</label><input type="text" id="ln-srv" value="${esc(displayAddr)}" placeholder="server.edu.cn"></div>
    <div style="margin-top:12px;padding:10px 14px;background:${connStatus==='ok'?'var(--t-ok-bg)':connStatus==='fail'?'var(--t-err-bg)':'var(--t-panel)'};border:1px solid ${connStatus==='ok'?'var(--t-ok)':connStatus==='fail'?'var(--t-err)':'var(--t-border)'};border-radius:var(--radius)">
      <div style="display:flex;align-items:center;gap:8px">
        ${isChecking?'<span class="conn-spinner"></span>':
        `<span class="dot ${connStatus==='ok'?'dot-ok':connStatus==='fail'?'dot-err':''}"></span>`}
        <span style="font-size:.85rem;color:${connStatus==='ok'?'var(--t-ok)':connStatus==='fail'?'var(--t-err)':isChecking?'var(--t-accent)':'var(--t-text3)'}">${connStatus==='ok'?'已连接服务器':connStatus==='fail'?'无法连接服务器':isChecking?'正在检测连接…':'未配置服务器地址'}</span>
      </div>
      ${connStatus==='fail'?'<div style="font-size:.75rem;color:var(--t-text3);margin-top:4px">请检查地址是否正确或网络是否通畅</div>':''}
    </div>
    <div style="display:flex;gap:8px;margin-top:16px">
      <button class="btn btn-primary" data-save="local-network">保存</button>
    </div>
  </div>
  </div>
  </div>`;
}


function localDesktopScreen(){
  const m=mt(); const c=cr();
  const desktops = (m.desktops||[]).slice().sort((a,b)=>{
    return (a.createdAt||a.editedAt||'').localeCompare(b.createdAt||b.editedAt||'');
  });
  const returnAct = demo()._desktopReturnScreen ? 'desktop-return-flow' : (m.controlState==='mother'?'return-workbench':'go-home');
  const bid = m.bios?.defaultBootId;

  /* disk statistics */
  const diskTotal = m.metrics?.diskTotal || 512;
  const systemUsed = 35;
  const desktopUsed = desktops.reduce((s,d)=>s+(d.diskSize||25),0);
  const diskUsed = desktopUsed + systemUsed;
  const diskFree = Math.max(0, diskTotal - diskUsed);
  const diskPct = Math.round(diskUsed/diskTotal*100);
  const diskColor = diskPct>85?'var(--t-err)':diskPct>70?'var(--t-warn)':'var(--t-accent)';

  /* pie segments: system → desktop total → free (3 categories only) */
  const dtSegments = [];
  dtSegments.push({ name:'系统占用', size:systemUsed, color:'#64748b' });
  dtSegments.push({ name:'桌面占用', size:desktopUsed, color:'#3b82f6' });
  if(diskFree>0) dtSegments.push({ name:'剩余空间', size:diskFree, color:'#1e293b' });

  /* SVG pie chart */
  const total = dtSegments.reduce((s,seg)=>s+seg.size,0);
  let cumAngle = -90;
  const pieR = 60, pieCx = 70, pieCy = 70;
  const pieSlices = dtSegments.map(seg=>{
    const angle = (seg.size/total)*360;
    const startAngle = cumAngle;
    cumAngle += angle;
    const endAngle = cumAngle;
    const startRad = startAngle*Math.PI/180;
    const endRad = endAngle*Math.PI/180;
    const x1 = pieCx + pieR*Math.cos(startRad);
    const y1 = pieCy + pieR*Math.sin(startRad);
    const x2 = pieCx + pieR*Math.cos(endRad);
    const y2 = pieCy + pieR*Math.sin(endRad);
    const largeArc = angle>180?1:0;
    if(angle>=359.9) return `<circle cx="${pieCx}" cy="${pieCy}" r="${pieR}" fill="${seg.color}"/>`;
    return `<path d="M${pieCx},${pieCy} L${x1},${y1} A${pieR},${pieR} 0 ${largeArc},1 ${x2},${y2} Z" fill="${seg.color}"/>`;
  }).join('');
  /* legend removed — color dots merged into stats panel below */

  /* has any unsync */
  const hasUnsync = desktops.some(d=>!(d.uploaded||d.syncStatus==='synced'));

  return `<div class="page" style="display:flex;flex-direction:column;align-items:center">
  <div style="width:100%;max-width:920px;display:flex;flex-direction:column;flex:1;min-height:0">
  <div class="section-title" style="display:flex;align-items:center;justify-content:space-between">
    <div><button class="btn btn-ghost" data-act="${returnAct}">←</button> 桌面管理</div>
  </div>

  <div class="page-scroll" style="padding-bottom:12px">

  ${hasUnsync?`<div class="dt-unsync-banner">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
    <span>有 ${desktops.filter(d=>!(d.uploaded||d.syncStatus==='synced')).length} 个桌面尚未同步到服务器，请尽快上传以避免数据丢失</span>
  </div>`:''}

  <!-- Two-column: card grid + import (left) + pie chart (right) -->
  <div style="display:flex;gap:20px;align-items:flex-start">
    <!-- Desktop cards (left, two-column waterfall) -->
    <div style="flex:1;min-width:0">
      <!-- Import bar (spans 2 columns) -->
      <div class="dt-card dt-add-card" data-desktop-action="import" style="margin-bottom:12px;cursor:pointer">
        <div style="display:flex;align-items:center;justify-content:center;gap:8px;padding:10px 0">
          <span style="font-size:1.5rem;color:var(--t-text3)">+</span>
          <span style="font-size:.88rem;color:var(--t-text3)">导入桌面</span>
        </div>
      </div>
      <div class="dt-grid">
        ${desktops.map(d=>{
        const isDefault = d.id===bid;
        const isHidden = d.visibility==='hidden';
        const uploaded = d.uploaded || d.syncStatus==='synced';
        const isPhysical = d.physicalDeploy;
        const dtSize = d.diskSize || 25;
        return `
        <div class="dt-card ${isDefault?'selected':''} ${!uploaded?'dt-unsync':''}" data-dt-id="${d.id}" style="position:relative">
          <div class="dt-card-fill"></div>
          <div style="position:relative;z-index:1;display:flex;flex-direction:column;flex:1">
            <div class="dt-name">${esc(d.name)}</div>
            <div class="dt-meta" style="display:flex;align-items:baseline;gap:6px;margin-top:6px">
              <span>${esc(d.baseImageName||d.os)}</span>
              <span style="display:inline-block;width:1px;height:12px;background:var(--t-border);margin:0 2px"></span>
              <span style="font-weight:600;font-size:.88rem;letter-spacing:.02em">${dtSize} GB</span>
            </div>
            <div style="display:flex;gap:4px;flex-wrap:wrap;align-items:center;margin-top:6px">
              ${isPhysical?'<span class="pill info pill-sm" style="opacity:.65">物理部署</span>':''}
              ${!uploaded?'<span class="pill err pill-sm" style="opacity:.65">未同步</span>':''}
              ${isHidden?'<span class="pill muted pill-sm" style="opacity:.65">已隐藏</span>':''}
              ${isDefault?'<span class="pill info pill-sm" style="opacity:.55;font-size:.7rem">默认启动</span>':''}
            </div>
            <div style="display:flex;gap:6px;margin-top:auto;padding-top:10px;flex-wrap:wrap;align-items:center">
              <button class="btn btn-sm btn-primary" data-dt-edit="${d.id}">编辑桌面</button>
              ${!uploaded?`<button class="dt-sync-btn" data-dt-upload="${d.id}">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                同步到服务器
              </button>`:''}
              <button class="btn btn-sm btn-ghost dt-overflow-btn" data-dt-overflow="${d.id}" style="margin-left:auto;padding:2px 8px">···</button>
            </div>
          </div>
          <div class="dt-overflow-menu" data-dt-menu="${d.id}">
            <button data-dt-copy="${d.id}">复制桌面</button>
            <button data-dt-delete="${d.id}" style="color:var(--t-err)">删除桌面</button>
            <div class="dt-menu-divider"></div>
            ${!isDefault?`<button data-dt-default="${d.id}">设为默认启动</button>`:''}
            <button data-dt-visibility="${d.id}">${isHidden?'取消隐藏':'隐藏桌面'}</button>
          </div>
        </div>`;
        }).join('')}
      </div>
      ${!desktops.length ? empty('暂无本机桌面','请点击上方 + 导入桌面') : ''}
    </div>

    <!-- Pie chart + stats (right sidebar) -->
    <div class="card" style="flex-shrink:0;width:220px;padding:16px;display:flex;flex-direction:column;align-items:center;gap:12px">
      <svg width="140" height="140" viewBox="0 0 140 140">${pieSlices}
        <circle cx="${pieCx}" cy="${pieCy}" r="32" fill="var(--t-bg)"/>
        <text x="${pieCx}" y="${pieCy+4}" text-anchor="middle" fill="${diskColor}" font-size="16" font-weight="700">${diskPct}%</text>
      </svg>
      <div style="width:100%;display:flex;flex-direction:column;gap:5px;font-size:.78rem;color:var(--t-text2)">
        <div style="display:flex;justify-content:space-between;align-items:center"><span>总容量</span><strong style="color:var(--t-text)">${diskTotal} GB</strong></div>
        <div style="display:flex;justify-content:space-between;align-items:center"><span style="display:flex;align-items:center;gap:5px"><span style="width:8px;height:8px;border-radius:2px;background:#64748b;flex-shrink:0"></span>系统占用</span><span>${systemUsed} GB</span></div>
        <div style="display:flex;justify-content:space-between;align-items:center"><span style="display:flex;align-items:center;gap:5px"><span style="width:8px;height:8px;border-radius:2px;background:#3b82f6;flex-shrink:0"></span>桌面占用</span><span>${desktopUsed} GB</span></div>
        <div style="display:flex;justify-content:space-between;align-items:center"><span style="display:flex;align-items:center;gap:5px"><span style="width:8px;height:8px;border-radius:2px;background:#1e293b;flex-shrink:0"></span>剩余空间</span><span style="color:${diskColor}">${diskFree} GB</span></div>
      </div>
    </div>
  </div>
  </div>

  <div class="dt-export-bar">
    <button class="btn btn-ghost dt-export-btn" data-desktop-action="export-pkg">导出桌面</button>
  </div>
  </div>
  </div>`;
}


/* ═══════════════════════════════════════════════════
   TAKEOVER — unchanged
   ═══════════════════════════════════════════════════ */
function takeoverScreen(){
  /* Redirect to unified workbench — takeover is now integrated */
  return workbenchScreen();
}


/* ═══════════════════════════════════════════════════
   UNIFIED WORKBENCH — Two-tab layout
   Tab 1: 设置布局 (takeover + grid layout)
   Tab 2: 教室维护 (deploy, IP mod, desktop, export)
   ═══════════════════════════════════════════════════ */
function workbenchScreen(){
  const m=mt(); const c=cr(); const st=s();
  const terms=termsInCr(st, c.id); const rt=crRuntime(st, c.id); const tk=taskForCr(st, c.id);
  const isBlank = c.stage==='blank'||c.stage==='bound';
  const d=demo().deployDraft||{};
  /* Default tab: if not takeover yet → layout, else → maint */
  const defaultTab = m.controlState!=='mother' ? 'layout' : 'maint';
  const wbTab = demo().flags?.wbTab || defaultTab;
  const opsMode = demo().flags?.opsMode || 'deploy';
  const isRunning = tk && tk.phase!=='completed';

  /* Display name: use takeover name if blank, otherwise classroom name */
  const displayName = isBlank ? (demo().takeover?.classroomName || c.name || '未命名教室') : c.name;
  const isTakenOver = m.controlState==='mother';

  /* If a task is actively running (not completed), force maint tab;
     Otherwise use wbTab, but guard: if maint tab would be disabled, fall back to layout */
  const maintDisabled = (isBlank && !isTakenOver) || isRunning;
  const activeTab = (tk && tk.phase!=='completed') ? 'maint' : (wbTab==='maint' && maintDisabled ? 'layout' : wbTab);

  return `<div class="page">
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
    <div class="section-title" style="margin:0">
      <button class="btn btn-ghost" data-act="go-home">←</button>
      ${esc(displayName)}
      ${c.stage!=='blank'?'<span class="pill ok pill-sm" style="margin-left:6px">已设置布局</span>':'<span class="pill muted pill-sm" style="margin-left:6px">未设置布局</span>'}
      <span style="font-size:.78rem;color:var(--t-text2);margin-left:8px">${rt.online}/${rt.total} 在线</span>
    </div>
  </div>
  <div style="display:flex;gap:6px;margin-bottom:14px;align-items:center">
    <button class="btn btn-secondary" style="${activeTab==='layout'?'border-color:var(--t-accent);color:var(--t-accent);font-weight:600':''}" ${isRunning?'disabled':''} data-act="wb-tab-layout">设置布局</button>
    <button class="btn btn-secondary" style="${activeTab==='maint'?'border-color:var(--t-accent);color:var(--t-accent);font-weight:600':''}" ${(isBlank&&!isTakenOver)||isRunning?'disabled':''} data-act="wb-tab-maint">教室维护</button>
    <span style="width:1px;height:20px;background:var(--t-border);margin:0 8px"></span>
    <button class="btn btn-danger" ${isRunning?'disabled':''} data-act="end-management">结束管理</button>
  </div>
  <div style="min-height:24px;margin-bottom:8px;font-size:.72rem;color:var(--t-text3)">${isBlank&&!isTakenOver?'请先完成布局后使用教室维护':''}</div>
  ${activeTab==='maint' ? wbMaintContent(terms, rt, tk, c, m, d, opsMode, isRunning) : wbLayoutContent(terms, rt, c, m, d)}
</div>`;
}

/* ── Tab 1: 设置布局 ── */
function wbLayoutContent(terms, rt, c, m, d){
  const isBlank = c.stage==='blank'||c.stage==='bound';
  const isTakenOver = m.controlState==='mother';
  const r=d.rules||{};
  const grid=d.grid||{rows:c.rows||7,cols:c.cols||6,blocks:[]};
  const activeCount = grid.blocks.filter(b=>b.state==='active').length;
  const dir = r.gridDirection || 'tl';

  /* Compute grid preview — only when rules are set */
  const hasRules = !!(r.ipBase && r.namePrefix);
  const prefix = r.namePrefix || '';
  const assignable = grid.blocks.filter(b=>b.state!=='deleted');
  const sortedAssignable = [...assignable].sort((a,b)=>{
    const sa=seatLabel(a.row,a.col,r), sb=seatLabel(b.row,b.col,r);
    return sa.localeCompare(sb);
  });
  let ipNum = r.ipStart || 20;
  const previewMap = {};
  if(hasRules){
    sortedAssignable.forEach(b=>{
      const seat = seatLabel(b.row, b.col, r);
      previewMap[b.idx] = { pos:seat, ip:(r.ipBase)+'.'+ipNum, name:prefix+'-'+seat };
      ipNum++;
    });
  }

  /* Terminal discovery: map online terminals to grid blocks sequentially */
  const onlineTerms = terms.filter(t=>t.id!==m.id&&t.online);
  const discoveredCount = onlineTerms.length;
  const totalTermCount = discoveredCount + 1; /* +1 for mother (self) */
  const scanning = !isTakenOver || (demo().flags?.layoutRescan);
  const hasNewTermsBeyondGrid = totalTermCount > activeCount && scanning;

  /* Map discovered terminals to active blocks for MAC display */
  const activeBlocksSorted = grid.blocks.filter(b=>b.state==='active').sort((a,b)=>{
    const sa=seatLabel(a.row,a.col,r), sb=seatLabel(b.row,b.col,r);
    return sa.localeCompare(sb);
  });
  const termBlockMap = {};
  /* Pin mother terminal to first active block */
  const motherBlockIdx = activeBlocksSorted.length > 0 ? activeBlocksSorted[0].idx : -1;
  if(motherBlockIdx >= 0) termBlockMap[motherBlockIdx] = { ...m, _isSelf: true };
  /* Map discovered terminals to remaining active blocks */
  let mapIdx = 1; /* skip first block (mother) */
  onlineTerms.forEach((t)=>{
    if(mapIdx < activeBlocksSorted.length) termBlockMap[activeBlocksSorted[mapIdx].idx] = t;
    mapIdx++;
  });

  /* Example seat and machine name for preview */
  const exSeat = seatLabel(0, 0, r);
  const exName = prefix ? prefix + '-' + exSeat : '(前缀)-(座位号)';

  /* Dirty detection: compare current layout state with snapshot taken on tab entry */
  const layoutSnap = demo().flags?.layoutSnapshot;
  const layoutDirty = !layoutSnap || layoutSnap !== JSON.stringify({
    rows:grid.rows,cols:grid.cols,blocks:activeCount,
    ipBase:r.ipBase||'',namePrefix:r.namePrefix||'',
    ipStart:r.ipStart||20,startLetter:r.startLetter||'A',
    gridDirection:r.gridDirection||'tl',termCount:discoveredCount});

  return `<div style="display:grid;grid-template-columns:304px 1fr;gap:16px;flex:1;min-height:0;overflow:hidden">
    <div style="display:flex;flex-direction:column;min-height:0;overflow:hidden">
      <div class="page-scroll" style="display:flex;flex-direction:column;gap:10px;flex:1;min-height:0">
      <div class="card">
        <div class="card-header">❶ 教室信息</div>
        ${scanning?`<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;padding:8px 10px;background:var(--t-accent-bg);border:1px solid rgba(88,166,255,.3);border-radius:4px">
          <span class="conn-spinner"></span>
          <span style="font-size:.82rem;color:var(--t-accent)">正在扫描… 已发现 ${discoveredCount} 台终端</span>
        </div>`:''}
        <div class="prep-field"><label>教室名称</label><input type="text" id="tk-name" value="${esc(demo().takeover?.classroomName||c.name||'')}" placeholder="输入教室名称"></div>
        ${isTakenOver?`<div style="font-size:.75rem;color:var(--t-ok);margin-top:4px">已完成布局 · ${rt.online}/${rt.total} 在线</div>`:''}
      </div>
      <div class="card">
        <div class="card-header">❷ 网络配置</div>
        <div class="prep-field"><label>服务器地址</label><input type="text" id="layout-srv" value="${esc(m.serverAddr||'')}" placeholder="server.edu.cn"></div>
        <div class="prep-field"><label>IP 前缀</label><input type="text" data-rule="ipBase" value="${esc(r.ipBase||'')}" placeholder="10.21.31"></div>
        <div class="prep-field"><label>IP 起始编号</label><input type="number" data-rule="ipStart" value="${r.ipStart||20}" min="1" max="254"></div>
        <div class="prep-field"><label>子网掩码</label><input type="text" id="layout-mask" value="${esc(m.subnetMask||'')}" placeholder="255.255.255.0"></div>
        <div class="prep-field"><label>网关</label><input type="text" id="layout-gw" value="${esc(m.gateway||'')}" placeholder="10.x.x.1"></div>
        <div class="prep-field"><label>DNS</label><input type="text" id="layout-dns" value="${esc((m.dns||[]).join(','))}" placeholder="8.8.8.8, 114.114.114.114"></div>
      </div>
      <div class="card">
        <div class="card-header">❸ 机器名 / 座位号</div>
        <div class="prep-field"><label>机器名前缀</label><input type="text" data-rule="namePrefix" value="${esc(r.namePrefix||'')}" placeholder="D301"></div>
        <div class="prep-field"><label>座位号起始字母</label><input type="text" data-rule="startLetter" value="${esc(r.startLetter||'A')}" maxlength="1" style="width:50px;text-transform:uppercase"></div>
        <div style="padding:6px 10px;background:var(--t-panel);border:1px solid var(--t-border);border-radius:4px;font-size:.78rem;color:var(--t-text);margin-top:4px;font-family:monospace">
          机器名预览: <strong>${esc(exName)}</strong> · 座位号预览: <strong>${esc(exSeat)}</strong>
        </div>
        <div style="font-size:.7rem;color:var(--t-text3);margin-top:2px">机器名 = 前缀 + "-" + 座位号，座位号 = 起始字母 + 序号</div>
      </div>
      </div>
      <div style="padding-top:10px;border-top:1px solid var(--t-border);flex-shrink:0;display:flex;align-items:center;gap:10px">
        <button class="btn btn-primary" ${layoutDirty&&activeCount>0&&totalTermCount>0&&hasRules&&!hasNewTermsBeyondGrid?'':'disabled'} data-act="complete-layout">完成布局</button>
        <span style="font-size:.75rem;color:var(--t-text3)">${hasNewTermsBeyondGrid?'终端数超出容量，请调整布局':!hasRules?'请先设置IP前缀和机器名前缀':activeCount<=0?'请先设置网格布局':totalTermCount<=0?'等待终端上线…':!layoutDirty?'布局未变更':''}</span>
      </div>
    </div>
    <div style="display:flex;flex-direction:column;min-height:0;overflow:hidden">
      <div style="padding:10px 14px;background:var(--t-panel);border:1px solid var(--t-border);border-radius:6px;margin-bottom:8px;font-size:.82rem;flex-shrink:0">
        <div style="font-size:.78rem;color:var(--t-text2);font-weight:600;margin-bottom:6px">布局设置</div>
        <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:6px">
          <div class="prep-field" style="padding:0;font-size:.78rem;gap:6px"><label style="width:auto;flex-shrink:0;color:var(--t-text2)">每列</label><input type="number" data-grid="rows" value="${grid.rows}" min="1" max="20" style="width:56px"></div>
          <div class="prep-field" style="padding:0;font-size:.78rem;gap:6px"><label style="width:auto;flex-shrink:0;color:var(--t-text2)">列数</label><input type="number" data-grid="cols" value="${grid.cols}" min="1" max="15" style="width:56px"></div>
          <span style="font-size:.75rem;color:var(--t-text2)">${pill('可用 '+activeCount,'ok')}${hasNewTermsBeyondGrid?` <span style="color:var(--t-err);font-weight:600">终端 ${totalTermCount} 超出容量 ${activeCount}</span>`:''}</span>
        </div>
        <div style="display:flex;gap:4px;margin-bottom:6px;align-items:center">
          <span style="font-size:.78rem;color:var(--t-text2);margin-right:4px">布局起点</span>
          ${[['tl','↘ 左上'],['tr','↙ 右上'],['bl','↗ 左下'],['br','↖ 右下']].map(([v,l])=>
            `<button class="btn ${dir===v?'btn-primary':'btn-secondary'}" style="padding:3px 8px;font-size:.72rem;justify-content:center" data-rule-dir="${v}">${l}</button>`
          ).join('')}
        </div>
        <div style="color:var(--t-text3);font-size:.72rem">局域网内终端上线后自动出现在网格中</div>
      </div>
      <div class="page-scroll" style="flex:1;min-height:0">
        ${renderSeatGridLayout(grid, r, dir, previewMap, termBlockMap, isTakenOver, hasRules)}
      </div>
    </div>
  </div>`;
}

/* ── Tab 2: 教室维护 (integrated ops) ── */
function wbMaintContent(terms, rt, tk, c, m, d, opsMode, isRunning){
  const r=d.rules||{};
  const grid=d.grid||{rows:c.rows||7,cols:c.cols||6,blocks:[]};
  const dir = r.gridDirection || 'tl';
  const bindings = d.bindings||{};
  /* Deploy uses deployScope (set of block indices); maint-ip uses maintDraft.scope (terminal IDs) */
  const deployScope = demo().flags?.deployScope||{};
  const deploySelectedCount = Object.keys(deployScope).filter(idx=>deployScope[idx]&&bindings[idx]&&bindings[idx].terminalId!==m.id).length;
  const maintIpSelectedCount = (demo().maintDraft?.scope||[]).length;
  const done = tk?.phase==='completed';

  /* State labels for deploy transfer */
  const stateLabels={queued:'排队',transferring:'传输',applying:'写入',rebooting:'重启',completed:'完成',failed:'失败'};

  /* Maint IP draft */
  const md = demo().maintDraft||{};

  /* Per-mode last results */
  const lastDeployResult = demo().flags?.lastDeployResult;
  const lastMaintIpResult = demo().flags?.lastMaintIpResult;
  const lastResult = opsMode==='deploy' ? lastDeployResult : opsMode==='maint-ip' ? lastMaintIpResult : null;
  const viewingLastResult = demo().flags?.viewLastResult;

  /* Build IP change map for maint-ip mode (terminalId → {oldIp, newIp}) */
  const ipChangeMap = {};
  if(opsMode==='maint-ip' || (lastResult && lastMaintIpResult)){
    const ipPreview = md.ipPreview || lastMaintIpResult?._ipPreview || [];
    ipPreview.forEach(pv=>{
      const t = terms.find(tt=>tt.id===pv.terminalId);
      ipChangeMap[pv.terminalId] = { oldIp: t?.ip||'--', newIp: pv.newIp||'--' };
    });
  }

  return `<div style="display:grid;grid-template-columns:304px 1fr;gap:16px;flex:1;min-height:0;overflow:hidden;align-items:stretch">
    <div style="display:flex;flex-direction:column;min-height:0;overflow:hidden">
      <div class="page-scroll" style="display:flex;flex-direction:column;gap:10px;flex:1;min-height:0">
      <div class="card">
        <div class="card-header">功能</div>
        <div style="display:flex;gap:0;border:1px solid var(--t-border);border-radius:var(--radius);overflow:hidden">
          <button class="maint-tab-btn ${opsMode==='deploy'?'active':''}" ${isRunning?'disabled':''} data-act="ops-mode-deploy" style="flex:1">部署桌面</button>
          <button class="maint-tab-btn ${opsMode==='maint-ip'?'active':''}" ${isRunning?'disabled':''} data-act="ops-mode-maint-ip" style="flex:1">修改 IP / 服务器地址</button>
        </div>
      </div>
      ${opsMode==='deploy'?`<div class="card"${isRunning?' style="opacity:.6;pointer-events:none"':''}>
        <div class="card-header">设置部署参数</div>
        <div class="prep-field"><label>部署模式</label><select id="deploy-mode-sel" ${isRunning?'disabled':''}>
          <option value="incremental" ${(d.deployMode||'incremental')==='incremental'?'selected':''}>增量更新</option>
          <option value="full" ${d.deployMode==='full'?'selected':''}>全量部署</option>
        </select></div>
      </div>
      <div class="card"${isRunning?' style="opacity:.6;pointer-events:none"':''}>
        <div class="card-header">上次部署结果</div>
        ${lastDeployResult?`<div style="font-size:.82rem;color:var(--t-ok)">成功 ${lastDeployResult.completed||0} · 失败 ${lastDeployResult.failed||0} / ${lastDeployResult.total||0}</div>
        <button class="btn btn-ghost btn-sm" style="margin-top:6px" ${isRunning?'disabled':''} data-act="toggle-view-last-result">${viewingLastResult?'收起结果':'查看详情'}</button>`
        :`<div style="font-size:.82rem;color:var(--t-text3)">暂无执行结果</div>`}
      </div>`:''}
      ${opsMode==='maint-ip'?`<div class="card">
        <div class="card-header">本次修改内容</div>
        <div class="prep-field"><label>服务器地址</label><input type="text" id="mip-srv" value="${esc(md.newServerAddr||c.serverAddress||m.serverAddr||'')}" placeholder="server.edu.cn"></div>
        <div class="prep-field"><label>新 IP 前缀</label><input type="text" id="mip-base" value="${esc(md.newIpBase||r.ipBase||c.networkBase||'')}" placeholder="10.21.31"></div>
        <div class="prep-field"><label>新 IP 起始编号</label><input type="number" id="mip-start" value="${md.newIpStart||r.ipStart||20}" min="1" max="254"></div>
        <div class="prep-field"><label>子网掩码</label><input type="text" id="mip-mask" value="${esc(md.newSubnetMask||m.subnetMask||'255.255.255.0')}" placeholder="255.255.255.0"></div>
        <div class="prep-field"><label>网关</label><input type="text" id="mip-gw" value="${esc(md.newGateway||m.gateway||c.gateway||'')}" placeholder="10.x.x.1"></div>
        <div class="prep-field"><label>DNS</label><input type="text" id="mip-dns" value="${esc(md.newDns||(m.dns||c.dns||[]).join(','))}" placeholder="8.8.8.8, 114.114.114.114"></div>
        <div style="font-size:.7rem;color:var(--t-text3);margin-top:4px">点击右侧座位卡片选择/取消选择终端，然后执行修改</div>
      </div>
      <div class="card"${isRunning?' style="opacity:.6;pointer-events:none"':''}>
        <div class="card-header">上次执行结果</div>
        ${lastMaintIpResult?`<div style="font-size:.82rem;color:var(--t-ok)">成功 ${lastMaintIpResult.completed||0} · 失败 ${lastMaintIpResult.failed||0} / ${lastMaintIpResult.total||0}</div>
        <button class="btn btn-ghost btn-sm" style="margin-top:6px" ${isRunning?'disabled':''} data-act="toggle-view-last-result">${viewingLastResult?'收起结果':'查看详情'}</button>`
        :`<div style="font-size:.82rem;color:var(--t-text3)">暂无执行结果</div>`}
      </div>`:''}
      </div>
      <div style="padding-top:10px;border-top:1px solid var(--t-border);flex-shrink:0">
        ${opsMode==='deploy'?`<button class="btn btn-primary" ${!isRunning&&deploySelectedCount>=1?'':'disabled'} data-act="start-deployment">开始部署 (${deploySelectedCount} 台)</button>`:''}
        ${opsMode==='maint-ip'?`<button class="btn btn-primary" ${isRunning||maintIpSelectedCount<1?'disabled':''} data-act="start-maint-ip">开始执行 (${maintIpSelectedCount} 台)</button>`:''}
      </div>
    </div>
    <div style="display:flex;flex-direction:column;min-height:0;overflow:hidden">
      ${isRunning?`<div style="padding:10px 14px;background:var(--t-panel);border:1px solid var(--t-border);border-radius:6px;margin-bottom:10px;flex-shrink:0;font-size:.82rem">
        <div style="font-weight:600;color:${done?'var(--t-ok)':'var(--t-accent)'}">${done?'✓ 任务完成':'⏳ 任务执行中 — 功能切换已锁定'}</div>
        <div style="margin-top:4px">成功 ${tk.counts.completed||0} · 失败 ${tk.counts.failed||0} · 排队 ${tk.counts.queued||0} / 共 ${tk.counts.total||0}</div>
      </div>`:`<div style="padding:8px 14px;background:var(--t-panel);border:1px solid var(--t-border);border-radius:6px;margin-bottom:10px;flex-shrink:0;font-size:.78rem;color:var(--t-text2)">
        ${opsMode==='deploy'?'点击下方座位卡片选择/取消选择终端':
          opsMode==='maint-ip'?'点击下方座位卡片选择/取消选择终端':
          '请从左侧选择功能'}
      </div>`}
      <div class="page-scroll" style="flex:1;min-height:0">
        ${isRunning ? renderSeatGridProgress(grid, r, dir, bindings, tk, stateLabels, terms, m, opsMode==='maint-ip'?ipChangeMap:null) :
          viewingLastResult&&lastResult ? renderSeatGridProgress(grid, r, dir, bindings, lastResult._task, stateLabels, terms, m, opsMode==='maint-ip'||lastResult._ipPreview?ipChangeMap:null) :
          opsMode==='maint-ip' ? renderSeatGridMaint(terms, m, c, d, md) :
          renderSeatGridOps(grid, r, dir, bindings, deployScope, terms, m)}
      </div>
      <div style="border-top:1px solid var(--t-border);padding-top:10px;flex-shrink:0">
        <button class="btn btn-ghost dt-export-btn" ${isRunning?'disabled':''} data-act="open-export">
          导出教室终端清单
        </button>
      </div>
    </div>
  </div>`;
}

/* ═══════════════════════════════════════════════════
   Shared seat grid renderers for workbench
   ═══════════════════════════════════════════════════ */
function renderSeatGrid(grid, r, dir, previewMap, terms, mode, blankNoRules){
  const hasRules = !!(r.ipBase && r.namePrefix);
  let html='';
  for(let ri=0;ri<grid.rows;ri++){
    for(let ci=0;ci<grid.cols;ci++){
      const row = (dir==='bl'||dir==='br') ? (grid.rows-1-ri) : ri;
      const col = (dir==='tr'||dir==='br') ? (grid.cols-1-ci) : ci;
      const b=grid.blocks.find(b2=>b2.row===row&&b2.col===col);
      if(!b){ html+='<div class="gb gb-empty"></div>'; continue; }
      const seat = hasRules ? seatLabel(row, col, r) : '#'+(b.idx+1);
      if(b.state==='deleted'){
        html+=`<div class="gb gb-deleted" data-block-idx="${b.idx}" title="已删除 (${seat})"><span class="gb-x">×</span></div>`;
        continue;
      }
      const pv=previewMap[b.idx];
      const isDisabled = b.state==='disabled';
      const matchTerm = hasRules ? terms.find(t=>t.seat===seat) : null;
      const wasDeployed = matchTerm && matchTerm.ip;
      html+=`<div class="gb ${isDisabled?'gb-disabled':wasDeployed?'gb-bound':'gb-active'}" data-block-idx="${b.idx}" title="${seat} · ${isDisabled?'已禁用':wasDeployed?'已设置布局':'可用'}">
        <div class="gb-seat">${esc(seat)}</div>
        ${pv?`<div class="gb-ip">${esc(pv.ip)}</div>`:''}
        ${isDisabled?`<div class="gb-tag">禁用</div>`:wasDeployed?`<div class="gb-tag" style="color:var(--t-ok)">已设置布局</div>`:''}
      </div>`;
    }
  }
  return `<div class="deploy-grid" style="display:grid;grid-template-columns:repeat(${grid.cols},1fr);gap:6px">${html}</div>`;
}

/* Layout-specific grid renderer: tri-state blocks (active/disabled/deleted), conditional MAC display */
function renderSeatGridLayout(grid, r, dir, previewMap, termBlockMap, isTakenOver, hasRules){
  let html='';
  for(let ri=0;ri<grid.rows;ri++){
    for(let ci=0;ci<grid.cols;ci++){
      const row = (dir==='bl'||dir==='br') ? (grid.rows-1-ri) : ri;
      const col = (dir==='tr'||dir==='br') ? (grid.cols-1-ci) : ci;
      const b=grid.blocks.find(b2=>b2.row===row&&b2.col===col);
      if(!b){ html+='<div class="gb gb-empty"></div>'; continue; }
      const seat = hasRules ? seatLabel(row, col, r) : '#'+(b.idx+1);
      if(b.state==='deleted'){
        html+=`<div class="gb gb-deleted" data-block-idx="${b.idx}" title="已删除 — 点击恢复"><span class="gb-x">×</span></div>`;
        continue;
      }
      const isDisabled = b.state==='disabled';
      const pv=previewMap[b.idx];
      const term=termBlockMap[b.idx];
      if(isDisabled){
        html+=`<div class="gb gb-disabled" data-block-idx="${b.idx}" title="${seat} · 已禁用 — 点击恢复">
          <div class="gb-seat">${esc(seat)}</div><div class="gb-tag">禁用</div></div>`;
        continue;
      }
      if(term){
        const isSelf = term._isSelf;
        /* When rules are set, show rule preview (seat+IP) and hide MAC.
           When no rules, show MAC (terminal raw identity). */
        html+=`<div class="gb ${isSelf?'':''}${isTakenOver?'gb-bound':'gb-active'}" data-block-idx="${b.idx}" title="${seat}${isSelf?' (本机)':''}" style="${isSelf?'border-color:var(--t-warn);background:var(--t-warn-bg)':''}">
          <div class="gb-seat">${esc(seat)}</div>
          ${isSelf?'<div class="gb-tag" style="color:var(--t-warn)">本机</div>':''}
          ${!isSelf&&!hasRules?`<div class="gb-mac">${esc(term.mac)}</div>`:''}
          ${!isSelf&&pv?`<div class="gb-ip">${esc(pv.ip)}</div>`:''}
        </div>`;
      } else {
        /* Empty cell — show seat preview if rules set, otherwise just a bare block */
        html+=`<div class="gb gb-waiting" data-block-idx="${b.idx}" title="${seat} · 空闲">
          <div class="gb-seat" style="color:var(--t-text3)">${esc(seat)}</div>
          ${hasRules&&pv?`<div class="gb-ip" style="opacity:.3">${esc(pv.ip)}</div>`:''}
        </div>`;
      }
    }
  }
  return `<div class="deploy-grid" style="display:grid;grid-template-columns:repeat(${grid.cols},1fr);gap:6px">${html}</div>`;
}

function renderSeatGridOps(grid, r, dir, bindings, deployScope, terms, m){
  let html='';
  for(let ri=0;ri<grid.rows;ri++){
    for(let ci=0;ci<grid.cols;ci++){
      const row = (dir==='bl'||dir==='br') ? (grid.rows-1-ri) : ri;
      const col = (dir==='tr'||dir==='br') ? (grid.cols-1-ci) : ci;
      const b=grid.blocks.find(b2=>b2.row===row&&b2.col===col);
      if(!b){ html+='<div class="gb gb-empty"></div>'; continue; }
      const seat = seatLabel(row, col, r);
      if(b.state==='deleted'){ html+='<div class="gb gb-empty"></div>'; continue; }
      if(b.state==='disabled'){
        html+=`<div class="gb gb-disabled"><div class="gb-seat">${esc(seat)}</div><div class="gb-tag">禁用</div></div>`;
        continue;
      }
      /* Mother block — show as non-selectable 本机 */
      const binding=bindings[b.idx];
      if(binding && m && binding.terminalId===m.id){
        html+=`<div class="gb" style="opacity:.5;border-color:var(--t-warn)">
          <div class="gb-seat">${esc(seat)}</div>
          <div class="gb-tag" style="color:var(--t-warn)">本机</div>
        </div>`;
        continue;
      }
      if(!binding){
        /* No terminal bound — empty slot */
        html+=`<div class="gb gb-waiting"><div class="gb-seat" style="opacity:.3">${esc(seat)}</div></div>`;
        continue;
      }
      /* Check terminal online status */
      const t = terms.find(tt=>tt.id===binding.terminalId);
      const offline = t && !t.online;
      if(offline){
        html+=`<div class="gb gb-disabled" style="opacity:.6">
          <div class="gb-seat">${esc(seat)}</div>
          <div class="gb-tag" style="color:var(--t-err)">离线</div>
        </div>`;
        continue;
      }
      /* Selectable block — use deployScope for selection state */
      const isSelected = !!deployScope[b.idx];
      html+=`<div class="gb ${isSelected?'gb-bound':'gb-waiting'}" data-deploy-toggle-bind="${b.idx}" style="cursor:pointer">
        <div class="gb-seat">${esc(seat)}</div>
        ${isSelected?'<div class="gb-tag" style="color:var(--t-ok)">已选</div>':'<div class="gb-tag" style="color:var(--t-text3)">未选</div>'}
      </div>`;
    }
  }
  return `<div class="deploy-grid" style="display:grid;grid-template-columns:repeat(${grid.cols},1fr);gap:6px">${html}</div>`;
}

function renderSeatGridProgress(grid, r, dir, bindings, tk, stateLabels, terms, m, ipChangeMap){
  /* Both maintenance and deploy tasks now use grid-block-based layout */
  /* ipChangeMap: optional map of terminalId → {oldIp, newIp} for maint-ip results */
  let html='';
  /* Build a set of terminal IDs that are in this task's scope */
  const taskTermIds = new Set((tk?.items||[]).map(i=>i.terminalId));
  for(let ri=0;ri<grid.rows;ri++){
    for(let ci=0;ci<grid.cols;ci++){
      const row = (dir==='bl'||dir==='br') ? (grid.rows-1-ri) : ri;
      const col = (dir==='tr'||dir==='br') ? (grid.cols-1-ci) : ci;
      const b=grid.blocks.find(b2=>b2.row===row&&b2.col===col);
      if(!b){ html+='<div class="gb gb-empty"></div>'; continue; }
      const seat = seatLabel(row, col, r);
      if(b.state==='deleted'){ html+='<div class="gb gb-empty"></div>'; continue; }
      if(b.state==='disabled'){
        html+=`<div class="gb gb-disabled"><div class="gb-seat">${esc(seat)}</div><div class="gb-tag">禁用</div></div>`;
        continue;
      }
      const binding=bindings[b.idx];
      /* Mother block */
      if(binding && m && binding.terminalId===m.id){
        html+=`<div class="gb" style="opacity:.5;border-color:var(--t-warn)">
          <div class="gb-seat">${esc(seat)}</div>
          <div class="gb-tag" style="color:var(--t-warn)">本机</div>
        </div>`;
        continue;
      }
      if(!binding){
        html+=`<div class="gb gb-waiting"><div class="gb-seat">${esc(seat)}</div><div class="gb-tag" style="color:var(--t-text3)">--</div></div>`;
        continue;
      }
      /* If this terminal was NOT included in the task scope, show as non-participant */
      if(!taskTermIds.has(binding.terminalId)){
        html+=`<div class="gb gb-waiting" style="opacity:.5">
          <div class="gb-seat">${esc(seat)}</div>
          <div class="gb-tag" style="color:var(--t-text3)">未传输</div>
        </div>`;
        continue;
      }
      const item = tk?.items?.find(i=>i.terminalId===binding.terminalId);
      const itemState = item?.state||'queued';
      const pctVal = itemState==='completed'?100:itemState==='failed'?0:itemState==='transferring'?35:itemState==='applying'?70:itemState==='rebooting'?90:5;
      const fillColor = itemState==='completed'?'var(--t-ok)':itemState==='failed'?'var(--t-err)':'var(--t-accent)';
      /* IP change info for maint-ip results */
      const ipInfo = ipChangeMap?.[binding.terminalId];
      const showIpChange = ipInfo && (itemState==='completed'||itemState==='failed');
      html+=`<div class="gb gb-transfer" style="position:relative;overflow:hidden">
        <div style="position:absolute;top:0;left:0;bottom:0;width:${pctVal}%;background:${fillColor};opacity:.2;transition:width .5s ease"></div>
        <div style="position:relative;z-index:1">
          <div class="gb-seat">${esc(seat)}</div>
          <div class="gb-status" style="color:${itemState==='completed'?'var(--t-ok)':itemState==='failed'?'var(--t-err)':'var(--t-text2)'}">${stateLabels[itemState]||itemState}</div>
          ${showIpChange?`<div style="font-size:.6rem;color:var(--t-text2);margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(ipInfo.oldIp)} → ${esc(ipInfo.newIp)}">${esc(ipInfo.oldIp)}→${esc(ipInfo.newIp)}</div>`:''}
        </div>
      </div>`;
    }
  }
  return `<div class="deploy-grid" style="display:grid;grid-template-columns:repeat(${grid.cols},1fr);gap:6px">${html}</div>`;
}

function renderSeatGridMaint(terms, m, c, d, md){
  /* Use grid blocks + bindings if available (handles blank classroom with no seats assigned yet) */
  const grid = d.grid||{rows:c.rows||7,cols:c.cols||6,blocks:[]};
  const r = d.rules||{};
  const dir = r.gridDirection || 'tl';
  const bindings = d.bindings||{};
  const scope = md.scope || [];
  const ipPreview = md.ipPreview || [];

  if(grid.blocks.length>0 && Object.keys(bindings).length>0){
    let html='';
    for(let ri=0;ri<grid.rows;ri++){
      for(let ci=0;ci<grid.cols;ci++){
        const row = (dir==='bl'||dir==='br') ? (grid.rows-1-ri) : ri;
        const col = (dir==='tr'||dir==='br') ? (grid.cols-1-ci) : ci;
        const b=grid.blocks.find(b2=>b2.row===row&&b2.col===col);
        if(!b){ html+='<div class="gb gb-empty"></div>'; continue; }
        const seat = seatLabel(row, col, r);
        if(b.state==='deleted'){ html+='<div class="gb gb-empty"></div>'; continue; }
        if(b.state==='disabled'){
          html+=`<div class="gb gb-disabled"><div class="gb-seat">${esc(seat)}</div><div class="gb-tag">禁用</div></div>`;
          continue;
        }
        const binding=bindings[b.idx];
        /* Mother block */
        if(binding && binding.terminalId===m.id){
          html+=`<div class="gb" style="opacity:.5;border-color:var(--t-warn)">
            <div class="gb-seat">${esc(seat)}</div>
            <div class="gb-tag" style="color:var(--t-warn)">本机</div>
          </div>`;
          continue;
        }
        if(!binding){
          html+=`<div class="gb gb-empty"><div class="gb-seat" style="opacity:.3">${esc(seat)}</div></div>`;
          continue;
        }
        const t = terms.find(tt=>tt.id===binding.terminalId);
        const checked = scope.includes(binding.terminalId);
        const offline = t && !t.online;
        if(offline){
          html+=`<div class="gb gb-disabled" style="opacity:.6">
            <div class="gb-seat">${esc(seat)}</div>
            <div class="gb-tag" style="color:var(--t-err)">离线</div>
          </div>`;
          continue;
        }
        html+=`<div class="gb ${checked?'gb-bound':'gb-waiting'}" style="cursor:pointer" data-maint-toggle="${binding.terminalId}">
          <div class="gb-seat">${esc(seat)}</div>
          ${checked?'<div class="gb-tag" style="color:var(--t-ok)">已选</div>':'<div class="gb-tag" style="color:var(--t-text3)">未选</div>'}
        </div>`;
      }
    }
    return `<div class="deploy-grid" style="display:grid;grid-template-columns:repeat(${grid.cols},1fr);gap:6px">${html}</div>`;
  }

  /* Fallback: terminal-based layout for classrooms with pre-assigned seats */
  const crCols = c.cols||6;
  const sorted = [...terms].filter(t=>t.seat).sort((a,b)=>(a.seat||'').localeCompare(b.seat||''));
  return `<div style="display:grid;grid-template-columns:repeat(${Math.min(crCols,8)},1fr);gap:6px">
    ${sorted.map(t=>{
      const isMother = t.id===m.id;
      if(isMother) return `<div class="gb" style="opacity:.5;border-color:var(--t-warn)">
        <div class="gb-seat">${esc(t.seat)}</div>
        <div class="gb-tag" style="color:var(--t-warn)">本机</div>
      </div>`;
      if(!t.online) return `<div class="gb gb-disabled" style="opacity:.6">
        <div class="gb-seat">${esc(t.seat)}</div>
        <div class="gb-tag" style="color:var(--t-err)">离线</div>
      </div>`;
      const checked=scope.includes(t.id);
      return `<div class="gb ${checked?'gb-bound':'gb-waiting'}" style="cursor:pointer" data-maint-toggle="${t.id}">
        <div class="gb-seat">${esc(t.seat)}</div>
        ${checked?'<div class="gb-tag" style="color:var(--t-ok)">已选</div>':'<div class="gb-tag" style="color:var(--t-text3)">未选</div>'}
      </div>`;
    }).join('')}
  </div>`;
}


/* ═══════════════════════════════════════════════════
   NEW DEPLOY FLOW: STEP 1 — 母机准备 (read-only)
   ═══════════════════════════════════════════════════ */
function deployPrepScreen(){
  const m=mt(); const c=cr(); const d=demo().deployDraft;
  const desktops = m.desktops||[];
  const labels=['母机准备','占位与规则','终端分配','部署传输'];

  const checks = [];
  if(!m.serverAddr) checks.push('服务器地址未配置 — 请到首页"设置服务器"设置');
  if(!m.ip) checks.push('本机IP未配置 — 请到首页"设置本机"设置');
  if(!desktops.length) checks.push('本机无桌面 — 请到首页"管理桌面"添加');
  if(!m.gateway) checks.push('网关未配置 — 请到首页"设置本机"设置');
  const ready = checks.length === 0;

  return `<div class="page">
  ${stepBar(labels, 0)}
  <div class="page-scroll">
  <div class="section-title">母机信息确认</div>
  <div class="section-sub">以下信息将同步到所有子终端。如需修改请返回首页对应功能。</div>

  <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-bottom:16px">
    <div class="card">
      <div class="card-header">终端信息</div>
      ${defRow('机器名', m.name||'未命名')}
      ${defRow('座位号', m.seat||'未分配')}
    </div>
    <div class="card">
      <div class="card-header">网络配置</div>
      ${defRow('服务器地址', m.serverAddr||'未配置', {mono:true})}
      ${defRow('本机 IP', m.ip||'未配置', {mono:true})}
      ${defRow('子网掩码', m.subnetMask||'255.255.255.0', {mono:true})}
      ${defRow('网关', m.gateway||'未配置', {mono:true})}
      ${defRow('DNS', (m.dns||[]).join(',')||'未配置', {mono:true})}
    </div>
    <div class="card">
      <div class="card-header">桌面</div>
      ${desktops.length ? desktops.map(dt=>{
        const isDef = dt.id===(m.bios?.defaultBootId);
        return `<div style="font-size:.82rem;padding:4px 0;display:flex;justify-content:space-between;align-items:center">
          <span>${esc(dt.name)}${isDef?' '+pill('默认启动','info'):''}</span>
        </div>
        <div style="font-size:.75rem;color:var(--t-text3);margin-bottom:6px">还原: ${esc(dt.restoreMode||'还原系统盘，保留数据盘')}</div>`;
      }).join('') : `<div style="font-size:.82rem;color:var(--t-text3);padding:8px 0">暂无桌面</div>`}
    </div>
  </div>

  <div class="card mb-16" style="max-width:480px">
    <div class="card-header">部署模式</div>
    <div class="prep-field">
      <label>部署方式</label>
      <select id="deploy-mode-sel">
        <option value="incremental" ${(d.deployMode||'incremental')==='incremental'?'selected':''}>增量更新 (仅同步差异，更快)</option>
        <option value="full" ${d.deployMode==='full'?'selected':''}>全量部署 (完整覆盖，更可靠)</option>
      </select>
    </div>
  </div>

  ${!ready?`<div class="card mb-16" style="border-color:var(--t-err)">
    <div class="card-header" style="color:var(--t-err)">配置不完整，无法继续</div>
    ${checks.map(c2=>`<div style="font-size:.85rem;color:var(--t-err);padding:2px 0">· ${esc(c2)}</div>`).join('')}
  </div>`:''}
  </div>

  <div style="display:flex;gap:10px;margin-top:16px">
    <button class="btn btn-ghost" data-act="return-workbench">返回工作台</button>
    <button class="btn btn-primary" ${ready?'':'disabled'} data-deploy-step="1">下一步：占位与规则</button>
  </div>
</div>`;
}


/* ═══════════════════════════════════════════════════
   NEW DEPLOY FLOW: STEP 2 — 占位块与规则
   ═══════════════════════════════════════════════════ */
function deployGridScreen(){
  const m=mt(); const c=cr(); const d=demo().deployDraft;
  const r=d.rules;
  const grid=d.grid||{rows:7,cols:6,blocks:[]};
  const labels=['母机准备','占位与规则','终端分配','部署传输'];

  const prefix = r.namePrefix || c.id.split('-')[1].toUpperCase();

  /* Compute assignment preview: active + disabled blocks get sequential IPs,
     sorted by seat label order so IP assignment follows numbering */
  const assignable = grid.blocks.filter(b=>b.state!=='deleted');
  const sortedAssignable = [...assignable].sort((a,b)=>{
    const sa=seatLabel(a.row,a.col,r), sb=seatLabel(b.row,b.col,r);
    return sa.localeCompare(sb);
  });
  let ipNum = r.ipStart || 20;
  const previewMap = {};
  sortedAssignable.forEach(b=>{
    const seat = seatLabel(b.row, b.col, r);
    previewMap[b.idx] = {
      pos: seat,
      ip: (r.ipBase||c.networkBase)+'.'+ipNum,
      name: prefix+'-'+seat
    };
    ipNum++;
  });

  const activeCount = grid.blocks.filter(b=>b.state==='active').length;
  const disabledCount = grid.blocks.filter(b=>b.state==='disabled').length;
  const deletedCount = grid.blocks.filter(b=>b.state==='deleted').length;

  /* Example seat and machine name for preview */
  const exSeat = seatLabel(0, 0, r);
  const exName = prefix + '-' + exSeat;

  const dir = r.gridDirection || 'tl';
  const flow = r.seatFlow || 'col';

  return `<div class="page">
  ${stepBar(labels, 1)}
  <div class="page-scroll">
  <div style="display:grid;grid-template-columns:300px 1fr;gap:20px;align-items:start">
    <div>
      <div class="section-title" style="font-size:1rem">批量规则</div>
      <div class="prep-group mb-8">
        <h4>IP 分配</h4>
        <div class="prep-field"><label>IP 前缀</label><input type="text" data-rule="ipBase" value="${esc(r.ipBase||'')}" placeholder="10.21.31"></div>
        <div class="prep-field"><label>IP 起始编号</label><input type="number" data-rule="ipStart" value="${r.ipStart||20}" min="1" max="254"></div>
      </div>
      <div class="prep-group mb-8">
        <h4>网格布局</h4>
        <div class="prep-field"><label>每列座位数</label><input type="number" data-grid="rows" value="${grid.rows}" min="1" max="20"></div>
        <div class="prep-field"><label>列数</label><input type="number" data-grid="cols" value="${grid.cols}" min="1" max="15"></div>
        <div style="font-size:.75rem;color:var(--t-text2);margin-top:4px">共 ${grid.blocks.length} 位 · ${pill('可用 '+activeCount,'ok')} ${disabledCount?pill('禁用 '+disabledCount,'muted'):''} ${deletedCount?pill('删除 '+deletedCount,'err'):''}</div>
      </div>
      <div class="prep-group mb-8">
        <h4>机器名 / 座位号</h4>
        <div class="prep-field"><label>机器名前缀</label><input type="text" data-rule="namePrefix" value="${esc(r.namePrefix||'')}" placeholder="D301"></div>
        <div class="prep-field"><label>座位起始字母</label><input type="text" data-rule="startLetter" value="${esc(r.startLetter||'A')}" maxlength="1" style="width:50px;text-transform:uppercase"></div>
        <div style="padding:6px 10px;background:var(--t-panel);border:1px solid var(--t-border);border-radius:4px;font-size:.78rem;color:var(--t-text);margin-top:4px;font-family:monospace">
          机器名预览: <strong>${esc(exName)}</strong> · 座位号: <strong>${esc(exSeat)}</strong>
        </div>
        <div style="font-size:.7rem;color:var(--t-text3);margin-top:2px">机器名 = 机器名前缀 + "-" + 座位号，座位号 = 字母 + 序号</div>
      </div>
      <div style="font-size:.75rem;color:var(--t-ok)">点击右侧网格块可切换状态</div>
      <div style="font-size:.7rem;color:var(--t-text3);margin-top:4px">● 点击切换 可用 ↔ 禁用</div>
    </div>

    <div>
      <div style="display:flex;align-items:center;gap:16px;margin-bottom:12px;flex-wrap:wrap">
        <div class="section-title" style="font-size:1rem;margin:0">教室座位网格</div>
        <span style="font-size:.72rem;color:var(--t-text2)">
          ${pill('可用','ok')} ${pill('禁用','muted')} <span style="color:var(--t-text3)">×=已删除</span>
        </span>
      </div>
      <div style="display:flex;gap:16px;align-items:center;margin-bottom:12px;padding:10px 14px;background:var(--t-panel);border:1px solid var(--t-border);border-radius:6px;flex-wrap:wrap">
        <div style="font-size:.78rem;color:var(--t-text2)">起点位置</div>
        <div style="display:flex;gap:4px">
          ${[['tl','↘ 左上'],['tr','↙ 右上'],['bl','↗ 左下'],['br','↖ 右下']].map(([v,l])=>
            `<button class="btn ${dir===v?'btn-primary':'btn-ghost'}" style="justify-content:center" data-rule-dir="${v}">${l}</button>`
          ).join('')}
        </div>
        <div style="font-size:.78rem;color:var(--t-text2);margin-left:8px">编号排布</div>
        <div style="display:flex;gap:4px">
          <button class="btn ${flow==='col'?'btn-primary':'btn-ghost'}" data-rule-flow="col">列优先 (纵向)</button>
          <button class="btn ${flow==='row'?'btn-primary':'btn-ghost'}" data-rule-flow="row">行优先 (横向)</button>
        </div>
      </div>
      <div class="deploy-grid" style="display:grid;grid-template-columns:repeat(${grid.cols},1fr);gap:6px">
        ${(()=>{
          let html='';
          for(let ri=0;ri<grid.rows;ri++){
            for(let ci=0;ci<grid.cols;ci++){
              const row = (dir==='bl'||dir==='br') ? (grid.rows-1-ri) : ri;
              const col = (dir==='tr'||dir==='br') ? (grid.cols-1-ci) : ci;
              const b=grid.blocks.find(b2=>b2.row===row&&b2.col===col);
              if(!b){ html+='<div class="gb gb-empty"></div>'; continue; }
              const seat = seatLabel(row, col, r);
              if(b.state==='deleted'){
                html+=`<div class="gb gb-deleted" data-block-idx="${b.idx}" title="已删除 (${seat})，点击恢复"><span class="gb-x">×</span></div>`;
                continue;
              }
              const pv=previewMap[b.idx];
              const isDisabled = b.state==='disabled';
              html+=`<div class="gb ${isDisabled?'gb-disabled':'gb-active'}" data-block-idx="${b.idx}" title="${seat} · ${isDisabled?'已禁用':'可用'} · 点击切换">
                <div class="gb-seat">${esc(seat)}</div>
                ${pv?`<div class="gb-ip">${esc(pv.ip)}</div>`:''}
                ${isDisabled?`<div class="gb-tag">禁用</div>`:''}
              </div>`;
            }
          }
          return html;
        })()}
      </div>
    </div>
  </div>
  </div>
  <div style="display:flex;gap:10px;margin-top:16px">
    <button class="btn btn-ghost" data-act="return-workbench">返回工作台</button>
    <button class="btn btn-secondary" data-deploy-step="0">上一步</button>
    <button class="btn btn-primary" ${activeCount?'':'disabled'} data-deploy-step="2">下一步：终端分配 (${activeCount} 个可用位)</button>
  </div>
</div>`;
}


/* ═══════════════════════════════════════════════════
   NEW DEPLOY FLOW: STEP 3 — 终端分配
   ═══════════════════════════════════════════════════ */
function deployBindScreen(){
  const m=mt(); const c=cr(); const d=demo().deployDraft;
  const r=d.rules;
  const grid=d.grid||{rows:7,cols:6,blocks:[]};
  const bindings=d.bindings||{};
  const labels=['母机准备','占位与规则','终端分配','部署传输'];
  const desktops = m.desktops||[];

  const activeBlocks = grid.blocks.filter(b=>b.state==='active');
  const boundCount = Object.keys(bindings).length;
  const nextUnbound = activeBlocks.find(b=>!bindings[b.idx]);

  /* Compute per-block assignments (same logic as grid screen) */
  const assignable = grid.blocks.filter(b=>b.state!=='deleted');
  const sortedAssignable = [...assignable].sort((a,b)=>{
    const sa=seatLabel(a.row,a.col,r), sb=seatLabel(b.row,b.col,r);
    return sa.localeCompare(sb);
  });
  let ipNum = r.ipStart || 20;
  const prefix = r.namePrefix || c.id.split('-')[1].toUpperCase();
  const blockAsgn = {};
  sortedAssignable.forEach(b=>{
    const seat = seatLabel(b.row, b.col, r);
    blockAsgn[b.idx]={ pos:seat, ip:(r.ipBase||c.networkBase)+'.'+ipNum, name:prefix+'-'+seat };
    ipNum++;
  });

  const nextUnboundSeat = nextUnbound ? seatLabel(nextUnbound.row, nextUnbound.col, r) : null;

  return `<div class="page">
  ${stepBar(labels, 2)}

  <div style="display:flex;gap:12px;margin-bottom:12px;flex-wrap:wrap">
    <div class="card" style="flex:1;min-width:160px;padding:10px">
      <div style="font-size:.72rem;color:var(--t-text2)">服务器地址</div>
      <div class="mono" style="font-size:.82rem">${esc(m.serverAddr||'--')}</div>
    </div>
    <div class="card" style="flex:1;min-width:160px;padding:10px">
      <div style="font-size:.72rem;color:var(--t-text2)">桌面</div>
      <div style="font-size:.82rem">${desktops.map(d2=>esc(d2.name)).join('、')||'无'}</div>
    </div>
    <div class="card" style="flex:1;min-width:120px;padding:10px">
      <div style="font-size:.72rem;color:var(--t-text2)">分配进度</div>
      <div style="font-size:1rem;font-weight:700;color:${boundCount===activeBlocks.length?'var(--t-ok)':'var(--t-accent)'}">${boundCount} / ${activeBlocks.length}</div>
    </div>
    <div class="card" style="flex:1;min-width:120px;padding:10px">
      <div style="font-size:.72rem;color:var(--t-text2)">部署模式</div>
      <div style="font-size:.82rem">${d.deployMode==='full'?'全量部署':'增量更新'}</div>
    </div>
  </div>

  <div class="section-sub">
    请到每台终端按 Enter 键占位。
    ${nextUnbound?`下一个待分配位置: <strong style="color:var(--t-accent)">${esc(nextUnboundSeat)}</strong>`
      :pill('全部已分配','ok')}
    <span style="float:right;display:flex;gap:6px">
      <button class="btn btn-ghost" data-act="deploy-bind-next">模拟占位 (下一台)</button>
      <button class="btn btn-ghost" data-act="deploy-bind-all">一键全部分配</button>
    </span>
    <div style="font-size:.72rem;color:var(--t-text3);margin-top:4px">💡 点击已分配方块可改为"禁用占位"，后续终端自动顺延</div>
  </div>

  <div class="page-scroll">
  <div class="deploy-grid" style="display:grid;grid-template-columns:repeat(${grid.cols},1fr);gap:6px">
    ${(()=>{
      const dir = r.gridDirection || 'tl';
      let html='';
      for(let ri=0;ri<grid.rows;ri++){
        for(let ci=0;ci<grid.cols;ci++){
          const row = (dir==='bl'||dir==='br') ? (grid.rows-1-ri) : ri;
          const col = (dir==='tr'||dir==='br') ? (grid.cols-1-ci) : ci;
          const b=grid.blocks.find(b2=>b2.row===row&&b2.col===col);
          if(!b){ html+='<div class="gb gb-empty"></div>'; continue; }
          const seat = seatLabel(row, col, r);
          if(b.state==='deleted'){ html+='<div class="gb gb-empty"></div>'; continue; }
          if(b.state==='disabled'){
            html+=`<div class="gb gb-disabled" data-bind-skip="${b.idx}" style="cursor:pointer" title="已禁用 (${seat})，点击恢复"><div class="gb-seat">${esc(seat)}</div><div class="gb-tag">禁用</div></div>`;
            continue;
          }
          const binding=bindings[b.idx];
          const asgn=blockAsgn[b.idx];
          const isBound = !!binding;
          const isNext = nextUnbound&&nextUnbound.idx===b.idx;
          html+=`<div class="gb ${isBound?'gb-bound':isNext?'gb-next':'gb-waiting'}" data-bind-skip="${b.idx}" style="cursor:pointer" title="${seat} · ${isBound?'点击禁用并顺延后续分配':'点击禁用此位置'}">
            <div class="gb-seat">${esc(seat)}</div>
            ${asgn?`<div class="gb-ip">${esc(asgn.ip)}</div>`:''}
            ${isBound?`<div class="gb-tag" style="color:var(--t-ok)">已分配</div>`
              :`<div class="gb-tag">${isNext?'← 下一个':'等待'}</div>`}
          </div>`;
        }
      }
      return html;
    })()}
  </div>
  </div>

  <div style="display:flex;gap:10px;margin-top:16px">
    <button class="btn btn-ghost" data-act="return-workbench">返回工作台</button>
    <button class="btn btn-secondary" data-deploy-step="1">上一步</button>
    <button class="btn btn-primary" ${boundCount>=1?'':'disabled'} data-act="start-deployment">开始部署传输 (${boundCount} 台)</button>
  </div>
</div>`;
}


/* ═══════════════════════════════════════════════════
   NEW DEPLOY FLOW: STEP 4 — 部署传输 (grid-based progress)
   ═══════════════════════════════════════════════════ */
function deployTransferScreen(){
  const st=s(); const c=cr(); const d=demo().deployDraft;
  const tk=taskForCr(st, c.id);
  const grid=d.grid||{rows:7,cols:6,blocks:[]};
  const bindings=d.bindings||{};
  const labels=['母机准备','占位与规则','终端分配','部署传输'];
  const done = tk?.phase==='completed';
  const stateLabel={queued:'排队',transferring:'传输',applying:'写入',rebooting:'重启',completed:'完成',failed:'失败'};

  return `<div class="page">
  ${stepBar(labels, 3)}
  <div class="section-title">${done?'部署完成':'部署传输中'}</div>
  ${tk?`<div class="progress-ring mb-16">
    <div class="big-number ${done?(tk.counts.failed?'text-warn':'text-ok'):'text-info'}">${(tk.counts.completed||0)+(tk.counts.failed||0)}/${tk.counts.total||0}</div>
    <div>
      <div class="big-label">成功 ${tk.counts.completed||0} · 失败 ${tk.counts.failed||0}</div>
      <div class="big-label">传输 ${tk.counts.transferring||0} · 写入 ${tk.counts.applying||0} · 重启 ${tk.counts.rebooting||0} · 排队 ${tk.counts.queued||0}</div>
    </div>
  </div>`:''}

  <div class="page-scroll">
  <div class="deploy-grid" style="display:grid;grid-template-columns:repeat(${grid.cols},1fr);gap:6px">
    ${(()=>{
      const dir = d.rules?.gridDirection || 'tl';
      const taskTermIds = new Set((tk?.items||[]).map(i=>i.terminalId));
      let html='';
      for(let ri=0;ri<grid.rows;ri++){
        for(let ci=0;ci<grid.cols;ci++){
          const row = (dir==='bl'||dir==='br') ? (grid.rows-1-ri) : ri;
          const col = (dir==='tr'||dir==='br') ? (grid.cols-1-ci) : ci;
          const b=grid.blocks.find(b2=>b2.row===row&&b2.col===col);
          if(!b){ html+='<div class="gb gb-empty"></div>'; continue; }
          const seat = seatLabel(row, col, d.rules||{});
          if(b.state==='deleted'){ html+='<div class="gb gb-empty"></div>'; continue; }
          if(b.state==='disabled'){
            html+=`<div class="gb gb-disabled"><div class="gb-seat">${esc(seat)}</div><div class="gb-tag">禁用</div></div>`;
            continue;
          }
          const binding=bindings[b.idx];
          if(!binding){
            html+=`<div class="gb gb-waiting"><div class="gb-seat">${esc(seat)}</div><div class="gb-tag" style="color:var(--t-text3)">--</div></div>`;
            continue;
          }
          /* Not in task scope = did not participate */
          if(!taskTermIds.has(binding.terminalId)){
            html+=`<div class="gb gb-waiting" style="opacity:.5">
              <div class="gb-seat">${esc(seat)}</div>
              <div class="gb-tag" style="color:var(--t-text3)">未部署</div>
            </div>`;
            continue;
          }
          const item = tk?.items?.find(i=>i.terminalId===binding.terminalId);
          const itemState = item?.state||'queued';
          const pctVal = itemState==='completed'?100:itemState==='failed'?0:itemState==='transferring'?35:itemState==='applying'?70:itemState==='rebooting'?90:5;
          const fillColor = itemState==='completed'?'var(--t-ok)':itemState==='failed'?'var(--t-err)':'var(--t-accent)';
          html+=`<div class="gb gb-transfer" style="position:relative;overflow:hidden">
            <div style="position:absolute;top:0;left:0;bottom:0;width:${pctVal}%;background:${fillColor};opacity:.2;transition:width .5s ease"></div>
            <div style="position:relative;z-index:1">
              <div class="gb-seat">${esc(seat)}</div>
              <div class="gb-status" style="color:${itemState==='completed'?'var(--t-ok)':itemState==='failed'?'var(--t-err)':'var(--t-text2)'}">${stateLabel[itemState]||itemState}</div>
            </div>
          </div>`;
        }
      }
      return html;
    })()}
  </div>
  </div>

  <div style="display:flex;gap:10px;margin-top:16px">
    ${done?`<button class="btn btn-primary" data-act="return-workbench">返回工作台</button>`
      :`<span style="font-size:.8rem;color:var(--t-text2)">任务执行中请勿关闭此页面</span>`}
  </div>
</div>`;
}


/* ═══════════════════════════════════════════════════
   STANDALONE IP / SERVER MODIFICATION — unchanged
   ═══════════════════════════════════════════════════ */
function maintIpScreen(){
  const m=mt(); const c=cr(); const d=demo().maintDraft;
  const allTerms = termsInCr(s(), c.id);
  const ipPreview = d.ipPreview||[];
  const crRows = c.rows||7; const crCols = c.cols||6;
  /* Sort by seat label for column-major grid rendering */
  const sorted = [...allTerms].sort((a,b)=>(a.seat||'').localeCompare(b.seat||''));
  return `<div class="page">
  <div class="section-title"><button class="btn btn-ghost" data-act="return-workbench">←</button> 修改 IP / 服务器地址</div>
  <div class="page-scroll">
  <div style="display:grid;grid-template-columns:360px 1fr;gap:20px;align-items:start">
    <div>
      <div class="section-title" style="font-size:.9rem">批量规则</div>
      <div class="card mb-16" style="max-width:480px">
        <div class="prep-field"><label>服务器地址</label><input type="text" id="mip-srv" value="${esc(d.newServerAddr||c.serverAddress||m.serverAddr||'')}" placeholder="server.edu.cn"></div>
        <div class="prep-field"><label>新 IP 前缀</label><input type="text" id="mip-base" value="${esc(d.newIpBase||c.networkBase||'')}" placeholder="10.21.31"></div>
        <div class="prep-field"><label>新 IP 起始编号</label><input type="number" id="mip-start" value="${d.newIpStart||20}" min="1" max="254"></div>
        <div class="prep-field"><label>子网掩码</label><input type="text" id="mip-mask" value="${esc(d.newSubnetMask||m.subnetMask||'255.255.255.0')}" placeholder="255.255.255.0"></div>
        <div class="prep-field"><label>网关</label><input type="text" id="mip-gw" value="${esc(d.newGateway||m.gateway||c.gateway||'')}" placeholder="10.x.x.1"></div>
        <div class="prep-field"><label>DNS</label><input type="text" id="mip-dns" value="${esc(d.newDns||(m.dns||c.dns||[]).join(','))}" placeholder="8.8.8.8, 114.114.114.114"></div>
      </div>
      <div style="font-size:.75rem;color:var(--t-ok);margin-top:4px">修改规则或拖动终端后自动刷新预览</div>
    </div>
    <div>
      <div class="section-title" style="font-size:.9rem">终端选择 · ${d.scope.length} 台
        <span style="font-size:.75rem;color:var(--t-text2);margin-left:8px">点击卡片选择/取消选择终端</span></div>
      <div style="display:flex;gap:8px;margin-bottom:10px">
        <button class="btn btn-secondary" data-maint-all>全选在线</button>
        <button class="btn btn-secondary" data-maint-clear>清空</button>
      </div>
      <div style="display:grid;grid-template-rows:repeat(${crRows},auto);grid-template-columns:repeat(${crCols},1fr);grid-auto-flow:column;gap:8px">
        ${sorted.map(t=>{
          const isMother = t.id===m.id;
          if(isMother) return `<div class="dt-card" style="padding:8px 10px;font-size:.78rem;opacity:.5;border-left:3px solid var(--t-warn)">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <span style="font-weight:600;font-size:.85rem">${esc(t.seat||'--')}</span>
              ${pill('母机','warn')}
            </div>
            <div class="mono" style="font-size:.72rem">${esc(t.ip||'--')}</div>
          </div>`;
          const checked=d.scope.includes(t.id);
          const pv = ipPreview.find(x=>x.terminalId===t.id);
          const scopeIdx = d.scope.indexOf(t.id);
          if(!t.online) return `<div class="dt-card offline-look" style="padding:8px 10px;font-size:.78rem;opacity:.6;border-left:3px solid var(--t-border)">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <span style="font-weight:600;font-size:.85rem">${esc(t.seat||'--')}</span>
              <span>${pill('离线','err')}</span>
            </div>
            <div class="mono" style="font-size:.72rem">${esc(t.ip||'--')}</div>
          </div>`;
          return `<div class="dt-card ${checked?'selected':''}" style="cursor:pointer;padding:8px 10px;font-size:.78rem;border-left:3px solid ${checked?'var(--t-accent)':'var(--t-border)'}" data-maint-toggle="${t.id}">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <span style="font-weight:600;font-size:.85rem">${esc(t.seat||'--')}</span>
              <span>${checked?pill('已选','ok'):''}</span>
            </div>
            <div class="mono" style="font-size:.72rem">${esc(t.ip||'--')}${pv?' → <span style="color:var(--t-ok)">'+esc(pv.newIp)+'</span>':''}</div>
            ${checked?`<div style="font-size:.7rem;color:var(--t-accent);margin-top:2px">#${scopeIdx+1}</div>`:''}
          </div>`;
        }).join('')}
      </div>
    </div>
  </div>
  </div>
  <div style="display:flex;gap:10px;margin-top:16px">
    <button class="btn btn-primary" data-act="start-maint-ip">开始执行</button>
  </div>
</div>`;
}


/* ── Task progress (maintenance only) ── */
function taskProgressScreen(taskType){
  const st=s(); const c=cr(); const tk=taskForCr(st, c.id);
  if(!tk) return empty('无进行中的任务');
  const done=tk.phase==='completed';
  const stateLabel={queued:'排队中',transferring:'传输中',applying:'写入中',rebooting:'重启中',completed:'已完成',failed:'失败'};

  return `<div class="page">
  <div class="section-title">${done?'维护已完成':'维护执行中'}</div>
  <div class="progress-ring mb-16">
    <div class="big-number ${done?(tk.counts.failed?'text-warn':'text-ok'):'text-info'}">${(tk.counts.completed||0)+(tk.counts.failed||0)}/${tk.counts.total||0}</div>
    <div>
      <div class="big-label">成功 ${tk.counts.completed||0} · 失败 ${tk.counts.failed||0}</div>
    </div>
  </div>
  <div class="page-scroll">
  ${tk.items.map(item=>{
    const t=getTerm(st,item.terminalId);
    const pctVal=item.state==='completed'?100:item.state==='failed'?0:item.state==='transferring'?35:item.state==='applying'?70:item.state==='rebooting'?90:0;
    return `<div class="transfer-row">
      <div style="min-width:80px">${esc(t?.seat||'--')}</div>
      <div style="flex:1"><div class="transfer-bar"><div class="transfer-fill ${item.state==='completed'?'done':item.state==='failed'?'fail':'active'}" style="width:${pctVal}%"></div></div></div>
      <div style="min-width:50px">${pill(stateLabel[item.state]||item.state, tone(item.state))}</div>
      ${item.state==='failed'?`<div style="font-size:.7rem;color:var(--t-err)">${esc(item.failReason||'')}</div>`:''}
    </div>`;
  }).join('')}
  </div>
  <div style="display:flex;gap:10px;margin-top:16px">
    ${done?`<button class="btn btn-primary" data-act="return-workbench">返回工作台</button>`
      :`<span style="font-size:.8rem;color:var(--t-text2)">任务执行中请勿关闭此页面</span>`}
  </div>
</div>`;
}


/* ═══════════════════════════════════════════════════
   FAULT HANDLING — unchanged
   ═══════════════════════════════════════════════════ */
function faultReplaceScreen(){
  const m=mt(); const c=cr(); const st=s(); const fr=demo().faultReplace||{};
  const serverOk = fr.serverReachable;
  const allCrs = st.classrooms.filter(cr=>cr.registeredOnServer||cr.stage==='deployed');
  const selectedCrId = fr.selectedClassroomId || '';
  const selectedCr = selectedCrId ? getClassroom(st, selectedCrId) : null;
  const crTerms = selectedCr ? termsInCr(st, selectedCr.id).filter(t=>t.id!==m.id) : [];

  if(fr.confirmed){
    return `<div class="page" style="display:flex;flex-direction:column;align-items:center">
    <div style="width:100%;max-width:720px">
    <div class="section-title"><button class="btn btn-ghost" data-act="go-home">←</button> 替换故障终端</div>
    <div class="card" style="border-color:var(--t-ok);background:rgba(34,197,94,0.08);max-width:720px;margin-top:24px">
      <div class="card-header" style="color:var(--t-ok)">替换已完成</div>
      <div style="font-size:.85rem">本机已继承 ${esc(fr.suggestedSeat||'--')} 位置的全部配置与桌面资产。</div>
    </div>
    </div>
    </div>`;
  }

  if(fr.replacing || demo().flags?.faultReplacing){
    return `<div class="page" style="display:flex;flex-direction:column;align-items:center;justify-content:center">
    <div style="max-width:480px;width:100%;text-align:center">
      <div style="font-size:1.3rem;font-weight:600;margin-bottom:16px">正在替换中…</div>
      <div class="progress-bar" style="width:100%;height:12px;margin-bottom:12px"><div class="fill" style="width:65%"></div></div>
      <div style="font-size:.85rem;color:var(--t-text2);margin-bottom:8px">正在从服务器同步配置与桌面数据</div>
      <div style="font-size:.95rem;color:var(--t-err);font-weight:600;padding:12px;background:var(--t-err-bg);border:1px solid var(--t-err);border-radius:var(--radius)">⚠ 替换过程中切勿关闭电源、拔掉网线或中断网络连接，否则可能导致终端数据损坏。</div>
    </div>
    </div>`;
  }

  return `<div class="page" style="display:flex;flex-direction:column;align-items:center">
  <div style="width:100%;max-width:920px">
  <div class="section-title"><button class="btn btn-ghost" data-act="go-home">←</button> 替换故障终端</div>
  <div class="section-sub">选择教室和要替换的终端座位，本机将继承该终端的配置与桌面。</div>

  ${!serverOk?`<div class="card mb-16" style="border-color:var(--t-warn);max-width:720px">
    <div style="font-size:.85rem;color:var(--t-warn)">⚠ 无法连接服务器，请检查网络配置后重试。</div>
  </div>`:`
  <div style="display:grid;grid-template-columns:260px 1fr;gap:16px;align-items:start">
    <div>
      <div class="card">
        <div class="card-header">❶ 选择教室</div>
        ${allCrs.length?allCrs.map(cr=>`
          <div class="dt-card mb-4 ${cr.id===selectedCrId?'selected':''}" style="cursor:pointer;padding:8px 12px;font-size:.88rem" data-fault-cr="${cr.id}">
            <span>${esc(cr.name)}</span>
          </div>
        `).join(''):'<div style="font-size:.88rem;color:var(--t-text3);padding:8px 0">无已注册教室</div>'}
      </div>
    </div>
    <div class="card">
      <div class="card-header">❷ 选择终端座位 ${selectedCr?'— '+esc(selectedCr.name):''}</div>
      ${!selectedCr?'<div style="font-size:.88rem;color:var(--t-text3);padding:16px 0;text-align:center">← 请先选择教室</div>'
        :crTerms.length?`<div style="display:grid;grid-template-rows:repeat(${selectedCr.rows||7},auto);grid-template-columns:repeat(${Math.min(selectedCr.cols||8, 10)},minmax(0,1fr));grid-auto-flow:column;gap:8px;max-width:100%">
          ${crTerms.map(t=>`
            <div class="gb ${t.online?'gb-active':'gb-disabled'}" style="cursor:${t.online?'pointer':'default'};display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:48px;padding:6px" ${t.online?`data-fault-select="${t.id}"`:'title="离线"'}>
              <div class="gb-seat" style="font-size:.88rem">${esc(t.seat||'--')}</div>
              ${!t.online?'<div class="gb-tag" style="color:var(--t-err);font-size:.75rem">离线</div>':''}
            </div>
          `).join('')}
        </div>`:'<div style="font-size:.88rem;color:var(--t-text3);padding:16px 0;text-align:center">该教室无其他终端</div>'}
    </div>
  </div>`}
  </div>
</div>`;
}

function faultResetScreen(){
  const m=mt(); const frs=demo().faultReset||{};
  const serverOk = frs.serverReachable;

  if(frs.confirmed){
    return `<div class="page" style="display:flex;flex-direction:column;align-items:center">
    <div style="max-width:480px;width:100%">
    <div class="section-title"><button class="btn btn-ghost" data-act="go-home">←</button> 重置终端</div>
    <div class="card" style="border-color:var(--t-ok);background:rgba(34,197,94,0.08);width:100%;margin-top:24px">
      <div class="card-header" style="color:var(--t-ok)">重置已完成</div>
      <div style="font-size:.85rem">已从服务器重新拉取全部注册数据覆盖本机。</div>
    </div>
    </div>
    </div>`;
  }

  if(frs.resetting || demo().flags?.faultResetting){
    return `<div class="page" style="display:flex;flex-direction:column;align-items:center;justify-content:center">
    <div style="max-width:480px;width:100%;text-align:center">
      <div style="font-size:1.3rem;font-weight:600;margin-bottom:16px">正在重置…</div>
      <div class="progress-bar" style="width:100%;height:12px;margin-bottom:12px"><div class="fill" style="width:40%"></div></div>
      <div style="font-size:.85rem;color:var(--t-text2);margin-bottom:8px">正在从服务器拉取注册数据</div>
      <div style="font-size:.95rem;color:var(--t-err);font-weight:600;padding:12px;background:var(--t-err-bg);border:1px solid var(--t-err);border-radius:var(--radius)">⚠ 重置过程中切勿关闭电源、拔掉网线或中断网络连接，否则可能导致终端无法正常启动。</div>
    </div>
    </div>`;
  }

  return `<div class="page" style="display:flex;flex-direction:column;align-items:center">
  <div style="max-width:520px;width:100%">
  <div class="section-title"><button class="btn btn-ghost" data-act="go-home">←</button> 重置终端</div>

  ${!serverOk?`<div class="card mb-16" style="border-color:var(--t-warn);width:100%;margin-top:16px">
    <div style="font-size:.85rem;color:var(--t-warn)">⚠ 无法连接服务器，请检查网络配置后重试。重置功能需要服务器在线。</div>
  </div>`:''}

  <div class="card mb-16" style="width:100%;border-color:var(--t-err);background:var(--t-err-bg);margin-top:16px">
    <div style="font-size:1rem;font-weight:600;color:var(--t-err);margin-bottom:10px">⚠ 重置终端</div>
    <div style="font-size:.88rem;color:var(--t-text);line-height:1.7">
      重置将<b>清除本机所有数据</b>，包括已安装的桌面、个人配置、未同步的修改等内容，并从服务器重新拉取注册数据恢复到初始状态。<br><br>
      <span style="color:var(--t-err);font-weight:600">此操作不可撤销。</span>如果本机有尚未同步到服务器的桌面或配置变更，重置后将<b>永久丢失</b>。<br><br>
      <span style="color:var(--t-text2)">建议在重置前：<br>· 确认所有重要桌面已同步到服务器<br>· 备份本机上的重要数据<br>· 确保网络连接稳定</span>
    </div>
  </div>

  <div style="display:flex;gap:10px">
    <button class="btn btn-danger" ${serverOk?'':'disabled'} data-act="fault-reset-confirm-with-dialog">确认重置</button>
  </div>
  </div>
</div>`;
}


/* ═══════════════════════════════════════════════════
   DESKTOP EDITOR, EXPORT — unchanged
   ═══════════════════════════════════════════════════ */
function desktopEditorScreen(){
  return `<div class="page">
  <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;flex:1;text-align:center;padding:40px 20px">
    <div style="font-size:1.5rem;margin-bottom:12px">桌面编辑环境</div>
    <div style="color:var(--t-text2);margin-bottom:24px;font-size:.95rem">当前已重启进入桌面，可安装/卸载软件、修改系统设置。<br>编辑完成后点击下方按钮，系统将重启返回管理系统并合并编辑。</div>
    <button class="btn btn-primary" data-act="finish-desktop-edit">编辑完成，重启返回管理系统</button>
  </div>
</div>`;
}

function exportScreen(){
  const m=mt(); const c=cr(); const st=s();
  const terms=termsInCr(st, c.id);
  /* Derive terminal info from layout rules + bindings if actual terminal data is empty */
  const d=demo().deployDraft||{};
  const r=d.rules||{};
  const grid=d.grid||{rows:c.rows||7,cols:c.cols||6,blocks:[]};
  const bindings=d.bindings||{};
  const hasRules = !!(r.ipBase && r.namePrefix);
  const pfx = r.namePrefix || '';
  const assignable = grid.blocks.filter(b=>b.state!=='deleted').sort((a,b)=>{
    const sa=seatLabel(a.row,a.col,r), sb=seatLabel(b.row,b.col,r);
    return sa.localeCompare(sb);
  });
  let ipNum = r.ipStart || 20;
  const blockAssignMap = {};
  if(hasRules){
    assignable.forEach(b=>{
      const seat = seatLabel(b.row, b.col, r);
      blockAssignMap[b.idx] = { seat, ip:(r.ipBase)+'.'+ipNum, name:pfx+'-'+seat };
      ipNum++;
    });
  }
  /* Enrich terminal display data: if terminal has no name/ip, look it up from layout bindings */
  const enriched = terms.map(t=>{
    if(t.name && t.ip) return t;
    /* Try to find this terminal in bindings */
    for(const [idx, binding] of Object.entries(bindings)){
      if(binding.terminalId===t.id && blockAssignMap[idx]){
        const asgn = blockAssignMap[idx];
        return {...t, name:t.name||asgn.name, ip:t.ip||asgn.ip, seat:t.seat||asgn.seat};
      }
    }
    return t;
  });
  const incomplete = enriched.filter(t=>!t.name||!t.ip);
  const exportName = demo().flags?.exportCrName || c.name;
  const exportRemark = demo().flags?.exportCrRemark || '';
  return `<div class="page">
  <div class="section-title"><button class="btn btn-ghost" data-act="return-workbench">←</button> 导出教室终端清单</div>
  <div class="page-scroll">
  <div class="section-sub">导出 Excel 文件，包含教室内所有终端的座位、机器名、IP 等信息。</div>
  ${incomplete.length?`<div class="card" style="border-color:var(--t-warn);margin-bottom:16px">
    <div style="font-size:.85rem;color:var(--t-warn)">提示：有 ${incomplete.length} 台终端信息不完整 (缺少机器名或 IP)，导出内容可能不全。</div>
  </div>`:''}
  <div class="card" style="margin-bottom:16px">
    <div class="card-header">导出选项</div>
    <div class="prep-field"><label>教室名称</label><input type="text" id="export-cr-name" value="${esc(exportName)}" placeholder="导出时使用的教室名称"></div>
    <div class="prep-field"><label>教室备注 <span style="font-size:.68rem;color:var(--t-text3);font-weight:normal">可选</span></label><input type="text" id="export-cr-remark" value="${esc(exportRemark)}" placeholder="填写备注信息"></div>
    <div style="font-size:.72rem;color:var(--t-text3);margin-top:6px">教室名称将作为平台导入时生成的教室名称，修改仅影响导出文件，不影响系统内信息。</div>
  </div>
  <div class="card" style="margin-bottom:16px;padding:0">
    <div class="card-header" style="padding:12px 14px 8px">终端列表 (共 ${enriched.length} 台)</div>
    <table class="data-table" style="font-size:.8rem;white-space:nowrap">
      <thead><tr><th data-sort>#</th><th data-sort>座位</th><th data-sort>机器名</th><th data-sort>IP</th><th data-sort>MAC</th><th data-sort>硬盘序列号</th></tr></thead>
      <tbody>${enriched.map((t,i)=>`<tr class="${(!t.name||!t.ip)?'conflict':''}">
        <td>${i+1}</td>
        <td>${esc(t.seat||'--')}</td><td>${esc(t.name||'--')}</td>
        <td class="mono">${esc(t.ip||'--')}</td>
        <td class="mono">${esc(t.mac||'--')}</td>
        <td class="mono">${esc(t.hw?.diskSn||'--')}</td></tr>`).join('')}</tbody>
    </table>
  </div>
  </div>
  <div style="padding-top:12px;border-top:1px solid var(--t-border)">
    <button class="btn btn-ghost dt-export-btn" data-act="export-select-folder">导出教室终端清单</button>
  </div>
</div>`;
}


/* ═══════════════════════════════════════════════════
   BIND ALL — updated for new flow
   ═══════════════════════════════════════════════════ */
function bindAll(){
  /* ── action buttons ── */
  root.querySelectorAll('[data-act]').forEach(el=>{
    el.addEventListener('click',()=>{
      const a=el.dataset.act;
      if(a==='complete-layout'){
        const nm=root.querySelector('#tk-name');
        /* Save layout network fields (server addr, subnet, gateway, DNS) to mother terminal */
        const layoutSrv = root.querySelector('#layout-srv')?.value || '';
        const layoutMask = root.querySelector('#layout-mask')?.value || '';
        const layoutGw = root.querySelector('#layout-gw')?.value || '';
        const layoutDns = root.querySelector('#layout-dns')?.value || '';
        if(layoutSrv || layoutMask || layoutGw || layoutDns){
          act('save-layout-network',{serverAddr:layoutSrv, subnetMask:layoutMask, gateway:layoutGw, dns:layoutDns});
        }
        /* Save current rules */
        saveGridRulesIfPresent();
        /* Takeover + auto-bind all + switch to maint tab */
        setTimeout(()=>{
          act('confirm-takeover',nm?{classroomName:nm.value}:{});
          setTimeout(()=>{
            act('deploy-bind-all-terminals');
            setTimeout(()=>act('set-flag',{wbTab:'maint', layoutRescan:false, layoutSnapshot:null, gridBackup:null, opsMode:'deploy'}), 50);
          }, 100);
        }, 80);
      } else if(a==='confirm-takeover'){
        const nm=root.querySelector('#tk-name');
        const layoutSrv = root.querySelector('#layout-srv')?.value || '';
        const layoutMask = root.querySelector('#layout-mask')?.value || '';
        const layoutGw = root.querySelector('#layout-gw')?.value || '';
        const layoutDns = root.querySelector('#layout-dns')?.value || '';
        if(layoutSrv || layoutMask || layoutGw || layoutDns){
          act('save-layout-network',{serverAddr:layoutSrv, subnetMask:layoutMask, gateway:layoutGw, dns:layoutDns});
        }
        setTimeout(()=>act(a,nm?{classroomName:nm.value}:{}), 80);
      } else if(a==='start-maint-ip'){
        act(a,{serverAddr:root.querySelector('#mip-srv')?.value,
          ipBase:root.querySelector('#mip-base')?.value,
          ipStart:Number(root.querySelector('#mip-start')?.value||20),
          subnetMask:root.querySelector('#mip-mask')?.value,
          gateway:root.querySelector('#mip-gw')?.value,
          dns:root.querySelector('#mip-dns')?.value});
      } else if(a==='open-local-desktop-flow'){
        act('open-local-desktop',{returnScreen:demo().motherScreen});
      } else if(a==='desktop-return-flow'){
        const rs=demo()._desktopReturnScreen;
        if(rs) act('navigate',{screen:rs});
        else act('return-workbench');
      } else if(a==='export-select-folder'){
        const crName = root.querySelector('#export-cr-name')?.value||'';
        const crRemark = root.querySelector('#export-cr-remark')?.value||'';
        act('set-flag',{exportCrName:crName, exportCrRemark:crRemark});
        const fileName = (crName||'教室终端清单').replace(/[\/\/:*?"<>|]/g,'-')+'.xlsx';
        if(window.electronAPI?.isElectron){
          window.electronAPI.showSaveDialog({
            title:'选择导出目录',
            defaultPath:'E:\\'+fileName,
            filters:[{name:'Excel 文件',extensions:['xlsx']},{name:'所有文件',extensions:['*']}]
          }).then(result=>{
            if(!result.canceled && result.filePath){
              showTermAlert('终端清单已导出到：\n'+result.filePath);
            }
          });
        } else {
          const defaultPath='E:\\'+fileName;
          showTermConfirm('导出教室终端清单',
            '将导出 Excel 清单到 U 盘。<br>默认路径：<span style="font-family:monospace;font-size:.85rem;color:var(--t-accent)">'+esc(defaultPath)+'</span><br><br>点击确认模拟导出。',
            ()=>{ showTermAlert('终端清单已导出到：\n'+defaultPath); },
            {danger:false});
        }
      } else if(a==='open-fault-replace-direct'){
        act('open-fault-replace');
      } else if(a==='open-takeover'){
        /* Pre-check: mother terminal must have basic setup done */
        const _m = mt();
        if(!_m.seat || !_m.name){
          showTermAlert('请先完成本机设置 (设置本机 → 填写机器名和座位号)后再进入网络同传。');
          return;
        }
        act('open-takeover');
      } else if(a==='open-fault-reset-direct'){
        act('open-fault-reset');
      } else if(a==='fault-reset-confirm-with-dialog'){
        showTermConfirm('确认重置','<span style="color:var(--t-err)">重置将清除本机所有数据</span>，包括已安装的桌面、个人配置及未同步的修改，恢复到服务器注册的初始状态。<br><br><b>此操作不可撤销。</b>',()=>{
          act('set-flag',{faultResetting:true});
          setTimeout(()=>{
            act('fault-reset-confirm');
            act('set-flag',{faultResetting:false});
          }, 2500);
        });
      } else if(a==='exit-to-desktop'){
        showTermConfirm('退出管理系统','确定要退出管理系统并重启进入桌面吗？',()=>showTermAlert('系统将重启进入桌面 (原型模拟)'),{danger:false});
      } else if(a==='deploy-bind-next'){
        /* Simulate binding the next available online controlled terminal */
        const terms = termsInCr(s(), cr().id).filter(t=>t.id!==mt().id&&t.online&&t.controlState==='controlled');
        const bindings = demo().deployDraft?.bindings||{};
        const boundIds = new Set(Object.values(bindings).map(b=>b.terminalId));
        const nextTerm = terms.find(t=>!boundIds.has(t.id));
        if(nextTerm) act('deploy-bind-terminal',{terminalId:nextTerm.id});
        else showTermAlert('所有在线终端已分配完毕');
      } else if(a==='deploy-bind-all'){
        act('deploy-bind-all-terminals');
      } else if(a==='start-deployment'){
        /* Save deploy mode before starting */
        const modeSel = root.querySelector('#deploy-mode-sel');
        if(modeSel) act('deploy-set-deploy-mode',{mode:modeSel.value});
        setTimeout(()=>act('start-deployment'),50);
      } else if(a==='wb-tab-layout'){
        saveGridRulesIfPresent();
        /* Full grid backup for data isolation: maint should not see unsaved layout edits */
        const dd=demo().deployDraft||{};
        const gr=dd.grid||{rows:7,cols:6,blocks:[]};
        const ru=dd.rules||{};
        const onCnt=termsInCr(s(),cr().id).filter(t=>t.id!==mt().id&&t.online).length;
        act('set-flag',{wbTab:'layout', layoutRescan:true,
          gridBackup:JSON.stringify(gr),
          layoutSnapshot:JSON.stringify({rows:gr.rows,cols:gr.cols,
            blocks:gr.blocks.filter(b=>b.state==='active').length,
            ipBase:ru.ipBase||'',namePrefix:ru.namePrefix||'',
            ipStart:ru.ipStart||20,startLetter:ru.startLetter||'A',
            gridDirection:ru.gridDirection||'tl',termCount:onCnt})
        });
      } else if(a==='wb-tab-maint'){
        /* Only allow switching to maint if takeover is confirmed */
        const isMother = mt()?.controlState==='mother';
        if(!isMother) return;
        /* Dirty detection: compare current state with snapshot taken when entering layout */
        const dd=demo().deployDraft||{};
        const gr=dd.grid||{rows:7,cols:6,blocks:[]};
        const ru=dd.rules||{};
        const onlineCount = termsInCr(s(), cr().id).filter(t=>t.id!==mt().id&&t.online).length;
        const activeCount = gr.blocks.filter(b=>b.state==='active').length;
        const curState=JSON.stringify({rows:gr.rows,cols:gr.cols,
          blocks:activeCount,
          ipBase:ru.ipBase||'',namePrefix:ru.namePrefix||'',
          ipStart:ru.ipStart||20,startLetter:ru.startLetter||'A',
          gridDirection:ru.gridDirection||'tl',termCount:onlineCount});
        const snap=demo().flags?.layoutSnapshot;
        /* Robust dirty check: if snapshot exists, compare; if missing (first visit), not dirty */
        const isDirty = snap ? snap !== curState : false;
        if(isDirty){
          /* If terminals exceed grid, block entirely */
          if(onlineCount > activeCount){
            showTermAlert('发现 '+onlineCount+' 台终端但网格仅有 '+activeCount+' 个可用位。请先调整网格布局。');
            return;
          }
          /* Prompt user to save or discard layout changes */
          showTermConfirm('布局已修改','您对布局做了修改但尚未保存，是否保存变更？',()=>{
            /* Save: trigger complete-layout flow and switch to maint */
            const nm=root.querySelector('#tk-name');
            const layoutSrv=root.querySelector('#layout-srv')?.value||'';
            const layoutMask=root.querySelector('#layout-mask')?.value||'';
            const layoutGw=root.querySelector('#layout-gw')?.value||'';
            const layoutDns=root.querySelector('#layout-dns')?.value||'';
            if(layoutSrv||layoutMask||layoutGw||layoutDns) act('save-layout-network',{serverAddr:layoutSrv,subnetMask:layoutMask,gateway:layoutGw,dns:layoutDns});
            saveGridRulesIfPresent();
            setTimeout(()=>{
              act('confirm-takeover',nm?{classroomName:nm.value}:{});
              setTimeout(()=>{ act('deploy-bind-all-terminals'); setTimeout(()=>act('set-flag',{wbTab:'maint',layoutRescan:false,layoutSnapshot:null,gridBackup:null,opsMode:'deploy'}),50); },100);
            },80);
          },{danger:false});
          /* Add a discard option by modifying the modal */
          setTimeout(()=>{
            const modal=document.querySelector('.t-modal-actions');
            if(modal){
              const discardBtn=document.createElement('button');
              discardBtn.className='btn btn-ghost';
              discardBtn.textContent='放弃修改';
              discardBtn.addEventListener('click',()=>{
                document.querySelector('.t-modal-overlay')?.remove();
                act('restore-grid-backup');
                setTimeout(()=>act('set-flag',{wbTab:'maint',layoutRescan:false,layoutSnapshot:null,gridBackup:null}),50);
              });
              modal.insertBefore(discardBtn, modal.firstChild);
            }
          },0);
          return;
        }
        /* Save current rules before switching (no dirty — just persist DOM state) */
        saveGridRulesIfPresent();
        act('set-flag',{wbTab:'maint', layoutRescan:false, layoutSnapshot:null, gridBackup:null, opsMode:'deploy'});
      } else if(a==='ops-mode-deploy'){
        act('set-flag',{opsMode:'deploy'});
      } else if(a==='ops-mode-maint-ip'){
        act('set-flag',{opsMode:'maint-ip'});
        act('open-maint-ip');
      } else if(a==='ops-mode-idle'){
        act('set-flag',{opsMode:'idle'});
      } else if(a==='ops-clear-task'){
        /* Clear completed task and reset opsMode */
        act('clear-completed-task');
        act('set-flag',{opsMode:'idle'});
      } else if(a==='toggle-view-last-result'){
        act('set-flag',{viewLastResult:!(demo().flags?.viewLastResult)});
      } else { act(a); }
    });
  });

  /* ── save local info/network/fault ── */
  root.querySelectorAll('[data-save]').forEach(el=>{
    el.addEventListener('click',()=>{
      const type=el.dataset.save;
      if(type==='local-info'){
        act('save-local-info',{name:root.querySelector('#li-name')?.value, seat:root.querySelector('#li-seat')?.value,
          ip:root.querySelector('#li-ip')?.value, subnetMask:root.querySelector('#li-mask')?.value,
          gateway:root.querySelector('#li-gw')?.value, dns:root.querySelector('#li-dns')?.value});
        setTimeout(()=>act('go-home'),50);
      } else if(type==='local-network'){
        /* Save address and go home immediately — connection check continues in background */
        const addr = root.querySelector('#ln-srv')?.value || '';
        act('save-local-network',{serverAddr:addr});
        /* Clear pending flag since we've persisted */
        act('set-flag',{pendingServerAddr:null});
        setTimeout(()=>act('go-home'),50);
      } else if(type==='fault-network'){
        act('save-fault-network',{serverAddr:root.querySelector('#fr-srv')?.value, ip:root.querySelector('#fr-ip')?.value,
          subnetMask:root.querySelector('#fr-mask')?.value, gateway:root.querySelector('#fr-gw')?.value,
          dns:root.querySelector('#fr-dns')?.value});
      } else if(type==='fault-network-reset'){
        act('save-fault-network',{serverAddr:root.querySelector('#frs-srv')?.value, ip:root.querySelector('#frs-ip')?.value,
          subnetMask:root.querySelector('#frs-mask')?.value, gateway:root.querySelector('#frs-gw')?.value,
          dns:root.querySelector('#frs-dns')?.value});
      }
    });
  });

  /* ── fault handling: classroom & terminal selection ── */
  root.querySelectorAll('[data-fault-cr]').forEach(el=>{
    el.addEventListener('click',()=>act('fault-replace-select-cr',{classroomId:el.dataset.faultCr}));
  });
  root.querySelectorAll('[data-fault-select]').forEach(el=>{
    el.addEventListener('click',()=>{
      const tid=el.dataset.faultSelect;
      const t=getTerm(s(),tid);
      const frCr = demo().faultReplace?.selectedClassroomId;
      const frCrObj = frCr ? getClassroom(s(), frCr) : null;
      const crLabel = frCrObj ? esc(frCrObj.name) : '未知教室';
      const seatLabel2=t?esc(t.seat||'--'):'--';
      showTermConfirm('确认替换','确定要替换 <b>'+crLabel+'</b> 教室中座位 <b>'+seatLabel2+'</b> 的终端吗？<br><br>本机将继承该终端的全部配置与桌面。此操作不可撤销。',()=>{
        /* Set replacing state to show progress */
        act('set-flag',{faultReplacing:true});
        act('fault-replace-select',{terminalId:tid});
        setTimeout(()=>{
          act('fault-replace-confirm');
          act('set-flag',{faultReplacing:false});
        }, 2500);
      });
    });
  });

  /* ── alert sort ── */
  root.querySelectorAll('[data-alert-sort]').forEach(el=>{
    el.addEventListener('click',()=>{
      const key = el.dataset.alertSort;
      const curKey = demo().flags?.alertSortKey || 'severity';
      const curDir = demo().flags?.alertSortDir || 'desc';
      if(key===curKey){
        act('set-flag',{alertSortKey:key, alertSortDir:curDir==='desc'?'asc':'desc'});
      } else {
        act('set-flag',{alertSortKey:key, alertSortDir:'desc'});
      }
    });
  });

  /* ── deploy step nav ── */
  root.querySelectorAll('[data-deploy-step]').forEach(el=>{
    el.addEventListener('click',()=>{
      const step = Number(el.dataset.deployStep);
      /* Save deploy mode before navigating */
      const modeSel = root.querySelector('#deploy-mode-sel');
      if(modeSel) act('deploy-set-deploy-mode',{mode:modeSel.value});
      /* Save rules if on grid screen */
      saveGridRulesIfPresent();
      setTimeout(()=>act('deploy-goto-step',{step}),80);
    });
  });

  /* ── grid block clicks (toggle active→disabled→deleted→active) ── */
  root.querySelectorAll('[data-block-idx]').forEach(el=>{
    el.addEventListener('click',()=>{
      const idx = Number(el.dataset.blockIdx);
      act('deploy-toggle-block',{idx});
    });
  });

  /* ── direction & flow buttons above grid ── */
  root.querySelectorAll('[data-rule-dir]').forEach(el=>{
    el.addEventListener('click',()=>{
      saveGridRulesIfPresent();
      setTimeout(()=>act('deploy-set-rules',{gridDirection:el.dataset.ruleDir}),50);
    });
  });
  root.querySelectorAll('[data-rule-flow]').forEach(el=>{
    el.addEventListener('click',()=>{
      saveGridRulesIfPresent();
      setTimeout(()=>act('deploy-set-rules',{seatFlow:el.dataset.ruleFlow}),50);
    });
  });

  /* ── bind screen: click unbound block to disable (insert placeholder) ── */
  root.querySelectorAll('[data-bind-skip]').forEach(el=>{
    el.addEventListener('click',()=>{
      const idx = Number(el.dataset.bindSkip);
      act('deploy-bind-skip',{idx}); /* toggle active ↔ disabled */
    });
  });

  /* ── workbench ops: toggle bind/unbind on grid blocks ── */
  root.querySelectorAll('[data-deploy-toggle-bind]').forEach(el=>{
    el.addEventListener('click',()=>{
      const idx = Number(el.dataset.deployToggleBind);
      act('deploy-toggle-bind',{idx});
    });
  });

  /* ── grid dimension changes ── */
  root.querySelectorAll('[data-grid]').forEach(el=>{
    el.addEventListener('change',()=>{
      const rows = Number(root.querySelector('[data-grid="rows"]')?.value||7);
      const cols = Number(root.querySelector('[data-grid="cols"]')?.value||6);
      act('deploy-set-grid',{rows, cols});
    });
  });

  /* ── deploy rules — apply on blur/change only, NOT on every keystroke.
     This prevents the seat-grid preview from refreshing mid-typing,
     which disrupts focus and scroll. 'change' fires on stepper click for
     number inputs; 'blur' fires when user clicks away from text inputs. ── */
  let _ruleDebounce=null;
  function saveGridRulesIfPresent(){
    const rules={};
    root.querySelectorAll('[data-rule]').forEach(r=>{
      rules[r.dataset.rule]=r.type==='number'?Number(r.value):r.value;
    });
    if(Object.keys(rules).length) act('deploy-set-rules',rules);
  }
  root.querySelectorAll('[data-rule]').forEach(r=>{
    r.addEventListener('change',()=>{
      clearTimeout(_ruleDebounce);
      _ruleDebounce=setTimeout(()=>saveGridRulesIfPresent(),200);
    });
    r.addEventListener('blur',()=>{
      if(_isRendering) return;
      clearTimeout(_ruleDebounce);
      _ruleDebounce=setTimeout(()=>saveGridRulesIfPresent(),100);
    });
  });

  /* ── maint IP — apply on blur/change only (same rationale as deploy rules) ── */
  let _maintDebounce=null;
  function autoApplyMaintRules(){
    clearTimeout(_maintDebounce);
    _maintDebounce=setTimeout(()=>act('maint-apply-ip-rules',{
      serverAddr:root.querySelector('#mip-srv')?.value,
      ipBase:root.querySelector('#mip-base')?.value,
      ipStart:Number(root.querySelector('#mip-start')?.value||20),
      subnetMask:root.querySelector('#mip-mask')?.value,
      gateway:root.querySelector('#mip-gw')?.value,
      dns:root.querySelector('#mip-dns')?.value}),200);
  }
  ['#mip-srv','#mip-base','#mip-start','#mip-mask','#mip-gw','#mip-dns'].forEach(sel=>{
    const el=root.querySelector(sel);
    if(el){
      el.addEventListener('change',autoApplyMaintRules);
      el.addEventListener('blur',()=>{ if(!_isRendering) autoApplyMaintRules(); });
    }
  });

  /* ── maint IP terminal toggle ── */
  root.querySelectorAll('[data-maint-toggle]').forEach(el=>{
    el.addEventListener('click',()=>{
      const scope=[...demo().maintDraft.scope];
      const tid=el.dataset.maintToggle;
      const idx=scope.indexOf(tid);
      if(idx>=0) scope.splice(idx,1); else scope.push(tid);
      act('maint-set-scope',{scope});
    });
  });
  root.querySelectorAll('[data-maint-all]').forEach(el=>{
    el.addEventListener('click',()=>{
      const all=termsInCr(s(),cr().id).filter(t=>t.id!==mt().id&&t.online).map(t=>t.id);
      act('maint-set-scope',{scope:all});
    });
  });
  root.querySelectorAll('[data-maint-clear]').forEach(el=>{
    el.addEventListener('click',()=>act('maint-set-scope',{scope:[]}));
  });

  /* ── desktop management ── */
  /* overflow menu toggle */
  root.querySelectorAll('[data-dt-overflow]').forEach(el=>{
    el.addEventListener('click',(e)=>{
      e.stopPropagation();
      const menu = root.querySelector(`[data-dt-menu="${el.dataset.dtOverflow}"]`);
      if(!menu) return;
      const wasOpen = menu.classList.contains('open');
      root.querySelectorAll('.dt-overflow-menu').forEach(m=>m.classList.remove('open'));
      if(!wasOpen) menu.classList.add('open');
    });
  });
  /* close overflow menus on outside click (single handler, avoids stacking) */
  if(!root._dtOverflowBound){
    root._dtOverflowBound = true;
    root.addEventListener('click',(e)=>{
      if(!e.target.closest('[data-dt-overflow]') && !e.target.closest('.dt-overflow-menu'))
        root.querySelectorAll('.dt-overflow-menu').forEach(m=>m.classList.remove('open'));
    });
  }
  root.querySelectorAll('[data-desktop-action]').forEach(el=>{
    el.addEventListener('click',()=>{
      if(el.dataset.desktopAction==='import') showImportDialog();
      if(el.dataset.desktopAction==='export-pkg') showExportDoneDialog();
    });
  });
  root.querySelectorAll('[data-dt-edit]').forEach(el=>{
    el.addEventListener('click',()=>act('enter-desktop-edit',{desktopId:el.dataset.dtEdit}));
  });
  root.querySelectorAll('[data-dt-copy]').forEach(el=>{
    el.addEventListener('click',()=>{
      const dtId=el.dataset.dtCopy;
      const dt=(mt()?.desktops||[]).find(d=>d.id===dtId);
      showTermConfirm('复制桌面',`将基于「${esc(dt?.name||'')}」创建一个内容完全相同的新桌面。`,()=>act('copy-desktop',{sourceId:dtId}),{danger:false});
    });
  });
  root.querySelectorAll('[data-dt-default]').forEach(el=>{
    el.addEventListener('click',()=>act('set-default-desktop',{desktopId:el.dataset.dtDefault}));
  });
  root.querySelectorAll('[data-dt-visibility]').forEach(el=>{
    el.addEventListener('click',()=>act('toggle-desktop-visibility',{desktopId:el.dataset.dtVisibility}));
  });
  root.querySelectorAll('[data-dt-delete]').forEach(el=>{
    el.addEventListener('click',()=>{
      const dtId=el.dataset.dtDelete;
      const dt=(mt()?.desktops||[]).find(d=>d.id===dtId);
      const uploaded=dt?.uploaded||dt?.syncStatus==='synced';
      const msg=uploaded?'确定要删除此桌面？此操作不可撤销。':'<span style="color:var(--t-err);font-weight:600">该桌面尚未上传到服务器，删除后将无法恢复！</span><br>确定要删除此桌面？';
      showTermConfirm('确认删除',msg,()=>act('delete-desktop',{desktopId:dtId}));
    });
  });
  root.querySelectorAll('[data-dt-upload]').forEach(el=>{
    el.addEventListener('click',()=>{
      const card = el.closest('.dt-card');
      if(card) card.classList.add('uploading');
      el.textContent='同步中…';
      el.disabled=true;
      setTimeout(()=>{
        act('upload-desktop',{desktopId:el.dataset.dtUpload});
      },2600);
    });
  });

  /* ── drag reorder (maint IP only) ── */
  bindDragReorder();

  /* ── server address auto-detect on blur + page entry ── */
  const srvInput = root.querySelector('#ln-srv');
  if(srvInput){
    srvInput.addEventListener('blur',()=>{
      if(_isRendering) return;
      const addr = srvInput.value.trim();
      if(!addr) return;
      const currentAddr = demo().flags?.pendingServerAddr ?? mt()?.serverAddr ?? '';
      if(addr === currentAddr) return;
      act('set-flag',{pendingServerAddr:addr});
      _triggerServerCheck();
    });
    /* Auto-check on page entry or when stale state detected.
       Triggers when:
       - No timer is currently running (_serverCheckTimer is null)
       - Status is NOT 'ok' (covers: null/undefined after go-home, stale 'checking'
         from server restart, 'fail' from previous attempt)
       - There is an address to check
       This is idempotent: _triggerServerCheck() clears any old timer before starting. */
    if(!_serverCheckTimer){
      const connFlag = demo().flags?.serverConnStatus;
      const existingAddr = (demo().flags?.pendingServerAddr ?? mt()?.serverAddr ?? '').trim();
      if(existingAddr && connFlag !== 'ok'){
        _triggerServerCheck();
      }
    }
  }

  /* ── sortable table headers ── */
  bindTableSort();
}

function bindDragReorder(){
  const rows = root.querySelectorAll('[data-drag-id]');
  rows.forEach(row=>{
    row.addEventListener('dragstart',e=>{
      dragSrcId=row.dataset.dragId;
      e.dataTransfer.effectAllowed='move';
      row.classList.add('dragging');
    });
    row.addEventListener('dragend',()=>{row.classList.remove('dragging'); dragSrcId=null;});
    row.addEventListener('dragover',e=>{e.preventDefault(); e.dataTransfer.dropEffect='move'; row.classList.add('drag-over');});
    row.addEventListener('dragleave',()=>row.classList.remove('drag-over'));
    row.addEventListener('drop',e=>{
      e.preventDefault(); row.classList.remove('drag-over');
      const targetId=row.dataset.dragId;
      if(!dragSrcId||dragSrcId===targetId) return;
      const scope=[...demo().maintDraft.scope];
      const srcPos=scope.indexOf(dragSrcId);
      if(srcPos<0) return;
      scope.splice(srcPos,1);
      const tgtPos=scope.indexOf(targetId);
      if(tgtPos<0){ scope.splice(srcPos,0,dragSrcId); return; }
      scope.splice(tgtPos,0,dragSrcId);
      act('maint-reorder',{scope});
      setTimeout(()=>act('maint-apply-ip-rules',{
        serverAddr:root.querySelector('#mip-srv')?.value,
        ipBase:root.querySelector('#mip-base')?.value,
        ipStart:Number(root.querySelector('#mip-start')?.value||20),
        subnetMask:root.querySelector('#mip-mask')?.value,
        gateway:root.querySelector('#mip-gw')?.value,
        dns:root.querySelector('#mip-dns')?.value}),100);
    });
  });
}
