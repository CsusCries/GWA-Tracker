# Student GWA Tracking System

A static website (HTML, CSS and JavaScript) for tracking students' General Weighted Average (GWA). There is no server.

- **Dashboard**: totals, male/female, average GWA, honors, at-risk and not-yet-graded counts for the selected term. Every tile opens the matching list.
- **School terms**: grades belong to a school year and semester. Pick any term at the top to view or correct it. Each student has a term GWA and an overall GWA, plus a GWA history.
- **Students**: grouped by year and section, with search and filters (gender, standing). Select students to move them to another section or archive them. Archive has Undo, and archived students can be restored. Import from CSV, export to CSV, and print.
- **Grade Sheet**: enter one subject's grades for a whole section at once, with live class average, passed/failed counts and remarks.
- **Teachers**: add teachers and assign the classes (year, section and subject) they handle.
- **Registrations**: approve or reject student and teacher sign-ups.
- **Settings**: start the 2nd semester or end the school year (promotes 1st–3rd Year and graduates 4th Year), set the honors and at-risk GWA limits, and manage each year level's sections and per-semester curriculum. Risky changes ask for confirmation first.

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
