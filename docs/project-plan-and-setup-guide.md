# Travel Discovery App — Project Plan & Setup Guide

Prepared for Blake — 20 August 2026

This document lays out the architecture, tech stack, and a concrete path to get from "nothing set up" to "app running locally and deployed." It doesn't contain code yet — that's the next phase, once the foundations below are in place. Wherever a project name is needed, this guide uses `travel-app` as a placeholder; swap in your real name when you create the repo.

## 1. Architecture at a glance

The system has three moving parts that talk to each other over HTTPS, and each one lives in a different place.

The **client** is a Progressive Web App built with React and Vite. It's what a user opens in their mobile browser (and can "install" to their home screen like a native app), and later it becomes the source for real Android and iOS builds via Capacitor, without a separate codebase. It gets built into a folder of static HTML/CSS/JS files and hosted on a static web host.

The **API server** is a Node.js/Express application. It's the only thing that talks directly to the database — the client never touches the database itself. It handles requests like "give me restaurants near this location in Lyon," authentication if you add user accounts later, and any business logic (filtering, ranking, caching). It runs on Render as a persistent web service.

The **database** is PostgreSQL, also hosted on Render, sitting next to (or reachable from) the API server. It stores the actual data: cities, restaurants, activities, categories, and eventually things like user reviews or saved favorites. Because "restaurants near me" is fundamentally a location query, the plan includes PostGIS, a PostgreSQL extension purpose-built for geographic queries — it's what lets you efficiently ask "what's within 2km of this point" instead of writing slow manual distance math.

The reason this shape is scalable is that each piece scales independently. If the API gets busy, Render lets you scale that service up (more CPU/RAM) or out (more instances behind a load balancer) without touching the database or client. If the client gets popular, a static host serves it from a CDN with essentially unlimited capacity. And because the API is the only thing touching the database, you can add caching (Redis) or read replicas later without changing how the client works at all.

## 2. Tech stack summary

| Layer | Choice | Why |
|---|---|---|
| Client | React + Vite | Best-supported path to Capacitor for native Android/iOS later; `vite-plugin-pwa` handles service worker and manifest generation |
| Client state/data | React Query (server state) + Zustand (UI state) | Standard, lightweight pairing that scales well as screens multiply |
| Client mapping | MapLibre GL or Leaflet | Open-source, no API-key lock-in for basic maps (you'll still want a geocoding provider — see note below) |
| API server | Node.js + Express | Same language as the client (JavaScript/TypeScript), simple mental model, huge library support |
| Database | PostgreSQL + PostGIS | Render-native hosting, and PostGIS is the standard tool for "near me" queries |
| ORM/query layer | Prisma or Knex | Prisma gives you type safety and migrations out of the box; Knex is lighter if you prefer writing more raw SQL |
| Hosting: API + DB | Render | Matches your instinct — both run there, and Render can auto-deploy on every GitHub push |
| Hosting: client | Render Static Site, Netlify, or Vercel | Any of these serve a Vite build for free at small scale; Render Static Site keeps everything under one dashboard |
| Native wrapping (later) | Capacitor | Wraps the existing PWA build for Android (now) and iOS (later, requires a Mac) with no code rewrite |
| Source control / CI | GitHub + GitHub Actions | Matches your existing account; Actions can run tests before Render deploys |

One thing worth flagging early: a geocoding/places data source. If "restaurants and activities in a city" data isn't something you're entering by hand, you'll eventually want either a licensed dataset or an API like Google Places, Foursquare, or OpenStreetMap-based Overpass/Nominatim. That's a business decision more than a technical one, so it's not part of this setup guide — but it affects your database schema, so it's worth deciding before you seed real data (OpenStreetMap-derived data is free and self-hostable, which fits a "scalable, low fixed-cost" philosophy well).

## 3. Repository structure and GitHub setup

A monorepo (one GitHub repo containing both `client/` and `server/` folders) is recommended over two separate repos. At your current stage, a single repo is easier to keep in sync, easier to open in one editor window, and still deploys cleanly to Render — Render lets you point a service at a subfolder of a monorepo.

Recommended structure:

```
travel-app/
├── client/          # React + Vite PWA
├── server/          # Express API
├── .github/
│   └── workflows/   # GitHub Actions (added later)
├── .gitignore
└── README.md
```

To set this up yourself, run the following from your own machine (not this sandbox):

1. Create a new, empty repository on github.com named `travel-app` (or your chosen name). Don't initialize it with a README — you'll push one from your machine instead.
2. On your machine, create the folder structure above and run `git init` inside it.
3. Add a `.gitignore` covering `node_modules/`, `.env`, `dist/`, and `build/` (I can generate the exact file content for you when we scaffold code).
4. Run `git add .`, then `git commit -m "Initial project structure"`.
5. Run `git branch -M main`.
6. Run `git remote add origin https://github.com/<your-username>/travel-app.git`.
7. Run `git push -u origin main`.

From then on, a simple branch workflow works well even solo: keep `main` always deployable, do work on short-lived feature branches (`feature/restaurant-search`), and merge via pull request even when you're the only reviewer — it gives you a clean history and a natural place to hook up automated checks later.

## 4. Local development environment

You mentioned wanting to test locally before anything touches Render — that's the right instinct, and it's fully supported by this stack.

Prerequisites to install on your computer: Node.js (LTS version, 20.x or later), and Docker Desktop (the easiest way to run PostgreSQL locally without installing it system-wide).

To run PostgreSQL locally in a disposable container:

1. Install Docker Desktop and make sure it's running.
2. From your project root, run a command like `docker run --name travel-app-db -e POSTGRES_PASSWORD=devpassword -e POSTGRES_DB=travelapp -p 5432:5432 -d postgis/postgis:16-3.4` — this uses the official PostGIS-enabled Postgres image, so you don't need a separate step to enable the extension.
3. Confirm it's running with `docker ps`.

For the server, once code exists in `server/`: run `npm install`, create a `.env` file with a `DATABASE_URL` pointing at `postgresql://postgres:devpassword@localhost:5432/travelapp`, then `npm run dev` (using something like `nodemon` for auto-restart on changes).

For the client, once code exists in `client/`: run `npm install`, then `npm run dev` — Vite's dev server will serve the PWA on `localhost` with hot reload, and it'll be configured to send API requests to your local server (typically `localhost:3000` or similar, via a `.env` variable like `VITE_API_URL`).

This means your day-to-day loop is entirely local and free: edit code, see it reload instantly, test against a local database seeded with sample restaurant data. Render only enters the picture when you're ready to deploy or share a working version.

## 5. Render deployment setup

Render hosts two things for you here: the PostgreSQL database and the Express API. Do this after the local version is working, not before — there's no benefit to deploying broken code, and (see the cost note below) there's a real reason not to rush the database part in particular.

**A cost/timing note, checked against Render's current pricing (August 2026):** the free web service tier (used for the API) never expires — it's free indefinitely, it just spins down after 15 minutes of no traffic and takes roughly a minute to wake back up on the next request. The free PostgreSQL tier is different: it expires 30 days after creation, with a 14-day grace period before deletion, after which keeping a database alive costs at least $6/month. In practice this means there's no cost pressure to touch Render at all while developing — local Docker Postgres (section 4) has no clock on it. When you're ready for a live, shareable version, you can either accept Render's free database as a time-boxed demo, or point the API at a database provider with a genuinely non-expiring free tier instead, most notably Neon (0.5GB storage, PostGIS supported, compute auto-suspends after 5 minutes idle rather than expiring on a calendar). The API doesn't care which company hosts the database — it just needs a connection string — so this choice can be changed later without restructuring anything.

For the database:

1. In the Render dashboard, create a new PostgreSQL instance. Render's managed Postgres doesn't currently ship PostGIS pre-enabled the way the Docker image does, so after creation you'll connect via `psql` (Render gives you a connection command) and run `CREATE EXTENSION postgis;` once.
2. Render will give you an internal connection string (for services also hosted on Render) and an external one (for connecting from your own machine, e.g. to run migrations manually). Save both somewhere safe — not committed to git.

For the API server:

1. Create a new Web Service on Render, pointing it at your GitHub repo and the `server/` subfolder.
2. Set the build command (typically `npm install`) and start command (typically `npm start`).
3. Add environment variables in Render's dashboard — at minimum `DATABASE_URL` set to the internal connection string from step 2 above, so the API and database talk to each other without leaving Render's network.
4. Enable auto-deploy so every push to `main` redeploys automatically once you're happy with that workflow (you can also start with manual deploys until you trust the pipeline).

Because the client only ever talks to the API over HTTPS, your local client can point at either your local server or the live Render server just by changing one environment variable — handy for testing "does this work against real deployed data" without deploying the client itself.

## 6. Client hosting and PWA essentials

A PWA has two extra requirements beyond a normal web app: a **web app manifest** (a JSON file describing the app's name, icons, and colors, which is what lets a phone "install" it to the home screen) and a **service worker** (a background script that enables offline caching and fast repeat loads). `vite-plugin-pwa` generates both for you from a small config block, which avoids the most common source of PWA bugs — hand-written service workers with subtly wrong caching logic.

For hosting the built client, Render Static Site is the simplest choice if you want everything in one dashboard alongside the API and database — you point it at the `client/` subfolder, give it the build command (`npm run build`) and output folder (`dist`), and it serves the result from a CDN automatically, including HTTPS. Netlify and Vercel are equally good alternatives if you ever want to split hosting providers; the build is a generic static folder, so there's no lock-in either way.

One PWA-specific gotcha worth knowing now: service workers cache aggressively by design, so during early development it's normal to have the browser serving a stale cached version after you deploy a change. This is expected, not a bug — `vite-plugin-pwa`'s default config handles versioning this correctly, but it's worth understanding so it doesn't cause confusion later.

## 7. Path to native apps (Capacitor)

Once the PWA is solid, Capacitor takes the exact same `client/` build output and wraps it in a real native app shell. For Android, this means installing Android Studio, running `npx cap add android`, and building an APK/AAB from the generated native project — the JavaScript code inside doesn't change. For iOS, the same process applies with `npx cap add ios`, but it requires a Mac with Xcode installed (this is an Apple platform requirement, not a limitation of your stack) — which lines up with your plan to do Android first and Apple later. Capacitor also gives you access to native device features (camera, precise geolocation, push notifications) through official plugins if the app needs them beyond what a browser can do.

## 8. Starter database schema (draft)

This is a first-pass sketch to seed early development — not final. It'll evolve once you decide on a data source (see the geocoding note in section 2).

- `cities` — id, name, country, latitude, longitude, timezone
- `categories` — id, name (e.g. "restaurant," "museum," "hiking trail"), parent_category_id (for subcategories)
- `places` — id, city_id, category_id, name, description, address, location (a PostGIS `geography` column for lat/lon), price_level, rating, source (where the data came from), created_at, updated_at
- `place_photos` — id, place_id, url, sort_order
- `users` — id, email, password_hash, created_at (only needed once you add accounts/favorites)
- `favorites` — user_id, place_id (a join table, once accounts exist)

The `location` column using PostGIS's `geography` type is what makes "restaurants within 2km of me" a fast, indexed query rather than a slow calculation across every row.

## 9. Starter API endpoints (draft)

- `GET /api/cities` — list supported cities
- `GET /api/cities/:cityId/places?category=restaurant&near=lat,lon&radius=2000` — search places in a city, optionally filtered by category and proximity
- `GET /api/places/:placeId` — single place detail
- `GET /api/categories` — list available categories
- `POST /api/auth/register`, `POST /api/auth/login` — once accounts exist
- `POST /api/favorites`, `DELETE /api/favorites/:placeId` — once accounts exist

## 10. Scalability notes for later

None of this needs to be built now, but it's worth knowing the levers exist so early decisions don't box you in. Render lets you scale the API service vertically (bigger instance) or horizontally (multiple instances behind its built-in load balancer) with no code changes, as long as the API stays stateless (no in-memory session data — use the database or a token-based auth scheme). Read-heavy endpoints like place search are good candidates for a caching layer (Redis, also hostable on Render) once traffic grows. Place photos and other static assets should go to object storage (Render Disks, or S3-compatible storage) with a CDN in front, rather than being served through the API itself. And the `places` table should get proper indexes on `city_id`, `category_id`, and the PostGIS `location` column from day one — retrofitting indexes on a large table later is far more painful than adding them early.

## 11. This week's checklist

1. ~~Install Node.js (LTS) and Docker Desktop on your development machine.~~ **Done.**
2. Create the empty `travel-app` repository on GitHub.
3. Set up the local folder structure and push the initial commit (section 3, steps 2–7).
4. Start the local PostgreSQL container (section 4) and confirm it's reachable.
5. Come back here and we'll scaffold the actual React + Vite client and Express server code together, wired up to run against that local database.
6. Only once you actually want a live, shareable version — no rush, and no cost while you stay local — decide between Render's free (30-day) Postgres or a non-expiring option like Neon, then set up the Render web service for the API and a static site for the client (sections 5–6).

Not blocking the steps above, but worth doing in parallel:

7. Set up a Cowork Project (e.g. "Travel App"), connect it to your local repo folder once it exists, and put the tech stack decisions from section 2 into its instructions field. Move this chat into that project (see section 13).
8. Decide on your restaurant/activity data source — licensed API (Google Places, Foursquare), OpenStreetMap, or manual entry. It doesn't block starting to code, but it does shape the schema in section 8, so settle it before too much gets built around assumptions.

## 12. What we build next

The natural next session is scaffolding the real code: a working Vite + React PWA shell with the manifest and service worker configured, a minimal Express server with the endpoints above stubbed out, a Prisma or Knex schema matching section 8, and a seed script with a handful of sample restaurants so you have something on screen immediately. Just say the word when you're ready and we'll build it directly in a session like this one, then walk through pushing it to your new GitHub repo.

## 13. Working with Claude on this project

Since this will run over months and grow past a single conversation, a bit of organization up front pays off. Create a Cowork Project (e.g. "Travel App") and connect it to the local folder your repo lives in — that gives every session inside it access to your actual files instead of copy-pasting code back and forth. Put the tech stack decisions from section 2 into that Project's instructions field so new sessions don't need re-briefing. This conversation is a good candidate to move into that Project once it exists (via the dropdown next to the chat name → "Add to project"), since it's where most of the foundational decisions were made. Inside the Project, start a new session per distinct chunk of work (client scaffolding, API work, database seeding, deployment) rather than one continuous chat — sessions in the same Project still share the connected folder and accumulated memory.

For day-to-day work, Sonnet 5 is a good default — it's what this session runs on. Reach for Opus 5 on the genuinely tricky bits (the PostGIS schema design, a bug Sonnet seems to be circling rather than solving) rather than as a new default, since heavier models draw down your plan's usage allowance faster. You can check consumption any time at Settings → Usage.

For non-technical data entry: once the server exists, Prisma Studio (bundled with Prisma) gives a free, instant table editor for your own use while the schema is still settling. Once the schema stabilizes and a teammate is ready to add real content, set up a proper tool like Directus or AdminJS pointed at the same database — a day or so of setup for a real dropdown-and-form interface, rather than a custom-built feature of the app itself.
