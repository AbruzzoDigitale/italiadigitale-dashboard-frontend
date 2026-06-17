export interface NormalizedCompanyPayload {
  company_id: number;
  company_ids: number[];
}

function toNumberList(values: Array<number | null | undefined> | null | undefined): number[] {
  if (!values) return [];
  const nums = values
    .map((value) => (value == null ? NaN : Number(value)))
    .filter((value) => Number.isFinite(value) && value > 0);
  return Array.from(new Set(nums));
}

export function normalizeCompanyPayload(
  primaryCompanyId: number | null | undefined,
  selectedCompanyIds?: Array<number | null | undefined> | null
): NormalizedCompanyPayload {
  const primary = primaryCompanyId == null ? null : Number(primaryCompanyId);
  const ids = toNumberList(selectedCompanyIds);

  if (primary != null && Number.isFinite(primary) && primary > 0) {
    if (!ids.includes(primary)) ids.unshift(primary);
  }

  const finalIds = Array.from(new Set(ids));
  if (finalIds.length === 0) {
    throw new Error("Seleziona almeno un'azienda");
  }

  const finalPrimary = (primary != null && Number.isFinite(primary) && primary > 0)
    ? primary
    : finalIds[0];

  return {
    company_id: finalPrimary,
    company_ids: finalIds,
  };
}
