import express from 'express';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const SEED_FILE  = path.join(__dirname,'data/seed.json');
const STATE_FILE = path.join(__dirname,'data/state.json');
const PUBLIC     = path.join(__dirname,'public');

const seed = JSON.parse(readFileSync(SEED_FILE,'utf8'));
let state;
const sseClients = new Set();
let uid_ctr = 0;
const uid = () => 'u'+(++uid_ctr).toString(36)+Date.now().toString(36);
const now = () => new Date().toISOString();
const clamp = (v,lo,hi) => Math.max(lo,Math.min(hi,v));


/* ══════════ BUILD STATE FROM SEED ══════════ */
function buildState(s){
  const terminals=[]; const tasks=[]; const logs=[];
  const classrooms = s.classrooms.map(c=>({...c, motherId:null, memberMacs:[], currentTaskId:null, status:c.stage==='deployed'?'idle':c.stage,
    lastSyncTime:c.stage==='deployed'?now():null}));

  for(const c of classrooms){
    const sc = s.classrooms.find(x=>x.id===c.id);
    const total = sc.terminalCount;
    for(let i=0; i<total; i++){
      const mac = genMac(c.id, i);
      const macList = [mac];
      if(i%7===0 || i===sc.motherIndex) macList.push(genMac(c.id+'x', i)); // some have 2 NICs
      const hw = {
        cpu: ['Intel i5-13400','Intel i7-13700','AMD Ryzen 5 7600'][i%3],
        mem: ['8GB DDR5','16GB DDR5','32GB DDR5'][i%3],
        diskModel: ['WD SN770 512G','Samsung 980 Pro 1TB','Intel 670p 512G'][i%3],
        diskSn: 'SN-'+c.id.toUpperCase()+'-'+String(i).padStart(3,'0'),
        gpu: ['Intel UHD 730','NVIDIA RTX 3060','AMD RX 6600'][i%3]
      };

      const isBlank = c.stage === 'blank';
      const seatLabel = isBlank ? null : genSeat(sc, i);
      const useLbl = isBlank ? '未设定' : (i===0 ? '教师终端' : '学生终端');
      const ipAddr = isBlank ? null : sc.networkBase+'.'+(20+i);
      const nameStr = isBlank ? null : c.id.split('-')[1].toUpperCase()+'-'+genSeat(sc, i);

      const t = {
        id: c.id+'::'+i, classroomId: c.id, campusId: c.campusId, index: i,
        // identity
        mac, macList, hw, name: nameStr, seat: seatLabel, use: useLbl,
        // network
        ip: ipAddr, subnetMask: isBlank?null:'255.255.255.0',
        gateway: isBlank?null:sc.gateway, dns: isBlank?[]:sc.dns,
        serverAddr: isBlank?null:sc.serverAddress,
        // desktops — teacher terminal gets all visible, students exclude 教师 desktop
        ...(() => {
          const allDts = isBlank ? [] : (sc.desktopCatalog||[]);
          const visibleDts = allDts.filter(d=>{
            if(useLbl!=='教师终端' && /教师/.test(d.name)) return false;
            return true;
          });
          const validDefault = visibleDts.find(d=>d.id===sc.defaultDesktopId);
          const effectiveDefault = validDefault ? sc.defaultDesktopId : (visibleDts[0]?.id||null);
          /* enrich each desktop with per-desktop fields */
          const enrichDt = (d) => {
            const baseImg = (sc.snapshotTree||[]).find(sn=>sn.id===d.snapshotId);
            const rootImg = baseImg ? (sc.imageStore||[]).find(im=>im.id===baseImg.imageId) : null;
            return {
              ...d,
              restoreMode: d.restoreMode || sc.restoreMode || '还原系统盘，保留数据盘',
              uploaded: d.syncStatus==='synced',
              physicalDeploy: d.physicalDeploy || false,
              baseImageName: rootImg ? rootImg.name : (d.os||'未知'),
              dataDisks: d.dataDisks || (d.dataDisk ? [{id:'dd-'+d.id,name:'数据盘',drive:d.dataDisk.match(/([A-Z]:)/)?d.dataDisk.match(/([A-Z]:)/)[1]:'D:',size:d.dataDisk.match(/(\d+G)/)?d.dataDisk.match(/(\d+G)/)[1]:'20GB',sharedWith:[]}] : [])
            };
          };
          return {
            desktops: visibleDts.map(d=>enrichDt(d)),
            defaultDesktopId: isBlank ? null : effectiveDefault,
            bios: isBlank ? null : {
              bootEntries: visibleDts.map(d=>d.id),
              defaultBootId: effectiveDefault,
              restoreMode: sc.restoreMode||'还原系统盘，保留数据盘'
            }
          };
        })(),
        // state
        online: true, power: 'on', screen: 'home',
        controlState: 'unmanaged', boundClassroom: isBlank?null:c.id,
        taskState: null, taskNote: '',
        // registration & sync
        registered: !isBlank && (sc.registeredOnServer||false),
        sync: isBlank?null:'synced', syncNote: isBlank?'':'已同步',
        lastSyncTime: isBlank?null:now(),
        // runtime
        metrics: {
          cpu: 15+Math.floor(Math.random()*30),
          gpu: 5+Math.floor(Math.random()*25),
          cpuTemp: 38+Math.floor(Math.random()*25),
          gpuTemp: 35+Math.floor(Math.random()*20),
          memUsed: 4+Math.floor(Math.random()*8),
          memTotal: [8,16,16,32][i%4],
          diskUsed: (()=>{ const dts=isBlank?[]:(sc.desktopCatalog||[]).filter(d=>useLbl==='教师终端'||!/教师/.test(d.name)); const dtSum=dts.reduce((s,d)=>s+(d.diskSize||45),0); return dtSum+35+Math.floor(Math.random()*10); })(),
          diskTotal: i===0 ? 512 : [256,512,512,1024][i%4]
        },
        heartbeat: now(),
        // internal
        _recoverTicks: 0, _resumeScreen: null
      };

      // faulty terminal
      if(sc.faultyTerminalIndex===i){
        t.online=false; t.power='off'; t.sync='failed'; t.syncNote='硬件故障';
      }
      // give the mother terminal a slightly warm CPU for demo variety
      if(i===sc.motherIndex){
        t.metrics.cpuTemp = 72; t.metrics.gpuTemp = 90;
      }
      terminals.push(t);
    }
  }

  // generate sample alerts for deployed classrooms
  const alerts = [];
  for(const c of classrooms){
    if(c.stage!=='deployed') continue;
    const crTerms = terminals.filter(t=>t.classroomId===c.id);
    // keyboard missing alert — hardware disconnect = high
    if(crTerms.length>5){
      alerts.push({id:'alert-seed-kb-'+c.id, level:'high', title:'键盘设备异常',
        detail:c.name+' 座位 '+crTerms[5].seat+' 终端键盘未检测到',
        terminalId:crTerms[5].id, classroomId:c.id, status:'open', at:'2026-03-20T08:15:00Z'});
    }
    // headphone missing — hardware disconnect = high
    if(crTerms.length>12){
      alerts.push({id:'alert-seed-hp-'+c.id, level:'high', title:'耳机设备未连接',
        detail:c.name+' 座位 '+crTerms[12].seat+' 耳机插孔无信号',
        terminalId:crTerms[12].id, classroomId:c.id, status:'open', at:'2026-03-19T14:30:00Z'});
    }
    // offline terminal alert — offline = medium (may be powered off or broken)
    const faultyT = crTerms.find(t=>!t.online);
    if(faultyT){
      alerts.push({id:'alert-seed-offline-'+c.id, level:'medium', title:'终端离线',
        detail:c.name+' 终端 '+faultyT.mac+' 持续离线，可能关机或硬件故障',
        terminalId:faultyT.id, classroomId:c.id, status:'open', at:'2026-03-18T10:00:00Z'});
    }
    // disk health warning — SMART/disk = high (hardware)
    if(crTerms.length>20){
      alerts.push({id:'alert-seed-disk-'+c.id, level:'high', title:'硬盘健康预警',
        detail:c.name+' 座位 '+crTerms[20].seat+' 硬盘 SMART 状态异常，剩余寿命 < 15%',
        terminalId:crTerms[20].id, classroomId:c.id, status:'open', at:'2026-03-17T09:00:00Z'});
    }
    // disk speed low — performance issue = medium
    if(crTerms.length>22){
      alerts.push({id:'alert-seed-diskspd-'+c.id, level:'medium', title:'硬盘速率过低',
        detail:c.name+' 座位 '+crTerms[22].seat+' 硬盘顺序读取速率降至 45 MB/s',
        terminalId:crTerms[22].id, classroomId:c.id, status:'open', at:'2026-03-19T14:30:00Z'});
    }
    // mouse missing — hardware disconnect = high
    if(crTerms.length>8){
      alerts.push({id:'alert-seed-ms-'+c.id, level:'high', title:'鼠标设备未检测',
        detail:c.name+' 座位 '+crTerms[8].seat+' 鼠标设备离线',
        terminalId:crTerms[8].id, classroomId:c.id, status:'open', at:'2026-03-20T07:45:00Z'});
    }
    // sync delay warning — sync issue = low
    if(crTerms.length>15){
      const st=crTerms[15];
      st.sync='syncing'; st.syncNote='同步延迟';
      alerts.push({id:'alert-seed-sync-'+c.id, level:'low', title:'桌面同步延迟',
        detail:c.name+' 座位 '+st.seat+' 桌面同步超过 30 分钟未完成',
        terminalId:st.id, classroomId:c.id, status:'open', at:'2026-03-20T06:30:00Z'});
    }
    // monitor signal lost — hardware error = high
    if(crTerms.length>30){
      alerts.push({id:'alert-seed-mon-'+c.id, level:'high', title:'显示器信号丢失',
        detail:c.name+' 座位 '+crTerms[30].seat+' 显示器 HDMI 信号未检测',
        terminalId:crTerms[30].id, classroomId:c.id, status:'open', at:'2026-03-19T11:15:00Z'});
    }
    // temperature warning — hardware abnormal = high
    if(crTerms.length>25){
      crTerms[25].metrics.cpuTemp = 92;
      crTerms[25].metrics.gpuTemp = 85;
      alerts.push({id:'alert-seed-temp-'+c.id, level:'medium', title:'CPU 温度过高',
        detail:c.name+' 座位 '+crTerms[25].seat+' CPU 温度达到 92°C',
        terminalId:crTerms[25].id, classroomId:c.id, status:'open', at:'2026-03-20T09:20:00Z'});
    }
    // memory error — hardware abnormal = high
    if(crTerms.length>18){
      alerts.push({id:'alert-seed-mem-'+c.id, level:'high', title:'内存校验错误',
        detail:c.name+' 座位 '+crTerms[18].seat+' 内存 ECC 校验异常，建议更换',
        terminalId:crTerms[18].id, classroomId:c.id, status:'open', at:'2026-03-19T16:45:00Z'});
    }
    // make one more terminal offline for variety (different from faulty)
    const seedCr = s.classrooms.find(x=>x.id===c.id);
    if(crTerms.length>35 && !seedCr.faultyTerminalIndex){
      const offT = crTerms[35];
      offT.online=false; offT.power='off'; offT.sync='failed'; offT.syncNote='网络中断';
    }
  }

  // demo state
  const focusCr = s.demo.focusClassroomId;
  const focusCrTerms = terminals.filter(t=>t.classroomId===focusCr);
  const motherId = focusCrTerms[s.demo.motherIndex]?.id;
  const controlledId = focusCrTerms[s.demo.controlledIndex]?.id;

  return {
    meta: { version: 3, updatedAt: now() },
    school: s.school, campuses: [...s.campuses], servers: s.servers.map(sv=>({...sv})),
    classrooms, terminals, tasks, alerts, logs,
    demo: {
      focusCampusId: s.demo.focusCampusId, focusClassroomId: focusCr,
      motherId, controlledId,
      motherScreen: 'home',
      takeover: { mode:null, scannedMacs:[], groups:{main:[],unbound:[],other:[]}, classroomName:null, confirmed:false },
      deployDraft: {
        step: 0, /* 0=prep, 1=grid, 2=bind, 3=transfer */
        deployMode: 'incremental', /* 'incremental' | 'full' */
        grid: { rows:7, cols:6, blocks:[] },
        scope: [], /* terminal IDs in order (populated from bindings on start) */
        rules: {
          ipBase: '', ipStart: 20,
          namePrefix: '',
          defaultUse: '学生终端'
        },
        bindings: {}, /* blockIdx -> { terminalId, mac } */
        desktopIds: [], defaultDesktopId: null,
        assignments: [],
        validation: { valid:true, errors:[] }
      },
      maintDraft: { step:0, scope:[], keepIds:[], desktopId:null, desktopIds:[], defaultDesktopId:null, restoreMode:'还原系统盘，保留数据盘', category:'桌面更新', ipPreview:[], newServerAddr:'', newIpBase:'', newIpStart:20, newSubnetMask:'255.255.255.0', newGateway:'', newDns:'' },
      examDraft: { step:0, scope:[], keepIds:[], desktopId:null, desktopIds:[], hideEntries:true, restoreMode:'还原系统盘和数据盘' },
      desktopEdit: { active:false, returnScreen:null },
      _desktopReturnScreen: null,
      faultReplace: { serverReachable:true, selectedClassroomId:null, suggestedTerminalId:null, suggestedSeat:null, suggestedName:null, suggestedMac:null, manualSeat:null, confirmed:false },
      faultReset: { serverReachable:false, terminalRegistered:false, confirmed:false },
      assetSync: { status:'idle', progress:0 },
      examState: { applied:false, appliedAt:null, appliedDesktopId:null, appliedIds:[], restoreAvailable:false, entriesHidden:false, restored:false },
      flags: {},
      transferControl: {} /* terminalId -> {paused:bool, speed:'normal'|'slow'} */
    }
  };
}

function genMac(prefix, idx){
  const h=s=>s.toString(16).padStart(2,'0');
  const hash = (prefix+idx).split('').reduce((a,c)=>((a<<5)-a)+c.charCodeAt(0),0);
  return '5c:7a:'+h((hash>>24)&0xff)+':'+h((hash>>16)&0xff)+':'+h((hash>>8)&0xff)+':'+h(hash&0xff);
}
function genSeat(sc, idx){
  if(idx===0) return 'T01';
  const adjustedIdx = idx - 1;
  const rowsPerCol = sc.rows||7;
  const col = Math.floor(adjustedIdx / rowsPerCol);
  const row = adjustedIdx % rowsPerCol;
  return String.fromCharCode(65+col)+String(row+1).padStart(2,'0');
}


/* ══════════ HELPERS ══════════ */
function crById(id){ return state.classrooms.find(c=>c.id===id); }
function termById(id){ return state.terminals.find(t=>t.id===id); }
function termsInCr(crId){ return state.terminals.filter(t=>t.classroomId===crId); }
function taskForCr(crId){ return state.tasks.find(t=>t.classroomId===crId && t.phase==='running') || state.tasks.find(t=>t.classroomId===crId); }
/* Generate seat grid blocks from classroom dimensions */
function initGridBlocks(crId, crObj){
  const crRows=crObj.rows||7;
  const crCols=crObj.cols||Math.max(1,Math.ceil(Math.max(1,(termsInCr(crId).length-1))/crRows));
  const blocks=[];
  for(let col=0;col<crCols;col++){
    for(let row=0;row<crRows;row++){
      blocks.push({idx:col*crRows+row,pos:String.fromCharCode(65+col)+String(row+1).padStart(2,'0'),row,col,state:'active'});
    }
  }
  return {rows:crRows,cols:crCols,blocks};
}
function addLog(level, source, title, detail=''){
  state.logs.unshift({id:uid(),level,source,title,detail,at:now()});
  if(state.logs.length>100) state.logs.length=100;
}
function setTermTaskState(t, st, note=''){
  t.taskState=st; t.taskNote=note;
  const screenMap = {queued:'controlled-waiting',transferring:'controlled-running',applying:'controlled-running',
    rebooting:'controlled-running',completed:'controlled-done',failed:'controlled-failed',maintain:'controlled-maintain',cancelled:'controlled-cancelled'};
  if(screenMap[st]) t.screen=screenMap[st];
}
function buildItems(ids){
  return ids.map(id=>({terminalId:id,state:'queued',ticks:0,note:'',failReason:'',slow:Math.random()<0.1}));
}
function syncCounts(task){
  const items=task.items; const c={total:items.length,queued:0,transferring:0,applying:0,rebooting:0,completed:0,failed:0};
  items.forEach(i=>{ if(c[i.state]!==undefined) c[i.state]++; });
  task.counts=c;
}
function failItem(task,item,t,reason){
  item.state='failed';item.failReason=reason;item.ticks=0;
  setTermTaskState(t,'failed',reason);
  state.alerts.unshift({id:'alert-'+uid(),level:'high',title:'任务失败',detail:reason,
    terminalId:t.id,classroomId:task.classroomId,status:'open',at:now()});
}
function createTask(opts){
  return {id:'task-'+uid(),label:opts.label,type:opts.type,classroomId:opts.crId,
    sourceDesktopId:opts.sourceDesktopId||null,selectedIds:[...opts.selectedIds],keepIds:[...(opts.keepIds||[])],
    phase:'running',startedAt:now(),completedAt:null,settings:opts.settings||null,
    assignments:[...(opts.assignments||[])],
    items:buildItems(opts.selectedIds),counts:{total:opts.selectedIds.length,queued:opts.selectedIds.length,
      transferring:0,applying:0,rebooting:0,completed:0,failed:0}};
}
function startTask(task){
  const cr=crById(task.classroomId); state.tasks=state.tasks.filter(t=>t.classroomId!==cr.id); state.tasks.unshift(task);
  cr.currentTaskId=task.id; cr.status='executing';
  task.items.forEach(i=>{ const t=termById(i.terminalId); if(t){t.controlState='controlled';setTermTaskState(t,'queued','');} });
  (task.keepIds||[]).forEach(id=>{ const t=termById(id); if(t&&t.controlState==='controlled'){t.taskState='maintain';t.taskNote='保持现状';t.screen='controlled-maintain';} });
}

/* ── generate assignments from rules ── */
function generateAssignments(demo, cr){
  const rules = demo.deployDraft.rules;
  const scope = demo.deployDraft.scope;
  const assignments = [];
  let ipNum = rules.ipStart || 20;
  let colLetter = (rules.seatStartCol||'A').charCodeAt(0);
  let rowInCol = 1;
  const seatsPerCol = rules.seatSeatsPerCol || cr.rows || 7;
  const prefix = rules.namePrefix||(cr.id.split('-')[1].toUpperCase());

  for(let i=0; i<scope.length; i++){
    const tId = scope[i];
    const t = termById(tId);
    const seat = String.fromCharCode(colLetter)+String(rowInCol).padStart(2,'0');
    const ip = (rules.ipBase||cr.networkBase)+'.'+ipNum;
    const name = prefix+'-'+seat;
    assignments.push({
      terminalId: tId, mac: t.mac,
      seat, ip, name,
      use: rules.defaultUse||'学生终端',
      gateway: rules.gateway||cr.gateway||'',
      dns: rules.dns||((cr.dns||[]).join(','))||'',
      subnetMask: rules.subnetMask||'255.255.255.0',
      serverAddr: rules.serverAddress||cr.serverAddress||'',
      restoreMode: rules.restoreMode, contentMode: rules.contentMode,
      desktopIds: [...demo.deployDraft.desktopIds],
      defaultDesktopId: demo.deployDraft.defaultDesktopId
    });
    ipNum++;
    rowInCol++; if(rowInCol > seatsPerCol){ rowInCol=1; colLetter++; }
  }
  return assignments;
}

/* ── validate assignments ── */
function validateAssignments(assignments){
  const errors=[];
  const ips=new Map(), names=new Map();
  for(const a of assignments){
    if(!a.ip) errors.push(a.mac+': IP 地址为空');
    if(!a.name) errors.push(a.mac+': 机器名为空');
    if(a.ip){ if(ips.has(a.ip)) errors.push(a.ip+': IP 地址冲突（'+a.mac+' 与 '+ips.get(a.ip)+')'); else ips.set(a.ip,a.mac); }
    if(a.name){ if(names.has(a.name)) errors.push(a.name+': 机器名冲突（'+a.mac+' 与 '+names.get(a.name)+')'); else names.set(a.name,a.mac); }
  }
  return { valid: errors.length===0, errors };
}


/* ══════════ ACTIONS ══════════ */
function act(action, payload={}){
  const demo=state.demo; const cr=crById(demo.focusClassroomId); const mt=termById(demo.motherId);
  const task=taskForCr(cr?.id);

  switch(action){

  /* ── GLOBAL ── */
  case 'reset': state=buildState(seed); { const fcr2=crById(state.demo.focusClassroomId); if(fcr2) state.demo.deployDraft.grid=initGridBlocks(fcr2.id,fcr2); } return {ok:true};
  case 'clear-logs': state.logs=[]; return {ok:true};
  case 'clear-alerts': state.alerts.forEach(a=>a.status='closed'); return {ok:true};
  case 'all-online': state.terminals.forEach(t=>{t.online=true;t.power='on';t.heartbeat=now();}); return {ok:true};
  case 'randomize-metrics': state.terminals.filter(t=>t.online).forEach(t=>{const dtMin=(t.desktops||[]).length*45+30;t.metrics={cpu:5+Math.floor(Math.random()*85),gpu:2+Math.floor(Math.random()*60),memUsed:Math.floor(t.metrics.memTotal*(.2+Math.random()*.6)),memTotal:t.metrics.memTotal,diskUsed:Math.max(dtMin,Math.floor(t.metrics.diskTotal*(.15+Math.random()*.6))),diskTotal:t.metrics.diskTotal};}); return {ok:true};
  case 'switch-focus':{
    const newCr=crById(payload.classroomId); if(!newCr) return {ok:false,reason:'教室不存在'};
    const terms=termsInCr(payload.classroomId); if(!terms.length) return {ok:false,reason:'教室无终端'};
    /* Use seed motherIndex for proper terminal selection */
    const seedCr=seed.classrooms.find(sc=>sc.id===payload.classroomId);
    const mIdx=seedCr?.motherIndex||0;
    const motherTerm=terms[Math.min(mIdx,terms.length-1)];
    const ctrlIdx=mIdx===0?1:0;
    demo.focusClassroomId=payload.classroomId; demo.motherId=motherTerm.id;
    demo.controlledId=terms.length>1?terms[Math.min(ctrlIdx,terms.length-1)].id:motherTerm.id; demo.focusCampusId=newCr.campusId;
    demo.takeover={mode:null,scannedMacs:[],groups:{main:[],unbound:[],other:[]},classroomName:null,confirmed:false};
    demo.deployDraft.step=0; demo.deployDraft.scope=[]; demo.deployDraft.assignments=[];
    demo.deployDraft.bindings={}; demo.deployDraft.grid=initGridBlocks(payload.classroomId,newCr);
    demo.deployDraft.rules.ipBase=newCr.networkBase; demo.deployDraft.rules.namePrefix=payload.classroomId.split('-')[1].toUpperCase();
    demo.maintDraft={step:0,scope:[],keepIds:[],desktopId:null,desktopIds:[],defaultDesktopId:null,restoreMode:'还原系统盘，保留数据盘',category:'桌面更新',ipPreview:[],newServerAddr:'',newIpBase:'',newIpStart:20,newSubnetMask:'255.255.255.0',newGateway:'',newDns:''};
    demo.examDraft={step:0,scope:[],keepIds:[],desktopId:null,desktopIds:[],hideEntries:true,restoreMode:'还原系统盘和数据盘'};
    demo.transferControl={}; demo._desktopReturnScreen=null;
    // For deployed classrooms, auto-set mother and go to workbench
    if(newCr.stage==='deployed'){
      motherTerm.controlState='mother'; motherTerm.boundClassroom=newCr.id;
      terms.forEach(t=>{
        if(t.id!==motherTerm.id&&t.online){t.controlState='controlled';t.boundClassroom=newCr.id;t.screen='home';}
        else if(t.id===motherTerm.id){t.screen='workbench';}
        else{t.screen='home';t.controlState='unmanaged';}
      });
      newCr.motherId=motherTerm.id; newCr.status='active';
      demo.motherScreen='workbench';
    } else {
      demo.motherScreen='home';
      terms.forEach(t=>{t.screen='home';t.controlState='unmanaged';t.taskState=null;t.taskNote='';});
    }
    return {ok:true};
  }

  /* ── NAVIGATION ── */
  case 'go-home':
    demo.motherScreen='home'; mt.screen='home'; return {ok:true};

  /* ── LOCAL INFO (TERM-01 sub-pages, editable) ── */
  case 'open-local-info': demo.motherScreen='local-info'; mt.screen='local-info'; return {ok:true};
  case 'open-local-network': demo.motherScreen='local-network'; mt.screen='local-network'; return {ok:true};
  case 'open-local-desktop':{
    if(payload.returnScreen) demo._desktopReturnScreen=payload.returnScreen;
    else demo._desktopReturnScreen=null;
    demo.motherScreen='local-desktop'; mt.screen='local-desktop'; return {ok:true};
  }
  case 'open-fault': demo.motherScreen='fault-replace'; mt.screen='fault-replace'; return {ok:true}; // 10_: no fault menu
  case 'open-selftest': demo.motherScreen='selftest'; mt.screen='selftest'; return {ok:true};

  case 'save-local-info':
    if(payload.name!==undefined) mt.name=payload.name;
    if(payload.seat!==undefined) mt.seat=payload.seat;
    if(payload.use!==undefined) mt.use=payload.use;
    if(payload.ip!==undefined) mt.ip=payload.ip;
    if(payload.subnetMask!==undefined) mt.subnetMask=payload.subnetMask;
    if(payload.gateway!==undefined) mt.gateway=payload.gateway;
    if(payload.dns!==undefined) mt.dns=payload.dns;
    return {ok:true};

  case 'save-local-network':
    if(payload.serverAddr!==undefined) mt.serverAddr=payload.serverAddr;
    return {ok:true};

  /* ── LOCAL DESKTOP MANAGEMENT ── */
  case 'create-desktop-from-file':{
    const dtId = 'dt-'+cr.id+'-'+uid();
    const isPackage = payload.importType === 'package'; /* 成品桌面包 vs 基础镜像 */
    /* create imageStore entry for the imported file */
    const imgId = 'img-'+cr.id+'-'+uid();
    const imgEntry = {id:imgId, name:payload.os||'Windows 11 23H2', os:payload.os||'Windows 11 23H2', importedAt:now()};
    if(!cr.imageStore) cr.imageStore=[];
    cr.imageStore.push(imgEntry);
    /* create base snapshot */
    const snapId = 'snap-'+cr.id+'-'+uid();
    if(!cr.snapshotTree) cr.snapshotTree=[];
    cr.snapshotTree.push({id:snapId, name:(payload.name||'新建桌面')+' 初始快照', imageId:imgId, parentId:null, createdAt:now()});
    /* build data disks */
    const dataDisks = [];
    if(!isPackage && payload.dataDiskSize){
      dataDisks.push({id:'dd-'+dtId, name:'数据盘', drive:payload.dataDiskDrive||'D:', size:payload.dataDiskSize, sharedWith:[]});
    }
    if(isPackage && payload.dataDisks){ dataDisks.push(...payload.dataDisks); }
    const dt = {id:dtId, name:payload.name||'新建桌面',
      os:payload.os||'Windows 11 23H2',
      visibility:'default',
      restoreMode: payload.restoreMode||'还原系统盘，保留数据盘',
      physicalDeploy: payload.physicalDeploy||false,
      uploaded: false,
      baseImageName: imgEntry.name,
      remark:payload.remark||'', syncStatus:'local', snapshotId:snapId,
      dataDisks,
      createdAt:now(), editedAt:now()};
    mt.desktops.push(dt);
    cr.desktopCatalog.push({...dt});
    if(!mt.defaultDesktopId){ mt.defaultDesktopId=dt.id; cr.defaultDesktopId=dt.id; }
    addLog('info','终端','导入桌面: '+dt.name, isPackage?'从桌面包导入':'从镜像新建');
    return {ok:true, desktopId: dtId};
  }
  case 'copy-desktop':{
    const src = mt.desktops.find(d=>d.id===payload.sourceId);
    if(!src) return {ok:false,reason:'源桌面不存在'};
    const dtId = 'dt-'+cr.id+'-'+uid();
    /* create a new snapshot derived from the source desktop's snapshot */
    const snapId = 'snap-'+cr.id+'-'+uid();
    if(!cr.snapshotTree) cr.snapshotTree=[];
    cr.snapshotTree.push({id:snapId, name:(payload.name||(src.name+' 副本'))+' 快照',
      imageId:(cr.snapshotTree.find(s=>s.id===src.snapshotId)||{}).imageId||'unknown',
      parentId:src.snapshotId||null, createdAt:now()});
    const {source:_s, restoreMode:_r, ...srcClean} = src;
    const dt = {...srcClean, id:dtId, name:payload.name||(src.name+' 副本'), version:'v1',
      syncStatus:'local', snapshotId:snapId, createdAt:now(), editedAt:now()};
    mt.desktops.push(dt);
    cr.desktopCatalog.push({...dt});
    addLog('info','终端','复制桌面: '+dt.name,'来自 '+src.name);
    return {ok:true, desktopId: dtId};
  }
  case 'enter-desktop-edit':{
    const dt = mt.desktops.find(d=>d.id===payload.desktopId);
    if(!dt) return {ok:false,reason:'桌面不存在'};
    demo.desktopEdit.returnScreen=demo.motherScreen;
    demo.desktopEdit.active=true; demo.desktopEdit.editingDesktopId=payload.desktopId;
    demo.motherScreen='desktop-rebooting'; mt.screen='desktop-rebooting';
    mt.power='rebooting'; mt.online=false; mt._recoverTicks=2;
    mt._resumeScreen='desktop-editor';
    addLog('info','终端','进入桌面编辑','重启进入 '+dt.name);
    return {ok:true};
  }
  case 'finish-desktop-edit':{
    const dtId = demo.desktopEdit.editingDesktopId;
    const dt = mt.desktops.find(d=>d.id===dtId);
    if(dt){ dt.editedAt=now(); dt.version='v'+(Number(dt.version.replace(/\D/g,''))||0+1);
      /* editing modifies the existing snapshot in-place — no new snapshot layer */
      if(!cr.snapshotTree) cr.snapshotTree=[];
      const existSnap = cr.snapshotTree.find(sn=>sn.id===dt.snapshotId);
      if(existSnap){ existSnap.name = dt.name+' '+dt.version; }
      const cdt=cr.desktopCatalog.find(d=>d.id===dtId); if(cdt){Object.assign(cdt,dt);} }
    demo.desktopEdit.active=false;
    const ret = demo.desktopEdit.returnScreen||'home';
    demo.motherScreen='desktop-merging'; mt.screen='desktop-merging';
    mt.power='rebooting'; mt.online=false; mt._recoverTicks=2;
    mt._resumeScreen=ret;
    addLog('info','终端','桌面编辑完成','合并桌面中');
    return {ok:true};
  }
  case 'set-default-desktop':
    if(payload.desktopId){
      mt.defaultDesktopId=payload.desktopId; cr.defaultDesktopId=payload.desktopId;
      if(mt.bios) mt.bios.defaultBootId=payload.desktopId;
    }
    return {ok:true};
  case 'set-restore-mode':{
    /* per-desktop restoreMode */
    if(payload.desktopId && payload.mode){
      const dt = mt.desktops.find(d=>d.id===payload.desktopId);
      if(dt) dt.restoreMode = payload.mode;
      const cdt = cr.desktopCatalog?.find(d=>d.id===payload.desktopId);
      if(cdt) cdt.restoreMode = payload.mode;
    } else if(payload.mode){
      /* fallback: global BIOS level */
      if(mt.bios) mt.bios.restoreMode=payload.mode;
    }
    return {ok:true};
  }
  case 'toggle-desktop-visibility':{
    const dt = mt.desktops.find(d=>d.id===payload.desktopId);
    if(!dt) return {ok:false,reason:'桌面不存在'};
    dt.visibility = dt.visibility==='hidden'?'default':'hidden';
    /* sync to classroom catalog */
    const cdt=cr.desktopCatalog?.find(d=>d.id===payload.desktopId);
    if(cdt) cdt.visibility=dt.visibility;
    /* update bios bootEntries to exclude hidden */
    if(mt.bios) mt.bios.bootEntries=mt.desktops.filter(d=>d.visibility!=='hidden').map(d=>d.id);
    addLog('info','终端','桌面可见性变更: '+dt.name, dt.visibility==='hidden'?'已隐藏':'已显示');
    return {ok:true};
  }
  case 'delete-desktop':{
    const idx = mt.desktops.findIndex(d=>d.id===payload.desktopId);
    if(idx<0) return {ok:false,reason:'桌面不存在'};
    const dt=mt.desktops[idx];
    const wasDefault = mt.bios?.defaultBootId===payload.desktopId;
    mt.desktops.splice(idx,1);
    /* cascade default to next desktop if deleting the default one */
    if(wasDefault && mt.desktops.length>0){
      const next = mt.desktops[0];
      if(mt.bios) mt.bios.defaultBootId = next.id;
    } else if(wasDefault && mt.desktops.length===0){
      if(mt.bios) mt.bios.defaultBootId = null;
    }
    /* remove from catalog */
    if(cr.desktopCatalog){
      const ci=cr.desktopCatalog.findIndex(d=>d.id===payload.desktopId);
      if(ci>=0) cr.desktopCatalog.splice(ci,1);
    }
    /* update bios bootEntries */
    if(mt.bios) mt.bios.bootEntries=mt.desktops.filter(d=>d.visibility!=='hidden').map(d=>d.id);
    addLog('info','终端','删除桌面: '+dt.name,'');
    return {ok:true};
  }
  case 'upload-desktop':{
    const dt=mt.desktops.find(d=>d.id===payload.desktopId);
    if(!dt) return {ok:false,reason:'桌面不存在'};
    dt.syncStatus='synced'; dt.uploaded=true;
    /* also update catalog */
    const catDt=(cr.desktopCatalog||[]).find(d=>d.id===payload.desktopId);
    if(catDt){ catDt.syncStatus='synced'; }
    addLog('info','终端','上传桌面: '+dt.name,'');
    return {ok:true};
  }

  /* ── TAKEOVER ── */
  case 'open-takeover':{
    /* If already mother, go to workbench directly */
    if(mt.controlState==='mother'){
      if(!demo.deployDraft.grid.blocks.length) demo.deployDraft.grid=initGridBlocks(cr.id,cr);
      demo.motherScreen='workbench'; mt.screen='workbench'; return {ok:true};
    }
    demo.motherScreen='takeover'; mt.screen='takeover';
    const allTerms=termsInCr(cr.id).filter(t=>t.id!==mt.id&&t.online);
    const main=[],unbound=[],other=[];
    /* Build per-terminal scan info including bound classroom name */
    const scanInfo = {};
    allTerms.forEach(t=>{
      const boundCr = t.boundClassroom ? crById(t.boundClassroom) : null;
      scanInfo[t.mac] = { boundCrName: boundCr ? boundCr.name : null, boundCrId: t.boundClassroom || null };
      if(t.boundClassroom&&t.boundClassroom===cr.id) main.push(t.mac);
      else if(!t.boundClassroom) unbound.push(t.mac);
      else other.push(t.mac);
    });
    /* Collect distinct other classroom groups */
    const otherGroups = {};
    other.forEach(mac => {
      const info = scanInfo[mac];
      if(info.boundCrId){
        if(!otherGroups[info.boundCrId]) otherGroups[info.boundCrId] = { name: info.boundCrName, macs: [] };
        otherGroups[info.boundCrId].macs.push(mac);
      }
    });
    demo.takeover={mode:cr.stage==='blank'?'initial':'existing',
      scannedMacs:allTerms.map(t=>t.mac),
      groups:{main,unbound,other},
      otherGroups,
      scanInfo,
      classroomName:cr.stage==='blank'?'未命名教室-'+new Date().toLocaleDateString('zh-CN'):cr.name,
      confirmed:false};
    return {ok:true};
  }
  case 'confirm-takeover':{
    if(payload.classroomName) cr.name=payload.classroomName;
    demo.takeover.confirmed=true; mt.controlState='mother'; mt.boundClassroom=cr.id;
    const allTerms=termsInCr(cr.id); const memberMacs=[mt.mac];
    allTerms.forEach(t=>{if(t.id!==mt.id&&t.online){t.boundClassroom=cr.id;t.controlState='controlled';memberMacs.push(t.mac);}});
    cr.motherId=mt.id; cr.memberMacs=memberMacs;
    if(cr.stage==='blank') cr.stage='bound';
    cr.status='active';
    demo.motherScreen='workbench'; mt.screen='workbench';
    // init deploy rules from classroom
    demo.deployDraft.rules.ipBase=cr.networkBase;
    demo.deployDraft.rules.namePrefix=cr.id.split('-')[1].toUpperCase();
    // init grid blocks if empty
    if(!demo.deployDraft.grid.blocks.length) demo.deployDraft.grid=initGridBlocks(cr.id,cr);
    addLog('info','终端',cr.name+' 教室已接管','母机 '+mt.mac+' 管理 '+memberMacs.length+' 台终端');
    return {ok:true};
  }
  case 'return-workbench':
    if(mt.controlState!=='mother') return {ok:false,reason:'未接管教室'};
    demo.motherScreen='workbench'; mt.screen='workbench'; return {ok:true};
  case 'end-management':{
    termsInCr(cr.id).forEach(t=>{if(t.controlState==='controlled'&&!t.taskState){t.controlState='unmanaged';}});
    mt.controlState='unmanaged'; cr.motherId=null;
    cr.status=cr.stage==='deployed'?'idle':cr.stage;
    demo.motherScreen='home'; mt.screen='home';
    addLog('info','终端',cr.name+' 已结束管理','母机释放教室控制');
    return {ok:true};
  }
  case 'open-export':
    if(mt.controlState!=='mother') return {ok:false,reason:'未接管教室'};
    demo.motherScreen='export-list'; mt.screen='export-list'; return {ok:true};

  /* ── DEPLOYMENT (TERM-04) — simplified 3-step in 10_ ── */
  case 'open-deployment':{
    if(mt.controlState!=='mother') return {ok:false,reason:'未接管教室'};
    /* Initialize grid from classroom dimensions */
    const crRows = cr.rows || 7;
    const crCols = Math.max(1, Math.ceil((termsInCr(cr.id).length - 1) / crRows)) || 6;
    const blocks = [];
    for(let col=0; col<crCols; col++){
      for(let row=0; row<crRows; row++){
        const colLetter = String.fromCharCode(65+col);
        const pos = colLetter + String(row+1).padStart(2,'0');
        blocks.push({ idx: col*crRows+row, pos, row, col, state: 'active' });
      }
    }
    demo.deployDraft.grid = { rows: crRows, cols: crCols, blocks };
    demo.deployDraft.bindings = {};
    demo.deployDraft.step = 0;
    demo.deployDraft.deployMode = 'incremental';
    demo.deployDraft.scope = [];
    demo.deployDraft.assignments = [];
    /* Init rules defaults from classroom */
    demo.deployDraft.rules.ipBase = cr.networkBase || '';
    demo.deployDraft.rules.namePrefix = cr.id.split('-')[1].toUpperCase();
    demo.deployDraft.rules.ipStart = 20;
    demo.deployDraft.rules.defaultUse = '学生终端';
    demo.motherScreen='deploy-prep'; mt.screen='deploy-prep';
    return {ok:true};
  }
  case 'deploy-save-mother-prep':{
    /* No-op in simplified version — mother prep is read-only */
    return {ok:true};
  }
  case 'deploy-set-scope':{
    if(payload.scope) demo.deployDraft.scope=[...payload.scope];
    return {ok:true};
  }
  case 'deploy-reorder':{
    if(payload.scope) demo.deployDraft.scope=[...payload.scope];
    // regenerate assignments based on new order
    demo.deployDraft.assignments=generateAssignments(demo,cr);
    return {ok:true};
  }
  case 'deploy-toggle-term':{
    const idx=demo.deployDraft.scope.indexOf(payload.id);
    if(idx>=0) demo.deployDraft.scope.splice(idx,1);
    else demo.deployDraft.scope.push(payload.id);
    return {ok:true};
  }
  case 'deploy-select-all':{
    const allCtrl = termsInCr(cr.id).filter(t=>t.id!==mt.id&&t.online);
    demo.deployDraft.scope=allCtrl.map(t=>t.id);
    return {ok:true};
  }
  case 'deploy-clear-scope':
    demo.deployDraft.scope=[]; return {ok:true};

  case 'deploy-set-rules':{
    Object.assign(demo.deployDraft.rules, payload);
    return {ok:true};
  }
  case 'deploy-goto-step':{
    const step = payload.step;
    demo.deployDraft.step=step;
    const screenMap = {0:'deploy-prep', 1:'deploy-grid', 2:'deploy-bind', 3:'deploy-progress'};
    demo.motherScreen=screenMap[step]||'deploy-prep';
    mt.screen=demo.motherScreen;
    return {ok:true};
  }
  case 'deploy-set-desktops':{
    if(payload.desktopIds) demo.deployDraft.desktopIds=[...payload.desktopIds];
    if(payload.defaultDesktopId!==undefined) demo.deployDraft.defaultDesktopId=payload.defaultDesktopId;
    if(payload.dataDisk!==undefined) demo.deployDraft.dataDisk=payload.dataDisk;
    return {ok:true};
  }
  case 'deploy-edit-assignment':{
    const a = demo.deployDraft.assignments.find(x=>x.terminalId===payload.terminalId);
    if(a){ Object.assign(a, payload.fields); }
    demo.deployDraft.validation=validateAssignments(demo.deployDraft.assignments);
    return {ok:true};
  }
  case 'start-deployment':{
    /* Generate assignments from grid bindings + rules */
    const grid = demo.deployDraft.grid;
    const bindings = demo.deployDraft.bindings;
    const r = demo.deployDraft.rules;
    const assignable = grid.blocks.filter(b=>b.state!=='deleted');
    let ipN = r.ipStart || 20;
    const pfx = r.namePrefix || cr.id.split('-')[1].toUpperCase();
    const assignments = [];
    const scope = [];

    assignable.forEach(b=>{
      const binding = bindings[b.idx];
      const ip = (r.ipBase||cr.networkBase)+'.'+ipN;
      const name = pfx+'-'+b.pos;
      ipN++;
      if(!binding) return; /* no terminal bound to this block */
      if(b.state==='disabled') return; /* disabled = skip */
      const t = termById(binding.terminalId);
      if(!t||!t.online) return;

      assignments.push({
        terminalId: binding.terminalId, mac: t.mac,
        seat: b.pos, ip, name,
        use: r.defaultUse || '学生终端',
        gateway: mt.gateway || cr.gateway || '',
        dns: (mt.dns||[]).join(',') || ((cr.dns||[]).join(',')) || '',
        subnetMask: mt.subnetMask || '255.255.255.0',
        serverAddr: mt.serverAddr || cr.serverAddress || '',
        restoreMode: mt.bios?.restoreMode || cr.restoreMode || '还原系统盘，保留数据盘',
        desktopIds: (mt.desktops||[]).map(d=>d.id),
        defaultDesktopId: mt.bios?.defaultBootId || mt.defaultDesktopId
      });
      scope.push(binding.terminalId);
    });

    if(!scope.length) return {ok:false,reason:'无有效终端'};
    demo.deployDraft.assignments = assignments;
    demo.deployDraft.scope = scope;

    const primaryDtId = mt.bios?.defaultBootId || mt.defaultDesktopId || cr.defaultDesktopId;
    const task=createTask({type:'deployment',crId:cr.id,label:'教室维护',sourceDesktopId:primaryDtId,
      selectedIds:scope, settings:{rules:{...r}, deployMode:demo.deployDraft.deployMode}, assignments});
    startTask(task);
    demo.deployDraft.step=3;
    /* If invoked from workbench (integrated), stay on workbench */
    if(demo.motherScreen==='workbench'){
      /* stay on workbench — task progress shown inline */
    } else {
      demo.motherScreen='deploy-progress'; mt.screen='deploy-progress';
    }
    addLog('info','终端','开始教室维护: '+cr.name, scope.length+' 台终端');
    return {ok:true};
  }

  /* ── MAINTENANCE (TERM-05) ── */
  /* 10_ simplified: no maint menu, direct entry to sub-flows */
  case 'open-maintenance':
  case 'open-maint-menu':
  case 'open-maint-desktop-update':{
    if(mt.controlState!=='mother') return {ok:false,reason:'未接管教室'};
    demo.maintDraft={step:0,scope:[],keepIds:[],desktopId:null,desktopIds:[],defaultDesktopId:null,
      category:'桌面更新',restoreMode:'还原系统盘，保留数据盘',
      newServerAddr:'',newIpBase:'',newIpStart:20,newSubnetMask:'255.255.255.0',newGateway:'',newDns:'',ipPreview:[]};
    const allCtrl2=termsInCr(cr.id).filter(t=>t.id!==mt.id&&t.online);
    demo.maintDraft.scope=allCtrl2.map(t=>t.id);
    demo.motherScreen='maint-desktop-update'; mt.screen='maint-desktop-update'; return {ok:true};
  }
  case 'open-maint-ip':{
    if(mt.controlState!=='mother') return {ok:false,reason:'未接管教室'};
    demo.maintDraft={step:0,scope:[],keepIds:[],desktopId:null,desktopIds:[],defaultDesktopId:null,
      category:'IP/服务器修改',restoreMode:'还原系统盘，保留数据盘',
      newServerAddr:'',newIpBase:'',newIpStart:20,newSubnetMask:'255.255.255.0',newGateway:'',newDns:'',ipPreview:[]};
    const allCtrl3=termsInCr(cr.id).filter(t=>t.id!==mt.id&&t.online);
    demo.maintDraft.scope=allCtrl3.map(t=>t.id);
    /* If invoked from workbench, stay on workbench */
    if(demo.motherScreen!=='workbench'){
      demo.motherScreen='maint-ip'; mt.screen='maint-ip';
    }
    return {ok:true};
  }
  case 'maint-apply-ip-rules':{
    const d=demo.maintDraft;
    if(payload.serverAddr) d.newServerAddr=payload.serverAddr;
    if(payload.ipBase) d.newIpBase=payload.ipBase;
    if(payload.ipStart) d.newIpStart=Number(payload.ipStart);
    if(payload.subnetMask) d.newSubnetMask=payload.subnetMask;
    if(payload.gateway) d.newGateway=payload.gateway;
    if(payload.dns) d.newDns=payload.dns;
    // generate IP preview for selected terminals
    const preview=[];
    d.scope.forEach((id,i)=>{
      const t=termById(id);
      if(!t) return;
      const newIp = d.newIpBase ? d.newIpBase+'.'+(d.newIpStart+i) : t.ip;
      preview.push({terminalId:id, newIp});
    });
    d.ipPreview=preview;
    return {ok:true};
  }
  case 'maint-reorder':{
    if(payload.scope) demo.maintDraft.scope=[...payload.scope];
    // regenerate IP preview
    const d2=demo.maintDraft; const preview2=[];
    d2.scope.forEach((id,i)=>{
      const t=termById(id);
      if(!t) return;
      const newIp = d2.newIpBase ? d2.newIpBase+'.'+(d2.newIpStart+i) : t.ip;
      preview2.push({terminalId:id, newIp});
    });
    d2.ipPreview=preview2;
    return {ok:true};
  }
  case 'start-maint-ip':{
    if(payload.serverAddr) demo.maintDraft.newServerAddr=payload.serverAddr;
    if(payload.ipBase) demo.maintDraft.newIpBase=payload.ipBase;
    if(payload.ipStart) demo.maintDraft.newIpStart=payload.ipStart;
    demo.maintDraft.category='IP/服务器修改';
    const scope2=demo.maintDraft.scope.filter(id=>{const t=termById(id);return t&&t.online;});
    if(!scope2.length) return {ok:false,reason:'无有效终端'};
    const keep2=termsInCr(cr.id).filter(t=>!scope2.includes(t.id)&&t.id!==mt.id).map(t=>t.id);
    const task2=createTask({type:'maintenance',crId:cr.id,label:'教室维护 — IP/服务器修改',
      sourceDesktopId:null, selectedIds:scope2, keepIds:keep2});
    startTask(task2);
    /* If invoked from workbench (integrated), stay on workbench */
    if(demo.motherScreen==='workbench'){
      /* stay on workbench — task progress shown inline */
    } else {
      demo.motherScreen='maint-progress'; mt.screen='maint-progress';
    }
    addLog('info','终端','开始 IP/服务器批量修改: '+cr.name, scope2.length+' 台');
    return {ok:true};
  }
  case 'maint-set-scope':{
    if(payload.scope) demo.maintDraft.scope=[...payload.scope];
    return {ok:true};
  }
  case 'maint-set-category':
    demo.maintDraft.category=payload.category||'桌面更新'; return {ok:true};
  case 'maint-goto-step':{
    demo.maintDraft.step=payload.step;
    // 10_ simplified: no menu, direct flows
    const sMap={0:'maint-desktop-update',1:'maint-desktop-update',select:'maint-desktop-select',2:'maint-desktop-select',3:'maint-progress'};
    demo.motherScreen=sMap[payload.step]||'maint-desktop-update'; mt.screen=demo.motherScreen;
    return {ok:true};
  }
  case 'maint-set-desktop':
    demo.maintDraft.desktopId=payload.id; return {ok:true};
  case 'maint-set-desktops':{
    if(payload.desktopIds) demo.maintDraft.desktopIds=[...payload.desktopIds];
    if(payload.defaultDesktopId!==undefined) demo.maintDraft.defaultDesktopId=payload.defaultDesktopId;
    return {ok:true};
  }
  case 'maint-set-restore-mode':
    demo.maintDraft.restoreMode=payload.mode; return {ok:true};
  case 'start-maintenance':{
    const scope=demo.maintDraft.scope.filter(id=>{const t=termById(id);return t&&t.online;});
    if(!scope.length) return {ok:false,reason:'无有效终端'};
    const keep=termsInCr(cr.id).filter(t=>!scope.includes(t.id)&&t.id!==mt.id).map(t=>t.id);
    const task=createTask({type:'maintenance',crId:cr.id,label:'教室维护 — '+demo.maintDraft.category,
      sourceDesktopId:demo.maintDraft.desktopId, selectedIds:scope, keepIds:keep});
    startTask(task);
    demo.maintDraft.step=3;
    demo.motherScreen='maint-progress'; mt.screen='maint-progress';
    addLog('info','终端','开始教室维护: '+cr.name, scope.length+' 台');
    return {ok:true};
  }

  /* ── EXAM (TERM-07) ── */
  case 'open-exam':{
    if(mt.controlState!=='mother') return {ok:false,reason:'未接管教室'};
    demo.examDraft={step:0,scope:[],keepIds:[],desktopId:null,desktopIds:[],hideEntries:true,restoreMode:'还原系统盘和数据盘'};
    const allCtrl=termsInCr(cr.id).filter(t=>t.id!==mt.id&&t.online);
    demo.examDraft.scope=allCtrl.map(t=>t.id);
    demo.motherScreen='exam-main'; mt.screen='exam-main'; return {ok:true};
  }
  case 'exam-set-scope':{
    if(payload.scope) demo.examDraft.scope=[...payload.scope]; return {ok:true};
  }
  case 'exam-goto-step':{
    demo.examDraft.step=payload.step;
    const sMap={0:'exam-main',1:'exam-config',2:'exam-confirm',3:'exam-progress'};
    demo.motherScreen=sMap[payload.step]||'exam-main'; mt.screen=demo.motherScreen;
    return {ok:true};
  }
  case 'exam-set-desktop': demo.examDraft.desktopId=payload.id; return {ok:true};
  case 'exam-set-desktops':{
    if(payload.desktopIds){ demo.examDraft.desktopIds=[...payload.desktopIds]; demo.examDraft.desktopId=payload.desktopIds[0]||null; }
    return {ok:true};
  }
  case 'exam-toggle-entries': demo.examDraft.hideEntries=!demo.examDraft.hideEntries; return {ok:true};
  case 'start-exam-apply':{
    const scope=demo.examDraft.scope.filter(id=>{const t=termById(id);return t&&t.online;});
    if(!scope.length) return {ok:false,reason:'无有效终端'};
    const keep=termsInCr(cr.id).filter(t=>!scope.includes(t.id)&&t.id!==mt.id).map(t=>t.id);
    const task=createTask({type:'exam-apply',crId:cr.id,label:'考试启动设置',
      sourceDesktopId:demo.examDraft.desktopId, selectedIds:scope, keepIds:keep,
      settings:{hideEntries:demo.examDraft.hideEntries,restoreMode:demo.examDraft.restoreMode}});
    startTask(task);
    demo.examDraft.step=3;
    demo.motherScreen='exam-progress'; mt.screen='exam-progress';
    return {ok:true};
  }
  case 'start-exam-restore':{
    const ids=state.demo.examState.appliedIds||[];
    if(!ids.length) return {ok:false,reason:'无需恢复'};
    const task=createTask({type:'exam-restore',crId:cr.id,label:'考后恢复',
      sourceDesktopId:null,selectedIds:ids});
    startTask(task);
    demo.motherScreen='exam-progress'; mt.screen='exam-progress';
    return {ok:true};
  }

  /* ── DESKTOP editing entrance from any flow ── */
  case 'enter-desktop':{
    demo.desktopEdit.returnScreen=demo.motherScreen;
    demo.desktopEdit.active=true;
    demo.motherScreen='desktop-rebooting'; mt.screen='desktop-rebooting';
    mt.power='rebooting'; mt.online=false; mt._recoverTicks=2;
    mt._resumeScreen='desktop-editor';
    addLog('info','终端','母机进入桌面处理','离开管理系统');
    return {ok:true};
  }

  /* ── NEW ACTIONS for terminal.js ── */
  case 'deploy-apply-rules':{
    demo.deployDraft.assignments=generateAssignments(demo,cr);
    return {ok:true};
  }
  /* ── Grid block management ── */
  case 'deploy-set-grid':{
    const rows = Math.max(1,Math.min(20,payload.rows||7));
    const cols = Math.max(1,Math.min(15,payload.cols||6));
    const blocks = [];
    for(let col=0;col<cols;col++){
      for(let row=0;row<rows;row++){
        const colLetter = String.fromCharCode(65+col);
        const pos = colLetter+String(row+1).padStart(2,'0');
        blocks.push({idx:col*rows+row, pos, row, col, state:'active'});
      }
    }
    demo.deployDraft.grid = {rows,cols,blocks};
    demo.deployDraft.bindings = {};
    return {ok:true};
  }
  case 'deploy-toggle-block':{
    const block = demo.deployDraft.grid.blocks.find(b=>b.idx===payload.idx);
    if(!block) return {ok:false,reason:'块不存在'};
    /* cycle: active → disabled → deleted → active */
    if(block.state==='active') block.state='disabled';
    else if(block.state==='disabled') block.state='deleted';
    else block.state='active';
    /* remove binding if not active */
    if(block.state!=='active') delete demo.deployDraft.bindings[block.idx];
    return {ok:true};
  }
  case 'deploy-bind-skip':{
    const grid = demo.deployDraft.grid;
    const bindings = demo.deployDraft.bindings;
    const block = grid.blocks.find(b=>b.idx===payload.idx);
    if(!block) return {ok:false,reason:'块不存在'};

    if(block.state==='disabled'){
      /* Re-enable: toggle back to active */
      block.state = 'active';
      return {ok:true};
    }

    /* Disable this block and shift subsequent bindings forward */
    const orderedBlocks = [...grid.blocks].sort((a,b)=>a.idx-b.idx);
    const targetIdx = block.idx;

    /* Collect all bound terminals from this block and blocks after it (in idx order) */
    const terminalsToShift = [];
    for(const b of orderedBlocks){
      if(b.idx < targetIdx) continue;
      if(b.state!=='active') continue;
      if(bindings[b.idx]){
        terminalsToShift.push(bindings[b.idx]);
        delete bindings[b.idx];
      }
    }

    /* Disable the target block */
    block.state = 'disabled';

    /* Re-bind collected terminals to remaining active unbound blocks after targetIdx */
    const activeAfter = orderedBlocks.filter(b=>b.idx > targetIdx && b.state==='active' && !bindings[b.idx]);
    let ti=0;
    for(const b of activeAfter){
      if(ti>=terminalsToShift.length) break;
      bindings[b.idx] = terminalsToShift[ti];
      ti++;
    }
    /* Any remaining terminals that couldn't be placed are simply unbound */
    return {ok:true};
  }
  case 'deploy-bind-terminal':{
    const grid = demo.deployDraft.grid;
    const bindings = demo.deployDraft.bindings;
    const activeBlocks = grid.blocks.filter(b=>b.state==='active');
    const nextBlock = activeBlocks.find(b=>!bindings[b.idx]);
    if(!nextBlock) return {ok:false,reason:'无可用占位块'};
    const t = termById(payload.terminalId);
    if(!t) return {ok:false,reason:'终端不存在'};
    bindings[nextBlock.idx] = {terminalId:t.id, mac:t.mac};
    return {ok:true};
  }
  case 'deploy-bind-all-terminals':{
    const grid = demo.deployDraft.grid;
    const bindings = demo.deployDraft.bindings;
    const activeBlocks = grid.blocks.filter(b=>b.state==='active');
    const allCtrlBind = termsInCr(cr.id).filter(t=>t.id!==mt.id&&t.online);
    const boundIds = new Set(Object.values(bindings).map(b=>b.terminalId));
    const available = allCtrlBind.filter(t=>!boundIds.has(t.id));
    let ai=0;
    for(const b of activeBlocks){
      if(bindings[b.idx]) continue;
      if(ai>=available.length) break;
      bindings[b.idx]={terminalId:available[ai].id, mac:available[ai].mac};
      ai++;
    }
    return {ok:true};
  }
  case 'deploy-set-deploy-mode':{
    demo.deployDraft.deployMode = payload.mode||'incremental';
    return {ok:true};
  }
  case 'navigate':{
    if(payload.screen){ demo.motherScreen=payload.screen; mt.screen=payload.screen; }
    return {ok:true};
  }
  case 'set-flag':{
    Object.assign(demo.flags, payload);
    return {ok:true};
  }
  case 'open-local-desktop-flow':{
    /* open-local-desktop but remember return screen */
    demo._desktopReturnScreen=payload.returnScreen||demo.motherScreen;
    demo.motherScreen='local-desktop'; mt.screen='local-desktop';
    return {ok:true};
  }
  case 'exam-set-restore-mode':{
    if(payload.mode) demo.examDraft.restoreMode=payload.mode;
    return {ok:true};
  }
  case 'return-from-desktop':{
    const ret=demo.desktopEdit.returnScreen||'workbench';
    demo.desktopEdit.active=false; demo.desktopEdit.returnScreen=null;
    if(cr.desktopCatalog.length===0){
      /* bootstrap image + snapshot + desktop when catalog is empty */
      const imgId='img-'+cr.id+'-'+uid();
      if(!cr.imageStore) cr.imageStore=[];
      cr.imageStore.push({id:imgId, name:'Windows 11 23H2', os:'Windows 11 23H2', importedAt:now()});
      const snapId='snap-'+cr.id+'-'+uid();
      if(!cr.snapshotTree) cr.snapshotTree=[];
      cr.snapshotTree.push({id:snapId, name:'公共教学桌面 初始快照', imageId:imgId, parentId:null, createdAt:now()});
      const newDt={id:'dt-'+cr.id+'-'+uid(),name:'公共教学桌面',version:'v1',os:'Windows 11 23H2',type:'教学',
        visibility:'default',remark:'通用教学环境，已装 Office + 浏览器',
        syncStatus:'local',snapshotId:snapId,createdAt:now(),editedAt:now()};
      cr.desktopCatalog.push(newDt); cr.defaultDesktopId=newDt.id; mt.desktops=[{...newDt}]; mt.defaultDesktopId=newDt.id;
      mt.bios={bootEntries:[newDt.id],defaultBootId:newDt.id,restoreMode:cr.restoreMode||'还原系统盘，保留数据盘'};
    } else {
      const dt=cr.desktopCatalog[0]; const ver=Number(dt.version.replace(/\D/g,''))||1;
      dt.version='v'+(ver+1); dt.editedAt=now(); dt.syncStatus='local'; mt.desktops=cr.desktopCatalog.filter(d=>d.visibility!=='hidden').map(d=>({...d}));
      mt.bios={bootEntries:mt.desktops.map(d=>d.id),defaultBootId:mt.defaultDesktopId||mt.desktops[0]?.id,restoreMode:cr.restoreMode||'还原系统盘，保留数据盘'};
    }
    demo.deployDraft.motherPrep = demo.deployDraft.motherPrep||{}; demo.deployDraft.motherPrep.desktopReady=true;
    demo.motherScreen='desktop-merging'; mt.screen='desktop-merging';
    mt.power='rebooting'; mt.online=false; mt._resumeScreen=ret; mt._recoverTicks=2;
    addLog('info','终端','桌面处理完成','合并桌面，返回管理系统');
    return {ok:true};
  }

  /* ── TRANSFER CONTROL ── */
  case 'transfer-pause':{
    demo.transferControl[payload.id]={...(demo.transferControl[payload.id]||{}),paused:true};
    return {ok:true};
  }
  case 'transfer-resume':{
    demo.transferControl[payload.id]={...(demo.transferControl[payload.id]||{}),paused:false};
    return {ok:true};
  }

  /* ── FAULT HANDLING (TERM-06) ── */
  case 'open-fault-replace':{
    demo.motherScreen='fault-replace'; mt.screen='fault-replace';
    const defaultCrId=mt.boundClassroom||mt.classroomId;
    const faultyCr=crById(defaultCrId);
    const faultyTerms=faultyCr?termsInCr(faultyCr.id).filter(t=>!t.online&&t.id!==mt.id):[];
    demo.faultReplace={
      serverReachable: !!(mt.serverAddr),
      selectedClassroomId: defaultCrId,
      suggestedTerminalId: faultyTerms[0]?.id||null,
      suggestedSeat: faultyTerms[0]?.seat||null,
      suggestedName: faultyTerms[0]?.name||null,
      suggestedMac: faultyTerms[0]?.mac||null,
      manualSeat: null,
      confirmed: false
    };
    return {ok:true};
  }
  case 'fault-replace-select-cr':{
    const crId=payload.classroomId;
    if(crId){ demo.faultReplace.selectedClassroomId=crId; demo.faultReplace.suggestedTerminalId=null; demo.faultReplace.suggestedSeat=null; demo.faultReplace.suggestedName=null; demo.faultReplace.suggestedMac=null; }
    return {ok:true};
  }
  case 'fault-replace-select':{
    if(payload.terminalId){
      const ft=termById(payload.terminalId);
      if(ft){ demo.faultReplace.suggestedTerminalId=ft.id; demo.faultReplace.suggestedSeat=ft.seat; demo.faultReplace.suggestedName=ft.name; demo.faultReplace.suggestedMac=ft.mac; }
    }
    return {ok:true};
  }
  case 'fault-replace-back':{
    // Go back to step 1 (select classroom+terminal) — clear selected terminal
    demo.faultReplace.suggestedTerminalId=null;
    demo.faultReplace.suggestedSeat=null;
    demo.faultReplace.suggestedName=null;
    demo.faultReplace.suggestedMac=null;
    demo.faultReplace.confirmed=false;
    return {ok:true};
  }
  case 'fault-replace-confirm':{
    const fr=demo.faultReplace; if(!fr?.suggestedTerminalId) return {ok:false,reason:'未选择替换目标'};
    const oldT=termById(fr.suggestedTerminalId);
    if(oldT){
      // new hardware (current mt) inherits old terminal's identity
      const oldMac=oldT.mac; const newMac=mt.mac;
      oldT.mac=newMac; oldT.macList=[newMac]; oldT.online=true; oldT.power='on'; oldT.sync='synced'; oldT.syncNote='已替换';
      oldT.hw={...mt.hw}; oldT.heartbeat=now();
      fr.confirmed=true;
      addLog('info','终端','一键替换完成','新 MAC '+newMac+' 继承 '+oldMac+' 的身份 ('+oldT.seat+')');
      state.alerts.unshift({id:'alert-'+uid(),level:'info',title:'终端替换完成',detail:oldT.seat+' 已替换为新硬件 MAC: '+newMac,
        terminalId:oldT.id,classroomId:oldT.classroomId,status:'open',at:now()});
    }
    return {ok:true};
  }
  case 'open-fault-reset':{
    demo.motherScreen='fault-reset'; mt.screen='fault-reset';
    demo.faultReset={
      serverReachable: !!(mt.serverAddr),
      terminalRegistered: mt.registered||false,
      confirmed: false
    };
    return {ok:true};
  }
  case 'fault-reset-confirm':{
    // re-pull from server: reset terminal to registered state
    const frc=crById(mt.boundClassroom||mt.classroomId);
    if(frc&&frc.desktopCatalog?.length){
      mt.desktops=frc.desktopCatalog.filter(d=>d.visibility!=='hidden').map(d=>({...d}));
      mt.defaultDesktopId=frc.defaultDesktopId;
      mt.bios={bootEntries:mt.desktops.map(d=>d.id),defaultBootId:mt.defaultDesktopId||mt.desktops[0]?.id,restoreMode:frc.restoreMode||'还原系统盘，保留数据盘'};
      mt.sync='synced'; mt.syncNote='重置完成';
    }
    demo.faultReset.confirmed=true;
    addLog('info','终端','一键重置完成','从服务器重新拉取数据覆盖本机');
    return {ok:true};
  }
  case 'save-fault-network':{
    if(payload.serverAddr!==undefined) mt.serverAddr=payload.serverAddr;
    if(payload.ip!==undefined) mt.ip=payload.ip;
    if(payload.subnetMask!==undefined) mt.subnetMask=payload.subnetMask;
    if(payload.gateway!==undefined) mt.gateway=payload.gateway;
    if(payload.dns!==undefined) mt.dns=payload.dns?.split?payload.dns.split(','):payload.dns||[];
    return {ok:true};
  }

  /* ── DIRECTOR ── */
  case 'set-controlled':{const t=termById(payload.id);if(!t) return {ok:false};demo.controlledId=t.id;return {ok:true};}
  case 'toggle-power':{
    const t=termById(payload.id); if(!t) return {ok:false};
    if(t.online){t.online=false;t.power='off';t.heartbeat=now();}
    else{t.online=true;t.power='on';t.heartbeat=now();t.metrics.cpu=15;t.metrics.mem=30;}
    return {ok:true};
  }
  case 'simulate-failure':{
    const t=termById(payload.id); if(!t) return {ok:false};
    t.online=false;t.power='off';t.sync='failed';t.syncNote='硬件故障';
    state.alerts.unshift({id:'alert-'+uid(),level:'high',title:'终端硬件故障',detail:'终端 '+t.mac+' 异常离线',
      terminalId:t.id,classroomId:t.classroomId,status:'open',at:now()});
    return {ok:true};
  }

  /* ── ADVANCE STORY ── */
  case 'advance-story':{
    if(mt.controlState!=='mother'){
      if(demo.motherScreen!=='takeover') return act('open-takeover');
      return act('confirm-takeover');
    }
    if(cr.stage==='blank'||cr.stage==='bound'){
      if(demo.motherScreen==='workbench') return act('open-deployment');
      if(demo.motherScreen==='deploy-prep'){
        return act('deploy-goto-step',{step:1});
      }
      if(demo.motherScreen==='deploy-grid'){
        return act('deploy-goto-step',{step:2});
      }
      if(demo.motherScreen==='deploy-bind'){
        /* auto-bind all and start */
        act('deploy-bind-all-terminals');
        return act('start-deployment');
      }
      if(demo.motherScreen==='desktop-rebooting'||demo.motherScreen==='desktop-editor') return act('return-from-desktop');
      if(demo.motherScreen==='desktop-merging'){
        if(mt._recoverTicks){mt._recoverTicks=0;mt.power='on';mt.online=true;
          const scr=mt._resumeScreen||'workbench';mt._resumeScreen=null;demo.motherScreen=scr;mt.screen=scr;}
        return {ok:true};
      }
      return {ok:true};
    }
    /* deployed classroom — open maint IP */
    if(demo.motherScreen==='workbench') return act('open-maint-ip');
    if(demo.motherScreen==='maint-ip') return act('start-maint-ip',{
      serverAddr:mt.serverAddr, ipBase:cr.networkBase,
      ipStart:20, subnetMask:'255.255.255.0',
      gateway:cr.gateway, dns:(cr.dns||[]).join(',')});
    return {ok:true};
  }

  /* ══════════ PLATFORM REMOTE ACTIONS ══════════ */
  case 'plat-shutdown':{
    const crId=payload.classroomId; if(!crId) return {ok:false,reason:'缺少教室'};
    const selIds=payload.terminalIds;
    let terms=termsInCr(crId).filter(t=>t.online);
    if(selIds&&selIds.length) terms=terms.filter(t=>selIds.includes(t.id));
    terms.forEach(t=>{t.online=false;t.power='off';t.heartbeat=now();});
    addLog('warn','平台','远程批量关机',`${terms.length} 台终端已关机`);
    return {ok:true, count:terms.length};
  }
  case 'plat-restart':{
    const crId=payload.classroomId; if(!crId) return {ok:false,reason:'缺少教室'};
    const selIds=payload.terminalIds;
    let terms=termsInCr(crId).filter(t=>t.online);
    if(selIds&&selIds.length) terms=terms.filter(t=>selIds.includes(t.id));
    terms.forEach(t=>{t.power='rebooting';t.heartbeat=now();t._recoverTicks=2;t.online=false;});
    addLog('info','平台','远程批量重启',`${terms.length} 台终端正在重启`);
    return {ok:true, count:terms.length};
  }
  case 'plat-distribute':{
    const crId=payload.classroomId; if(!crId) return {ok:false,reason:'缺少教室'};
    const srcId=payload.sourceTerminalId;
    const dtIds=payload.desktopIds||[payload.desktopId].filter(Boolean);
    if(!srcId||!dtIds.length) return {ok:false,reason:'缺少来源终端或桌面'};
    const srcT=termById(srcId); if(!srcT) return {ok:false,reason:'来源终端不存在'};
    const srcDts=dtIds.map(id=>(srcT.desktops||[]).find(d=>d.id===id)).filter(Boolean);
    if(!srcDts.length) return {ok:false,reason:'桌面不存在'};
    const tgtIds=payload.targetTerminalIds;
    let targets=termsInCr(crId).filter(t=>t.online&&t.id!==srcId);
    if(tgtIds&&tgtIds.length) targets=targets.filter(t=>tgtIds.includes(t.id));
    targets.forEach(t=>{
      srcDts.forEach(srcDt=>{
        const existing=t.desktops.findIndex(d=>d.name===srcDt.name);
        if(existing>=0) t.desktops[existing]={...srcDt,syncStatus:'synced',editedAt:now()};
        else t.desktops.push({...srcDt,syncStatus:'synced',editedAt:now()});
      });
      /* update bios boot entries to match current desktops */
      if(t.bios){ t.bios.bootEntries=t.desktops.map(d=>d.id); }
      else { t.bios={bootEntries:t.desktops.map(d=>d.id),defaultBootId:t.desktops[0]?.id||null,restoreMode:'还原系统盘，保留数据盘'}; }
    });
    const tgtCr=crById(crId);
    if(tgtCr){
      srcDts.forEach(srcDt=>{
        const catIdx=tgtCr.desktopCatalog.findIndex(d=>d.name===srcDt.name);
        if(catIdx>=0) tgtCr.desktopCatalog[catIdx]={...srcDt,syncStatus:'synced',editedAt:now()};
        else tgtCr.desktopCatalog.push({...srcDt,syncStatus:'synced',editedAt:now()});
      });
    }
    addLog('info','平台','远程桌面分发',`从 ${srcT.seat||srcT.mac} 分发 ${srcDts.length} 个桌面到 ${targets.length} 台终端`);
    return {ok:true, count:targets.length};
  }
  case 'plat-ip-mod':{
    const crId=payload.classroomId; if(!crId) return {ok:false,reason:'缺少教室'};
    const newBase=payload.newIpBase; const startOctet=payload.startOctet||20;
    if(!newBase) return {ok:false,reason:'缺少新网段'};
    const selIds=payload.terminalIds;
    let terms=termsInCr(crId).filter(t=>t.online);
    if(selIds&&selIds.length) terms=terms.filter(t=>selIds.includes(t.id));
    terms.forEach((t,i)=>{
      if(t.use==='教师终端') t.ip=newBase+'.10';
      else t.ip=newBase+'.'+(startOctet+i);
    });
    addLog('info','平台','批量修改 IP',`${terms.length} 台终端 IP 已更新为 ${newBase}.x`);
    return {ok:true, count:terms.length};
  }
  case 'plat-remote-test':{
    const crId=payload.classroomId; if(!crId) return {ok:false,reason:'缺少教室'};
    const selIds=payload.terminalIds;
    let terms=termsInCr(crId).filter(t=>t.online);
    if(selIds&&selIds.length) terms=terms.filter(t=>selIds.includes(t.id));
    const results=terms.map(t=>({
      id:t.id, seat:t.seat||t.mac, name:t.name||'', ip:t.ip||'',
      latency:Math.floor(Math.random()*8+1)+'ms',
      bandwidth:Math.floor(Math.random()*400+600)+'Mbps',
      serverReachable:true, gatewayReachable:true
    }));
    return {ok:true, results};
  }
  case 'plat-broadcast-test':{
    const crId=payload.classroomId;
    const peerIds=payload.classroomIds; if(!peerIds||!peerIds.length) return {ok:false,reason:'请选择至少一个对端教室'};
    const localCr=crById(crId); const localTerms=termsInCr(crId).filter(t=>t.online);
    const localPick=localTerms[Math.floor(Math.random()*localTerms.length)];
    const results=peerIds.map(pid=>{
      const pCr=crById(pid); const pTerms=termsInCr(pid).filter(t=>t.online);
      const pPick=pTerms[Math.floor(Math.random()*pTerms.length)];
      const leaked=Math.random()<0.15;
      const localRecv=leaked?Math.floor(Math.random()*5)+1:0;
      const peerRecv=leaked?Math.floor(Math.random()*3):0;
      return { peerClassroom:pCr?.name||pid,
        localSeat:localPick?.seat||'--', localIp:localPick?.ip||'--', localSent:100, localRecvForeign:localRecv,
        peerSeat:pPick?.seat||'--', peerIp:pPick?.ip||'--', peerSent:100, peerRecvForeign:peerRecv,
        leaked };
    });
    const hasInterference=results.some(r=>r.leaked);
    addLog(hasInterference?'warn':'info','平台','广播域隔离测试',
      hasInterference?'检测到跨教室广播泄漏':'广播域隔离正常，无跨教室干扰');
    return {ok:true, results, hasInterference};
  }
  case 'plat-server-ip-change':{
    const newAddr=payload.newAddress; if(!newAddr) return {ok:false,reason:'缺少新地址'};
    const campusId=payload.campusId;
    const svr=state.servers.find(sv=>sv.campusId===campusId);
    if(svr) svr.address=newAddr;
    const terms=state.terminals.filter(t=>{const c=crById(t.classroomId);return c&&c.campusId===campusId&&t.online;});
    terms.forEach(t=>{t.serverAddr=newAddr;});
    addLog('info','平台','服务器 IP 变更',`新地址 ${newAddr}，已通知 ${terms.length} 台在线终端`);
    return {ok:true, count:terms.length};
  }
  case 'plat-import-license':{
    const campusId=payload.campusId;
    const svr=state.servers.find(sv=>sv.campusId===campusId);
    if(svr){svr.license=svr.license+200;}
    addLog('info','平台','授权导入',`授权数量已更新为 ${svr?.license||0}`);
    return {ok:true, newLicense:svr?.license||0};
  }
  case 'plat-import-terminal-list':{
    const crId=payload.classroomId||state.classrooms.find(c=>c.campusId===payload.campusId&&c.stage==='deployed')?.id;
    if(!crId) return {ok:false,reason:'无可导入教室'};
    const cr=crById(crId);
    if(cr&&!cr.registeredOnServer){
      cr.registeredOnServer=true;cr.lastSyncTime=now();
      addLog('info','平台','终端清单导入',`${cr.name} 已完成服务器注册建档`);
    }
    return {ok:true};
  }

  default: return {ok:false, reason:'未知操作: '+action};
  }
}


/* ══════════ TICK ENGINE ══════════ */
function tickHeartbeats(){
  state.terminals.forEach((t,i)=>{
    if(!t.online) return;
    t.metrics.cpu=clamp(t.metrics.cpu+((i%3)-1)*2,5,94);
    t.metrics.mem=clamp(t.metrics.mem+((i%5)-2),12,96);
    t.heartbeat=now();
  });
}

function tickRecover(){
  let changed=false;
  /* mother machine reboot recovery */
  const mt=termById(state.demo.motherId);
  if(mt&&mt._recoverTicks){
    mt._recoverTicks--;
    if(mt._recoverTicks===0){
      mt.power='on'; mt.online=true;
      const scr=mt._resumeScreen||mt.screen;
      mt._resumeScreen=null;
      state.demo.motherScreen=scr; mt.screen=scr;
    }
    changed=true;
  }
  /* any non-mother terminal rebooting (from plat-restart etc.) */
  state.terminals.forEach(t=>{
    if(t.id===state.demo.motherId) return;
    if(!t._recoverTicks) return;
    t._recoverTicks--;
    if(t._recoverTicks===0){ t.power='on'; t.online=true; t.heartbeat=now(); }
    changed=true;
  });
  return changed;
}

function tickTasks(){
  let changed=false;
  for(const task of state.tasks){
    if(task.phase!=='running') continue;
    const cr=crById(task.classroomId);
    const dt=cr.desktopCatalog.find(d=>d.id===task.sourceDesktopId);
    const dtLabel=dt?dt.name+' '+dt.version:'配置数据';
    for(const item of task.items){
      if(!['transferring','applying','rebooting'].includes(item.state)) continue;
      const t=termById(item.terminalId);
      // check if paused
      const ctrl=state.demo.transferControl[item.terminalId];
      if(ctrl?.paused) continue;
      if(!t.online&&t.power!=='rebooting'){failItem(task,item,t,'终端离线');changed=true;continue;}
      item.ticks--; if(item.ticks>0) continue;
      if(item.state==='transferring'){item.state='applying';item.ticks=2;setTermTaskState(t,'applying',dtLabel);changed=true;}
      else if(item.state==='applying'){item.state='rebooting';item.ticks=item.slow?4:2;setTermTaskState(t,'rebooting',dtLabel);changed=true;}
      else if(item.state==='rebooting'){
        item.state='completed';item.ticks=0;
        if(task.type==='deployment'){
          const asgn=task.assignments?.find(a=>a.terminalId===item.terminalId);
          if(asgn){t.name=asgn.name;t.seat=asgn.seat;t.ip=asgn.ip;t.use=asgn.use;
            t.subnetMask=asgn.subnetMask||'255.255.255.0';
            t.serverAddr=asgn.serverAddr||cr.serverAddress||'';t.gateway=asgn.gateway||cr.gateway;t.dns=asgn.dns?(asgn.dns.split?asgn.dns.split(','):asgn.dns):cr.dns;
            t.desktops=cr.desktopCatalog.filter(d=>d.visibility!=='hidden').map(d=>({...d}));
            t.defaultDesktopId=task.sourceDesktopId;
            t.bios={bootEntries:t.desktops.map(d=>d.id),defaultBootId:task.sourceDesktopId,restoreMode:asgn.restoreMode||cr.restoreMode||'还原系统盘，保留数据盘'};
            t.boundClassroom=cr.id;}
        }
        if(task.type==='maintenance'){
          /* update desktops + bios from classroom catalog after maintenance */
          t.desktops=cr.desktopCatalog.filter(d=>d.visibility!=='hidden').map(d=>({...d}));
          if(task.sourceDesktopId) t.defaultDesktopId=task.sourceDesktopId;
          t.bios={bootEntries:t.desktops.map(d=>d.id),defaultBootId:t.defaultDesktopId||t.desktops[0]?.id,restoreMode:t.bios?.restoreMode||cr.restoreMode||'还原系统盘，保留数据盘'};
        }
        t.sync='synced'; t.syncNote='已完成';
        setTermTaskState(t,'completed',dtLabel); changed=true;
      }
    }
    // advance queue
    const limit=task.type==='maintenance'?4:task.type==='deployment'?8:16;
    const active=task.items.filter(i=>['transferring','applying','rebooting'].includes(i.state)).length;
    if(active<limit){
      const queued=task.items.filter(i=>i.state==='queued').slice(0,limit-active);
      for(const item of queued){
        const t=termById(item.terminalId);
        if(!t.online){failItem(task,item,t,'终端离线');changed=true;continue;}
        item.state='transferring';item.ticks=2;setTermTaskState(t,'transferring',dtLabel);changed=true;
      }
    }
    syncCounts(task);
    const settled=task.counts.completed+task.counts.failed;
    if(settled===task.counts.total){
      task.phase='completed';task.completedAt=now();
      if(task.type==='deployment'){
        cr.stage='deployed'; cr.memberMacs=termsInCr(cr.id).map(t=>t.mac);
        state.demo.motherScreen='deploy-result'; termById(state.demo.motherId).screen='deploy-result';
      } else if(task.type==='exam-apply'){
        const compIds=task.items.filter(i=>i.state==='completed').map(i=>i.terminalId);
        state.demo.examState={applied:true,appliedAt:now(),appliedDesktopId:task.sourceDesktopId,
          appliedIds:compIds,restoreAvailable:compIds.length>0,entriesHidden:!!task.settings?.hideEntries,restored:false};
        state.demo.motherScreen='exam-active'; termById(state.demo.motherId).screen='exam-active';
      } else if(task.type==='exam-restore'){
        state.demo.examState={applied:false,restoreAvailable:false,entriesHidden:false,appliedIds:[],restored:true};
        state.demo.motherScreen='exam-result'; termById(state.demo.motherId).screen='exam-result';
      } else {
        state.demo.motherScreen='maint-result'; termById(state.demo.motherId).screen='maint-result';
      }
      cr.status='active';
      const fCount=task.counts.failed;
      addLog(fCount?'warn':'info','终端',cr.name+' '+task.label+' 完成',fCount?fCount+' 台失败':'全部成功');
      changed=true;
    }
  }
  return changed;
}


/* ══════════ EXPRESS SERVER ══════════ */
async function main(){
  if(existsSync(STATE_FILE)){
    try{ state=JSON.parse(readFileSync(STATE_FILE,'utf8')); }catch(e){ state=buildState(seed); }
  } else { state=buildState(seed); }
  /* Ensure grid blocks exist for the initial classroom */
  if(!state.demo.deployDraft.grid.blocks.length){
    const fcr=crById(state.demo.focusClassroomId);
    if(fcr) state.demo.deployDraft.grid=initGridBlocks(fcr.id,fcr);
  }

  const app = express();
  app.use(express.json());
  app.use(express.static(PUBLIC));

  app.get('/api/state',(_,res)=>res.json(state));
  app.get('/api/stream',(req,res)=>{
    res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache',Connection:'keep-alive','Access-Control-Allow-Origin':'*'});
    res.write('data: '+JSON.stringify(state)+'\n\n');
    sseClients.add(res); req.on('close',()=>sseClients.delete(res));
  });

  app.post('/api/action',(req,res)=>{
    const {action,payload}=req.body||{};
    if(!action) return res.status(400).json({ok:false,reason:'缺少 action'});
    try{
      const result=act(action,payload||{});
      state.meta.updatedAt=now();
      broadcast();
      save();
      res.json({ok:true,result});
    }catch(e){ res.status(500).json({ok:false,reason:e.message}); }
  });

  // HTML routes
  app.get('/',(_,r)=>r.sendFile(path.join(PUBLIC,'apps/director/index.html')));
  app.get('/director',(_,r)=>r.sendFile(path.join(PUBLIC,'apps/director/index.html')));
  app.get('/platform',(_,r)=>r.sendFile(path.join(PUBLIC,'apps/platform/index.html')));
  app.get(['/terminal','/terminal/mother'],(_,r)=>r.sendFile(path.join(PUBLIC,'apps/terminal/mother.html')));
  app.get(['/terminal/controlled','/terminal/controlled/:id'],(_,r)=>r.sendFile(path.join(PUBLIC,'apps/terminal/controlled.html')));

  app.listen(3920,'0.0.0.0',()=>{
    const lanIp=(()=>{const nics=os.networkInterfaces();const skip=/^(vEthernet|VMware|VirtualBox|WSL|Docker|vboxnet|br-|Hyper-V)/i;const all=Object.entries(nics).flatMap(([name,addrs])=>addrs.filter(a=>a.family==='IPv4'&&!a.internal).map(a=>({name,addr:a.address})));const physical=all.filter(n=>!skip.test(n.name));return(physical[0]||all[0])?.addr||'localhost';})();
    console.log(`云桌面原型服务器已启动:`);
    console.log(`  本机: http://localhost:3920`);
    console.log(`  局域网: http://${lanIp}:3920`);
    console.log('OK: classrooms='+state.classrooms.length+' terminals='+state.terminals.length+
      ' blank='+state.classrooms.filter(c=>c.stage==='blank').length);
  });

  // tick loop
  setInterval(()=>{
    const r1=tickRecover();
    tickHeartbeats();
    const r2=tickTasks();
    if(r1||r2){ state.meta.updatedAt=now(); broadcast(); save(); }
  }, 2000);
}

function broadcast(){
  const data='data: '+JSON.stringify(state)+'\n\n';
  for(const c of sseClients){ try{c.write(data);}catch(e){sseClients.delete(c);} }
}
function save(){
  try{writeFileSync(STATE_FILE,JSON.stringify(state),'utf8');}catch(e){console.error('保存失败:',e.message);}
}

main().catch(e=>{console.error(e);process.exit(1);});
