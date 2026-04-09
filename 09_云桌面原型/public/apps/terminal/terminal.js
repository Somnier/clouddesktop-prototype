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
  ov.innerHTML=`<div class="t-modal"><div class="t-modal-title">${title}</div><div class="t-modal-msg">${msg}</div><div class="t-modal-actions"><button class="btn btn-ghost btn-sm" data-tm="cancel">取消</button><button class="btn btn-danger btn-sm" data-tm="ok">确认</button></div></div>`;
  document.body.appendChild(ov);
  ov.querySelector('[data-tm="cancel"]').addEventListener('click',()=>ov.remove());
  ov.querySelector('[data-tm="ok"]').addEventListener('click',()=>{ov.remove();onOk();});
  ov.addEventListener('click',(e)=>{if(e.target===ov)ov.remove();});
}
function showTermAlert(msg){
  const ov=document.createElement('div'); ov.className='t-modal-overlay';
  ov.innerHTML=`<div class="t-modal"><div class="t-modal-msg">${esc(msg)}</div><div class="t-modal-actions"><button class="btn btn-primary btn-sm" data-tm="ok">确定</button></div></div>`;
  document.body.appendChild(ov);
  ov.querySelector('[data-tm="ok"]').addEventListener('click',()=>ov.remove());
  ov.addEventListener('click',(e)=>{if(e.target===ov)ov.remove();});
}

function showExportDoneDialog(){
  const ov=document.createElement('div'); ov.className='t-modal-overlay';
  ov.innerHTML=`<div class="t-modal" style="max-width:420px">
    <div class="t-modal-title" style="color:var(--t-ok)">导出成功</div>
    <div class="t-modal-msg">桌面包已导出到默认下载目录：</div>
    <div style="background:var(--t-panel);border:1px solid var(--t-border);border-radius:var(--radius);padding:10px 14px;font-family:monospace;font-size:.82rem;color:var(--t-text);margin:8px 0 16px;word-break:break-all">C:\\Users\\当前用户\\Downloads\\desktop-export.cdpkg</div>
    <div class="t-modal-actions" style="gap:8px">
      <button class="btn btn-secondary btn-sm" data-tm="open">打开文件夹</button>
      <button class="btn btn-primary btn-sm" data-tm="ok">确定</button>
    </div>
  </div>`;
  document.body.appendChild(ov);
  ov.querySelector('[data-tm="ok"]').addEventListener('click',()=>ov.remove());
  ov.querySelector('[data-tm="open"]').addEventListener('click',()=>showTermAlert('已打开文件夹（原型模拟）'));
  ov.addEventListener('click',(e)=>{if(e.target===ov)ov.remove();});
}

function showImportDialog(){
  const ov=document.createElement('div'); ov.className='t-modal-overlay';
  ov.innerHTML=`<div class="t-modal" style="max-width:420px">
    <div class="t-modal-title" style="color:var(--t-text)">导入桌面</div>
    <div class="t-modal-msg">请选择导入的文件类型：</div>
    <div style="display:flex;flex-direction:column;gap:12px;margin-bottom:18px">
      <div class="dt-card" style="cursor:pointer" data-import-type="image">
        <div class="dt-name">基础镜像文件</div>
        <div class="dt-meta">支持 .vhd/.vhdx/.img/.iso/.wim 格式，导入后需要配置数据盘和部署方式</div>
      </div>
      <div class="dt-card" style="cursor:pointer" data-import-type="package">
        <div class="dt-name">成品桌面包</div>
        <div class="dt-meta">支持 .cdpkg 格式，包含完整桌面配置，直接生成桌面</div>
      </div>
    </div>
    <div class="t-modal-actions"><button class="btn btn-ghost btn-sm" data-tm="cancel">取消</button></div>
  </div>`;
  document.body.appendChild(ov);
  ov.querySelector('[data-tm="cancel"]').addEventListener('click',()=>ov.remove());
  ov.addEventListener('click',(e)=>{if(e.target===ov)ov.remove();});
  ov.querySelectorAll('[data-import-type]').forEach(el=>{
    el.addEventListener('click',()=>{
      ov.remove();
      const fileInput=document.querySelector('#usb-file-input');
      if(fileInput){
        fileInput.dataset.importType=el.dataset.importType;
        fileInput.click();
      }
    });
  });
}

function showCreateDesktopDialog(defaultName){
  const ov=document.createElement('div'); ov.className='t-modal-overlay';
  ov.innerHTML=`<div class="t-modal" style="max-width:420px">
    <div class="t-modal-title" style="color:var(--t-text)">从镜像创建桌面</div>
    <div class="t-modal-msg">基础镜像导入需要配置以下信息：</div>
    <div class="prep-field"><label>桌面名称</label><input type="text" id="cd-name" value="${esc(defaultName)}" placeholder="桌面名称"></div>
    <div class="prep-field"><label>数据盘大小</label><select id="cd-disk-size">
      <option value="">不添加数据盘</option>
      <option value="20GB" selected>20 GB</option>
      <option value="50GB">50 GB</option>
      <option value="100GB">100 GB</option>
    </select></div>
    <div class="prep-field"><label>数据盘盘符</label><input type="text" id="cd-disk-drive" value="D:" placeholder="如 D:"></div>
    <div class="prep-field"><label>部署方式</label><select id="cd-physical">
      <option value="false">虚拟部署（VHD）</option>
      <option value="true">物理部署（独立分区）</option>
    </select></div>
    <div class="prep-field"><label>还原模式</label><select id="cd-restore">
      <option>还原系统盘，保留数据盘</option>
      <option>还原系统盘和数据盘</option>
      <option>不还原</option>
    </select></div>
    <div class="prep-field"><label>备注</label><input type="text" id="cd-remark" value="" placeholder="可选"></div>
    <div class="t-modal-actions">
      <button class="btn btn-ghost btn-sm" data-tm="cancel">取消</button>
      <button class="btn btn-primary btn-sm" data-tm="create">创建桌面</button>
    </div>
  </div>
</div>`;
  document.body.appendChild(ov);
  ov.querySelector('[data-tm="cancel"]').addEventListener('click',()=>ov.remove());
  ov.addEventListener('click',(e)=>{if(e.target===ov)ov.remove();});
  ov.querySelector('[data-tm="create"]').addEventListener('click',()=>{
    const name = ov.querySelector('#cd-name')?.value||defaultName;
    const diskSize = ov.querySelector('#cd-disk-size')?.value;
    const diskDrive = ov.querySelector('#cd-disk-drive')?.value||'D:';
    const physical = ov.querySelector('#cd-physical')?.value==='true';
    const restoreMode = ov.querySelector('#cd-restore')?.value;
    const remark = ov.querySelector('#cd-remark')?.value||'';
    ov.remove();
    act('create-desktop-from-file',{
      name, os:'Windows 11 23H2', importType:'image',
      dataDiskSize:diskSize, dataDiskDrive:diskDrive,
      physicalDeploy:physical, restoreMode, remark
    });
  });
}

let _lastScreen = null;
function render(state){
  if(!state) return;
  const curScreen = demo().motherScreen;
  /* preserve scroll position only within the same screen */
  const scrollEl = root.querySelector('.page-scroll');
  const savedScroll = (scrollEl && curScreen === _lastScreen) ? scrollEl.scrollTop : 0;
  _lastScreen = curScreen;
  root.innerHTML = shellHtml();
  bindAll();
  /* restore scroll position only if same screen */
  const newScrollEl = root.querySelector('.page-scroll');
  if(newScrollEl && savedScroll) newScrollEl.scrollTop = savedScroll;
}


function shellHtml(){
  const m=mt(); const c=cr();
  return `<div class="term-shell">
    <div class="term-topbar">
      <div class="brand">云桌面管理系统</div>
      <div class="status">
        <span class="dot ${m?.online?'dot-ok':'dot-err'}"></span><span class="status-label ${m?.online?'sol':'sol-err'}">${m?.online?'在线':'离线'}</span>
        <span class="sep">·</span>
        <span class="mono">${esc(m?.mac||'--')}</span>
        <span class="sep">·</span>
        <span>${esc(m?.name||'未命名')}</span>
        <span class="sep">·</span>
        <span>${esc(m?.seat||'--')}</span>
        <span class="sep">·</span>
        <span class="mono">${m?.ip?esc(m.ip):'未配置IP'}</span>
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
    // Deploy flow: step0=motherPrep, step1=scope+rules, step2=desktopSelect, step3=confirm, step4=progress
    case 'deploy-mother-prep': return deployMotherPrepScreen();
    case 'deploy-main': return deployScopeRulesScreen();
    case 'deploy-desktop': return deployDesktopScreen();
    case 'deploy-confirm': return deployConfirmScreen();
    case 'deploy-progress': case 'deploy-result': return deployProgressScreen();
    // Maintenance: separate IP/server and desktop update
    case 'maint-menu': return maintMenuScreen();
    case 'maint-ip': return maintIpScreen();
    case 'maint-desktop-update': return maintDesktopUpdateScreen();
    case 'maint-desktop-select': return maintDesktopSelectScreen();
    case 'maint-confirm': return maintConfirmScreen();
    case 'maint-progress': case 'maint-result': return maintProgressScreen();
    // Exam
    case 'exam-main': return examMainScreen();
    case 'exam-desktop': return examDesktopScreen();
    case 'exam-confirm': return examConfirmScreen();
    case 'exam-progress': case 'exam-result': return examProgressScreen();
    case 'exam-active': return examActiveScreen();
    // Desktop editing
    case 'desktop-rebooting': return transientScreen('正在重启进入桌面…','系统将在桌面编辑完成后自动返回');
    case 'desktop-editor': return desktopEditorScreen();
    case 'desktop-merging': return transientScreen('正在合并桌面…','请稍候，系统正在合并编辑');
    // Other
    case 'selftest': return selfTestScreen();
    case 'export-list': return exportScreen();
    case 'fault-menu': return faultMenuScreen();
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


function homeScreen(){
  const m=mt(); const c=cr();
  const biosBootId = m.bios?.defaultBootId;
  const defaultDt = (m.desktops||[]).find(d=>d.id===biosBootId);
  const met = m.metrics||{};
  const memPct = met.memTotal ? Math.round(met.memUsed/met.memTotal*100) : 0;
  const diskPct = met.diskTotal ? Math.round(met.diskUsed/met.diskTotal*100) : 0;
  return `<div class="page">
  <div class="section-title">管理系统首页</div>

  <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:12px;margin-bottom:16px">
    <div class="card">
      <div class="card-header">可配置项</div>
      ${defRow('机器名', m.name||'未命名')}
      ${defRow('座位号', m.seat||'未分配')}
      ${defRow('终端用途', m.use||'未设定')}
      ${defRow('IP 地址', m.ip||'未配置', {mono:true})}
      ${defRow('默认启动桌面', defaultDt?defaultDt.name:'无桌面')}
    </div>
    <div class="card">
      <div class="card-header">外部连接</div>
      ${defRow('服务器地址', m.serverAddr||'未配置', {mono:true})}
      <div class="def-row"><span class="def-label">服务器状态</span><span class="def-value">${m.serverAddr?pill('已连接','ok'):pill('未配置','muted')}</span></div>
      <div class="def-row"><span class="def-label">终端注册</span><span class="def-value">${m.registered?pill('已注册','ok'):pill('未注册','muted')}</span></div>
      ${defRow('最近同步', m.lastSyncTime?fmtTime(m.lastSyncTime):'未同步')}
    </div>
    <div class="card">
      <div class="card-header">硬件信息</div>
      ${(()=>{
        const macs = m.macList||[];
        return macs.map((mac,idx)=>`<div class="def-row"><span class="def-label">${idx===0?'网卡':'备用网卡'}</span><span class="def-value mono">${esc(mac)}${mac===m.mac?' '+pill('工作中','ok'):''}</span></div>`).join('');
      })()}
      ${defRow('处理器', m.hw?.cpu||'--')}
      ${defRow('显卡', m.hw?.gpu||'--')}
      ${defRow('内存', m.hw?.mem||'--')}
      ${defRow('硬盘', (m.hw?.diskModel||'--')+' ('+esc(m.hw?.diskSn||'--')+')')}
    </div>
    <div class="card">
      <div class="card-header">运行状态</div>
      <div class="stat-box-compact">
        <div class="stat-mini" style="display:flex;align-items:baseline;gap:6px;font-size:.9rem"><span style="color:${met.cpu>80?'var(--t-err)':met.cpu>60?'var(--t-warn)':'var(--t-ok)'}">CPU ${met.cpu||0}%</span><span style="font-size:.75rem;padding:1px 5px;border-radius:3px;background:${(met.cpuTemp||0)>=80?'rgba(239,68,68,.15)':(met.cpuTemp||0)>=65?'rgba(245,158,11,.15)':'rgba(34,197,94,.08)'};color:${(met.cpuTemp||0)>=80?'var(--t-err)':(met.cpuTemp||0)>=65?'var(--t-warn)':'var(--t-ok)'}">${met.cpuTemp||'--'}°C</span></div>
        <div class="stat-mini" style="display:flex;align-items:baseline;gap:6px;font-size:.9rem"><span style="color:${met.gpu>80?'var(--t-err)':met.gpu>60?'var(--t-warn)':'var(--t-ok)'}">GPU ${met.gpu||0}%</span><span style="font-size:.75rem;padding:1px 5px;border-radius:3px;background:${(met.gpuTemp||0)>=80?'rgba(239,68,68,.15)':(met.gpuTemp||0)>=65?'rgba(245,158,11,.15)':'rgba(34,197,94,.08)'};color:${(met.gpuTemp||0)>=80?'var(--t-err)':(met.gpuTemp||0)>=65?'var(--t-warn)':'var(--t-ok)'}">${met.gpuTemp||'--'}°C</span></div>
        <div class="stat-mini" style="display:flex;align-items:baseline;gap:6px;font-size:.9rem"><span style="color:${memPct>85?'var(--t-err)':memPct>70?'var(--t-warn)':'var(--t-ok)'}">内存 ${met.memUsed||0}/${met.memTotal||0} GB</span><span style="font-size:.72rem;padding:1px 5px;border-radius:3px;background:var(--t-panel);color:var(--t-text2)">${memPct}%</span></div>
        <div class="stat-mini" style="display:flex;align-items:baseline;gap:6px;font-size:.9rem"><span style="color:${diskPct>85?'var(--t-err)':diskPct>70?'var(--t-warn)':'var(--t-ok)'}">磁盘 ${met.diskUsed||0}/${met.diskTotal||0} GB</span><span style="font-size:.72rem;padding:1px 5px;border-radius:3px;background:var(--t-panel);color:var(--t-text2)">${diskPct}%</span></div>
      </div>
    </div>
  </div>

  <div class="section-sub">单机功能</div>
  <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:16px">
    <button class="btn btn-secondary" data-act="open-local-info">本机配置</button>
    <button class="btn btn-secondary" data-act="open-local-network">服务器连接</button>
    <button class="btn btn-secondary" data-act="open-local-desktop">桌面管理</button>
    <button class="btn btn-secondary" data-act="open-fault-replace-direct">一键替换</button>
    <button class="btn btn-secondary" data-act="open-fault-reset-direct">一键重置</button>
    <button class="btn btn-secondary" data-act="open-selftest">本机测试</button>
  </div>

  <div class="section-sub">教室管理</div>
  <div style="display:flex;flex-wrap:wrap;gap:10px">
    <button class="btn btn-primary" data-act="open-takeover">${m.controlState==='mother'?'已接管教室 — 进入工作台':'进入教室管理'}</button>
  </div>
  </div>`;
}


function localInfoScreen(){
  const m=mt(); const c=cr();
  return `<div class="page">
  <div class="section-title"><button class="btn btn-ghost btn-sm" data-act="go-home">←</button> 本机配置</div>
  <div class="card" style="max-width:480px">
    <div class="prep-field"><label>机器名</label><input type="text" id="li-name" value="${esc(m.name||'')}" placeholder="输入机器名"></div>
    <div class="prep-field"><label>座位号</label><input type="text" id="li-seat" value="${esc(m.seat||'')}" placeholder="如 A-01"></div>
    <div class="prep-field"><label>终端用途</label><select id="li-use">
      <option value="未设定" ${(!m.use||m.use==='未设定')?'selected':''}>未设定</option>
      <option value="教师终端" ${m.use==='教师终端'?'selected':''}>教师终端</option>
      <option value="学生终端" ${m.use==='学生终端'?'selected':''}>学生终端</option>
    </select></div>
    <div style="border-top:1px solid var(--t-border);margin:16px 0 12px;padding-top:12px">
      <div style="font-size:.82rem;color:var(--t-text3);margin-bottom:8px">网络配置</div>
    </div>
    <div class="prep-field"><label>IP 地址</label><input type="text" id="li-ip" value="${esc(m.ip||'')}" placeholder="如 10.21.31.20"></div>
    <div class="prep-field"><label>子网掩码</label><input type="text" id="li-mask" value="${esc(m.subnetMask||'255.255.255.0')}" placeholder="255.255.255.0"></div>
    <div class="prep-field"><label>网关</label><input type="text" id="li-gw" value="${esc(m.gateway||c?.gateway||'')}" placeholder="网关地址"></div>
    <div class="prep-field"><label>DNS</label><input type="text" id="li-dns" value="${esc((m.dns||[]).join(','))}" placeholder="DNS 地址"></div>
    <div style="display:flex;gap:8px;margin-top:12px">
      <button class="btn btn-primary btn-sm" data-save="local-info">保存</button>
      <button class="btn btn-ghost btn-sm" data-act="go-home">取消</button>
    </div>
  </div>
  </div>`;
}


function localNetworkScreen(){
  const m=mt();
  return `<div class="page">
  <div class="section-title"><button class="btn btn-ghost btn-sm" data-act="go-home">←</button> 服务器连接</div>
  <div class="card" style="max-width:480px">
    <div class="prep-field"><label>服务器地址</label><input type="text" id="ln-srv" value="${esc(m.serverAddr||'')}" placeholder="管理服务器 IP 或域名"></div>
    <div style="display:flex;gap:8px;margin-top:12px">
      <button class="btn btn-primary btn-sm" data-save="local-network">保存</button>
      <button class="btn btn-ghost btn-sm" data-act="go-home">取消</button>
    </div>
  </div>
  </div>`;
}


function localDesktopScreen(){
  const m=mt(); const c=cr();
  const desktops = m.desktops||[];
  const returnAct = demo()._desktopReturnScreen ? 'desktop-return-flow' : (m.controlState==='mother'?'return-workbench':'go-home');
  const bid = m.bios?.defaultBootId;
  /* disk space from metrics */
  const diskTotal = m.metrics?.diskTotal || 512;
  const desktopUsed = desktops.reduce((s,d)=>s+(d.diskSize||45),0);
  const rawDiskUsed = m.metrics?.diskUsed || 0;
  const systemUsed = rawDiskUsed > desktopUsed ? rawDiskUsed - desktopUsed : 35;
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
        <div><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${diskPct>85?'var(--t-err)':diskPct>70?'var(--t-warn)':'var(--t-accent)'};margin-right:6px;vertical-align:middle"></span>桌面占用 ${desktopUsed} GB</div>
        <div><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:var(--t-text3);margin-right:6px;vertical-align:middle"></span>系统占用 ${systemUsed} GB</div>
        <div><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:var(--t-border);margin-right:6px;vertical-align:middle"></span>剩余可用 ${diskFree} GB</div>
        <div style="color:var(--t-text3);font-size:.75rem">总计 ${diskTotal} GB</div>
      </div>
    </div>
  </div>

  <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">
    <button class="btn btn-primary btn-sm" data-desktop-action="import">导入桌面</button>
    <button class="btn btn-secondary btn-sm" data-desktop-action="export-pkg">导出桌面</button>
    <input type="file" id="usb-file-input" style="display:none" accept=".vhd,.vhdx,.img,.iso,.wim,.cdpkg">
  </div>

  ${desktops.length ? '<div class="page-scroll">' + desktops.map(d=>{
    const isDefault = d.id===bid;
    const isHidden = d.visibility==='hidden';
    const dataDisks = d.dataDisks || [];
    const uploaded = d.uploaded || d.syncStatus==='synced';
    const isPhysical = d.physicalDeploy || false;
    return `
    <div class="dt-card mb-8 ${isDefault?'selected':''}" data-dt-id="${d.id}">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div class="dt-name">${esc(d.name)}</div>
        <div style="display:flex;gap:4px;flex-wrap:wrap">
          ${isDefault?pill('默认启动','info'):''}
          ${isHidden?pill('已隐藏','muted'):pill('显示','ok')}
          ${uploaded?pill('已上传','ok'):pill('未上传','warn')}
          ${isPhysical?pill('物理部署','warn'):''}
        </div>
      </div>
      <div class="dt-meta">${esc(d.baseImageName||d.os)} · ${d.diskSize||45} GB · 创建 ${fmtTime(d.createdAt)} · 更新 ${fmtTime(d.editedAt)}</div>
      ${d.remark?`<div class="dt-sw">备注: ${esc(d.remark)}</div>`:''}
      ${dataDisks.length?`<div class="dt-sw">数据盘: ${dataDisks.map(dd=>esc(dd.drive||'D:')+' '+esc(dd.size||'20GB')+(dd.sharedWith?.length?' '+pill('共享','info'):'')).join(', ')}</div>`:''}
      <div style="display:flex;align-items:center;gap:8px;margin-top:6px;font-size:.8rem">
        <span style="color:var(--t-text2)">还原模式:</span>
        <select data-dt-restore="${d.id}" style="font-size:.78rem;max-width:200px">
          <option ${d.restoreMode==='还原系统盘，保留数据盘'?'selected':''}>还原系统盘，保留数据盘</option>
          <option ${d.restoreMode==='还原系统盘和数据盘'?'selected':''}>还原系统盘和数据盘</option>
          <option ${d.restoreMode==='不还原'?'selected':''}>不还原</option>
        </select>
      </div>
      <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">
        <button class="btn btn-ghost btn-sm" data-dt-edit="${d.id}">进入桌面编辑</button>
        <button class="btn btn-ghost btn-sm" data-dt-copy="${d.id}">复制桌面</button>
        <button class="btn btn-ghost btn-sm${isDefault?' disabled-look':''}" ${isDefault?'disabled':''} data-dt-default="${d.id}">${isDefault?'已是默认':'设为默认'}</button>
        <button class="btn btn-ghost btn-sm" data-dt-visibility="${d.id}">${isHidden?'取消隐藏':'隐藏'}</button>
        <button class="btn btn-ghost btn-sm" style="color:var(--t-err)" data-dt-delete="${d.id}">删除</button>
      </div>
    </div>`;
  }).join('') + '</div>' : empty('暂无本机桌面','请导入桌面镜像或桌面包')}
  </div>`;
}


function takeoverScreen(){
  const tk=demo().takeover; const c=cr();
  const terms = termsInCr(s(), c.id).filter(t=>t.id!==mt().id&&t.online);
  const scanInfo = tk.scanInfo||{};
  const hasOtherGroups = Object.keys(tk.otherGroups||{}).length > 0;
  return `<div class="page">
  <div class="section-title"><button class="btn btn-ghost btn-sm" data-act="go-home">←</button> 教室接管</div>
  <div style="display:flex;gap:16px;margin-bottom:16px;flex-wrap:wrap;align-items:flex-start">
    <div class="card" style="flex:1;min-width:280px">
      <div class="card-header">接管模式：${tk.mode==='initial'?'初次接管（新教室）':'接管已有教室'}</div>
      <div class="prep-field"><label>教室名称</label><input type="text" id="tk-name" value="${esc(tk.classroomName||'')}" placeholder="输入教室名称"></div>
      <div class="prep-field"><label>发现终端</label><span>${tk.scannedMacs.length} 台已响应</span></div>
      ${tk.groups.main.length?`<div class="prep-field"><label>本教室</label><span>${tk.groups.main.length} 台</span></div>`:''}
      ${tk.groups.unbound.length?`<div class="prep-field"><label>未绑定</label><span>${tk.groups.unbound.length} 台</span></div>`:''}
      ${tk.groups.other.length?`<div class="prep-field"><label>其他教室</label><span class="text-warn">${tk.groups.other.length} 台</span></div>`:''}
    </div>
    ${hasOtherGroups?`<div class="card" style="flex:1;min-width:280px;border-color:var(--t-warn)">
      <div class="card-header" style="color:var(--t-warn)">当前网络内存在其他教室</div>
      <div style="font-size:.8rem;color:var(--t-text2);margin-bottom:8px">本次只能选择 1 组继续接管，其他组不会纳入本次操作。</div>
      ${Object.entries(tk.otherGroups||{}).map(([crId,grp])=>`<div class="def-row"><span class="def-label">${esc(grp.name||crId)}</span><span class="def-value">${grp.macs.length} 台</span></div>`).join('')}
    </div>`:''}
  </div>
  <div class="section-sub">终端扫描结果（仅在线已响应终端）</div>
  <div class="page-scroll">
  <table class="data-table">
    <thead><tr><th>序号</th><th>当前工作 MAC</th><th>归属教室</th></tr></thead>
    <tbody>${terms.map((t,i)=>{
      const info = scanInfo[t.mac]||{};
      const groupLabel = tk.groups.main.includes(t.mac)?esc(tk.classroomName||'本教室')
        : tk.groups.unbound.includes(t.mac)?'未绑定'
        : esc(info.boundCrName||'其他教室');
      const groupTone = tk.groups.main.includes(t.mac)?'ok':tk.groups.unbound.includes(t.mac)?'info':'warn';
      return `<tr><td>${i+1}</td><td class="mono">${esc(t.mac)}</td>
        <td>${pill(groupLabel, groupTone)}</td></tr>`;
    }).join('')}</tbody>
  </table>
  </div>
  <div style="margin-top:12px;display:flex;gap:10px;flex-shrink:0">
    <button class="btn btn-primary" data-act="confirm-takeover">确认接管教室</button>
    <button class="btn btn-ghost" data-act="go-home">取消</button>
  </div>
  </div>`;
}


function workbenchScreen(){
  const m=mt(); const c=cr(); const st=s();
  const terms=termsInCr(st, c.id); const rt=crRuntime(st, c.id); const tk=taskForCr(st, c.id);
  const isBlank = c.stage==='blank'||c.stage==='bound';
  const examMode = demo().examState?.applied && !demo().examState?.restored;
  const alerts = alertsInCr(st, c.id);
  return `<div class="page">
  <div class="section-title">教室工作台 ${pill(stageLabel(c.stage), c.stage==='deployed'?'ok':'info')}
    ${examMode?pill('考试模式','warn'):''}</div>

  <div style="display:flex;gap:12px;margin-bottom:12px;flex-wrap:wrap;align-items:stretch">
    <div class="card" style="flex:0 0 260px;min-width:240px">
      <div class="card-header">教室信息</div>
      ${defRow('教室名称', c.name)}
      ${defRow('在线', rt.online+' / '+rt.total+' 台')}
      ${defRow('已部署', rt.deployed+' / '+rt.total+' 台')}
      ${tk?`${defRow('当前任务', tk.label+' — '+phaseLabel(tk.phase))} ${defRow('进度', (tk.counts.completed+tk.counts.failed)+'/'+tk.counts.total)}`:''}
    </div>
    ${alerts.length?`<div class="card" style="flex:1;min-width:300px">
      <div class="card-header" style="color:var(--t-warn);display:flex;justify-content:space-between;align-items:center">
        <span>教室告警 · ${alerts.length} 条</span>
        <span style="display:flex;gap:4px">
          <button class="btn btn-ghost btn-sm" data-alert-sort="severity" title="按严重程度排序">${(demo().flags?.alertSortKey||'severity')==='severity'?((demo().flags?.alertSortDir||'desc')==='desc'?'严重↓':'严重↑'):'严重'}</button>
          <button class="btn btn-ghost btn-sm" data-alert-sort="time" title="按时间排序">${(demo().flags?.alertSortKey)==='time'?((demo().flags?.alertSortDir||'desc')==='desc'?'时间↓':'时间↑'):'时间'}</button>
        </span>
      </div>
      ${(()=>{
        const sevOrder={high:0,medium:1,low:2};
        const sortKey = demo().flags?.alertSortKey || 'severity';
        const sortDir = demo().flags?.alertSortDir || 'desc';
        const sorted=[...alerts].sort((a,b)=>{
          if(sortKey==='time'){
            const diff=new Date(b.at).getTime()-new Date(a.at).getTime();
            return sortDir==='asc'?-diff:diff;
          }
          const diff=(sevOrder[a.level]??9)-(sevOrder[b.level]??9);
          return sortDir==='asc'?-diff:diff;
        });
        const levelPill={high:'err',medium:'warn',low:'muted'};
        const levelLabel={high:'高',medium:'中',low:'低'};
        const renderAlert = a => {
          const at=getTerm(st,a.terminalId);
          return `<div class="alert-row-t ${a.level}">
            <div class="art-level">${pill(levelLabel[a.level]||'',levelPill[a.level]||'muted')}</div>
            <div class="art-body"><span class="art-title">${esc(a.title)}</span> <span class="art-detail">${esc(a.detail)}${at?' · '+esc(at.seat||at.mac):''}</span></div>
            <div class="art-time">${relTime(a.at)}</div>
          </div>`;
        };
        return `<div style="max-height:200px;overflow-y:auto">
          ${sorted.map(renderAlert).join('')}
        </div>`;
      })()}
    </div>`:''}
  </div>

  ${examMode?`
    <div class="card mb-12" style="border-color:var(--t-warn-border);background:var(--t-warn-bg,rgba(255,180,0,0.08))">
      <div class="card-header" style="color:var(--t-warn)">当前处于考试模式</div>
      <div style="font-size:.85rem;color:var(--t-text2);margin-bottom:8px">需要先恢复考前状态才能进行其他操作。</div>
      <button class="btn btn-primary" data-act="start-exam-restore">恢复考前状态</button>
    </div>
  `:`
  <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:12px">
    ${isBlank?`<button class="btn btn-primary" data-act="open-deployment">单教室部署</button>`
      :`<button class="btn btn-primary" data-act="open-maint-menu">教室维护</button>
         <button class="btn btn-secondary" data-act="open-exam">考试场景</button>
         <button class="btn btn-secondary" data-act="open-deployment">重新部署</button>`}
    <button class="btn btn-secondary" data-act="open-export">导出清单</button>
    <button class="btn btn-danger" data-act="end-management">结束管理</button>
  </div>`}

  <div class="section-sub">教室终端列表 · ${rt.total} 台（含母机）</div>
  <div class="page-scroll">
  <table class="data-table">
    <thead><tr><th>#</th><th>当前工作 MAC</th>${isBlank?'':'<th data-sort>座位号</th><th data-sort>机器名</th><th data-sort>IP</th><th data-sort>用途</th>'}<th data-sort>状态</th></tr></thead>
    <tbody>${(()=>{ const sorted=[...terms].sort((a,b)=>{ if(a.use==='教师终端'&&b.use!=='教师终端') return -1; if(a.use!=='教师终端'&&b.use==='教师终端') return 1; return 0; }); return sorted; })().map((t,i)=>{
      const isTeacher=t.use==='教师终端'; const isMother=t.id===m.id;
      return `<tr class="${!t.online?'offline-row':''}${isMother?' mother-row':''}${isTeacher?' teacher-row':''}">
      <td>${i+1}</td><td class="mono">${esc(t.mac)}${isMother?' '+pill('本机·母机','info'):''}</td>
      ${isBlank?'':`<td>${esc(t.seat||'--')}</td><td>${esc(t.name||'--')}</td><td class="mono">${esc(t.ip||'--')}</td><td>${isTeacher?pill('教师','warn'):pill('学生','muted')}</td>`}
      <td>${t.online?pill('在线','ok'):pill('离线','err')}</td>
    </tr>`}).join('')}</tbody>
  </div>
  </div>`;
}


function deployMotherPrepScreen(){
  const m=mt(); const c=cr(); const d=demo().deployDraft;
  const p=d.motherPrep;
  const labels=['母机自身准备','终端选择与规则预览','选择部署桌面','确认写入信息','本地分发'];
  return `<div class="page">
  ${stepBar(labels, 0)}
  <div class="page-scroll">
  <div class="section-title">母机自身准备</div>
  <div class="section-sub">在部署受控终端之前，请先确认母机自身信息、网络、桌面已就绪。</div>
  <div class="mother-prep mb-16">
    <div class="prep-group">
      <h4>本机信息</h4>
      <div class="prep-field"><label>机器名</label><input type="text" data-mp="name" value="${esc(p.name||'')}"></div>
      <div class="prep-field"><label>座位号</label><input type="text" data-mp="seat" value="${esc(p.seat||'')}"></div>
      <div class="prep-field"><label>用途</label><select data-mp="use">
        <option value="教师终端" ${p.use==='教师终端'?'selected':''}>教师终端</option>
        <option value="学生终端" ${p.use==='学生终端'?'selected':''}>学生终端</option>
      </select></div>
    </div>
    <div class="prep-group">
      <h4>网络与服务器</h4>
      <div class="prep-field"><label>IP 地址</label><input type="text" data-mp="ip" value="${esc(p.ip||'')}"></div>
      <div class="prep-field"><label>子网掩码</label><input type="text" data-mp="subnetMask" value="${esc(p.subnetMask||'255.255.255.0')}"></div>
      <div class="prep-field"><label>网关</label><input type="text" data-mp="gateway" value="${esc(p.gateway||'')}"></div>
      <div class="prep-field"><label>DNS</label><input type="text" data-mp="dns" value="${esc(p.dns||'')}"></div>
      <div class="prep-field"><label>服务器</label><input type="text" data-mp="serverAddr" value="${esc(p.serverAddr||'')}"></div>
    </div>
    <div class="prep-group">
      <h4>本机桌面</h4>
      ${m.desktops?.length?`<div>${m.desktops.map(dt=>`<div class="def-row" style="padding:3px 0"><span class="def-label" style="min-width:auto">${esc(dt.name)} ${esc(dt.version)}</span><span class="def-value">${dt.id===m.bios?.defaultBootId?pill('默认启动','info'):''}</span></div>`).join('')}</div>`
        :`<div style="font-size:.85rem;color:var(--t-text2)">暂无桌面，可先创建桌面再部署，也可不选桌面仅部署配置</div>`}
      <button class="btn btn-ghost btn-sm" data-act="open-local-desktop-flow" style="margin-top:8px">修改桌面</button>
    </div>
  </div>
  </div>
  <div style="display:flex;gap:10px">
    <button class="btn btn-primary" data-deploy-step="1">下一步：终端选择与规则</button>
    <button class="btn btn-ghost" data-act="return-workbench">返回工作台</button>
  </div>
</div>`;
}


function deployScopeRulesScreen(){
  const m=mt(); const c=cr(); const d=demo().deployDraft;
  const r=d.rules;
  const terms = termsInCr(s(), c.id).filter(t=>t.id!==m.id);
  const asgn = d.assignments||[];
  const labels=['母机自身准备','终端选择与规则预览','选择部署桌面','确认写入信息','本地分发'];
  return `<div class="page">
  ${stepBar(labels, 1)}
  <div class="page-scroll">
  <div style="display:grid;grid-template-columns:360px 1fr;gap:20px;align-items:start">
    <div>
      <div class="section-title">批量规则</div>
      <div class="prep-group mb-8">
        <h4>IP 与网络</h4>
        <div class="prep-field"><label>IP 前缀</label><input type="text" data-rule="ipBase" value="${esc(r.ipBase||'')}"></div>
        <div class="prep-field"><label>起始编号</label><input type="number" data-rule="ipStart" value="${r.ipStart||20}" min="1" max="254"></div>
        <div class="prep-field"><label>子网掩码</label><input type="text" data-rule="subnetMask" value="${esc(r.subnetMask||'255.255.255.0')}"></div>
        <div class="prep-field"><label>网关</label><input type="text" data-rule="gateway" value="${esc(r.gateway||'')}"></div>
        <div class="prep-field"><label>DNS</label><input type="text" data-rule="dns" value="${esc(r.dns||'')}"></div>
      </div>
      <div class="prep-group mb-8">
        <h4>机器名与座位号</h4>
        <div class="prep-field"><label>机器名前缀</label><input type="text" data-rule="namePrefix" value="${esc(r.namePrefix||'')}" placeholder="如 D301"></div>
        <div class="section-sub" style="font-size:.7rem;margin:0 0 6px">机器名 = 前缀 + 座位号，如 D301-A01</div>
        <div class="prep-field"><label>起始列号</label><input type="text" data-rule="seatStartCol" value="${esc(r.seatStartCol||'A')}" maxlength="1"></div>
        <div class="prep-field"><label>每列座位数</label><input type="number" data-rule="seatSeatsPerCol" value="${r.seatSeatsPerCol||7}" min="1" max="20"></div>
        <div class="section-sub" style="font-size:.7rem;margin:4px 0 0">A=第一纵列，每列从 01 起编</div>
        ${(()=>{
          const prefix = r.namePrefix||c.id.split('-')[1].toUpperCase();
          const startCol = r.seatStartCol||'A';
          const spc = r.seatSeatsPerCol||7;
          const seat1 = startCol+'01';
          const seat2 = startCol+String(Math.min(spc,2)).padStart(2,'0');
          return `<div style="font-size:.75rem;color:var(--t-text2);margin-top:6px;padding:4px 8px;background:var(--t-card-bg);border-radius:4px">
            预览: <span style="color:var(--t-ok);font-weight:600">${esc(prefix)}-${seat1}</span>、
            <span style="color:var(--t-ok);font-weight:600">${esc(prefix)}-${seat2}</span> …</div>`;
        })()}
      </div>
      <div class="prep-group mb-8">
        <h4>其他设置</h4>
        <div class="prep-field"><label>服务器地址</label><input type="text" data-rule="serverAddress" value="${esc(r.serverAddress||'')}"></div>
        <div class="prep-field"><label>默认用途</label><select data-rule="defaultUse">
          <option ${(r.defaultUse||'学生终端')==='学生终端'?'selected':''}>学生终端</option>
          <option ${r.defaultUse==='教师终端'?'selected':''}>教师终端</option>
        </select></div>
      </div>
      <div style="font-size:.75rem;color:var(--t-ok);margin-top:4px">修改规则或拖动终端后自动刷新预览</div>
    </div>
    <div>
      <div class="section-title">终端选择 · 已选 ${d.scope.length} / ${terms.length}
        <span style="font-size:.75rem;color:var(--t-text2);margin-left:auto">灰色=离线不可选</span></div>
      <div style="display:flex;gap:8px;margin-bottom:10px">
        <button class="btn btn-sm btn-secondary" data-act="deploy-select-all">全选在线</button>
        <button class="btn btn-sm btn-secondary" data-act="deploy-clear-scope">清空</button>
      </div>
      <div>
        <table class="data-table" style="font-size:.8rem">
          <thead><tr><th style="width:36px">选</th><th>#</th><th>MAC</th><th>→ 座位号</th><th>→ 机器名</th><th>→ IP</th><th>状态</th></tr></thead>
          <tbody>${(()=>{
            return terms.map((t,i)=>{
            const checked=d.scope.includes(t.id);
            const a=asgn.find(x=>x.terminalId===t.id);
            const offlineCls = !t.online ? ' offline-row' : '';
            const scopeIdx = d.scope.indexOf(t.id);
            return `<tr draggable="${t.online&&checked?'true':'false'}" data-drag-id="${t.id}" data-drag-idx="${i}" class="${checked?'':'keep'}${offlineCls}">
              <td><input type="checkbox" ${checked?'checked':''} ${!t.online?'disabled':''} data-toggle-term="${t.id}"></td>
              <td class="drag-handle" title="拖拽调整规则应用顺序">${checked?(scopeIdx+1):(t.online?'·':'')}</td>
              <td class="mono">${esc(t.mac.slice(-8))}</td>
              <td>${a?`<span style="color:var(--t-ok)">${esc(a.seat)}</span>`:(t.seat||'--')}</td>
              <td>${a?`<span style="color:var(--t-ok)">${esc(a.name)}</span>`:(t.name||'--')}</td>
              <td class="mono">${a?`<span style="color:var(--t-ok)">${esc(a.ip)}</span>`:(t.ip||'--')}</td>
              <td>${t.online?pill('在线','ok'):pill('离线','err')}</td>
            </tr>`;
          }).join('');})()}</tbody>
        </table>
      </div>
    </div>
  </div>
  </div>
  <div style="display:flex;gap:10px;margin-top:20px">
    <button class="btn btn-secondary" data-deploy-step="0">上一步：母机准备</button>
    <button class="btn btn-primary" data-deploy-step="2">下一步：选择桌面</button>
    <button class="btn btn-ghost" data-act="return-workbench">返回工作台</button>
  </div>
</div>`;
}


function deployDesktopScreen(){
  const m=mt(); const d=demo().deployDraft;
  const desktops = m.desktops||[];
  const labels=['母机自身准备','终端选择与规则预览','选择部署桌面','确认写入信息','本地分发'];
  return `<div class="page">
  ${stepBar(labels, 2)}
  <div class="section-sub">选择本次下发的桌面（可多选），可为每个桌面设置还原模式、默认启动和是否隐藏。</div>
  <div class="page-scroll">
  ${desktops.length ? desktops.map(d2=>{
    const checked = d.desktopIds.includes(d2.id);
    const isDefault = d.defaultDesktopId===d2.id;
    const isHidden = d2.visibility==='hidden';
    const restoreMode = d2.restoreMode||'还原系统盘，保留数据盘';
    return `<div class="dt-card mb-8 ${checked?'selected':''}" style="max-width:720px">
      <div style="display:flex;align-items:center;gap:10px">
        <input type="checkbox" ${checked?'checked':''} data-deploy-dt="${d2.id}">
        <div style="flex:1">
          <div class="dt-name">${esc(d2.name)} ${esc(d2.version)}</div>
          <div class="dt-meta">${esc(d2.baseImageName||d2.os)}</div>
          ${d2.remark?`<div class="dt-sw">备注: ${esc(d2.remark)}</div>`:''}
          ${d2.dataDisk?`<div class="dt-sw">数据盘: ${esc(d2.dataDisk)}</div>`:''}
        </div>
        <div style="display:flex;gap:4px;flex-wrap:wrap">
          ${isDefault&&checked?pill('默认启动','info'):''}
          ${isHidden?pill('隐藏','muted'):''}
        </div>
      </div>
      ${checked?`<div style="display:flex;gap:8px;margin-top:8px;align-items:center;flex-wrap:wrap;font-size:.82rem">
        <button class="btn btn-ghost btn-sm${isDefault?' disabled-look':''}" ${isDefault?'disabled':''} data-deploy-default="${d2.id}">${isDefault?'已是默认启动':'设为默认启动'}</button>
        <button class="btn btn-ghost btn-sm" data-dt-visibility="${d2.id}">${isHidden?'取消隐藏':'隐藏'}</button>
        <span style="color:var(--t-text3)">还原:</span>
        <select data-dt-restore="${d2.id}" style="font-size:.8rem;padding:2px 6px;background:var(--t-panel);color:var(--t-text);border:1px solid var(--t-border);border-radius:4px">
          <option ${restoreMode==='还原系统盘，保留数据盘'?'selected':''}>还原系统盘，保留数据盘</option>
          <option ${restoreMode==='还原系统盘和数据盘'?'selected':''}>还原系统盘和数据盘</option>
          <option ${restoreMode==='不还原'?'selected':''}>不还原</option>
        </select>
      </div>`:''}
    </div>`;
  }).join('') : empty('当前母机无桌面','请返回第一步点"修改本机桌面"新建桌面，或跳过直接部署配置。')}
  <div style="display:flex;gap:6px;margin-top:8px;margin-bottom:16px">
    <button class="btn btn-ghost btn-sm" data-act="open-local-desktop-flow">新建/编辑桌面</button>
  </div>
  </div>
  <div style="display:flex;gap:10px;margin-top:20px">
    <button class="btn btn-secondary" data-deploy-step="1">上一步</button>
    <button class="btn btn-primary" data-deploy-step="3">下一步：确认写入信息</button>
    <button class="btn btn-ghost" data-act="return-workbench">返回工作台</button>
  </div>
</div>`;
}


function deployConfirmScreen(){
  const m=mt(); const c=cr(); const d=demo().deployDraft;
  const assignments=d.assignments; const v=d.validation;
  const labels=['母机自身准备','终端选择与规则预览','选择部署桌面','确认写入信息','本地分发'];
  const selectedDts = (d.desktopIds||[]).map(id=>(m.desktops||[]).find(x=>x.id===id)).filter(Boolean);
  const defaultDt = (m.desktops||[]).find(x=>x.id===d.defaultDesktopId);
  return `<div class="page">
  ${stepBar(labels, 3)}
  <div class="page-scroll">
  <div class="section-title">确认写入信息</div>
  <div class="card mb-16" style="font-size:.85rem">
    <div class="card-header">桌面配置</div>
    ${selectedDts.length ? selectedDts.map(dt=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0">
      <span>${esc(dt.name)} ${esc(dt.version)}</span>
      <span style="display:flex;gap:4px">${dt.id===d.defaultDesktopId?pill('默认启动','info'):''}${dt.visibility==='hidden'?pill('隐藏','muted'):''}${pill(dt.restoreMode||'还原系统盘，保留数据盘','muted')}</span>
    </div>`).join('') : defRow('桌面','无（仅部署配置）')}
    <div style="border-top:1px solid var(--t-border);margin-top:8px;padding-top:8px">
    ${defRow('服务器地址', d.rules.serverAddress||'--', {mono:true})}
    ${defRow('目标终端', d.scope.length+' 台')}
    </div>
  </div>
  ${!v.valid?`<div class="card mb-16" style="border-color:var(--t-err);background:rgba(220,38,38,0.08)">
    <div class="card-header" style="color:var(--t-err)">校验未通过 — 请修正后再分发</div>
    ${v.errors.map(e=>`<div style="font-size:.8rem;padding:2px 0;color:var(--t-err)">${esc(e)}</div>`).join('')}
  </div>`:''}
  <div class="section-sub">逐台确认 · ${assignments.length} 台 · 点击单元格可修改 · <span style="color:var(--t-text3)">灰色=原值</span> <span style="color:var(--t-ok)">绿色=新值</span></div>
  <div style="overflow-x:auto">
    <table class="confirm-table">
      <thead><tr><th>#</th><th>MAC</th><th>座位号</th><th>机器名</th><th>IP</th><th>网关</th><th>用途</th></tr></thead>
      <tbody>${assignments.map((a,i)=>{
        const t=getTerm(s(),a.terminalId);
        const oldSeat=t?.seat||''; const oldName=t?.name||''; const oldIp=t?.ip||''; const oldGw=t?.gateway||'';
        return `<tr class="${v.errors.some(e=>e.includes(a.mac))?'conflict':''}">
        <td>${i+1}</td><td class="mono">${esc(a.mac)}</td>
        <td>${oldSeat&&oldSeat!==a.seat?`<span class="old-val">${esc(oldSeat)}</span>→`:''}<input type="text" value="${esc(a.seat)}" data-asgn="${a.terminalId}" data-field="seat"></td>
        <td>${oldName&&oldName!==a.name?`<span class="old-val">${esc(oldName)}</span>→`:''}<input type="text" value="${esc(a.name)}" data-asgn="${a.terminalId}" data-field="name"></td>
        <td>${oldIp&&oldIp!==a.ip?`<span class="old-val mono">${esc(oldIp)}</span>→`:''}<input type="text" value="${esc(a.ip)}" data-asgn="${a.terminalId}" data-field="ip" class="mono"></td>
        <td>${oldGw&&oldGw!==a.gateway?`<span class="old-val mono">${esc(oldGw)}</span>→`:''}<input type="text" value="${esc(a.gateway||'')}" data-asgn="${a.terminalId}" data-field="gateway" class="mono"></td>
        <td><select data-asgn="${a.terminalId}" data-field="use">
          <option ${a.use==='学生终端'?'selected':''}>学生终端</option>
          <option ${a.use==='教师终端'?'selected':''}>教师终端</option>
        </select></td>
      </tr>`}).join('')}</tbody>
    </table>
  </div>
  </div>
  <div style="display:flex;gap:10px;margin-top:20px">
    <button class="btn btn-secondary" data-deploy-step="2">上一步</button>
    <button class="btn btn-primary" ${v.valid?'':'disabled'} data-act="start-deployment">开始本地分发</button>
    <button class="btn btn-ghost" data-act="return-workbench">取消</button>
  </div>
</div>`;
}


function deployProgressScreen(){
  const st=s(); const c=cr(); const tk=taskForCr(st, c.id);
  if(!tk) return empty('无部署任务');
  const done=tk.phase==='completed';
  const labels=['母机自身准备','终端选择与规则预览','选择部署桌面','确认写入信息','本地分发'];
  const stateLabel={queued:'排队中',transferring:'传输中',applying:'写入中',rebooting:'重启中',completed:'已完成',failed:'失败'};
  return `<div class="page">
  ${stepBar(labels, 4)}
  <div class="section-title">${done?'分发完成':'本地分发执行中'}</div>
  <div class="progress-ring mb-16">
    <div class="big-number ${done?(tk.counts.failed?'text-warn':'text-ok'):'text-info'}">${tk.counts.completed+tk.counts.failed}/${tk.counts.total}</div>
    <div>
      <div class="big-label">成功 ${tk.counts.completed} · 失败 ${tk.counts.failed}</div>
      <div class="big-label">传输中 ${tk.counts.transferring} · 写入中 ${tk.counts.applying} · 重启中 ${tk.counts.rebooting} · 排队 ${tk.counts.queued}</div>
    </div>
  </div>
  <div class="page-scroll">
  ${tk.items.map(item=>{
    const t=getTerm(st,item.terminalId); const ctrl=demo().transferControl[item.terminalId];
    const pctVal=item.state==='completed'?100:item.state==='failed'?0:item.state==='transferring'?35:item.state==='applying'?70:item.state==='rebooting'?90:0;
    return `<div class="transfer-row">
      <div style="min-width:80px">${esc(t?.seat||t?.mac?.slice(-8)||'--')}</div>
      <div style="min-width:60px;font-size:.75rem">${esc(t?.name||'')}</div>
      <div style="flex:1"><div class="transfer-bar"><div class="transfer-fill ${item.state==='completed'?'done':item.state==='failed'?'fail':ctrl?.paused?'paused':'active'}" style="width:${pctVal}%"></div></div></div>
      <div style="min-width:50px">${pill(stateLabel[item.state]||item.state, tone(item.state))}</div>
      <div class="transfer-ctrl">${!done&&['transferring','applying','rebooting','queued'].includes(item.state)?`
        ${ctrl?.paused?`<button data-transfer-resume="${item.terminalId}">继续</button>`:`<button data-transfer-pause="${item.terminalId}">暂停</button>`}
      `:''}
      ${item.state==='failed'?`<span style="font-size:.7rem;color:var(--t-err)">${esc(item.failReason)}</span>`:''}</div>
    </div>`;
  }).join('')}
  </div>
  <div style="display:flex;gap:10px;margin-top:16px">
    ${done?`<button class="btn btn-primary" data-act="return-workbench">返回工作台</button>`
      :`<span style="font-size:.8rem;color:var(--t-text2)">分发过程中请勿关闭此页面</span>`}
  </div>
</div>`;
}


function maintMenuScreen(){
  const c=cr();
  return `<div class="page">
  <div class="section-title"><button class="btn btn-ghost btn-sm" data-act="return-workbench">←</button> 教室维护</div>
  <div class="section-sub">选择维护类型</div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;max-width:600px">
    <div class="card" style="cursor:pointer" data-act="open-maint-desktop-update">
      <div class="card-header">桌面更新</div>
      <div style="font-size:.85rem;color:var(--t-text2)">进入桌面安装/卸载软件后，将更新后的桌面分发到其他终端。</div>
    </div>
    <div class="card" style="cursor:pointer" data-act="open-maint-ip">
      <div class="card-header">修改 IP / 服务器地址</div>
      <div style="font-size:.85rem;color:var(--t-text2)">批量修改终端的 IP 地址、服务器地址等网络配置。</div>
    </div>
  </div>
</div>`;
}

function maintIpScreen(){
  const m=mt(); const c=cr(); const d=demo().maintDraft;
  const terms = termsInCr(s(), c.id).filter(t=>t.id!==m.id);
  const ipPreview = d.ipPreview||[];
  return `<div class="page">
  <div class="section-title"><button class="btn btn-ghost btn-sm" data-act="open-maint-menu">←</button> 修改 IP / 服务器地址</div>
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
        <span style="font-size:.75rem;color:var(--t-text2);margin-left:auto">拖拽#列调整规则顺序</span></div>
      <div style="display:flex;gap:8px;margin-bottom:10px">
        <button class="btn btn-sm btn-secondary" data-maint-all>全选在线</button>
        <button class="btn btn-sm btn-secondary" data-maint-clear>清空</button>
      </div>
      <div>
        <table class="data-table" style="font-size:.8rem">
          <thead><tr><th>选</th><th>#</th><th>MAC</th><th>用途</th><th>当前 IP</th><th>→ 新 IP</th><th>状态</th></tr></thead>
          <tbody>${(()=>{
            return terms.map((t,i)=>{
            const checked=d.scope.includes(t.id);
            const isTeacher = t.use==='教师终端';
            const pv = ipPreview.find(x=>x.terminalId===t.id);
            const scopeIdx = d.scope.indexOf(t.id);
            return `<tr draggable="${t.online&&checked?'true':'false'}" data-drag-id="${t.id}" data-drag-idx="${i}" data-drag-ctx="maint" class="${!t.online?'offline-row':''}${isTeacher?' teacher-row':''}">
              <td><input type="checkbox" ${checked?'checked':''} ${!t.online?'disabled':''} data-maint-toggle="${t.id}"></td>
              <td class="drag-handle" title="拖拽调整规则应用顺序">${checked?(scopeIdx+1):(t.online?'·':'')}</td>
              <td class="mono">${esc(t.mac.slice(-8))}</td>
              <td>${isTeacher?pill('教师','warn'):pill('学生','muted')}</td>
              <td class="mono">${esc(t.ip||'--')}</td>
              <td class="mono">${pv?`<span style="color:var(--t-ok)">${esc(pv.newIp)}</span>`:'--'}</td>
              <td>${t.online?pill('在线','ok'):pill('离线','err')}</td></tr>`;
          }).join('');})()}</tbody>
        </table>
      </div>
    </div>
  </div>
  </div>
  <div style="display:flex;gap:10px;margin-top:16px">
    <button class="btn btn-primary" data-act="start-maint-ip">开始执行</button>
    <button class="btn btn-ghost" data-act="open-maint-menu">取消</button>
  </div>
</div>`;
}

function maintDesktopUpdateScreen(){
  const m=mt(); const c=cr(); const d=demo().maintDraft;
  const selectedIds = d.desktopIds||[];
  return `<div class="page">
  <div class="section-title"><button class="btn btn-ghost btn-sm" data-act="open-maint-menu">←</button> 桌面更新</div>
  <div class="section-sub">选择要下发的桌面（可多选），可为每个桌面设置还原模式、默认启动和是否隐藏。</div>
  <div class="page-scroll">
  ${(m.desktops||[]).map(dt=>{
    const checked = selectedIds.includes(dt.id);
    const isDefault = d.defaultDesktopId===dt.id;
    const isHidden = dt.visibility==='hidden';
    const restoreMode = dt.restoreMode||'还原系统盘，保留数据盘';
    return `
    <div class="dt-card mb-8 ${checked?'selected':''}" style="max-width:720px">
      <div style="display:flex;align-items:center;gap:10px">
        <input type="checkbox" ${checked?'checked':''} data-maint-dt-multi="${dt.id}">
        <div style="flex:1">
          <div class="dt-name">${esc(dt.name)} ${esc(dt.version)}</div>
          <div class="dt-meta">${esc(dt.baseImageName||dt.os)}</div>
        </div>
        <div style="display:flex;gap:4px;flex-wrap:wrap">
          ${isDefault&&checked?pill('默认启动','info'):''}
          ${isHidden?pill('隐藏','muted'):''}
        </div>
        <button class="btn btn-ghost btn-sm" data-dt-edit="${dt.id}">进入编辑</button>
      </div>
      ${checked?`<div style="display:flex;gap:8px;margin-top:8px;align-items:center;flex-wrap:wrap;font-size:.82rem">
        <button class="btn btn-ghost btn-sm${isDefault?' disabled-look':''}" ${isDefault?'disabled':''} data-maint-dt-default="${dt.id}">${isDefault?'已是默认启动':'设为默认启动'}</button>
        <button class="btn btn-ghost btn-sm" data-dt-visibility="${dt.id}">${isHidden?'取消隐藏':'隐藏'}</button>
        <span style="color:var(--t-text3)">还原:</span>
        <select data-dt-restore="${dt.id}" style="font-size:.8rem;padding:2px 6px;background:var(--t-panel);color:var(--t-text);border:1px solid var(--t-border);border-radius:4px">
          <option ${restoreMode==='还原系统盘，保留数据盘'?'selected':''}>还原系统盘，保留数据盘</option>
          <option ${restoreMode==='还原系统盘和数据盘'?'selected':''}>还原系统盘和数据盘</option>
          <option ${restoreMode==='不还原'?'selected':''}>不还原</option>
        </select>
      </div>`:''}
    </div>`;
  }).join('')}
  ${!(m.desktops||[]).length?'<div style="color:var(--t-text3);font-size:.85rem">暂无桌面</div>':''}
  <div style="display:flex;gap:6px;margin-top:8px;margin-bottom:16px">
    <button class="btn btn-ghost btn-sm" data-act="open-local-desktop-flow">新建/编辑桌面</button>
  </div>
  </div>
  <div style="display:flex;gap:10px;margin-top:16px">
    ${selectedIds.length?`<button class="btn btn-primary" data-maint-step="select">下一步：选择终端（已选 ${selectedIds.length} 个桌面）</button>`:'<div style="color:var(--t-text3);font-size:.85rem">请至少选择一个桌面</div>'}
    <button class="btn btn-ghost" data-act="open-maint-menu">取消</button>
  </div>
</div>`;
}

function maintDesktopSelectScreen(){
  const m=mt(); const c=cr(); const d=demo().maintDraft;
  const terms = termsInCr(s(), c.id).filter(t=>t.id!==m.id);
  const selectedDts = (d.desktopIds||[]).map(id=>(m.desktops||[]).find(x=>x.id===id)).filter(Boolean);
  const defaultDt = selectedDts.find(d2=>d2.id===d.defaultDesktopId);
  return `<div class="page">
  <div class="section-title"><button class="btn btn-ghost btn-sm" data-act="open-maint-desktop-update">←</button> 选择更新终端</div>
  <div class="page-scroll">
  <div class="card mb-16" style="font-size:.85rem">
    <div class="card-header">已选桌面</div>
    ${selectedDts.map(d2=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0">
      <span>${esc(d2.name)} ${esc(d2.version)}</span>
      <span style="display:flex;gap:4px">${d2.id===d.defaultDesktopId?pill('默认启动','info'):''}${d2.visibility==='hidden'?pill('隐藏','muted'):''}${pill(d2.restoreMode||'还原系统盘，保留数据盘','muted')}</span>
    </div>`).join('')}
    ${defRow('服务器地址', m.serverAddr||'--', {mono:true})}
  </div>
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
    <div class="section-title" style="font-size:.9rem;margin:0">终端选择 · 已选 ${d.scope.length}</div>
    <div style="display:flex;gap:8px">
      <button class="btn btn-sm btn-secondary" data-maint-all>全选在线</button>
      <button class="btn btn-sm btn-secondary" data-maint-clear>清空</button>
    </div>
  </div>
  <table class="data-table" style="font-size:.8rem">
    <thead><tr><th>选</th><th>座位号</th><th>机器名</th><th>MAC</th><th>状态</th></tr></thead>
    <tbody>${terms.map(t=>{
      const checked=d.scope.includes(t.id);
      return `<tr class="${!t.online?'offline-row':''}">
        <td><input type="checkbox" ${checked?'checked':''} ${!t.online?'disabled':''} data-maint-toggle="${t.id}"></td>
        <td>${esc(t.seat||'--')}</td><td>${esc(t.name||'--')}</td>
        <td class="mono">${esc(t.mac.slice(-8))}</td>
        <td>${t.online?pill('在线','ok'):pill('离线','err')}</td></tr>`;
    }).join('')}</tbody>
  </table>
  </div>
  <div style="display:flex;gap:10px;margin-top:16px">
    <button class="btn btn-primary" ${d.scope.length?'':'disabled'} data-act="start-maintenance">开始分发更新（${d.scope.length} 台）</button>
    <button class="btn btn-ghost" data-act="open-maint-desktop-update">上一步</button>
  </div>
</div>`;
}

function maintConfirmScreen(){ return maintDesktopSelectScreen(); }

function maintProgressScreen(){
  const st=s(); const c=cr(); const tk=taskForCr(st, c.id);
  if(!tk) return empty('无维护任务');
  const done=tk.phase==='completed';
  const stateLabel={queued:'排队中',transferring:'传输中',applying:'写入中',rebooting:'重启中',completed:'已完成',failed:'失败'};
  return `<div class="page">
  <div class="section-title">${done?'维护已完成':'维护执行中'}</div>
  <div class="progress-ring mb-16">
    <div class="big-number ${done?'text-ok':'text-info'}">${tk.counts.completed+tk.counts.failed}/${tk.counts.total}</div>
    <div><div class="big-label">成功 ${tk.counts.completed} · 失败 ${tk.counts.failed}</div></div>
  </div>
  <div class="page-scroll">
  ${tk.items.map(item=>{
    const t=getTerm(st,item.terminalId);
    const pctVal=item.state==='completed'?100:item.state==='transferring'?35:item.state==='applying'?70:item.state==='rebooting'?90:0;
    return `<div class="transfer-row">
      <div>${esc(t?.seat||t?.mac?.slice(-8)||'--')}</div>
      <div style="flex:1"><div class="transfer-bar"><div class="transfer-fill ${item.state==='completed'?'done':item.state==='failed'?'fail':'active'}" style="width:${pctVal}%"></div></div></div>
      <div>${pill(stateLabel[item.state]||item.state, tone(item.state))}</div>
      ${item.state==='failed'?`<div style="font-size:.7rem;color:var(--t-err)">${esc(item.failReason)}</div>`:''}
    </div>`;
  }).join('')}
  </div>
  ${done?`<div style="margin-top:16px"><button class="btn btn-primary" data-act="return-workbench">返回工作台</button></div>`:''}
</div>`;
}


function examMainScreen(){
  const m=mt(); const c=cr(); const d=demo().examDraft;
  const terms = termsInCr(s(), c.id).filter(t=>t.id!==m.id);
  const selectedIds = d.desktopIds||[];
  return `<div class="page">
  <div class="section-title"><button class="btn btn-ghost btn-sm" data-act="return-workbench">←</button> 考试场景</div>
  <div class="section-sub">选择考试桌面（可多选），可为每个桌面设置还原模式、默认启动和是否隐藏。</div>
  <div class="page-scroll">

  ${(m.desktops||[]).map(dt=>{
    const checked = selectedIds.includes(dt.id);
    const isDefault = d.defaultDesktopId===dt.id;
    const isHidden = dt.visibility==='hidden';
    const restoreMode = dt.restoreMode||'还原系统盘和数据盘';
    return `
    <div class="dt-card mb-8 ${checked?'selected':''}" style="max-width:720px">
      <div style="display:flex;align-items:center;gap:10px">
        <input type="checkbox" ${checked?'checked':''} data-exam-dt-multi="${dt.id}">
        <div style="flex:1">
          <div class="dt-name">${esc(dt.name)} ${esc(dt.version)}</div>
          <div class="dt-meta">${esc(dt.baseImageName||dt.os)}</div>
        </div>
        <div style="display:flex;gap:4px;flex-wrap:wrap">
          ${isDefault&&checked?pill('默认启动','info'):''}
          ${isHidden?pill('隐藏','muted'):''}
        </div>
      </div>
      ${checked?`<div style="display:flex;gap:8px;margin-top:8px;align-items:center;flex-wrap:wrap;font-size:.82rem">
        <button class="btn btn-ghost btn-sm${isDefault?' disabled-look':''}" ${isDefault?'disabled':''} data-exam-dt-default="${dt.id}">${isDefault?'已是默认启动':'设为默认启动'}</button>
        <button class="btn btn-ghost btn-sm" data-dt-visibility="${dt.id}">${isHidden?'取消隐藏':'隐藏'}</button>
        <span style="color:var(--t-text3)">还原:</span>
        <select data-dt-restore="${dt.id}" style="font-size:.8rem;padding:2px 6px;background:var(--t-panel);color:var(--t-text);border:1px solid var(--t-border);border-radius:4px">
          <option ${restoreMode==='还原系统盘和数据盘'?'selected':''}>还原系统盘和数据盘</option>
          <option ${restoreMode==='还原系统盘，保留数据盘'?'selected':''}>还原系统盘，保留数据盘</option>
          <option ${restoreMode==='不还原'?'selected':''}>不还原</option>
        </select>
      </div>`:''}
    </div>`;
  }).join('')}
  <div style="display:flex;gap:6px;margin-top:8px;margin-bottom:16px">
    <button class="btn btn-ghost btn-sm" data-act="open-local-desktop-flow">新建/编辑桌面</button>
  </div>

  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
    <div class="section-title" style="font-size:.9rem;margin:0">终端选择 · 已选 ${d.scope.length}</div>
    <div style="display:flex;gap:8px">
      <button class="btn btn-sm btn-secondary" data-exam-all>全选在线</button>
      <button class="btn btn-sm btn-secondary" data-exam-clear>清空</button>
    </div>
  </div>
  <table class="data-table" style="font-size:.8rem">
    <thead><tr><th>选</th><th>座位号</th><th>机器名</th><th>MAC</th><th>状态</th></tr></thead>
    <tbody>${terms.map(t=>{
      return `<tr class="${!t.online?'offline-row':''}">
        <td><input type="checkbox" ${d.scope.includes(t.id)?'checked':''} ${!t.online?'disabled':''} data-exam-toggle="${t.id}"></td>
      <td>${esc(t.seat||'--')}</td><td>${esc(t.name||'--')}</td><td class="mono">${esc(t.mac.slice(-8))}</td>
      <td>${t.online?pill('在线','ok'):pill('离线','err')}</td></tr>`}).join('')}</tbody>
  </table>
  </div>
  <div style="display:flex;gap:10px;margin-top:16px">
    <button class="btn btn-primary" ${selectedIds.length&&d.scope.length?'':'disabled'} data-act="start-exam-apply">启动考试（${d.scope.length} 台）</button>
    <button class="btn btn-ghost" data-act="return-workbench">取消</button>
  </div>
</div>`;
}
function examDesktopScreen(){ return examMainScreen(); }
function examConfirmScreen(){ return examMainScreen(); }

function examProgressScreen(){
  const st=s(); const c=cr(); const tk=taskForCr(st, c.id);
  if(!tk) return examActiveScreen();
  const done=tk.phase==='completed';
  const stateLabel={queued:'排队中',transferring:'传输中',applying:'写入中',rebooting:'重启中',completed:'已完成',failed:'失败'};
  const isRestore = tk.type==='exam-restore';
  return `<div class="page">
  <div class="section-title">${isRestore?(done?'考后恢复已完成':'考后恢复执行中'):(done?'考试桌面下发完成':'考试桌面下发中')}</div>
  <div class="progress-ring mb-16">
    <div class="big-number ${done?'text-ok':'text-info'}">${(tk.counts.completed||0)+(tk.counts.failed||0)}/${tk.counts.total||0}</div>
    <div><div class="big-label">成功 ${tk.counts.completed||0} · 失败 ${tk.counts.failed||0}</div></div>
  </div>
  <div class="page-scroll">
  ${tk.items.map(item=>{
    const t=getTerm(st,item.terminalId);
    const pctVal=item.state==='completed'?100:item.state==='transferring'?35:item.state==='applying'?70:item.state==='rebooting'?90:0;
    return `<div class="transfer-row">
      <div>${esc(t?.seat||t?.mac?.slice(-8)||'--')}</div>
      <div style="flex:1"><div class="transfer-bar"><div class="transfer-fill ${item.state==='completed'?'done':item.state==='failed'?'fail':'active'}" style="width:${pctVal}%"></div></div></div>
      <div>${pill(stateLabel[item.state]||item.state, tone(item.state))}</div>
    </div>`;
  }).join('')}
  </div>
  ${done&&!isRestore?`<div style="margin-top:16px"><button class="btn btn-primary" data-act="return-workbench">进入考试模式</button></div>`:''}
  ${done&&isRestore?`<div style="margin-top:16px"><button class="btn btn-primary" data-act="return-workbench">返回工作台</button></div>`:''}
</div>`;
}

function examActiveScreen(){
  const es=demo().examState;
  return `<div class="page">
  <div class="section-title">考试模式已激活</div>
  <div class="card mb-16" style="max-width:720px">
    ${defRow('考试桌面', es.appliedDesktopId||'--')}
    ${defRow('已下发终端', (es.appliedIds||[]).length+' 台')}
    ${defRow('其他桌面入口', es.entriesHidden?'已隐藏':'正常显示')}
    ${defRow('启动时间', fmtTime(es.appliedAt))}
  </div>
  <div class="section-sub">考试结束后，恢复考前状态才可进行其他操作。</div>
  <button class="btn btn-primary" data-act="start-exam-restore">恢复考前状态</button>
  <button class="btn btn-ghost" data-act="return-workbench" style="margin-left:10px">返回工作台</button>
</div>`;
}


function faultMenuScreen(){
  return `<div class="page">
  <div class="section-title"><button class="btn btn-ghost btn-sm" data-act="go-home">←</button> 故障处理</div>
  <div class="section-sub">选择故障处理方式</div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;max-width:600px">
    <div class="card" style="cursor:pointer" data-act="open-fault-replace">
      <div class="card-header">一键替换</div>
      <div style="font-size:.85rem;color:var(--t-text2)">新硬件替换故障座位，继承原座位的全部配置与桌面。需要服务器可达。</div>
    </div>
    <div class="card" style="cursor:pointer" data-act="open-fault-reset">
      <div class="card-header">一键重置</div>
      <div style="font-size:.85rem;color:var(--t-text2)">从服务器重新拉取当前终端的全部数据覆盖本机，适用于本地数据损坏。</div>
    </div>
  </div>
</div>`;
}

function faultReplaceScreen(){
  const m=mt(); const c=cr(); const st=s(); const fr=demo().faultReplace||{};
  const allCrs = st.classrooms.filter(cr=>cr.registeredOnServer||cr.stage==='deployed');
  const selectedCrId = fr.selectedClassroomId || m.boundClassroom || m.classroomId;
  const selectedCr = getClassroom(st, selectedCrId);
  const crTerms = selectedCr ? termsInCr(st, selectedCr.id).filter(t=>t.id!==m.id) : [];
  const suggested = fr.suggestedTerminalId ? getTerm(st, fr.suggestedTerminalId) : null;
  const campus = (id)=>{ const cr=getClassroom(st,id); return cr?st.campuses.find(c=>c.id===cr.campusId)?.name||'':''; };

  // Determine wizard step: 0=preconditions, 1=select classroom+terminal, 2=confirm
  const step = fr.forceStep!==undefined ? fr.forceStep : (fr.confirmed ? 2 : (fr.suggestedTerminalId ? 2 : (fr.serverReachable ? 1 : 0)));
  const labels=['前置条件','选择教室与终端','确认替换'];

  return `<div class="page">
  <div class="section-title"><button class="btn btn-ghost btn-sm" data-act="go-home">←</button> 一键替换</div>
  ${stepBar(labels, step)}

  ${step===0?`
  <div class="card" style="max-width:720px">
    <div class="card-header">前置条件检查</div>
    ${defRow('服务器地址', m.serverAddr||'未配置', {mono:true})}
    <div class="def-row"><span class="def-label">服务器连接</span><span class="def-value">${fr.serverReachable?pill('可达','ok'):pill('不可达','err')}</span></div>
    <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--t-border)">
      <div class="card-header" style="font-size:.85rem">网络修正</div>
      <div class="prep-field"><label>服务器地址</label><input type="text" id="fr-srv" value="${esc(m.serverAddr||'')}" placeholder="管理服务器地址"></div>
      <div class="prep-field"><label>IP 地址</label><input type="text" id="fr-ip" value="${esc(m.ip||'')}" placeholder="本机 IP"></div>
      <div class="prep-field"><label>子网掩码</label><input type="text" id="fr-mask" value="${esc(m.subnetMask||'255.255.255.0')}" placeholder="255.255.255.0"></div>
      <div class="prep-field"><label>网关</label><input type="text" id="fr-gw" value="${esc(m.gateway||'')}" placeholder="网关地址"></div>
      <div class="prep-field"><label>DNS</label><input type="text" id="fr-dns" value="${esc((m.dns||[]).join(','))}" placeholder="DNS 地址"></div>
      <div style="margin-top:8px"><button class="btn btn-sm btn-secondary" data-save="fault-network">保存网络配置</button></div>
    </div>
  </div>
  <div style="display:flex;gap:10px;margin-top:16px">
    ${fr.serverReachable?`<button class="btn btn-primary" data-act="fault-replace-goto-1">下一步：选择教室与终端</button>`:''}
    <button class="btn btn-ghost" data-act="go-home">取消</button>
  </div>
  `:''}

  ${step===1?`
  <div style="display:grid;grid-template-columns:280px 1fr;gap:16px;align-items:start">
    <div class="card">
      <div class="card-header">选择教室</div>
      <div style="font-size:.78rem;color:var(--t-text3);margin-bottom:8px">服务器上所有已注册教室</div>
      ${allCrs.map(cr=>`
        <div class="dt-card mb-4 ${cr.id===selectedCrId?'selected':''}" style="cursor:pointer;padding:6px 10px;font-size:.82rem" data-fault-cr="${cr.id}">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <span>${esc(cr.name)}</span>
            <span style="font-size:.72rem;color:var(--t-text3)">${esc(cr.building)} ${esc(cr.floor)}</span>
          </div>
        </div>
      `).join('')}
    </div>
    <div class="card" style="display:flex;flex-direction:column;min-height:0">
      <div class="card-header">选择终端</div>
      <div style="font-size:.78rem;color:var(--t-text3);margin-bottom:8px">离线终端优先（建议选择故障机位）</div>
      <div style="flex:1;overflow-y:auto;max-height:380px">
      <table class="data-table" style="font-size:.8rem">
        <thead><tr><th>座位号</th><th>机器名</th><th>MAC</th><th>状态</th><th></th></tr></thead>
        <tbody>${crTerms.map(t=>`<tr class="${!t.online?'offline-row':''}${t.id===fr.suggestedTerminalId?' selected':''}">
          <td>${esc(t.seat||'--')}</td><td>${esc(t.name||'--')}</td>
          <td class="mono">${esc(t.mac.slice(-8))}</td>
          <td>${t.online?pill('在线','ok'):pill('离线','err')}</td>
          <td>${t.id===fr.suggestedTerminalId?pill('已选','info'):`<button class="btn btn-ghost btn-sm" data-fault-select="${t.id}">选择</button>`}</td>
        </tr>`).join('')}</tbody>
      </table>
      </div>
    </div>
  </div>
  <div style="display:flex;gap:10px;margin-top:16px">
    <button class="btn btn-secondary" data-act="fault-replace-goto-0">上一步：前置条件</button>
    <button class="btn btn-ghost" data-act="go-home">取消</button>
  </div>
  `:''}

  ${step===2?`
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start">
    ${suggested?`<div class="card">
      <div class="card-header">替换预览（将继承以下数据）</div>
      ${defRow('服务器地址', suggested.serverAddr||'--', {mono:true})}
      ${defRow('原机器名', suggested.name||'--')}
      ${defRow('原座位', suggested.seat||'--')}
      ${defRow('原 IP', suggested.ip||'--', {mono:true})}
      ${defRow('用途', suggested.use||'--')}
      ${(suggested.desktops||[]).map(d=>`<div style="font-size:.82rem;padding:4px 0 4px 0;display:flex;justify-content:space-between;align-items:center">
        <span>· ${esc(d.name)} ${esc(d.version)}</span>
        <span>${d.id===suggested.defaultDesktopId?pill('默认启动','info'):''}</span>
      </div>`).join('')||defRow('桌面','无桌面')}
    </div>`:''}
    <div class="card">
      <div class="card-header">当前终端硬件信息</div>
      ${(()=>{
        const macs = m.macList||[];
        return macs.map((mac,idx)=>`<div class="def-row"><span class="def-label">${idx===0?'网卡':'备用网卡'}</span><span class="def-value mono">${esc(mac)}${mac===m.mac?' '+pill('工作中','ok'):''}</span></div>`).join('');
      })()}
      ${defRow('处理器', m.hw?.cpu||'--')}
      ${defRow('显卡', m.hw?.gpu||'--')}
      ${defRow('内存', m.hw?.mem||'--')}
      ${defRow('硬盘', (m.hw?.diskModel||'--')+' ('+esc(m.hw?.diskSn||'--')+')')}
    </div>
  </div>
  ${fr.confirmed?`
    <div class="card" style="border-color:var(--t-ok);background:rgba(34,197,94,0.08);margin-top:16px">
      <div class="card-header" style="color:var(--t-ok)">替换已完成</div>
      <div style="font-size:.85rem">新 MAC ${esc(m.mac)} 已继承 ${esc(fr.suggestedSeat||'--')} 位置的全部配置与桌面资产。</div>
    </div>
  `:`
    <div style="display:flex;gap:10px;margin-top:16px">
      <button class="btn btn-secondary" data-act="fault-replace-back">上一步</button>
      <button class="btn btn-primary" ${fr.suggestedTerminalId?'':'disabled'} data-act="fault-replace-confirm">确认替换</button>
      <button class="btn btn-ghost" data-act="go-home">取消</button>
    </div>
  `}
  `:''}
</div>`;
}

function faultResetScreen(){
  const m=mt(); const c=cr(); const frs=demo().faultReset||{};
  return `<div class="page">
  <div class="section-title"><button class="btn btn-ghost btn-sm" data-act="go-home">←</button> 一键重置</div>
  <div class="page-scroll">
  <div class="section-sub">从服务器重新拉取本机全部注册数据覆盖本机。本地数据将被丢弃，以服务器为准。</div>
  <div class="card mb-16" style="max-width:720px">
    <div class="card-header">前置条件检查</div>
    ${defRow('服务器地址', m.serverAddr||'未配置', {mono:true})}
    <div class="def-row"><span class="def-label">服务器连接</span><span class="def-value">${frs.serverReachable?pill('可达','ok'):pill('不可达','err')}</span></div>
    <div class="def-row"><span class="def-label">终端已注册到服务器</span><span class="def-value">${frs.terminalRegistered?pill('已注册','ok'):pill('未注册','err')}</span></div>
    ${!frs.serverReachable?`
      <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--t-border)">
        <div class="card-header" style="font-size:.85rem">网络修正（内联）</div>
        <div class="section-sub" style="font-size:.75rem;color:var(--t-text3)">重置需从服务器下载全部数据，请先确保网络可达。</div>
        <div class="prep-field"><label>服务器地址</label><input type="text" id="frs-srv" value="${esc(m.serverAddr||'')}" placeholder="管理服务器地址"></div>
        <div class="prep-field"><label>IP 地址</label><input type="text" id="frs-ip" value="${esc(m.ip||'')}" placeholder="本机 IP"></div>
        <div class="prep-field"><label>子网掩码</label><input type="text" id="frs-mask" value="${esc(m.subnetMask||'255.255.255.0')}" placeholder="255.255.255.0"></div>
        <div class="prep-field"><label>网关</label><input type="text" id="frs-gw" value="${esc(m.gateway||'')}" placeholder="网关地址"></div>
        <div class="prep-field"><label>DNS</label><input type="text" id="frs-dns" value="${esc((m.dns||[]).join(','))}" placeholder="DNS 地址"></div>
        <div style="margin-top:8px"><button class="btn btn-sm btn-secondary" data-save="fault-network-reset">保存网络配置</button></div>
      </div>
    `:''}
  </div>
  <div class="card mb-16" style="max-width:720px">
    <div class="card-header">当前终端信息（来自服务器注册数据）</div>
    ${defRow('服务器地址', m.serverAddr||'未配置', {mono:true})}
    ${defRow('机器名', m.name||'--')}
    ${defRow('座位号', m.seat||'--')}
    ${defRow('IP 地址', m.ip||'--', {mono:true})}
    ${defRow('用途', m.use||'--')}
    ${(m.desktops||[]).map(d=>`<div style="font-size:.82rem;padding:4px 0;display:flex;justify-content:space-between;align-items:center">
      <span>· ${esc(d.name)}</span>
      <span>${d.id===m.bios?.defaultBootId?pill('默认启动','info'):''}</span>
    </div>`).join('')||defRow('桌面','无桌面')}
  </div>
  <div class="card mb-16" style="max-width:720px;border-color:var(--t-warn);background:var(--t-warn-bg,rgba(255,180,0,0.08))">
    <div style="font-size:.85rem;color:var(--t-warn)">⚠ 重置将丢弃本机所有未同步的数据，以服务器注册内容为准。此操作不可撤销。</div>
  </div>
  ${frs.confirmed?`
    <div class="card mb-16" style="border-color:var(--t-ok);background:rgba(34,197,94,0.08)">
      <div class="card-header" style="color:var(--t-ok)">重置已完成</div>
      <div style="font-size:.85rem">已从服务器重新拉取全部注册数据覆盖本机。</div>
    </div>
  `:`
    <div style="display:flex;gap:10px">
      <button class="btn btn-primary" ${frs.serverReachable&&frs.terminalRegistered?'':'disabled'} data-act="fault-reset-confirm">确认重置（从服务器拉取）</button>
      <button class="btn btn-ghost" data-act="go-home">取消</button>
    </div>
  `}
  </div>
</div>`;
}

function desktopEditorScreen(){
  return `<div class="page">
  <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;flex:1;text-align:center;padding:40px 20px">
    <div style="font-size:1.5rem;margin-bottom:12px">桌面编辑环境</div>
    <div style="color:var(--t-text2);margin-bottom:24px;font-size:.95rem">当前已重启进入桌面，可安装/卸载软件、修改系统设置。<br>编辑完成后点击下方按钮，系统将重启返回管理系统并合并编辑。</div>
    <button class="btn btn-primary" data-act="finish-desktop-edit">编辑完成，重启返回管理系统</button>
  </div>
</div>`;
}

function selfTestScreen(){
  const m=mt();
  const diskSeq = (820+Math.floor(Math.random()*180)).toFixed(0);
  const diskRand = (45+Math.floor(Math.random()*55)).toFixed(0);
  const diskWrite = (720+Math.floor(Math.random()*200)).toFixed(0);
  const diskRandW = (35+Math.floor(Math.random()*40)).toFixed(0);
  const temp = 42+Math.floor(Math.random()*15);
  const smartOk = temp < 50;
  return `<div class="page">
  <div class="section-title"><button class="btn btn-ghost btn-sm" data-act="go-home">←</button> 本机测试</div>
  <div class="section-sub">逐项测试本机网络与硬件状态，支持单项重新测试。</div>

  <div class="card mb-16" style="max-width:720px">
    <div class="card-header">网络连通性测试</div>
    ${defRow('本机 IP', m.ip||'未配置', {mono:true})}
    ${defRow('网关', m.gateway||'--', {mono:true})}
    <div class="def-row"><span class="def-label">网关可达</span><span class="def-value">${m.gateway?pill('可达','ok'):pill('未配置','muted')}</span></div>
    ${defRow('服务器', m.serverAddr||'未配置', {mono:true})}
    <div class="def-row"><span class="def-label">服务器可达</span><span class="def-value">${m.serverAddr?pill('可达','ok'):pill('未配置','muted')}</span></div>
    <button class="btn btn-secondary btn-sm" style="margin-top:8px" data-act="open-selftest">重新测试</button>
  </div>

  <div class="card mb-16" style="max-width:720px">
    <div class="card-header">硬盘读写速度测试</div>
    ${defRow('硬盘型号', m.hw?.diskModel||'--')}
    ${defRow('硬盘序列号', m.hw?.diskSn||'--', {mono:true})}
    <div style="margin-top:8px">
      ${defRow('顺序读取 (Seq Q32T1)', diskSeq+' MB/s')}
      ${defRow('随机读取 (4K Q32T1)', diskRand+' MB/s')}
      ${defRow('顺序写入 (Seq Q32T1)', diskWrite+' MB/s')}
      ${defRow('随机写入 (4K Q32T1)', diskRandW+' MB/s')}
    </div>
    <button class="btn btn-secondary btn-sm" style="margin-top:8px" data-act="open-selftest">重新测试</button>
  </div>

  <div class="card mb-16" style="max-width:720px">
    <div class="card-header">硬盘健康状态测试</div>
    ${defRow('SMART 状态', smartOk?pill('正常','ok'):pill('异常','err'), {raw:true})}
    ${defRow('温度', temp+'°C')}
    ${defRow('剩余寿命估算', smartOk?pill('>80%','ok'):pill('<15%','err'), {raw:true})}
    <button class="btn btn-secondary btn-sm" style="margin-top:8px" data-act="open-selftest">重新测试</button>
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
    <div class="prep-field"><label style="width:120px">教室名称（导出用）</label><input type="text" id="export-cr-name" value="${esc(exportName)}" placeholder="导出时使用的教室名称"></div>
    <div class="prep-field"><label style="width:120px">教室备注（可选）</label><input type="text" id="export-cr-remark" value="${esc(exportRemark)}" placeholder="填写备注信息，将包含在导出文件中"></div>
    ${defRow('终端数', terms.length+' 台')}
    ${defRow('信息完整', (terms.length-incomplete.length)+' / '+terms.length+' 台')}
  </div>
  <table class="data-table" style="font-size:.8rem">
    <thead><tr><th>#</th><th>MAC</th><th data-sort>座位号</th><th data-sort>机器名</th><th data-sort>IP</th><th data-sort>用途</th><th>硬盘序列号</th></tr></thead>
    <tbody>${terms.map((t,i)=>`<tr class="${(!t.name||!t.ip)?'conflict':''}">
      <td>${i+1}</td><td class="mono">${esc(t.mac)}</td>
      <td>${esc(t.seat||'--')}</td><td>${esc(t.name||'--')}</td>
      <td class="mono">${esc(t.ip||'--')}</td><td>${esc(t.use||'--')}</td>
      <td class="mono">${esc(t.hw?.diskSn||'--')}</td></tr>`).join('')}</tbody>
  </table>
  </div>
  <div style="margin-top:16px">
    <button class="btn btn-primary btn-sm" data-act="export-simulated">导出 Excel</button>
    <span style="font-size:.75rem;color:var(--t-text3);margin-left:8px">修改教室名称仅影响导出文件，不影响系统内信息</span>
  </div>
</div>`;
}


function bindAll(){
  // action buttons
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
      } else if(a==='maint-apply-ip-rules'){
        act(a,{serverAddr:root.querySelector('#mip-srv')?.value,
          ipBase:root.querySelector('#mip-base')?.value,
          ipStart:Number(root.querySelector('#mip-start')?.value||20),
          subnetMask:root.querySelector('#mip-mask')?.value,
          gateway:root.querySelector('#mip-gw')?.value,
          dns:root.querySelector('#mip-dns')?.value});
      } else if(a==='deploy-apply-rules'){
        saveRulesAndApply();
      } else if(a==='open-local-desktop-flow'){
        // save return screen for inline desktop management
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
      } else { act(a); }
    });
  });

  // save local info/network/fault
  root.querySelectorAll('[data-save]').forEach(el=>{
    el.addEventListener('click',()=>{
      const type=el.dataset.save;
      if(type==='local-info'){
        act('save-local-info',{name:root.querySelector('#li-name')?.value, seat:root.querySelector('#li-seat')?.value, use:root.querySelector('#li-use')?.value,
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

  // fault handling: classroom selection, then terminal selection
  root.querySelectorAll('[data-fault-cr]').forEach(el=>{
    el.addEventListener('click',()=>act('fault-replace-select-cr',{classroomId:el.dataset.faultCr}));
  });
  root.querySelectorAll('[data-fault-select]').forEach(el=>{
    el.addEventListener('click',()=>act('fault-replace-select',{terminalId:el.dataset.faultSelect}));
  });

  // NIC list toggle
  root.querySelectorAll('[data-toggle]').forEach(el=>{
    el.addEventListener('click',()=>{
      const target=document.getElementById(el.dataset.toggle);
      if(target){const open=target.style.display!=='none'; target.style.display=open?'none':'block'; el.textContent=open?'▶ 展开':'▼ 收起';}
    });
  });

  // Alert sort buttons (re-render to apply sort)
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

  // mother prep fields
  root.querySelectorAll('[data-mp]').forEach(el=>{
    el.addEventListener('change',()=>act('deploy-save-mother-prep',{[el.dataset.mp]:el.value}));
  });

  // deploy step nav
  root.querySelectorAll('[data-deploy-step]').forEach(el=>{
    el.addEventListener('click',()=>{
      saveRulesIfPresent();
      setTimeout(()=>act('deploy-goto-step',{step:Number(el.dataset.deployStep)}),50);
    });
  });

  // rules - live save & auto-apply
  let _ruleDebounce=null;
  function saveRulesIfPresent(){
    const rules={};
    root.querySelectorAll('[data-rule]').forEach(r=>{
      rules[r.dataset.rule]=r.type==='number'?Number(r.value):r.value;
    });
    if(Object.keys(rules).length) act('deploy-set-rules',rules);
  }
  function saveRulesAndApply(){
    saveRulesIfPresent();
    setTimeout(()=>act('deploy-apply-rules'),80);
  }
  // auto-apply deploy rules on any rule field change
  root.querySelectorAll('[data-rule]').forEach(r=>{
    r.addEventListener('input',()=>{
      clearTimeout(_ruleDebounce);
      _ruleDebounce=setTimeout(()=>saveRulesAndApply(),400);
    });
    r.addEventListener('change',()=>{
      clearTimeout(_ruleDebounce);
      _ruleDebounce=setTimeout(()=>saveRulesAndApply(),200);
    });
  });
  // auto-apply maint IP rules on field change
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

  // toggle terminal selection
  root.querySelectorAll('[data-toggle-term]').forEach(el=>{
    el.addEventListener('change',()=>act('deploy-toggle-term',{id:el.dataset.toggleTerm}));
  });

  // deploy desktop selection
  root.querySelectorAll('[data-deploy-dt]').forEach(el=>{
    el.addEventListener('change',()=>{
      const checked=el.checked; const dtId=el.dataset.deployDt;
      const current=demo().deployDraft.desktopIds||[];
      const next=checked?[...current,dtId]:current.filter(x=>x!==dtId);
      act('deploy-set-desktops',{desktopIds:next, defaultDesktopId:next[0]||null});
    });
  });
  root.querySelectorAll('[data-deploy-default]').forEach(el=>{
    el.addEventListener('click',()=>act('deploy-set-desktops',{defaultDesktopId:el.dataset.deployDefault}));
  });

  // assignment editing
  root.querySelectorAll('[data-asgn]').forEach(el=>{
    el.addEventListener('change',()=>act('deploy-edit-assignment',{terminalId:el.dataset.asgn, fields:{[el.dataset.field]:el.value}}));
  });

  // transfer control
  root.querySelectorAll('[data-transfer-pause]').forEach(el=>{
    el.addEventListener('click',()=>act('transfer-pause',{id:el.dataset.transferPause}));
  });
  root.querySelectorAll('[data-transfer-resume]').forEach(el=>{
    el.addEventListener('click',()=>act('transfer-resume',{id:el.dataset.transferResume}));
  });

  // desktop management
  root.querySelectorAll('[data-desktop-action]').forEach(el=>{
    el.addEventListener('click',()=>{
      if(el.dataset.desktopAction==='import'){
        showImportDialog();
      }
      if(el.dataset.desktopAction==='export-pkg'){
        showExportDoneDialog();
      }
    });
  });
  const fileInput=root.querySelector('#usb-file-input');
  if(fileInput){
    fileInput.addEventListener('change',(e)=>{
      const file=e.target.files[0]; if(!file) return;
      const name=file.name.replace(/\.(vhd|vhdx|img|iso|wim|cdpkg)$/i,'');
      const isPackage = /\.cdpkg$/i.test(file.name);
      if(isPackage){
        /* 成品桌面包 → 直接导入，跳过创建流程 */
        act('create-desktop-from-file',{name:name||'导入桌面', os:'Windows 11 23H2', importType:'package'});
      } else {
        /* 基础镜像 → 需要经过创建桌面流程 */
        showCreateDesktopDialog(name||'新建桌面');
      }
    });
  }
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
  root.querySelectorAll('[data-bios-restore]').forEach(el=>{
    el.addEventListener('change',()=>act('set-restore-mode',{mode:el.value}));
  });
  root.querySelectorAll('[data-dt-restore]').forEach(el=>{
    el.addEventListener('change',()=>act('set-restore-mode',{desktopId:el.dataset.dtRestore, mode:el.value}));
  });

  // maintenance
  root.querySelectorAll('[data-maint-toggle]').forEach(el=>{
    el.addEventListener('change',()=>{
      const scope=[...demo().maintDraft.scope];
      const idx=scope.indexOf(el.dataset.maintToggle);
      if(idx>=0) scope.splice(idx,1); else scope.push(el.dataset.maintToggle);
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
  root.querySelectorAll('[data-maint-step]').forEach(el=>{
    el.addEventListener('click',()=>act('maint-goto-step',{step:el.dataset.maintStep}));
  });
  // maintenance multi-desktop
  root.querySelectorAll('[data-maint-dt-multi]').forEach(el=>{
    el.addEventListener('change',()=>{
      const ids=[...(demo().maintDraft.desktopIds||[])];
      const dtId=el.dataset.maintDtMulti;
      const idx=ids.indexOf(dtId);
      if(idx>=0) ids.splice(idx,1); else ids.push(dtId);
      act('maint-set-desktops',{desktopIds:ids, defaultDesktopId:ids[0]||null});
    });
  });
  root.querySelectorAll('[data-maint-dt-default]').forEach(el=>{
    el.addEventListener('click',()=>act('maint-set-desktops',{defaultDesktopId:el.dataset.maintDtDefault}));
  });
  root.querySelectorAll('[data-maint-restore]').forEach(el=>{
    el.addEventListener('change',()=>act('maint-set-restore-mode',{mode:el.value}));
  });

  // exam multi-desktop
  root.querySelectorAll('[data-exam-dt-multi]').forEach(el=>{
    el.addEventListener('change',()=>{
      const ids=[...(demo().examDraft.desktopIds||[])];
      const dtId=el.dataset.examDtMulti;
      const idx=ids.indexOf(dtId);
      if(idx>=0) ids.splice(idx,1); else ids.push(dtId);
      act('exam-set-desktops',{desktopIds:ids});
    });
  });
  root.querySelectorAll('[data-exam-toggle]').forEach(el=>{
    el.addEventListener('change',()=>{
      const scope=[...demo().examDraft.scope];
      const idx=scope.indexOf(el.dataset.examToggle);
      if(idx>=0) scope.splice(idx,1); else scope.push(el.dataset.examToggle);
      act('exam-set-scope',{scope});
    });
  });
  root.querySelectorAll('[data-exam-all]').forEach(el=>{
    el.addEventListener('click',()=>{
      const all=termsInCr(s(),cr().id).filter(t=>t.id!==mt().id&&t.online).map(t=>t.id);
      act('exam-set-scope',{scope:all});
    });
  });
  root.querySelectorAll('[data-exam-clear]').forEach(el=>{
    el.addEventListener('click',()=>act('exam-set-scope',{scope:[]}));
  });
  root.querySelectorAll('[data-exam-dt-default]').forEach(el=>{
    el.addEventListener('click',()=>act('exam-set-desktops',{defaultDesktopId:el.dataset.examDtDefault}));
  });
  root.querySelectorAll('[data-exam-entries]').forEach(el=>{
    el.addEventListener('change',()=>act('exam-toggle-entries'));
  });
  root.querySelectorAll('[data-exam-restore]').forEach(el=>{
    el.addEventListener('change',()=>act('exam-set-restore-mode',{mode:el.value}));
  });

  // drag reorder
  bindDragReorder();

  // sortable table headers
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
      const ctx=row.dataset.dragCtx||'deploy'; // 'deploy' or 'maint'
      if(!dragSrcId||dragSrcId===targetId) return;
      if(ctx==='maint'){
        const scope=[...demo().maintDraft.scope];
        const srcPos=scope.indexOf(dragSrcId);
        if(srcPos<0) return;
        scope.splice(srcPos,1);
        const tgtPos=scope.indexOf(targetId);
        if(tgtPos<0){ scope.splice(srcPos,0,dragSrcId); return; }
        scope.splice(tgtPos,0,dragSrcId);
        act('maint-reorder',{scope});
        // auto-apply maint IP rules after drag
        setTimeout(()=>act('maint-apply-ip-rules',{
          serverAddr:root.querySelector('#mip-srv')?.value,
          ipBase:root.querySelector('#mip-base')?.value,
          ipStart:Number(root.querySelector('#mip-start')?.value||20),
          subnetMask:root.querySelector('#mip-mask')?.value,
          gateway:root.querySelector('#mip-gw')?.value,
          dns:root.querySelector('#mip-dns')?.value}),100);
      } else {
        const scope=[...demo().deployDraft.scope];
        const srcPos=scope.indexOf(dragSrcId);
        if(srcPos<0) return;
        scope.splice(srcPos,1);
        const tgtPos=scope.indexOf(targetId);
        if(tgtPos<0){ scope.splice(srcPos,0,dragSrcId); return; }
        scope.splice(tgtPos,0,dragSrcId);
        act('deploy-reorder',{scope});
        // auto-apply deploy rules after drag
        setTimeout(()=>{saveRulesIfPresent();setTimeout(()=>act('deploy-apply-rules'),80);},100);
      }
    });
  });
}
