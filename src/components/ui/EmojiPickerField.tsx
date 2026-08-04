import { EmojiPickerPopover } from "./EmojiPickerPopover";

interface EmojiPickerFieldProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  searchPlaceholder?: string;
}

function firstSymbol(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";

  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    const segments = segmenter.segment(trimmed)[Symbol.iterator]();
    const first = segments.next();
    return first.done ? "" : first.value.segment;
  }

  const units = Array.from(trimmed);
  return units[0] ?? "";
}

/** Campo-form con UNA emoji come valore (es. icona area di lavoro). */
export function EmojiPickerField({
  label,
  value,
  onChange,
  searchPlaceholder = "Cerca emoji...",
}: EmojiPickerFieldProps) {
  const selectedEmoji = firstSymbol(value);

  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">
          {label}
        </label>
      )}

      <EmojiPickerPopover
        onPick={(emoji) => onChange(firstSymbol(emoji))}
        searchPlaceholder={searchPlaceholder}
        renderTrigger={({ ref, toggle }) => (
          <button
            ref={ref}
            type="button"
            onClick={toggle}
            className="flex h-[42px] w-full items-center justify-center rounded-md border border-line bg-paper px-3 text-center text-xl leading-none text-ink transition-colors hover:bg-cream focus:border-ink focus:outline-none dark:border-line-dark dark:bg-ink-soft dark:text-paper dark:hover:bg-[#1c1c20] dark:focus:border-paper"
          >
            <span className={!selectedEmoji ? "text-muted dark:text-muted-dark" : ""} aria-hidden="true">
              {selectedEmoji || "😀"}
            </span>
          </button>
        )}
      />
    </div>
  );
}
