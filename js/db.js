/*
 * Data layer for the GWA Tracker (static version).
 *
 * Everything is saved in this browser's localStorage, so data is per-browser
 * and per-device. The app only talks to the data through api(path, options),
 * using the same routes a real backend would expose:
 *
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
  const KEY = 'gwa-tracker-data-v1';
  const SESSION = 'gwa-tracker-session';
  // Demo-only credentials. Anyone can read these, so this is not real security.
  const ADMIN_USER = 'admin', ADMIN_PASS = 'admin123';
  const SUBJECTS = [['Programming', 3], ['Mathematics', 3], ['English', 3], ['Science', 3], ['Filipino', 3], ['PE', 2]];

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage blocked: keep in memory */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} },
  };

  // Small seeded random generator so the demo data is the same every time.
  function rng(seed) { return () => (seed = (seed * 16807) % 2147483647) / 2147483647; }

  function seed() {
    const r = rng(24), pick = a => a[Math.floor(r() * a.length)];
    const boys = ['Christian', 'Miguel', 'Vincent', 'Rafael', 'Joaquin', 'Adrian', 'Paolo', 'Gabriel', 'Nathan', 'Carlo', 'Luis', 'Marco'];
    const girls = ['Patricia', 'Bea', 'Camille', 'Hannah', 'Francesca', 'Katrina', 'Andrea', 'Bianca', 'Isabel', 'Sofia', 'Erika', 'Nicole'];
    const lasts = ['Bautista', 'Bernardo', 'Castillo', 'Garcia', 'Morales', 'Magbanua', 'Salazar', 'Delos Santos', 'Manalo', 'Reyes', 'Cruz', 'Villanueva'];
    const grades = [1.0, 1.25, 1.5, 1.75, 2.0, 2.25, 2.5, 2.75, 3.0];
    const d = { seq: { s: 0, t: 0, g: 0, r: 0 }, students: [], teachers: [], grades: [], registrations: [] };
    let n = 0;
    for (let year = 1; year <= 4; year++) {
      const prefix = '0' + (26 - year);
      for (const section of 'ABC') for (const [gender, names] of [['Male', boys], ['Female', girls]]) for (let i = 0; i < 2; i++) {
        const num = String(n).padStart(4, '0');
        const s = { id: ++d.seq.s, student_id: `${prefix}-${num}`, first_name: pick(names), last_name: pick(lasts),
          email: `demo.student.${prefix}${num}@example.invalid`, gender, year, section };
        d.students.push(s);
        for (const [subject, units] of SUBJECTS) d.grades.push({ id: ++d.seq.g, student_id: s.id, subject, units, grade: pick(grades) });
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
  if (!data || !Array.isArray(data.students)) data = seed();
  const save = () => store.set(KEY, JSON.stringify(data));
  save();

  class ApiError extends Error {}
  const fail = msg => { throw new ApiError(msg); };
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
    return { student_id: String(b.student_id).trim(), first_name: String(b.first_name).trim(), last_name: String(b.last_name).trim(),
      email: String(b.email).trim(), gender: b.gender, year: +b.year, section: String(b.section).toUpperCase() };
  }

  const routes = [
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
      const s = { id: ++data.seq.s, ...f }; data.students.push(s); save(); return { id: s.id };
    }],
    ['GET', /^\/students\/(\d+)$/, m => {
      const s = findStudent(+m[1]);
      return { ...withGwa(s), grades: clone(data.grades.filter(g => g.student_id === s.id)) };
    }],
    ['PUT', /^\/students\/(\d+)$/, (m, b) => {
      const s = findStudent(+m[1]), f = studentFields(b);
      if (idTaken(f.student_id, s.id)) fail('Student ID already exists');
      let newGrades = null;
      if (Array.isArray(b.grades)) {
        newGrades = b.grades.filter(g => !blank(g.subject) && !blank(g.grade)).map(g => {
          const grade = +g.grade, units = blank(g.units) ? 3 : +g.units;
          if (!(grade >= 1 && grade <= 5) || !(units > 0)) fail('Grades must be 1.00-5.00 and units > 0');
          return { student_id: s.id, subject: String(g.subject).trim(), units, grade };
        });
      }
      Object.assign(s, f);
      if (newGrades) {
        data.grades = data.grades.filter(g => g.student_id !== s.id);
        for (const g of newGrades) data.grades.push({ id: ++data.seq.g, ...g });
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
        section: student && !blank(b.section) ? String(b.section).toUpperCase() : null,
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
          let section = reg.section;
          if (!section) { // put the student in the least-filled section of their year
            const counts = { A: 0, B: 0, C: 0 };
            for (const s of data.students) if (s.year === year && s.section in counts) counts[s.section]++;
            section = Object.keys(counts).reduce((a, b) => counts[b] < counts[a] ? b : a);
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
      if (m && verb === method) return handler(m, opt.body || {});
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
