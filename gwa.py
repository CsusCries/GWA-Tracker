"""Student GWA Tracking System - admin portal blueprint."""
import os
import random
import sqlite3
from functools import wraps

from flask import (Blueprint, jsonify, redirect, render_template, request,
                   session, url_for)

bp = Blueprint('gwa', __name__)
DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'gwa.db')
ADMIN_USER = os.environ.get('ADMIN_USER', 'admin')
ADMIN_PASS = os.environ.get('ADMIN_PASS', 'admin123')
SUBJECTS = [('Programming', 3), ('Mathematics', 3), ('English', 3),
            ('Science', 3), ('Filipino', 3), ('PE', 2)]


def db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA foreign_keys = ON')
    return conn


def init_db():
    conn = db()
    conn.executescript('''
    CREATE TABLE IF NOT EXISTS g_students (
        id INTEGER PRIMARY KEY AUTOINCREMENT, student_id TEXT UNIQUE NOT NULL,
        first_name TEXT NOT NULL, last_name TEXT NOT NULL, email TEXT NOT NULL,
        gender TEXT NOT NULL, year INTEGER NOT NULL, section TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS g_teachers (
        id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
        email TEXT NOT NULL, department TEXT, subject TEXT);
    CREATE TABLE IF NOT EXISTS g_grades (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL REFERENCES g_students(id) ON DELETE CASCADE,
        subject TEXT NOT NULL, units REAL NOT NULL, grade REAL NOT NULL);
    CREATE TABLE IF NOT EXISTS g_registrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT, role TEXT NOT NULL,
        first_name TEXT NOT NULL, last_name TEXT NOT NULL, email TEXT NOT NULL,
        gender TEXT, year INTEGER, section TEXT, subject TEXT,
        status TEXT NOT NULL DEFAULT 'Pending',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    ''')
    if conn.execute('SELECT COUNT(*) FROM g_students').fetchone()[0] == 0:
        seed(conn)
    conn.commit()
    conn.close()


def seed(conn):
    rnd = random.Random(24)
    boys = ['Christian', 'Miguel', 'Vincent', 'Rafael', 'Joaquin', 'Adrian',
            'Paolo', 'Gabriel', 'Nathan', 'Carlo', 'Luis', 'Marco']
    girls = ['Patricia', 'Bea', 'Camille', 'Hannah', 'Francesca', 'Katrina',
             'Andrea', 'Bianca', 'Isabel', 'Sofia', 'Erika', 'Nicole']
    lasts = ['Bautista', 'Bernardo', 'Castillo', 'Garcia', 'Morales', 'Magbanua',
             'Salazar', 'Delos Santos', 'Manalo', 'Reyes', 'Cruz', 'Villanueva']
    n = 0
    for year in range(1, 5):
        prefix = f'0{26 - year}'
        for section in 'ABC':
            for gender, names in (('Male', boys), ('Female', girls)):
                for _ in range(2):
                    sid = f'{prefix}-{n:04d}'
                    cur = conn.execute(
                        'INSERT INTO g_students (student_id, first_name, last_name, email, gender, year, section)'
                        ' VALUES (?,?,?,?,?,?,?)',
                        (sid, rnd.choice(names), rnd.choice(lasts),
                         f'demo.student.{prefix}{n:04d}@example.invalid', gender, year, section))
                    for subj, units in SUBJECTS:
                        g = rnd.choice([1.0, 1.25, 1.5, 1.75, 2.0, 2.25, 2.5, 2.75, 3.0])
                        conn.execute('INSERT INTO g_grades (student_id, subject, units, grade) VALUES (?,?,?,?)',
                                     (cur.lastrowid, subj, units, g))
                    n += 1
    for name, dept, subj in [('Prof. Elena Ramos', 'IT', 'Programming'),
                             ('Prof. Jose Mercado', 'Math', 'Mathematics'),
                             ('Prof. Liza Aquino', 'Languages', 'English'),
                             ('Prof. Ramon Torres', 'Science', 'Science')]:
        conn.execute('INSERT INTO g_teachers (name, email, department, subject) VALUES (?,?,?,?)',
                     (name, name.split()[-1].lower() + '@example.invalid', dept, subj))
    conn.executemany(
        'INSERT INTO g_registrations (role, first_name, last_name, email, gender, year, section, subject)'
        ' VALUES (?,?,?,?,?,?,?,?)',
        [('Student', 'Aaron', 'Lim', 'aaron.lim@example.invalid', 'Male', 1, 'A', None),
         ('Student', 'Clarisse', 'Tan', 'clarisse.tan@example.invalid', 'Female', 2, 'B', None),
         ('Teacher', 'Mario', 'Santiago', 'm.santiago@example.invalid', None, None, None, 'Filipino')])


def login_required(fn):
    @wraps(fn)
    def wrapper(*a, **kw):
        if not session.get('admin'):
            if request.path.startswith('/gwa/api'):
                return jsonify({'error': 'Unauthorized'}), 401
            return redirect(url_for('gwa.login'))
        return fn(*a, **kw)
    return wrapper


def gwa_map(conn):
    rows = conn.execute('SELECT student_id, SUM(grade*units)/SUM(units) g FROM g_grades GROUP BY student_id')
    return {r['student_id']: round(r['g'], 2) for r in rows}


def student_payload(conn, row, gmap=None):
    d = dict(row)
    gmap = gmap if gmap is not None else gwa_map(conn)
    d['gwa'] = gmap.get(d['id'])
    return d


def body(*required):
    data = request.get_json(silent=True) or {}
    missing = [k for k in required if str(data.get(k, '')).strip() == '']
    return data, missing


# ---------- pages ----------
@bp.route('/', methods=['GET'])
@login_required
def portal():
    return render_template('gwa.html')


@bp.route('/login', methods=['GET', 'POST'])
def login():
    error = None
    if request.method == 'POST':
        if request.form.get('username') == ADMIN_USER and request.form.get('password') == ADMIN_PASS:
            session['admin'] = True
            return redirect(url_for('gwa.portal'))
        error = 'Invalid username or password.'
    return render_template('gwa_login.html', error=error)


@bp.route('/logout', methods=['POST', 'GET'])
def logout():
    session.clear()
    return redirect(url_for('gwa.login'))


# ---------- API ----------
@bp.route('/gwa/api/stats')
@login_required
def stats():
    conn = db()
    students = conn.execute('SELECT * FROM g_students').fetchall()
    gmap = gwa_map(conn)
    by_year = {y: {'total': 0, 'Male': 0, 'Female': 0} for y in range(1, 5)}
    for s in students:
        b = by_year.setdefault(s['year'], {'total': 0, 'Male': 0, 'Female': 0})
        b['total'] += 1
        b[s['gender']] = b.get(s['gender'], 0) + 1
    gwas = [gmap[s['id']] for s in students if s['id'] in gmap]
    top = sorted((student_payload(conn, s, gmap) for s in students if s['id'] in gmap),
                 key=lambda d: d['gwa'])[:5]
    out = {
        'total': len(students),
        'male': sum(1 for s in students if s['gender'] == 'Male'),
        'female': sum(1 for s in students if s['gender'] == 'Female'),
        'teachers': conn.execute('SELECT COUNT(*) FROM g_teachers').fetchone()[0],
        'pending': conn.execute("SELECT COUNT(*) FROM g_registrations WHERE status='Pending'").fetchone()[0],
        'average_gwa': round(sum(gwas) / len(gwas), 2) if gwas else None,
        'by_year': by_year,
        'top': top,
        'honors': sum(1 for g in gwas if g <= 1.75),
        'at_risk': sum(1 for g in gwas if g > 2.75),
    }
    conn.close()
    return jsonify(out)


@bp.route('/gwa/api/students', methods=['GET', 'POST'])
@login_required
def students():
    conn = db()
    if request.method == 'GET':
        gmap = gwa_map(conn)
        rows = conn.execute('SELECT * FROM g_students ORDER BY year, section, gender DESC, last_name').fetchall()
        out = [student_payload(conn, r, gmap) for r in rows]
        conn.close()
        return jsonify(out)
    data, missing = body('student_id', 'first_name', 'last_name', 'email', 'gender', 'year', 'section')
    if missing:
        return jsonify({'error': 'Missing: ' + ', '.join(missing)}), 400
    try:
        cur = conn.execute(
            'INSERT INTO g_students (student_id, first_name, last_name, email, gender, year, section) VALUES (?,?,?,?,?,?,?)',
            (data['student_id'], data['first_name'], data['last_name'], data['email'],
             data['gender'], int(data['year']), data['section'].upper()))
        conn.commit()
    except sqlite3.IntegrityError:
        conn.close()
        return jsonify({'error': 'Student ID already exists'}), 409
    conn.close()
    return jsonify({'id': cur.lastrowid}), 201


@bp.route('/gwa/api/students/<int:sid>', methods=['GET', 'PUT', 'DELETE'])
@login_required
def student(sid):
    conn = db()
    row = conn.execute('SELECT * FROM g_students WHERE id=?', (sid,)).fetchone()
    if row is None:
        conn.close()
        return jsonify({'error': 'Student not found'}), 404
    if request.method == 'GET':
        d = student_payload(conn, row)
        d['grades'] = [dict(g) for g in conn.execute('SELECT * FROM g_grades WHERE student_id=? ORDER BY id', (sid,))]
        conn.close()
        return jsonify(d)
    if request.method == 'DELETE':
        conn.execute('DELETE FROM g_students WHERE id=?', (sid,))
        conn.commit()
        conn.close()
        return jsonify({'message': 'Deleted'})
    data, missing = body('student_id', 'first_name', 'last_name', 'email', 'gender', 'year', 'section')
    if missing:
        conn.close()
        return jsonify({'error': 'Missing: ' + ', '.join(missing)}), 400
    try:
        conn.execute('UPDATE g_students SET student_id=?, first_name=?, last_name=?, email=?, gender=?, year=?, section=? WHERE id=?',
                     (data['student_id'], data['first_name'], data['last_name'], data['email'],
                      data['gender'], int(data['year']), data['section'].upper(), sid))
        if isinstance(data.get('grades'), list):
            conn.execute('DELETE FROM g_grades WHERE student_id=?', (sid,))
            for g in data['grades']:
                if str(g.get('subject', '')).strip() and g.get('grade') not in (None, ''):
                    grade, units = float(g['grade']), float(g.get('units') or 3)
                    if not (1.0 <= grade <= 5.0) or units <= 0:
                        raise ValueError('Grades must be 1.00-5.00 and units > 0')
                    conn.execute('INSERT INTO g_grades (student_id, subject, units, grade) VALUES (?,?,?,?)',
                                 (sid, g['subject'].strip(), units, grade))
        conn.commit()
    except sqlite3.IntegrityError:
        conn.close()
        return jsonify({'error': 'Student ID already exists'}), 409
    except ValueError as e:
        conn.close()
        return jsonify({'error': str(e)}), 400
    conn.close()
    return jsonify({'message': 'Updated'})


@bp.route('/gwa/api/teachers', methods=['GET', 'POST'])
@login_required
def teachers():
    conn = db()
    if request.method == 'GET':
        out = [dict(r) for r in conn.execute('SELECT * FROM g_teachers ORDER BY name')]
        conn.close()
        return jsonify(out)
    data, missing = body('name', 'email')
    if missing:
        conn.close()
        return jsonify({'error': 'Missing: ' + ', '.join(missing)}), 400
    cur = conn.execute('INSERT INTO g_teachers (name, email, department, subject) VALUES (?,?,?,?)',
                       (data['name'], data['email'], data.get('department'), data.get('subject')))
    conn.commit()
    conn.close()
    return jsonify({'id': cur.lastrowid}), 201


@bp.route('/gwa/api/teachers/<int:tid>', methods=['PUT', 'DELETE'])
@login_required
def teacher(tid):
    conn = db()
    if request.method == 'DELETE':
        conn.execute('DELETE FROM g_teachers WHERE id=?', (tid,))
    else:
        data, missing = body('name', 'email')
        if missing:
            conn.close()
            return jsonify({'error': 'Missing: ' + ', '.join(missing)}), 400
        conn.execute('UPDATE g_teachers SET name=?, email=?, department=?, subject=? WHERE id=?',
                     (data['name'], data['email'], data.get('department'), data.get('subject'), tid))
    conn.commit()
    conn.close()
    return jsonify({'message': 'OK'})


@bp.route('/gwa/api/registrations', methods=['GET', 'POST'])
@login_required
def registrations():
    conn = db()
    if request.method == 'GET':
        out = [dict(r) for r in conn.execute(
            "SELECT * FROM g_registrations ORDER BY status='Pending' DESC, id DESC")]
        conn.close()
        return jsonify(out)
    data, missing = body('role', 'first_name', 'last_name', 'email')
    if missing:
        conn.close()
        return jsonify({'error': 'Missing: ' + ', '.join(missing)}), 400
    conn.execute('INSERT INTO g_registrations (role, first_name, last_name, email, gender, year, section, subject)'
                 ' VALUES (?,?,?,?,?,?,?,?)',
                 (data['role'], data['first_name'], data['last_name'], data['email'], data.get('gender'),
                  data.get('year') or None, (data.get('section') or '').upper() or None, data.get('subject')))
    conn.commit()
    conn.close()
    return jsonify({'message': 'Created'}), 201


@bp.route('/gwa/api/registrations/<int:rid>/<action>', methods=['POST'])
@login_required
def review_registration(rid, action):
    if action not in ('approve', 'reject'):
        return jsonify({'error': 'Invalid action'}), 400
    conn = db()
    reg = conn.execute('SELECT * FROM g_registrations WHERE id=?', (rid,)).fetchone()
    if reg is None or reg['status'] != 'Pending':
        conn.close()
        return jsonify({'error': 'Registration not found or already reviewed'}), 400
    if action == 'approve':
        if reg['role'] == 'Teacher':
            conn.execute('INSERT INTO g_teachers (name, email, department, subject) VALUES (?,?,?,?)',
                         (f"{reg['first_name']} {reg['last_name']}", reg['email'], None, reg['subject']))
        else:
            year = reg['year'] or 1
            prefix = f'0{26 - year}'
            count = conn.execute('SELECT COUNT(*) FROM g_students').fetchone()[0]
            sid = f'{prefix}-{count:04d}'
            while conn.execute('SELECT 1 FROM g_students WHERE student_id=?', (sid,)).fetchone():
                count += 1
                sid = f'{prefix}-{count:04d}'
            section = reg['section']
            if not section:  # balance sections within the year level
                counts = {s: conn.execute('SELECT COUNT(*) FROM g_students WHERE year=? AND section=?',
                                          (year, s)).fetchone()[0] for s in 'ABC'}
                section = min(counts, key=counts.get)
            conn.execute('INSERT INTO g_students (student_id, first_name, last_name, email, gender, year, section)'
                         ' VALUES (?,?,?,?,?,?,?)',
                         (sid, reg['first_name'], reg['last_name'], reg['email'],
                          reg['gender'] or 'Male', year, section))
    conn.execute('UPDATE g_registrations SET status=? WHERE id=?',
                 ('Approved' if action == 'approve' else 'Rejected', rid))
    conn.commit()
    conn.close()
    return jsonify({'message': 'OK'})
