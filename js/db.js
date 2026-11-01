/*
 * Data layer for the GWA Tracker (static version).
 *
 * Everything is saved in this browser's localStorage, so data is per-browser
 * and per-device. The app only talks to the data through api(path, options),
 * using the same routes a real backend would expose (query strings are allowed
 * on GET, e.g. /students?term=2):
 *
 *   GET  /terms                        POST /terms/next-semester   POST /terms/promote
 *   GET  /terms/promote/preview        PUT  /terms/current {term_id}
 *   GET  /config                       PUT  /config {honors, risk}
 *   GET  /settings                     PUT  /settings/:year        POST /settings/:year/preview
 *   GET  /stats?term=
 *   GET  /students?term=&status=       POST /students              POST /students/import
 *   GET  /students/:id?term=           PUT  /students/:id          DELETE /students/:id   (archive)
 *   POST /students/:id/restore         DELETE /students/:id/permanent
 *   POST /students/move {ids, section} POST /students/archive {ids}
 *   GET  /gradesheet?term=&year=&section=&subject=                  PUT  /gradesheet
 *   GET  /teachers                     POST /teachers              PUT|DELETE /teachers/:id
 *   GET  /assignments                  POST /assignments           DELETE /assignments/:id
 *   GET  /registrations                POST /registrations         POST /registrations/:id/approve | /reject
 *
 * When you add a database, build these routes on your server and replace api() with:
 *   async function api(path, opt = {}) {
 *     const r = await fetch('/api' + path, { method: opt.method || 'GET',
 *       headers: { 'Content-Type': 'application/json' },
 *       body: opt.body && JSON.stringify(opt.body) });
 *     const d = await r.json().catch(() => ({}));
 *     if (!r.ok) throw new Error(d.error || 'Request failed');
 *     return d;
 *   }
 */
(function () {
  const KEY = 'gwa-tracker-data-v3'; // v3: school terms, per-semester curriculum, teacher assignments, archive
  const OLD_KEY = 'gwa-tracker-data-v2';
  const SESSION = 'gwa-tracker-session';
  // Demo-only credentials. Anyone can read these, so this is not real security.
  const ADMIN_USER = 'admin', ADMIN_PASS = 'admin123';
  const YEARS = [1, 2, 3, 4], SEMS = [1, 2];
  const MAX_UNITS = 10, MAX_NAME = 60, MAX_SECTION = 30;

  // Default subjects and units per year level and semester. Admins change these on the Settings tab.
  const DEFAULT_CURRICULUM = {
    1: {
      1: [['Introduction to Computing', 3], ['Computer Programming 1', 3], ['Mathematics in the Modern World', 3],
          ['Purposive Communication', 3], ['Understanding the Self', 3], ['PE 1', 2], ['NSTP 1', 3]],
      2: [['Computer Programming 2', 3], ['Introduction to Human Computer Interaction', 3], ['Science, Technology and Society', 3],
          ['Art Appreciation', 3], ['Life and Works of Rizal', 3], ['PE 2', 2], ['NSTP 2', 3]],
    },
    2: {
      1: [['Data Structures and Algorithms', 3], ['Object-Oriented Programming', 3], ['Discrete Mathematics', 3],
          ['Database Systems 1', 3], ['Networking 1', 3], ['Readings in Philippine History', 3], ['PE 3', 2]],
      2: [['Platform Technologies', 3], ['Database Systems 2', 3], ['Networking 2', 3], ['Web Development', 3],
          ['The Contemporary World', 3], ['Ethics', 3], ['PE 4', 2]],
    },
    3: {
      1: [['Web Systems and Technologies', 3], ['Information Management', 3], ['Systems Analysis and Design', 3],
          ['Applications Development', 3], ['Information Assurance and Security', 3], ['Quantitative Methods', 3]],
      2: [['Capstone Project 1', 3], ['Mobile Application Development', 3], ['Integrative Programming', 3],
          ['IT Elective 1', 3], ['IT Elective 2', 3], ['Technopreneurship', 3]],
    },
    4: {
      1: [['Capstone Project 2', 3], ['Systems Administration and Maintenance', 3], ['Social and Professional Issues', 3], ['IT Elective 3', 3]],
      2: [['Practicum (OJT)', 6], ['IT Elective 4', 3], ['Seminars and Field Trips', 2]],
    },
  };
  const defaultSubjects = (y, sem) => DEFAULT_CURRICULUM[y][sem].map(([subject, units]) => ({ subject, units }));
  const defaultSettings = () => Object.fromEntries(YEARS.map(y => [y, { sections: ['A', 'B', 'C'], subjects: { 1: defaultSubjects(y, 1), 2: defaultSubjects(y, 2) } }]));
  const defaultConfig = () => ({ honors: 1.75, risk: 2.75, current_term: null });

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }, // false = storage full or blocked
    del(k) { try { localStorage.removeItem(k); } catch (e) {} },
  };

  // ---------- demo data ----------
  function rng(seed) { return () => (seed = (seed * 16807) % 2147483647) / 2147483647; } // same demo data every time

  function seed() {
    const r = rng(24), pick = a => a[Math.floor(r() * a.length)];
    const boys = ['Christian', 'Miguel', 'Vincent', 'Rafael', 'Joaquin', 'Adrian', 'Paolo', 'Gabriel', 'Nathan', 'Carlo', 'Luis', 'Marco'];
    const girls = ['Patricia', 'Bea', 'Camille', 'Hannah', 'Francesca', 'Katrina', 'Andrea', 'Bianca', 'Isabel', 'Sofia', 'Erika', 'Nicole'];
    const lasts = ['Bautista', 'Bernardo', 'Castillo', 'Garcia', 'Morales', 'Magbanua', 'Salazar', 'Delos Santos', 'Manalo', 'Reyes', 'Cruz', 'Villanueva'];
    const grades = [1.0, 1.25, 1.5, 1.75, 2.0, 2.25, 2.5, 2.75, 3.0];
    const d = { seq: { s: 0, t: 0, g: 0, r: 0, term: 2, a: 0 }, students: [], teachers: [], grades: [], registrations: [], assignments: [],
      terms: [{ id: 1, school_year: '2025-2026', semester: 2 }, { id: 2, school_year: '2026-2027', semester: 1 }],
      settings: defaultSettings(), config: { ...defaultConfig(), current_term: 2 } };
    let n = 0;
    for (const year of YEARS) {
      const prefix = '0' + (26 - year);
      for (const section of 'ABC') for (const [gender, names] of [['Male', boys], ['Female', girls]]) for (let i = 0; i < 2; i++) {
        const num = String(n).padStart(4, '0');
        const s = { id: ++d.seq.s, student_id: `${prefix}-${num}`, first_name: pick(names), last_name: pick(lasts),
          email: `demo.student.${prefix}${num}@example.invalid`, gender, year, section, status: 'active' };
        d.students.push(s);
        for (const [subject, units] of DEFAULT_CURRICULUM[year][1]) d.grades.push({ id: ++d.seq.g, student_id: s.id, term_id: 2, year, subject, units, grade: pick(grades) });
        // last school year's 2nd semester, taken one year level lower
        if (year > 1) for (const [subject, units] of DEFAULT_CURRICULUM[year - 1][2]) d.grades.push({ id: ++d.seq.g, student_id: s.id, term_id: 1, year: year - 1, subject, units, grade: pick(grades) });
        n++;
      }
    }
    for (const [name, department, subject] of [['Prof. Elena Ramos', 'IT', 'Programming'], ['Prof. Jose Mercado', 'Math', 'Mathematics'],
      ['Prof. Liza Aquino', 'Languages', 'English'], ['Prof. Ramon Torres', 'Science', 'Science']])
      d.teachers.push({ id: ++d.seq.t, name, email: name.split(' ').pop().toLowerCase() + '@example.invalid', department, subject });
    for (const [teacher_id, year, section, subject] of [[1, 1, 'A', 'Computer Programming 1'], [1, 1, 'B', 'Computer Programming 1'],
      [2, 1, 'A', 'Mathematics in the Modern World'], [3, 1, 'A', 'Purposive Communication'], [1, 2, 'A', 'Object-Oriented Programming']])
      d.assignments.push({ id: ++d.seq.a, teacher_id, year, section, subject });
    for (const [role, first_name, last_name, email, gender, year, section, subject] of [
      ['Student', 'Aaron', 'Lim', 'aaron.lim@example.invalid', 'Male', 1, 'A', null],
      ['Student', 'Clarisse', 'Tan', 'clarisse.tan@example.invalid', 'Female', 2, 'B', null],
      ['Teacher', 'Mario', 'Santiago', 'm.santiago@example.invalid', null, null, null, 'Filipino']])
      d.registrations.push({ id: ++d.seq.r, role, first_name, last_name, email, gender, year, section, subject, status: 'Pending', created_at: new Date().toISOString() });
    return d;
  }

  // ---------- load, upgrade and repair saved data ----------
  const valid = x => x && ['students', 'teachers', 'grades', 'registrations'].every(k => Array.isArray(x[k])) && x.seq;
  function upgrade(d) {
    d.seq = { s: 0, t: 0, g: 0, r: 0, term: 0, a: 0, ...d.seq };
    if (!Array.isArray(d.assignments)) d.assignments = [];
    if (!Array.isArray(d.terms) || !d.terms.length) { d.terms = [{ id: ++d.seq.term, school_year: '2026-2027', semester: 1 }]; }
    d.config = { ...defaultConfig(), ...(d.config || {}) };
    if (!d.terms.some(t => t.id === d.config.current_term)) d.config.current_term = d.terms[d.terms.length - 1].id;
    if (!d.settings) d.settings = defaultSettings();
    for (const y of YEARS) {
      const s = d.settings[y] || (d.settings[y] = {});
      if (!Array.isArray(s.sections) || !s.sections.length) s.sections = ['A', 'B', 'C'];
      // v2 had one subject list per year; it becomes the 1st semester list
      if (Array.isArray(s.subjects)) s.subjects = { 1: s.subjects, 2: defaultSubjects(y, 2) };
      if (!s.subjects || typeof s.subjects !== 'object') s.subjects = {};
      for (const sem of SEMS) if (!Array.isArray(s.subjects[sem])) s.subjects[sem] = defaultSubjects(y, sem);
    }
    const byId = Object.fromEntries(d.students.map(s => [s.id, s]));
    for (const s of d.students) if (!s.status) s.status = 'active';
    for (const g of d.grades) {
      if (!g.term_id) g.term_id = d.config.current_term;
      if (!g.year) g.year = byId[g.student_id]?.year || 1;
    }
    return d;
  }

  let data, notice = null;
  try { data = JSON.parse(store.get(KEY)); } catch (e) { data = null; }
  if (!data) { try { const old = JSON.parse(store.get(OLD_KEY)); if (valid(old)) { data = old; notice = 'Your saved data was upgraded to support school terms.'; } } catch (e) {} }
  if (!valid(data)) { if (data) notice = 'Saved data was damaged, so demo data was restored.'; data = seed(); }
  data = upgrade(data);

  class ApiError extends Error {}
  const fail = msg => { throw new ApiError(msg); };
  const save = () => { if (!store.set(KEY, JSON.stringify(data))) fail("Couldn't save: this browser's storage is full or blocked. Your change was not kept."); };
  try { save(); } catch (e) { console.warn(e.message); }

  // ---------- helpers ----------
  const clone = o => JSON.parse(JSON.stringify(o));
  const blank = v => v === undefined || v === null || String(v).trim() === '';
  const pl = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const ordY = y => ['', '1st', '2nd', '3rd', '4th'][y] || y + 'th';
  const lc = s => String(s).trim().toLowerCase();
  function required(body, keys) {
    const missing = keys.filter(k => blank(body[k]));
    if (missing.length) fail('Missing: ' + missing.join(', ').replace(/_/g, ' '));
  }
  const termById = id => data.terms.find(t => t.id === +id);
  const currentTerm = () => termById(data.config.current_term);
  const termOf = q => termById(q.term) || currentTerm();
  const termLabel = t => `SY ${t.school_year} · ${t.semester === 1 ? '1st' : '2nd'} Sem`;
  const sectionsOf = year => (data.settings[year] || { sections: [] }).sections;
  const subjectsOf = (year, sem) => ((data.settings[year] || {}).subjects || {})[sem] || [];
  const active = s => s.status === 'active';

  const round2 = x => Math.round(x * 100) / 100;
  function gwaFrom(list) { let w = 0, u = 0; for (const g of list) { w += g.grade * g.units; u += g.units; } return u ? round2(w / u) : null; }
  // GWA per student for one term, plus the cumulative GWA over every term
  function gwaMaps(termId) {
    const term = {}, all = {};
    for (const g of data.grades) {
      (all[g.student_id] ||= []).push(g);
      if (g.term_id === termId) (term[g.student_id] ||= []).push(g);
    }
    const f = m => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, gwaFrom(v)]));
    return { term: f(term), all: f(all) };
  }
  const standing = g => g == null ? 'none' : g <= data.config.honors ? 'honors' : g > data.config.risk ? 'risk' : 'regular';

  const findStudent = id => data.students.find(s => s.id === +id) || fail('Student not found.');
  const idTaken = (sid, exceptId) => data.students.some(s => lc(s.student_id) === lc(sid) && s.id !== exceptId);

  function studentFields(b) {
    required(b, ['student_id', 'first_name', 'last_name', 'email', 'gender', 'year', 'section']);
    const year = +b.year;
    if (!YEARS.includes(year)) fail('Year level must be 1 to 4.');
    if (!['Male', 'Female'].includes(b.gender)) fail('Gender must be Male or Female.');
    const section = String(b.section).trim();
    if (!sectionsOf(year).includes(section)) fail(`Section "${section}" doesn't exist in ${ordY(year)} Year. Add it on the Settings tab.`);
    const email = String(b.email).trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(`"${email}" is not a valid email address.`);
    for (const k of ['student_id', 'first_name', 'last_name']) if (String(b[k]).trim().length > MAX_NAME) fail(`${k.replace('_', ' ')} is too long.`);
    return { student_id: String(b.student_id).trim(), first_name: String(b.first_name).trim(), last_name: String(b.last_name).trim(),
      email, gender: b.gender, year, section };
  }

  // Grade rows from a form: keeps rows with a subject and a grade. Returns null when no grades were sent.
  function parseGrades(list) {
    if (!Array.isArray(list)) return null;
    const out = list.filter(g => !blank(g.subject) && !blank(g.grade)).map(g => {
      const subject = String(g.subject).trim(), grade = +g.grade, units = blank(g.units) ? 3 : +g.units;
      if (!(grade >= 1 && grade <= 5)) fail(`Grade for "${subject}" must be between 1.00 and 5.00.`);
      if (!(units > 0 && units <= MAX_UNITS)) fail(`Units for "${subject}" must be more than 0 and at most ${MAX_UNITS}.`);
      return { subject, units, grade };
    });
    const seen = new Set();
    for (const g of out) { if (seen.has(lc(g.subject))) fail(`"${g.subject}" is listed twice. Keep one grade per subject.`); seen.add(lc(g.subject)); }
    return out;
  }
  function replaceTermGrades(studentId, term, year, grades) {
    data.grades = data.grades.filter(g => !(g.student_id === studentId && g.term_id === term.id));
    for (const g of grades) data.grades.push({ id: ++data.seq.g, student_id: studentId, term_id: term.id, year, ...g });
  }

  // Least-filled section of a year level (used when a section isn't chosen)
  function leastFilled(year, prefer) {
    const secs = sectionsOf(year);
    if (!secs.length) fail(`${ordY(year)} Year has no sections. Add one on the Settings tab first.`);
    if (prefer && secs.includes(prefer)) return prefer;
    const counts = Object.fromEntries(secs.map(x => [x, 0]));
    for (const s of data.students) if (active(s) && s.year === year && s.section in counts) counts[s.section]++;
    return secs.reduce((a, b) => counts[b] < counts[a] ? b : a);
  }
  function nextStudentId(year) {
    const prefix = '0' + (26 - year);
    let n = data.students.length, sid;
    do sid = `${prefix}-${String(n++).padStart(4, '0')}`; while (idTaken(sid));
    return sid;
  }

  // ---------- settings planning (shared by preview and save) ----------
  function planSettings(year, b) {
    const cur = data.settings[year];
    const secs = (b.sections || []).map(x => ({ name: String(x.name || '').trim(), from: String(x.from || '').trim() }));
    if (!secs.length) fail('A year level needs at least one section.');
    if (secs.some(x => !x.name)) fail('Section names cannot be empty.');
    if (secs.some(x => x.name.length > MAX_SECTION)) fail(`Section names can be at most ${MAX_SECTION} characters.`);
    const names = secs.map(x => lc(x.name));
    const dupS = names.find((n, i) => names.indexOf(n) !== i);
    if (dupS) fail(`There are two sections named "${secs[names.indexOf(dupS)].name}". Section names must be different.`);
    for (const x of secs) if (x.from && !cur.sections.includes(x.from)) fail('Settings changed somewhere else. Reload the page and try again.');

    const subs = {};
    for (const sem of SEMS) {
      const semName = sem === 1 ? '1st semester' : '2nd semester';
      subs[sem] = ((b.subjects || {})[sem] || []).filter(x => !blank(x.subject)).map(x => ({ subject: String(x.subject).trim(), units: +x.units, from: String(x.from || '').trim() }));
      if (!subs[sem].length) fail(`The ${semName} needs at least one subject.`);
      for (const x of subs[sem]) {
        if (x.subject.length > MAX_NAME) fail(`Subject names can be at most ${MAX_NAME} characters.`);
        if (!(x.units > 0 && x.units <= MAX_UNITS)) fail(`Units for "${x.subject}" (${semName}) must be more than 0 and at most ${MAX_UNITS}.`);
      }
      const sn = subs[sem].map(x => lc(x.subject));
      const dup = sn.find((n, i) => sn.indexOf(n) !== i);
      if (dup) fail(`"${subs[sem][sn.indexOf(dup)].subject}" is listed twice in the ${semName}.`);
    }

    // grades recorded at this year level in a term of this semester
    const gradesFor = (sem, subj) => data.grades.filter(g => g.year === year && termById(g.term_id)?.semester === sem && lc(g.subject) === lc(subj));
    const gradedCount = (sem, subj) => new Set(gradesFor(sem, subj).map(g => g.student_id)).size;

    const keptSecs = new Set(secs.map(x => x.from).filter(Boolean));
    const removedSections = cur.sections.filter(s => !keptSecs.has(s)).map(name => ({
      name, students: data.students.filter(s => active(s) && s.year === year && s.section === name).length,
      registrations: data.registrations.filter(r => r.status === 'Pending' && +r.year === year && r.section === name).length,
      assignments: data.assignments.filter(a => a.year === year && a.section === name).length }));
    const blocked = removedSections.find(s => s.students);
    if (blocked) fail(`Section ${blocked.name} still has ${pl(blocked.students, 'student')}. Move them to another section before removing it.`);
    const renamedSections = secs.filter(x => x.from && x.from !== x.name).map(x => ({ from: x.from, to: x.name }));

    const removedSubjects = [], renamedSubjects = [], unitChanges = [];
    for (const sem of SEMS) {
      const kept = new Set(subs[sem].map(x => x.from).filter(Boolean));
      for (const s of cur.subjects[sem]) if (!kept.has(s.subject))
        removedSubjects.push({ sem, subject: s.subject, students: gradedCount(sem, s.subject), assignments: data.assignments.filter(a => a.year === year && lc(a.subject) === lc(s.subject)).length });
      for (const x of subs[sem]) {
        if (x.from && x.from !== x.subject) renamedSubjects.push({ sem, from: x.from, to: x.subject, students: gradedCount(sem, x.from) });
        const old = cur.subjects[sem].find(s => s.subject === x.from);
        if (old && old.units !== x.units) unitChanges.push({ sem, subject: x.subject, from: old.units, to: x.units, students: gradedCount(sem, x.from) });
      }
    }
    return { secs, subs, removedSections, renamedSections, removedSubjects, renamedSubjects, unitChanges };
  }

  function promotePlan() {
    const t = currentTerm();
    if (t.semester !== 2) fail('Promotion happens at the end of the school year. Start the 2nd semester first.');
    const list = data.students.filter(active);
    const ungraded = list.filter(s => !data.grades.some(g => g.student_id === s.id && g.term_id === t.id)).length;
    const [a, b] = t.school_year.split('-').map(Number);
    return { from: termLabel(t), to: `SY ${a + 1}-${b + 1} · 1st Sem`, next_year: `${a + 1}-${b + 1}`,
      moves: YEARS.map(y => ({ year: y, students: list.filter(s => s.year === y).length })), ungraded };
  }

  // ---------- routes ----------
  const routes = [
    // terms and grading thresholds
    ['GET', /^\/terms$/, () => ({ terms: clone(data.terms).map(t => ({ ...t, label: termLabel(t) })).reverse(), current: data.config.current_term })],
    ['PUT', /^\/terms\/current$/, (m, b) => { const t = termById(b.term_id) || fail('Term not found.'); data.config.current_term = t.id; save(); return { message: 'OK' }; }],
    ['POST', /^\/terms\/next-semester$/, () => {
      const t = currentTerm();
      if (t.semester !== 1) fail('The current term is already the 2nd semester. Use "End school year & promote" instead.');
      let next = data.terms.find(x => x.school_year === t.school_year && x.semester === 2);
      if (!next) data.terms.push(next = { id: ++data.seq.term, school_year: t.school_year, semester: 2 });
      data.config.current_term = next.id; save(); return { term: termLabel(next) };
    }],
    ['GET', /^\/terms\/promote\/preview$/, () => promotePlan()],
    ['POST', /^\/terms\/promote$/, () => {
      const p = promotePlan();
      let next = data.terms.find(x => x.school_year === p.next_year && x.semester === 1);
      if (!next) data.terms.push(next = { id: ++data.seq.term, school_year: p.next_year, semester: 1 });
      let graduated = 0, promoted = 0;
      // 4th year first so sections fill in a stable order
      for (const s of [...data.students].filter(active).sort((a, b) => b.year - a.year)) {
        if (s.year === 4) { s.status = 'graduated'; s.status_at = new Date().toISOString(); graduated++; continue; }
        promoted++; s.year += 1;
        s.section = sectionsOf(s.year).includes(s.section) ? s.section : leastFilled(s.year);
      }
      data.config.current_term = next.id; save();
      return { term: termLabel(next), promoted, graduated };
    }],
    ['GET', /^\/config$/, () => ({ honors: data.config.honors, risk: data.config.risk })],
    ['PUT', /^\/config$/, (m, b) => {
      const honors = +b.honors, risk = +b.risk;
      if (blank(b.honors) || blank(b.risk) || !(honors >= 1 && honors <= 5) || !(risk >= 1 && risk <= 5)) fail('Limits must be between 1.00 and 5.00.');
      if (!(honors < risk)) fail('The honors limit must be better (lower) than the at-risk limit.');
      data.config.honors = round2(honors); data.config.risk = round2(risk); save(); return { message: 'Saved' };
    }],

    // sections and curriculum
    ['GET', /^\/settings$/, () => {
      const out = clone(data.settings);
      for (const y in out) out[y].counts = Object.fromEntries(out[y].sections.map(sec => [sec, data.students.filter(s => active(s) && s.year === +y && s.section === sec).length]));
      return out;
    }],
    ['POST', /^\/settings\/([1-4])\/preview$/, (m, b) => {
      const { secs, subs, ...impact } = planSettings(+m[1], b); return impact;
    }],
    // body: { sections: [{ name, from }], subjects: { 1: [{ subject, units, from }], 2: [...] }, removed_grades: 'keep' | 'delete' }
    ['PUT', /^\/settings\/([1-4])$/, (m, b) => {
      const year = +m[1], p = planSettings(year, b);
      const secMap = Object.fromEntries(p.renamedSections.map(x => [x.from, x.to]));
      const gone = new Set(p.removedSections.map(x => x.name));
      for (const s of data.students) if (s.year === year && s.section in secMap) s.section = secMap[s.section];
      for (const r of data.registrations) if (r.status === 'Pending' && +r.year === year) {
        if (r.section in secMap) r.section = secMap[r.section];
        else if (gone.has(r.section)) r.section = null; // becomes "Auto"
      }
      data.assignments = data.assignments.filter(a => !(a.year === year && gone.has(a.section)));
      for (const a of data.assignments) if (a.year === year && a.section in secMap) a.section = secMap[a.section];
      for (const sem of SEMS) {
        const inSem = g => g.year === year && termById(g.term_id)?.semester === sem;
        const ren = Object.fromEntries(p.renamedSubjects.filter(x => x.sem === sem).map(x => [lc(x.from), x.to]));
        const units = Object.fromEntries(p.subs[sem].map(x => [lc(x.subject), x.units]));
        const removed = new Set(p.removedSubjects.filter(x => x.sem === sem).map(x => lc(x.subject)));
        if (b.removed_grades === 'delete') data.grades = data.grades.filter(g => !(inSem(g) && removed.has(lc(g.subject))));
        for (const g of data.grades) if (inSem(g)) {
          if (lc(g.subject) in ren) g.subject = ren[lc(g.subject)];
          if (lc(g.subject) in units) g.units = units[lc(g.subject)];
        }
        for (const a of data.assignments) if (a.year === year && lc(a.subject) in ren) a.subject = ren[lc(a.subject)];
      }
      // a subject removed from both semesters has no classes left to teach
      const allSubjects = new Set(SEMS.flatMap(sem => p.subs[sem].map(x => lc(x.subject))));
      data.assignments = data.assignments.filter(a => a.year !== year || allSubjects.has(lc(a.subject)));
      data.settings[year] = { sections: p.secs.map(x => x.name), subjects: Object.fromEntries(SEMS.map(sem => [sem, p.subs[sem].map(({ subject, units }) => ({ subject, units }))])) };
      save(); return { message: 'Saved' };
    }],

    // dashboard
    ['GET', /^\/stats$/, (m, b, q) => {
      const t = termOf(q), { term } = gwaMaps(t.id), list = data.students.filter(active);
      const by_year = Object.fromEntries(YEARS.map(y => [y, { total: 0, Male: 0, Female: 0 }]));
      for (const s of list) { const x = by_year[s.year]; x.total++; x[s.gender]++; }
      const graded = list.filter(s => term[s.id] != null).map(s => ({ ...clone(s), gwa: term[s.id] }));
      const gwas = graded.map(s => s.gwa);
      return {
        term: termLabel(t), total: list.length,
        male: list.filter(s => s.gender === 'Male').length, female: list.filter(s => s.gender === 'Female').length,
        teachers: data.teachers.length, pending: data.registrations.filter(r => r.status === 'Pending').length,
        average_gwa: gwas.length ? round2(gwas.reduce((a, b) => a + b, 0) / gwas.length) : null,
        by_year, top: graded.sort((a, b) => a.gwa - b.gwa).slice(0, 5),
        honors: gwas.filter(g => standing(g) === 'honors').length, at_risk: gwas.filter(g => standing(g) === 'risk').length,
        ungraded: list.length - graded.length, archived: data.students.filter(s => s.status === 'archived').length,
        limits: { honors: data.config.honors, risk: data.config.risk },
      };
    }],

    // students
    ['GET', /^\/students$/, (m, b, q) => {
      const t = termOf(q), g = gwaMaps(t.id), status = q.status || 'active';
      return data.students.filter(s => s.status === status).map(s => ({ ...clone(s), gwa: g.term[s.id] ?? null, cgwa: g.all[s.id] ?? null, standing: standing(g.term[s.id]) }))
        .sort((a, b) => a.year - b.year || a.section.localeCompare(b.section) || a.last_name.localeCompare(b.last_name));
    }],
    ['POST', /^\/students$/, (m, b) => {
      const f = studentFields(b);
      if (idTaken(f.student_id)) fail(`Student ID ${f.student_id} already exists.`);
      const t = termOf({ term: b.term_id }), grades = parseGrades(b.grades);
      const s = { id: ++data.seq.s, ...f, status: 'active' }; data.students.push(s);
      if (grades) replaceTermGrades(s.id, t, s.year, grades);
      save(); return { id: s.id };
    }],
    // body: { rows: [{ student_id, first_name, last_name, email, gender, year, section }] }. All rows are checked first; nothing is added if any row is wrong.
    ['POST', /^\/students\/import$/, (m, b) => {
      const rows = Array.isArray(b.rows) ? b.rows : fail('No rows to import.');
      if (!rows.length) fail('The file has no student rows.');
      if (rows.length > 2000) fail('Import at most 2000 students at a time.');
      const errors = [], seen = new Set();
      const ready = rows.map((r, i) => {
        try {
          const g = lc(r.gender || '');
          const row = { ...r, gender: ['m', 'male', 'boy'].includes(g) ? 'Male' : ['f', 'female', 'girl'].includes(g) ? 'Female' : r.gender };
          if (blank(row.student_id)) row.student_id = '(auto)';
          if (blank(row.section) && YEARS.includes(+row.year)) row.section = leastFilled(+row.year);
          const f = studentFields(row);
          if (f.student_id !== '(auto)') {
            if (idTaken(f.student_id) || seen.has(lc(f.student_id))) fail(`Student ID ${f.student_id} already exists.`);
            seen.add(lc(f.student_id));
          }
          return f;
        } catch (e) { if (!(e instanceof ApiError)) throw e; errors.push(`Row ${i + 2}: ${e.message}`); return null; }
      });
      if (errors.length) fail(`Nothing was imported. Fix these rows and try again:\n${errors.slice(0, 8).join('\n')}${errors.length > 8 ? `\n…and ${errors.length - 8} more.` : ''}`);
      for (const f of ready) {
        if (f.student_id === '(auto)') f.student_id = nextStudentId(f.year);
        data.students.push({ id: ++data.seq.s, ...f, status: 'active' });
      }
      save(); return { imported: ready.length };
    }],
    ['POST', /^\/students\/move$/, (m, b) => {
      const list = (b.ids || []).map(findStudent);
      if (!list.length) fail('Select at least one student.');
      if (new Set(list.map(s => s.year)).size > 1) fail('Select students from one year level at a time.');
      const year = list[0].year, section = String(b.section || '').trim();
      if (!sectionsOf(year).includes(section)) fail(`Section "${section}" doesn't exist in ${ordY(year)} Year.`);
      for (const s of list) s.section = section;
      save(); return { moved: list.length };
    }],
    ['POST', /^\/students\/archive$/, (m, b) => {
      const list = (b.ids || []).map(findStudent);
      if (!list.length) fail('Select at least one student.');
      const at = new Date().toISOString();
      for (const s of list) { s.status = 'archived'; s.status_at = at; }
      save(); return { archived: list.length };
    }],
    ['GET', /^\/students\/(\d+)$/, (m, b, q) => {
      const s = findStudent(m[1]), t = termOf(q), g = gwaMaps(t.id);
      const history = data.terms.map(term => {
        const gr = data.grades.filter(x => x.student_id === s.id && x.term_id === term.id);
        return { term_id: term.id, label: termLabel(term), gwa: gwaFrom(gr), year: gr[0]?.year };
      }).filter(h => h.gwa != null).reverse();
      return { ...clone(s), gwa: g.term[s.id] ?? null, cgwa: g.all[s.id] ?? null, term_id: t.id, term_label: termLabel(t), semester: t.semester,
        taken_year: (data.grades.find(x => x.student_id === s.id && x.term_id === t.id) || {}).year || s.year,
        grades: clone(data.grades.filter(x => x.student_id === s.id && x.term_id === t.id)), history };
    }],
    ['PUT', /^\/students\/(\d+)$/, (m, b) => {
      const s = findStudent(m[1]), f = studentFields(b);
      if (idTaken(f.student_id, s.id)) fail(`Student ID ${f.student_id} already exists.`);
      const t = termOf({ term: b.term_id }), grades = parseGrades(b.grades);
      // grades keep the year level they were taken at: the term's existing value, or the student's (new) year
      const takenAt = (data.grades.find(g => g.student_id === s.id && g.term_id === t.id) || {}).year || f.year;
      Object.assign(s, f);
      if (grades) replaceTermGrades(s.id, t, takenAt, grades);
      save(); return { message: 'Updated' };
    }],
    ['DELETE', /^\/students\/(\d+)$/, m => { const s = findStudent(m[1]); s.status = 'archived'; s.status_at = new Date().toISOString(); save(); return { message: 'Archived' }; }],
    ['POST', /^\/students\/(\d+)\/restore$/, m => {
      const s = findStudent(m[1]);
      if (s.status === 'active') return { message: 'Already active' };
      if (!sectionsOf(s.year).includes(s.section)) s.section = leastFilled(s.year);
      s.status = 'active'; delete s.status_at; save(); return { message: 'Restored', section: s.section };
    }],
    ['DELETE', /^\/students\/(\d+)\/permanent$/, m => {
      const s = findStudent(m[1]);
      if (s.status === 'active') fail('Archive the student before deleting them permanently.');
      data.students = data.students.filter(x => x.id !== s.id);
      data.grades = data.grades.filter(g => g.student_id !== s.id);
      save(); return { message: 'Deleted' };
    }],

    // class grade sheet: one subject for one section in one term
    ['GET', /^\/gradesheet$/, (m, b, q) => {
      const t = termOf(q), year = +q.year, section = q.section, subject = q.subject;
      if (!YEARS.includes(year)) fail('Pick a year level.');
      const subs = subjectsOf(year, t.semester), subj = subs.find(x => x.subject === subject);
      const students = data.students.filter(s => active(s) && s.year === year && s.section === section)
        .sort((a, b) => a.last_name.localeCompare(b.last_name) || a.first_name.localeCompare(b.first_name))
        .map(s => { const g = data.grades.find(x => x.student_id === s.id && x.term_id === t.id && lc(x.subject) === lc(subject));
          return { id: s.id, student_id: s.student_id, name: `${s.last_name}, ${s.first_name}`, gender: s.gender, grade: g ? g.grade : null }; });
      const a = data.assignments.find(x => x.year === year && x.section === section && lc(x.subject) === lc(subject));
      return { term: termLabel(t), term_id: t.id, semester: t.semester, subjects: subs, units: subj ? subj.units : null,
        teacher: a ? (data.teachers.find(x => x.id === a.teacher_id) || {}).name || null : null, students };
    }],
    // body: { term_id, year, section, subject, grades: [{ id, grade }] }. A blank grade removes that student's grade for the subject.
    ['PUT', /^\/gradesheet$/, (m, b) => {
      const t = termOf({ term: b.term_id }), year = +b.year;
      const subj = subjectsOf(year, t.semester).find(x => x.subject === b.subject) || fail(`"${b.subject}" isn't in the ${ordY(year)} Year ${t.semester === 1 ? '1st' : '2nd'} semester curriculum.`);
      let saved = 0, cleared = 0;
      const bad = [];
      for (const row of b.grades || []) {
        const s = findStudent(row.id);
        if (s.year !== year || s.section !== b.section || !active(s)) fail('The class list changed. Reload the grade sheet and try again.');
        if (!blank(row.grade) && !(+row.grade >= 1 && +row.grade <= 5)) bad.push(`${s.last_name}, ${s.first_name}`);
      }
      if (bad.length) fail(`Grades must be between 1.00 and 5.00. Check: ${bad.slice(0, 5).join('; ')}${bad.length > 5 ? '…' : ''}`);
      for (const row of b.grades || []) {
        const i = data.grades.findIndex(g => g.student_id === +row.id && g.term_id === t.id && lc(g.subject) === lc(subj.subject));
        if (blank(row.grade)) { if (i >= 0) { data.grades.splice(i, 1); cleared++; } continue; }
        if (i >= 0) Object.assign(data.grades[i], { grade: +row.grade, units: subj.units });
        else data.grades.push({ id: ++data.seq.g, student_id: +row.id, term_id: t.id, year, subject: subj.subject, units: subj.units, grade: +row.grade });
        saved++;
      }
      save(); return { saved, cleared };
    }],

    // teachers and class assignments
    ['GET', /^\/teachers$/, () => clone(data.teachers).sort((a, b) => a.name.localeCompare(b.name))
      .map(t => ({ ...t, classes: clone(data.assignments.filter(a => a.teacher_id === t.id)).sort((a, b) => a.year - b.year || a.section.localeCompare(b.section)) }))],
    ['POST', /^\/teachers$/, (m, b) => {
      required(b, ['name', 'email']);
      const t = { id: ++data.seq.t, name: b.name.trim(), email: b.email.trim(), department: b.department || null, subject: b.subject || null };
      data.teachers.push(t); save(); return { id: t.id };
    }],
    ['PUT', /^\/teachers\/(\d+)$/, (m, b) => {
      required(b, ['name', 'email']);
      const t = data.teachers.find(x => x.id === +m[1]) || fail('Teacher not found.');
      Object.assign(t, { name: b.name.trim(), email: b.email.trim(), department: b.department || null, subject: b.subject || null });
      save(); return { message: 'OK' };
    }],
    ['DELETE', /^\/teachers\/(\d+)$/, m => {
      const id = +m[1];
      data.teachers = data.teachers.filter(t => t.id !== id);
      const n = data.assignments.filter(a => a.teacher_id === id).length;
      data.assignments = data.assignments.filter(a => a.teacher_id !== id);
      save(); return { message: 'OK', unassigned: n };
    }],
    ['GET', /^\/assignments$/, () => clone(data.assignments)],
    ['POST', /^\/assignments$/, (m, b) => {
      required(b, ['teacher_id', 'year', 'section', 'subject']);
      const year = +b.year, teacher = data.teachers.find(t => t.id === +b.teacher_id) || fail('Teacher not found.');
      if (!sectionsOf(year).includes(b.section)) fail(`Section "${b.section}" doesn't exist in ${ordY(year)} Year.`);
      if (!SEMS.some(sem => subjectsOf(year, sem).some(x => x.subject === b.subject))) fail(`"${b.subject}" isn't in the ${ordY(year)} Year curriculum.`);
      const taken = data.assignments.find(a => a.year === year && a.section === b.section && lc(a.subject) === lc(b.subject));
      if (taken) {
        const who = (data.teachers.find(t => t.id === taken.teacher_id) || {}).name || 'another teacher';
        if (taken.teacher_id === teacher.id) fail(`${teacher.name} already teaches this class.`);
        if (!b.replace) fail(`${who} already teaches ${b.subject} in ${ordY(year)} Year ${b.section}.`);
        data.assignments = data.assignments.filter(a => a !== taken);
      }
      data.assignments.push({ id: ++data.seq.a, teacher_id: teacher.id, year, section: b.section, subject: b.subject });
      save(); return { message: 'Assigned' };
    }],
    ['DELETE', /^\/assignments\/(\d+)$/, m => { data.assignments = data.assignments.filter(a => a.id !== +m[1]); save(); return { message: 'OK' }; }],

    // registrations
    ['GET', /^\/registrations$/, () => clone(data.registrations).sort((a, b) => (b.status === 'Pending') - (a.status === 'Pending') || b.id - a.id)],
    ['POST', /^\/registrations$/, (m, b) => {
      required(b, ['role', 'first_name', 'last_name', 'email']);
      const student = b.role === 'Student';
      data.registrations.push({ id: ++data.seq.r, role: b.role, first_name: b.first_name.trim(), last_name: b.last_name.trim(), email: b.email.trim(),
        gender: student ? b.gender || null : null, year: student && !blank(b.year) ? +b.year : null,
        section: student && !blank(b.section) ? String(b.section).trim() : null,
        subject: student ? null : b.subject || null, status: 'Pending', created_at: new Date().toISOString() });
      save(); return { message: 'Created' };
    }],
    ['POST', /^\/registrations\/(\d+)\/(approve|reject)$/, m => {
      const reg = data.registrations.find(r => r.id === +m[1]);
      if (!reg || reg.status !== 'Pending') fail('This registration was already reviewed.');
      if (m[2] === 'approve') {
        if (reg.role === 'Teacher') {
          data.teachers.push({ id: ++data.seq.t, name: `${reg.first_name} ${reg.last_name}`, email: reg.email, department: null, subject: reg.subject });
        } else {
          const year = reg.year || 1;
          data.students.push({ id: ++data.seq.s, student_id: nextStudentId(year), first_name: reg.first_name, last_name: reg.last_name,
            email: reg.email, gender: reg.gender || 'Male', year, section: leastFilled(year, reg.section), status: 'active' });
        }
      }
      reg.status = m[2] === 'approve' ? 'Approved' : 'Rejected';
      save(); return { message: 'OK' };
    }],
  ];

  window.api = async function api(path, opt = {}) {
    const method = (opt.method || 'GET').toUpperCase();
    const [p, qs = ''] = path.split('?');
    const query = Object.fromEntries(new URLSearchParams(qs));
    for (const [verb, re, handler] of routes) {
      const m = p.match(re);
      if (!m || verb !== method) continue;
      if (method === 'GET') return handler(m, {}, query);
      // Changes are all-or-nothing: if anything fails, the data goes back to how it was
      const before = JSON.stringify(data);
      try { return handler(m, opt.body || {}, query); }
      catch (e) { data = JSON.parse(before); if (e instanceof ApiError) throw e; console.error(e); throw new ApiError('Something went wrong, so nothing was changed. Please try again.'); }
    }
    throw new ApiError('Not found: ' + method + ' ' + p);
  };

  window.DB = {
    login(u, p) { const ok = u === ADMIN_USER && p === ADMIN_PASS; if (ok) store.set(SESSION, '1'); return ok; },
    logout() { store.del(SESSION); },
    isLoggedIn() { return store.get(SESSION) === '1'; },
    takeNotice() { const n = notice; notice = null; return n; }, // one-time message about upgraded or repaired data
    reset() { data = seed(); save(); }, // DB.reset() in the browser console restores the demo data
  };
})();
