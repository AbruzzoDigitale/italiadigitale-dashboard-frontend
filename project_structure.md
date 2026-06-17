# Project Structure — React Admin Frontend

Guida per replicare questo setup in un nuovo progetto frontend React + TypeScript + Vite + Tailwind CSS.

---

## Stack tecnologico

| Strumento | Versione | Ruolo |
|---|---|---|
| React | 19 | UI library |
| TypeScript | 6 | Type safety |
| Vite | 8 | Build tool / dev server |
| Tailwind CSS | 3 | Utility-first styling |
| React Router DOM | 7 | Client-side routing |
| PostCSS + Autoprefixer | 8 / 10 | CSS processing |

### Dipendenze opzionali usate in questo progetto
- `@microsoft/fetch-event-source` — SSE / streaming API
- `emoji-picker-react` — emoji picker
- `react-email-editor` — editor visuale email

---

## 1. Inizializzazione progetto

```bash
npm create vite@latest my-app -- --template react-ts
cd my-app
npm install
```

### Installa Tailwind CSS

```bash
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

### Installa React Router

```bash
npm install react-router-dom
```

---

## 2. Configurazione file

### `tailwind.config.js`

```js
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",          // dark mode via classe "dark" sul <html>
  theme: {
    extend: {
      colors: {
        brand: {
          // definisci qui il tuo design system di colori
          primary: "#E8611A",
          "primary-dark": "#C04E0E",
          // ...
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
```

### `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true
  },
  "include": ["src"]
}
```

### `vite.config.ts`

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
});
```

### `index.html`

- Font Google (Inter) caricato con `preconnect` + `<link>` stylesheet
- Un solo `<div id="root">` come punto di mount

```html
<!doctype html>
<html lang="it">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/png" href="/favicon.png" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>App – Admin</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap"
      rel="stylesheet"
    />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

### `src/index.css`

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --scrollbar-thumb: #E8611A;
    --scrollbar-track: #F5ECD7;
  }
  .dark {
    --scrollbar-thumb: #6B3FA0;
    --scrollbar-track: #1e1a2e;
  }
  * {
    scrollbar-width: thin;
    scrollbar-color: var(--scrollbar-thumb) var(--scrollbar-track);
  }
  *::-webkit-scrollbar { width: 6px; height: 6px; }
  *::-webkit-scrollbar-track { background: var(--scrollbar-track); }
  *::-webkit-scrollbar-thumb {
    background-color: var(--scrollbar-thumb);
    border-radius: 3px;
  }
  html { @apply font-sans; }
  body { @apply bg-brand-cream text-brand-brown transition-colors duration-300; }
}
```

---

## 3. Struttura cartelle `src/`

```
src/
├── main.tsx              # entry point — monta <App /> in #root
├── App.tsx               # router principale + provider nesting
├── index.css             # tailwind base + variabili CSS
├── vite-env.d.ts         # tipi env Vite
│
├── api/                  # funzioni di fetch verso il backend (nessuno stato)
│   ├── auth.ts           # login, authFetch, handler 401
│   └── *.ts              # un file per dominio (users, subscriptions, …)
│
├── context/
│   ├── AuthContext.tsx   # sessione utente + auto-logout su 401
│   └── ThemeContext.tsx  # light/dark mode con persistenza localStorage
│
├── hooks/
│   ├── useAuth.ts        # re-export di useAuthContext (barrel)
│   └── use*.ts           # hook per fetch/stato per ogni dominio
│
├── layouts/
│   └── DashboardLayout.tsx  # sidebar + outlet per le pagine protette
│
├── pages/
│   ├── LoginPage.tsx
│   ├── DashboardHome.tsx
│   └── *.tsx             # una pagina per sezione
│
└── components/
    ├── ui/               # componenti primitivi riusabili
    │   ├── Button.tsx
    │   ├── Modal.tsx
    │   ├── Toast.tsx
    │   ├── Input.tsx
    │   ├── Select.tsx
    │   ├── Badge.tsx
    │   ├── Spinner.tsx
    │   ├── Pagination.tsx
    │   ├── ConfirmDialog.tsx
    │   └── UserSearchField.tsx
    └── <dominio>/        # componenti specifici per feature
        ├── *Table.tsx
        ├── *Form.tsx
        ├── *Filters.tsx
        └── *Modal.tsx
```

---

## 4. Pattern architetturali chiave

### Provider nesting in `App.tsx`

L'ordine è importante: `ThemeProvider` più esterno, poi `ToastProvider`, poi `AuthProvider` (che usa `useToast`).

```tsx
export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/*" element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>} />
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
```

### ProtectedRoute

```tsx
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return <Spinner />;
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
}
```

### `authFetch` — fetch autenticata con gestione 401

Ogni chiamata API autenticata passa per `authFetch` in `api/auth.ts`:
- Legge il token da `localStorage`
- Se riceve un 401, chiama un handler globale registrato da `AuthContext`
- L'handler triggera il logout + toast "sessione scaduta"

```ts
const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8001";

export async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = localStorage.getItem("app_token");
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  if (res.status === 401 && !_unauthorizedFired) {
    _unauthorizedFired = true;
    _unauthorizedHandler?.();
  }
  return res;
}
```

### AuthContext — sessione con localStorage

- Al mount legge `token` + `user` da localStorage e ripristina la sessione
- `login()` salva token + user in localStorage e nello state
- `logout()` pulisce tutto
- 401 handler globale: usa un `ref` stabile per evitare stale closure

### ThemeContext — dark mode con classe CSS

```tsx
useEffect(() => {
  document.documentElement.classList.toggle("dark", theme === "dark");
  localStorage.setItem("app_theme", theme);
}, [theme]);
```

---

## 5. Variabili d'ambiente

Creare un file `.env` (non committarlo) e un `.env.example`:

```env
# .env
VITE_API_URL=http://localhost:8001
```

Accesso nel codice:
```ts
const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8001";
```

---

## 6. Componenti UI riusabili — contratto minimo

### `Button`
Props: `variant` (`primary | secondary | ghost | danger | danger-ghost`), `size` (`sm | md | lg`), `loading`, `leftIcon`, `rightIcon`.  
Usa `forwardRef` per supporto nei form.

### `Modal`
Props: `open`, `onClose`, `title`, `description`, `size` (`sm | md | lg | xl`), `footer`.  
Usa `createPortal` su `document.body`. Chiude con `Escape`. Blocca lo scroll del body.

### `Toast`
Context-based (`useToast()`). Metodi: `.success()`, `.error()`, `.info()`, `.warning()`.  
Animazione CSS transition. Auto-dismiss configurabile (default 3500ms).

### `ConfirmDialog`
Wrappa `Modal` con testo di conferma + bottoni "Annulla" / "Conferma".  
Usato prima di qualsiasi azione distruttiva (delete, ecc.).

---

## 7. Deploy — Docker + nginx

### `Dockerfile` (multi-stage)

```dockerfile
# Stage 1: build
FROM node:lts-alpine AS builder
WORKDIR /app
COPY package.json ./
RUN npm install --legacy-peer-deps
COPY . .
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# Stage 2: serve
FROM nginx:stable-alpine
RUN rm -rf /usr/share/nginx/html/*
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
```

> `VITE_API_URL` viene iniettata come `ARG` a build-time (necessario perché Vite incorpora le env nel bundle).

### `nginx.conf`

```nginx
server {
    listen 8080;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/javascript;

    location ~* \.(js|css|png|jpg|svg|woff2?)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
}
```

**Porta 8080**: richiesta da Cloud Run (o altri runtime container). Adattare se necessario.

---

## 8. Convenzioni di naming

| Tipo | Convenzione | Esempio |
|---|---|---|
| Componenti | PascalCase | `UserTable.tsx` |
| Hook | camelCase con prefisso `use` | `useAuth.ts` |
| API functions | camelCase con suffisso `Api` | `loginApi`, `getUsersApi` |
| Context | PascalCase + suffisso `Context` | `AuthContext.tsx` |
| Pagine | PascalCase + suffisso `Page` | `ClientiPage.tsx` |
| Layout | PascalCase + suffisso `Layout` | `DashboardLayout.tsx` |

---

## 9. Checklist setup nuovo progetto

- [ ] `npm create vite@latest` con template `react-ts`
- [ ] Installa Tailwind + PostCSS + Autoprefixer
- [ ] Configura `tailwind.config.js` con `darkMode: "class"` e colori brand
- [ ] Configura `tsconfig.json` con `strict: true`
- [ ] Crea struttura cartelle `api/`, `context/`, `hooks/`, `layouts/`, `pages/`, `components/ui/`
- [ ] Implementa `authFetch` con handler 401 globale
- [ ] Implementa `AuthContext` con ripristino sessione da localStorage
- [ ] Implementa `ThemeContext` con toggle dark mode
- [ ] Implementa `ToastProvider` con context
- [ ] Aggiungi `ProtectedRoute` in `App.tsx`
- [ ] Crea `DashboardLayout` con sidebar + `<Outlet />`
- [ ] Crea `.env` e `.env.example` con `VITE_API_URL`
- [ ] Crea `Dockerfile` multi-stage + `nginx.conf` con SPA fallback
