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

function showTermConfirm(title,msg,onOk){
  const ov=document.createElement('div'); ov.className='t-modal-overlay';
  ov.innerHTML=`<div class="t-modal"><div class="t-modal-title">${title}</div><div class="t-modal-msg">${msg}</div><div class="t-modal-actions"><button class="btn btn-ghost" data-tm="cancel">取消</button><button class="btn btn-danger" data-tm="ok">确认</button></div></div>`;
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
  /* Simulate Electron dialog.showSaveDialog with default path */
  const defaultPath = 'E:\\CloudDesktop\\desktop-export.cdpkg';
  showTermConfirm('导出桌面包','系统将打开"保存文件"对话框，默认保存位置：<br><span style="font-family:monospace;font-size:.82rem;color:var(--t-accent)">'+esc(defaultPath)+'</span><br><br>点击确认模拟导出。',()=>{
    showTermAlert('桌面包已导出到: '+defaultPath+'（原型模拟 — 实际产品使用 Electron showSaveDialog）');
  });
}

function showImportDialog(){
  /* Simulate Electron dialog.showOpenDialog with filters */
  const defaultDir = 'E:\\CloudDesktop';
  const filters = '.cdpkg / .vhd / .img';
  showTermConfirm('导入桌面','系统将打开"选择文件"对话框：<br>默认目录：<span style="font-family:monospace;font-size:.82rem;color:var(--t-accent)">'+esc(defaultDir)+'</span><br>支持格式：<span style="font-size:.82rem;color:var(--t-text2)">'+esc(filters)+'</span><br><br>点击确认模拟选择文件。',()=>{
    showCreateDesktopDialog('导入的桌面');
  });
}

function showCreateDesktopDialog(defaultName){
  const ov=document.createElement('div'); ov.className='t-modal-overlay';
  ov.innerHTML=`<div class="t-modal" style="max-width:420px">
    <div class="t-modal-title" style="color:var(--t-text)">导入桌面</div>
    <div class="t-modal-msg">请配置桌面信息：</div>
    <div class="prep-field"><label>桌面名称</label><input type="text" id="cd-name" value="${esc(defaultName)}" placeholder="桌面名称"></div>
    <div class="prep-field"><label>部署方式</label><select id="cd-physical">
      <option value="false">虚拟部署（VHD）</option>
      <option value="true">物理部署（独立分区）</option>
    </select></div>
    <div class="prep-field"><label>数据盘</label><select id="cd-disk-size">
      <option value="">不添加数据盘</option>
      <option value="20GB">20 GB</option>
      <option value="50GB" selected>50 GB</option>
      <option value="100GB">100 GB</option>
    </select></div>
    <div id="cd-disk-drive-row" class="prep-field"><label>数据盘盘符</label><input type="text" id="cd-disk-drive" value="D:" placeholder="如 D:"></div>
    <div class="prep-field"><label>备注</label><input type="text" id="cd-remark" value="" placeholder="可选"></div>
    <div class="t-modal-actions">
      <button class="btn btn-ghost" data-tm="cancel">取消</button>
      <button class="btn btn-primary" data-tm="create">导入桌面</button>
    </div>
  </div>
</div>`;
  document.body.appendChild(ov);
  /* Toggle data disk drive row visibility */
  const diskSel=ov.querySelector('#cd-disk-size');
  const driveRow=ov.querySelector('#cd-disk-drive-row');
  function toggleDriveRow(){ driveRow.style.display=diskSel.value?'':'none'; }
  toggleDriveRow();
  diskSel.addEventListener('change',toggleDriveRow);
  ov.querySelector('[data-tm="cancel"]').addEventListener('click',()=>ov.remove());
  ov.addEventListener('click',(e)=>{if(e.target===ov)ov.remove();});
  ov.querySelector('[data-tm="create"]').addEventListener('click',()=>{
    const name = ov.querySelector('#cd-name')?.value||defaultName;
    const diskSize = ov.querySelector('#cd-disk-size')?.value;
    const diskDrive = ov.querySelector('#cd-disk-drive')?.value||'D:';
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

function render(state){
  if(!state) return;
  root.innerHTML = shellHtml();
  bindAll();
}


function shellHtml(){
  const m=mt(); const c=cr();
  return `<div class="term-shell">
    <div class="term-topbar">
      <div class="brand">云桌面管理系统</div>
      <div class="status">
        <span class="dot ${m?.online?'dot-ok':'dot-err'}"></span><span class="status-label ${m?.online?'sol':'sol-err'}">${m?.online?'在线':'离线'}</span>
        <span class="sep">·</span>
        <span>${esc(m?.name||'未命名')}</span>
        <span class="sep">·</span>
        <span>${esc(m?.seat||'--')}</span>
        <span class="sep">·</span>
        <span class="mono">${m?.ip?esc(m.ip):'未配置IP'}</span>
        <span class="sep">·</span>
        <button class="btn btn-secondary" style="padding:4px 14px;font-size:.82rem;color:var(--t-warn);border-color:var(--t-warn)" data-act="exit-to-desktop">退出管理系统</button>
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
  <div style="display:flex;flex-direction:column;gap:12px;width:360px">
    <button class="btn btn-secondary" style="padding:14px;font-size:1rem;justify-content:center" data-act="open-local-info">设置本机</button>
    <button class="btn btn-secondary" style="padding:14px;font-size:1rem;justify-content:center" data-act="open-local-network">设置服务器</button>
    <button class="btn btn-secondary" style="padding:14px;font-size:1rem;justify-content:center" data-act="open-local-desktop">管理桌面</button>
    <button class="btn btn-secondary" style="padding:14px;font-size:1rem;justify-content:center" data-act="open-fault-reset-direct">重置终端</button>
    <button class="btn btn-secondary" style="padding:14px;font-size:1rem;justify-content:center" data-act="open-fault-replace-direct">替换故障终端</button>
    <button class="btn btn-secondary" style="padding:14px;font-size:1rem;justify-content:center" data-act="open-takeover">${m.controlState==='mother'?'已接管教室 — 进入工作台':'网络同传'}</button>
  </div>
</div>`;
}


/* ═══════════════════════════════════════════════════
   LOCAL SCREENS — unchanged
   ═══════════════════════════════════════════════════ */
function localInfoScreen(){
  const m=mt(); const c=cr();
  return `<div class="page" style="display:flex;flex-direction:column;align-items:center">
  <div style="max-width:480px;width:100%">
  <div class="section-title"><button class="btn btn-ghost btn-sm" data-act="go-home">←</button> 设置本机</div>
  <div class="card" style="width:100%">
    <div class="prep-field"><label>机器名</label><input type="text" id="li-name" value="${esc(m.name||'')}" placeholder="输入机器名"></div>
    <div class="prep-field"><label>座位号</label><input type="text" id="li-seat" value="${esc(m.seat||'')}" placeholder="如 A-01"></div>
    <div style="border-top:1px solid var(--t-border);margin:16px 0 12px;padding-top:12px">
      <div style="font-size:.82rem;color:var(--t-text3);margin-bottom:8px">网络配置</div>
    </div>
    <div class="prep-field"><label>IP 地址</label><input type="text" id="li-ip" value="${esc(m.ip||'')}" placeholder="如 10.21.31.20"></div>
    <div class="prep-field"><label>子网掩码</label><input type="text" id="li-mask" value="${esc(m.subnetMask||'255.255.255.0')}" placeholder="255.255.255.0"></div>
    <div class="prep-field"><label>网关</label><input type="text" id="li-gw" value="${esc(m.gateway||c?.gateway||'')}" placeholder="网关地址"></div>
    <div class="prep-field"><label>DNS</label><input type="text" id="li-dns" value="${esc((m.dns||[]).join(','))}" placeholder="DNS 地址"></div>
    <div style="display:flex;gap:8px;margin-top:12px">
      <button class="btn btn-ghost" data-act="go-home">取消</button>
      <button class="btn btn-primary" data-save="local-info">保存</button>
    </div>
  </div>
  </div>
  </div>`;
}


function localNetworkScreen(){
  const m=mt();
  const hasAddr = !!(m.serverAddr);
  /* Derive connection status from demo flags or from classroom registration */
  const connFlag = demo().flags?.serverConnStatus;
  const isChecking = connFlag==='checking';
  const connOk = connFlag==='ok' || (connFlag==null && hasAddr && cr()?.registeredOnServer);
  const connStatus = isChecking ? 'checking' : !hasAddr ? 'none' : connOk ? 'ok' : 'fail';
  return `<div class="page" style="display:flex;flex-direction:column;align-items:center">
  <div style="max-width:480px;width:100%">
  <div class="section-title"><button class="btn btn-ghost btn-sm" data-act="go-home">←</button> 设置服务器</div>
  <div class="card" style="width:100%">
    <div class="prep-field"><label>服务器地址</label><input type="text" id="ln-srv" value="${esc(m.serverAddr||'')}" placeholder="管理服务器 IP 或域名"></div>
    <div style="margin-top:12px;padding:10px 14px;background:${connStatus==='ok'?'var(--t-ok-bg)':connStatus==='fail'?'var(--t-err-bg)':'var(--t-panel)'};border:1px solid ${connStatus==='ok'?'var(--t-ok)':connStatus==='fail'?'var(--t-err)':'var(--t-border)'};border-radius:var(--radius)">
      <div style="display:flex;align-items:center;gap:8px">
        ${isChecking?'<span class="conn-spinner"></span>':
        `<span class="dot ${connStatus==='ok'?'dot-ok':connStatus==='fail'?'dot-err':''}"></span>`}
        <span style="font-size:.85rem;color:${connStatus==='ok'?'var(--t-ok)':connStatus==='fail'?'var(--t-err)':isChecking?'var(--t-accent)':'var(--t-text3)'}">${connStatus==='ok'?'已连接服务器':connStatus==='fail'?'无法连接服务器':isChecking?'正在检测连接…':'未配置服务器地址'}</span>
      </div>
      ${connStatus==='fail'?'<div style="font-size:.75rem;color:var(--t-text3);margin-top:4px">请检查地址是否正确或网络是否通畅</div>':''}
    </div>
    <div style="display:flex;gap:8px;margin-top:12px">
      <button class="btn btn-ghost" data-act="go-home">取消</button>
      <button class="btn btn-primary" data-save="local-network">保存</button>
    </div>
  </div>
  </div>
  </div>`;
}


function localDesktopScreen(){
  const m=mt(); const c=cr();
  const desktops = (m.desktops||[]).slice().sort((a,b)=>{
    const aUp = a.uploaded || a.syncStatus==='synced' ? 1 : 0;
    const bUp = b.uploaded || b.syncStatus==='synced' ? 1 : 0;
    if(aUp!==bUp) return aUp-bUp;
    return (b.editedAt||'').localeCompare(a.editedAt||'');
  });
  const returnAct = demo()._desktopReturnScreen ? 'desktop-return-flow' : (m.controlState==='mother'?'return-workbench':'go-home');
  const bid = m.bios?.defaultBootId;
  const diskTotal = m.metrics?.diskTotal || 512;
  const desktopUsed = desktops.reduce((s,d)=>s+(d.diskSize||45),0);
  const systemUsed = 38;
  const diskUsed = desktopUsed + systemUsed;
  const diskFree = Math.max(0, diskTotal - diskUsed);
  const diskPct = Math.round(diskUsed/diskTotal*100);
  return `<div class="page">
  <div class="section-title"><button class="btn btn-ghost btn-sm" data-act="${returnAct}">←</button> 桌面管理</div>

  <div class="disk-summary mb-16">
    <div style="display:flex;align-items:center;gap:20px;padding:14px;background:var(--t-panel);border:1px solid var(--t-border);border-radius:var(--radius)">
      <div style="position:relative;width:80px;height:80px;flex-shrink:0">
        <svg viewBox="0 0 42 42" style="width:80px;height:80px">
          <circle cx="21" cy="21" r="16" fill="none" stroke="var(--t-border)" stroke-width="5"></circle>
          ${(()=>{
            const sysPct = Math.round(systemUsed/diskTotal*100);
            const dtPct = Math.round(desktopUsed/diskTotal*100);
            return `<circle cx="21" cy="21" r="16" fill="none" stroke="var(--t-text3)" stroke-width="5"
              stroke-dasharray="${sysPct*1.005} ${100.5-sysPct}" stroke-dashoffset="25" stroke-linecap="round"></circle>
            <circle cx="21" cy="21" r="16" fill="none" stroke="${diskPct>85?'var(--t-err)':diskPct>70?'var(--t-warn)':'var(--t-accent)'}" stroke-width="5"
              stroke-dasharray="${dtPct*1.005} ${100.5-dtPct}" stroke-dashoffset="${25-sysPct*1.005}" stroke-linecap="round"></circle>`;
          })()}
        </svg>
        <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:.8rem;font-weight:700">${diskPct}%</div>
      </div>
      <div style="font-size:.82rem;line-height:1.8;flex:1">
        <div><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:var(--t-text3);margin-right:6px;vertical-align:middle"></span>系统占用 ${systemUsed} GB</div>
        <div><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${diskPct>85?'var(--t-err)':diskPct>70?'var(--t-warn)':'var(--t-accent)'};margin-right:6px;vertical-align:middle"></span>桌面占用 ${desktopUsed} GB</div>
        <div><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:var(--t-border);margin-right:6px;vertical-align:middle"></span>剩余可用 ${diskFree} GB</div>
        <div style="color:var(--t-text3);font-size:.75rem">总计 ${diskTotal} GB</div>
      </div>
    </div>
  </div>

  <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">
    <button class="btn btn-primary" data-desktop-action="import">导入桌面</button>
    <button class="btn btn-secondary" data-desktop-action="export-pkg">导出桌面包</button>
  </div>

  ${desktops.length ? '<div class="page-scroll">' + desktops.map(d=>{
    const isDefault = d.id===bid;
    const isHidden = d.visibility==='hidden';
    const dataDisks = d.dataDisks || [];
    const uploaded = d.uploaded || d.syncStatus==='synced';
    const isPhysical = d.physicalDeploy || false;
    return `
    <div class="dt-card mb-8 ${isDefault?'selected':''}" data-dt-id="${d.id}" style="position:relative;overflow:hidden${!uploaded?';border-color:var(--t-warn);background:var(--t-warn-bg)':''}">
      <span class="dt-card-fill"></span>
      <div style="position:relative;z-index:1">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div class="dt-name">${esc(d.name)}</div>
        <div style="display:flex;gap:4px;flex-wrap:wrap;align-items:center">
          ${isPhysical?pill('物理部署','warn'):''}
          ${pill('还原','info')}
          ${isDefault?pill('默认启动','info'):`<button class="btn btn-ghost" style="padding:2px 8px;font-size:.7rem" data-dt-default="${d.id}">设为默认</button>`}
          <button class="btn btn-ghost" style="padding:2px 8px;font-size:.7rem" data-dt-visibility="${d.id}">${isHidden?'取消隐藏':'隐藏'}</button>
          ${isHidden?pill('已隐藏','muted'):''}
          ${uploaded?pill('已同步','ok'):pill('未同步','err')}
        </div>
      </div>
      <div class="dt-meta" style="margin-top:6px">${esc(d.baseImageName||d.os)} · 桌面占用 ${d.diskSize||45} GB（${dataDisks.length?'含数据盘 '+dataDisks.map(dd=>esc(dd.drive||'D:')+' '+esc(dd.size||'20GB')).join(', '):'不含数据盘'}）</div>
      ${d.remark?`<div class="dt-sw">备注: ${esc(d.remark)}</div>`:''}
      <div style="font-size:.72rem;color:var(--t-text3);margin-top:4px">创建 ${fmtTime(d.createdAt)} · 更新 ${fmtTime(d.editedAt)}</div>
      <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;align-items:center">
        <button class="btn btn-ghost" data-dt-edit="${d.id}">编辑桌面</button>
        <button class="btn btn-ghost" data-dt-copy="${d.id}">复制桌面</button>
        ${!uploaded?`<button class="btn btn-primary" data-dt-upload="${d.id}">同步到服务器</button>`:''}
        <button class="btn btn-ghost" style="color:var(--t-err)" data-dt-delete="${d.id}">删除</button>
      </div>
      </div>
    </div>`;
  }).join('') + '</div>' : empty('暂无本机桌面','请导入桌面镜像或桌面包')}
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
  const defaultTab = (m.controlState!=='mother' || isBlank) ? 'layout' : 'maint';
  const wbTab = demo().flags?.wbTab || defaultTab;
  /* If a task is running, force maint tab */
  const activeTab = tk ? 'maint' : wbTab;
  const opsMode = demo().flags?.opsMode || 'idle';
  const isRunning = tk && tk.phase!=='completed';

  return `<div class="page">
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
    <div class="section-title" style="margin:0">
      <button class="btn btn-ghost btn-sm" data-act="go-home">←</button>
      ${esc(c.name)} ${pill(stageLabel(c.stage), c.stage==='deployed'?'ok':'info')}
      <span style="font-size:.78rem;color:var(--t-text2);margin-left:8px">${rt.online}/${rt.total} 在线</span>
    </div>
    <div style="display:flex;gap:6px">
      <button class="btn btn-danger" data-act="end-management">结束管理</button>
    </div>
  </div>
  <div style="display:flex;gap:6px;margin-bottom:14px">
    <button class="btn ${activeTab==='layout'?'btn-primary':'btn-secondary'}" ${isRunning?'disabled':''} data-act="wb-tab-layout">设置布局</button>
    <button class="btn ${activeTab==='maint'?'btn-primary':'btn-secondary'}" ${isBlank&&m.controlState!=='mother'?'disabled':''} ${isRunning?'disabled':''} data-act="wb-tab-maint">教室维护</button>
  </div>
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

  /* Compute grid preview */
  const prefix = r.namePrefix || c.id.split('-')[1]?.toUpperCase()||'';
  const assignable = grid.blocks.filter(b=>b.state!=='deleted');
  const sortedAssignable = [...assignable].sort((a,b)=>{
    const sa=seatLabel(a.row,a.col,r), sb=seatLabel(b.row,b.col,r);
    return sa.localeCompare(sb);
  });
  let ipNum = r.ipStart || 20;
  const previewMap = {};
  sortedAssignable.forEach(b=>{
    const seat = seatLabel(b.row, b.col, r);
    previewMap[b.idx] = { pos:seat, ip:(r.ipBase||c.networkBase)+'.'+ipNum, name:prefix+'-'+seat };
    ipNum++;
  });

  /* Terminal discovery simulation */
  const onlineTerms = terms.filter(t=>t.id!==m.id&&t.online);
  const discoveredCount = onlineTerms.length;
  const scanning = !isTakenOver || (demo().flags?.layoutRescan);

  return `<div style="display:grid;grid-template-columns:300px 1fr;gap:16px;flex:1;min-height:0;overflow:hidden;align-items:start">
    <div class="page-scroll" style="display:flex;flex-direction:column;gap:12px">
      <div class="card">
        <div class="card-header">${!isTakenOver?'教室接管':'教室信息'}</div>
        ${scanning?`<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;padding:8px 10px;background:var(--t-accent-bg);border:1px solid rgba(88,166,255,.3);border-radius:4px">
          <span class="conn-spinner"></span>
          <span style="font-size:.82rem;color:var(--t-accent)">正在扫描网络终端… 已发现 ${discoveredCount} 台</span>
        </div>`:''}
        <div class="prep-field"><label>教室名称</label><input type="text" id="tk-name" value="${esc(demo().takeover?.classroomName||c.name||'')}" placeholder="输入教室名称"></div>
        <div class="prep-field"><label>发现终端</label><span style="font-weight:600;color:var(--t-accent)">${discoveredCount} 台在线</span></div>
        ${!isTakenOver?`<button class="btn btn-primary" style="margin-top:8px;width:100%" data-act="confirm-takeover">确认接管教室</button>`
          :`<div style="font-size:.75rem;color:var(--t-ok);margin-top:4px">已接管 · ${rt.online}/${rt.total} 在线</div>`}
      </div>
      <div class="card">
        <div class="card-header">网格布局</div>
        <div class="prep-field"><label>每列座位</label><input type="number" data-grid="rows" value="${grid.rows}" min="1" max="20"></div>
        <div class="prep-field"><label>列数</label><input type="number" data-grid="cols" value="${grid.cols}" min="1" max="15"></div>
        <div style="font-size:.75rem;color:var(--t-text2);margin-top:4px">共 ${grid.blocks.length} 位 · ${pill('可用 '+activeCount,'ok')}</div>
      </div>
      <div class="card">
        <div class="card-header">IP 分配</div>
        <div class="prep-field"><label>IP 前缀</label><input type="text" data-rule="ipBase" value="${esc(r.ipBase||'')}" placeholder="如 10.21.31"></div>
        <div class="prep-field"><label>起始编号</label><input type="number" data-rule="ipStart" value="${r.ipStart||20}" min="1" max="254"></div>
      </div>
      <div class="card">
        <div class="card-header">机器名 / 座位号</div>
        <div class="prep-field"><label>机器名前缀</label><input type="text" data-rule="namePrefix" value="${esc(r.namePrefix||'')}" placeholder="如 D301"></div>
        <div class="prep-field"><label>起始字母</label><input type="text" data-rule="startLetter" value="${esc(r.startLetter||'A')}" maxlength="1" style="width:50px;text-transform:uppercase"></div>
      </div>
      <div class="card">
        <div class="card-header">布局起点</div>
        <div style="display:flex;gap:4px;flex-wrap:wrap">
          ${[['tl','↘ 左上'],['tr','↙ 右上'],['bl','↗ 左下'],['br','↖ 右下']].map(([v,l])=>
            `<button class="btn ${dir===v?'btn-primary':'btn-secondary'}" style="flex:1;min-width:60px" data-rule-dir="${v}">${l}</button>`
          ).join('')}
        </div>
      </div>
    </div>
    <div class="page-scroll">
      ${renderSeatGrid(grid, r, dir, previewMap, terms, 'layout')}
      <div style="font-size:.72rem;color:var(--t-text3);margin-top:8px">点击方块切换状态：可用 → 禁用 → 删除 → 可用</div>
    </div>
  </div>`;
}

/* ── Tab 2: 教室维护 (integrated ops) ── */
function wbMaintContent(terms, rt, tk, c, m, d, opsMode, isRunning){
  const r=d.rules||{};
  const grid=d.grid||{rows:c.rows||7,cols:c.cols||6,blocks:[]};
  const dir = r.gridDirection || 'tl';
  const bindings = d.bindings||{};
  const boundCount = Object.keys(bindings).length;
  const activeBlocks = grid.blocks.filter(b=>b.state==='active');
  const done = tk?.phase==='completed';

  /* State labels for deploy transfer */
  const stateLabels={queued:'排队',transferring:'传输',applying:'写入',rebooting:'重启',completed:'完成',failed:'失败'};

  /* Maint IP draft */
  const md = demo().maintDraft||{};

  return `<div style="display:grid;grid-template-columns:280px 1fr;gap:16px;flex:1;min-height:0;overflow:hidden;align-items:start">
    <div class="page-scroll" style="display:flex;flex-direction:column;gap:10px">
      <div class="card">
        <div class="card-header">功能</div>
        <div style="display:flex;flex-direction:column;gap:6px">
          <button class="btn ${opsMode==='deploy'?'btn-primary':'btn-secondary'}" style="width:100%;justify-content:center" ${isRunning?'disabled':''} data-act="ops-mode-deploy">部署传输</button>
          <button class="btn ${opsMode==='maint-ip'?'btn-primary':'btn-secondary'}" style="width:100%;justify-content:center" ${isRunning?'disabled':''} data-act="ops-mode-maint-ip">修改 IP / 服务器</button>
          <button class="btn ${opsMode==='desktop'?'btn-primary':'btn-secondary'}" style="width:100%;justify-content:center" ${isRunning?'disabled':''} data-act="open-local-desktop-flow">管理桌面</button>
          <button class="btn ${opsMode==='export'?'btn-primary':'btn-secondary'}" style="width:100%;justify-content:center" ${isRunning?'disabled':''} data-act="open-export">导出终端清单</button>
        </div>
      </div>
      ${opsMode==='deploy'||tk?`<div class="card">
        <div class="card-header">部署控制</div>
        <div class="prep-field"><label>部署模式</label><select id="deploy-mode-sel" ${isRunning?'disabled':''}>
          <option value="incremental" ${(d.deployMode||'incremental')==='incremental'?'selected':''}>增量更新</option>
          <option value="full" ${d.deployMode==='full'?'selected':''}>全量部署</option>
        </select></div>
        <div style="padding:6px 0;font-size:.82rem">
          已绑定 <strong style="color:var(--t-accent)">${boundCount}</strong> / ${activeBlocks.length} 台
        </div>
        ${!isRunning?`<div style="display:flex;flex-direction:column;gap:4px;margin-top:4px">
          <button class="btn btn-ghost" data-act="deploy-bind-next">模拟绑定下一台</button>
          <button class="btn btn-ghost" data-act="deploy-bind-all">一键全绑定</button>
          <button class="btn btn-primary" ${boundCount>=1?'':'disabled'} data-act="start-deployment">开始部署（${boundCount} 台）</button>
        </div>`:''}
        ${tk?`<div style="margin-top:8px;padding:8px;background:var(--t-panel);border:1px solid var(--t-border);border-radius:4px;font-size:.82rem">
          <div>${done?'✓ 部署完成':'⏳ 部署进行中'}</div>
          <div>成功 ${tk.counts.completed||0} · 失败 ${tk.counts.failed||0} / ${tk.counts.total||0}</div>
          ${done?'<button class="btn btn-ghost" style="margin-top:6px" data-act="ops-clear-task">关闭任务</button>':''}
        </div>`:''}
      </div>`:''}
      ${opsMode==='maint-ip'?`<div class="card">
        <div class="card-header">修改 IP / 服务器</div>
        <div class="prep-field"><label>服务器地址</label><input type="text" id="mip-srv" value="${esc(md.newServerAddr||c.serverAddress||'')}" placeholder="留空不修改"></div>
        <div class="prep-field"><label>IP 前缀</label><input type="text" id="mip-base" value="${esc(md.newIpBase||c.networkBase||'')}" placeholder="留空不修改"></div>
        <div class="prep-field"><label>起始编号</label><input type="number" id="mip-start" value="${md.newIpStart||20}" min="1" max="254"></div>
        <div class="prep-field"><label>子网掩码</label><input type="text" id="mip-mask" value="${esc(md.newSubnetMask||'255.255.255.0')}"></div>
        <div class="prep-field"><label>网关</label><input type="text" id="mip-gw" value="${esc(md.newGateway||c.gateway||'')}"></div>
        <div class="prep-field"><label>DNS</label><input type="text" id="mip-dns" value="${esc(md.newDns||(c.dns||[]).join(','))}"></div>
        <div style="display:flex;gap:6px;margin-top:8px">
          <button class="btn btn-ghost" data-act="ops-mode-idle">取消</button>
          <button class="btn btn-primary" data-act="start-maint-ip">开始执行</button>
        </div>
      </div>`:''}
      <div class="card">
        <div class="card-header">教室状态</div>
        ${defRow('在线', rt.online+' / '+rt.total)}
        ${defRow('已部署', rt.deployed+' / '+rt.total)}
        ${defRow('阶段', stageLabel(c.stage))}
      </div>
    </div>
    <div class="page-scroll">
      ${isRunning ? renderSeatGridProgress(grid, r, dir, bindings, tk, stateLabels) :
        opsMode==='maint-ip' ? renderSeatGridMaint(terms, m, c, d, md) :
        renderSeatGridOps(grid, r, dir, bindings, terms)}
    </div>
  </div>`;
}

/* ═══════════════════════════════════════════════════
   Shared seat grid renderers for workbench
   ═══════════════════════════════════════════════════ */
function renderSeatGrid(grid, r, dir, previewMap, terms, mode){
  let html='';
  for(let ri=0;ri<grid.rows;ri++){
    for(let ci=0;ci<grid.cols;ci++){
      const row = (dir==='bl'||dir==='br') ? (grid.rows-1-ri) : ri;
      const col = (dir==='tr'||dir==='br') ? (grid.cols-1-ci) : ci;
      const b=grid.blocks.find(b2=>b2.row===row&&b2.col===col);
      if(!b){ html+='<div class="gb gb-empty"></div>'; continue; }
      const seat = seatLabel(row, col, r);
      if(b.state==='deleted'){
        html+=`<div class="gb gb-deleted" data-block-idx="${b.idx}" title="已删除 (${seat})"><span class="gb-x">×</span></div>`;
        continue;
      }
      const pv=previewMap[b.idx];
      const isDisabled = b.state==='disabled';
      const matchTerm = terms.find(t=>t.seat===seat);
      const wasDeployed = matchTerm && matchTerm.ip;
      html+=`<div class="gb ${isDisabled?'gb-disabled':wasDeployed?'gb-bound':'gb-active'}" data-block-idx="${b.idx}" title="${seat} · ${isDisabled?'已禁用':wasDeployed?'已部署':'可用'}">
        <div class="gb-seat">${esc(seat)}</div>
        ${pv?`<div class="gb-ip">${esc(pv.ip)}</div>`:''}
        ${isDisabled?`<div class="gb-tag">禁用</div>`:wasDeployed?`<div class="gb-tag" style="color:var(--t-ok)">已部署</div>`:''}
      </div>`;
    }
  }
  return `<div class="deploy-grid" style="display:grid;grid-template-columns:repeat(${grid.cols},1fr);gap:6px">${html}</div>`;
}

function renderSeatGridOps(grid, r, dir, bindings, terms){
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
      const isBound = !!binding;
      html+=`<div class="gb ${isBound?'gb-bound':'gb-active'}" data-bind-skip="${b.idx}" style="cursor:pointer">
        <div class="gb-seat">${esc(seat)}</div>
        ${isBound?`<div class="gb-tag" style="color:var(--t-ok)">已绑定</div>`
          :`<div class="gb-tag">等待</div>`}
      </div>`;
    }
  }
  return `<div class="deploy-grid" style="display:grid;grid-template-columns:repeat(${grid.cols},1fr);gap:6px">${html}</div>`;
}

function renderSeatGridProgress(grid, r, dir, bindings, tk, stateLabels){
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
      if(!binding){
        html+=`<div class="gb gb-waiting"><div class="gb-seat">${esc(seat)}</div><div class="gb-tag">未绑定</div></div>`;
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
          <div class="gb-status" style="color:${itemState==='completed'?'var(--t-ok)':itemState==='failed'?'var(--t-err)':'var(--t-text2)'}">${stateLabels[itemState]||itemState}</div>
        </div>
      </div>`;
    }
  }
  return `<div class="deploy-grid" style="display:grid;grid-template-columns:repeat(${grid.cols},1fr);gap:6px">${html}</div>`;
}

function renderSeatGridMaint(terms, m, c, d, md){
  const crRows = c.rows||7; const crCols = c.cols||6;
  const sorted = [...terms].sort((a,b)=>(a.seat||'').localeCompare(b.seat||''));
  const scope = md.scope || [];
  const ipPreview = md.ipPreview || [];
  return `<div style="display:grid;grid-template-columns:repeat(${Math.min(crCols,8)},1fr);gap:6px">
    ${sorted.map(t=>{
      const isMother = t.id===m.id;
      if(isMother) return `<div class="gb" style="opacity:.5;border-color:var(--t-warn)">
        <div class="gb-seat">${esc(t.seat||'--')}</div>
        <div class="gb-tag" style="color:var(--t-warn)">母机</div>
      </div>`;
      const checked=scope.includes(t.id);
      const pv = ipPreview.find(x=>x.terminalId===t.id);
      return `<div class="gb ${checked?'gb-bound':'gb-active'}" style="cursor:pointer" data-maint-toggle="${t.id}">
        <div class="gb-seat">${esc(t.seat||'--')}</div>
        <div class="gb-ip">${esc(t.ip||'--')}${pv?' → '+esc(pv.newIp):''}</div>
        ${checked?`<div class="gb-tag" style="color:var(--t-ok)">已选</div>`
          :`<div class="gb-tag">${t.online?'在线':'离线'}</div>`}
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
  const labels=['母机准备','占位与规则','终端绑定','部署传输'];

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
        <option value="incremental" ${(d.deployMode||'incremental')==='incremental'?'selected':''}>增量更新（仅同步差异，更快）</option>
        <option value="full" ${d.deployMode==='full'?'selected':''}>全量部署（完整覆盖，更可靠）</option>
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
  const labels=['母机准备','占位与规则','终端绑定','部署传输'];

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
        <div class="prep-field"><label>IP 前缀</label><input type="text" data-rule="ipBase" value="${esc(r.ipBase||'')}" placeholder="如 10.21.31"></div>
        <div class="prep-field"><label>起始编号</label><input type="number" data-rule="ipStart" value="${r.ipStart||20}" min="1" max="254"></div>
      </div>
      <div class="prep-group mb-8">
        <h4>网格布局</h4>
        <div class="prep-field"><label>每列座位数</label><input type="number" data-grid="rows" value="${grid.rows}" min="1" max="20"></div>
        <div class="prep-field"><label>列数</label><input type="number" data-grid="cols" value="${grid.cols}" min="1" max="15"></div>
        <div style="font-size:.75rem;color:var(--t-text2);margin-top:4px">共 ${grid.blocks.length} 位 · ${pill('可用 '+activeCount,'ok')} ${disabledCount?pill('禁用 '+disabledCount,'muted'):''} ${deletedCount?pill('删除 '+deletedCount,'err'):''}</div>
      </div>
      <div class="prep-group mb-8">
        <h4>机器名 / 座位号</h4>
        <div class="prep-field"><label>机器名前缀</label><input type="text" data-rule="namePrefix" value="${esc(r.namePrefix||'')}" placeholder="如 D301"></div>
        <div class="prep-field"><label>座位起始字母</label><input type="text" data-rule="startLetter" value="${esc(r.startLetter||'A')}" maxlength="1" style="width:50px;text-transform:uppercase"></div>
        <div style="padding:6px 10px;background:var(--t-panel);border:1px solid var(--t-border);border-radius:4px;font-size:.78rem;color:var(--t-text);margin-top:4px;font-family:monospace">
          机器名预览: <strong>${esc(exName)}</strong> · 座位号: <strong>${esc(exSeat)}</strong>
        </div>
        <div style="font-size:.7rem;color:var(--t-text3);margin-top:2px">机器名 = 机器名前缀 + "-" + 座位号，座位号 = 字母 + 序号</div>
      </div>
      <div style="font-size:.75rem;color:var(--t-ok)">点击右侧网格块可切换状态</div>
      <div style="font-size:.7rem;color:var(--t-text3);margin-top:4px">● 可用 → 禁用 → 删除 → 可用 循环切换</div>
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
            `<button class="btn ${dir===v?'btn-primary':'btn-ghost'}" data-rule-dir="${v}">${l}</button>`
          ).join('')}
        </div>
        <div style="font-size:.78rem;color:var(--t-text2);margin-left:8px">编号排布</div>
        <div style="display:flex;gap:4px">
          <button class="btn ${flow==='col'?'btn-primary':'btn-ghost'}" data-rule-flow="col">列优先（纵向）</button>
          <button class="btn ${flow==='row'?'btn-primary':'btn-ghost'}" data-rule-flow="row">行优先（横向）</button>
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
    <button class="btn btn-primary" ${activeCount?'':'disabled'} data-deploy-step="2">下一步：终端绑定（${activeCount} 个可用位）</button>
  </div>
</div>`;
}


/* ═══════════════════════════════════════════════════
   NEW DEPLOY FLOW: STEP 3 — 终端绑定
   ═══════════════════════════════════════════════════ */
function deployBindScreen(){
  const m=mt(); const c=cr(); const d=demo().deployDraft;
  const r=d.rules;
  const grid=d.grid||{rows:7,cols:6,blocks:[]};
  const bindings=d.bindings||{};
  const labels=['母机准备','占位与规则','终端绑定','部署传输'];
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
      <div style="font-size:.72rem;color:var(--t-text2)">绑定进度</div>
      <div style="font-size:1rem;font-weight:700;color:${boundCount===activeBlocks.length?'var(--t-ok)':'var(--t-accent)'}">${boundCount} / ${activeBlocks.length}</div>
    </div>
    <div class="card" style="flex:1;min-width:120px;padding:10px">
      <div style="font-size:.72rem;color:var(--t-text2)">部署模式</div>
      <div style="font-size:.82rem">${d.deployMode==='full'?'全量部署':'增量更新'}</div>
    </div>
  </div>

  <div class="section-sub">
    请到每台终端按 Enter 键绑定。
    ${nextUnbound?`下一个待绑定位置: <strong style="color:var(--t-accent)">${esc(nextUnboundSeat)}</strong>`
      :pill('全部已绑定','ok')}
    <span style="float:right;display:flex;gap:6px">
      <button class="btn btn-ghost" data-act="deploy-bind-next">模拟绑定（下一台）</button>
      <button class="btn btn-ghost" data-act="deploy-bind-all">一键全绑定</button>
    </span>
    <div style="font-size:.72rem;color:var(--t-text3);margin-top:4px">💡 点击已绑定的方块可将其改为"禁用占位"，后续终端自动顺延</div>
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
          html+=`<div class="gb ${isBound?'gb-bound':isNext?'gb-next':'gb-waiting'}" data-bind-skip="${b.idx}" style="cursor:pointer" title="${seat} · ${isBound?'点击禁用并顺延后续绑定':'点击禁用此位置'}">
            <div class="gb-seat">${esc(seat)}</div>
            ${asgn?`<div class="gb-ip">${esc(asgn.ip)}</div>`:''}
            ${isBound?`<div class="gb-tag" style="color:var(--t-ok)">已绑定</div>`
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
    <button class="btn btn-primary" ${boundCount>=1?'':'disabled'} data-act="start-deployment">开始部署传输（${boundCount} 台）</button>
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
  const labels=['母机准备','占位与规则','终端绑定','部署传输'];
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
            html+=`<div class="gb gb-waiting"><div class="gb-seat">${esc(seat)}</div><div class="gb-tag">未绑定</div></div>`;
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
  <div class="section-title"><button class="btn btn-ghost btn-sm" data-act="return-workbench">←</button> 修改 IP / 服务器地址</div>
  <div class="page-scroll">
  <div style="display:grid;grid-template-columns:360px 1fr;gap:20px;align-items:start">
    <div>
      <div class="section-title" style="font-size:.9rem">批量规则</div>
      <div class="card mb-16" style="max-width:480px">
        <div class="prep-field"><label>新服务器地址</label><input type="text" id="mip-srv" value="${esc(d.newServerAddr||c.serverAddress||'')}" placeholder="留空则不修改"></div>
        <div class="prep-field"><label>新 IP 前缀</label><input type="text" id="mip-base" value="${esc(d.newIpBase||c.networkBase||'')}" placeholder="留空则不修改 IP"></div>
        <div class="prep-field"><label>IP 起始编号</label><input type="number" id="mip-start" value="${d.newIpStart||20}" min="1" max="254"></div>
        <div class="prep-field"><label>子网掩码</label><input type="text" id="mip-mask" value="${esc(d.newSubnetMask||'255.255.255.0')}" placeholder="255.255.255.0"></div>
        <div class="prep-field"><label>网关</label><input type="text" id="mip-gw" value="${esc(d.newGateway||c.gateway||'')}" placeholder="留空则不修改"></div>
        <div class="prep-field"><label>DNS</label><input type="text" id="mip-dns" value="${esc(d.newDns||(c.dns||[]).join(','))}" placeholder="留空则不修改"></div>
      </div>
      <div style="font-size:.75rem;color:var(--t-ok);margin-top:4px">修改规则或拖动终端后自动刷新预览</div>
    </div>
    <div>
      <div class="section-title" style="font-size:.9rem">终端选择 · 已选 ${d.scope.length}
        <span style="font-size:.75rem;color:var(--t-text2);margin-left:8px">点击方块可切换选中</span></div>
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
          return `<div class="dt-card ${checked?'selected':''} ${!t.online?'offline-look':''}" style="cursor:pointer;padding:8px 10px;font-size:.78rem;border-left:3px solid ${checked?'var(--t-accent)':'var(--t-border)'}" data-maint-toggle="${t.id}">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <span style="font-weight:600;font-size:.85rem">${esc(t.seat||'--')}</span>
              <span>${t.online?pill('在线','ok'):pill('离线','err')}</span>
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
    <button class="btn btn-ghost" data-act="return-workbench">取消</button>
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
    return `<div class="page">
    <div class="section-title"><button class="btn btn-ghost btn-sm" data-act="go-home">←</button> 替换故障终端</div>
    <div class="card" style="border-color:var(--t-ok);background:rgba(34,197,94,0.08);max-width:720px;margin-top:24px">
      <div class="card-header" style="color:var(--t-ok)">替换已完成</div>
      <div style="font-size:.85rem">本机已继承 ${esc(fr.suggestedSeat||'--')} 位置的全部配置与桌面资产。</div>
    </div>
    </div>`;
  }

  if(fr.replacing){
    return `<div class="page" style="display:flex;flex-direction:column;align-items:center;justify-content:center">
    <div style="max-width:480px;width:100%;text-align:center">
      <div style="font-size:1.3rem;font-weight:600;margin-bottom:16px">正在替换中…</div>
      <div class="progress-bar" style="width:100%;height:12px;margin-bottom:12px"><div class="fill" style="width:65%"></div></div>
      <div style="font-size:.85rem;color:var(--t-text2);margin-bottom:8px">正在从服务器同步配置与桌面数据</div>
      <div style="font-size:.9rem;color:var(--t-err);font-weight:600">⚠ 切勿关闭电源或中断网络</div>
    </div>
    </div>`;
  }

  return `<div class="page">
  <div class="section-title"><button class="btn btn-ghost btn-sm" data-act="go-home">←</button> 替换故障终端</div>
  <div class="section-sub">选择教室和要替换的终端座位，本机将继承该终端的配置与桌面。</div>

  ${!serverOk?`<div class="card mb-16" style="border-color:var(--t-warn);max-width:720px">
    <div style="font-size:.85rem;color:var(--t-warn)">⚠ 无法连接服务器，请检查网络配置后重试。</div>
  </div>`:`
  <div style="display:grid;grid-template-columns:240px 1fr;gap:16px;align-items:start">
    <div class="card">
      <div class="card-header">选择教室</div>
      ${allCrs.length?allCrs.map(cr=>`
        <div class="dt-card mb-4 ${cr.id===selectedCrId?'selected':''}" style="cursor:pointer;padding:6px 10px;font-size:.82rem" data-fault-cr="${cr.id}">
          <span>${esc(cr.name)}</span>
        </div>
      `).join(''):'<div style="font-size:.82rem;color:var(--t-text3);padding:8px 0">无已注册教室</div>'}
    </div>
    <div class="card">
      <div class="card-header">选择终端座位 ${selectedCr?'— '+esc(selectedCr.name):''}</div>
      ${!selectedCr?'<div style="font-size:.82rem;color:var(--t-text3);padding:16px 0;text-align:center">← 请先选择教室</div>'
        :crTerms.length?`<div style="display:grid;grid-template-columns:repeat(${Math.min(selectedCr.cols||8, 8)},1fr);gap:6px;max-width:640px">
          ${crTerms.map(t=>`
            <div class="gb gb-active" style="cursor:pointer;aspect-ratio:1;min-height:0" data-fault-select="${t.id}">
              <div class="gb-seat">${esc(t.seat||'--')}</div>
              <div style="font-size:.6rem;color:var(--t-text2)">${esc(t.name||'')}</div>
            </div>
          `).join('')}
        </div>`:'<div style="font-size:.82rem;color:var(--t-text3);padding:16px 0;text-align:center">该教室无其他终端</div>'}
    </div>
  </div>`}
</div>`;
}

function faultResetScreen(){
  const m=mt(); const frs=demo().faultReset||{};
  const serverOk = frs.serverReachable;

  if(frs.confirmed){
    return `<div class="page" style="display:flex;flex-direction:column;align-items:center">
    <div style="max-width:480px;width:100%">
    <div class="section-title"><button class="btn btn-ghost btn-sm" data-act="go-home">←</button> 重置终端</div>
    <div class="card" style="border-color:var(--t-ok);background:rgba(34,197,94,0.08);width:100%;margin-top:24px">
      <div class="card-header" style="color:var(--t-ok)">重置已完成</div>
      <div style="font-size:.85rem">已从服务器重新拉取全部注册数据覆盖本机。</div>
    </div>
    </div>
    </div>`;
  }

  if(frs.resetting){
    return `<div class="page" style="display:flex;flex-direction:column;align-items:center;justify-content:center">
    <div style="max-width:480px;width:100%;text-align:center">
      <div style="font-size:1.3rem;font-weight:600;margin-bottom:16px">正在重置…</div>
      <div class="progress-bar" style="width:100%;height:12px;margin-bottom:12px"><div class="fill" style="width:40%"></div></div>
      <div style="font-size:.85rem;color:var(--t-text2);margin-bottom:8px">正在从服务器拉取注册数据</div>
      <div style="font-size:.9rem;color:var(--t-err);font-weight:600">⚠ 切勿关闭电源或中断网络</div>
    </div>
    </div>`;
  }

  return `<div class="page" style="display:flex;flex-direction:column;align-items:center">
  <div style="max-width:480px;width:100%">
  <div class="section-title"><button class="btn btn-ghost btn-sm" data-act="go-home">←</button> 重置终端</div>

  ${!serverOk?`<div class="card mb-16" style="border-color:var(--t-warn);width:100%;margin-top:16px">
    <div style="font-size:.85rem;color:var(--t-warn)">⚠ 无法连接服务器，请检查网络配置后重试。重置功能需要服务器在线。</div>
  </div>`:''}

  <div class="card mb-16" style="width:100%;border-color:var(--t-err);background:var(--t-err-bg);margin-top:16px">
    <div style="font-size:.95rem;font-weight:600;color:var(--t-err);margin-bottom:8px">⚠ 重置终端</div>
    <div style="font-size:.85rem;color:var(--t-text);line-height:1.6">
      重置将<b>清除本机所有数据</b>，包括桌面、配置和未同步的修改，恢复为服务器上的注册状态。<br><br>
      此操作<b>不可撤销</b>。如果本机有尚未同步到服务器的桌面或配置变更，重置后将<b>永久丢失</b>。<br><br>
      <span style="color:var(--t-text2)">建议在重置前确认所有重要数据已同步到服务器。</span>
    </div>
  </div>

  <div style="display:flex;gap:10px">
    <button class="btn btn-ghost" data-act="go-home">取消</button>
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
  const c=cr(); const terms=termsInCr(s(), c.id);
  const incomplete = terms.filter(t=>!t.name||!t.ip);
  const exportName = demo().flags?.exportCrName || c.name;
  const exportRemark = demo().flags?.exportCrRemark || '';
  return `<div class="page">
  <div class="section-title"><button class="btn btn-ghost btn-sm" data-act="return-workbench">←</button> 导出教室终端清单</div>
  <div class="page-scroll">
  <div class="section-sub">导出 Excel 文件，可导入管理服务器完成建档。</div>
  ${incomplete.length?`<div class="card mb-16" style="border-color:var(--t-warn)">
    <div style="font-size:.85rem;color:var(--t-warn)">提示：有 ${incomplete.length} 台终端信息不完整（缺少机器名或 IP），导出内容可能不全。</div>
  </div>`:''}
  <div class="card mb-16">
    <div class="prep-field"><label>教室名称（导出用）</label><input type="text" id="export-cr-name" value="${esc(exportName)}" placeholder="导出时使用的教室名称"></div>
    <div class="prep-field"><label>教室备注（可选）</label><input type="text" id="export-cr-remark" value="${esc(exportRemark)}" placeholder="填写备注信息，将包含在导出文件中"></div>
    ${defRow('终端数', terms.length+' 台')}
    ${defRow('信息完整', (terms.length-incomplete.length)+' / '+terms.length+' 台')}
  </div>
  <table class="data-table" style="font-size:.8rem">
    <thead><tr><th>#</th><th data-sort>座位</th><th data-sort>机器名</th><th data-sort>IP</th><th>硬盘序列号</th></tr></thead>
    <tbody>${terms.map((t,i)=>`<tr class="${(!t.name||!t.ip)?'conflict':''}">
      <td>${i+1}</td>
      <td>${esc(t.seat||'--')}</td><td>${esc(t.name||'--')}</td>
      <td class="mono">${esc(t.ip||'--')}</td>
      <td class="mono">${esc(t.hw?.diskSn||'--')}</td></tr>`).join('')}</tbody>
  </table>
  </div>
  <div style="margin-top:16px">
    <button class="btn btn-primary" data-act="export-simulated">导出 Excel</button>
    <span style="font-size:.75rem;color:var(--t-text3);margin-left:8px">修改教室名称仅影响导出文件，不影响系统内信息</span>
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
      if(a==='confirm-takeover'){
        const nm=root.querySelector('#tk-name');
        act(a,nm?{classroomName:nm.value}:{});
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
      } else if(a==='export-simulated'){
        const crName = root.querySelector('#export-cr-name')?.value||'';
        const crRemark = root.querySelector('#export-cr-remark')?.value||'';
        act('set-flag',{exportCrName:crName, exportCrRemark:crRemark});
        showTermAlert('终端清单已生成（原型模拟）——实际产品将下载 Excel 文件。\n导出教室名称: '+crName+(crRemark?'\n备注: '+crRemark:''));
      } else if(a==='open-fault-replace-direct'){
        act('open-fault-replace');
      } else if(a==='open-fault-reset-direct'){
        act('open-fault-reset');
      } else if(a==='fault-reset-confirm-with-dialog'){
        showTermConfirm('确认重置','重置将丢弃本机所有未同步的数据，以服务器注册内容为准。<br><b>此操作不可撤销。</b>',()=>act('fault-reset-confirm'));
      } else if(a==='exit-to-desktop'){
        showTermConfirm('退出管理系统','确定要退出管理系统并重启进入桌面吗？',()=>showTermAlert('系统将重启进入桌面（原型模拟）'));
      } else if(a==='deploy-bind-next'){
        /* Simulate binding the next available online controlled terminal */
        const terms = termsInCr(s(), cr().id).filter(t=>t.id!==mt().id&&t.online&&t.controlState==='controlled');
        const bindings = demo().deployDraft?.bindings||{};
        const boundIds = new Set(Object.values(bindings).map(b=>b.terminalId));
        const nextTerm = terms.find(t=>!boundIds.has(t.id));
        if(nextTerm) act('deploy-bind-terminal',{terminalId:nextTerm.id});
        else showTermAlert('所有在线终端已绑定完毕');
      } else if(a==='deploy-bind-all'){
        act('deploy-bind-all-terminals');
      } else if(a==='start-deployment'){
        /* Save deploy mode before starting */
        const modeSel = root.querySelector('#deploy-mode-sel');
        if(modeSel) act('deploy-set-deploy-mode',{mode:modeSel.value});
        setTimeout(()=>act('start-deployment'),50);
      } else if(a==='wb-tab-layout'){
        saveGridRulesIfPresent();
        act('set-flag',{wbTab:'layout'});
      } else if(a==='wb-tab-maint'){
        saveGridRulesIfPresent();
        act('set-flag',{wbTab:'maint'});
      } else if(a==='ops-mode-deploy'){
        act('set-flag',{opsMode:'deploy'});
      } else if(a==='ops-mode-maint-ip'){
        act('set-flag',{opsMode:'maint-ip'});
        act('open-maint-ip');
      } else if(a==='ops-mode-idle'){
        act('set-flag',{opsMode:'idle'});
      } else if(a==='ops-clear-task'){
        /* Clear completed task and reset opsMode */
        act('set-flag',{opsMode:'idle'});
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
      } else if(type==='local-network'){
        act('save-local-network',{serverAddr:root.querySelector('#ln-srv')?.value});
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
      const label=t?(esc(t.seat||'--')+' / '+esc(t.name||'--')):'该终端';
      showTermConfirm('确认替换','确定要替换 <b>'+crLabel+'</b> 的 <b>'+label+'</b> 吗？<br>本机将继承该终端的全部配置与桌面。此操作不可撤销。',()=>act('fault-replace-confirm-direct',{terminalId:tid}));
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

  /* ── grid dimension changes ── */
  root.querySelectorAll('[data-grid]').forEach(el=>{
    el.addEventListener('change',()=>{
      const rows = Number(root.querySelector('[data-grid="rows"]')?.value||7);
      const cols = Number(root.querySelector('[data-grid="cols"]')?.value||6);
      act('deploy-set-grid',{rows, cols});
    });
  });

  /* ── deploy rules auto-save ── */
  let _ruleDebounce=null;
  function saveGridRulesIfPresent(){
    const rules={};
    root.querySelectorAll('[data-rule]').forEach(r=>{
      rules[r.dataset.rule]=r.type==='number'?Number(r.value):r.value;
    });
    if(Object.keys(rules).length) act('deploy-set-rules',rules);
  }
  root.querySelectorAll('[data-rule]').forEach(r=>{
    r.addEventListener('input',()=>{
      clearTimeout(_ruleDebounce);
      _ruleDebounce=setTimeout(()=>saveGridRulesIfPresent(),400);
    });
    r.addEventListener('change',()=>{
      clearTimeout(_ruleDebounce);
      _ruleDebounce=setTimeout(()=>saveGridRulesIfPresent(),200);
    });
  });

  /* ── maint IP auto-apply ── */
  let _maintDebounce=null;
  function autoApplyMaintRules(){
    clearTimeout(_maintDebounce);
    _maintDebounce=setTimeout(()=>act('maint-apply-ip-rules',{
      serverAddr:root.querySelector('#mip-srv')?.value,
      ipBase:root.querySelector('#mip-base')?.value,
      ipStart:Number(root.querySelector('#mip-start')?.value||20),
      subnetMask:root.querySelector('#mip-mask')?.value,
      gateway:root.querySelector('#mip-gw')?.value,
      dns:root.querySelector('#mip-dns')?.value}),400);
  }
  ['#mip-srv','#mip-base','#mip-start','#mip-mask','#mip-gw','#mip-dns'].forEach(sel=>{
    const el=root.querySelector(sel);
    if(el){
      el.addEventListener('input',autoApplyMaintRules);
      el.addEventListener('change',autoApplyMaintRules);
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
    el.addEventListener('click',()=>act('copy-desktop',{sourceId:el.dataset.dtCopy}));
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

  /* ── server address auto-detect on blur ── */
  const srvInput = root.querySelector('#ln-srv');
  if(srvInput){
    srvInput.addEventListener('blur',()=>{
      const addr = srvInput.value.trim();
      if(addr){
        act('set-flag',{serverConnStatus:'checking'});
        setTimeout(()=>act('set-flag',{serverConnStatus:'ok'}), 1800);
      }
    });
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
