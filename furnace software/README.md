# Furnace Software

React and TypeScript frontend powered by Vite.

Run `npm install` and `npm run dev` in both this project and the sibling
`furnace api` project. Open http://localhost:3000. Vite forwards `/api`
requests to the Next.js backend on port 3001 in development and preview.

## Frontend structure

- `src/page` contains the routed pages. Each page uses a PascalCase folder and
  a matching entry component. Put page-specific subcomponents in their own
  PascalCase folders under the owning page.
- Home widgets are grouped under `src/page/Home/HomePageWidget`, with a
  folder for each widget. Home's header clock lives separately in `HomeClock`.
- Put reusable UI in `src/common` and shared type definitions in
  `src/interface`. Use camelCase filenames for data and utility modules.
- Keep component-specific styles alongside their component and page-wide
  styles in the page's stylesheet.

Plan opens to Task. The Calendar tab saves schedules in
`furnace api/data/plans.json`. Open Calendar once in each browser profile that
holds existing schedules, using the same app origin where they were saved.
Calendar imports those schedules into the API, keeping existing API entries
when IDs match.

The Plan API serves schedules at `/api/plans/calendar` and Task at
`/api/plans/task`. The legacy `/api/plans` URL still serves Calendar.
Task continues to use `furnace api/data/task.json`.

```sh
npm run build
npm run preview
```
