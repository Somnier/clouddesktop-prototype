import { createStateClient } from '/shared/state-client.js';
import { getClassroom, getTerm, termsInCr, taskForCr, crRuntime, termLabel, termSeat, termIp, campusStats } from '/shared/model.js';
import { esc, fmtTime, relTime, tone, pill } from '/shared/ui.js';

const root = document.getElementById('app');
const client = createStateClient(render);
client.connect();

function s(){ return client.get(); }
function cr(){ return getClassroom(s(), s().demo.focusClassroomId); }
function mt(){ return getTerm(s(), s().demo.motherId); }
function ctrl(){ return getTerm(s(), s().demo.controlledId); }
async function act(a,p={}){ try{ await client.send(a,p); }catch(e){ console.warn(e.message); } }

function showDirConfirm(title,msg,onOk){
  const ov=document.createElement('div'); ov.className='dir-modal-overlay';
  ov.innerHTML=`<div class="dir-modal"><h3>${title}</h3><p>${msg}</p><div class="dir-modal-actions"><button class="dir-btn" data-dm="cancel">取消</button><button class="dir-btn danger" data-dm="ok">确认重置</button></div></div>`;
  document.body.appendChild(ov);
  ov.querySelector('[data-dm="cancel"]').addEventListener('click',()=>ov.remove());
  ov.querySelector('[data-dm="ok"]').addEventListener('click',()=>{ov.remove();onOk();});
  ov.addEventListener('click',(e)=>{if(e.target===ov)ov.remove();});
}

function render(state){
  if(!state) return;
  root.innerHTML = page();
  bind();
}

function page(){
  const state = s();
  const c = cr();
  const m = mt();
  const ct = ctrl();
  const tk = taskForCr(state, c.id);
  const rt = crRuntime(state, c.id);
  const terms = termsInCr(state, c.id);
  const studentTerms = terms.filter(t=>t.use!=='教师终端');

  const stageLabel = {blank:'未部署',bound:'已设置布局',deployed:'已部署',registered:'已注册'};

  /* aggregate data stats */
  const allCrs = state.classrooms;
  const deployedCrs = allCrs.filter(cc=>cc.stage==='deployed');
  const totalTerminals = state.terminals.length;
  const totalDesktops = deployedCrs.reduce((n,cc)=>(cc.desktopCatalog||[]).length+n,0);
  const totalSnaps = deployedCrs.reduce((n,cc)=>(cc.snapshotTree||[]).length+n,0);
  const totalImages = deployedCrs.reduce((n,cc)=>(cc.imageStore||[]).length+n,0);
  const totalAlerts = state.alerts.filter(a=>a.status==='open').length;
  const onlineCount = state.terminals.filter(t=>t.online).length;

  return `
  <div class="dir-header">
    <h1>导演台 — 原型测试控制台</h1>
    <div class="dir-links">
      <a href="/terminal/mother" target="_blank">母机终端</a>
      <a href="/terminal/controlled" target="_blank">受控终端</a>
      <a href="/platform" target="_blank">管理平台</a>
    </div>
  </div>

  <div class="dir-grid">
    <!-- ═══ 数据总览与重置 ═══ -->
    <div class="dir-card" style="grid-column:1/-1">
      <h3>四端同步数据 · 全局总览</h3>
      <div class="dir-stats-row">
        <div class="dir-stat"><span class="dir-stat-val">${allCrs.length}</span><span class="dir-stat-lbl">教室</span></div>
        <div class="dir-stat"><span class="dir-stat-val">${totalTerminals}</span><span class="dir-stat-lbl">终端</span></div>
        <div class="dir-stat"><span class="dir-stat-val">${onlineCount}/${totalTerminals}</span><span class="dir-stat-lbl">在线</span></div>
        <div class="dir-stat"><span class="dir-stat-val">${totalImages}</span><span class="dir-stat-lbl">基础镜像</span></div>
        <div class="dir-stat"><span class="dir-stat-val">${totalSnaps}</span><span class="dir-stat-lbl">快照</span></div>
        <div class="dir-stat"><span class="dir-stat-val">${totalDesktops}</span><span class="dir-stat-lbl">桌面</span></div>
        <div class="dir-stat"><span class="dir-stat-val${totalAlerts?' text-err':''}">${totalAlerts}</span><span class="dir-stat-lbl">活跃告警</span></div>
        <div class="dir-stat"><span class="dir-stat-val">${state.logs?.length||0}</span><span class="dir-stat-lbl">日志</span></div>
      </div>
      <div class="dir-btn-group" style="margin-top:12px">
        <button class="dir-btn danger" data-act="reset" title="重置所有数据到 seed.json 初始状态">重置到初始种子数据</button>
        <button class="dir-btn" data-act="clear-logs" title="清空日志">清空日志</button>
        <button class="dir-btn" data-act="clear-alerts" title="关闭所有告警">关闭所有告警</button>
        <button class="dir-btn" data-act="all-online" title="所有终端上线">全员上线</button>
        <button class="dir-btn" data-act="randomize-metrics" title="随机化终端指标">随机化指标</button>
      </div>
      <p style="margin-top:8px">⚠ 重置将丢弃全部会话修改，恢复 seed.json 原始状态。四端（导演台、母机、受控、平台）共享同一 JSON 状态源，实时同步。</p>
    </div>

    <!-- ═══ 各教室数据速查 ═══ -->
    <div class="dir-card" style="grid-column:1/-1">
      <h3>各教室数据速查</h3>
      <table class="dir-table">
        <thead><tr><th>教室</th><th>阶段</th><th>终端</th><th>在线</th><th>镜像</th><th>快照</th><th>桌面</th><th>告警</th><th>还原模式</th><th>操作</th></tr></thead>
        <tbody>${allCrs.map(cc=>{
          const ccRt=crRuntime(state,cc.id);
          const isFocus=cc.id===state.demo.focusClassroomId;
          const imgs=(cc.imageStore||[]).length;
          const snaps=(cc.snapshotTree||[]).length;
          const dts=(cc.desktopCatalog||[]).length;
          const als=state.alerts.filter(a=>a.classroomId===cc.id&&a.status==='open').length;
          return `<tr${isFocus?' class="dir-focus-row"':''}>
            <td>${esc(cc.name)}</td>
            <td>${esc(stageLabel[cc.stage]||cc.stage)}</td>
            <td>${ccRt.total}</td><td>${ccRt.online}/${ccRt.total}</td>
            <td>${imgs}</td><td>${snaps}</td><td>${dts}</td>
            <td${als?' class="text-err"':''}>${als}</td>
            <td style="font-size:.7rem">${esc(cc.restoreMode||'--')}</td>
            <td><button class="dir-btn${isFocus?' primary':''}" data-switch-cr="${cc.id}" style="padding:2px 8px;font-size:.7rem">${isFocus?'✦ 当前':'切换'}</button></td>
          </tr>`;
        }).join('')}</tbody>
      </table>
    </div>

    <!-- ═══ 教室切换 ═══ -->
    <div class="dir-card">
      <h3>演示聚焦教室</h3>
      <p>切换后母机/受控终端将自动切换到该教室。不同教室处于不同部署阶段。</p>
      <div class="dir-btn-group">
        ${state.classrooms.map(cc=>`
          <button class="dir-btn${cc.id===state.demo.focusClassroomId?' primary':''}" data-switch-cr="${cc.id}">
            ${esc(cc.name)}\n(${stageLabel[cc.stage]||cc.stage})
          </button>
        `).join('')}
      </div>
      <p>当前: <strong>${esc(c?.name||'--')}</strong> · ${stageLabel[c?.stage]||c?.stage||'--'}
        · 在线 ${rt.online}/${rt.total}</p>
    </div>

    <!-- ═══ 实时状态 ═══ -->
    <div class="dir-card">
      <h3>实时状态</h3>
      <p>母机画面: <strong>${esc(m?.screen||'--')}</strong> · 管理状态: <strong>${esc(m?.controlState||'--')}</strong></p>
      ${tk?`<p>任务: ${esc(tk.label)} · ${esc(tk.phase)} · ${tk.counts.completed}/${tk.counts.total}${tk.counts.failed?` · 失败 ${tk.counts.failed}`:''}</p>`:'<p>无活跃任务</p>'}
      <p>受控: <strong>${esc(termLabel(ct)||'--')}</strong> · ${ct?.online?'在线':'离线'} · screen: ${esc(ct?.screen||'--')}</p>
    </div>

    <!-- ═══ 测试流程：单机功能 ═══ -->
    <div class="dir-card">
      <h3>测试流程 A：单机功能</h3>
      <p>终端首页 → 本机配置 → 服务器连接 → 桌面管理 → 一键替换 → 一键重置 → 本机测试</p>
      <div class="dir-btn-group">
        <button class="dir-btn" data-act="go-home">首页</button>
        <button class="dir-btn" data-act="open-local-info">本机配置</button>
        <button class="dir-btn" data-act="open-local-network">服务器连接</button>
        <button class="dir-btn" data-act="open-local-desktop">桌面管理</button>
        <button class="dir-btn" data-act="open-fault-replace">一键替换</button>
        <button class="dir-btn" data-act="open-fault-reset">一键重置</button>
        <button class="dir-btn" data-act="open-selftest">本机测试</button>
      </div>
    </div>

    <!-- ═══ 测试流程：教室接管与部署 ═══ -->
    <div class="dir-card">
      <h3>测试流程 B：网络同传（教室接管 → 布局 → 维护）</h3>
      <p>首页 → 网络同传 → 设置布局(接管+网格) → 教室维护(部署/IP修改) → 释放管理</p>
      <div class="dir-btn-group">
        <button class="dir-btn" data-act="go-home">首页</button>
        <button class="dir-btn" data-act="open-takeover">进入网络同传</button>
        <button class="dir-btn" data-act="confirm-takeover">确认接管</button>
        <button class="dir-btn" data-act="return-workbench">回到工作台</button>
      </div>
      <h4>工作台功能切换</h4>
      <div class="dir-btn-group">
        <button class="dir-btn" data-set-flag="wbTab:layout">设置布局</button>
        <button class="dir-btn" data-set-flag="wbTab:maint">教室维护</button>
        <button class="dir-btn" data-set-flag="opsMode:deploy">部署传输</button>
        <button class="dir-btn" data-set-flag="opsMode:maint-ip">修改IP</button>
      </div>
      <h4>部署操作</h4>
      <div class="dir-btn-group">
        <button class="dir-btn" data-act="deploy-bind-next">模拟绑定下一台</button>
        <button class="dir-btn" data-act="deploy-bind-all">一键全绑定</button>
        <button class="dir-btn" data-act="start-deployment">启动部署</button>
      </div>
      <div class="dir-btn-group">
        <button class="dir-btn" data-act="end-management">释放教室管理</button>
      </div>
    </div>

    <!-- ═══ 测试流程：独立部署向导 ═══ -->
    <div class="dir-card">
      <h3>测试流程 C：独立部署向导（4步）</h3>
      <p>需已接管教室。工作台 → 进入部署 → 4步完成</p>
      <div class="dir-btn-group">
        <button class="dir-btn" data-act="open-deployment">进入部署向导</button>
        <button class="dir-btn" data-deploy-step="0">步骤0:母机准备</button>
        <button class="dir-btn" data-deploy-step="1">步骤1:占位规则</button>
        <button class="dir-btn" data-deploy-step="2">步骤2:终端绑定</button>
        <button class="dir-btn" data-deploy-step="3">步骤3:部署传输</button>
        <button class="dir-btn" data-act="start-deployment">启动分发</button>
      </div>
      <h4>教室维护（独立页面）</h4>
      <div class="dir-btn-group">
        <button class="dir-btn" data-act="open-maint-ip">IP/服务器修改</button>
      </div>
    </div>

    <!-- ═══ 测试流程：考试场景 ═══ -->
    <div class="dir-card">
      <h3>测试流程 D：考试场景</h3>
      <p>工作台 → 考试页面 → 启动考试 → 考试模式 → 考后恢复</p>
      <div class="dir-btn-group">
        <button class="dir-btn" data-act="open-exam">考试页面</button>
        <button class="dir-btn" data-act="start-exam-apply">启动考试</button>
        <button class="dir-btn" data-act="start-exam-restore">考后恢复</button>
      </div>
    </div>

    <!-- ═══ 测试流程：桌面编辑 ═══ -->
    <div class="dir-card">
      <h3>测试流程 E：桌面编辑</h3>
      <p>桌面管理 → 进入编辑 → 编辑完毕 → 合并返回</p>
      <div class="dir-btn-group">
        <button class="dir-btn" data-act="open-local-desktop">桌面管理</button>
        <button class="dir-btn" data-act="finish-desktop-edit">桌面编辑完毕</button>
        <button class="dir-btn" data-act="open-export">导出清单</button>
      </div>
    </div>

    <!-- ═══ 终端控制 ═══ -->
    <div class="dir-card">
      <h3>终端电源与故障模拟</h3>
      <p>点击格子切换受控观察对象。</p>
      <div class="dir-seat-grid" style="grid-template-columns:repeat(${c?.cols||8},1fr)">
        ${studentTerms.map(t=>{
          const isCtrl = t.id===state.demo.controlledId;
          const isBlank = !t.name && !t.ip;
          const cls = ['dir-seat', t.online?'online':'offline', isCtrl?'controlled':'', isBlank?'blank':''].filter(Boolean).join(' ');
          const label = t.seat || t.mac.slice(-5);
          return `<div class="${cls}" data-set-ctrl="${t.id}" title="MAC: ${esc(t.mac)}\nIP: ${esc(t.ip||'无')}\n${esc(t.name||'未命名')}">${esc(label)}</div>`;
        }).join('')}
      </div>
      <div class="dir-btn-group" style="margin-top:10px">
        <button class="dir-btn" data-power="${ct?.id||''}">${ct?.online?'关机':'开机'} ${esc(ct?.seat||ct?.mac?.slice(-5)||'')}</button>
        <button class="dir-btn danger" data-fail="${ct?.id||''}">模拟故障 ${esc(ct?.seat||ct?.mac?.slice(-5)||'')}</button>
      </div>
    </div>

    <!-- ═══ 状态 JSON ═══ -->
    <div class="dir-card">
      <h3>状态快照</h3>
      <div class="dir-status">
<pre>
schema: v${state.meta?.version||'?'}  updated: ${state.meta?.updatedAt||'--'}
focusCr: ${c?.name||'--'} (${c?.stage||'-'})
mother: [${m?.screen||'--'}] ctrl:${m?.controlState||'-'}
controlled: [${ct?.screen||'--'}] task:${ct?.taskState||'-'}
online: ${rt.online}/${rt.total}  deployed: ${rt.deployed}/${rt.total}
task: ${tk?`${tk.type} ${tk.phase} ${tk.counts.completed}/${tk.counts.total} fail:${tk.counts.failed}`:'无'}
deployStep: ${state.demo?.deployDraft?.step??'-'}
logs: ${state.logs?.length||0}  alerts: ${state.alerts?.filter(a=>a.status==='open').length||0}
</pre>
      </div>
    </div>
  </div>`;
}

function bind(){
  root.querySelectorAll('[data-act]').forEach(el=>{
    el.addEventListener('click',()=>{
      if(el.dataset.act==='reset'){
        showDirConfirm('确认重置','重置将丢弃全部会话修改，恢复 seed.json 初始状态。此操作不可撤销。',()=>act('reset'));
        return;
      }
      act(el.dataset.act);
    });
  });
  root.querySelectorAll('[data-switch-cr]').forEach(el=>{
    el.addEventListener('click',()=>act('switch-focus',{classroomId:el.dataset.switchCr}));
  });
  root.querySelectorAll('[data-set-ctrl]').forEach(el=>{
    el.addEventListener('click',()=>act('set-controlled',{id:el.dataset.setCtrl}));
  });
  root.querySelectorAll('[data-deploy-step]').forEach(el=>{
    el.addEventListener('click',()=>act('deploy-goto-step',{step:Number(el.dataset.deployStep)}));
  });
  root.querySelectorAll('[data-set-flag]').forEach(el=>{
    el.addEventListener('click',()=>{
      const [key,val] = el.dataset.setFlag.split(':');
      act('set-flag',{[key]:val});
    });
  });
  root.querySelectorAll('[data-maint-step]').forEach(el=>{
    el.addEventListener('click',()=>act('maint-goto-step',{step:Number(el.dataset.maintStep)}));
  });
  root.querySelectorAll('[data-power]').forEach(el=>{
    el.addEventListener('click',()=>{
      if(el.dataset.power) act('toggle-power',{id:el.dataset.power});
    });
  });
  root.querySelectorAll('[data-fail]').forEach(el=>{
    el.addEventListener('click',()=>{
      if(el.dataset.fail) act('simulate-failure',{id:el.dataset.fail});
    });
  });
}
