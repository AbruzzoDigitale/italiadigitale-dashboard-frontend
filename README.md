# Italia Digitale – Dashboard Admin Frontend

React frontend for the **Italia Digitale** admin dashboard.
It provides the operational UI for work items, workload planning, clients/contracts and related management views.

## 🛠 Stack

- **React 19** + **TypeScript**
- **Vite 8** for dev/build
- **Tailwind CSS** + custom design tokens/components
- **React Router** for navigation
- **Vitest** for unit tests
- **Nginx + Docker** for production static serving

## 🚀 Setup

### 1. Prerequisites

- Node.js 22+ (recommended)
- npm 10+

### 2. Install dependencies

```bash
make install
# oppure:
npm install
```

### 3. Environment variables

```bash
cp .env.example .env
# Edit .env with your values
```

| Variable | Description |
|---|---|
| `VITE_API_URL` | Backend base URL (used by Vite at build/runtime in frontend app logic) |

### 4. Run in development

```bash
make dev
# oppure:
npm run dev
# → http://127.0.0.1:5173
```

### 5. Build, preview, test

```bash
make build      # production build in dist/
make preview    # preview built app
npm run test    # vitest
npm run lint    # eslint
```

## 📁 Project Structure

```text
src/
├── api/                # API clients and request/response types
├── components/         # Reusable UI and domain components
├── context/            # React context providers
├── features/           # Feature-centric modules
├── hooks/              # Custom hooks
├── layouts/            # App layouts
├── pages/              # Route pages
└── utils/              # Utility helpers
public/                 # Static assets
preventivatore-abruzzo-digitale/   # Legacy/standalone related assets
```

## 🌐 Deployment

The app is deployed as a static bundle served by **Nginx** on **Google Cloud Run**.

```bash
make deploy
# runs deploy.sh → docker build → push Artifact Registry → gcloud run deploy
```

Current deployment defaults in `deploy.sh`:
- project: `italiadigitale`
- service: `italiadigitale-dashboard`
- region: `europe-west8`

## 📝 Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for branching, commit and PR guidelines.

---

> **Italia Digitale** — Abruzzo Digitale SRL
