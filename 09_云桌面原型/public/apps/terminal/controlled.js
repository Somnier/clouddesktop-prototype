import { createStateClient } from '/shared/state-client.js';
import { getTerm, taskForCr } from '/shared/model.js';
import { esc, defRow } from '/shared/ui.js';

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

/* ══════════ SHELL ══════════ */
function shell(t){
  const dotCls = t.online ? 'dot-ok' : 'dot-err';
  return `<div class="term-shell">
    <div class="term-topbar">
      <div class="brand">云桌面</div>
      <div class="status">
        <span class="dot ${dotCls}"></span><span class="status-label ${t.online?'sol':'sol-err'}">${t.online?'在线':'离线'}</span>
        <span class="sep">·</span>
        <span class="mono">${esc(t.mac)}</span>
        <span class="sep">·</span>
        <span>${t.name ? esc(t.name) : '--'}</span>
        <span class="sep">·</span>
        <span>${t.seat ? esc(t.seat) : '--'}</span>
        <span class="sep">·</span>
        <span class="mono">${t.ip ? esc(t.ip) : '--'}</span>
      </div>
    </div>
    <div class="term-body">${renderBody(t)}</div>
  </div>`;
}

/* ══════════ BODY — task screens only ══════════ */
function renderBody(t){
  const scr = t.screen || 'home';

  /* Offline */
  if(!t.online && t.power !== 'rebooting'){
    return centerScreen('终端离线', '当前终端未开机或网络不可达', '');
  }

  /* Not controlled — this page only appears when classroom is taken over */
  if(t.controlState !== 'controlled'){
    return centerScreen('未被管理', '当前终端未被任何母机接管，无任务画面。', '请在终端管理系统主页操作。');
  }

  /* ── 8 task states ── */
  switch(scr){
  case 'controlled-waiting':
    return centerScreen('等待任务开始',
      '当前由母机管理中',
      '任务即将分发至本终端，请勿关机或断网');

  case 'controlled-running':{
    const tk = taskForCr(s(), t.classroomId);
    const item = tk?.items.find(i=>i.terminalId===t.id);
    const labels = {transferring:'正在接收桌面数据',applying:'正在写入桌面配置',rebooting:'正在重启验证'};
    const pctVal = item?.state==='transferring'?35:item?.state==='applying'?70:item?.state==='rebooting'?90:50;
    return `<div class="ctrl-center">
      <div class="ctrl-title">${labels[item?.state]||'执行中'}</div>
      <div class="ctrl-sub">${esc(t.taskNote||'')}</div>
      <div class="ctrl-progress">
        <div class="progress-bar"><div class="fill" style="width:${pctVal}%"></div></div>
      </div>
      <div class="ctrl-detail">请勿关机或操作本终端</div>
    </div>`;
  }

  case 'controlled-done':
    return `<div class="ctrl-center">
      <div class="ctrl-title" style="color:var(--t-ok)">任务完成</div>
      <div class="ctrl-sub">${t.name ? esc(t.name) : esc(t.mac)} · ${t.ip ? esc(t.ip) : '待分配'}</div>
      <div class="ctrl-detail">等待母机确认整体任务结果</div>
    </div>`;

  case 'controlled-failed':{
    const tk = taskForCr(s(), t.classroomId);
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

/* ── Controlled idle: mother manages classroom, no active task for this terminal ── */
function controlledIdleScreen(t){
  return `<div class="ctrl-center">
    <div class="ctrl-title">受控中</div>
    <div class="ctrl-sub">当前教室由母机管理</div>
    <div class="ctrl-detail-box">
      ${defRow('机器名', t.name||'--')}
      ${defRow('座位号', t.seat||'--')}
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
