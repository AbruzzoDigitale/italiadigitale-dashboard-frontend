import { MultiSelect } from "../../ui/MultiSelect";
import { useKpiData } from "../KpiDataContext";

type Dim = "operator" | "area" | "client";

/**
 * Selettore delle entità da confrontare in un widget di confronto (per operatore /
 * area / cliente). Mostrato in modalità modifica; la scelta è salvata nel config del
 * widget. Vuoto = mostra tutte (top N).
 */
export function EntityComparePicker({
  dimension,
  value,
  onChange,
}: {
  dimension: Dim;
  value: number[];
  onChange: (ids: number[]) => void;
}) {
  const { options } = useKpiData();
  const opts =
    dimension === "operator" ? options.operators : dimension === "area" ? options.areas : options.clients;
  const placeholder =
    dimension === "operator" ? "Tutti gli operatori" : dimension === "area" ? "Tutte le aree" : "Tutti i clienti";
  return (
    <MultiSelect value={value} onChange={onChange} options={opts} placeholder={placeholder} searchPlaceholder="Cerca…" />
  );
}
