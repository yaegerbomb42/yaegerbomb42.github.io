/* ============================================================================
 * AGENT O — single-page UI
 *
 * One module, no build step. Plain ES2022 in the browser. The script:
 *  1. Boots a resilient WebSocket to /ws, with auto-reconnect + heartbeat.
 *  2. Owns a small reactive STATE object; render functions read from STATE.
 *  3. Handles task submission, autonomy/budget/engine selection,
 *     confirmation/fix flow, and the drawing-on-iframe annotation system.
 *  4. Updates live preview, metrics gauges, sparklines, and tool palette.
 *
 * The code is intentionally explicit (no framework). Each subsystem is in its
 * own labelled section.
 * ========================================================================== */

'use strict';

// -----------------------------------------------------------------------------
// 0 · State
// -----------------------------------------------------------------------------

const STATE = {
  ws: null,
  wsReady: false,
  reconnectAttempt: 0,
  tasks: {},                 // task_id -> task
  taskOrder: [],
  activeTaskId: null,
  metrics: null,
  live: null,
  engines: [],
  tools: [],
  selfImprovement: false,
  halted: false,
  composer: {
    autonomy: 'FULL',
    budget: 5,
    engine: '',
  },
  preview: {
    url: null,
    annotating: false,
    strokes: [],
    currentStroke: null,
    canvas: null,
    ctx: null,
  },
  stream: {                  // entries displayed in the center column
    entries: [],
    cap: 400,
  },
  pending: null,             // confirmation/question awaiting user
  modal: null,               // {title, body, actions}
  plan: null,                // current task's strategic plan
  previewExpanded: false,
  toolInspect: null,
  view: 'unified',
  desktop: { http: null, https: null },
  desk: {
    tree: [],
    selectedPath: null,
    diffs: [],               // recent workspace_diff events (capped)
  },
  health: null,              // last /api/health JSON (substrate knobs, provider)
};

const $ = (id) => document.getElementById(id);
const el = (tag, attrs = {}, ...children) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null) continue;
    if (typeof c === 'string') e.appendChild(document.createTextNode(c));
    else e.appendChild(c);
  }
  return e;
};

const ENGINE_LABELS = {
  first_principles: 'FIRST·PRINCIPLES',
  abductive: 'ABDUCTIVE',
  adversarial: 'ADVERSARIAL',
  lateral: 'LATERAL',
  meta_recursive: 'META·RECURSIVE',
};

// -----------------------------------------------------------------------------
// 1 · WebSocket
// -----------------------------------------------------------------------------

function connectWS() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const url = `${proto}://${location.host}/ws`;
  const ws = new WebSocket(url);
  STATE.ws = ws;

  ws.addEventListener('open', () => {
    STATE.wsReady = true;
    STATE.reconnectAttempt = 0;
    setStatus('connection live', 'phosphor');
  });
  ws.addEventListener('message', (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      handleEvent(msg);
    } catch (e) {
      console.error('bad ws frame', e, ev.data);
    }
  });
  ws.addEventListener('close', () => {
    STATE.wsReady = false;
    setStatus('disconnected — reconnecting', 'amber');
    const delay = Math.min(8000, 500 * Math.pow(2, STATE.reconnectAttempt++));
    setTimeout(connectWS, delay);
  });
  ws.addEventListener('error', () => { try { ws.close(); } catch {} });
}

function setStatus(msg, tone = 'text-2') {
  $('status-clock').textContent = msg.toUpperCase();
  $('status-clock').style.color = ({
    phosphor: 'var(--phosphor)',
    amber: 'var(--amber)',
    crimson: 'var(--crimson)',
  })[tone] || 'var(--text-2)';
}

/** Clear stream DOM, plan, desk, preview strokes, VM panel, thinking chip. */
function purgeStreamPlanDeskPreview() {
  stopVmStream();
  STATE.stream.entries = [];
  const stream = $('stream');
  if (stream) stream.innerHTML = '';
  STATE.plan = null;
  renderPlan();
  STATE.desk.tree = [];
  STATE.desk.selectedPath = null;
  STATE.desk.diffs = [];
  const dfeed = $('desk-feed-body');
  if (dfeed) dfeed.innerHTML = '';
  const dfb = $('desk-file-body');
  if (dfb) dfb.textContent = '(select a file)';
  const dfp = $('desk-file-path');
  if (dfp) dfp.textContent = '—';
  const dfm = $('desk-file-meta');
  if (dfm) dfm.textContent = '';
  STATE.desktop = { http: null, https: null };
  syncDesktopLinks();
  const dIframe = $('desktop-iframe');
  if (dIframe) dIframe.src = '';
  syncFusedEmbeds();
  hideSandboxProgress();
  STATE.thinking = null;
  renderThinking();
  STATE.preview.strokes = [];
  STATE.preview.annotating = false;
  STATE.preview.url = null;
  redrawStrokes();
  const vm = $('vm-console');
  if (vm) {
    vm.textContent = 'When a task is running, this panel streams sandbox commands (docker exec), stats, and process snapshots.';
  }
  const vmMeta = $('vm-meta');
  if (vmMeta) vmMeta.textContent = '—';
  const vstats = $('vm-stats');
  if (vstats) vstats.innerHTML = '';
}

async function resetUiForNewTask() {
  try {
    const res = await fetch('/api/ui/reset-for-new-task', { method: 'POST' });
    const data = res.ok ? await res.json() : null;
    if (data?.live) STATE.live = data.live;
    if (data?.daily) STATE.metrics = data.daily;
  } catch {}
  STATE.activeTaskId = null;
  STATE.pending = null;
  $('pending-banner')?.classList.add('hidden');
  purgeStreamPlanDeskPreview();
  renderActiveMeta();
  renderMetrics();
  pushStream({
    kind: 'system',
    body: 'New task prep · stream cleared · live sparklines reset (daily totals unchanged).',
  });
}

// -----------------------------------------------------------------------------
// 2 · Event router
// -----------------------------------------------------------------------------

function handleEvent({ type, data, ts }) {
  switch (type) {
    case 'hello':
      onHello(data);
      break;
    case 'task_added':
      upsertTask(data.task);
      pushStream({ kind: 'system', body: `task queued · ${data.task.title}`, taskId: data.task.id });
      break;
    case 'task_updated':
      upsertTask(data.task);
      break;
    case 'task_started':
      upsertTask(data.task);
      STATE.activeTaskId = data.task.id;
      purgeStreamPlanDeskPreview();
      refreshUnifiedPanels();
      {
        const title = (data.task.title || '').trim() || 'untitled';
        const raw = (data.task.prompt || '').trim().replace(/\s+/g, ' ');
        const snip = raw.length > 160 ? `${raw.slice(0, 160)}…` : raw;
        const body = snip && snip !== title
          ? `▶ task started · ${title}\n   ${snip}`
          : `▶ task started · ${title}`;
        pushStream({ kind: 'system', body, taskId: data.task.id });
      }
      renderActiveMeta();
      renderEngine(data.task.cognitive_engine);
      break;
    case 'task_thought':
      pushStream({
        kind: data.kind === 'final' ? 'final' : (data.kind === 'error' ? 'error' : 'thought'),
        body: data.text,
        meta: data.engine ? `engine · ${data.engine}` : undefined,
        taskId: data.task_id,
      });
      break;
    case 'task_engine':
      renderEngine(data.engine);
      pushStream({ kind: 'system', body: `engine → ${ENGINE_LABELS[data.engine] || data.engine}`, taskId: data.task_id });
      break;
    case 'task_tool':
      pushStream({
        kind: data.ok ? 'tool-ok' : 'tool-err',
        toolName: data.tool,
        toolArgs: data.args,
        toolOutput: data.output,
        step: data.step,
        taskId: data.task_id,
        importance: toolStreamImportance(data.tool),
      });
      break;
    case 'task_completed':
      pushStream({ kind: 'final', body: data.deliverable?.summary || 'task complete', taskId: data.task_id });
      break;
    case 'task_failed':
      pushStream({ kind: 'error', body: `task failed · ${data.error}`, taskId: data.task_id });
      break;
    case 'task_stalled':
      pushStream({
        kind: 'system',
        body: `task STALLED (not failed) — ${data.summary || 'budget or LLM exhausted'} · use RESUME when ready`,
        taskId: data.task_id,
      });
      break;
    case 'goal_distance_probe':
      pushStream({
        kind: 'system',
        body: `[goal-distance probe] step ${data.step} → ${data.score}/100`,
        taskId: data.task_id,
      });
      break;
    case 'preview':
      onPreviewURL(data);
      break;
    case 'sandbox':
      pushStream({
        kind: 'sandbox',
        body: `sandbox · ${data.state}${data.container ? ` · ${data.container}` : ''}${data.message ? ` · ${data.message}` : ''}`,
        taskId: data.task_id,
      });
      if (data.state === 'building_image') {
        showSandboxProgress({
          title: 'BUILDING SANDBOX IMAGE',
          subtitle: data.message || 'first-run build · this only happens once',
        });
      } else if (data.state === 'image_built') {
        updateSandboxProgress({ subtitle: 'image cached · starting container…', done: false });
      } else if (data.state === 'started') {
        hideSandboxProgress();
        if (data.sandbox_desktop && data.desktop_http_port != null) {
          const h = location.hostname;
          STATE.desktop.http = `http://${h}:${data.desktop_http_port}/`;
          STATE.desktop.https = data.desktop_https_port != null
            ? `https://${h}:${data.desktop_https_port}/`
            : null;
          syncDesktopLinks();
          syncFusedEmbeds();
          syncDesktopIframe();
        }
      } else if (data.state === 'desktop_failed') {
        hideSandboxProgress();
        pushStream({
          kind: 'system',
          body: `desktop VM failed · ${(data.message || '').slice(0, 400)}`,
          taskId: data.task_id,
        });
      } else if (data.state === 'stopped' || data.state === 'host_mode') {
        hideSandboxProgress();
        if (data.task_id === STATE.activeTaskId) {
          STATE.desktop = { http: null, https: null };
          syncDesktopLinks();
          syncFusedEmbeds();
          const dIframe = $('desktop-iframe');
          if (dIframe) dIframe.src = '';
        }
      }
      break;
    case 'sandbox_build_progress':
      updateSandboxProgress({
        elapsed: data.elapsed,
        lastLine: data.last_line,
        done: !!data.done,
      });
      break;
    case 'sandbox_build_line':
      updateSandboxProgress({ lastLine: data.line });
      break;
    case 'key_rotation':
      pushStream({
        kind: 'system',
        body: `key rotated · ${data.provider} · ${data.key_tail} on cooldown (${data.reason})` +
              (data.keys_remaining != null ? ` · ${data.keys_remaining}/${data.fleet_size} keys live` : ''),
      });
      break;
    case 'provider_failover':
      pushStream({
        kind: 'system',
        body: `provider failover · ${data.from_provider} → ${data.to_provider} (${data.to_model})`,
      });
      // refresh /api/health so the topbar reflects the new active provider
      fetchHealth();
      break;
    case 'model_failover':
      pushStream({
        kind: 'system',
        body: `model failover · ${data.provider} · ${data.from_model} → ${data.to_model}`,
      });
      break;
    case 'ollama_pull':
      pushStream({
        kind: 'system',
        body: `ollama pull · ${data.state || '…'}${data.model ? ` · ${data.model}` : ''}` +
              (data.detail ? ` · ${String(data.detail).slice(0, 240)}` : ''),
        taskId: data.task_id,
      });
      break;
    case 'confirmation_request':
      onConfirmationRequest(data);
      break;
    case 'self_improvement':
      STATE.selfImprovement = data.on;
      renderSelfImprove();
      break;
    case 'self_improvement_cycle':
      pushStream({ kind: 'system', body: `self-improvement · ${data.phase}${data.summary ? ` · ${data.summary}` : ''}` });
      break;
    case 'log':
      if (data.level === 'ERROR' || data.level === 'WARNING') {
        pushStream({ kind: data.level === 'ERROR' ? 'error' : 'system', body: `[${data.logger}] ${data.message}` });
      }
      break;
    case 'tool_registered':
      pushStream({ kind: 'system', body: `tool synthesized · ${data.name}` });
      fetchTools();
      break;
    case 'llm_request':
      onLLMRequest(data);
      break;
    case 'llm_response':
      onLLMResponse(data);
      break;
    case 'agent_halted':
      STATE.halted = true;
      renderHalted();
      pushStream({
        kind: 'error',
        body: `AGENT HALTED · queue frozen${data.cancelled_task_id ? ` · cancelled task ${data.cancelled_task_id}` : ''}`,
      });
      // Clear the thinking indicator immediately
      STATE.thinking = null;
      renderThinking();
      hideSandboxProgress();
      break;
    case 'agent_resumed':
      STATE.halted = false;
      renderHalted();
      pushStream({ kind: 'system', body: 'agent resumed · queue active' });
      break;
    case 'ui_reset':
      STATE.activeTaskId = null;
      STATE.pending = null;
      $('pending-banner')?.classList.add('hidden');
      purgeStreamPlanDeskPreview();
      renderActiveMeta();
      pushStream({
        kind: 'system',
        body: 'UI reset · live rate buffers cleared on server (fetching metrics…)',
      });
      scheduleMetricsRefresh();
      break;
    case 'plan_started':
      pushStream({ kind: 'system', body: `planner running · budget ${data.budget_min}m` });
      break;
    case 'plan_ready':
      STATE.plan = data.plan;
      renderPlan();
      pushStream({
        kind: 'system',
        body: `plan ready · ambition=${data.plan.ambition} · ${data.plan.phases.length} phases (${data.plan.total_minutes.toFixed(1)}m)`,
      });
      break;
    case 'phase_started':
      if (STATE.plan) {
        const phs = STATE.plan.phases;
        // ensure the phase exists in plan (synthesis is appended dynamically).
        let found = phs.find(p => p.id === data.phase.id);
        if (!found) { phs.push(data.phase); found = data.phase; }
        for (const p of phs) if (p.status === 'running') p.status = 'done';
        Object.assign(found, data.phase, { status: 'running' });
        renderPlan();
      }
      pushStream({ kind: 'system', body: `▸ phase · ${data.phase.title} (${(data.phase.time_minutes||0).toFixed(1)}m · ${data.phase.engine})` });
      break;
    case 'phase_completed':
      if (STATE.plan) {
        const target = STATE.plan.phases.find(p => p.id === data.phase.id);
        if (target) Object.assign(target, data.phase, { status: 'done' });
        renderPlan();
      }
      pushStream({ kind: 'system', body: `✓ phase · ${data.phase.title}${data.phase.summary ? ' · ' + data.phase.summary.slice(0,140) : ''}` });
      break;
    case 'phase_skipped':
      pushStream({ kind: 'system', body: `phase skipped · ${data.phase} (budget exhausted)` });
      break;
    case 'model_quota_exhausted':
      pushStream({ kind: 'system', body: `model abandoned · ${data.provider}/${data.model} after ${data.after_attempts} keys returned shared-quota errors` });
      break;
    case 'workspace_diff':
      onWorkspaceDiff(data);
      break;
    default:
      // unknown event types: silently ignore (forward compat)
      break;
  }
  scheduleMetricsRefresh();
}

function onHello(d) {
  STATE.tasks = {};
  STATE.taskOrder = [];
  (d.tasks || []).forEach(t => upsertTask(t));
  STATE.metrics = d.metrics;
  STATE.live = d.live;
  STATE.engines = d.engines || [];
  STATE.tools = (d.tools || []).map(name => ({ name }));
  STATE.selfImprovement = !!d.self_improvement;
  STATE.halted = !!d.halted;
  $('status-provider').textContent = `PROVIDER ${d.provider || '—'}`;
  $('status-sandbox').textContent = 'SANDBOX DOCKER';
  $('status-tools').textContent = `TOOLS ${d.tools?.length || 0}`;
  setStatus('connection live', 'phosphor');
  populateEngineSelect();
  renderSelfImprove();
  renderHalted();
  fetchTools();
  fetchMetrics();
}

// -----------------------------------------------------------------------------
// 3 · Task list rendering
// -----------------------------------------------------------------------------

function upsertTask(task) {
  const known = !!STATE.tasks[task.id];
  STATE.tasks[task.id] = task;
  if (!known) STATE.taskOrder.push(task.id);
  renderQueue();
  if (task.id === STATE.activeTaskId) renderActiveMeta();
  if (task.status === 'AWAITING_CONFIRM') showConfirmBanner(task);
  if (task.status === 'AWAITING_USER' && task.pending_question) showQuestionBanner(task);
  if (task.status === 'AWAITING_USER' && task.pending_confirmation) showToolConfirmBanner(task);
  if (['RUNNING', 'QUEUED', 'PAUSED'].indexOf(task.status) === -1) {
    if (STATE.pending?.taskId === task.id && task.status !== 'AWAITING_CONFIRM' && task.status !== 'AWAITING_USER') {
      hidePendingBanner();
    }
  }
}

function renderQueue() {
  const list = $('queue-list');
  const recent = $('recent-list');
  list.innerHTML = ''; recent.innerHTML = '';
  let queueCount = 0;
  for (const id of STATE.taskOrder) {
    const t = STATE.tasks[id];
    const isTerminal = ['SUCCEEDED', 'FAILED', 'CANCELLED', 'STALLED'].includes(t.status);
    if (isTerminal && t.archived) continue;
    const target = isTerminal ? recent : list;
    if (!isTerminal && t.status !== 'SUCCEEDED') queueCount++;
    const row1 = el('div', { class: 'qi-row1' },
      el('div', { class: 'qi-title' }, t.title || t.prompt.slice(0, 80)),
      el('div', { class: `qi-status ${t.status}` }, t.status),
    );
    const row2 = el('div', { class: 'qi-row2' },
      el('span', { class: 'qi-pill' }, t.autonomy),
      el('span', { class: 'qi-pill' }, `${t.time_budget_min}m`),
      el('span', { class: 'qi-pill' }, ENGINE_LABELS[t.cognitive_engine] || t.cognitive_engine),
    );
    const kids = [row1, row2];
    if (isTerminal) {
      kids.push(el('div', { class: 'qi-actions' },
        el('button', {
          type: 'button',
          class: 'qi-archive',
          title: 'Archive — hide from Recent',
          onclick: (e) => { e.stopPropagation(); archiveTask(t.id); },
        }, 'ARCHIVE'),
      ));
    }
    const item = el('div', {
      class: `queue-item is-${t.status.toLowerCase()}` + (t.id === STATE.activeTaskId ? ' is-running' : ''),
      'data-id': t.id,
      onclick: () => focusTask(t.id),
    }, ...kids);
    target.appendChild(item);
  }
  $('queue-count').textContent = queueCount;
}

async function archiveTask(taskId) {
  try {
    const res = await fetch(`/api/tasks/${encodeURIComponent(taskId)}/archive`, { method: 'POST' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch (e) {
    pushStream({ kind: 'error', body: `archive failed: ${e}` });
  }
}

function focusTask(id) {
  STATE.activeTaskId = id;
  renderActiveMeta();
  // We don't re-stream historical events; show a stub message.
  // (Future: persist per-task transcripts and replay here.)
  if (STATE.tasks[id]) {
    const t = STATE.tasks[id];
    pushStream({ kind: 'system', body: `focused on task ${id} · ${t.title}` });
  }
}

function renderActiveMeta() {
  const id = STATE.activeTaskId;
  const t = id ? STATE.tasks[id] : null;
  if (!t) {
    $('active-title').textContent = 'no task running';
    $('active-sub').textContent = 'submit a task to begin';
    $('engine-value').textContent = '—';
    $('btn-resume-stalled')?.classList.add('hidden');
    setBar('bar-time', 0);
    setBar('bar-steps', 0);
    return;
  }
  $('active-title').textContent = t.title;
  $('active-sub').textContent = `${t.id} · ${t.autonomy} · ${t.time_budget_min}m budget · ${t.status}`;
  const rs = $('btn-resume-stalled');
  if (rs) {
    if (t.status === 'STALLED') {
      rs.classList.remove('hidden');
      rs.dataset.taskId = t.id;
    } else {
      rs.classList.add('hidden');
      delete rs.dataset.taskId;
    }
  }
  renderEngine(t.cognitive_engine);
  // budget bars updated via metrics refresh
}

function renderEngine(engineId) {
  $('engine-value').textContent = ENGINE_LABELS[engineId] || engineId || '—';
}

// -----------------------------------------------------------------------------
// 4 · Thought stream rendering
// -----------------------------------------------------------------------------

function pushStream(entry) {
  STATE.stream.entries.push({ ...entry, t: Date.now() });
  if (STATE.stream.entries.length > STATE.stream.cap) {
    STATE.stream.entries.splice(0, STATE.stream.entries.length - STATE.stream.cap);
  }
  appendStreamEntry(entry);
}

function appendStreamEntry(entry) {
  const stream = $('stream');
  const node = renderStreamEntry(entry);
  stream.appendChild(node);
  // Auto-scroll only if user is near the bottom
  const nearBottom = stream.scrollHeight - stream.scrollTop - stream.clientHeight < 80;
  if (nearBottom) stream.scrollTop = stream.scrollHeight;
}

function renderStreamEntry(e) {
  const ts = new Date(e.t || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  switch (e.kind) {
    case 'thought':
      return el('div', { class: 's-entry s-thought' },
        el('div', { class: 's-meta' }, `THOUGHT · ${ts}${e.meta ? ' · ' + e.meta : ''}`),
        el('div', { class: 's-body' }, e.body || ''),
      );
    case 'tool-ok':
    case 'tool-err': {
      const imp = e.importance != null ? e.importance : 2;
      const muted = imp <= 1 ? ' s-muted' : '';
      return el('div', { class: `s-entry s-${e.kind === 'tool-ok' ? 'tool-ok' : 'tool-err'}${muted}` },
        el('div', { class: 's-meta' },
          `TOOL · ${ts} · step ${e.step ?? '?'}`,
        ),
        el('div', { class: 's-tool-head' },
          el('span', { class: 's-tool-name' }, e.toolName),
          el('span', { class: 's-tool-args' }, formatToolArgs(e.toolArgs)),
        ),
        e.toolOutput ? el('pre', { class: 's-tool-output' }, e.toolOutput) : null,
      );
    }
    case 'sandbox':
      return el('div', { class: 's-entry s-sandbox' },
        el('div', { class: 's-meta' }, `SANDBOX · ${ts}`),
        el('div', { class: 's-body' }, e.body || ''),
      );
    case 'final':
      return el('div', { class: 's-entry s-final' },
        el('div', { class: 's-meta' }, `DELIVERABLE · ${ts}`),
        el('div', { class: 's-body' }, e.body || ''),
      );
    case 'error':
      return el('div', { class: 's-entry s-error' },
        el('div', { class: 's-meta' }, `ERROR · ${ts}`),
        el('div', { class: 's-body' }, e.body || ''),
      );
    case 'system':
    default:
      return el('div', { class: 's-entry s-system' },
        el('div', { class: 's-meta' }, `${(e.kind || 'event').toUpperCase()} · ${ts}`),
        el('div', { class: 's-body' }, e.body || ''),
      );
  }
}

function formatToolArgs(args) {
  if (!args) return '';
  try {
    const txt = JSON.stringify(args, null, 0);
    return txt.length > 200 ? txt.slice(0, 200) + ' …' : txt;
  } catch { return '' + args; }
}

/** 1 = routine/noise (fs_read), 5 = structural — stream dims entries ≤2 */
function toolStreamImportance(toolName) {
  if (!toolName) return 2;
  const hi = new Set(['think', 'finish', 'phase_complete', 'fs_write', 'fs_edit', 'code_index_rebuild', 'synthesize_tool', 'preview_start', 'git_clone', 'git_commit', 'git_push', 'context_assemble']);
  if (hi.has(toolName)) return 5;
  if (toolName.startsWith('memory') || toolName.startsWith('scratchpad') || toolName.startsWith('persona')) return 4;
  if (toolName === 'fs_read' || toolName === 'fs_list') return 1;
  return 2;
}

async function resumeStalledTask() {
  const btn = $('btn-resume-stalled');
  const id = btn?.dataset?.taskId || STATE.activeTaskId;
  if (!id) return;
  try {
    const r = await fetch(`/api/tasks/${encodeURIComponent(id)}/resume`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    if (!r.ok) {
      const err = await r.text();
      pushStream({ kind: 'error', body: `resume failed · ${err}` });
      return;
    }
    const data = await r.json();
    if (data.task) upsertTask(data.task);
    pushStream({ kind: 'system', body: `task resumed · ${id} → QUEUED` });
  } catch (e) {
    pushStream({ kind: 'error', body: `resume · ${e.message || e}` });
  }
}

function initResumeStalled() {
  $('btn-resume-stalled')?.addEventListener('click', resumeStalledTask);
}

function syncFusedEmbeds() {
  const fp = $('fused-preview-iframe');
  const fd = $('fused-desktop-iframe');
  if (!fp || !fd) return;
  const emptyDesktop =
    '<body style="margin:0;background:#0a0c10;color:#8a9ba8;font:14px system-ui;display:flex;align-items:center;justify-content:center;height:100vh;text-align:center;padding:24px;">No Webtop URL yet. Enable <code style="color:#c8f5c4">AGENT_O_SANDBOX_DESKTOP=1</code> and restart, or open the DESKTOP tab.</body>';
  if (STATE.preview?.url) {
    fp.src = STATE.preview.url;
  } else {
    fp.removeAttribute('src');
  }
  const du = STATE.desktop?.http || STATE.desktop?.https || '';
  if (du) {
    fd.removeAttribute('srcdoc');
    fd.src = du;
  } else {
    fd.removeAttribute('src');
    fd.srcdoc = emptyDesktop;
  }
}

function onPreviewURL({ url }) {
  STATE.preview.url = url;
  const iframe = $('preview-iframe');
  iframe.hidden = false;
  iframe.src = url;
  document.querySelector('.preview-empty').style.display = 'none';
  syncExpandedPreview();
  syncFusedEmbeds();
  pushStream({ kind: 'system', body: `preview live · ${url}` });
}

function initAnnotation() {
  const canvas = $('annotate-canvas');
  STATE.preview.canvas = canvas;
  STATE.preview.ctx = canvas.getContext('2d');

  $('btn-annotate').addEventListener('click', toggleAnnotate);
  $('btn-annotate-clear').addEventListener('click', () => { STATE.preview.strokes = []; redrawStrokes(); });
  $('btn-annotate-cancel').addEventListener('click', () => stopAnnotate());
  $('btn-annotate-send').addEventListener('click', sendAnnotation);
  $('btn-preview-reload').addEventListener('click', () => {
    const f = $('preview-iframe');
    if (f.src) f.src = f.src;
  });
  $('btn-preview-open').addEventListener('click', () => {
    if (STATE.preview.url) window.open(STATE.preview.url, '_blank');
  });

  // Drawing
  let drawing = false;
  const start = (x, y) => {
    if (!STATE.preview.annotating) return;
    drawing = true;
    STATE.preview.currentStroke = { points: [[x, y]] };
  };
  const move = (x, y) => {
    if (!drawing || !STATE.preview.annotating) return;
    STATE.preview.currentStroke.points.push([x, y]);
    redrawStrokes();
  };
  const end = () => {
    if (!drawing) return;
    drawing = false;
    if (STATE.preview.currentStroke && STATE.preview.currentStroke.points.length > 1) {
      STATE.preview.strokes.push(STATE.preview.currentStroke);
    }
    STATE.preview.currentStroke = null;
    redrawStrokes();
  };

  canvas.addEventListener('pointerdown', e => {
    canvas.setPointerCapture(e.pointerId);
    const r = canvas.getBoundingClientRect();
    start(e.clientX - r.left, e.clientY - r.top);
  });
  canvas.addEventListener('pointermove', e => {
    const r = canvas.getBoundingClientRect();
    move(e.clientX - r.left, e.clientY - r.top);
  });
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  window.addEventListener('resize', resizeCanvas);
}

function toggleAnnotate() {
  if (STATE.preview.annotating) stopAnnotate();
  else startAnnotate();
}

function startAnnotate() {
  if (!STATE.preview.url) {
    pushStream({ kind: 'system', body: 'no preview to annotate yet.' });
    return;
  }
  STATE.preview.annotating = true;
  STATE.preview.strokes = [];
  const canvas = STATE.preview.canvas;
  canvas.hidden = false;
  $('btn-annotate').classList.add('active');
  $('annotate-bar').classList.remove('hidden');
  resizeCanvas();
}

function stopAnnotate() {
  STATE.preview.annotating = false;
  STATE.preview.canvas.hidden = true;
  $('btn-annotate').classList.remove('active');
  $('annotate-bar').classList.add('hidden');
}

function resizeCanvas() {
  const c = STATE.preview.canvas;
  if (!c) return;
  const r = c.parentElement.getBoundingClientRect();
  c.width = r.width;
  c.height = r.height;
  c.style.width = r.width + 'px';
  c.style.height = r.height + 'px';
  redrawStrokes();
}

function redrawStrokes() {
  const ctx = STATE.preview.ctx;
  if (!ctx) return;
  const { canvas, strokes, currentStroke } = STATE.preview;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#ffb13b';
  ctx.shadowColor = 'rgba(255,177,59,0.6)';
  ctx.shadowBlur = 6;
  const drawStroke = (s) => {
    if (!s || s.points.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(s.points[0][0], s.points[0][1]);
    for (let i = 1; i < s.points.length; i++) ctx.lineTo(s.points[i][0], s.points[i][1]);
    ctx.stroke();
  };
  strokes.forEach(drawStroke);
  drawStroke(currentStroke);
}

async function sendAnnotation() {
  const comment = $('annotate-comment').value.trim();
  if (!comment && STATE.preview.strokes.length === 0) {
    pushStream({ kind: 'system', body: 'add a comment or draw on the preview first.' });
    return;
  }
  const taskId = STATE.activeTaskId;
  if (!taskId) {
    pushStream({ kind: 'error', body: 'no active task to attach annotation to.' });
    return;
  }
  const canvas = STATE.preview.canvas;
  const payload = {
    comment,
    annotation: {
      preview_url: STATE.preview.url,
      canvas: { w: canvas.width, h: canvas.height },
      strokes: STATE.preview.strokes,
      created_at: new Date().toISOString(),
    },
  };
  try {
    const res = await fetch(`/api/tasks/${taskId}/fix`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`fix submit ${res.status}`);
    const child = await res.json();
    pushStream({ kind: 'system', body: `fix dispatched → ${child.id}` });
    $('annotate-comment').value = '';
    STATE.preview.strokes = [];
    stopAnnotate();
  } catch (e) {
    pushStream({ kind: 'error', body: `fix submit failed: ${e}` });
  }
}

// -----------------------------------------------------------------------------
// 6 · Composer (task submission)
// -----------------------------------------------------------------------------

function initComposer() {
  // Autonomy segmented control
  document.querySelectorAll('#opt-autonomy button').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#opt-autonomy button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      STATE.composer.autonomy = btn.dataset.value;
    });
  });

  // Time budget slider
  const slider = $('opt-budget');
  slider.addEventListener('input', () => {
    STATE.composer.budget = Number(slider.value);
    $('opt-budget-readout').textContent = formatBudget(STATE.composer.budget);
  });
  $('opt-budget-readout').textContent = formatBudget(Number(slider.value));

  // Engine select
  $('opt-engine').addEventListener('change', (e) => {
    STATE.composer.engine = e.target.value;
  });

  // Composer submit
  $('composer').addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = $('composer-input').value.trim();
    if (!text) return;
    const submit = $('composer-submit');
    submit.disabled = true;
    try {
      const payload = {
        prompt: text,
        autonomy: STATE.composer.autonomy,
        time_budget_min: STATE.composer.budget,
      };
      if (STATE.composer.engine) payload.cognitive_engine = STATE.composer.engine;
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      $('composer-input').value = '';
    } catch (err) {
      pushStream({ kind: 'error', body: `submit failed: ${err}` });
    } finally {
      submit.disabled = false;
    }
  });

  // Keyboard: cmd/ctrl+enter to submit
  $('composer-input').addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      $('composer').requestSubmit();
    }
  });
}

function populateEngineSelect() {
  const sel = $('opt-engine');
  sel.innerHTML = '';
  sel.appendChild(el('option', { value: '' }, 'AUTO'));
  for (const eng of STATE.engines) {
    sel.appendChild(el('option', { value: eng.id }, eng.label));
  }
}

function formatBudget(m) {
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const r = m - h * 60;
  return r === 0 ? `${h}h` : `${h}h${r}`;
}

// -----------------------------------------------------------------------------
// 7 · Confirmation / question banners
// -----------------------------------------------------------------------------

function showConfirmBanner(task) {
  const d = task.deliverable || {};
  STATE.pending = { kind: 'confirm', taskId: task.id };
  showPendingBanner({
    title: 'DELIVERABLE READY · CONFIRM OR FIX',
    body: [
      d.summary || '(no summary)',
      d.deliverable ? `\nDeliverable: ${d.deliverable}` : '',
      d.preview_url ? `\nPreview: ${d.preview_url}` : '',
      (d.next_actions || []).length ? `\nNext: ${d.next_actions.join(' · ')}` : '',
    ].join(''),
    inputs: [{ id: 'pb-fix-comment', placeholder: 'optional refinement notes (used if you choose FIX)…' }],
    actions: [
      { label: 'SHIP', primary: true, onclick: () => decide(task.id, 'ship') },
      { label: 'FIX', onclick: () => decide(task.id, 'fix', $('pb-fix-comment')?.value || '') },
    ],
  });
}

function showQuestionBanner(task) {
  const q = task.pending_question || {};
  STATE.pending = { kind: 'question', taskId: task.id };
  showPendingBanner({
    title: 'AGENT REQUESTS INPUT',
    body: q.question || '',
    inputs: [{ id: 'pb-answer', placeholder: 'type your answer…' }],
    actions: [
      ...((q.options || []).map(o => ({
        label: o.toUpperCase(),
        onclick: () => answer(task.id, o),
      }))),
      { label: 'SEND', primary: true, onclick: () => answer(task.id, $('pb-answer')?.value || '') },
    ],
  });
}

function showToolConfirmBanner(task) {
  const c = task.pending_confirmation || {};
  STATE.pending = { kind: 'tool_confirm', taskId: task.id };
  showPendingBanner({
    title: `CONFIRM TOOL · ${c.tool}`,
    body: `args: ${JSON.stringify(c.args || {}, null, 2)}`,
    actions: [
      { label: 'APPROVE', primary: true, onclick: () => decide(task.id, 'approve') },
      { label: 'DECLINE', onclick: () => decide(task.id, 'decline') },
    ],
  });
}

function showPendingBanner({ title, body, inputs = [], actions = [] }) {
  const banner = $('pending-banner');
  banner.classList.remove('hidden');
  banner.innerHTML = '';
  banner.appendChild(el('div', { class: 'pb-title' }, title));
  banner.appendChild(el('div', { class: 'pb-body' }, body));
  const inputsRow = el('div', { class: 'pb-actions' });
  inputs.forEach(i => inputsRow.appendChild(el('input', { id: i.id, class: 'pb-input', placeholder: i.placeholder || '' })));
  banner.appendChild(inputsRow);
  const actionsRow = el('div', { class: 'pb-actions' });
  actions.forEach(a => {
    const btn = el('button', { class: `ctrl ${a.primary ? 'ctrl-primary' : ''}`, onclick: a.onclick }, a.label);
    actionsRow.appendChild(btn);
  });
  banner.appendChild(actionsRow);
}

function hidePendingBanner() {
  $('pending-banner').classList.add('hidden');
  STATE.pending = null;
}

async function decide(taskId, decision, comment) {
  try {
    const res = await fetch(`/api/tasks/${taskId}/confirm`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ decision, comment: comment || null }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    hidePendingBanner();
  } catch (e) {
    pushStream({ kind: 'error', body: `decision failed: ${e}` });
  }
}

async function answer(taskId, ans) {
  try {
    const res = await fetch(`/api/tasks/${taskId}/answer`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ answer: ans }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    hidePendingBanner();
  } catch (e) {
    pushStream({ kind: 'error', body: `answer failed: ${e}` });
  }
}

function onConfirmationRequest({ task_id, tool, args }) {
  // Show a modal too (more attention-grabbing for irreversible actions)
  STATE.modal = {
    title: `CONFIRM TOOL · ${tool}`,
    body: JSON.stringify(args, null, 2),
    actions: [
      { label: 'APPROVE', primary: true, onclick: () => { decide(task_id, 'approve'); hideModal(); } },
      { label: 'DECLINE', onclick: () => { decide(task_id, 'decline'); hideModal(); } },
    ],
  };
  showModal();
}

function showModal() {
  if (!STATE.modal) return;
  $('modal').classList.remove('hidden');
  $('modal-title').textContent = STATE.modal.title;
  $('modal-body').textContent = STATE.modal.body;
  const acts = $('modal-actions');
  acts.innerHTML = '';
  STATE.modal.actions.forEach(a => {
    acts.appendChild(el('button', { class: `ctrl ${a.primary ? 'ctrl-primary' : ''}`, onclick: a.onclick }, a.label));
  });
}
function hideModal() { $('modal').classList.add('hidden'); STATE.modal = null; }

// -----------------------------------------------------------------------------
// 8 · Self-improvement toggle
// -----------------------------------------------------------------------------

function initSelfImprove() {
  $('btn-self-improve').addEventListener('click', async () => {
    const enabled = !STATE.selfImprovement;
    try {
      await fetch('/api/self-improvement', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
    } catch (e) {
      pushStream({ kind: 'error', body: `self-improvement toggle failed: ${e}` });
    }
  });
}

function renderSelfImprove() {
  const btn = $('btn-self-improve');
  if (STATE.selfImprovement) btn.classList.add('active');
  else btn.classList.remove('active');
}

// -----------------------------------------------------------------------------
// 8b · Kill switch (HALT / RESUME)
// -----------------------------------------------------------------------------

function initHalt() {
  $('btn-halt').addEventListener('click', () => {
    if (STATE.halted) doResume();
    else doHalt();
  });
  $('btn-resume-inline').addEventListener('click', doResume);
  // Keyboard shortcut: cmd/ctrl+. for fast halt
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === '.') {
      e.preventDefault();
      if (!STATE.halted) doHalt();
    }
  });
}

async function doHalt() {
  try {
    await fetch('/api/halt', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reason: 'ui_kill_switch' }),
    });
  } catch (e) {
    pushStream({ kind: 'error', body: `halt failed: ${e}` });
  }
}

async function doResume() {
  try {
    await fetch('/api/resume', { method: 'POST' });
  } catch (e) {
    pushStream({ kind: 'error', body: `resume failed: ${e}` });
  }
}

function renderHalted() {
  const btn = $('btn-halt');
  const label = $('btn-halt-label');
  const strip = $('halted-strip');
  if (STATE.halted) {
    btn.classList.add('is-halted');
    label.textContent = 'RESUME';
    strip.classList.remove('hidden');
    setStatus('HALTED', 'crimson');
  } else {
    btn.classList.remove('is-halted');
    label.textContent = 'HALT';
    strip.classList.add('hidden');
  }
}

// -----------------------------------------------------------------------------
// 9 · Metrics + sparkline
// -----------------------------------------------------------------------------

let metricsTimer = null;
function scheduleMetricsRefresh() {
  if (metricsTimer) return;
  metricsTimer = setTimeout(() => {
    metricsTimer = null;
    fetchMetrics();
  }, 500);
}

async function fetchMetrics() {
  try {
    const res = await fetch('/api/metrics');
    if (!res.ok) return;
    const data = await res.json();
    STATE.metrics = data.daily;
    STATE.live = data.live;
    renderMetrics();
  } catch {}
}

function renderMetrics() {
  const d = STATE.metrics; const l = STATE.live;
  if (!d) return;
  const grid = $('metrics-grid');
  grid.innerHTML = '';
  const tile = (label, value, sub = '', tip = '') => {
    const t = el('div', { class: 'metric-tile', title: tip });
    t.appendChild(el('div', { class: 'mt-label' }, label));
    t.appendChild(el('div', { class: 'mt-value' }, value));
    if (sub) t.appendChild(el('div', { class: 'mt-sub' }, sub));
    return t;
  };
  const p = d.potentials || {};
  grid.appendChild(tile(
    'ACTIONS LEFT',
    `${p.remaining}/${p.total}`,
    `${Math.round((1 - (p.fraction || 0)) * 100)}% remaining today`,
    'Daily budget of tool invocations. Each LLM call + tool call burns one "action potential". Resets at UTC midnight. Soft governor; not a hard cap.'
  ));
  grid.appendChild(tile(
    'TOOL CALLS',
    `${d.tool_calls}`,
    `${l?.tool_calls_per_min ?? 0}/min`,
    'Total tool invocations today and live rate per minute.'
  ));
  grid.appendChild(tile(
    'TOKENS IN',
    formatN(d.tokens?.in || 0),
    `${l?.tokens_in_per_min ?? 0}/min`,
    'Prompt + context tokens sent to the LLM today (estimate when provider does not report).'
  ));
  grid.appendChild(tile(
    'TOKENS OUT',
    formatN(d.tokens?.out || 0),
    `${l?.tokens_out_per_min ?? 0}/min`,
    'Tokens generated by the LLM today.'
  ));
  grid.appendChild(tile(
    'TASKS DONE',
    `${d.tasks?.completed || 0}`,
    `${d.tasks?.failed || 0} failed · ${d.tasks?.cancelled || 0} cancelled`,
    'Tasks that reached SUCCEEDED status today.'
  ));
  grid.appendChild(tile(
    'TASK TIME',
    `${secsToHM(d.wall_seconds)}`,
    `${d.error_count || 0} tool errors`,
    'Total wall-clock time the agent has spent processing tasks today.'
  ));

  drawSparkline(l?.tool_calls_series || []);
  const foot = $('metric-foot');
  foot.innerHTML = '';
  foot.appendChild(el('span', null, d.day || ''));
  foot.appendChild(el('span', null, `errors ${d.error_count || 0}`));

  // Update budget bars if active task
  const t = STATE.activeTaskId ? STATE.tasks[STATE.activeTaskId] : null;
  if (t && t.started_at && t.status === 'RUNNING') {
    const elapsed = (Date.now() / 1000) - t.started_at;
    const frac = Math.min(1, elapsed / (t.time_budget_min * 60));
    setBar('bar-time', frac);
  }
}

function setBar(id, frac) {
  const bar = $(id);
  if (!bar) return;
  const pct = Math.max(0, Math.min(100, frac * 100));
  bar.style.right = `${100 - pct}%`;
  bar.classList.remove('warn', 'crit');
  if (frac > 0.85) bar.classList.add('crit');
  else if (frac > 0.6) bar.classList.add('warn');
}

function formatN(n) {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return (n / 1000).toFixed(1) + 'k';
  return (n / 1_000_000).toFixed(2) + 'M';
}

function secsToHM(s) {
  if (!s) return '0s';
  if (s < 60) return `${Math.round(s)}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  return `${(s / 3600).toFixed(1)}h`;
}

function drawSparkline(points) {
  const root = $('sparkline');
  root.innerHTML = '';
  if (!points.length) return;
  const w = root.clientWidth || 320;
  const h = root.clientHeight || 56;
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  // Bucketize by 5s for the last 300s
  const NOW = Date.now() / 1000;
  const BUCKETS = 60;
  const span = 300;
  const buckets = new Array(BUCKETS).fill(0);
  points.forEach(p => {
    const ago = NOW - p.t;
    if (ago < 0 || ago > span) return;
    const idx = Math.min(BUCKETS - 1, Math.floor((span - ago) / (span / BUCKETS)));
    buckets[idx] += p.v;
  });
  const max = Math.max(1, ...buckets);
  const stepX = w / (BUCKETS - 1);
  let d = '';
  for (let i = 0; i < BUCKETS; i++) {
    const x = i * stepX;
    const y = h - (buckets[i] / max) * (h - 6) - 3;
    d += (i === 0 ? 'M' : 'L') + x.toFixed(1) + ' ' + y.toFixed(1) + ' ';
  }
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', d);
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'var(--phosphor)');
  path.setAttribute('stroke-width', '1.5');
  svg.appendChild(path);
  // Baseline
  const base = document.createElementNS(ns, 'line');
  base.setAttribute('x1', 0); base.setAttribute('x2', w);
  base.setAttribute('y1', h - 1); base.setAttribute('y2', h - 1);
  base.setAttribute('stroke', 'rgba(140,240,200,0.15)');
  svg.appendChild(base);
  root.appendChild(svg);
}

// -----------------------------------------------------------------------------
// 10 · Tools palette
// -----------------------------------------------------------------------------

async function fetchTools() {
  try {
    const res = await fetch('/api/tools');
    if (!res.ok) return;
    const data = await res.json();
    STATE.tools = data.tools || [];
    renderTools();
  } catch {}
}

function renderTools() {
  const list = $('tools-list');
  list.innerHTML = '';
  for (const t of STATE.tools) {
    const row = el('div', { class: 'tool-row', title: 'Click to inspect · ' + (t.description || '') },
      el('div', { class: 't-cat' }, t.category || ''),
      el('div', { class: 't-name' }, t.name),
      el('div', { class: 't-desc' }, (t.description || '').slice(0, 200)),
    );
    row.addEventListener('click', () => openToolDrawer(t.name));
    list.appendChild(row);
  }
  $('tools-count').textContent = STATE.tools.length;
}

// ---- Plan timeline --------------------------------------------------------
function renderPlan() {
  const panel = $('plan-panel');
  if (!panel) return;
  if (!STATE.plan) { panel.classList.add('hidden'); return; }
  panel.classList.remove('hidden');
  const plan = STATE.plan;
  $('plan-ambition').textContent = (plan.ambition || '').toUpperCase();
  $('plan-meta').textContent =
    `${plan.phases.length} phase${plan.phases.length === 1 ? '' : 's'} · ` +
    `${(plan.total_minutes || 0).toFixed(1)}m planned`;
  $('plan-brief').textContent =
    (plan.creative_brief || '').trim() +
    (plan.novel_constraints?.length
      ? '\n\nnovel constraints:\n  • ' + plan.novel_constraints.join('\n  • ')
      : '') +
    (plan.references?.length
      ? '\n\nreferences:\n  • ' + plan.references.join('\n  • ')
      : '');
  const phases = $('plan-phases');
  phases.innerHTML = '';
  plan.phases.forEach((p, i) => {
    phases.appendChild(el(
      'div',
      { class: 'plan-phase ' + (p.status || 'pending'), title: p.goal || '' },
      el('div', { class: 'idx' }, String(i + 1).padStart(2, '0')),
      el('div', { class: 'title' }, p.title || p.id),
      el('div', { class: 'engine' }, p.engine || ''),
      el('div', { class: 'time' }, `${(p.time_minutes || 0).toFixed(1)}m`),
    ));
  });
}

// ---- Desk + unified cockpit ----------------------------------------------
function refreshUnifiedPanels() {
  syncFusedEmbeds();
  syncDesktopIframe();
  if (STATE.activeTaskId) {
    fetchWorkspaceTree();
    startVmStream();
  }
}

/** Keep full Webtop iframe in sync with STATE.desktop URLs. */
function syncDesktopIframe() {
  const ifr = $('desktop-iframe');
  if (!ifr) return;
  const url = STATE.desktop?.http || STATE.desktop?.https || '';
  if (url) {
    ifr.removeAttribute('srcdoc');
    if (ifr.src !== url) ifr.src = url;
  } else {
    ifr.removeAttribute('src');
    ifr.srcdoc = '<body style="margin:0;background:#0a0c10;color:#8a9ba8;font:14px system-ui;display:flex;align-items:center;justify-content:center;height:100vh;text-align:center;padding:24px;">Enable <code style="color:#c8f5c4">AGENT_O_SANDBOX_DESKTOP=1</code> in <code>.env</code>, restart the server, and start a task. The first pull of the desktop image is large (~several GB).</body>';
  }
}

function initDesk() {
  $('btn-tree-refresh')?.addEventListener('click', fetchWorkspaceTree);
}

let vmEventSource = null;

function stopVmStream() {
  if (vmEventSource) {
    vmEventSource.close();
    vmEventSource = null;
  }
}

function startVmStream() {
  stopVmStream();
  const pre = $('vm-console');
  const meta = $('vm-meta');
  const stats = $('vm-stats');
  if (!pre) return;
  if (!STATE.activeTaskId) {
    if (meta) meta.textContent = '—';
    if (stats) stats.textContent = '';
    pre.textContent = 'No active task — dispatch a task to stream sandbox output here.';
    return;
  }
  pre.textContent = 'Connecting…\n';
  if (meta) meta.textContent = '';
  if (stats) stats.textContent = '';
  const tid = encodeURIComponent(STATE.activeTaskId);
  const es = new EventSource(`/api/workspace/${tid}/vm-stream`);
  vmEventSource = es;
  es.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      if (msg.type === 'meta') {
        if (meta) {
          meta.textContent =
            `${msg.container || '—'} · ${msg.sandbox_mode || '—'} · ${msg.feed || ''}`;
        }
      } else if (msg.type === 'snapshot' || msg.type === 'chunk') {
        if (msg.text) {
          pre.textContent += msg.text;
          pre.scrollTop = pre.scrollHeight;
        }
      } else if (msg.type === 'stats') {
        if (stats && msg.line) stats.textContent = `DOCKER STATS (no-stream) · ${msg.line}`;
      } else if (msg.type === 'ps' && msg.text) {
        pre.textContent += `\n\n―――― PROC SNAPSHOT (docker exec ps aux) ――――\n${msg.text}\n`;
        pre.scrollTop = pre.scrollHeight;
      }
    } catch (_) { /* ignore bad frames */ }
  };
  es.onerror = () => {
    pre.textContent += '\n[vm stream disconnected — scroll up and the stream will reconnect on the next task, or reload the page]\n';
    stopVmStream();
  };
}

function initVm() {
  $('btn-vm-clear')?.addEventListener('click', () => {
    const pre = $('vm-console');
    if (pre) pre.textContent = '';
  });
}

function syncDesktopLinks() {
  const aHttp = $('btn-desktop-open-http');
  const aHttps = $('btn-desktop-open-https');
  if (aHttp) {
    aHttp.href = STATE.desktop?.http || '#';
    aHttp.classList.toggle('hidden', !STATE.desktop?.http);
  }
  if (aHttps) {
    aHttps.href = STATE.desktop?.https || '#';
    aHttps.classList.toggle('hidden', !STATE.desktop?.https);
  }
}

function initDesktopChrome() {
  $('btn-desktop-reload')?.addEventListener('click', () => {
    const ifr = $('desktop-iframe');
    if (ifr) {
      const s = ifr.src;
      ifr.src = '';
      ifr.src = s;
    }
  });
}

function switchView(view) {
  STATE.view = view;
  if (view === 'preview' && STATE.preview?.url) {
    const exp = $('preview-expanded');
    if (exp) {
      exp.classList.remove('hidden');
      $('preview-iframe-main').src = STATE.preview.url;
      STATE.previewExpanded = true;
      exp.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  } else if (view === 'stream') {
    $('preview-expanded')?.classList.add('hidden');
    STATE.previewExpanded = false;
  } else {
    refreshUnifiedPanels();
  }
}

async function fetchWorkspaceTree() {
  if (!STATE.activeTaskId) {
    $('desk-tree-body').innerHTML = '<div class="muted">no task selected</div>';
    return;
  }
  try {
    const r = await fetch(`/api/workspace/${encodeURIComponent(STATE.activeTaskId)}/tree`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    STATE.desk.tree = data.entries || [];
    renderTree();
  } catch (e) {
    $('desk-tree-body').innerHTML =
      `<div class="muted">tree unavailable · ${e.message || e}</div>`;
  }
}

function renderTree() {
  const body = $('desk-tree-body');
  body.innerHTML = '';
  const entries = STATE.desk.tree;
  if (!entries.length) {
    body.innerHTML = '<div class="muted">(empty workspace)</div>';
    return;
  }
  // Files we've seen edited recently get a recent badge.
  const recent = new Set(STATE.desk.diffs.slice(0, 12).map(d => d.path));
  for (const e of entries) {
    const depth = e.path.split('/').length - 1;
    const name = e.path.split('/').pop() + (e.is_dir ? '/' : '');
    const cls = ['tree-node'];
    if (e.is_dir) cls.push('dir');
    if (recent.has(e.path)) cls.push('recent');
    if (STATE.desk.selectedPath === e.path) cls.push('selected');
    const row = el('div', { class: cls.join(' ') },
      el('span', { class: 'tree-indent', style: `padding-left:${depth * 10}px` }),
      name,
    );
    if (!e.is_dir) row.addEventListener('click', () => openWorkspaceFile(e.path));
    body.appendChild(row);
  }
}

async function openWorkspaceFile(path) {
  if (!STATE.activeTaskId) return;
  STATE.desk.selectedPath = path;
  renderTree();
  $('desk-file-path').textContent = path;
  $('desk-file-body').textContent = 'loading…';
  try {
    const r = await fetch(
      `/api/workspace/${encodeURIComponent(STATE.activeTaskId)}/file?path=${encodeURIComponent(path)}`
    );
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    $('desk-file-meta').textContent =
      `${data.size} bytes${data.is_binary ? ' · binary' : ''}` +
      (data.truncated ? ' · truncated' : '');
    $('desk-file-body').textContent = data.is_binary
      ? '(binary file)'
      : (data.content || '(empty)');
  } catch (e) {
    $('desk-file-body').textContent = `error: ${e.message || e}`;
  }
}

function onWorkspaceDiff(data) {
  // Maintain a ring buffer of recent diffs.
  STATE.desk.diffs.unshift(data);
  if (STATE.desk.diffs.length > 60) STATE.desk.diffs.length = 60;

  // If desk is visible, surface the diff in the feed AND refresh tree/file.
  renderDeskFeedAppend(data);
  if (STATE.activeTaskId && data.task_id === STATE.activeTaskId) {
    fetchWorkspaceTree();
    if (STATE.desk.selectedPath === data.path) {
      openWorkspaceFile(data.path);
    }
  }
}

function renderDeskFeedAppend(data) {
  const feed = $('desk-feed-body');
  if (!feed) return;
  const card = el('div', { class: 'diff-card ' + (data.is_new ? 'create' : 'update') });
  const head = el('div', { class: 'diff-head' },
    el('span', { class: 'op' }, data.op || 'edit'),
    el('span', {}, data.path),
  );
  card.appendChild(head);
  const colored = colorizeDiff(data.diff || '(no diff)');
  const body = el('div', { class: 'diff-body' });
  body.innerHTML = colored;
  card.appendChild(body);
  feed.prepend(card);
  // cap to 30 cards rendered
  while (feed.children.length > 30) feed.removeChild(feed.lastChild);
}

function colorizeDiff(text) {
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return esc(text).split('\n').map(line => {
    if (line.startsWith('+++') || line.startsWith('---')) return `<span class="hunk">${line}</span>`;
    if (line.startsWith('@@')) return `<span class="hunk">${line}</span>`;
    if (line.startsWith('+')) return `<span class="add">${line}</span>`;
    if (line.startsWith('-')) return `<span class="rem">${line}</span>`;
    return `<span class="ctx">${line}</span>`;
  }).join('\n');
}

function initPlanToggle() {
  const btn = $('btn-plan-toggle');
  if (!btn) return;
  btn.addEventListener('click', () => {
    $('plan-brief').classList.toggle('collapsed');
    btn.textContent = $('plan-brief').classList.contains('collapsed') ? '▸' : '▾';
  });
}

// ---- Expanded preview (side button delegates to view tab) ----------------
function initPreviewExpand() {
  const btn = $('btn-preview-expand');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const exp = $('preview-expanded');
    if (!exp || !STATE.preview?.url) {
      pushStream({ kind: 'system', body: 'no preview URL yet — run preview_start first.' });
      return;
    }
    exp.classList.toggle('hidden');
    if (!exp.classList.contains('hidden')) {
      $('preview-iframe-main').src = STATE.preview.url;
      STATE.previewExpanded = true;
      exp.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } else {
      STATE.previewExpanded = false;
    }
  });
}

// Patch into onPreviewURL so the main iframe also updates if expanded.
function syncExpandedPreview() {
  const exp = $('preview-expanded');
  if (exp && STATE.preview?.url && !exp.classList.contains('hidden')) {
    $('preview-iframe-main').src = STATE.preview.url;
  }
}

// ---- Tool inspect drawer --------------------------------------------------
async function openToolDrawer(name) {
  const drawer = $('tool-drawer');
  $('tool-drawer-title').textContent = name;
  $('tool-drawer-sub').textContent = 'loading…';
  $('tool-drawer-body').innerHTML = '';
  drawer.classList.remove('hidden');
  try {
    const r = await fetch(`/api/tools/${encodeURIComponent(name)}/inspect`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    renderToolDrawer(data);
  } catch (e) {
    $('tool-drawer-sub').textContent = 'error loading inspection';
    $('tool-drawer-body').textContent = String(e);
  }
}

function renderToolDrawer(data) {
  $('tool-drawer-sub').textContent =
    `${data.category} · ${data.kind}` +
    (data.source_path ? ` · ${data.source_path}` : '');
  const body = $('tool-drawer-body');
  body.innerHTML = '';

  body.appendChild(el('h4', {}, 'DESCRIPTION'));
  body.appendChild(el('div', {}, data.description || '(no description)'));

  body.appendChild(el('h4', {}, 'PARAMETERS'));
  const pre = el('pre', {}, JSON.stringify(data.parameters || {}, null, 2));
  body.appendChild(pre);

  if (data.data) {
    if (data.data.records) {
      body.appendChild(el('h4', {}, `MEMORIES (${data.data.count})`));
      if (data.data.records.length === 0) {
        body.appendChild(el('div', { class: 'muted' }, '(no memories yet)'));
      }
      for (const r of data.data.records) {
        const rec = el('div', { class: 'mem-rec' });
        rec.appendChild(el('div', {}, [
          el('span', { class: 'k' }, `[${r.namespace}::${r.key}]`),
        ]));
        rec.appendChild(el('div', { class: 'v' }, r.value || ''));
        const ts = new Date((r.ts || 0) * 1000).toLocaleString();
        rec.appendChild(el('div', { class: 'meta' },
          `${ts}${r.task_id ? ' · task ' + r.task_id.slice(0, 8) : ''}` +
          (r.tags?.length ? ' · ' + r.tags.join(',') : '')));
        body.appendChild(rec);
      }
    } else {
      body.appendChild(el('h4', {}, 'TOOL DATA'));
      body.appendChild(el('pre', {}, JSON.stringify(data.data, null, 2)));
    }
  }

  if (data.source) {
    body.appendChild(el('h4', {},
      data.kind === 'synthesized' ? 'SOURCE (synthesized)' : 'DEFINING MODULE'));
    body.appendChild(el('pre', {}, data.source));
  }
}

function initToolDrawer() {
  $('tool-drawer-close')?.addEventListener('click', () => {
    $('tool-drawer').classList.add('hidden');
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') $('tool-drawer').classList.add('hidden');
  });
}

// -----------------------------------------------------------------------------
// 11 · Clock + periodic refreshers
// -----------------------------------------------------------------------------

function startClock() {
  const tick = () => {
    if (STATE.wsReady) {
      const d = new Date();
      setStatus(`live · ${d.toLocaleTimeString([], { hour12: false })}`, 'phosphor');
    }
    // Tick the sandbox progress timer if a build is running.
    if (STATE.sandbox?.active && STATE.sandbox.startedAt) {
      const elapsed = Math.floor((Date.now() - STATE.sandbox.startedAt) / 1000);
      const elTime = document.getElementById('sb-progress-elapsed');
      if (elTime) elTime.textContent = `${elapsed}s elapsed`;
    }
  };
  tick();
  setInterval(tick, 1000);
  setInterval(fetchMetrics, 5000);
}

// -----------------------------------------------------------------------------
// 13 · Sandbox progress banner
// -----------------------------------------------------------------------------

function showSandboxProgress({ title, subtitle }) {
  STATE.sandbox = { active: true, startedAt: Date.now() };
  let banner = document.getElementById('sandbox-progress');
  if (!banner) {
    banner = el('div', { id: 'sandbox-progress', class: 'sandbox-progress' });
    document.querySelector('.center').insertBefore(
      banner, document.querySelector('.stream-wrap')
    );
  }
  banner.innerHTML = '';
  banner.appendChild(el('div', { class: 'sb-progress-head' },
    el('span', { class: 'sb-progress-spinner' }),
    el('span', { class: 'sb-progress-title' }, title),
    el('span', { id: 'sb-progress-elapsed', class: 'sb-progress-elapsed' }, '0s elapsed'),
  ));
  banner.appendChild(el('div', { class: 'sb-progress-sub' }, subtitle || ''));
  banner.appendChild(el('div', { id: 'sb-progress-line', class: 'sb-progress-line' }, ''));
}

function updateSandboxProgress({ elapsed, lastLine, subtitle, done } = {}) {
  if (!STATE.sandbox?.active) return;
  if (typeof elapsed === 'number') {
    const t = document.getElementById('sb-progress-elapsed');
    if (t) t.textContent = `${elapsed}s elapsed`;
  }
  if (lastLine) {
    const ln = document.getElementById('sb-progress-line');
    if (ln) ln.textContent = lastLine;
  }
  if (subtitle) {
    const banner = document.getElementById('sandbox-progress');
    const sub = banner?.querySelector('.sb-progress-sub');
    if (sub) sub.textContent = subtitle;
  }
  if (done) {
    // image build complete — keep banner up briefly to show success state
    const title = document.querySelector('#sandbox-progress .sb-progress-title');
    if (title) title.textContent = 'SANDBOX IMAGE READY';
    document.querySelector('#sandbox-progress .sb-progress-spinner')?.classList.add('done');
    setTimeout(hideSandboxProgress, 1500);
  }
}

function hideSandboxProgress() {
  STATE.sandbox = { active: false };
  const banner = document.getElementById('sandbox-progress');
  if (banner) banner.remove();
}

// LLM "thinking" indicator (between request and response)
function onLLMRequest(data) {
  STATE.thinking = {
    provider: data.provider,
    model: data.model,
    keyTail: data.key_tail,
    attempt: data.attempt,
    startedAt: Date.now(),
  };
  renderThinking();
}
function onLLMResponse(data) {
  const ok = data.ok !== false;
  if (STATE.thinking && ok) {
    pushStream({
      kind: 'system',
      body: `llm · ${data.provider} · ${data.model} · ${data.latency_ms}ms · ` +
            `${data.tokens_in}→${data.tokens_out} tok · ${data.tool_calls} tool call${data.tool_calls === 1 ? '' : 's'}`,
    });
  } else if (STATE.thinking && !ok) {
    const err = (data.error && String(data.error).trim()) || '(error)';
    pushStream({
      kind: 'system',
      body: `llm failed · ${data.provider} · ${data.model} · ${data.latency_ms}ms · ${err.slice(0, 220)}`,
    });
  }
  STATE.thinking = null;
  renderThinking();
}
function renderThinking() {
  let ind = document.getElementById('thinking-indicator');
  if (!STATE.thinking) { ind?.remove(); return; }
  if (!ind) {
    ind = el('div', { id: 'thinking-indicator', class: 'thinking-indicator' });
    document.querySelector('.center-head .engine-indicator')?.after(ind);
  }
  ind.title = 'Wall time for this HTTP request. Key tail = last 6 chars of API key (masked).';
  ind.innerHTML = '';
  ind.appendChild(el('span', { class: 'th-dot' }));
  ind.appendChild(el('span', { class: 'th-text' },
    `THINKING · ${STATE.thinking.provider} · ${STATE.thinking.keyTail}`,
  ));
  ind.appendChild(el('span', { id: 'th-elapsed', class: 'th-elapsed' }, '0.0s'));
}
// Heartbeat for elapsed counter
setInterval(() => {
  if (!STATE.thinking) return;
  const el2 = document.getElementById('th-elapsed');
  if (el2) {
    const dt = (Date.now() - STATE.thinking.startedAt) / 1000;
    el2.textContent = `${dt.toFixed(1)}s`;
  }
}, 100);

async function fetchHealth() {
  try {
    const res = await fetch('/api/health');
    if (!res.ok) return;
    const h = await res.json();
    STATE.health = h;
    $('status-provider').textContent = `PROVIDER ${h.provider || '—'} · ${h.model || '—'}`;
    const prec = (h.provider_precedence || []).join(' → ');
    const oll = (h.ollama_model_chain || []).join(' → ');
    const ar = Number(h.auto_resume_stalled_sec) > 0
      ? `auto-resume ${h.auto_resume_stalled_sec}s · max ${h.auto_resume_max_per_tick}/tick`
      : 'auto-resume off';
    const gr = (h.guardian_relax_prefixes || '').trim() || '(default relax)';
    $('status-provider').title = [
      prec && `precedence: ${prec}`,
      oll && `Ollama: ${oll}`,
      `recovery fails≤${h.recovery_tool_fails} · LLM retries ${h.recovery_llm_retries}`,
      ar,
      `guardian relax: ${gr}`,
    ].filter(Boolean).join('\n');
    $('status-tools').textContent = `TOOLS ${h.tool_count}`;
  } catch {}
}

// -----------------------------------------------------------------------------
// 12 · Boot
// -----------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
  initComposer();
  initAnnotation();
  initSelfImprove();
  initHalt();
  initPlanToggle();
  initPreviewExpand();
  initToolDrawer();
  initDesk();
  initVm();
  initDesktopChrome();
  initResumeStalled();
  $('btn-new-task')?.addEventListener('click', () => { resetUiForNewTask(); });
  startClock();
  fetchHealth();
  connectWS();
  setInterval(fetchHealth, 45000);
});
