export const esc = v => String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

export function fmtTime(v) {
  if (!v) return '--';
  return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(v));
}

export function relTime(v) {
  if (!v) return '--';
  const s = Math.max(0, Math.round((Date.now() - new Date(v).getTime()) / 1000));
  if (s < 60) return `${s} 秒前`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} 分钟前`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} 小时前`;
  return `${Math.round(h / 24)} 天前`;
}

export const pct = (n, d) => d ? Math.round(n / d * 100) : 0;

export function tone(status) {
  const map = {
    healthy: 'ok', on: 'ok', synced: 'ok', completed: 'ok', active: 'ok', idle: 'muted',
    syncing: 'info', queued: 'info', transferring: 'info', applying: 'info', dispatching: 'info',
    maintenance: 'info', deployment: 'info', exam: 'info', editing: 'info', returning: 'info',
    warning: 'warn', delayed: 'warn', rebooting: 'warn', pending: 'warn',
    offline: 'err', off: 'err', failed: 'err', danger: 'err'
  };
  return map[status] || 'muted';
}

export const pill = (label, t = 'muted') => `<span class="pill ${t}">${esc(label)}</span>`;
export const chip = label => `<span class="chip">${esc(label)}</span>`;

export function meter(label, value, t = 'muted') {
  const v = Math.max(0, Math.min(100, +value || 0));
  return `<div class="meter"><div class="meter-head"><span>${esc(label)}</span><strong>${v}%</strong></div><div class="meter-bar"><div class="meter-fill ${t}" style="width:${v}%"></div></div></div>`;
}

export function defRow(label, value, opts = {}) {
  const v = opts.raw ? (value ?? '--') : esc(value ?? '--');
  return `<div class="def-row"><span class="def-label">${esc(label)}</span><span class="def-value${opts.mono ? ' mono' : ''}">${v}</span></div>`;
}

export const empty = (title, sub = '') => `<div class="empty-block"><strong>${esc(title)}</strong>${sub ? `<span>${esc(sub)}</span>` : ''}</div>`;

/* Chinese label helpers — avoid any English leak to UI */
export function syncLabel(v){
  const m = { synced:'已同步', syncing:'同步中', failed:'同步失败', none:'未同步', uploading:'上传中' };
  return m[v] || v || '未同步';
}
export function phaseLabel(v){
  const m = { running:'执行中', completed:'已完成', failed:'失败', idle:'空闲', paused:'已暂停' };
  return m[v] || v || '--';
}
export function visLabel(v){
  const m = { default:'显示', hidden:'已隐藏' };
  return m[v] || v || '--';
}
