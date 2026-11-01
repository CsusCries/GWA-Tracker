# Student GWA Tracking System

Flask admin portal for tracking students' General Weighted Average (GWA).

- **Dashboard**: total, male and female students, per-year breakdown, average GWA and top performers. Every tile is clickable.
- **Students**: grouped by year, section and gender, with search and filters. Edit details and grades; the GWA is units-weighted.
- **Teachers**: add, edit and delete.
- **Registrations**: approve or reject student and teacher sign-ups.

## Run locally

```bash
pip install -r requirements.txt
python app.py
```

Open http://127.0.0.1:5000 and sign in with `admin` / `admin123`. Override these with `ADMIN_USER`, `ADMIN_PASS` and `SECRET_KEY`.

`gwa.db` is created and filled with demo data on first run.

Deploy with: `gunicorn app:app`
