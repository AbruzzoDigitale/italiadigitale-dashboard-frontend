import type { ChangeEvent, TextareaHTMLAttributes } from "react";
import { RichTextEditor } from "./RichTextEditor";

type TextareaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "onChange"> & {
  onChange?: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  label?: string;
};

function minHeightByRows(rows?: number): string {
  if (!rows || rows >= 4) return "min-h-[132px]";
  if (rows <= 2) return "min-h-[96px]";
  return "min-h-[112px]";
}

export function Textarea({
  value,
  onChange,
  placeholder,
  disabled,
  readOnly,
  rows,
  label,
  name,
  className,
}: TextareaProps) {
  const stringValue = typeof value === "string" ? value : value == null ? "" : String(value);

  const handleChange = (nextValue: string) => {
    if (!onChange) return;
    const syntheticTarget = {
      value: nextValue,
      name: name ?? "",
    } as HTMLTextAreaElement;

    onChange({
      target: syntheticTarget,
      currentTarget: syntheticTarget,
    } as ChangeEvent<HTMLTextAreaElement>);
  };

  return (
    <RichTextEditor
      label={label}
      value={stringValue}
      onChange={handleChange}
      placeholder={placeholder}
      disabled={Boolean(disabled || readOnly)}
      minHeightClassName={minHeightByRows(rows)}
      className={className}
    />
  );
}
