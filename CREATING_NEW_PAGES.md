# 🧩 Creating New Pages (proposal / demo workflow)

This guide explains how to add a **new screen/page** to the dashboard **in an isolated branch**, only to **demo a proposal** for review — without disturbing other people's in‑progress work.

It is written to be **AI‑friendly**: if you work with an AI coding assistant, you can paste the [AI task template](#-ai-task-template) and the conventions below directly into it.

---

## 0. Golden rules (isolation)

> The goal is a branch that **shows** a new page and can be reviewed, **not** final integration.

- ✅ **Always branch from `dev`** (freshly pulled). Never branch from someone else's `feat/*` branch.
- ❌ **Never** push to `dev`, `main`, or anyone else's branch. Never merge/rebase their branches into yours.
- ✅ Put as much code as possible in **new files** (new files never cause merge conflicts).
- 🚫 **Do not touch** the files/areas listed in [Files you must NOT edit](#-files-you-must-not-edit). They belong to features under active development.
- ✅ The only shared files you edit are the **3 wiring files** (route + access + nav). Add your entries **at the end** of each list, in a single small commit.
- ✅ When done, **push your branch and open a Draft PR → `dev`** (or just share the branch name). The owner decides what/when to integrate.

---

## 1. Branch & setup

```bash
git checkout dev
git pull origin dev
git checkout -b feat/<your-page-name>     # e.g. feat/reports-overview

# install & run
make install        # or: npm install
cp .env.example .env # fill local values if needed
make dev            # or: npm run dev   → http://localhost:5173
```

Branch naming follows [`CONTRIBUTING.md`](./CONTRIBUTING.md): `feat/` for a new screen, `docs/`, `fix/`, etc.

---

## 2. Project structure (where things go)

| Folder | Put here |
|---|---|
| `src/pages/` | One file per page: `MyThingPage.tsx`, exporting `export function MyThingPage()` |
| `src/components/` | Reusable UI (group feature components in a subfolder, e.g. `src/components/reports/`) |
| `src/hooks/` | Reusable stateful logic (`useXyz.ts`) |
| `src/api/` | API calls + TypeScript types for requests/responses |
| `src/utils/` | Pure helpers |
| `src/context/` | React context providers (rarely needed for a new page) |

Use existing UI atoms from `src/components/ui/` (`Button`, `Input`, `Modal`, `Badge`, `Icon`, `Spinner`, `SearchableSelect`, `MultiSelect`, `Checkbox`, `Textarea`, …) and the existing Tailwind utility classes / helper classes (`section-title`, `section-lead`, `section-eyebrow`).

---

## 3. Add a page in 4 steps

Suppose the page is **"Reports"** at route `/reports`.

### Step 1 — Create the page component

`src/pages/ReportsPage.tsx`

```tsx
import { Icon } from "../components/ui/Icon";

export function ReportsPage() {
  return (
    <div className="px-10 py-8 pb-20 max-w-[1600px] mx-auto w-full animate-fadeIn">
      <div className="mb-8">
        <div className="section-eyebrow">
          <Icon name="activity" className="w-3.5 h-3.5" />
          Proposta
        </div>
        <h1 className="section-title">Reports</h1>
        <p className="section-lead">Descrizione breve della pagina.</p>
      </div>

      {/* TODO: contenuto della pagina */}
    </div>
  );
}
```

> Handle **loading / error / empty** states explicitly when you fetch data (see existing pages, e.g. `src/pages/WorkItemsPage.tsx`). Use `Spinner` for loading.

### Step 2 — Register the route — `src/App.tsx`

Add the import near the other page imports, then add a `<Route>` **inside** the `DashboardLayout` route block (the one with `index`, `users`, `workload`, …), as the **last** child route:

```tsx
import { ReportsPage } from "./pages/ReportsPage";
```

```tsx
<Route path="reports" element={<RouteAccess routeKey="reports"><ReportsPage /></RouteAccess>} />
```

`RouteAccess` enforces login + permissions using the `routeKey` you pass.

### Step 3 — Declare access — `src/utils/access.ts`

1. Add your key to the `AppRouteKey` union:

```ts
export type AppRouteKey =
  | "dashboard"
  // …existing keys…
  | "reports";   // ← add at the end
```

2. Add a `case` in `canAccessRoute`. For a demo visible to **every logged‑in user**:

```ts
case "reports":
  return true;
```

> Alternatives: `return permissions.is_admin;` (admin only) or `return permissions.allowed_views.includes("reports");` (driven by backend permissions). For a proposal/demo, `return true` is the simplest.

### Step 4 — Add the sidebar link — `src/layouts/DashboardLayout.tsx`

Add an entry to `allNavItems` (use an existing icon name from `src/components/ui/Icon`; pick a `group` from `overview | operations | commercial | catalog | account | admin`):

```tsx
{
  label: "Reports",
  to: "/reports",
  icon: <Icon name="document-text" />,
  routeKey: "reports",
  group: "overview",
},
```

The sidebar shows the item automatically because nav items are filtered through `canAccessRoute(permissions, item.routeKey)`.

✅ That's it. `make dev` and open `/reports`.

---

## 4. Verify before sharing

```bash
npm run lint    # must pass (no NEW errors you introduced)
npm run build   # must pass — this is the real gate (tsc + vite)
```

- Test the page logged in.
- Check responsive layout (desktop + mobile).
- Keep API URLs/secrets out of code (use `.env`).

---

## 5. Share for review (don't merge)

```bash
git add .
git commit -m "feat: add reports proposal page"
git push origin feat/reports-overview
```

Then open a **Draft PR → `dev`** (or send the branch name). Do **not** merge. The owner reviews and decides whether/how to integrate.

---

## 🚫 Files you must NOT edit

These belong to features under active development — editing them will collide with ongoing work. **Leave them alone** (read them for reference if useful, but don't change them):

- `src/pages/WorkloadPage.tsx`
- `src/components/workload/**` (e.g. `OperatorCalendarColumn.tsx`, `MultiOperatorCalendar.tsx`, `calendarUtils.ts`)
- `src/pages/WorkItemsPage.tsx`, `src/components/work-items/**`
- `src/api/workload.ts`, `src/api/workItems.ts`
- `src/pages/UsersPage.tsx`, `src/api/users.ts`, `src/api/auth.ts`

The **only** shared files you may edit are: `src/App.tsx`, `src/utils/access.ts`, `src/layouts/DashboardLayout.tsx` — and only to **append** your route/access/nav entries.

If your page needs data that doesn't exist yet, add a **new** file in `src/api/` (e.g. `src/api/reports.ts`) rather than editing an existing API file.

---

## 🤖 AI task template

Paste this into your AI assistant (Claude Code / Cursor / etc.), filling the `<>` placeholders:

```
You are adding a NEW PAGE to a React + TypeScript + Vite + Tailwind dashboard.
Follow the repo guide CREATING_NEW_PAGES.md EXACTLY.

Task: create a page named "<Title>" at route "/<route>".
What it shows: <describe the screen, data, interactions>.

Hard rules:
- Work only on the current git branch (feat/<name>), branched from dev.
- Create the page in src/pages/<Title>Page.tsx exporting `export function <Title>Page()`.
- Wire it in EXACTLY these files, appending entries at the end of each list:
  1) src/App.tsx → import the page + add a <Route path="<route>" element={<RouteAccess routeKey="<key>"><...Page/></RouteAccess>} /> inside the DashboardLayout route block.
  2) src/utils/access.ts → add "<key>" to AppRouteKey and a `case "<key>": return true;` in canAccessRoute.
  3) src/layouts/DashboardLayout.tsx → add a nav item { label, to: "/<route>", icon: <Icon name="..."/>, routeKey: "<key>", group: "<group>" }.
- Reuse UI atoms from src/components/ui/ and Tailwind classes (section-title, section-lead).
- Any new API calls/types go in a NEW file src/api/<name>.ts (do NOT edit existing api files).
- Handle loading / error / empty states. Type all props and API responses.
- DO NOT touch any file under src/components/workload, src/components/work-items,
  src/pages/WorkloadPage.tsx, src/pages/WorkItemsPage.tsx, src/pages/UsersPage.tsx,
  src/api/workload.ts, src/api/workItems.ts, src/api/users.ts, src/api/auth.ts.
- When done, run `npm run build` and fix any errors. Do not run git push.

Deliver: the new page working at /<route>, build green.
```

---

## Quick reference

| Step | File | Action |
|---|---|---|
| 1 | `src/pages/<X>Page.tsx` | create page component (new file) |
| 2 | `src/App.tsx` | import + `<Route>` with `RouteAccess routeKey` |
| 3 | `src/utils/access.ts` | add key to `AppRouteKey` + `case` in `canAccessRoute` |
| 4 | `src/layouts/DashboardLayout.tsx` | add item to `allNavItems` |
| ✔ | — | `npm run build` & `npm run lint`, then push branch + Draft PR to `dev` |
