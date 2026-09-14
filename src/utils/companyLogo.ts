// Logo aziendale per select/liste: preferisce il simbolo quadrato del tema
// corrente, poi il simbolo dell'altro tema, infine le varianti orizzontali.

export interface CompanyLogoFields {
  logo_light?: string | null;
  logo_dark?: string | null;
  logo_horizontal_light?: string | null;
  logo_horizontal_dark?: string | null;
}

export function getCompanyLogoUrl(company: CompanyLogoFields, theme: "light" | "dark"): string | null {
  if (theme === "dark") {
    return (
      company.logo_dark ??
      company.logo_light ??
      company.logo_horizontal_dark ??
      company.logo_horizontal_light ??
      null
    );
  }
  return (
    company.logo_light ??
    company.logo_dark ??
    company.logo_horizontal_light ??
    company.logo_horizontal_dark ??
    null
  );
}
