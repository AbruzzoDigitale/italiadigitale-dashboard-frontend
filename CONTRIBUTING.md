# 🚀 Contributing – Branching & Commit Guidelines

These rules ensure a clean and consistent workflow.
Always follow these guidelines when working on this repository.

---

## 📌 Repository Branches

- **`dev`** → Development environment (main branch for developers).
- **`main`** → Production environment.

All work starts from **`dev`**. Only validated code reaches **`main`**.

---

## 🌿 Branch Naming

For each new task, create a branch from `dev` using this convention:

| Type | Description | Example |
|---|---|---|
| `feat/` | New feature | `feat/workload-grid-area-view` |
| `fix/` | Bug fix | `fix/calendar-overflow-label` |
| `docs/` | Documentation | `docs/readme-setup` |
| `refactor/` | Refactoring without new features | `refactor/workitems-form-state` |
| `test/` | Tests added or modified | `test/workload-api-mappers` |
| `chore/` | Miscellaneous (build, deps, tooling) | `chore/update-vite` |

👉 Always use short and descriptive names.

---

## ✍️ Commit Messages

Write clear and consistent messages:

```text
<type>: <short description>
```

Examples:
- `feat: add operator and area tabs in allocation grid`
- `fix: reload allocation grid when range mode changes`
- `docs: update frontend setup steps`
- `refactor: extract workload chart helpers`
- `chore: upgrade eslint config`

✅ Make frequent and meaningful commits
✅ Every commit must pass build/lint locally
❌ Do not write commit messages in Italian

---

## 🔄 Pull Requests (PR)

1. Complete your work in the feature branch.
2. Open a PR targeting **`dev`**.
3. At least one team member must perform a code review.
4. After approval → merge into `dev`.

---

## 🚀 From `dev` to `main`

- When `dev` is stable: open a PR `dev` → `main`.
- After review → merge into `main` → production deploy.

---

## 🧱 Frontend Feature Checklist

For each frontend feature:

- [ ] Update/add API types in `src/api/` if contract changes
- [ ] Implement UI in `src/components/` and/or `src/pages/`
- [ ] Keep reusable logic in `src/hooks/` or `src/utils/`
- [ ] Handle loading/error/empty states in UI
- [ ] Ensure responsive behavior (desktop + mobile)
- [ ] Run `npm run lint`
- [ ] Run `npm run build`
- [ ] Update `README.md` if setup/workflow changed

---

## 🧩 New Pages & Proposal / Demo Branches

If you are adding a **new page/screen** — especially as a **proposal to demo** before integration — follow **[`CREATING_NEW_PAGES.md`](./CREATING_NEW_PAGES.md)**. It is also written to be used with AI coding assistants.

Key isolation rules for proposal branches:

- 🌿 Branch from **`dev`** (freshly pulled), **never** from someone else's `feat/*` branch.
- 🆕 Keep new code in **new files**; the only shared files you edit are `src/App.tsx`, `src/utils/access.ts`, `src/layouts/DashboardLayout.tsx` (append your route/access/nav entries).
- 🚫 Do **not** edit files of features under active development (workload, work‑items, users) — see the "Files you must NOT edit" list in the guide.
- 🔍 Push your branch and open a **Draft PR → `dev`** so the owner can review. **Do not merge** into shared or others' branches.

---

## 📝 Important Rules

- ❌ No direct pushes to `main` or `dev`
- ✅ All PRs must be reviewed before merging
- 🌿 Delete branches after merge
- ❌ Do not commit `.env` or secrets
- ✅ Keep API URLs and secrets in environment/config

---

## 🧠 Workflow Summary

```bash
# Start from dev
git checkout dev
git pull origin dev

# Create your feature branch
git checkout -b feat/my-feature

# Work, commit, push
git add .
git commit -m "feat: add my feature"
git push origin feat/my-feature

# Open PR → review → merge into dev
# Periodically: dev → main for production release
```

---

## Setup ambiente di sviluppo

```bash
git clone https://github.com/AbruzzoDigitale/italiadigitale-dashboard-frontend
cd italiadigitale-dashboard-frontend
make install
cp .env.example .env
# Compila .env con i valori locali
make dev
```

---

## Code Conventions

- Use TypeScript types for props, payloads and API responses.
- Keep components small and composable.
- Prefer explicit loading/error guards in each async view.
- Avoid business logic duplication between pages/components.
- Run lint/build before opening a PR.
