'use strict';
// All data calls go through api() in js/db.js. Swap that file for real fetch() calls when you add a database.

// ---------- helpers ----------
const $ = s => document.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ord = y => ['', '1st', '2nd', '3rd', '4th'][y] || y + 'th';
const pl = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const semName = s => (+s === 1 ? '1st' : '2nd') + ' Semester';
const pct = (n, t) => t ? Math.round(n / t * 100) : 0;
const avg = l => { const g = l.filter(s => s.gwa != null).map(s => s.gwa); return g.length ? g.reduce((a, b) => a + b, 0) / g.length : null; };

let TERMS = [], CUR_TERM = null, VIEW_TERM = null, LIMITS = { honors: 1.75, risk: 2.75 }, SET = null;
const viewTerm = () => TERMS.find(t => t.id === VIEW_TERM) || {};
const tq = () => `term=${VIEW_TERM}`;
const standingOf = g => g == null ? 'none' : g <= LIMITS.honors ? 'honors' : g > LIMITS.risk ? 'risk' : 'regular';
const gwaTag = (g, short) => g == null ? '<span class="gwa">No grades</span>'
  : `<span class="gwa ${{ honors: 'hon', risk: 'risk' }[standingOf(g)] || ''}">${short ? '' : 'GWA '}${g.toFixed(2)}</span>`;

// Toast message, optionally with an action button such as Undo
function toast(msg, opt = {}) {
  const t = $('#toast'), b = $('#toastAct');
  $('#toastMsg').textContent = msg;
  b.hidden = !opt.action; b.textContent = opt.action || '';
  b.onclick = () => { t.classList.remove('show'); opt.onAction && opt.onAction(); };
  t.classList.add('show'); clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove('show'), opt.action ? 6000 : 2400);
}

function download(name, text, type = 'text/csv') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + text], { type: type + ';charset=utf-8' }));
  a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
const csvCell = v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const toCsv = rows => rows.map(r => r.map(csvCell).join(',')).join('\r\n');
function parseCsv(text) {
  const rows = []; let row = [], cell = '', q = false;
  text = text.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim() !== ''));
}
const fileSafe = s => s.replace(/[^\w-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase();

// Sections and subjects per year level (from the Settings tab), cached until settings change
const settings = async () => SET || (SET = await api('/settings'));
const subjectsFor = (year, sem) => (SET?.[year]?.subjects?.[sem]) || [];
function fillSections(sel, year, first) {
  const keep = sel.value, secs = (SET?.[year]?.sections) || [];
  sel.innerHTML = (first ? `<option value="">${first}</option>` : '') + secs.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('');
  if ([...sel.options].some(o => o.value === keep)) sel.value = keep;
}

// ---------- terms ----------
async function loadTerms() {
  const r = await api('/terms');
  TERMS = r.terms; CUR_TERM = r.current;
  if (!TERMS.some(t => t.id === VIEW_TERM)) VIEW_TERM = CUR_TERM;
  $('#termSel').innerHTML = TERMS.map(t => `<option value="${t.id}">${esc(t.label)}${t.id === CUR_TERM ? ' (current)' : ''}</option>`).join('');
  $('#termSel').value = VIEW_TERM;
  LIMITS = await api('/config');
  updateTermBanner();
}
function updateTermBanner() {
  const b = $('#termBanner'), past = VIEW_TERM !== CUR_TERM;
  b.hidden = !past;
  if (past) {
    b.innerHTML = `<span>You're viewing <b>${esc(viewTerm().label)}</b>, not the current term. Grades you enter go to this term.</span><button class="btn ghost sm" id="backCur">Back to current term</button>`;
    $('#backCur').onclick = () => { if (!leaveOk()) return; VIEW_TERM = CUR_TERM; $('#termSel').value = CUR_TERM; updateTermBanner(); reloadTab(); };
  }
}
$('#termSel').onchange = e => {
  if (!leaveOk()) { e.target.value = VIEW_TERM; return; }
  VIEW_TERM = +e.target.value; updateTermBanner(); reloadTab();
};

// ---------- tabs ----------
const TITLES = { dashboard: 'Admin Dashboard', students: 'Student Records', gradesheet: 'Class Grade Sheet', teachers: 'Faculty Directory', registrations: 'Registration Requests', settings: 'Settings' };
const LOADERS = { dashboard: () => loadStats(), students: () => loadStudents(), gradesheet: () => loadGradeSheet(), teachers: () => loadTeachers(), registrations: () => loadRegs(), settings: () => loadSettings() };
let TAB = 'dashboard';
// Ask before leaving a screen with unsaved changes
function leaveOk() {
  if (TAB === 'settings' && settingsDirty()) return confirm(`You have unsaved changes to ${ord(setYear)} Year settings. Leave without saving?`);
  if (TAB === 'gradesheet' && gsDirty()) return confirm('You have unsaved grades on this grade sheet. Leave without saving?');
  return true;
}
window.addEventListener('beforeunload', e => { if ((TAB === 'settings' && settingsDirty()) || (TAB === 'gradesheet' && gsDirty())) { e.preventDefault(); e.returnValue = ''; } });
function show(tab) {
  TAB = tab;
  $$('.tab').forEach(s => s.hidden = s.id !== tab);
  $$('.nav [data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  $('#pageTitle').textContent = TITLES[tab];
  history.replaceState(null, '', '#' + tab);
  LOADERS[tab]();
}
const reloadTab = () => LOADERS[TAB]();
$$('.nav [data-tab]').forEach(b => b.onclick = () => { if (b.dataset.tab !== TAB && !leaveOk()) return; show(b.dataset.tab); });

// ---------- Dashboard ----------
async function loadStats() {
  try {
    const s = await api('/stats?' + tq());
    $('#dTerm').textContent = s.term;
    const set = (id, v) => $(id).textContent = v;
    set('#sTotal', s.total); set('#sMale', s.male); set('#sFemale', s.female); set('#sAvg', s.average_gwa?.toFixed(2) ?? '–');
    set('#sHon', s.honors); set('#sRisk', s.at_risk); set('#sNone', s.ungraded); set('#sPending', s.pending); set('#sTeachers', s.teachers);
    set('#sHonLim', `(≤ ${s.limits.honors.toFixed(2)})`); set('#sRiskLim', `(> ${s.limits.risk.toFixed(2)})`);
    const pm = s.total ? s.male / s.total * 100 : 0;
    $('#barM').style.width = pm + '%'; $('#barF').style.width = (s.total ? 100 - pm : 0) + '%';
    $('#barTxt').textContent = `${s.male} male (${pm.toFixed(0)}%) · ${s.female} female (${(s.total ? 100 - pm : 0).toFixed(0)}%)`;
    $('#years').innerHTML = Object.entries(s.by_year).map(([y, b]) => `<button data-year="${y}"><b style="font-size:16px">${ord(+y)} Year</b><div style="font-size:26px;font-weight:800;margin:6px 0">${b.total}</div>
      <div class="bar"><i style="width:${pct(b.Male, b.total)}%"></i><i style="width:${b.total ? 100 - pct(b.Male, b.total) : 0}%"></i></div><span class="legend">${b.Male} male · ${b.Female} female</span></button>`).join('');
    $$('#years button').forEach(b => b.onclick = () => openStudents({ year: b.dataset.year }));
    $('#top').innerHTML = s.top.map((t, i) => `<tr><td>${i + 1}</td><td><b>${esc(t.first_name + ' ' + t.last_name)}</b></td><td>${esc(t.student_id)}</td><td>${ord(t.year)} · ${esc(t.section)}</td><td>${gwaTag(t.gwa)}</td><td><button class="btn sm" data-edit="${t.id}">View</button></td></tr>`).join('')
      || '<tr><td colspan="6" class="empty">No grades yet for this term</td></tr>';
    $$('#top [data-edit]').forEach(b => b.onclick = () => editStudent(+b.dataset.edit));
    $('#online').textContent = 'System online'; $('#online').classList.remove('off');
  } catch (e) { $('#online').textContent = 'Offline'; $('#online').classList.add('off'); toast(e.message); }
}
// Open the Students tab with some filters already set
function openStudents(f = {}) {
  STATUS = 'active'; $$('#statusTabs button').forEach(b => b.classList.toggle('active', b.dataset.status === 'active'));
  $('#addStudent').hidden = false;
  $('#fy').value = f.year ?? ''; $('#fsec').innerHTML = ''; $('#q').value = ''; $('#ln').value = '';
  $('#fg').value = f.gender || ''; $('#fst').value = f.standing || ''; $('#fs').value = f.sort || (f.standing ? 'gwa' : 'name');
  PAGE = 1; SELECTED.clear(); show('students');
}
$$('.stat').forEach(b => b.onclick = () => {
  if (b.dataset.go !== 'students') return show(b.dataset.go);
  openStudents({ year: '', gender: b.dataset.gender, standing: b.dataset.standing, sort: b.dataset.sort });
});

// ---------- Students ----------
let STUDENTS = [], STATUS = 'active', VIEW = 'table', PAGE = 1, PRINT_ALL = false;
const PER_PAGE = 25, SELECTED = new Set();
try { VIEW = localStorage.getItem('gwa-view') || 'table'; } catch (e) {}
// "All years" lets dashboard tiles show every year level
$('#fy').insertAdjacentHTML('afterbegin', '<option value="">All years</option>');
$('#fy').value = '1';

async function loadStudents() {
  try {
    await settings();
    syncSectionFilter();
    STUDENTS = await api(`/students?${tq()}&status=${STATUS}`);
    for (const id of [...SELECTED]) if (!STUDENTS.some(s => s.id === id)) SELECTED.delete(id);
    renderStudents();
  } catch (e) { toast(e.message); }
}
function syncSectionFilter() {
  const y = $('#fy').value;
  if (y && STATUS === 'active') { fillSections($('#fsec'), y, 'All sections'); $('#fsec').disabled = false; }
  else { $('#fsec').innerHTML = '<option value="">All sections</option>'; $('#fsec').disabled = true; }
  $('#fy').disabled = STATUS !== 'active';
}
function filteredStudents() {
  const q = $('#q').value.trim().toLowerCase(), ln = $('#ln').value.trim().toLowerCase(), y = $('#fy').value, sec = $('#fsec').value, g = $('#fg').value, st = $('#fst').value;
  // "male"/"boy" and "female"/"girl" match gender exactly, so searching "male" doesn't also return females
  const gq = { male: 'Male', boy: 'Male', boys: 'Male', female: 'Female', girl: 'Female', girls: 'Female' }[q];
  const byYear = STATUS === 'active' && y;
  return STUDENTS.filter(s => (!byYear || s.year === +y) && (!byYear || !sec || s.section === sec) && (!g || s.gender === g)
    && (!st || standingOf(s.gwa) === st) && (!ln || s.last_name.toLowerCase().includes(ln))
    && (!q || (gq ? s.gender === gq : [s.first_name, s.last_name, s.first_name + ' ' + s.last_name, s.email, s.student_id, 'section ' + s.section].some(v => v.toLowerCase().includes(q)))));
}
function sortStudents(list) {
  const k = $('#fs').value;
  const cmp = {
    name: (a, b) => a.last_name.localeCompare(b.last_name) || a.first_name.localeCompare(b.first_name),
    gwa: (a, b) => (a.gwa ?? 9) - (b.gwa ?? 9), id: (a, b) => a.student_id.localeCompare(b.student_id),
    gender: (a, b) => b.gender.localeCompare(a.gender), section: (a, b) => a.year - b.year || a.section.localeCompare(b.section),
  }[k] || (() => 0);
  return [...list].sort((a, b) => cmp(a, b) || a.last_name.localeCompare(b.last_name));
}

function renderStudents() {
  const y = $('#fy').value, sec = $('#fsec').value, g = $('#fg').value, st = $('#fst').value, sort = $('#fs').value;
  const filtering = $('#q').value.trim() || $('#ln').value.trim() || st;
  const list = filteredStudents(), active = STATUS === 'active';
  const showYear = !active || !y, showSec = !active || !sec;
  const t = viewTerm();

  // subjects for the selected year in the viewing term's semester
  if (active && y) {
    const l = subjectsFor(y, t.semester);
    $('#subjects').hidden = false;
    $('#subjects').innerHTML = `<div class="subj-h">${ord(+y)} Year · ${semName(t.semester)} subjects <span>${pl(l.length, 'subject')} · ${l.reduce((a, s) => a + s.units, 0)} units</span></div>` + l.map(s => `<span class="chip">${esc(s.subject)} <i>${s.units}u</i></span>`).join('');
  } else $('#subjects').hidden = true;

  const label = !active ? (STATUS === 'archived' ? 'Archived students' : 'Graduated students')
    : `${y ? ord(+y) + ' Year' : 'All years'}${sec ? ' · Section ' + sec : ''}${g ? ' · ' + (g === 'Male' ? 'Boys' : 'Girls') : ''}${st ? ' · ' + { honors: 'Honors', regular: 'Regular', risk: 'At risk', none: 'Not yet graded' }[st] : ''}`;
  const toggle = `<div class="viewtoggle noprint" role="group" aria-label="View"><button data-view="table" class="${VIEW === 'table' ? 'active' : ''}">Table</button><button data-view="cards" class="${VIEW === 'cards' ? 'active' : ''}">Cards</button></div>`;
  let body;
  if (active && y && !sec && !filtering && !g) {
    // Overview: one summary card per section. Click to open the section.
    const secs = [...new Set([...(SET?.[y]?.sections || []), ...list.map(s => s.section)])];
    body = `<p class="sub noprint" style="margin:0 0 14px">Pick a section to see its students, or search or filter above to look across all sections.</p><div class="secsum">` + secs.map(sc => {
      const ss = list.filter(s => s.section === sc), m = ss.filter(s => s.gender === 'Male').length, a = avg(ss);
      const hon = ss.filter(s => standingOf(s.gwa) === 'honors').length, risk = ss.filter(s => standingOf(s.gwa) === 'risk').length, none = ss.filter(s => s.gwa == null).length;
      return `<button class="secsum-card" data-open="${esc(sc)}"><div class="secsum-h">Section ${esc(sc)}<span class="count">${ss.length}</span></div>
        <div class="bar"><i style="width:${pct(m, ss.length)}%"></i><i style="width:${ss.length ? 100 - pct(m, ss.length) : 0}%"></i></div>
        <div class="legend">${m} boys · ${ss.length - m} girls${none ? ` · <span class="warnt">${none} not graded</span>` : ''}</div>
        <dl><div><dt>Avg GWA</dt><dd>${a == null ? '–' : a.toFixed(2)}</dd></div><div><dt>Honors</dt><dd class="ok">${hon}</dd></div><div><dt>At risk</dt><dd class="bad">${risk}</dd></div></dl>
        <span class="open">View students →</span></button>`;
    }).join('') + '</div>';
  } else {
    const sorted = sortStudents(list), pages = Math.max(1, Math.ceil(sorted.length / PER_PAGE));
    PAGE = Math.min(Math.max(1, PAGE), pages);
    const rows = PRINT_ALL ? sorted : sorted.slice((PAGE - 1) * PER_PAGE, PAGE * PER_PAGE);
    const from = sorted.length ? (PRINT_ALL ? 1 : (PAGE - 1) * PER_PAGE + 1) : 0, to = from + rows.length - 1;
    const pager = `<div class="pager noprint"><span>${pages > 1 ? `Showing ${from}–${to} of ${sorted.length}` : `Showing ${pl(sorted.length, 'student')}`}</span>${pages > 1 ? `<div>
      <button class="btn ghost sm" data-page="${PAGE - 1}" ${PAGE === 1 ? 'disabled' : ''}>‹ Previous</button><span class="pg">Page ${PAGE} of ${pages}</span>
      <button class="btn ghost sm" data-page="${PAGE + 1}" ${PAGE === pages ? 'disabled' : ''}>Next ›</button></div>` : ''}</div>`;
    const th = (k, txt) => `<th><button class="sortbtn ${sort === k ? 'on' : ''}" data-sort="${k}">${txt}${sort === k ? ' ▾' : ''}</button></th>`;
    const pageIds = rows.map(s => s.id), allOn = pageIds.length && pageIds.every(id => SELECTED.has(id));
    const acts = s => active
      ? `<button class="btn sm" data-edit="${s.id}">Edit</button> <button class="btn ghost sm" data-arch="${s.id}">Archive</button>`
      : `<button class="btn ghost sm" data-edit="${s.id}">View</button> <button class="btn sm" data-restore="${s.id}">Restore</button> <button class="btn danger sm" data-purge="${s.id}">Delete forever</button>`;
    if (!sorted.length) body = `<p class="empty">${active ? 'No students match your filters.' : STATUS === 'archived' ? 'No archived students.' : 'No graduated students yet.'}</p>`;
    else if (VIEW === 'table' || !active || PRINT_ALL) body = `<div class="scroll"><table class="stable"><thead><tr>
        ${active ? `<th class="noprint"><input type="checkbox" id="selPage" aria-label="Select all on this page" ${allOn ? 'checked' : ''}></th>` : ''}<th>#</th>${th('name', 'Name')}${th('id', 'Student ID')}
        ${showYear || showSec ? th('section', showYear ? 'Year / Sec' : 'Section') : ''}${th('gender', 'Gender')}<th>Email</th>${th('gwa', 'Term GWA')}<th>Overall</th><th class="noprint"></th></tr></thead><tbody>` +
      rows.map((s, i) => `<tr class="${SELECTED.has(s.id) ? 'sel' : ''}">${active ? `<td class="noprint"><input type="checkbox" data-sel="${s.id}" aria-label="Select ${esc(s.first_name)}" ${SELECTED.has(s.id) ? 'checked' : ''}></td>` : ''}
        <td class="num">${from + i}</td><td><b>${esc(s.last_name)}, ${esc(s.first_name)}</b></td><td>${esc(s.student_id)}</td>
        ${showYear || showSec ? `<td>${showYear ? ord(s.year) + ' · ' : ''}${esc(s.section)}</td>` : ''}
        <td><span class="gtag ${s.gender === 'Male' ? 'm' : 'f'}">${s.gender === 'Male' ? 'Boy' : 'Girl'}</span></td><td class="mail">${esc(s.email)}</td>
        <td>${gwaTag(s.gwa, true)}</td><td class="muted">${s.cgwa == null ? '–' : s.cgwa.toFixed(2)}</td><td class="acts noprint">${acts(s)}</td></tr>`).join('') + '</tbody></table></div>' + pager;
    else body = `<div class="cardgrid">` + rows.map(s => `<div class="person"><div><b>${esc(s.first_name + ' ' + s.last_name)}</b><small>Student ID: ${esc(s.student_id)}${showSec ? ` · ${showYear ? ord(s.year) + ' ' : ''}Section ${esc(s.section)}` : ''}</small><small>Email: ${esc(s.email)}</small>${gwaTag(s.gwa)}</div>
        <div class="acts"><button class="btn sm" data-edit="${s.id}">Edit</button><button class="btn ghost sm" data-arch="${s.id}">Archive</button></div></div>`).join('') + '</div>' + pager;
  }
  const back = active && sec ? `<button class="btn ghost sm noprint" id="backAll">‹ All sections</button>` : '';
  const printHead = `<div class="printonly"><b>${esc(label)}</b> · ${esc(t.label || '')}</div>`;
  $('#tree').innerHTML = printHead + `<div class="yearhead"><span style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">${back}${esc(label)}<span class="count">${pl(list.length, 'student')}</span></span>${active && (sec || filtering || g || !y) ? toggle : ''}</div>` + body;

  const on = (sel, fn) => $$(sel, $('#tree')).forEach(fn);
  on('[data-edit]', b => b.onclick = () => editStudent(+b.dataset.edit));
  on('[data-arch]', b => b.onclick = () => archiveStudents([+b.dataset.arch]));
  on('[data-restore]', b => b.onclick = () => restoreStudent(+b.dataset.restore));
  on('[data-purge]', b => b.onclick = () => purgeStudent(+b.dataset.purge));
  on('[data-open]', b => b.onclick = () => { $('#fsec').value = b.dataset.open; PAGE = 1; renderStudents(); });
  on('[data-page]', b => b.onclick = () => { PAGE = +b.dataset.page; renderStudents(); $('#tree').scrollIntoView({ block: 'start' }); });
  on('[data-view]', b => b.onclick = () => { VIEW = b.dataset.view; try { localStorage.setItem('gwa-view', VIEW); } catch (e) {} renderStudents(); });
  on('[data-sort]', b => b.onclick = () => { $('#fs').value = b.dataset.sort; PAGE = 1; renderStudents(); });
  on('[data-sel]', c => c.onchange = () => { c.checked ? SELECTED.add(+c.dataset.sel) : SELECTED.delete(+c.dataset.sel); renderStudents(); });
  $('#selPage')?.addEventListener('change', e => { const ids = $$('[data-sel]', $('#tree')).map(c => +c.dataset.sel); ids.forEach(id => e.target.checked ? SELECTED.add(id) : SELECTED.delete(id)); renderStudents(); });
  $('#backAll')?.addEventListener('click', () => { $('#fsec').value = ''; PAGE = 1; renderStudents(); });
  renderBulkBar();
}
const rerender = () => { PAGE = 1; renderStudents(); };
['#q', '#ln'].forEach(s => $(s).oninput = rerender);
['#fsec', '#fg', '#fs', '#fst'].forEach(s => $(s).onchange = rerender);
$('#fy').onchange = () => { syncSectionFilter(); SELECTED.clear(); rerender(); };
$$('#statusTabs button').forEach(b => b.onclick = () => {
  STATUS = b.dataset.status; SELECTED.clear(); PAGE = 1;
  $$('#statusTabs button').forEach(x => x.classList.toggle('active', x === b));
  $('#addStudent').hidden = STATUS !== 'active';
  loadStudents();
});

// Bulk actions on selected students
function renderBulkBar() {
  const ids = [...SELECTED], bar = $('#bulkbar');
  bar.hidden = !ids.length || STATUS !== 'active';
  if (bar.hidden) return;
  const sel = STUDENTS.filter(s => SELECTED.has(s.id)), years = [...new Set(sel.map(s => s.year))];
  $('#bulkCount').textContent = `${pl(ids.length, 'student')} selected`;
  if (years.length === 1) { fillSections($('#bulkSec'), years[0]); $('#bulkSec').disabled = $('#bulkMove').disabled = false; $('#bulkMove').title = ''; }
  else { $('#bulkSec').innerHTML = '<option>One year level at a time</option>'; $('#bulkSec').disabled = $('#bulkMove').disabled = true; $('#bulkMove').title = 'Select students from one year level to move them'; }
}
$('#bulkMove').onclick = async () => {
  const ids = [...SELECTED], to = $('#bulkSec').value;
  const before = STUDENTS.filter(s => SELECTED.has(s.id)).map(s => ({ id: s.id, section: s.section }));
  try {
    await api('/students/move', { method: 'POST', body: { ids, section: to } });
    SELECTED.clear(); await loadStudents();
    toast(`${pl(ids.length, 'student')} moved to Section ${to}`, { action: 'Undo', onAction: async () => {
      try {
        for (const sec of [...new Set(before.map(b => b.section))]) await api('/students/move', { method: 'POST', body: { ids: before.filter(b => b.section === sec).map(b => b.id), section: sec } });
        toast('Move undone'); loadStudents();
      } catch (e) { toast(e.message); }
    } });
  } catch (e) { toast(e.message); }
};
$('#bulkArchive').onclick = () => archiveStudents([...SELECTED]);
$('#bulkClear').onclick = () => { SELECTED.clear(); renderStudents(); };

async function archiveStudents(ids) {
  try {
    const one = ids.length === 1 && STUDENTS.find(s => s.id === ids[0]);
    await api('/students/archive', { method: 'POST', body: { ids } });
    ids.forEach(id => SELECTED.delete(id));
    await loadStudents();
    toast(`${one ? one.first_name + ' ' + one.last_name : pl(ids.length, 'student')} archived`, { action: 'Undo', onAction: async () => {
      try { for (const id of ids) await api(`/students/${id}/restore`, { method: 'POST' }); toast('Archive undone'); loadStudents(); } catch (e) { toast(e.message); }
    } });
  } catch (e) { toast(e.message); }
}
async function restoreStudent(id) {
  try { const r = await api(`/students/${id}/restore`, { method: 'POST' }); await loadStudents(); toast(`Student restored to Section ${r.section || ''}`.trim()); } catch (e) { toast(e.message); }
}
async function purgeStudent(id) {
  const s = STUDENTS.find(x => x.id === id);
  if (!confirm(`Permanently delete ${s ? s.first_name + ' ' + s.last_name : 'this student'} and all their grades? This cannot be undone.`)) return;
  try { await api(`/students/${id}/permanent`, { method: 'DELETE' }); await loadStudents(); toast('Student deleted permanently'); } catch (e) { toast(e.message); }
}

// Export, print and import
$('#exportBtn').onclick = () => {
  const list = sortStudents(filteredStudents()), t = viewTerm();
  if (!list.length) return toast('No students to export with these filters.');
  download(`students-${fileSafe(t.label || 'term')}.csv`, toCsv([['student_id', 'last_name', 'first_name', 'gender', 'year', 'section', 'email', 'term_gwa', 'overall_gwa', 'standing'],
    ...list.map(s => [s.student_id, s.last_name, s.first_name, s.gender, s.year, s.section, s.email, s.gwa?.toFixed(2) ?? '', s.cgwa?.toFixed(2) ?? '', { honors: 'Honors', regular: 'Regular', risk: 'At risk', none: 'Not graded' }[standingOf(s.gwa)]])]));
  toast(`Exported ${pl(list.length, 'student')}`);
};
$('#printBtn').onclick = () => window.print();
window.addEventListener('beforeprint', () => { if (TAB === 'students') { PRINT_ALL = true; renderStudents(); } });
window.addEventListener('afterprint', () => { if (PRINT_ALL) { PRINT_ALL = false; renderStudents(); } });

const CSV_COLS = ['student_id', 'first_name', 'last_name', 'email', 'gender', 'year', 'section'];
let importRows = null;
$('#importBtn').onclick = () => { $('#fImport').reset(); importRows = null; $('#diPreview').textContent = ''; $('#diErr').textContent = ''; $('#dImport').showModal(); };
$('#csvTemplate').onclick = () => download('students-template.csv', toCsv([CSV_COLS, ['', 'Juan', 'Dela Cruz', 'juan@example.com', 'Male', '1', 'A']]));
$('#csvFile').onchange = async e => { const f = e.target.files[0]; if (!f) return; if (f.size > 2e6) { $('#diErr').textContent = 'That file is larger than 2 MB.'; return; } $('#csvText').value = await f.text(); previewImport(); };
$('#csvText').oninput = () => previewImport();
function previewImport() {
  $('#diErr').textContent = ''; importRows = null;
  const rows = parseCsv($('#csvText').value);
  if (!rows.length) { $('#diPreview').textContent = ''; return; }
  const head = rows[0].map(h => h.trim().toLowerCase().replace(/\s+/g, '_'));
  const missing = CSV_COLS.filter(c => !['student_id', 'section'].includes(c) && !head.includes(c));
  if (missing.length) { $('#diPreview').textContent = ''; $('#diErr').textContent = `The first row must be the column names. Missing: ${missing.join(', ')}`; return; }
  importRows = rows.slice(1).map(r => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? '').trim()])));
  $('#diPreview').textContent = importRows.length ? `${pl(importRows.length, 'student')} ready to import.` : 'No student rows found below the column names.';
}
$('#fImport').onsubmit = async e => {
  if (e.submitter?.value !== 'save') return;
  e.preventDefault();
  if (!importRows?.length) { $('#diErr').textContent = 'Choose a CSV file or paste CSV text first.'; return; }
  try { const r = await api('/students/import', { method: 'POST', body: { rows: importRows } }); $('#dImport').close(); toast(`Imported ${pl(r.imported, 'student')}`); SET = null; loadStudents(); }
  catch (err) { $('#diErr').textContent = err.message; }
};

// ---------- Student dialog ----------
let editingId = null, editTerm = null;
function gradeRow(g = {}) {
  const d = document.createElement('div'); d.className = 'grow';
  d.innerHTML = `<input placeholder="Subject" value="${esc(g.subject)}" data-k="subject" aria-label="Subject"><input type="number" min="0.5" max="10" step="0.5" placeholder="Units" value="${g.units ?? 3}" data-k="units" aria-label="Units"><input type="number" min="1" max="5" step="0.25" placeholder="Grade" value="${g.grade ?? ''}" data-k="grade" aria-label="Grade"><button type="button" class="btn danger sm" title="Remove">✕</button>`;
  d.querySelector('button').onclick = () => { d.remove(); liveGwa(); };
  d.oninput = () => { liveGwa(); flagExtraSubjects(); };
  $('#grades').append(d);
}
const formYear = () => +$('#fStudent').elements.year.value;
// Mark grade rows whose subject isn't in the curriculum for the student's year and this term's semester
function flagExtraSubjects() {
  const l = subjectsFor(editTerm?.taken_year || formYear(), editTerm?.semester).map(s => s.subject.toLowerCase());
  $$('#grades .grow').forEach(r => { const v = r.querySelector('[data-k=subject]').value.trim().toLowerCase(); r.classList.toggle('extra', !!v && !l.includes(v)); });
}
const readGrades = () => $$('#grades .grow').map(r => Object.fromEntries($$('input', r).map(i => [i.dataset.k, i.value])));
function liveGwa() { let w = 0, u = 0; readGrades().forEach(g => { const gr = +g.grade, un = +g.units || 0; if (g.subject && gr) { w += gr * un; u += un; } }); $('#liveGwa').textContent = u ? (w / u).toFixed(2) : '–'; }
$('#addGrade').onclick = () => gradeRow({});
function loadCurriculumRows(year) {
  const cur = Object.fromEntries(readGrades().map(g => [g.subject.trim().toLowerCase(), g.grade]));
  $('#grades').innerHTML = '';
  for (const s of subjectsFor(year, editTerm.semester)) gradeRow({ ...s, grade: cur[s.subject.toLowerCase()] ?? '' });
  liveGwa(); flagExtraSubjects();
}
async function editStudent(id) {
  try {
    const f = $('#fStudent'); f.reset(); $('#dsErr').textContent = ''; $('#grades').innerHTML = ''; editingId = id; await settings();
    const t = viewTerm();
    if (id) {
      const s = await api(`/students/${id}?${tq()}`);
      for (const k of ['first_name', 'last_name', 'student_id', 'email', 'gender', 'year']) f.elements[k].value = s[k];
      fillSections($('#stuSec'), s.year); $('#stuSec').value = s.section;
      editTerm = { id: s.term_id, label: s.term_label, semester: s.semester, taken_year: s.grades.length ? s.taken_year : null };
      if (s.grades.length) s.grades.forEach(gradeRow); else loadCurriculumRows(s.year);
      $('#gwaSum').innerHTML = `<span>Term GWA <b>${s.gwa == null ? '–' : s.gwa.toFixed(2)}</b></span><span>Overall GWA <b>${s.cgwa == null ? '–' : s.cgwa.toFixed(2)}</b></span><span>Status <b>${{ active: 'Active', archived: 'Archived', graduated: 'Graduated' }[s.status]}</b></span>`;
      $('#historyBox').innerHTML = s.history.length ? `<details class="history"><summary>GWA history (${pl(s.history.length, 'term')})</summary><table><tbody>${s.history.map(h => `<tr><td>${esc(h.label)}</td><td>${h.year ? ord(h.year) + ' Year' : ''}</td><td>${gwaTag(h.gwa, true)}</td></tr>`).join('')}</tbody></table></details>` : '';
      $('#dsTitle').textContent = s.status === 'active' ? 'Edit Student' : 'Student Record';
    } else {
      f.elements.year.value = $('#fy').value || 1; fillSections($('#stuSec'), formYear()); if ($('#fsec').value) $('#stuSec').value = $('#fsec').value;
      editTerm = { id: t.id, label: t.label, semester: t.semester, taken_year: null };
      loadCurriculumRows(formYear());
      $('#gwaSum').innerHTML = ''; $('#historyBox').innerHTML = '';
      $('#dsTitle').textContent = 'Add Student';
    }
    $('#subjTerm').textContent = editTerm.label;
    liveGwa(); flagExtraSubjects(); $('#dStudent').showModal();
  } catch (e) { toast(e.message); }
}
$('#fStudent').elements.year.onchange = e => { fillSections($('#stuSec'), e.target.value); if (!editTerm.taken_year) loadCurriculumRows(+e.target.value); else flagExtraSubjects(); };
$('#loadSubjects').onclick = () => { $('#grades').innerHTML = ''; loadCurriculumRows(editTerm.taken_year || formYear()); };
$('#addStudent').onclick = () => editStudent(null);
$('#fStudent').onsubmit = async e => {
  if (e.submitter?.value !== 'save') return;
  e.preventDefault();
  const body = { ...Object.fromEntries(new FormData(e.target)), grades: readGrades(), term_id: editTerm.id };
  try {
    await api('/students' + (editingId ? '/' + editingId : ''), { method: editingId ? 'PUT' : 'POST', body });
    $('#dStudent').close(); toast(editingId ? 'Student updated' : 'Student added'); reloadTab();
  } catch (err) { $('#dsErr').textContent = err.message; }
};

// ---------- Grade Sheet ----------
let GS = null, gsOrig = {};
const gsKey = () => `${$('#gsY').value}|${$('#gsSec').value}|${$('#gsSub').value}`;
const normGrade = v => v.trim() === '' ? '' : String(+v);
const gsDirty = () => !!GS && $$('#gsBody [data-gid]').some(i => normGrade(i.value) !== gsOrig[i.dataset.gid]);
async function loadGradeSheet(keepSelection) {
  try {
    await settings();
    const y = $('#gsY').value, t = viewTerm();
    fillSections($('#gsSec'), y);
    const subs = subjectsFor(y, t.semester), keep = $('#gsSub').value;
    $('#gsSub').innerHTML = subs.map(s => `<option value="${esc(s.subject)}">${esc(s.subject)} (${s.units}u)</option>`).join('');
    if (keepSelection !== false && subs.some(s => s.subject === keep)) $('#gsSub').value = keep;
    if (!$('#gsSec').value || !$('#gsSub').value) { GS = null; $('#gsInfo').innerHTML = ''; $('#gsBar').hidden = true; $('#gsBody').innerHTML = '<p class="empty">This year level has no sections or no subjects for this semester. Set them up on the Settings tab.</p>'; return; }
    GS = await api(`/gradesheet?${tq()}&year=${y}&section=${encodeURIComponent($('#gsSec').value)}&subject=${encodeURIComponent($('#gsSub').value)}`);
    gsOrig = Object.fromEntries(GS.students.map(s => [s.id, s.grade == null ? '' : String(s.grade)]));
    renderGradeSheet();
  } catch (e) { toast(e.message); }
}
const remark = g => g === '' || g == null || isNaN(g) ? '' : g <= 3 ? 'Passed' : g < 5 ? 'Conditional' : 'Failed';
function renderGradeSheet() {
  const y = $('#gsY').value;
  $('#gsInfo').innerHTML = `<span><small>Term</small><b>${esc(GS.term)}</b></span><span><small>Class</small><b>${ord(+y)} Year · Section ${esc($('#gsSec').value)}</b></span><span><small>Subject</small><b>${esc($('#gsSub').value)} · ${GS.units} units</b></span>
    <span><small>Teacher</small><b>${GS.teacher ? esc(GS.teacher) : '<a href="#teachers" id="gsAssign">Not assigned · assign one</a>'}</b></span>`;
  $('#gsAssign')?.addEventListener('click', e => { e.preventDefault(); if (leaveOk()) show('teachers'); });
  $('#gsBar').hidden = !GS.students.length;
  if (!GS.students.length) { $('#gsBody').innerHTML = '<p class="empty">No students in this section yet.</p>'; return; }
  $('#gsBody').innerHTML = `<div class="gssum" id="gsSum"></div><div class="scroll"><table class="stable gstable"><thead><tr><th>#</th><th>Name</th><th>Student ID</th><th>Gender</th><th>Grade</th><th>Remarks</th></tr></thead><tbody>` +
    GS.students.map((s, i) => `<tr><td class="num">${i + 1}</td><td><b>${esc(s.name)}</b></td><td>${esc(s.student_id)}</td><td><span class="gtag ${s.gender === 'Male' ? 'm' : 'f'}">${s.gender === 'Male' ? 'Boy' : 'Girl'}</span></td>
      <td><input class="gin" type="number" min="1" max="5" step="0.25" inputmode="decimal" data-gid="${s.id}" value="${s.grade ?? ''}" aria-label="Grade for ${esc(s.name)}"></td><td class="rm" data-rm="${s.id}"></td></tr>`).join('') + '</tbody></table></div>';
  const inputs = $$('#gsBody [data-gid]');
  inputs.forEach((inp, i) => {
    inp.oninput = gsUpdate;
    inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); const n = inputs[i + (e.shiftKey ? -1 : 1)]; if (n) { n.focus(); n.select(); } } };
  });
  gsUpdate();
}
function gsUpdate() {
  let n = 0, sum = 0, passed = 0, failed = 0, bad = 0;
  for (const i of $$('#gsBody [data-gid]')) {
    const v = i.value.trim(), g = +v, ok = v === '' || (g >= 1 && g <= 5);
    i.classList.toggle('invalid', !ok); i.classList.toggle('changed', normGrade(v) !== gsOrig[i.dataset.gid]);
    const cell = $(`#gsBody [data-rm="${i.dataset.gid}"]`), r = ok ? remark(v === '' ? '' : g) : 'Invalid';
    cell.textContent = r; cell.className = 'rm ' + ({ Passed: 'ok', Failed: 'bad', Conditional: 'warnt', Invalid: 'bad' }[r] || '');
    if (!ok) { bad++; continue; }
    if (v !== '') { n++; sum += g; if (g <= 3) passed++; else if (g >= 5) failed++; }
  }
  const total = GS.students.length;
  $('#gsSum').innerHTML = `<span><b>${n}</b> of ${total} graded</span><span>Class average <b>${n ? (sum / n).toFixed(2) : '–'}</b></span><span class="ok">Passed <b>${passed}</b></span><span class="bad">Failed <b>${failed}</b></span>${total - n - bad ? `<span class="warnt">Missing <b>${total - n - bad}</b></span>` : ''}`;
  const dirty = gsDirty();
  $('#gsErr').textContent = bad ? `${pl(bad, 'grade')} ${bad === 1 ? 'is' : 'are'} not between 1.00 and 5.00.` : '';
  $('#gsSave').disabled = !dirty || !!bad;
  $('#gsSave').textContent = dirty ? 'Save grades •' : 'Save grades';
}
let gsPrev = '';
['#gsY', '#gsSec', '#gsSub'].forEach(s => {
  $(s).onfocus = () => { gsPrev = gsKey(); };
  $(s).onchange = () => {
    if (gsDirty() && !confirm('You have unsaved grades on this grade sheet. Switch classes without saving?')) {
      const [y, sec, sub] = gsPrev.split('|'); $('#gsY').value = y; fillSections($('#gsSec'), y); $('#gsSec').value = sec; $('#gsSub').value = sub; return;
    }
    loadGradeSheet(s !== '#gsY');
  };
});
$('#gsReset').onclick = () => { if (gsDirty() && !confirm('Discard your unsaved grades?')) return; renderGradeSheet(); };
$('#gsSave').onclick = async () => {
  const grades = $$('#gsBody [data-gid]').filter(i => normGrade(i.value) !== gsOrig[i.dataset.gid]).map(i => ({ id: +i.dataset.gid, grade: i.value.trim() }));
  if (!grades.length) return;
  const btn = $('#gsSave'); btn.disabled = true;
  try {
    const r = await api('/gradesheet', { method: 'PUT', body: { term_id: GS.term_id, year: +$('#gsY').value, section: $('#gsSec').value, subject: $('#gsSub').value, grades } });
    toast(`Saved ${pl(r.saved, 'grade')}${r.cleared ? `, cleared ${r.cleared}` : ''}`); await loadGradeSheet();
  } catch (e) { $('#gsErr').textContent = e.message; btn.disabled = false; }
};
$('#gsExport').onclick = () => {
  if (!GS?.students.length) return toast('Nothing to export yet.');
  download(`grades-${fileSafe(`${GS.term}-${ord(+$('#gsY').value)}-${$('#gsSec').value}-${$('#gsSub').value}`)}.csv`,
    toCsv([['student_id', 'name', 'gender', 'grade', 'remarks'], ...GS.students.map(s => { const v = $(`#gsBody [data-gid="${s.id}"]`).value.trim(); return [s.student_id, s.name, s.gender, v, remark(v === '' ? '' : +v)]; })]));
};
$('#gsPrint').onclick = () => window.print();

// ---------- Teachers ----------
let TEACHERS = [];
async function loadTeachers() { try { await settings(); TEACHERS = await api('/teachers'); renderTeachers(); } catch (e) { toast(e.message); } }
const classLabel = a => `${ord(a.year)} Yr ${a.section} · ${a.subject}`;
function renderTeachers() {
  const q = $('#tq').value.trim().toLowerCase();
  const l = TEACHERS.filter(t => !q || [t.name, t.email, t.department, t.subject, ...t.classes.map(classLabel)].some(v => (v || '').toLowerCase().includes(q)));
  $('#tlist').innerHTML = l.map(t => `<tr><td><b>${esc(t.name)}</b>${t.subject ? `<br><small class="muted">${esc(t.subject)}</small>` : ''}</td><td>${esc(t.email)}</td><td>${esc(t.department || '—')}</td>
    <td><div class="classes">${t.classes.map(a => `<span class="chip">${esc(classLabel(a))} <button type="button" class="x" data-unassign="${a.id}" data-t="${t.id}" title="Remove this class" aria-label="Remove ${esc(classLabel(a))}">✕</button></span>`).join('') || '<span class="muted">No classes yet</span>'}</div></td>
    <td style="white-space:nowrap"><button class="btn sm" data-assign="${t.id}">Assign class</button> <button class="btn ghost sm" data-e="${t.id}">Edit</button> <button class="btn ghost sm" data-d="${t.id}">Delete</button></td></tr>`).join('')
    || '<tr><td colspan="5" class="empty">No teachers found</td></tr>';
  $$('#tlist [data-e]').forEach(b => b.onclick = () => editTeacher(+b.dataset.e));
  $$('#tlist [data-assign]').forEach(b => b.onclick = () => openAssign(+b.dataset.assign));
  $$('#tlist [data-unassign]').forEach(b => b.onclick = async () => {
    const t = TEACHERS.find(x => x.id === +b.dataset.t), a = t.classes.find(x => x.id === +b.dataset.unassign);
    try {
      await api('/assignments/' + a.id, { method: 'DELETE' }); await loadTeachers();
      toast(`Removed ${classLabel(a)} from ${t.name}`, { action: 'Undo', onAction: async () => { try { await api('/assignments', { method: 'POST', body: { teacher_id: t.id, year: a.year, section: a.section, subject: a.subject } }); loadTeachers(); } catch (e) { toast(e.message); } } });
    } catch (e) { toast(e.message); }
  });
  $$('#tlist [data-d]').forEach(b => b.onclick = async () => {
    const t = TEACHERS.find(x => x.id === +b.dataset.d);
    if (!confirm(`Delete ${t.name}?${t.classes.length ? ` Their ${pl(t.classes.length, 'class')} will have no teacher.` : ''}`)) return;
    try { await api('/teachers/' + t.id, { method: 'DELETE' }); toast('Teacher deleted'); loadTeachers(); } catch (e) { toast(e.message); }
  });
}
$('#tq').oninput = renderTeachers;
let tEdit = null;
function editTeacher(id) {
  const f = $('#fTeacher'); f.reset(); $('#dtErr').textContent = ''; tEdit = id;
  const t = TEACHERS.find(x => x.id === id);
  if (t) for (const k of ['name', 'email', 'department', 'subject']) f.elements[k].value = t[k] || '';
  $('#dtTitle').textContent = t ? 'Edit Teacher' : 'Add Teacher'; $('#dTeacher').showModal();
}
$('#addTeacher').onclick = () => editTeacher(null);
$('#fTeacher').onsubmit = async e => {
  if (e.submitter?.value !== 'save') return;
  e.preventDefault();
  try { await api('/teachers' + (tEdit ? '/' + tEdit : ''), { method: tEdit ? 'PUT' : 'POST', body: Object.fromEntries(new FormData(e.target)) }); $('#dTeacher').close(); toast('Teacher saved'); loadTeachers(); }
  catch (err) { $('#dtErr').textContent = err.message; }
};
let assignFor = null;
function fillAssignSubjects() {
  const y = $('#asY').value;
  $('#asSub').innerHTML = [1, 2].map(sem => `<optgroup label="${semName(sem)}">${subjectsFor(y, sem).map(s => `<option value="${esc(s.subject)}">${esc(s.subject)}</option>`).join('')}</optgroup>`).join('');
  fillSections($('#asSec'), y);
}
function openAssign(id) {
  assignFor = TEACHERS.find(t => t.id === id);
  $('#fAssign').reset(); $('#daErr').textContent = ''; $('#daTitle').textContent = `Assign a class to ${assignFor.name}`;
  fillAssignSubjects(); $('#dAssign').showModal();
}
$('#asY').onchange = fillAssignSubjects;
$('#fAssign').onsubmit = async e => {
  if (e.submitter?.value !== 'save') return;
  e.preventDefault();
  const body = { teacher_id: assignFor.id, ...Object.fromEntries(new FormData(e.target)) };
  try { await api('/assignments', { method: 'POST', body }); }
  catch (err) {
    if (!/already teaches/.test(err.message) || /this class/.test(err.message)) { $('#daErr').textContent = err.message; return; }
    if (!confirm(`${err.message} Give the class to ${assignFor.name} instead?`)) return;
    try { await api('/assignments', { method: 'POST', body: { ...body, replace: true } }); } catch (e2) { $('#daErr').textContent = e2.message; return; }
  }
  $('#dAssign').close(); toast('Class assigned'); loadTeachers();
};

// ---------- Registrations ----------
let REGS = [];
async function loadRegs() { try { REGS = await api('/registrations'); renderRegs(); } catch (e) { toast(e.message); } }
function renderRegs() {
  const f = $('#rf').value, l = REGS.filter(r => !f || r.status === f);
  $('#rlist').innerHTML = l.map(r => `<tr><td><b>${esc(r.first_name + ' ' + r.last_name)}</b></td><td>${esc(r.role)}</td><td>${esc(r.email)}</td>
    <td>${r.role === 'Student' ? `${esc(r.gender || '')} · ${ord(r.year || 1)} Year · Sec ${esc(r.section || 'Auto')}` : esc(r.subject || '—')}</td><td><span class="tag ${r.status}">${r.status}</span></td>
    <td style="white-space:nowrap">${r.status === 'Pending' ? `<button class="btn sm" data-a="approve" data-id="${r.id}">Approve</button> <button class="btn danger sm" data-a="reject" data-id="${r.id}">Reject</button>` : ''}</td></tr>`).join('')
    || '<tr><td colspan="6" class="empty">No registrations</td></tr>';
  $$('#rlist [data-a]').forEach(b => b.onclick = async () => {
    try { await api(`/registrations/${b.dataset.id}/${b.dataset.a}`, { method: 'POST' }); toast(b.dataset.a === 'approve' ? 'Approved and added' : 'Registration rejected'); loadRegs(); } catch (e) { toast(e.message); }
  });
}
$('#rf').onchange = renderRegs;
$('#regRole').onchange = e => { const s = e.target.value === 'Student'; $('#regStu').hidden = !s; $('#regTea').hidden = s; };
$('#fReg').elements.year.onchange = e => fillSections($('#regSec'), e.target.value, 'Auto');
$('#addReg').onclick = async () => { await settings(); $('#fReg').reset(); fillSections($('#regSec'), $('#fReg').elements.year.value, 'Auto'); $('#regRole').onchange({ target: $('#regRole') }); $('#drErr').textContent = ''; $('#dReg').showModal(); };
$('#fReg').onsubmit = async e => {
  if (e.submitter?.value !== 'save') return;
  e.preventDefault();
  try { await api('/registrations', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); $('#dReg').close(); toast('Registration submitted'); $('#rf').value = 'Pending'; loadRegs(); }
  catch (err) { $('#drErr').textContent = err.message; }
};

// ---------- Settings ----------
let setYear = 1, setSem = 1, draft = null, draftStart = '';
const settingsDirty = () => !!draft && JSON.stringify(draft) !== draftStart;
async function loadSettings() {
  try {
    SET = null; await settings(); await loadTerms();
    const cur = TERMS.find(t => t.id === CUR_TERM);
    $('#curTerm').textContent = cur.label;
    $('#nextSem').disabled = cur.semester !== 1; $('#promoteBtn').disabled = cur.semester !== 2;
    $('#termHint').textContent = cur.semester === 1 ? 'When the 1st semester ends, start the 2nd semester. Grades stay with the term they were entered in.'
      : 'At the end of the school year, promote everyone: 1st–3rd Year move up one level and 4th Year students graduate.';
    $('#limHon').value = LIMITS.honors; $('#limRisk').value = LIMITS.risk; $('#limErr').textContent = '';
    if (!settingsDirty()) pickSetYear(setYear); else renderSettings();
  } catch (e) { toast(e.message); }
}
function pickSetYear(y) {
  setYear = +y; const s = SET[y];
  draft = { sections: s.sections.map(n => ({ name: n, from: n, count: s.counts?.[n] || 0 })), subjects: { 1: s.subjects[1].map(x => ({ ...x, from: x.subject })), 2: s.subjects[2].map(x => ({ ...x, from: x.subject })) } };
  draftStart = JSON.stringify(draft); $('#setErr').textContent = ''; renderSettings();
}
function renderSettings() {
  $$('#setYears button').forEach(b => b.classList.toggle('active', +b.dataset.y === setYear));
  $$('#semTabs button').forEach(b => b.classList.toggle('active', +b.dataset.sem === setSem));
  $('#secTitle').textContent = `${ord(setYear)} Year Sections`; $('#curTitle').textContent = `${ord(setYear)} Year Curriculum`;
  $('#secList').innerHTML = draft.sections.map((s, i) => `<div class="secrow"><input data-i="${i}" value="${esc(s.name)}" placeholder="Section name" aria-label="Section name" maxlength="30">
    <small>${s.from ? pl(s.count, 'student') : 'new'}</small><button type="button" class="btn danger sm" data-rm="${i}" title="Remove section">✕</button></div>`).join('') || '<p class="empty">No sections. Add one.</p>';
  const subs = draft.subjects[setSem];
  $('#subList').innerHTML = subs.map((s, i) => `<div class="subrow"><input data-i="${i}" data-k="subject" value="${esc(s.subject)}" placeholder="Subject name" aria-label="Subject" maxlength="60">
    <input data-i="${i}" data-k="units" type="number" min="0.5" max="10" step="0.5" value="${s.units}" aria-label="Units"><button type="button" class="btn danger sm" data-rm="${i}" title="Remove subject">✕</button></div>`).join('') || '<p class="empty">No subjects. Add one.</p>';
  sumUnits();
  $$('#secList input').forEach(i => i.oninput = () => { draft.sections[i.dataset.i].name = i.value; markDirty(); });
  $$('#secList [data-rm]').forEach(b => b.onclick = () => {
    const s = draft.sections[b.dataset.rm];
    if (s.count) { $('#setErr').textContent = `Section ${s.from} has ${pl(s.count, 'student')}. Move them to another section first (select them on the Students tab and use "Move to").`; return; }
    draft.sections.splice(b.dataset.rm, 1); renderSettings();
  });
  $$('#subList input').forEach(i => i.oninput = () => { subs[i.dataset.i][i.dataset.k] = i.dataset.k === 'units' ? +i.value : i.value; sumUnits(); });
  $$('#subList [data-rm]').forEach(b => b.onclick = () => { subs.splice(b.dataset.rm, 1); renderSettings(); });
}
function markDirty() { $('#setSave').textContent = settingsDirty() ? 'Save settings •' : 'Save settings'; }
function sumUnits() {
  markDirty();
  const l = draft.subjects[setSem].filter(s => s.subject.trim());
  $('#curSum').textContent = `${semName(setSem)}: ${pl(l.length, 'subject')} · ${l.reduce((t, s) => t + (+s.units || 0), 0)} units. Students start the semester with these subjects.`;
}
$$('#setYears button').forEach(b => b.onclick = () => { if (+b.dataset.y === setYear) return; if (settingsDirty() && !confirm(`You have unsaved changes to ${ord(setYear)} Year settings. Switch years and discard them?`)) return; pickSetYear(b.dataset.y); });
$$('#semTabs button').forEach(b => b.onclick = () => { setSem = +b.dataset.sem; renderSettings(); });
$('#addSec').onclick = () => { draft.sections.push({ name: '', from: '', count: 0 }); renderSettings(); $('#secList .secrow:last-child input').focus(); };
$('#addSub').onclick = () => { draft.subjects[setSem].push({ subject: '', units: 3, from: '' }); renderSettings(); $('#subList .subrow:last-child input').focus(); };
$('#setReset').onclick = () => { if (settingsDirty() && !confirm('Discard your unsaved changes?')) return; pickSetYear(setYear); };
const settingsBody = (extra = {}) => ({ sections: draft.sections.map(({ name, from }) => ({ name, from })),
  subjects: { 1: draft.subjects[1].map(({ subject, units, from }) => ({ subject, units, from })), 2: draft.subjects[2].map(({ subject, units, from }) => ({ subject, units, from })) }, ...extra });

// Shared confirmation dialog. Resolves to the form values or null when cancelled.
function confirmDialog({ title, intro, items, gradesText, ok }) {
  $('#fConfirm').reset();
  $('#cfTitle').textContent = title; $('#cfIntro').textContent = intro || 'This change affects existing records:';
  $('#cfList').innerHTML = items.map(t => `<li>${t}</li>`).join('');
  $('#cfGrades').hidden = !gradesText; $('#cfGradesText').innerHTML = gradesText || '';
  $('#cfOk').textContent = ok || 'Save changes';
  return new Promise(res => { const d = $('#dConfirm'); d.onclose = () => res(d.returnValue === 'ok' ? { removed_grades: $('#fConfirm').elements.removed_grades.value } : null); d.returnValue = ''; d.showModal(); });
}
function confirmImpact(p) {
  const items = [], sem = s => ` (${semName(s.sem)})`;
  for (const s of p.renamedSections) items.push(`Section <b>${esc(s.from)}</b> will be renamed to <b>${esc(s.to)}</b>. Its students, teacher classes and pending registrations move with it.`);
  for (const s of p.removedSections) {
    if (s.registrations) items.push(`Section <b>${esc(s.name)}</b> is removed. ${pl(s.registrations, 'pending registration')} for it will be set to <b>Auto</b>.`);
    if (s.assignments) items.push(`Section <b>${esc(s.name)}</b> is removed, so ${pl(s.assignments, 'teacher class')} for it will be removed.`);
  }
  for (const s of p.renamedSubjects) if (s.students) items.push(`<b>${esc(s.from)}</b>${sem(s)} will be renamed to <b>${esc(s.to)}</b> in the grades of ${pl(s.students, 'student')}.`);
  for (const s of p.unitChanges) if (s.students) items.push(`<b>${esc(s.subject)}</b>${sem(s)} changes from ${s.from} to ${s.to} units. The GWA of ${pl(s.students, 'student')} will be recalculated.`);
  for (const s of p.removedSubjects) if (s.assignments) items.push(`<b>${esc(s.subject)}</b> is removed${sem(s)}. Teacher classes for it are removed if it isn't in the other semester.`);
  const graded = p.removedSubjects.filter(s => s.students);
  if (!items.length && !graded.length) return Promise.resolve({});
  return confirmDialog({ title: `Save ${ord(setYear)} Year settings?`, items, gradesText: graded.length ? graded.map(s => `<b>${esc(s.subject)}</b>${sem(s)}: ${pl(s.students, 'student')}`).join(', ') : '' });
}
$('#setSave').onclick = async () => {
  $('#setErr').textContent = ''; const btn = $('#setSave'); if (btn.disabled) return; btn.disabled = true;
  try {
    const p = await api(`/settings/${setYear}/preview`, { method: 'POST', body: settingsBody() });
    const ok = await confirmImpact(p); if (!ok) return;
    await api('/settings/' + setYear, { method: 'PUT', body: settingsBody(ok) });
    toast(`${ord(setYear)} Year settings saved`); SET = null; await settings(); pickSetYear(setYear);
  } catch (e) { $('#setErr').textContent = e.message; } finally { btn.disabled = false; }
};
$('#limSave').onclick = async () => {
  $('#limErr').textContent = '';
  try { await api('/config', { method: 'PUT', body: { honors: $('#limHon').value, risk: $('#limRisk').value } }); LIMITS = await api('/config'); toast('Grading limits saved'); }
  catch (e) { $('#limErr').textContent = e.message; }
};
$('#nextSem').onclick = async () => {
  const cur = TERMS.find(t => t.id === CUR_TERM);
  const ok = await confirmDialog({ title: 'Start the 2nd semester?', intro: `The current term changes from ${cur.label}:`, ok: 'Start 2nd Semester',
    items: ['New grades go to the 2nd semester. 1st semester grades are kept and still count toward the overall GWA.', 'Students stay in their year level and section.', 'You can still view and correct 1st semester grades using the term picker at the top.'] });
  if (!ok) return;
  try { const r = await api('/terms/next-semester', { method: 'POST' }); VIEW_TERM = null; await loadSettings(); toast(`Current term is now ${r.term}`); } catch (e) { toast(e.message); }
};
$('#promoteBtn').onclick = async () => {
  try {
    const p = await api('/terms/promote/preview');
    const items = p.moves.map(m => m.year === 4 ? `<b>${pl(m.students, 'student')}</b> in 4th Year will <b>graduate</b> (moved to the Graduated list).` : `<b>${pl(m.students, 'student')}</b> in ${ord(m.year)} Year move up to <b>${ord(m.year + 1)} Year</b>, keeping their section name when it exists.`);
    if (p.ungraded) items.push(`<span class="bad"><b>${pl(p.ungraded, 'student')}</b> ${p.ungraded === 1 ? 'has' : 'have'} no grades in ${esc(p.from)} yet.</span> Enter them first on the Grade Sheet if needed.`);
    items.push(`The current term becomes <b>${esc(p.to)}</b>. All past grades are kept.`);
    const ok = await confirmDialog({ title: 'End the school year and promote students?', intro: 'This will:', items, ok: 'Promote students' });
    if (!ok) return;
    const r = await api('/terms/promote', { method: 'POST' });
    VIEW_TERM = null; await loadSettings();
    toast(`${pl(r.promoted, 'student')} promoted, ${r.graduated} graduated. Current term: ${r.term}`);
  } catch (e) { toast(e.message); }
};

// ---------- Login (front-end only, NOT secure: replace with real auth when you add a backend) ----------
async function showApp(on) {
  $('#app').hidden = !on; $('#loginView').hidden = on;
  if (!on) return;
  await loadTerms();
  const t = location.hash.slice(1);
  show(TITLES[t] ? t : 'dashboard');
  const n = DB.takeNotice(); if (n) toast(n);
}
$('#loginForm').onsubmit = e => {
  e.preventDefault();
  if (DB.login($('#u').value, $('#p').value)) { $('#loginErr').textContent = ''; e.target.reset(); showApp(true); }
  else $('#loginErr').textContent = 'Invalid username or password.';
};
$('#logoutBtn').onclick = () => { if (!leaveOk()) return; DB.logout(); history.replaceState(null, '', location.pathname); showApp(false); };
showApp(DB.isLoggedIn());

// Last safety net: show unexpected errors instead of failing silently
window.addEventListener('unhandledrejection', e => { e.preventDefault(); toast(e.reason?.message || 'Something went wrong. Please try again.'); });
window.addEventListener('error', e => toast('Something went wrong: ' + (e.message || 'unknown error')));
