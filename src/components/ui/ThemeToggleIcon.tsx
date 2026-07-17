import { Icon } from "./Icon";

/**
 * Icona del toggle tema con transizione animata sole ⇄ luna (rotazione + dissolvenza).
 * Reagisce alla classe `.dark` sul root: chiaro → luna, scuro → sole (mostra dove porta
 * il click). L'animazione è gestita in index.css (`.theme-ico*`).
 */
export function ThemeToggleIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <span className="theme-ico" aria-hidden>
      <Icon name="moon" className={`theme-ico-moon ${className}`} />
      <Icon name="sun" className={`theme-ico-sun ${className}`} />
    </span>
  );
}
