/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: "#0a0a0a",
          soft: "#1a1a1a",
          2: "#2a2a2a",
        },
        paper: "#ffffff",
        cream: "#f7f5f1",
        line: {
          DEFAULT: "#e8e6e0",
          dark: "#2e2e2e",
        },
        muted: {
          DEFAULT: "#6b6b6b",
          dark: "#8a8a8a",
        },
        brand: {
          purple: "#2b1342",
          "purple-mid": "#4a1d6e",
          magenta: "#c41284",
          cyan: "#2ec3f3",
          yellow: "#fcd43c",
          pink: "#e91e8a",
        },
        success: "#16a34a",
        warning: "#f59e0b",
        danger: "#dc2626",
        info: "#2563eb",
      },
      fontFamily: {
        display: ["'Space Grotesk'", "system-ui", "sans-serif"],
        body: ["'Lato'", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "'SF Mono'", "Menlo", "monospace"],
      },
      letterSpacing: {
        tight: "-0.025em",
        wider: "0.12em",
      },
      boxShadow: {
        1: "0 1px 2px rgba(0,0,0,.06), 0 1px 1px rgba(0,0,0,.04)",
        2: "0 6px 18px rgba(0,0,0,.08), 0 2px 4px rgba(0,0,0,.04)",
        3: "0 18px 48px rgba(0,0,0,.16), 0 6px 12px rgba(0,0,0,.08)",
        glow: "0 8px 32px rgba(196,18,132,0.35)",
      },
      borderRadius: {
        xs: "4px",
        sm: "6px",
        md: "10px",
        lg: "16px",
        xl: "22px",
        "2xl": "28px",
        pill: "999px",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        slideDown: {
          "0%": { opacity: "0", transform: "translateY(-8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        fadeIn: "fadeIn 0.3s cubic-bezier(.2,.7,.2,1) both",
        slideDown: "slideDown 0.25s cubic-bezier(.2,.7,.2,1) both",
      },
    },
  },
  plugins: [],
};

