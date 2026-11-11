import api from './data.js?v=3';
import { L, DEFAULT_PROCS, MED_KEYS } from './i18n.js?v=3';

/* ---------- basics ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let lang = (() => { try { return localStorage.getItem('lang') || 'ar'; } catch { return 'ar'; } })();
const t = k => L[lang][k] ?? k;
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayStr = () => ymd(new Date());
const addDays = (s, n) => { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return ymd(d); };
const dayName = s => new Date(s + 'T12:00:00').toLocaleDateString(lang === 'ar' ? 'ar-IQ' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'short' });
const fmtDate = s => s ? new Date(s + 'T12:00:00').toLocaleDateString(lang === 'ar' ? 'ar-IQ' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : t('none');
const money = (n, cur) => {
  const v = Number(n) || 0;
  return cur === 'USD' ? `$${v.toLocaleString('en-US')}` : `${v.toLocaleString('en-US')} ${t('iqd')}`;
};
const ageOf = y => y ? (new Date().getFullYear() - Number(y)) : '';
const procName = p => p ? (p[lang] || p.ar || p.en) : '';
const waLink = ph => {
  let d = String(ph || '').replace(/\D/g, '');
  if (d.startsWith('0')) d = '964' + d.slice(1);
  else if (d.length === 10 && d.startsWith('7')) d = '964' + d;
  return 'https://wa.me/' + d;
};

function toast(msg) {
  const el = $('#toast'); el.textContent = msg; el.classList.remove('hidden');
  clearTimeout(toast._t); toast._t = setTimeout(() => el.classList.add('hidden'), 2200);
}
function modal(html, onMount) {
  $('#modal-box').innerHTML = html; $('#modal').classList.remove('hidden');
  onMount && onMount($('#modal-box'));
}
function closeModal() { $('#modal').classList.add('hidden'); $('#modal-box').innerHTML = ''; }
$('#modal').addEventListener('mousedown', e => { if (e.target.id === 'modal') closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
async function guard(fn) {
  try { return await fn(); }
  catch (e) { console.error(e); toast((lang === 'ar' ? 'خطأ: ' : 'Error: ') + (e.code || e.message)); }
}

/* ---------- state ---------- */
const S = { user: null, patients: [], settings: null, view: 'day', date: todayStr() };
async function loadPatients() { S.patients = (await api.list('patients')).sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ar')); }
async function loadSettings() {
  S.settings = (await api.get('settings', 'clinic')) || {};
  if (!S.settings.procedures?.length) S.settings.procedures = DEFAULT_PROCS;
  S.settings.startHour ??= 14; S.settings.endHour ??= 23; S.settings.rate ??= 1520;
}
const patientById = id => S.patients.find(p => p.id === id);
function balances(treatments, payments) {
  const b = { IQD: 0, USD: 0 }, cost = { IQD: 0, USD: 0 }, paid = { IQD: 0, USD: 0 };
  treatments.filter(x => x.status === 'done').forEach(x => { cost[x.cur || 'IQD'] += Number(x.price) || 0; });
  payments.forEach(x => { paid[x.cur || 'IQD'] += Number(x.amount) || 0; });
  b.IQD = cost.IQD - paid.IQD; b.USD = cost.USD - paid.USD;
  return { b, cost, paid };
}
const balHtml = b => {
  const parts = [];
  ['USD', 'IQD'].forEach(c => { if (b[c]) parts.push(`<span class="money ${b[c] > 0 ? 'owe' : 'ok'} ltr">${money(b[c], c)}</span>`); });
  return parts.join(' · ') || '<span class="muted">0</span>';
};

/* ---------- shell ---------- */
const NAV = [['today', '🏠'], ['appointments', '📅'], ['patients', '👥'], ['settings', '⚙️']];
function applyLang() {
  document.documentElement.lang = lang; document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  document.title = `${t('appName')} — ${t('clinic')}`;
}
function shell(active, inner) {
  const nav = NAV.map(([k, i]) => `<a href="#/${k}" class="${active === k ? 'on' : ''}">${i} ${t(k)}</a>`).join('');
  const mnav = NAV.map(([k, i]) => `<a href="#/${k}" class="${active === k ? 'on' : ''}"><span>${i}</span>${t(k)}</a>`).join('');
  $('#app').innerHTML = `
  <div class="shell">
    <aside class="side">
      <div class="brand"><span></span>${t('appName')}</div>
      <nav class="nav">${nav}</nav>
      <div class="bottom">
        <div>${t('loggedAs')}: <b>${esc((S.user?.email || '').split('@')[0])}</b></div>
        <button id="lang-btn">${lang === 'ar' ? 'English' : 'العربية'}</button>
        <button id="out-btn">${t('logout')}</button>
      </div>
    </aside>
    <main>${api.demo ? `<div class="alert" style="margin-bottom:12px">${t('demo')}</div>` : ''}${inner}</main>
    <nav class="mob-nav">${mnav}</nav>
  </div>`;
  $('#lang-btn').onclick = () => { lang = lang === 'ar' ? 'en' : 'ar'; try { localStorage.setItem('lang', lang); } catch {} applyLang(); route(); };
  $('#out-btn').onclick = () => api.logout();
}

/* ---------- login ---------- */
function renderLogin() {
  applyLang();
  $('#app').innerHTML = `
  <div class="login"><form class="login-card" id="lf">
    <img src="../img/logo.webp" alt="">
    <h1>${t('appName')}</h1><p>${t('clinic')} · ${t('loginHint')}</p>
    <div class="field"><label>${t('username')}</label><input id="lu" autocomplete="username" autocapitalize="none" required></div>
    <div class="field"><label>${t('password')}</label><input id="lp" type="password" autocomplete="current-password" required></div>
    <button class="btn primary" style="width:100%;justify-content:center;padding:11px">${t('loginBtn')}</button>
    <div class="err" id="le"></div>
    <div style="text-align:center;margin-top:8px"><a href="#" id="ll" style="font-size:13px">${lang === 'ar' ? 'English' : 'العربية'}</a></div>
  </form></div>`;
  $('#ll').onclick = e => { e.preventDefault(); lang = lang === 'ar' ? 'en' : 'ar'; try { localStorage.setItem('lang', lang); } catch {} renderLogin(); };
  $('#lf').onsubmit = async e => {
    e.preventDefault(); $('#le').textContent = '';
    const b = $('#lf button'); b.disabled = true;
    try { await api.login($('#lu').value.trim(), $('#lp').value); }
    catch (err) { console.warn(err); $('#le').textContent = t('badLogin'); }
    b.disabled = false;
  };
}

/* ---------- appointments helpers ---------- */
const STATUSES = ['booked', 'arrived', 'done', 'noshow', 'cancelled'];
async function apptsBetween(a, b) {
  return (await api.list('appointments', [['date', '>=', a], ['date', '<=', b]])).sort((x, y) => (x.date + x.time).localeCompare(y.date + y.time));
}
function apptCard(a) {
  return `<div class="appt ${esc(a.status)}" data-appt="${esc(a.id)}"><b class="ltr">${esc(a.time)}</b>${esc(a.patientName)}<div class="muted" style="font-size:12px">${esc(a.procedure || '')}</div></div>`;
}
function statusPill(s) { return `<span class="pill ${esc(s)}">${t(s)}</span>`; }

/* ---------- busy slots (public: date + time only, no patient data) ---------- */
// Huda reads these to know which 30-minute slots are taken.
const pad2 = n => String(n).padStart(2, '0');
function slotIds(date, time, dur) {
  const [h, m] = String(time).split(':').map(Number);
  if (!date || isNaN(h) || isNaN(m)) return [];
  const st = Math.floor((h * 60 + m) / 30) * 30, en = Math.ceil((h * 60 + m + (Number(dur) || 30)) / 30) * 30;
  const out = []; for (let x = st; x < en; x += 30) out.push(`${date}_${pad2(Math.floor(x / 60))}:${pad2(x % 60)}`);
  return out;
}
let busyRun = null;
async function syncBusy() {
  if (api.demo) return;
  const d = todayStr();
  const [appts, reqs, busy] = await Promise.all([
    api.list('appointments', [['date', '>=', d]]), api.list('requests', [['status', '==', 'new']]), api.list('busy', [['date', '>=', d]])]);
  const want = new Map();
  appts.filter(a => a.status !== 'cancelled').forEach(a => slotIds(a.date, a.time, a.duration).forEach(id => want.set(id, 'appt')));
  reqs.filter(r => /^\d{4}-\d{2}-\d{2}$/.test(r.date || '') && /^\d{2}:\d{2}$/.test(r.time || '') && r.date >= d)
    .forEach(r => slotIds(r.date, r.time, 30).forEach(id => { if (!want.has(id)) want.set(id, 'request'); }));
  const have = new Map(busy.map(b => [b.id, b.kind]));
  for (const [id, kind] of want) if (have.get(id) !== kind) await api.put('busy', id, { date: id.slice(0, 10), time: id.slice(11), kind });
  for (const id of have.keys()) if (!want.has(id)) await api.del('busy', id);
}
function refreshBusy() { busyRun = (busyRun || Promise.resolve()).then(syncBusy).catch(e => console.warn('busy sync', e)); }

function patientPicker(selId) {
  const p = selId ? patientById(selId) : null;
  return `
   <div class="field"><label>${t('patient')}</label>
    <input id="pp-q" placeholder="${t('searchPatient')}" value="${esc(p ? p.name : '')}" autocomplete="off">
    <input type="hidden" id="pp-id" value="${esc(selId || '')}">
    <div class="search-results hidden" id="pp-r"></div>
    <div id="pp-new" class="grid2 hidden" style="margin-top:8px">
      <div><label>${t('name')}</label><input id="pp-nn"></div>
      <div><label>${t('phone')}</label><input id="pp-np" class="ltr" inputmode="tel"></div>
    </div>
    <a href="#" id="pp-toggle" style="font-size:13px">+ ${t('orNew')}</a>
   </div>`;
}
function mountPicker(box) {
  const q = $('#pp-q', box), r = $('#pp-r', box), id = $('#pp-id', box);
  q.oninput = () => {
    id.value = '';
    const s = q.value.trim().toLowerCase();
    if (!s) { r.classList.add('hidden'); return; }
    const hits = S.patients.filter(p => (p.name || '').toLowerCase().includes(s) || (p.phone || '').includes(s)).slice(0, 8);
    r.innerHTML = hits.map(p => `<div data-id="${esc(p.id)}">${esc(p.name)} <span class="muted ltr">${esc(p.phone || '')}</span></div>`).join('') || `<div class="muted">${t('noData')}</div>`;
    r.classList.remove('hidden');
  };
  r.onclick = e => { const d = e.target.closest('[data-id]'); if (!d) return; id.value = d.dataset.id; q.value = patientById(d.dataset.id).name; r.classList.add('hidden'); };
  $('#pp-toggle', box).onclick = e => { e.preventDefault(); $('#pp-new', box).classList.toggle('hidden'); q.closest('.field').querySelector('#pp-q').classList.toggle('hidden'); id.value = ''; };
}
async function pickerValue(box) {
  const id = $('#pp-id', box).value;
  if (id) return patientById(id);
  const nn = $('#pp-nn', box).value.trim();
  if (nn) {
    const data = { name: nn, phone: $('#pp-np', box).value.trim(), medical: {} };
    const nid = await api.add('patients', data);
    await loadPatients();
    return patientById(nid) || { id: nid, ...data };
  }
  return null;
}
function procOptions(sel) {
  return S.settings.procedures.map((p, i) => `<option value="${i}" ${procName(p) === sel ? 'selected' : ''}>${esc(procName(p))}</option>`).join('');
}

function openAppt(a = {}, after) {
  const isNew = !a.id;
  modal(`
   <h3>${isNew ? t('newAppt') : t('editAppt')}</h3>
   ${patientPicker(a.patientId)}
   <div class="grid3">
     <div class="field"><label>${t('date')}</label><input type="date" id="ad" value="${esc(a.date || S.date)}"></div>
     <div class="field"><label>${t('time')}</label><input type="time" id="at" step="900" value="${esc(a.time || '16:00')}"></div>
     <div class="field"><label>${t('duration')}</label><input type="number" id="adu" min="5" step="5" value="${esc(a.duration || 30)}"></div>
   </div>
   <div class="grid2">
     <div class="field"><label>${t('procedure')}</label><select id="apr"><option value="">—</option>${procOptions(a.procedure)}</select></div>
     <div class="field"><label>${t('status')}</label><select id="ast">${STATUSES.map(s => `<option value="${s}" ${(a.status || 'booked') === s ? 'selected' : ''}>${t(s)}</option>`).join('')}</select></div>
   </div>
   <div class="field"><label>${t('notes')}</label><textarea id="ano" rows="2">${esc(a.notes || '')}</textarea></div>
   <div class="err" id="aerr"></div>
   <div class="modal-actions">
     ${isNew ? '' : `<button class="btn danger" id="adel">${t('del')}</button><span class="grow"></span>`}
     ${a.patientId ? `<a class="btn" href="#/patient/${esc(a.patientId)}" id="aopen">${t('open')} ${t('patient')}</a>` : ''}
     <button class="btn" id="acan">${t('cancel')}</button>
     <button class="btn primary" id="asave">${t('save')}</button>
   </div>`, box => {
    mountPicker(box);
    $('#acan').onclick = closeModal;
    $('#aopen') && ($('#aopen').onclick = closeModal);
    $('#adel') && ($('#adel').onclick = () => guard(async () => {
      if (!confirm(t('confirmDel'))) return;
      await api.del('appointments', a.id); refreshBusy(); closeModal(); toast(t('deleted')); after && after();
    }));
    $('#asave').onclick = () => guard(async () => {
      const p = await pickerValue(box);
      if (!p) { $('#aerr').textContent = t('choosePatient'); return; }
      const pi = $('#apr').value;
      const data = {
        patientId: p.id, patientName: p.name, phone: p.phone || '',
        date: $('#ad').value, time: $('#at').value, duration: Number($('#adu').value) || 30,
        procedure: pi === '' ? '' : procName(S.settings.procedures[pi]), status: $('#ast').value, notes: $('#ano').value.trim(),
      };
      if (!data.date || !data.time) { $('#aerr').textContent = t('required'); return; }
      $('#asave').disabled = true;
      if (isNew) await api.add('appointments', data); else await api.set('appointments', a.id, data);
      refreshBusy();
      closeModal(); toast(t('saved')); after && after();
    });
  });
}

/* ---------- TODAY ---------- */
async function renderToday() {
  shell('today', `<div class="boot">${t('loading')}</div>`);
  const d = todayStr();
  const [appts, pays, reqs] = await Promise.all([apptsBetween(d, d), api.list('payments', [['date', '==', d]]), api.list('requests', [['status', '==', 'new']])]);
  refreshBusy();
  reqs.sort((a, b) => ((a.date || '') + (a.time || '')).localeCompare((b.date || '') + (b.time || '')));
  await loadPatients();
  const newToday = S.patients.filter(p => p.createdAt && ymd(new Date(p.createdAt)) === d).length;
  const inc = { IQD: 0, USD: 0 }; pays.forEach(p => inc[p.cur || 'IQD'] += Number(p.amount) || 0);
  const active = appts.filter(a => a.status !== 'cancelled');
  const rows = appts.map(a => `
    <tr>
      <td class="ltr"><b>${esc(a.time)}</b></td>
      <td><a href="#/patient/${esc(a.patientId)}">${esc(a.patientName)}</a><div class="muted" style="font-size:12px">${esc(a.procedure || '')}</div></td>
      <td>${statusPill(a.status)}</td>
      <td class="hide-m"><div class="row">
        ${a.status === 'booked' ? `<button class="btn sm" data-st="arrived" data-id="${esc(a.id)}">${t('arrived')}</button>` : ''}
        ${a.status !== 'done' && a.status !== 'cancelled' ? `<button class="btn sm" data-st="done" data-id="${esc(a.id)}">${t('done')}</button>` : ''}
        <button class="btn sm" data-edit="${esc(a.id)}">✎</button>
      </div></td>
    </tr>`).join('');
  $('main').innerHTML = (api.demo ? `<div class="alert" style="margin-bottom:12px">${t('demo')}</div>` : '') + `
    <div class="top"><h2>${t('today')} · ${esc(dayName(d))}</h2>
      <div class="row"><button class="btn" id="np">+ ${t('newPatient')}</button><button class="btn primary" id="na">+ ${t('newAppt')}</button></div></div>
    <div class="stats">
      <div class="stat"><div class="n">${active.length}</div><div class="l">${t('todayAppts')}</div></div>
      <div class="stat"><div class="n">${appts.filter(a => a.status === 'done').length}</div><div class="l">${t('done')}</div></div>
      <div class="stat"><div class="n">${newToday}</div><div class="l">${t('newPatientsToday')}</div></div>
      <div class="stat"><div class="n ltr" style="font-size:18px">${money(inc.IQD, 'IQD')}<br>${money(inc.USD, 'USD')}</div><div class="l">${t('incomeToday')}</div></div>
    </div>
    ${reqs.length ? `<div class="card" style="margin-bottom:16px;border-color:#f79009;background:#fffcf5"><h3>📥 ${t('onlineReqs')} <span class="pill arrived">${reqs.length}</span></h3>
      <table><tbody>${reqs.map(r => `<tr>
        <td><b>${esc(r.name)}</b><div class="muted ltr" style="font-size:12px">${esc(r.phone || '')}</div></td>
        <td>${r.date ? esc(fmtDate(r.date)) : ''} <span class="ltr">${esc(r.time || '')}</span><div class="muted" style="font-size:12px">${esc(r.text || '')}</div></td>
        <td><span class="pill">${esc(r.source || '')}</span></td>
        <td><div class="row"><button class="btn sm primary" data-acc="${esc(r.id)}">${t('accept')}</button><button class="btn sm danger" data-rej="${esc(r.id)}">${t('dismiss')}</button></div></td>
      </tr>`).join('')}</tbody></table></div>` : ''}
    <div class="card"><h3>${t('todayAppts')}</h3>
      ${appts.length ? `<table><thead><tr><th>${t('time')}</th><th>${t('patient')}</th><th>${t('status')}</th><th class="hide-m"></th></tr></thead><tbody>${rows}</tbody></table>` : `<div class="empty">${t('noAppts')}</div>`}
    </div>`;
  $('#na').onclick = () => openAppt({ date: d }, renderToday);
  $('#np').onclick = () => openPatient({}, id => location.hash = '#/patient/' + id);
  $$('[data-st]').forEach(b => b.onclick = () => guard(async () => { await api.set('appointments', b.dataset.id, { status: b.dataset.st }); refreshBusy(); renderToday(); }));
  $$('[data-edit]').forEach(b => b.onclick = () => openAppt(appts.find(a => a.id === b.dataset.edit), renderToday));
  $$('[data-rej]').forEach(b => b.onclick = () => guard(async () => {
    if (!confirm(t('confirmDel'))) return;
    await api.set('requests', b.dataset.rej, { status: 'dismissed' }); refreshBusy(); renderToday();
  }));
  $$('[data-acc]').forEach(b => b.onclick = () => guard(async () => {
    const r = reqs.find(x => x.id === b.dataset.acc);
    const digits = s => String(s || '').replace(/\D/g, '').slice(-9);
    let p = r.phone && S.patients.find(x => digits(x.phone) && digits(x.phone) === digits(r.phone));
    if (!p) {
      const id = await api.add('patients', { name: r.name, phone: r.phone || '', medical: {}, notes: (r.source ? r.source + ': ' : '') + (r.text || '') });
      await loadPatients(); p = patientById(id);
    }
    const okDate = /^\d{4}-\d{2}-\d{2}$/.test(r.date || '') ? r.date : d;
    const okTime = /^\d{2}:\d{2}$/.test(r.time || '') ? r.time : '16:00';
    openAppt({ patientId: p.id, date: okDate, time: okTime, procedure: procName(S.settings.procedures[0]), notes: r.text || '', fromRequest: r.id }, async () => {
      await api.set('requests', r.id, { status: 'accepted', patientId: p.id }); refreshBusy(); renderToday();
    });
  }));
}

/* ---------- APPOINTMENTS ---------- */
async function renderAppointments() {
  shell('appointments', `<div class="boot">${t('loading')}</div>`);
  await loadPatients();
  const d = S.date;
  const isWeek = S.view === 'week';
  // week starts Saturday
  const wd = new Date(d + 'T12:00:00').getDay(); const ws = addDays(d, -((wd + 1) % 7));
  const [a0, a1] = isWeek ? [ws, addDays(ws, 6)] : [d, d];
  const appts = await apptsBetween(a0, a1);
  let body;
  if (isWeek) {
    body = `<div class="week">${[...Array(7)].map((_, i) => {
      const day = addDays(ws, i); const list = appts.filter(a => a.date === day);
      return `<div class="wd ${day === todayStr() ? 'today' : ''}"><h4><a href="#" data-day="${day}">${esc(dayName(day))}</a></h4>${list.map(apptCard).join('') || `<div class="muted" style="font-size:12px">—</div>`}</div>`;
    }).join('')}</div>`;
  } else {
    const st = S.settings.startHour, en = S.settings.endHour; let rows = '';
    for (let h = st; h < en; h++) for (const m of [0, 30]) {
      const tm = `${pad(h)}:${pad(m)}`, nxt = m === 0 ? `${pad(h)}:30` : `${pad(h + 1)}:00`;
      const here = appts.filter(a => a.time >= tm && a.time < nxt);
      rows += `<div class="slot-t">${tm}</div><div class="slot" data-time="${tm}">${here.map(apptCard).join('')}</div>`;
    }
    const outside = appts.filter(a => a.time < `${pad(st)}:00` || a.time >= `${pad(en)}:00`);
    body = (outside.length ? `<div class="card" style="margin-bottom:10px">${outside.map(apptCard).join('')}</div>` : '') + `<div class="day">${rows}</div>`;
  }
  $('main').innerHTML = (api.demo ? `<div class="alert" style="margin-bottom:12px">${t('demo')}</div>` : '') + `
    <div class="top"><h2>${t('appointments')}</h2>
      <div class="row">
        <div class="tabs" style="margin:0;border:0">
          <button class="${!isWeek ? 'on' : ''}" id="vd">${t('day')}</button><button class="${isWeek ? 'on' : ''}" id="vw">${t('week')}</button>
        </div>
        <button class="btn" id="pv">${lang === 'ar' ? '→' : '←'}</button>
        <button class="btn" id="td">${t('goToday')}</button>
        <button class="btn" id="nx">${lang === 'ar' ? '←' : '→'}</button>
        <input type="date" id="dp" value="${d}" style="width:auto">
        <button class="btn primary" id="na">+ ${t('newAppt')}</button>
      </div></div>
    <h3 style="margin-bottom:10px">${isWeek ? esc(fmtDate(a0)) + ' – ' + esc(fmtDate(a1)) : esc(dayName(d))} <span class="muted" style="font-size:14px">(${appts.filter(a => a.status !== 'cancelled').length} ${t('apptsCount')})</span></h3>
    ${body}`;
  const step = isWeek ? 7 : 1;
  $('#pv').onclick = () => { S.date = addDays(d, -step); renderAppointments(); };
  $('#nx').onclick = () => { S.date = addDays(d, step); renderAppointments(); };
  $('#td').onclick = () => { S.date = todayStr(); renderAppointments(); };
  $('#dp').onchange = e => { if (e.target.value) { S.date = e.target.value; renderAppointments(); } };
  $('#vd').onclick = () => { S.view = 'day'; renderAppointments(); };
  $('#vw').onclick = () => { S.view = 'week'; renderAppointments(); };
  $('#na').onclick = () => openAppt({ date: d }, renderAppointments);
  $$('[data-day]').forEach(x => x.onclick = e => { e.preventDefault(); S.date = x.dataset.day; S.view = 'day'; renderAppointments(); });
  $$('.slot').forEach(s => s.onclick = e => { if (e.target.closest('.appt')) return; openAppt({ date: d, time: s.dataset.time }, renderAppointments); });
  $$('[data-appt]').forEach(c => c.onclick = e => { e.stopPropagation(); openAppt(appts.find(a => a.id === c.dataset.appt), renderAppointments); });
}

/* ---------- PATIENTS ---------- */
function openPatient(p = {}, after) {
  const isNew = !p.id; const m = p.medical || {};
  modal(`
   <h3>${isNew ? t('newPatient') : t('editPatient')}</h3>
   <div class="grid2">
     <div class="field"><label>${t('name')} *</label><input id="pn" value="${esc(p.name)}"></div>
     <div class="field"><label>${t('phone')}</label><input id="pph" class="ltr" inputmode="tel" value="${esc(p.phone)}" placeholder="07xxxxxxxxx"></div>
   </div>
   <div class="grid3">
     <div class="field"><label>${t('gender')}</label><select id="pg"><option value="">—</option><option value="m" ${p.gender === 'm' ? 'selected' : ''}>${t('male')}</option><option value="f" ${p.gender === 'f' ? 'selected' : ''}>${t('female')}</option></select></div>
     <div class="field"><label>${t('birthYear')}</label><input id="pby" type="number" min="1900" max="2100" value="${esc(p.birthYear)}"></div>
     <div class="field"><label>${t('address')}</label><input id="pad" value="${esc(p.address)}"></div>
   </div>
   <label style="margin-top:4px">${t('medical')}</label>
   <div class="checks" style="margin-bottom:10px">${MED_KEYS.map(k => `<label><input type="checkbox" data-med="${k}" ${m[k] ? 'checked' : ''}>${t(k)}</label>`).join('')}</div>
   <div class="grid2">
     <div class="field"><label>${t('allergyWhat')}</label><input id="pal" value="${esc(m.allergyWhat)}"></div>
     <div class="field"><label>${t('medsNow')}</label><input id="pme" value="${esc(m.meds)}"></div>
   </div>
   <div class="field"><label>${t('notes')}</label><textarea id="pno" rows="2">${esc(p.notes)}</textarea></div>
   <div class="err" id="perr"></div>
   <div class="modal-actions">
     ${isNew ? '' : `<button class="btn danger" id="pdel">${t('del')}</button><span class="grow"></span>`}
     <button class="btn" id="pcan">${t('cancel')}</button><button class="btn primary" id="psave">${t('save')}</button>
   </div>`, () => {
    $('#pcan').onclick = closeModal;
    $('#pdel') && ($('#pdel').onclick = () => guard(async () => {
      if (!confirm(t('confirmDel') + ' ' + p.name)) return;
      await api.del('patients', p.id); closeModal(); toast(t('deleted')); location.hash = '#/patients';
    }));
    $('#psave').onclick = () => guard(async () => {
      const name = $('#pn').value.trim();
      if (!name) { $('#perr').textContent = t('name') + ': ' + t('required'); return; }
      const medical = { allergyWhat: $('#pal').value.trim(), meds: $('#pme').value.trim() };
      $$('[data-med]').forEach(c => medical[c.dataset.med] = c.checked);
      const data = { name, phone: $('#pph').value.trim(), gender: $('#pg').value, birthYear: $('#pby').value, address: $('#pad').value.trim(), notes: $('#pno').value.trim(), medical };
      $('#psave').disabled = true;
      let id = p.id;
      if (isNew) id = await api.add('patients', data); else await api.set('patients', id, data);
      await loadPatients(); closeModal(); toast(t('saved')); after && after(id);
    });
  });
}

async function renderPatients() {
  shell('patients', `<div class="boot">${t('loading')}</div>`);
  const [, tr, pay] = await Promise.all([loadPatients(), api.list('treatments'), api.list('payments')]);
  const bal = {};
  S.patients.forEach(p => bal[p.id] = balances(tr.filter(x => x.patientId === p.id), pay.filter(x => x.patientId === p.id)).b);
  const draw = q => {
    const s = (q || '').trim().toLowerCase();
    const list = S.patients.filter(p => !s || (p.name || '').toLowerCase().includes(s) || (p.phone || '').includes(s));
    $('#plist').innerHTML = list.length ? `<table><thead><tr><th>${t('name')}</th><th>${t('phone')}</th><th class="hide-m">${t('age')}</th><th>${t('balance')}</th></tr></thead><tbody>
      ${list.map(p => `<tr class="click" data-id="${esc(p.id)}"><td><b>${esc(p.name)}</b>${alertBadges(p)}</td><td class="ltr">${esc(p.phone || '')}</td><td class="hide-m">${esc(ageOf(p.birthYear))}</td><td>${balHtml(bal[p.id])}</td></tr>`).join('')}
      </tbody></table>` : `<div class="empty">${t('noPatients')}</div>`;
    $$('#plist tr.click').forEach(r => r.onclick = () => location.hash = '#/patient/' + r.dataset.id);
  };
  $('main').innerHTML = (api.demo ? `<div class="alert" style="margin-bottom:12px">${t('demo')}</div>` : '') + `
    <div class="top"><h2>${t('patients')} <span class="muted" style="font-size:15px">(${S.patients.length})</span></h2>
      <div class="row"><input id="ps" placeholder="${t('searchPatient')}" style="width:240px"><button class="btn primary" id="np">+ ${t('newPatient')}</button></div></div>
    <div class="card" id="plist"></div>`;
  draw('');
  $('#ps').oninput = e => draw(e.target.value);
  $('#np').onclick = () => openPatient({}, id => location.hash = '#/patient/' + id);
}
function alertBadges(p) {
  const m = p.medical || {}; const on = MED_KEYS.filter(k => m[k] && k !== 'smoker');
  return on.length ? ` <span class="pill cancelled" style="font-size:11px">⚠ ${on.map(t).join('، ')}</span>` : '';
}

/* ---------- PATIENT PAGE ---------- */
const UPPER = [18, 17, 16, 15, 14, 13, 12, 11, 0, 21, 22, 23, 24, 25, 26, 27, 28];
const LOWER = [48, 47, 46, 45, 44, 43, 42, 41, 0, 31, 32, 33, 34, 35, 36, 37, 38];
function toothChart(treatments, selected = [], missing = []) {
  const state = {};
  treatments.forEach(x => (x.teeth || []).forEach(n => {
    if (x.status === 'done') state[n] = 'done'; else if (!state[n]) state[n] = 'planned';
  }));
  missing.forEach(n => state[n] = state[n] || 'missing');
  const jaw = (arr, low) => `<div class="jaw">${arr.map(n => n === 0 ? '<div class="gap"></div>' :
    `<div class="tooth ${low ? 'lower' : ''} ${state[n] ? 't-' + state[n] : ''} ${selected.includes(n) ? 'sel' : ''}" data-tooth="${n}">${n}</div>`).join('')}</div>`;
  return `<div class="chart">${jaw(UPPER)}${jaw(LOWER, true)}</div>
   <div class="legend"><span><i style="background:#ecfdf3;border-color:#12805c"></i>${t('tDone')}</span><span><i style="background:#f4f3ff;border-color:#7a5af8"></i>${t('planned')}</span><span><i style="background:#f2f4f7;border-color:#cfd5dd"></i>${t('missing')}</span></div>`;
}

async function renderPatient(id, tab = 'overview') {
  shell('patients', `<div class="boot">${t('loading')}</div>`);
  if (!S.patients.length) await loadPatients();
  const p = await api.get('patients', id);
  if (!p) { $('main').innerHTML = `<div class="empty">${t('noData')}</div>`; return; }
  const [tr, pay, ap] = await Promise.all([
    api.list('treatments', [['patientId', '==', id]]),
    api.list('payments', [['patientId', '==', id]]),
    api.list('appointments', [['patientId', '==', id]]),
  ]);
  tr.sort((a, b) => (b.date || '').localeCompare(a.date || '')); pay.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  ap.sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
  const { b, cost, paid } = balances(tr, pay);
  const m = p.medical || {};
  const alerts = MED_KEYS.filter(k => m[k] && k !== 'smoker').map(t);
  if (m.allergyWhat) alerts.push(t('allergy') + ': ' + m.allergyWhat);
  const reload = nt => renderPatient(id, nt || tab);

  const tabs = ['overview', 'chart', 'payments', 'apptsTab'];
  let content = '';
  if (tab === 'overview') {
    content = `<div class="cols">
      <div class="card"><h3>${t('overview')}</h3><table>
        <tr><td class="muted">${t('phone')}</td><td class="ltr">${esc(p.phone || t('none'))}</td></tr>
        <tr><td class="muted">${t('gender')}</td><td>${p.gender ? t(p.gender === 'm' ? 'male' : 'female') : t('none')}</td></tr>
        <tr><td class="muted">${t('age')}</td><td>${esc(ageOf(p.birthYear) || t('none'))}</td></tr>
        <tr><td class="muted">${t('address')}</td><td>${esc(p.address || t('none'))}</td></tr>
        <tr><td class="muted">${t('medsNow')}</td><td>${esc(m.meds || t('none'))}</td></tr>
        <tr><td class="muted">${t('smoker')}</td><td>${m.smoker ? '✓' : t('none')}</td></tr>
        <tr><td class="muted">${t('notes')}</td><td>${esc(p.notes || t('none'))}</td></tr>
        <tr><td class="muted">${t('sinceDate')}</td><td>${p.createdAt ? esc(fmtDate(ymd(new Date(p.createdAt)))) : t('none')}</td></tr>
      </table><div style="margin-top:12px"><button class="btn" id="ep">✎ ${t('editPatient')}</button></div></div>
      <div class="card"><h3>${t('balance')}</h3>
        <table><tr><td class="muted">${t('totalCost')}</td><td class="ltr">${money(cost.USD, 'USD')} · ${money(cost.IQD, 'IQD')}</td></tr>
        <tr><td class="muted">${t('totalPaid')}</td><td class="ltr">${money(paid.USD, 'USD')} · ${money(paid.IQD, 'IQD')}</td></tr>
        <tr><td class="muted">${t('balance')}</td><td>${balHtml(b)}</td></tr></table>
        <div class="row" style="margin-top:12px"><button class="btn primary" id="qp">+ ${t('addPayment')}</button><button class="btn" id="qa">+ ${t('book')}</button></div>
      </div></div>`;
  } else if (tab === 'chart') {
    content = `<div class="card" style="margin-bottom:14px"><h3>${t('chart')}</h3>${toothChart(tr, [], p.missing || [])}
       <div style="text-align:center;margin-top:12px"><button class="btn primary" id="at">+ ${t('addTreatment')}</button></div></div>
      <div class="card"><h3>${t('treatments')}</h3>${tr.length ? `<table><thead><tr><th>${t('date')}</th><th>${t('procedure')}</th><th>${t('teeth')}</th><th>${t('price')}</th><th>${t('status')}</th></tr></thead><tbody>
        ${tr.map(x => `<tr class="click" data-tr="${esc(x.id)}"><td>${esc(fmtDate(x.date))}</td><td>${esc(x.procedure)}${x.notes ? `<div class="muted" style="font-size:12px">${esc(x.notes)}</div>` : ''}</td><td class="ltr">${esc((x.teeth || []).join(', '))}</td><td class="ltr">${money(x.price, x.cur)}</td><td><span class="pill ${x.status === 'done' ? 'done' : 'planned'}">${t(x.status === 'done' ? 'tDone' : 'planned')}</span></td></tr>`).join('')}
        </tbody></table>` : `<div class="empty">${t('noData')}</div>`}</div>`;
  } else if (tab === 'payments') {
    content = `<div class="card"><div class="top" style="margin-bottom:8px"><h3 style="margin:0">${t('payments')} · ${t('balance')}: ${balHtml(b)}</h3><button class="btn primary" id="qp">+ ${t('addPayment')}</button></div>
      ${pay.length ? `<table><thead><tr><th>${t('date')}</th><th>${t('amount')}</th><th>${t('method')}</th><th>${t('notes')}</th><th></th></tr></thead><tbody>
      ${pay.map(x => `<tr><td>${esc(fmtDate(x.date))}</td><td class="ltr"><b>${money(x.amount, x.cur)}</b></td><td>${t(x.method || 'cash')}</td><td>${esc(x.note || '')}</td><td><button class="btn sm" data-rc="${esc(x.id)}">${t('receipt')}</button> <button class="btn sm danger" data-pd="${esc(x.id)}">✕</button></td></tr>`).join('')}
      </tbody></table>` : `<div class="empty">${t('noData')}</div>`}</div>`;
  } else {
    const td = todayStr();
    const up = ap.filter(a => a.date >= td).reverse(), past = ap.filter(a => a.date < td);
    const tbl = list => list.length ? `<table><tbody>${list.map(a => `<tr class="click" data-ap="${esc(a.id)}"><td>${esc(fmtDate(a.date))}</td><td class="ltr">${esc(a.time)}</td><td>${esc(a.procedure || '')}</td><td>${statusPill(a.status)}</td></tr>`).join('')}</tbody></table>` : `<div class="empty">${t('noData')}</div>`;
    content = `<div class="cols"><div class="card"><div class="top" style="margin-bottom:8px"><h3 style="margin:0">${t('upcoming')}</h3><button class="btn primary" id="qa">+ ${t('book')}</button></div>${tbl(up)}</div><div class="card"><h3>${t('past')}</h3>${tbl(past)}</div></div>`;
  }

  $('main').innerHTML = (api.demo ? `<div class="alert" style="margin-bottom:12px">${t('demo')}</div>` : '') + `
    <div class="top"><div><a href="#/patients" class="muted" style="font-size:13px;text-decoration:none">← ${t('patients')}</a>
      <h2>${esc(p.name)} ${p.birthYear ? `<span class="muted" style="font-size:15px">· ${esc(ageOf(p.birthYear))}</span>` : ''}</h2></div>
      <div class="row">${p.phone ? `<a class="btn wa" target="_blank" rel="noopener" href="${esc(waLink(p.phone))}">${t('whatsapp')}</a><a class="btn" href="tel:${esc(p.phone)}">${t('call')}</a>` : ''}</div></div>
    ${alerts.length ? `<div class="alert" style="margin-bottom:14px">⚠ ${t('alerts')}: ${esc(alerts.join(' · '))}</div>` : ''}
    <div class="tabs">${tabs.map(k => `<button class="${tab === k ? 'on' : ''}" data-tab="${k}">${t(k)}</button>`).join('')}</div>
    ${content}`;
  $$('[data-tab]').forEach(x => x.onclick = () => reload(x.dataset.tab));
  $('#ep') && ($('#ep').onclick = () => openPatient(p, () => reload()));
  $('#qp') && ($('#qp').onclick = () => openPayment(p, {}, () => reload()));
  $('#qa') && ($('#qa').onclick = () => openAppt({ patientId: p.id, date: todayStr() }, () => reload()));
  $('#at') && ($('#at').onclick = () => openTreatment(p, tr, {}, () => reload('chart')));
  $$('[data-tooth]').forEach(x => x.onclick = () => openTreatment(p, tr, { teeth: [Number(x.dataset.tooth)] }, () => reload('chart')));
  $$('[data-tr]').forEach(x => x.onclick = () => openTreatment(p, tr, tr.find(r => r.id === x.dataset.tr), () => reload('chart')));
  $$('[data-ap]').forEach(x => x.onclick = () => openAppt(ap.find(a => a.id === x.dataset.ap), () => reload()));
  $$('[data-pd]').forEach(x => x.onclick = () => guard(async () => { if (!confirm(t('confirmDel'))) return; await api.del('payments', x.dataset.pd); toast(t('deleted')); reload(); }));
  $$('[data-rc]').forEach(x => x.onclick = () => printReceipt(p, pay.find(r => r.id === x.dataset.rc), b));
}

function openTreatment(p, allTr, x = {}, after) {
  const isNew = !x.id; let sel = [...(x.teeth || [])];
  const redraw = box => {
    $('#tchart', box).innerHTML = toothChart(allTr.filter(r => r.id !== x.id), sel, p.missing || []);
    $$('[data-tooth]', box).forEach(el => el.onclick = () => {
      const n = Number(el.dataset.tooth); sel = sel.includes(n) ? sel.filter(v => v !== n) : [...sel, n]; redraw(box);
    });
    $('#tsel', box).textContent = sel.length ? sel.join(', ') : t('selectTeethHint');
  };
  modal(`
   <h3>${isNew ? t('addTreatment') : t('treatments')} — ${esc(p.name)}</h3>
   <div id="tchart" style="margin-bottom:6px"></div>
   <div class="muted ltr" style="text-align:center;margin-bottom:12px">${t('teeth')}: <b id="tsel"></b></div>
   <div class="grid2">
     <div class="field"><label>${t('procedure')}</label><select id="tpr"><option value="">—</option>${procOptions(x.procedure)}<option value="other" ${x.procedure && !S.settings.procedures.some(q => procName(q) === x.procedure) ? 'selected' : ''}>${lang === 'ar' ? 'آخر…' : 'Other…'}</option></select></div>
     <div class="field"><label>${t('date')}</label><input type="date" id="tdt" value="${esc(x.date || todayStr())}"></div>
   </div>
   <div class="field hidden" id="tother"><label>${t('procedure')}</label><input id="tpo" value="${esc(x.procedure || '')}"></div>
   <div class="grid3">
     <div class="field"><label>${t('price')}</label><input type="number" id="tp" min="0" value="${esc(x.price ?? '')}" class="ltr"></div>
     <div class="field"><label>${t('currency')}</label><select id="tc"><option value="IQD" ${x.cur !== 'USD' ? 'selected' : ''}>${t('iqd')}</option><option value="USD" ${x.cur === 'USD' ? 'selected' : ''}>${t('usd')}</option></select></div>
     <div class="field"><label>${t('status')}</label><select id="ts"><option value="planned" ${x.status !== 'done' ? 'selected' : ''}>${t('planned')}</option><option value="done" ${x.status === 'done' ? 'selected' : ''}>${t('tDone')}</option></select></div>
   </div>
   <div class="field"><label>${t('notes')}</label><textarea id="tn" rows="2">${esc(x.notes || '')}</textarea></div>
   <label style="display:flex;gap:6px;align-items:center;font-size:13px"><input type="checkbox" id="tmiss" style="width:auto"> ${lang === 'ar' ? 'تعليم الأسنان المختارة كمفقودة' : 'Mark selected teeth as missing'}</label>
   <div class="err" id="terr"></div>
   <div class="modal-actions">
     ${isNew ? '' : `<button class="btn danger" id="tdel">${t('del')}</button><span class="grow"></span>`}
     <button class="btn" id="tcan">${t('cancel')}</button><button class="btn primary" id="tsave">${t('save')}</button>
   </div>`, box => {
    redraw(box);
    const showOther = () => $('#tother').classList.toggle('hidden', $('#tpr').value !== 'other');
    showOther();
    $('#tpr').onchange = () => {
      showOther(); const pr = S.settings.procedures[$('#tpr').value];
      if (pr) { if (pr.price) $('#tp').value = pr.price; $('#tc').value = pr.cur || 'IQD'; }
    };
    $('#tcan').onclick = closeModal;
    $('#tdel') && ($('#tdel').onclick = () => guard(async () => { if (!confirm(t('confirmDel'))) return; await api.del('treatments', x.id); closeModal(); toast(t('deleted')); after(); }));
    $('#tsave').onclick = () => guard(async () => {
      if ($('#tmiss').checked && sel.length) {
        const miss = [...new Set([...(p.missing || []), ...sel])]; await api.set('patients', p.id, { missing: miss }); p.missing = miss;
      }
      const v = $('#tpr').value;
      const procedure = v === 'other' ? $('#tpo').value.trim() : v === '' ? '' : procName(S.settings.procedures[v]);
      if (!procedure && !$('#tmiss').checked) { $('#terr').textContent = t('procedure') + ': ' + t('required'); return; }
      $('#tsave').disabled = true;
      if (procedure) {
        const data = { patientId: p.id, teeth: sel, procedure, date: $('#tdt').value, price: Number($('#tp').value) || 0, cur: $('#tc').value, status: $('#ts').value, notes: $('#tn').value.trim() };
        if (isNew) await api.add('treatments', data); else await api.set('treatments', x.id, data);
      }
      closeModal(); toast(t('saved')); after();
    });
  });
}

function openPayment(p, x = {}, after) {
  modal(`
   <h3>${t('addPayment')} — ${esc(p.name)}</h3>
   <div class="grid2">
     <div class="field"><label>${t('amount')} *</label><input type="number" id="ya" min="0" class="ltr" value="${esc(x.amount ?? '')}"></div>
     <div class="field"><label>${t('currency')}</label><select id="yc"><option value="IQD">${t('iqd')}</option><option value="USD">${t('usd')}</option></select></div>
     <div class="field"><label>${t('method')}</label><select id="ym">${['cash', 'card', 'transfer', 'installment'].map(k => `<option value="${k}">${t(k)}</option>`).join('')}</select></div>
     <div class="field"><label>${t('date')}</label><input type="date" id="yd" value="${esc(x.date || todayStr())}"></div>
   </div>
   <div class="field"><label>${t('notes')}</label><input id="yn" value="${esc(x.note || '')}"></div>
   <div class="err" id="yerr"></div>
   <div class="modal-actions"><button class="btn" id="ycan">${t('cancel')}</button><button class="btn primary" id="ysave">${t('save')}</button></div>`, () => {
    $('#ycan').onclick = closeModal;
    $('#ysave').onclick = () => guard(async () => {
      const amount = Number($('#ya').value);
      if (!amount) { $('#yerr').textContent = t('amount') + ': ' + t('required'); return; }
      $('#ysave').disabled = true;
      await api.add('payments', { patientId: p.id, patientName: p.name, amount, cur: $('#yc').value, method: $('#ym').value, date: $('#yd').value, note: $('#yn').value.trim() });
      closeModal(); toast(t('saved')); after();
    });
  });
}

function printReceipt(p, x, bal) {
  const w = window.open('', '_blank', 'width=420,height=600'); if (!w) return;
  w.document.write(`<!DOCTYPE html><html dir="${lang === 'ar' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><title>${t('receipt')}</title>
   <style>body{font-family:system-ui,sans-serif;padding:24px;color:#1d2433}h2{margin:0 0 4px}.m{color:#667085;font-size:13px}table{width:100%;margin-top:16px;border-collapse:collapse}td{padding:8px 0;border-bottom:1px solid #eee}.b{font-size:20px;font-weight:700}</style></head>
   <body><h2>${esc(t('clinic'))}</h2><div class="m">البصرة، الخليلية، شارع ١٤ تموز، مجمع تموز التجاري، الطابق ٣ · 07760547911</div>
   <table><tr><td>${t('receipt')}</td><td>${esc(fmtDate(x.date))}</td></tr><tr><td>${t('patient')}</td><td>${esc(p.name)}</td></tr>
   <tr><td>${t('amount')}</td><td class="b" dir="ltr">${money(x.amount, x.cur)}</td></tr><tr><td>${t('method')}</td><td>${t(x.method || 'cash')}</td></tr>
   ${x.note ? `<tr><td>${t('notes')}</td><td>${esc(x.note)}</td></tr>` : ''}<tr><td>${t('balance')}</td><td dir="ltr">${money(bal.USD, 'USD')} · ${money(bal.IQD, 'IQD')}</td></tr></table>
   <script>setTimeout(()=>print(),300)<\/script></body></html>`);
  w.document.close();
}

/* ---------- SETTINGS ---------- */
async function renderSettings() {
  shell('settings', `<div class="boot">${t('loading')}</div>`);
  await loadSettings();
  const s = S.settings;
  const rows = () => s.procedures.map((p, i) => `<tr>
     <td><input data-k="ar" data-i="${i}" value="${esc(p.ar)}"></td><td><input data-k="en" data-i="${i}" value="${esc(p.en)}" class="ltr"></td>
     <td><input data-k="price" data-i="${i}" type="number" min="0" value="${esc(p.price)}" class="ltr" style="width:110px"></td>
     <td><select data-k="cur" data-i="${i}"><option ${p.cur !== 'USD' ? 'selected' : ''} value="IQD">IQD</option><option ${p.cur === 'USD' ? 'selected' : ''} value="USD">USD</option></select></td>
     <td><button class="btn sm danger" data-rm="${i}">✕</button></td></tr>`).join('');
  $('main').innerHTML = (api.demo ? `<div class="alert" style="margin-bottom:12px">${t('demo')}</div>` : '') + `
   <div class="top"><h2>${t('settings')}</h2><button class="btn primary" id="ss">${t('save')}</button></div>
   <div class="card" style="margin-bottom:14px"><h3>${t('procedures')}</h3>
     <div style="overflow-x:auto"><table><thead><tr><th>العربية</th><th>English</th><th>${t('price')}</th><th>${t('currency')}</th><th></th></tr></thead><tbody id="pr">${rows()}</tbody></table></div>
     <button class="btn" id="ap" style="margin-top:10px">+ ${t('addProc')}</button></div>
   <div class="grid2">
     <div class="card"><h3>${t('hours')}</h3><div class="grid2">
       <div class="field"><label>${t('from')}</label><input type="number" id="sh" min="0" max="23" value="${s.startHour}"></div>
       <div class="field"><label>${t('to')}</label><input type="number" id="eh" min="1" max="24" value="${s.endHour}"></div></div>
       <div class="field"><label>${t('exchange')}</label><input type="number" id="rt" value="${s.rate}"></div></div>
     <div class="card"><h3>${t('backup')}</h3><p class="muted" style="margin-bottom:10px">${t('backupHint')}</p><button class="btn" id="bk">⬇ ${t('backupBtn')}</button></div>
   </div>`;
  const sync = () => $$('#pr [data-k]').forEach(el => { const p = s.procedures[el.dataset.i]; p[el.dataset.k] = el.dataset.k === 'price' ? Number(el.value) || 0 : el.value; });
  const bind = () => $$('[data-rm]').forEach(b => b.onclick = () => { sync(); s.procedures.splice(b.dataset.rm, 1); $('#pr').innerHTML = rows(); bind(); });
  bind();
  $('#ap').onclick = () => { sync(); s.procedures.push({ ar: '', en: '', price: 0, cur: 'IQD' }); $('#pr').innerHTML = rows(); bind(); };
  $('#ss').onclick = () => guard(async () => {
    sync();
    s.procedures = s.procedures.filter(p => p.ar || p.en);
    s.startHour = Number($('#sh').value); s.endHour = Number($('#eh').value); s.rate = Number($('#rt').value) || 1520;
    await api.set('settings', 'clinic', { procedures: s.procedures, startHour: s.startHour, endHour: s.endHour, rate: s.rate });
    toast(t('saved'));
  });
  $('#bk').onclick = () => guard(async () => {
    const out = {};
    for (const c of ['patients', 'appointments', 'treatments', 'payments', 'settings']) out[c] = await api.list(c);
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), ...out }, null, 1)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `clinic-backup-${todayStr()}.json`; a.click();
  });
}

/* ---------- router ---------- */
async function route() {
  if (!S.user) return renderLogin();
  applyLang(); closeModal();
  const [, page, id] = (location.hash || '#/today').split('/');
  if (!S.settings) await guard(loadSettings);
  await guard(async () => {
    if (page === 'appointments') return renderAppointments();
    if (page === 'patients') return renderPatients();
    if (page === 'patient' && id) return renderPatient(decodeURIComponent(id));
    if (page === 'settings') return renderSettings();
    return renderToday();
  });
}
window.addEventListener('hashchange', route);
applyLang();
api.onAuth(u => { S.user = u; if (!u) { S.patients = []; S.settings = null; } route(); });
