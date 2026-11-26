# Furnace Studio Management

Furnace Studio Management is a local studio-operations app for tracking products and inventory, a financial ledger in Australian dollars, and a plan of tasks and calendar schedules. The React frontend talks to a Next.js API that stores data as JSON files on disk.

## Features

- **Home dashboard** — overview widgets for plans/tasks, the financial ledger, and featured products.
- **Products & inventory** — product records with a picture gallery, a PDF product sheet, and ZIP export of pictures and details.
- **Financial report** — a ledger of budget, spending, and sales entries recorded in AUD.
- **Plan** — tasks with sub-tasks, plus a calendar of schedules.
- **One-click backup** — download the full API data folder as a ZIP file.

## Tech stack

- **Frontend:** React 19 and Vite (TypeScript)
- **API:** Next.js 16 App Router API routes (TypeScript)
- **PDF product sheets:** pdfmake
- **Storage:** JSON files under `furnace api/data/`, with atomic writes (temp file + rename), a per-file write queue, and version conflict checks (`If-Match` revisions)

## Project structure

```text
.
├── furnace software/          # Vite + React frontend (port 3000)
│   ├── src/page/              # Home, Products, Financial Report, Plan
│   ├── src/common/            # Navbar, backup button, shared UI
│   └── vite.config.ts         # Proxies /api to the backend in dev and preview
└── furnace api/               # Next.js API (port 3001)
    ├── app/api/               # product, financial-report, plans, data-backup
    └── data/                  # Runtime JSON and product folders (not committed)
        ├── *.example.json     # Empty starter files to copy before the first run
        └── product/           # Created as products are added (images + product.json)
```

The two packages have separate `package.json` files and lockfiles. Install and run them independently.

## Local setup

You need Node.js 20+ (required by Next.js 16) and npm.

The API reads these files on startup and does not create them automatically:

- `furnace api/data/financial-report.json`
- `furnace api/data/plans.json`
- `furnace api/data/task.json`
- `furnace api/data/current-project.json`

Product listing can run without `order.json` and `home-products.json`; those files, along with each product's folder (including `product.json` and uploaded images), are written when you add or arrange products. All of this live data is gitignored.

```sh
# From the repo root — seed empty data files (needed once, before the first API start)
cp "furnace api/data/financial-report.example.json" "furnace api/data/financial-report.json"
cp "furnace api/data/plans.example.json" "furnace api/data/plans.json"
cp "furnace api/data/task.example.json" "furnace api/data/task.json"
cp "furnace api/data/current-project.example.json" "furnace api/data/current-project.json"
cp "furnace api/data/product/order.example.json" "furnace api/data/product/order.json"
cp "furnace api/data/product/home-products.example.json" "furnace api/data/product/home-products.json"

# API
cd "furnace api"
npm install
npm run dev          # next dev -p 3001

# Frontend (separate terminal)
cd "furnace software"
npm install
npm run dev          # vite --port 3000 --strictPort
```

Open [http://localhost:3000](http://localhost:3000). In development and `preview`, Vite forwards `/api` requests to `http://localhost:3001`.

Other scripts in each package:

```sh
npm run typecheck    # tsc --noEmit
npm run build        # frontend: tsc --noEmit && vite build
                     # API: next build
npm run preview      # frontend only: vite preview --port 3000 --strictPort
npm start            # API only: next start -p 3001
```

For a production-style run, build both packages, start the API with `npm start`, and serve the frontend `dist/` folder from a static server that forwards `/api` to the API (or use `npm run preview` in the frontend to inspect the local production build).

## Screenshots

_Add screenshots of the Home dashboard, Products, Financial Report, and Plan pages here._

## Author

Built by Xuewei (Shawn) Wang with AI-assisted development (Codex).
