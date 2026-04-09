/* ── data accessors (v2 — blank terminal aware) ── */

function parseSeat(s) {
  if (!s) return { r: 999, c: 999 };
  if (s.startsWith('T-')) return { r: -1, c: +s.split('-')[1] || 1 };
  const [row, col] = s.split('-');
  return { r: row.charCodeAt(0) - 65, c: +col || 0 };
}

export function cmpSeat(a, b) {
  // Sort by seat if available, otherwise by index
  if (a.seat && b.seat) {
    const sa = parseSeat(a.seat), sb = parseSeat(b.seat);
    return sa.r !== sb.r ? sa.r - sb.r : sa.c - sb.c;
  }
  return (a.index || 0) - (b.index || 0);
}

export const getCampus    = (s, id) => s.campuses.find(c => c.id === id);
export const getClassroom = (s, id) => s.classrooms.find(c => c.id === id);
export const getServer    = (s, id) => s.servers.find(sv => sv.id === id);
export const serverFor    = (s, campId) => { const c = getCampus(s, campId); return c ? getServer(s, c.serverId) : null; };
export const getTerm      = (s, id) => s.terminals.find(t => t.id === id);
export const termsInCr    = (s, crId) => s.terminals.filter(t => t.classroomId === crId).sort(cmpSeat);
export const taskForCr    = (s, crId) => s.tasks.find(t => t.classroomId === crId && t.phase === 'running') || s.tasks.find(t => t.classroomId === crId);
export const alertsInCr   = (s, crId) => s.alerts.filter(a => a.classroomId === crId && a.status === 'open');

/* Terminal display label: use name if available, otherwise MAC */
export function termLabel(t) {
  if (!t) return '--';
  if (t.name) return t.name;
  return t.mac || '--';
}

/* Terminal seat label: use seat if available, otherwise index */
export function termSeat(t) {
  if (!t) return '--';
  if (t.seat) return t.seat;
  return '#' + (t.index + 1);
}

/* Terminal IP label */
export function termIp(t) {
  if (!t) return '--';
  return t.ip || '未分配';
}

/* Terminal use label */
export function termUse(t) {
  if (!t || !t.use) return '未标记';
  return t.use;
}

/* Stage label in Chinese */
export function stageLabel(stage) {
  const map = { blank: '未部署', bound: '已绑定', deployed: '已部署', registered: '已注册' };
  return map[stage] || stage || '--';
}

export function crRuntime(s, crId) {
  const ts = termsInCr(s, crId);
  const als = alertsInCr(s, crId);
  const tk = taskForCr(s, crId);
  return {
    total: ts.length,
    online: ts.filter(t => t.online).length,
    offline: ts.filter(t => !t.online).length,
    abnormal: als.length,
    executing: tk ? tk.items.filter(i => !['completed', 'failed', 'queued'].includes(i.state)).length : 0,
    deployed: ts.filter(t => t.name && t.ip).length
  };
}

export function campusStats(s, cId) {
  const crs = s.classrooms.filter(c => c.campusId === cId);
  const crIds = new Set(crs.map(c => c.id));
  const ts = s.terminals.filter(t => crIds.has(t.classroomId));
  return {
    classrooms: crs.length,
    registered: crs.filter(c => c.registeredOnServer).length,
    terminals: ts.length,
    teachers: ts.filter(t => t.use === '教师终端').length,
    students: ts.filter(t => t.use === '学生终端').length,
    online: ts.filter(t => t.online).length,
    offline: ts.filter(t => !t.online).length,
    alerts: s.alerts.filter(a => crIds.has(a.classroomId) && a.status === 'open').length,
    tasks: s.tasks.filter(tk => crIds.has(tk.classroomId) && tk.phase === 'running').length
  };
}

export function desktopAssets(s, campusId) {
  const out = [];
  for (const cr of s.classrooms) {
    if (campusId && cr.campusId !== campusId) continue;
    for (const d of (cr.desktopCatalog || [])) {
      out.push({ ...d, classroomId: cr.id, classroomName: cr.name, campusId: cr.campusId });
    }
  }
  return out.sort((a, b) => (b.editedAt || '').localeCompare(a.editedAt || ''));
}
