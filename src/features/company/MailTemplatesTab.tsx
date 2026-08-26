import { MailTemplatesManager } from "../email/MailTemplatesManager";

// Scheda "Modelli email" nelle impostazioni del brand: modelli CONDIVISI
// dell'organizzazione (scope="company"), modificabili solo dagli admin.
export function MailTemplatesTab({ companyId, isAdmin }: { companyId: number; isAdmin: boolean }) {
  return (
    <div className="bg-paper dark:bg-[#131316] rounded-lg border border-line dark:border-[#2a2a2e] p-6">
      <h2
        className="font-display font-bold tracking-tight text-ink dark:text-[#f4f4f7] mb-1"
        style={{ fontSize: "17px" }}
      >
        Modelli email
      </h2>
      <p className="font-body text-[13px] text-muted dark:text-[#9999a0] mb-5">
        Modelli condivisi con tutta l'organizzazione, riutilizzabili da operatori, PM e admin. La firma
        del mittente viene sempre aggiunta in coda e non è rimovibile.
        {isAdmin ? "" : " Solo gli admin possono modificarli."}
      </p>
      <MailTemplatesManager companyId={companyId} scope="company" canEdit={isAdmin} />
    </div>
  );
}
