export function createStateClient(onState) {
  let state = null;
  let es = null;
  let _rafPending = false;
  let _lastFingerprint = null;

  /* Build a fingerprint of structurally-relevant state, excluding volatile
     metrics/heartbeat/monitorHistory that change every tick but don't affect the UI layout.
     Only re-render when this fingerprint changes. */
  function _stateFingerprint(s) {
    if (!s) return '';
    const demo = s.demo || {};
    /* Core structural data that drives UI decisions */
    const parts = [
      demo.focusClassroomId, demo.focusCampusId, demo.motherId,
      demo.motherScreen, JSON.stringify(demo.flags || {}),
      JSON.stringify(demo.takeover || {}),
      JSON.stringify(demo.deployDraft || {}),
      JSON.stringify(demo.maintDraft || {}),
      JSON.stringify(demo.faultReplace || {}),
      JSON.stringify(demo.examState || {}),
      JSON.stringify(demo.transferControl || {}),
    ];
    /* Terminal structural fields: online status, controlState, ip, seat, name, desktops, taskState, sync */
    if (s.terminals) {
      for (const t of s.terminals) {
        parts.push(t.id, t.online ? '1' : '0', t.controlState, t.ip, t.seat, t.name,
          t.taskState, t.sync, t.syncNote,
          t.desktops ? t.desktops.length + '' : '0',
          t.bios?.defaultBootId || '');
      }
    }
    /* Classroom structural fields */
    if (s.classrooms) {
      for (const c of s.classrooms) {
        parts.push(c.id, c.stage, c.status, c.motherId,
          (c.desktopCatalog || []).length + '',
          c.registeredOnServer ? '1' : '0');
      }
    }
    /* Task state */
    if (s.tasks) {
      for (const tk of s.tasks) {
        parts.push(tk.id, tk.phase,
          (tk.counts?.completed || 0) + ',' + (tk.counts?.failed || 0) + ',' +
          (tk.counts?.transferring || 0) + ',' + (tk.counts?.queued || 0) + ',' +
          (tk.counts?.total || 0));
        /* Individual item states for progress grids */
        if (tk.items) {
          for (const it of tk.items) {
            parts.push(it.terminalId + ':' + it.state);
          }
        }
      }
    }
    /* Alerts */
    if (s.alerts) {
      parts.push(s.alerts.length + '');
    }
    return parts.join('|');
  }

  async function load() {
    const r = await fetch('/api/state');
    state = await r.json();
    onState?.(state);
    return state;
  }

  function _scheduleRender() {
    if (_rafPending) return;
    _rafPending = true;
    requestAnimationFrame(() => {
      _rafPending = false;
      /* Only call render if fingerprint changed */
      const fp = _stateFingerprint(state);
      if (fp === _lastFingerprint) return;
      _lastFingerprint = fp;
      onState?.(state);
    });
  }

  function connect() {
    es?.close();
    es = new EventSource('/api/stream');
    es.onmessage = e => { state = JSON.parse(e.data); _scheduleRender(); };
  }

  async function send(action, payload = {}) {
    const r = await fetch('/api/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, payload })
    });
    const b = await r.json();
    if (b.result?.ok === false) throw new Error(b.result.reason || '操作失败');
    /* After an action, always force a re-render since the user just did something */
    _lastFingerprint = null;
    return b.result;
  }

  function get() { return state; }
  function dispose() { es?.close(); }

  return { connect, dispose, get, load, send };
}
