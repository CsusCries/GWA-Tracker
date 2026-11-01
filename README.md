# Student GWA Tracking System

A static website (HTML, CSS and JavaScript) for tracking students' General Weighted Average (GWA). There is no server.

- **Dashboard**: total, male and female students, per-year breakdown, average GWA and top performers. Every tile is clickable.
- **Students**: grouped by year, section and gender, with search and filters. Edit details and grades; the GWA is units-weighted.
- **Teachers**: add, edit and delete.
- **Registrations**: approve or reject student and teacher sign-ups.

## Use it

Open `index.html` in a browser, or host the folder on GitHub Pages. Sign in with `admin` / `admin123`.

## Data

All data is saved in the browser's localStorage, so each browser and device has its own copy. It starts with demo data. To restore the demo data, run `DB.reset()` in the browser console, then reload.

The login is front-end only and not secure. Anyone can read the password in `js/db.js`.

## Adding a database later

All reads and writes go through one function, `api(path, options)`, in `js/db.js`. It uses the same routes a real backend would, such as `GET /students` and `PUT /students/:id`; the full list is at the top of that file. To switch to a real database, build those routes on your server and replace `js/db.js` with a `fetch()` version, as shown in the comment at the top of the file. Nothing else needs to change.

## Files

- `index.html`: the page
- `css/style.css`: styles
- `js/app.js`: UI and interactions
- `js/db.js`: data layer and login
