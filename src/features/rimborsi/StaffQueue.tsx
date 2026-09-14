import { useState } from "react";
import { Button } from "../../components/ui/Button";
import { Icon } from "../../components/ui/Icon";
import { Modal } from "../../components/ui/Modal";
import { Textarea } from "../../components/ui/Textarea";
import type { Trip, TripStatus } from "../../api/expenses";
import { dateIt, euro, num } from "./format";
import { EvidencePins, PersonAvatar, ReceiptsHint } from "./TripBits";

// Coda approvazioni: le trasferte dei collaboratori entrano nella
// rendicontazione solo dopo il via libera dell'admin. Chi respinge deve dire
// perché — è quello che il collaboratore legge nella notifica.

type Filter = TripStatus | "all";

interface Props {
  trips: Trip[];
  people: { id: number; name: string; initials: string }[];
  onApprove: (trip: Trip) => void;
  onReject: (trip: Trip, reason: string) => void;
  onApproveAll: () => void;
  onOpen: (trip: Trip) => void;
  onNew: () => void;
}

const FILTERS: { key: Filter; label: string }[] = [
  { key: "da_approvare", label: "Da approvare" },
  { key: "approvata", label: "Approvate" },
  { key: "respinta", label: "Respinte" },
  { key: "all", label: "Tutte" },
];

export function StaffQueue({ trips, people, onApprove, onReject, onApproveAll, onOpen, onNew }: Props) {
  const [filter, setFilter] = useState<Filter>("da_approvare");
  const [person, setPerson] = useState<number | "all">("all");
  const [rejecting, setRejecting] = useState<Trip | null>(null);
  const [reason, setReason] = useState("");

  const pending = trips.filter((t) => t.status === "da_approvare");
  const approved = trips.filter((t) => t.status === "approvata");
  const rejected = trips.filter((t) => t.status === "respinta");

  const shown = trips.filter(
    (t) => (filter === "all" || t.status === filter) && (person === "all" || t.user_id === person)
  );

  const counts: Record<Filter, number> = {
    da_approvare: pending.length,
    approvata: approved.length,
    respinta: rejected.length,
    bozza: 0,
    all: trips.length,
  };

  const confirmReject = () => {
    if (!rejecting || !reason.trim()) return;
    onReject(rejecting, reason.trim());
    setRejecting(null);
    setReason("");
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi
          value={pending.length}
          label="da approvare"
          note={euro(pending.reduce((sum, t) => sum + t.total, 0))}
          tone="warning"
        />
        <Kpi
          value={approved.length}
          label="approvate"
          note={euro(approved.reduce((sum, t) => sum + t.total, 0))}
          tone="success"
        />
        <Kpi value={rejected.length} label="respinte" tone="danger" />
        <Kpi value={new Set(trips.map((t) => t.user_id)).size} label="collaboratori" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1 rounded-md border border-line p-1 dark:border-[#2a2a2e]">
          {FILTERS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setFilter(item.key)}
              className={`rounded-sm px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
                filter === item.key
                  ? "bg-brand-magenta text-white"
                  : "text-muted hover:bg-cream dark:text-muted-dark dark:hover:bg-[#1c1c20]"
              }`}
            >
              {item.label}
              {counts[item.key] > 0 && (
                <span className="ml-1.5 opacity-70">{counts[item.key]}</span>
              )}
            </button>
          ))}
        </div>

        {people.length > 1 && (
          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              onClick={() => setPerson("all")}
              className={`rounded-pill px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                person === "all"
                  ? "bg-ink text-white dark:bg-white dark:text-ink"
                  : "border border-line text-muted dark:border-[#2a2a2e] dark:text-muted-dark"
              }`}
            >
              Tutti
            </button>
            {people.map((p) => (
              <button
                key={p.id}
                type="button"
                title={p.name}
                onClick={() => setPerson(p.id)}
                className={`h-7 w-7 rounded-full text-[10px] font-bold transition-colors ${
                  person === p.id
                    ? "bg-brand-magenta text-white"
                    : "bg-brand-purple/10 text-brand-purple dark:bg-brand-magenta/15 dark:text-brand-magenta"
                }`}
              >
                {p.initials}
              </button>
            ))}
          </div>
        )}

        <span className="flex-1" />
        <Button variant="ghost" size="sm" onClick={onNew} leftIcon={<Icon name="plus" className="h-3.5 w-3.5" />}>
          Aggiungi trasferta
        </Button>
        {pending.length > 0 && (
          <Button variant="primary" size="sm" onClick={onApproveAll} leftIcon={<Icon name="check" className="h-3.5 w-3.5" />}>
            Approva tutte <span className="ml-1 opacity-80">{pending.length}</span>
          </Button>
        )}
      </div>

      {shown.length === 0 ? (
        <div className="rounded-lg border border-dashed border-line px-4 py-10 text-center text-sm text-muted dark:border-[#2a2a2e] dark:text-muted-dark">
          Nessuna trasferta in questa vista.
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {shown.map((trip) => (
            <StaffCard key={trip.id} trip={trip} onApprove={onApprove} onOpen={onOpen} onReject={setRejecting} />
          ))}
        </div>
      )}

      <p className="flex items-start gap-2 rounded-md border border-line bg-cream/60 px-3 py-2.5 text-[11px] text-muted dark:border-[#2a2a2e] dark:bg-[#1c1c20] dark:text-muted-dark">
        <Icon name="info" className="mt-[1px] h-3.5 w-3.5 shrink-0" />
        <span>
          Le trasferte dei collaboratori entrano nella rendicontazione <b>solo dopo l'approvazione</b>: le righe
          approvate vengono scritte sul foglio del commercialista con la stessa struttura, quelle respinte restano
          fuori e tornano al collaboratore con il motivo.
        </span>
      </p>

      <Modal
        open={rejecting !== null}
        onClose={() => {
          setRejecting(null);
          setReason("");
        }}
        size="md"
        icon={<Icon name="x" className="h-5 w-5" />}
        title="Respingi trasferta"
        description={rejecting ? `${rejecting.user_name} · ${dateIt(rejecting.trip_date)} · ${rejecting.location}` : ""}
        footer={
          <div className="flex items-center gap-2">
            <span className="flex-1" />
            <Button
              variant="ghost"
              onClick={() => {
                setRejecting(null);
                setReason("");
              }}
            >
              Annulla
            </Button>
            <Button variant="danger" onClick={confirmReject} disabled={!reason.trim()}>
              Respingi trasferta
            </Button>
          </div>
        }
      >
        {rejecting && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3 rounded-md border border-line p-3 sm:grid-cols-4 dark:border-[#2a2a2e]">
              <Recap label="Importo richiesto" value={euro(rejecting.total)} />
              <Recap label="Chilometri" value={`${num(rejecting.km)} km`} />
              <Recap label="Prove" value={`${rejecting.evidence.present}/${rejecting.evidence.total}`} />
              <Recap label="Giustificativi" value={String(rejecting.attachments.length)} />
            </div>
            <Textarea
              label="Motivo del rifiuto *"
              rows={4}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Es. manca l'appuntamento in agenda / spesa non documentata / trasferta non aziendale"
            />
            <p className="text-[11px] text-muted dark:text-muted-dark">
              Il collaboratore riceve una notifica con questo motivo e può correggere la richiesta.
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}

function StaffCard({
  trip,
  onApprove,
  onReject,
  onOpen,
}: {
  trip: Trip;
  onApprove: (trip: Trip) => void;
  onReject: (trip: Trip) => void;
  onOpen: (trip: Trip) => void;
}) {
  const pending = trip.status === "da_approvare";
  const border =
    trip.status === "approvata"
      ? "border-success/30"
      : trip.status === "respinta"
        ? "border-danger/30"
        : "border-warning/40";

  return (
    <article className={`flex flex-col rounded-lg border bg-paper shadow-1 dark:bg-[#131316] ${border}`}>
      <header className="flex items-center gap-2 border-b border-line px-3 py-2.5 dark:border-[#2a2a2e]">
        <PersonAvatar trip={trip} />
        <span className="min-w-0 flex-1">
          <b className="block truncate text-[12px]">{trip.user_name}</b>
          <span className="block truncate text-[10px] text-muted dark:text-muted-dark">
            {[trip.user_role, trip.vehicle_label].filter(Boolean).join(" · ")}
          </span>
        </span>
        <span className="text-[13px] font-bold text-brand-magenta">{euro(trip.total)}</span>
      </header>

      <button type="button" onClick={() => onOpen(trip)} className="px-3 py-2.5 text-left">
        <div className="flex flex-wrap items-center gap-2 text-[12px]">
          <span className="font-medium">{dateIt(trip.trip_date)}</span>
          <span className="font-semibold">{trip.location}</span>
          {trip.abroad && (
            <span className="rounded-xs bg-brand-cyan/15 px-1.5 py-[1px] text-[9px] font-bold uppercase text-brand-cyan">
              Estero
            </span>
          )}
        </div>
        <p className="mt-0.5 text-[11px] text-muted dark:text-muted-dark">{trip.reason}</p>

        <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-muted dark:text-muted-dark">
          <span>{num(trip.km)} km</span>
          <span>·</span>
          <span>{euro(trip.km_allowance)} indennità km</span>
          {trip.expenses_total > 0 && (
            <>
              <span>·</span>
              <span>{euro(trip.expenses_total)} spese</span>
            </>
          )}
          <ReceiptsHint trip={trip} />
        </div>

        <div className="mt-2 flex items-center gap-2">
          <EvidencePins trip={trip} size="xs" />
          {!trip.evidence.complete && pending && (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-warning">
              <Icon name="alert-triangle" className="h-3 w-3" /> Prove incomplete
            </span>
          )}
        </div>
      </button>

      {trip.status === "respinta" && trip.reject_reason && (
        <p className="mx-3 mb-3 rounded-md border border-danger/25 bg-danger/8 px-2.5 py-2 text-[11px] text-danger">
          <b>Respinta.</b> {trip.reject_reason}
        </p>
      )}
      {trip.status === "approvata" && (
        <p className="mx-3 mb-3 rounded-md border border-success/25 bg-success/8 px-2.5 py-2 text-[11px] text-success">
          Approvata{trip.approved_by ? ` da ${trip.approved_by}` : ""}.{" "}
          {trip.synced ? "Inclusa nella rendicontazione." : "In coda per il foglio."}
        </p>
      )}

      {pending && (
        <div className="flex gap-2 border-t border-line px-3 py-2.5 dark:border-[#2a2a2e]">
          <Button variant="ghost" size="sm" onClick={() => onReject(trip)} leftIcon={<Icon name="x" className="h-3.5 w-3.5" />}>
            Respingi
          </Button>
          <span className="flex-1" />
          <Button variant="primary" size="sm" onClick={() => onApprove(trip)} leftIcon={<Icon name="check" className="h-3.5 w-3.5" />}>
            Approva
          </Button>
        </div>
      )}
    </article>
  );
}

function Kpi({
  value,
  label,
  note,
  tone = "default",
}: {
  value: number;
  label: string;
  note?: string;
  tone?: "default" | "warning" | "success" | "danger";
}) {
  const color =
    tone === "warning"
      ? "text-warning"
      : tone === "success"
        ? "text-success"
        : tone === "danger"
          ? "text-danger"
          : "";
  return (
    <div className="rounded-lg border border-line bg-paper px-3 py-2.5 shadow-1 dark:border-[#2a2a2e] dark:bg-[#131316]">
      <b className={`block text-[20px] leading-none ${color}`}>{value}</b>
      <span className="mt-1 block text-[11px] text-muted dark:text-muted-dark">{label}</span>
      {note && <span className="mt-0.5 block text-[11px] font-semibold">{note}</span>}
    </div>
  );
}

function Recap({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="block text-[10px] uppercase tracking-wider text-muted dark:text-muted-dark">{label}</span>
      <b className="text-[12px]">{value}</b>
    </div>
  );
}
