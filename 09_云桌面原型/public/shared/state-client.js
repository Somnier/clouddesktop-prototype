export function createStateClient(onState) {
  let state = null;
  let es = null;

  async function load() {
    const r = await fetch('/api/state');
    state = await r.json();
    onState?.(state);
    return state;
  }

  function connect() {
    es?.close();
    es = new EventSource('/api/stream');
    es.onmessage = e => { state = JSON.parse(e.data); onState?.(state); };
  }

  async function send(action, payload = {}) {
    const r = await fetch('/api/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, payload })
    });
    const b = await r.json();
    if (b.result?.ok === false) throw new Error(b.result.reason || '操作失败');
    return b.result;
  }

  function get() { return state; }
  function dispose() { es?.close(); }

  return { connect, dispose, get, load, send };
}
