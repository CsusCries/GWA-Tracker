/*
 * Data layer for the GWA Tracker (static version).
 *
 * Everything is saved in this browser's localStorage, so data is per-browser
 * and per-device. The app only talks to the data through api(path, options),
 * using the same routes a real backend would expose:
 *
 *   GET    /curriculum          (subjects and units per year level)
 *   GET    /settings            PUT  /settings/:year  (sections and subjects of a year level)
 *   POST   /settings/:year/preview   (what a settings change would affect, without saving)
 *   GET    /stats
 *   GET    /students            POST /students
 *   GET    /students/:id        PUT  /students/:id   DELETE /students/:id
 *   GET    /teachers            POST /teachers
 *   PUT    /teachers/:id        DELETE /teachers/:id
 *   GET    /registrations       POST /registrations
 *   POST   /registrations/:id/approve | /reject
 *
 * When you add a database, replace api() with something like:
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
  const KEY = 'gwa-tracker-data-v2'; // v2: subjects depend on year level
  const SESSION = 'gwa-tracker-session';
  // Demo-only credentials. Anyone can read these, so this is not real security.
  const ADMIN_USER = 'admin', ADMIN_PASS = 'admin123';
  // Subjects and units for each year level. Edit this list to match your curriculum.
  const DEFAULT_CURRICULUM = {
    1: [['Introduction to Computing', 3], ['Computer Programming 1', 3], ['Mathematics in the Modern World', 3],
        ['Purposive Communication', 3], ['Understanding the Self', 3], ['PE 1', 2], ['NSTP 1', 3]],
    2: [['Data Structures and Algorithms', 3], ['Object-Oriented Programming', 3], ['Discrete Mathematics', 3],
        ['Database Systems 1', 3], ['Networking 1', 3], ['Readings in Philippine History', 3], ['PE 3', 2]],
    3: [['Web Systems and Technologies', 3], ['Information Management', 3], ['Systems Analysis and Design', 3],
        ['Applications Development', 3], ['Information Assurance and Security', 3], ['Quantitative Methods', 3], ['Ethics', 3]],
    4: [['Capstone Project 2', 3], ['Systems Administration and Maintenance', 3], ['Social and Professional Issues', 3],
        ['IT Elective 4', 3], ['Practicum (OJT)', 6]],
  };

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }, // false = storage full or blocked
    del(k) { try { localStorage.removeItem(k); } catch (e) {} },
  };

  // Section names and curriculum per year level. Admins change these on the Settings tab.
  function defaultSettings() {
    const s = {};
    for (const y of [1, 2, 3, 4]) s[y] = { sections: ['A', 'B', 'C'], subjects: DEFAULT_CURRICULUM[y].map(([subject, units]) => ({ subject, units })) };
    return s;
  }

  // Small seeded random generator so the demo data is the same every time.
  function rng(seed) { return () => (seed = (seed * 16807) % 2147483647) / 2147483647; }

  function seed() {
    const r = rng(24), pick = a => a[Math.floor(r() * a.length)];
    const boys = ['Christian', 'Miguel', 'Vincent', 'Rafael', 'Joaquin', 'Adrian', 'Paolo', 'Gabriel', 'Nathan', 'Carlo', 'Luis', 'Marco'];
    const girls = ['Patricia', 'Bea', 'Camille', 'Hannah', 'Francesca', 'Katrina', 'Andrea', 'Bianca', 'Isabel', 'Sofia', 'Erika', 'Nicole'];
    const lasts = ['Bautista', 'Bernardo', 'Castillo', 'Garcia', 'Morales', 'Magbanua', 'Salazar', 'Delos Santos', 'Manalo', 'Reyes', 'Cruz', 'Villanueva'];
    const grades = [1.0, 1.25, 1.5, 1.75, 2.0, 2.25, 2.5, 2.75, 3.0];
    const d = { seq: { s: 0, t: 0, g: 0, r: 0 }, students: [], teachers: [], grades: [], registrations: [], settings: defaultSettings() };
    let n = 0;
    for (let year = 1; year <= 4; year++) {
      const prefix = '0' + (26 - year);
      for (const section of 'ABC') for (const [gender, names] of [['Male', boys], ['Female', girls]]) for (let i = 0; i < 2; i++) {
        const num = String(n).padStart(4, '0');
        const s = { id: ++d.seq.s, student_id: `${prefix}-${num}`, first_name: pick(names), last_name: pick(lasts),
          email: `demo.student.${prefix}${num}@example.invalid`, gender, year, section };
        d.students.push(s);
        for (const [subject, units] of DEFAULT_CURRICULUM[year]) d.grades.push({ id: ++d.seq.g, student_id: s.id, subject, units, grade: pick(grades) });
        n++;
      }
    }
    for (const [name, department, subject] of [['Prof. Elena Ramos', 'IT', 'Programming'], ['Prof. Jose Mercado', 'Math', 'Mathematics'],
      ['Prof. Liza Aquino', 'Languages', 'English'], ['Prof. Ramon Torres', 'Science', 'Science']])
      d.teachers.push({ id: ++d.seq.t, name, email: name.split(' ').pop().toLowerCase() + '@example.invalid', department, subject });
    for (const [role, first_name, last_name, email, gender, year, section, subject] of [
      ['Student', 'Aaron', 'Lim', 'aaron.lim@example.invalid', 'Male', 1, 'A', null],
      ['Student', 'Clarisse', 'Tan', 'clarisse.tan@example.invalid', 'Female', 2, 'B', null],
      ['Teacher', 'Mario', 'Santiago', 'm.santiago@example.invalid', null, null, null, 'Filipino']])
      d.registrations.push({ id: ++d.seq.r, role, first_name, last_name, email, gender, year, section, subject, status: 'Pending', created_at: new Date().toISOString() });
    return d;
  }

  let data;
  try { data = JSON.parse(store.get(KEY)); } catch (e) { data = null; }
  // Rebuild demo data if what's stored is missing or damaged, and fill in anything an older version didn't save
  const valid = x => x && ['students', 'teachers', 'grades', 'registrations'].every(k => Array.isArray(x[k])) && x.seq;
  if (!valid(data)) { if (data) console.warn('GWA Tracker: saved data was damaged, so demo data was restored.'); data = seed(); }
  if (!data.settings) data.settings = defaultSettings();
  for (const y of [1, 2, 3, 4]) {
    const s = data.settings[y] || (data.settings[y] = { sections: [], subjects: [] });
    if (!Array.isArray(s.sections) || !s.sections.length) s.sections = ['A', 'B', 'C'];
    if (!Array.isArray(s.subjects)) s.subjects = DEFAULT_CURRICULUM[y].map(([subject, units]) => ({ subject, units }));
  }
  const sectionsOf = year => (data.settings[year] || { sections: [] }).sections;
  class ApiError extends Error {}
  const fail = msg => { throw new ApiError(msg); };
  const save = () => { if (!store.set(KEY, JSON.stringify(data))) fail("Couldn't save: this browser's storage is full or blocked. Your change was not kept."); };
  try { save(); } catch (e) { console.warn(e.message); }
  const clone = o => JSON.parse(JSON.stringify(o));
  const blank = v => v === undefined || v === null || String(v).trim() === '';
  function require(body, keys) {
    const missing = keys.filter(k => blank(body[k]));
    if (missing.length) fail('Missing: ' + missing.join(', '));
  }

  function gwaOf(id) {
    let w = 0, u = 0;
    for (const g of data.grades) if (g.student_id === id) { w += g.grade * g.units; u += g.units; }
    return u ? Math.round(w / u * 100) / 100 : null;
  }
  const withGwa = s => ({ ...clone(s), gwa: gwaOf(s.id) });
  const findStudent = id => data.students.find(s => s.id === id) || fail('Student not found');
  const idTaken = (sid, exceptId) => data.students.some(s => s.student_id === sid && s.id !== exceptId);

  function studentFields(b) {
    require(b, ['student_id', 'first_name', 'last_name', 'email', 'gender', 'year', 'section']);
    if (!sectionsOf(+b.year).includes(String(b.section).trim())) fail(`Section "${b.section}" doesn't exist in year ${b.year}. Add it on the Settings tab.`);
    return { student_id: String(b.student_id).trim(), first_name: String(b.first_name).trim(), last_name: String(b.last_name).trim(),
      email: String(b.email).trim(), gender: b.gender, year: +b.year, section: String(b.section).trim() };
  }

  // Keeps only rows with a subject and a grade; returns null when no grades were sent.
  const MAX_UNITS = 10, MAX_NAME = 60, MAX_SECTION = 30;
  function parseGrades(list) {
    if (!Array.isArray(list)) return null;
    const out = list.filter(g => !blank(g.subject) && !blank(g.grade)).map(g => {
      const subject = String(g.subject).trim(), grade = +g.grade, units = blank(g.units) ? 3 : +g.units;
      if (!(grade >= 1 && grade <= 5)) fail(`Grade for "${subject}" must be between 1.00 and 5.00.`);
      if (!(units > 0 && units <= MAX_UNITS)) fail(`Units for "${subject}" must be more than 0 and at most ${MAX_UNITS}.`);
      return { subject, units, grade };
    });
    const seen = new Set();
    for (const g of out) { const k = g.subject.toLowerCase(); if (seen.has(k)) fail(`"${g.subject}" is listed twice. Keep one grade per subject.`); seen.add(k); }
    return out;
  }

  // Validates a Settings change and works out who it affects. Shared by the preview and the save.
  function planSettings(year, b) {
    const cur = data.settings[year];
    const secs = (b.sections || []).map(x => ({ name: String(x.name || '').trim(), from: String(x.from || '').trim() }));
    if (!secs.length) fail('A year level needs at least one section.');
    if (secs.some(x => !x.name)) fail('Section names cannot be empty.');
    if (secs.some(x => x.name.length > MAX_SECTION)) fail(`Section names can be at most ${MAX_SECTION} characters.`);
    const names = secs.map(x => x.name.toLowerCase());
    const dupS = names.find((n, i) => names.indexOf(n) !== i);
    if (dupS) fail(`There are two sections named "${secs[names.indexOf(dupS)].name}". Section names must be different.`);
    for (const x of secs) if (x.from && !cur.sections.includes(x.from)) fail('Settings changed somewhere else. Reload the page and try again.');

    const subs = (b.subjects || []).filter(x => !blank(x.subject)).map(x => ({ subject: String(x.subject).trim(), units: +x.units, from: String(x.from || '').trim() }));
    if (!subs.length) fail('A year level needs at least one subject.');
    for (const x of subs) {
      if (x.subject.length > MAX_NAME) fail(`Subject names can be at most ${MAX_NAME} characters.`);
      if (!(x.units > 0 && x.units <= MAX_UNITS)) fail(`Units for "${x.subject}" must be more than 0 and at most ${MAX_UNITS}.`);
    }
    const subNames = subs.map(x => x.subject.toLowerCase());
    const dup = subNames.find((n, i) => subNames.indexOf(n) !== i);
    if (dup) fail(`"${subs[subNames.indexOf(dup)].subject}" is listed twice. Subjects must be different.`);

    const yearIds = new Set(data.students.filter(s => s.year === year).map(s => s.id));
    const gradedCount = subj => new Set(data.grades.filter(g => yearIds.has(g.student_id) && g.subject.toLowerCase() === subj.toLowerCase()).map(g => g.student_id)).size;

    const keptSecs = new Set(secs.map(x => x.from).filter(Boolean));
    const removedSections = cur.sections.filter(s => !keptSecs.has(s)).map(name => ({
      name, students: data.students.filter(s => s.year === year && s.section === name).length,
      registrations: data.registrations.filter(r => r.status === 'Pending' && +r.year === year && r.section === name).length }));
    const blocked = removedSections.find(s => s.students);
    if (blocked) fail(`Section ${blocked.name} still has ${blocked.students} student${blocked.students === 1 ? '' : 's'}. Move them to another section before removing it.`);
    const renamedSections = secs.filter(x => x.from && x.from !== x.name).map(x => ({ from: x.from, to: x.name }));

    const keptSubs = new Set(subs.map(x => x.from).filter(Boolean));
    const removedSubjects = cur.subjects.filter(s => !keptSubs.has(s.subject)).map(s => ({ subject: s.subject, students: gradedCount(s.subject) }));
    const renamedSubjects = subs.filter(x => x.from && x.from !== x.subject).map(x => ({ from: x.from, to: x.subject, students: gradedCount(x.from) }));
    const unitChanges = subs.filter(x => x.from).map(x => ({ ...x, old: (cur.subjects.find(s => s.subject === x.from) || {}).units }))
      .filter(x => x.old !== undefined && x.old !== x.units).map(x => ({ subject: x.subject, from: x.old, to: x.units, students: gradedCount(x.from) }));
    return { secs, subs, removedSections, renamedSections, removedSubjects, renamedSubjects, unitChanges };
  }

  const routes = [
    ['GET', /^\/curriculum$/, () => Object.fromEntries(Object.entries(data.settings).map(([y, s]) => [y, clone(s.subjects)]))],
    ['GET', /^\/settings$/, () => {
      const out = clone(data.settings);
      for (const y in out) out[y].counts = Object.fromEntries(out[y].sections.map(sec => [sec, data.students.filter(s => s.year === +y && s.section === sec).length]));
      return out;
    }],
    // body: { sections: [{ name, from }], subjects: [{ subject, units }] }. "from" is the old name when renaming (empty for new sections).
    // Shows what a Settings change would affect, without saving it
    ['POST', /^\/settings\/([1-4])\/preview$/, (m, b) => {
      const p = planSettings(+m[1], b);
      return { removedSections: p.removedSections, renamedSections: p.renamedSections, removedSubjects: p.removedSubjects,
        renamedSubjects: p.renamedSubjects, unitChanges: p.unitChanges };
    }],
    // body: { sections: [{ name, from }], subjects: [{ subject, units, from }], removed_grades: 'keep' | 'delete' }
    // "from" is the old name (empty for new rows). Renames carry over to students, grades and pending registrations.
    ['PUT', /^\/settings\/([1-4])$/, (m, b) => {
      const year = +m[1], p = planSettings(year, b);
      const yearIds = new Set(data.students.filter(s => s.year === year).map(s => s.id));
      const secMap = Object.fromEntries(p.renamedSections.map(x => [x.from, x.to]));
      for (const s of data.students) if (s.year === year && s.section in secMap) s.section = secMap[s.section];
      const gone = new Set(p.removedSections.map(x => x.name));
      for (const r of data.registrations) if (r.status === 'Pending' && +r.year === year) {
        if (r.section in secMap) r.section = secMap[r.section];
        else if (gone.has(r.section)) r.section = null; // falls back to "Auto" when approved
      }
      const subMap = Object.fromEntries(p.renamedSubjects.map(x => [x.from.toLowerCase(), x.to]));
      const unitMap = Object.fromEntries(p.subs.map(x => [x.subject.toLowerCase(), x.units]));
      const removed = new Set(p.removedSubjects.map(x => x.subject.toLowerCase()));
      data.grades = data.grades.filter(g => !(yearIds.has(g.student_id) && removed.has(g.subject.toLowerCase()) && b.removed_grades === 'delete'));
      for (const g of data.grades) if (yearIds.has(g.student_id)) {
        const k = g.subject.toLowerCase();
        if (k in subMap) g.subject = subMap[k];
        if (b.update_units !== false && g.subject.toLowerCase() in unitMap) g.units = unitMap[g.subject.toLowerCase()];
      }
      data.settings[year] = { sections: p.secs.map(x => x.name), subjects: p.subs.map(({ subject, units }) => ({ subject, units })) };
      save(); return { message: 'Saved' };
    }],
    ['GET', /^\/stats$/, () => {
      const by_year = { 1: { total: 0, Male: 0, Female: 0 }, 2: { total: 0, Male: 0, Female: 0 }, 3: { total: 0, Male: 0, Female: 0 }, 4: { total: 0, Male: 0, Female: 0 } };
      const list = data.students.map(withGwa);
      for (const s of list) { const b = by_year[s.year] || (by_year[s.year] = { total: 0, Male: 0, Female: 0 }); b.total++; b[s.gender] = (b[s.gender] || 0) + 1; }
      const graded = list.filter(s => s.gwa != null), gwas = graded.map(s => s.gwa);
      return {
        total: list.length,
        male: list.filter(s => s.gender === 'Male').length,
        female: list.filter(s => s.gender === 'Female').length,
        teachers: data.teachers.length,
        pending: data.registrations.filter(r => r.status === 'Pending').length,
        average_gwa: gwas.length ? Math.round(gwas.reduce((a, b) => a + b, 0) / gwas.length * 100) / 100 : null,
        by_year,
        top: graded.sort((a, b) => a.gwa - b.gwa).slice(0, 5),
        honors: gwas.filter(g => g <= 1.75).length,
        at_risk: gwas.filter(g => g > 2.75).length,
      };
    }],
    ['GET', /^\/students$/, () => data.students.map(withGwa)
      .sort((a, b) => a.year - b.year || a.section.localeCompare(b.section) || b.gender.localeCompare(a.gender) || a.last_name.localeCompare(b.last_name))],
    ['POST', /^\/students$/, (m, b) => {
      const f = studentFields(b);
      if (idTaken(f.student_id)) fail('Student ID already exists');
      const grades = parseGrades(b.grades);
      const s = { id: ++data.seq.s, ...f }; data.students.push(s);
      if (grades) for (const g of grades) data.grades.push({ id: ++data.seq.g, student_id: s.id, ...g });
      save(); return { id: s.id };
    }],
    ['GET', /^\/students\/(\d+)$/, m => {
      const s = findStudent(+m[1]);
      return { ...withGwa(s), grades: clone(data.grades.filter(g => g.student_id === s.id)) };
    }],
    ['PUT', /^\/students\/(\d+)$/, (m, b) => {
      const s = findStudent(+m[1]), f = studentFields(b);
      if (idTaken(f.student_id, s.id)) fail('Student ID already exists');
      const newGrades = parseGrades(b.grades);
      Object.assign(s, f);
      if (newGrades) {
        data.grades = data.grades.filter(g => g.student_id !== s.id);
        for (const g of newGrades) data.grades.push({ id: ++data.seq.g, student_id: s.id, ...g });
      }
      save(); return { message: 'Updated' };
    }],
    ['DELETE', /^\/students\/(\d+)$/, m => {
      const s = findStudent(+m[1]);
      data.students = data.students.filter(x => x.id !== s.id);
      data.grades = data.grades.filter(g => g.student_id !== s.id);
      save(); return { message: 'Deleted' };
    }],
    ['GET', /^\/teachers$/, () => clone(data.teachers).sort((a, b) => a.name.localeCompare(b.name))],
    ['POST', /^\/teachers$/, (m, b) => {
      require(b, ['name', 'email']);
      const t = { id: ++data.seq.t, name: b.name.trim(), email: b.email.trim(), department: b.department || null, subject: b.subject || null };
      data.teachers.push(t); save(); return { id: t.id };
    }],
    ['PUT', /^\/teachers\/(\d+)$/, (m, b) => {
      require(b, ['name', 'email']);
      const t = data.teachers.find(x => x.id === +m[1]) || fail('Teacher not found');
      Object.assign(t, { name: b.name.trim(), email: b.email.trim(), department: b.department || null, subject: b.subject || null });
      save(); return { message: 'OK' };
    }],
    ['DELETE', /^\/teachers\/(\d+)$/, m => { data.teachers = data.teachers.filter(t => t.id !== +m[1]); save(); return { message: 'OK' }; }],
    ['GET', /^\/registrations$/, () => clone(data.registrations)
      .sort((a, b) => (b.status === 'Pending') - (a.status === 'Pending') || b.id - a.id)],
    ['POST', /^\/registrations$/, (m, b) => {
      require(b, ['role', 'first_name', 'last_name', 'email']);
      const student = b.role === 'Student';
      data.registrations.push({ id: ++data.seq.r, role: b.role, first_name: b.first_name.trim(), last_name: b.last_name.trim(), email: b.email.trim(),
        gender: student ? b.gender || null : null, year: student && !blank(b.year) ? +b.year : null,
        section: student && !blank(b.section) ? String(b.section).trim() : null,
        subject: student ? null : b.subject || null, status: 'Pending', created_at: new Date().toISOString() });
      save(); return { message: 'Created' };
    }],
    ['POST', /^\/registrations\/(\d+)\/(approve|reject)$/, m => {
      const reg = data.registrations.find(r => r.id === +m[1]);
      if (!reg || reg.status !== 'Pending') fail('Registration not found or already reviewed');
      if (m[2] === 'approve') {
        if (reg.role === 'Teacher') {
          data.teachers.push({ id: ++data.seq.t, name: `${reg.first_name} ${reg.last_name}`, email: reg.email, department: null, subject: reg.subject });
        } else {
          const year = reg.year || 1, prefix = '0' + (26 - year);
          let count = data.students.length, sid;
          do sid = `${prefix}-${String(count++).padStart(4, '0')}`; while (idTaken(sid));
          const secs = sectionsOf(year);
          if (!secs.length) fail(`Year ${year} has no sections. Add one on the Settings tab first.`);
          let section = secs.includes(reg.section) ? reg.section : null;
          if (!section) { // put the student in the least-filled section of their year
            const counts = Object.fromEntries(secs.map(x => [x, 0]));
            for (const s of data.students) if (s.year === year && s.section in counts) counts[s.section]++;
            section = secs.reduce((a, b) => counts[b] < counts[a] ? b : a);
          }
          data.students.push({ id: ++data.seq.s, student_id: sid, first_name: reg.first_name, last_name: reg.last_name,
            email: reg.email, gender: reg.gender || 'Male', year, section });
        }
      }
      reg.status = m[2] === 'approve' ? 'Approved' : 'Rejected';
      save(); return { message: 'OK' };
    }],
  ];

  window.api = async function api(path, opt = {}) {
    const method = (opt.method || 'GET').toUpperCase();
    for (const [verb, re, handler] of routes) {
      const m = path.match(re);
      if (!m || verb !== method) continue;
      if (method === 'GET') return handler(m, opt.body || {});
      // Changes are all-or-nothing: if anything fails, the data goes back to how it was
      const before = JSON.stringify(data);
      try { return handler(m, opt.body || {}); }
      catch (e) { data = JSON.parse(before); if (e instanceof ApiError) throw e; console.error(e); throw new ApiError('Something went wrong, so nothing was changed. Please try again.'); }
    }
    throw new ApiError('Not found: ' + method + ' ' + path);
  };

  window.DB = {
    login(u, p) { const ok = u === ADMIN_USER && p === ADMIN_PASS; if (ok) store.set(SESSION, '1'); return ok; },
    logout() { store.del(SESSION); },
    isLoggedIn() { return store.get(SESSION) === '1'; },
    reset() { data = seed(); save(); }, // DB.reset() in the browser console restores the demo data
  };
})();
