import type { ReactNode } from "react";
import type { GridItem } from "../grid/gridEngine";

/** Istanza concreta di un widget nel layout: geometria + tipo + config. */
export interface WidgetInstance extends GridItem {
  type: string;
  config: Record<string, unknown>;
}

/** Definizione di un TIPO di widget (nel registry). */
export interface WidgetDef {
  type: string;
  label: string;
  /** Dimensione predefinita all'inserimento, in celle. */
  defaultSize: { w: number; h: number };
  /** Dimensione minima consentita in resize, in celle. */
  minSize: { w: number; h: number };
  render: (instance: WidgetInstance) => ReactNode;
}
