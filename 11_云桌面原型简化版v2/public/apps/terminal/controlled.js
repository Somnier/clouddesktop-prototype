import { createStateClient } from '/shared/state-client.js';
import { getTerm, taskForCr, getClassroom, crRuntime } from '/shared/model.js';
import { esc, defRow, pill, pct } from '/shared/ui.js';

const root = document.getElementById('app');
const client = createStateClient(render);
client.connect();

function s(){ return client.get(); }
function ctrl(){ return getTerm(s(), s().demo.controlledId); }

function render(state){
  if(!state) return;
  const t = ctrl();
  if(!t) return;
  root.innerHTML = shell(t);
}

/* ══════════ SHELL — aligned with mother terminal topbar style ══════════ */
function shell(t){
  return `<div class="term-shell">
    <div class="term-topbar">
      <div class="brand">云桌面管理系统</div>
      <div class="status">
        <span class="dot ${t.online?'dot-ok':'dot-err'}"></span><span class="status-label ${t.online?'sol':'sol-err'}">${t.online?'在线':'离线'}</span>
        <span class="sep">|</span>
        <span>座位: ${esc(t.seat||'--')}</span>
        <span class="sep">|</span>
        <span>机器名: ${esc(t.name||'未命名')}</span>
        <span class="sep">|</span>
        <span>IP: <span class="mono">${t.ip?esc(t.ip):'未配置'}</span></span>
      </div>
    </div>
    <div class="term-body">${renderBody(t)}</div>
  </div>`;
}

/* ══════════ BODY ══════════ */
function renderBody(t){
  const state = s();
  const scr = t.screen || 'home';

  /* Offline */
  if(!t.online && t.power !== 'rebooting'){
    return centerScreen('终端离线', '当前终端未开机或网络不可达', '');
  }

  /* Not controlled — show empty / idle state */
  if(t.controlState !== 'controlled'){
    return emptyScreen();
  }

  /* Mother screen context — determines if we're in binding phase */
  const demo = state.demo;
  const motherScreen = demo?.motherScreen || '';

  /* ── Binding phase: mother is in deploy-bind, controlled can claim position ── */
  if(motherScreen === 'deploy-bind'){
    return bindingScreen(t, state);
  }

  /* ── Layout phase: mother is setting layout ── */
  if(motherScreen === 'deploy-prep' || motherScreen === 'deploy-grid'){
    return centerScreen('等待布局设置',
      '母机正在设置教室布局',
      '布局完成后将进入终端绑定阶段');
  }

  /* ── Task screens ── */
  switch(scr){
  case 'controlled-waiting':
    return centerScreen('等待任务开始',
      '当前由母机管理中',
      '任务即将分发至本终端，请勿关机或断网');

  case 'controlled-running':{
    const tk = taskForCr(state, t.classroomId);
    const item = tk?.items.find(i=>i.terminalId===t.id);
    const labels = {
      queued:'排队等待中',
      transferring:'正在接收桌面数据',
      applying:'正在写入桌面配置',
      rebooting:'正在重启验证'
    };
    /* Compute progress from task item data */
    let pctVal = 0;
    if(item){
      if(item.state==='queued') pctVal = 5;
      else if(item.state==='transferring') pctVal = item.pct != null ? Math.round(item.pct) : 35;
      else if(item.state==='applying') pctVal = item.pct != null ? Math.round(item.pct) : 70;
      else if(item.state==='rebooting') pctVal = 90;
      else pctVal = 50;
    }
    return `<div class="ctrl-center">
      <div class="ctrl-title">${labels[item?.state]||'执行中'}</div>
      <div class="ctrl-sub">${esc(t.taskNote||'')}</div>
      <div class="ctrl-progress">
        <div class="progress-bar"><div class="fill" style="width:${pctVal}%"></div></div>
        <div style="text-align:center;font-size:.78rem;color:var(--t-text3);margin-top:4px">${pctVal}%</div>
      </div>
      <div class="ctrl-detail">请勿关机或操作本终端</div>
    </div>`;
  }

  case 'controlled-done':
    return `<div class="ctrl-center">
      <div class="ctrl-title" style="color:var(--t-ok)">任务完成</div>
      <div class="ctrl-sub">${t.seat ? esc(t.seat)+' · ' : ''}${t.name ? esc(t.name) : esc(t.mac)} · ${t.ip ? esc(t.ip) : '待分配'}</div>
      <div class="ctrl-detail">等待母机确认整体任务结果</div>
    </div>`;

  case 'controlled-failed':{
    const tk = taskForCr(state, t.classroomId);
    const item = tk?.items.find(i=>i.terminalId===t.id);
    return `<div class="ctrl-center">
      <div class="ctrl-title" style="color:var(--t-err)">执行失败</div>
      <div class="ctrl-sub">${esc(item?.failReason||'未知错误')}</div>
      <div class="ctrl-detail">请联系现场工程师或通过母机发起单机补救</div>
    </div>`;
  }

  case 'controlled-maintain':
    return centerScreen('保持当前状态',
      '本终端未被纳入当前任务范围',
      '无需操作，等待教室任务整体完成');

  case 'controlled-interrupted':
    return centerScreen('任务已中断',
      '母机中断了当前任务',
      '请等待母机重新下发任务或释放教室管理');

  case 'controlled-mother-lost':
    return centerScreen('母机连接丢失',
      '无法连接到母机，可能已断网或关机',
      '请等待母机恢复连接，或联系现场工程师');

  default:
    /* Controlled idle — mother has taken over but no task yet */
    return controlledIdleScreen(t);
  }
}

/* ── Empty state: not controlled by any mother (normal terminal state) ── */
function emptyScreen(){
  return `<div class="ctrl-center">
    <div class="ctrl-title" style="color:var(--t-text3)">待命</div>
    <div class="ctrl-sub" style="color:var(--t-text3)">当前终端未被任何母机接管</div>
    <div class="ctrl-detail">进入网络同传后，本终端将自动受母机控制</div>
  </div>`;
}

/* ── Binding screen: mother is in deploy-bind phase ── */
function bindingScreen(t, state){
  const demo = state.demo;
  const bindings = demo.deployDraft?.bindings || {};
  const grid = demo.deployDraft?.grid || {};
  const rules = demo.deployDraft?.rules || {};
  /* Check if this terminal is already bound */
  const myBinding = Object.entries(bindings).find(([idx,b])=>b.terminalId===t.id);
  if(myBinding){
    const [idx, binding] = myBinding;
    const block = (grid.blocks||[]).find(b=>String(b.idx)===String(idx));
    const seatStr = block ? seatLabel(block.row, block.col, rules) : '#'+(Number(idx)+1);
    return `<div class="ctrl-center">
      <div class="ctrl-title" style="color:var(--t-ok)">已绑定</div>
      <div class="ctrl-sub">本终端已绑定到座位 <strong style="font-size:1.2em">${esc(seatStr)}</strong></div>
      <div class="ctrl-detail-box">
        ${defRow('座位号', seatStr)}
        ${defRow('机器名', t.name||'--')}
        ${defRow('IP', t.ip||'--', {mono:true})}
        ${defRow('MAC', t.mac||'--', {mono:true})}
      </div>
      <div class="ctrl-detail">等待母机完成所有终端绑定</div>
    </div>`;
  }
  /* Not yet bound — show prompt to claim */
  return `<div class="ctrl-center">
    <div class="ctrl-title">等待绑定</div>
    <div class="ctrl-sub">母机正在分配终端座位</div>
    <div style="margin:20px 0;padding:16px 24px;background:var(--t-accent-bg);border:1px solid var(--t-accent);border-radius:var(--radius)">
      <div style="font-size:.95rem;color:var(--t-accent);font-weight:600;text-align:center">等待母机分配座位到本终端</div>
    </div>
    <div class="ctrl-detail-box">
      ${defRow('机器名', t.name||'--')}
      ${defRow('MAC', t.mac||'--', {mono:true})}
      ${defRow('IP', t.ip||'--', {mono:true})}
    </div>
    <div class="ctrl-detail">母机将按顺序为每台终端分配座位</div>
  </div>`;
}

/* ── Controlled idle: mother manages classroom, no active task ── */
function controlledIdleScreen(t){
  return `<div class="ctrl-center">
    <div class="ctrl-title">受控中</div>
    <div class="ctrl-sub">当前教室由母机管理</div>
    <div class="ctrl-detail-box">
      ${defRow('座位号', t.seat||'--')}
      ${defRow('机器名', t.name||'--')}
      ${defRow('IP', t.ip||'--', {mono:true})}
    </div>
    <div class="ctrl-detail">在母机释放教室管理之前，本终端不可操作。<br>等待母机分发任务或释放管理。</div>
  </div>`;
}

/* ── Reusable centered screen ── */
function centerScreen(title, sub, detail){
  return `<div class="ctrl-center">
    <div class="ctrl-title">${title}</div>
    <div class="ctrl-sub">${sub}</div>
    ${detail?`<div class="ctrl-detail">${detail}</div>`:''}
  </div>`;
}

/* Compute seat label from grid coordinates and rules — same as terminal.js */
function seatLabel(row, col, rules){
  const start = (rules.startLetter||'A').charCodeAt(0);
  const flow = rules.seatFlow||'col';
  let letter, num;
  if(flow==='col'){ letter=String.fromCharCode(start+col); num=row+1; }
  else { letter=String.fromCharCode(start+row); num=col+1; }
  return letter+String(num).padStart(2,'0');
}
