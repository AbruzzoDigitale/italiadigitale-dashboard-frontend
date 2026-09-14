import { useEffect, useCallback, useMemo, useRef, useState } from "react";
import { Modal } from "../../components/ui/Modal";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Textarea } from "../../components/ui/Textarea";
import { Checkbox } from "../../components/ui/Checkbox";
import { Icon } from "../../components/ui/Icon";
import { SearchableSelect } from "../../components/ui/SearchableSelect";
import { Spinner } from "../../components/ui/Spinner";
import { useToast } from "../../context/ToastContext";
import {
  computeRouteApi,
  computeTripRouteApi,
  createTripApi,
  deleteTripAttachmentApi,
  linkCalendarEventApi,
  listCalendarEventsApi,
  placesAutocompleteApi,
  unlinkCalendarEventApi,
  updateTripApi,
  uploadTripAttachmentApi,
  type CalendarEvent,
  type ExpenseSettings,
  type PlaceSuggestion,
  type RouteResult,
  type Trip,
  type TripAttachment,
  type Vehicle,
} from "../../api/expenses";
import { EVIDENCE_META, euro, fileSize, num, todayIso } from "./format";

// Modale di inserimento e modifica: cinque sezioni nell'ordine in cui si
// compila una trasferta — dove sei andato, quanto hai percorso, quanto hai
// speso, cosa alleghi, cosa lo prova.

interface Option {
  value: string;
  label: string;
}

interface Props {
  open: boolean;
  trip: Trip | null;
  companyId: number | null;
  settings: ExpenseSettings | null;
  vehicles: Vehicle[];
  clients: Option[];
  people: Option[];
  canApprove: boolean;
  currentUserId: number;
  onClose: () => void;
  onSaved: (trip: Trip) => void;
}

interface Draft {
  trip_date: string;
  location: string;
  reason: string;
  abroad: boolean;
  vehicle_id: string;
  client_id: string;
  user_id: string;
  origin_address: string;
  destination_address: string;
  round_trip: boolean;
  km: string;
  meal: string;
  lodging: string;
  parking: string;
  tolls: string;
  daily_allowance: string;
  notes: string;
}

function emptyDraft(
  settings: ExpenseSettings | null,
  currentUserId: number,
  vehicles: Vehicle[]
): Draft {
  // Il veicolo di partenza lo indica il backend (`is_suggested`): è la stessa
  // regola che applicherebbe salvando senza sceglierne uno — ultimo usato, poi
  // predefinito, poi il primo proprio, poi uno aziendale. Il form la mostra
  // invece di lasciare la tendina vuota e far credere che non ce ne sia uno.
  const suggerito = vehicles.find((v) => v.is_suggested);
  return {
    trip_date: todayIso(),
    location: "",
    reason: "",
    abroad: false,
    vehicle_id: suggerito ? String(suggerito.id) : "",
    client_id: "",
    user_id: String(currentUserId),
    origin_address: settings?.origin_address ?? "",
    destination_address: "",
    round_trip: true,
    km: "0",
    meal: "0",
    lodging: "0",
    parking: "0",
    tolls: "0",
    daily_allowance: settings && settings.daily_allowance_auto ? String(settings.daily_allowance) : "0",
    notes: "",
  };
}

function draftFromTrip(trip: Trip): Draft {
  return {
    trip_date: trip.trip_date,
    location: trip.location,
    reason: trip.reason,
    abroad: trip.abroad,
    vehicle_id: trip.vehicle_id ? String(trip.vehicle_id) : "",
    client_id: trip.client_id ? String(trip.client_id) : "",
    user_id: String(trip.user_id),
    origin_address: trip.origin_address ?? "",
    destination_address: trip.destination_address ?? "",
    round_trip: trip.round_trip,
    km: String(trip.km),
    meal: String(trip.meal),
    lodging: String(trip.lodging),
    parking: String(trip.parking),
    tolls: String(trip.tolls),
    daily_allowance: String(trip.daily_allowance),
    notes: trip.notes ?? "",
  };
}

/** Percorso salvato sulla trasferta, nella forma con cui lo usa la modale. */
function mapsFromTrip(trip: Trip | null): RouteResult | null {
  if (!trip?.maps || trip.maps.distance_km == null) return null;
  return {
    one_way_km: trip.maps.one_way_km ?? 0,
    distance_km: trip.maps.distance_km,
    duration_text: trip.maps.duration_text ?? "",
    duration_minutes: trip.maps.duration_minutes ?? 0,
    url: trip.maps.url ?? "",
    place_id: trip.maps.place_id,
    origin_resolved: trip.origin_address,
    destination_resolved: trip.destination_address,
  };
}

function calendarFromTrip(trip: Trip | null): CalendarEvent | null {
  if (!trip?.calendar?.event_id) return null;
  return {
    event_id: trip.calendar.event_id,
    title: trip.calendar.title ?? "",
    time: trip.calendar.time ?? "",
    url: trip.calendar.url,
    location: null,
    all_day: false,
    // La trasferta salva solo la fascia già formattata: gli estremi separati
    // esistono sull'evento vivo, non su quello che abbiamo memorizzato.
    start_time: "",
    end_time: "",
    duration_minutes: null,
    description: null,
  };
}

const toNumber = (value: string): number => {
  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
};

export function TripModal({
  open,
  trip,
  companyId,
  settings,
  vehicles,
  clients,
  people,
  canApprove,
  currentUserId,
  onClose,
  onSaved,
}: Props) {
  const toast = useToast();
  // Lo stato parte dalle props e non si risincronizza: la pagina rimonta la
  // modale (key) a ogni apertura, così non serve un effetto che copia props
  // dentro state a ogni render.
  const [draft, setDraft] = useState<Draft>(() =>
    trip ? draftFromTrip(trip) : emptyDraft(settings, currentUserId, vehicles)
  );
  const [maps, setMaps] = useState<RouteResult | null>(() => mapsFromTrip(trip));
  const [calendar, setCalendar] = useState<CalendarEvent | null>(() => calendarFromTrip(trip));
  const [attachments, setAttachments] = useState<TripAttachment[]>(() => trip?.attachments ?? []);
  const [pendingFiles, setPendingFiles] = useState<{ file: File; kind: "giustificativo" | "timeline" }[]>([]);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [placeId, setPlaceId] = useState<string | null>(null);
  const [events, setEvents] = useState<CalendarEvent[] | null>(null);
  const [busy, setBusy] = useState<"" | "route" | "save" | "events" | "upload">("");
  const suggestTimer = useRef<number | null>(null);

  const isNew = trip === null;

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  // La quota €/km non si sceglie: viene dalla tabella ACI del veicolo. Qui la si
  // mostra soltanto, perché è il moltiplicatore dell'importo più grosso.
  const ratePerKm = useMemo(() => {
    if (trip && String(trip.vehicle_id ?? "") === draft.vehicle_id) return trip.rate_per_km;
    const vehicle = vehicles.find((v) => String(v.id) === draft.vehicle_id);
    return vehicle?.current_rate_per_km ?? settings?.default_rate_per_km ?? 0;
  }, [draft.vehicle_id, trip, vehicles, settings]);

  const km = toNumber(draft.km);
  const kmAllowance = km * ratePerKm;
  const expenses =
    toNumber(draft.meal) + toNumber(draft.lodging) + toNumber(draft.parking) + toNumber(draft.tolls);
  const total = kmAllowance + expenses + toNumber(draft.daily_allowance);

  const requiredEvidence = settings?.evidence_required ?? [];
  const evidenceHave: Record<string, boolean> = {
    maps: maps != null,
    calendar: calendar != null,
    timeline: attachments.some((a) => a.kind === "timeline") || pendingFiles.some((f) => f.kind === "timeline"),
    gps: (trip?.checkins.length ?? 0) > 0,
  };

  // ── Autocomplete indirizzi ─────────────────────────────────────────────────
  const askSuggestions = useCallback(
    (query: string) => {
      if (suggestTimer.current) window.clearTimeout(suggestTimer.current);
      if (!settings?.maps_configured || query.trim().length < 3) {
        setSuggestions([]);
        return;
      }
      // Ogni battuta è una chiamata a pagamento: si aspetta che smetta di digitare.
      suggestTimer.current = window.setTimeout(async () => {
        try {
          setSuggestions(await placesAutocompleteApi(query, companyId));
        } catch {
          setSuggestions([]);
        }
      }, 350);
    },
    [companyId, settings?.maps_configured]
  );

  const pickSuggestion = (suggestion: PlaceSuggestion) => {
    set("destination_address", suggestion.description);
    if (!draft.location.trim()) set("location", suggestion.main_text ?? suggestion.description);
    setPlaceId(suggestion.place_id);
    setSuggestions([]);
  };

  // ── Percorso ───────────────────────────────────────────────────────────────
  const calcRoute = async (roundTrip = draft.round_trip) => {
    const destination = draft.destination_address.trim() || draft.location.trim();
    if (!destination) {
      toast.error("Indica la destinazione");
      return;
    }
    setBusy("route");
    try {
      if (trip) {
        const updated = await computeTripRouteApi(trip.id, {
          origin: draft.origin_address || null,
          destination,
          round_trip: roundTrip,
          destination_place_id: placeId,
        });
        onSaved(updated);
        setDraft(draftFromTrip(updated));
        setMaps(mapsFromTrip(updated));
        toast.success(`Percorso calcolato · ${num(updated.km)} km`);
      } else {
        const result = await computeRouteApi(
          { origin: draft.origin_address || null, destination, round_trip: roundTrip, destination_place_id: placeId },
          companyId
        );
        setMaps(result);
        setDraft((current) => ({
          ...current,
          km: String(result.distance_km),
          round_trip: roundTrip,
          destination_address: result.destination_resolved ?? destination,
          origin_address: result.origin_resolved ?? current.origin_address,
        }));
        toast.success(`Percorso calcolato · ${num(result.distance_km)} km`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Percorso non calcolato");
    } finally {
      setBusy("");
    }
  };

  const toggleRoundTrip = (value: boolean) => {
    set("round_trip", value);
    if (!maps) return;
    // Il percorso è già noto: raddoppiare i km è una moltiplicazione, non una
    // seconda chiamata a Google.
    const oneWay = maps.one_way_km || maps.distance_km / (draft.round_trip ? 2 : 1);
    const next = value ? oneWay * 2 : oneWay;
    setMaps({ ...maps, distance_km: Math.round(next * 10) / 10 });
    set("km", String(Math.round(next * 10) / 10));
  };

  // I veicoli arrivano da una fetch della pagina: se la modale si apre prima che
  // siano pronti, il draft nasce senza. Appena arrivano si preseleziona, ma solo
  // su una trasferta nuova e finché non ha scelto l'utente.
  useEffect(() => {
    if (trip || draft.vehicle_id) return;
    const suggerito = vehicles.find((v) => v.is_suggested);
    if (suggerito) set("vehicle_id", String(suggerito.id));
  }, [vehicles, trip, draft.vehicle_id]);

  // ── Agenda ─────────────────────────────────────────────────────────────────
  const loadEvents = async () => {
    setBusy("events");
    try {
      setEvents(
        await listCalendarEventsApi(draft.trip_date, {
          companyId,
          userId: canApprove ? Number(draft.user_id) : null,
        })
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Agenda non disponibile");
      setEvents([]);
    } finally {
      setBusy("");
    }
  };

  const chooseEvent = async (event: CalendarEvent) => {
    setEvents(null);
    if (trip) {
      try {
        const updated = await linkCalendarEventApi(trip.id, event);
        onSaved(updated);
        setCalendar(event);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Evento non collegato");
      }
    } else {
      setCalendar(event);
    }
  };

  const clearEvent = async () => {
    if (trip) {
      try {
        onSaved(await unlinkCalendarEventApi(trip.id));
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Evento non scollegato");
        return;
      }
    }
    setCalendar(null);
  };

  // ── Allegati ───────────────────────────────────────────────────────────────
  const addFiles = async (files: FileList | null, kind: "giustificativo" | "timeline") => {
    const list = Array.from(files ?? []);
    if (!list.length) return;
    if (!trip) {
      // Trasferta non ancora salvata: i file restano in attesa e partono subito
      // dopo la creazione, quando esiste la riga a cui agganciarli.
      setPendingFiles((current) => [...current, ...list.map((file) => ({ file, kind }))]);
      return;
    }
    setBusy("upload");
    try {
      for (const file of list) {
        const uploaded = await uploadTripAttachmentApi(trip.id, file, kind);
        setAttachments((current) => [...current, uploaded]);
      }
      toast.success(list.length === 1 ? "Allegato caricato" : `${list.length} allegati caricati`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Caricamento non riuscito");
    } finally {
      setBusy("");
    }
  };

  const removeAttachment = async (attachment: TripAttachment) => {
    if (!trip) return;
    try {
      await deleteTripAttachmentApi(trip.id, attachment.id);
      setAttachments((current) => current.filter((a) => a.id !== attachment.id));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Allegato non rimosso");
    }
  };

  // ── Salvataggio ────────────────────────────────────────────────────────────
  const save = async () => {
    if (!draft.location.trim() || !draft.reason.trim()) {
      toast.error("Compila località e motivazione");
      return;
    }
    if (km <= 0 && expenses <= 0) {
      toast.error("Inserisci i chilometri o almeno una spesa");
      return;
    }

    setBusy("save");
    try {
      const payload = {
        trip_date: draft.trip_date,
        location: draft.location.trim(),
        reason: draft.reason.trim(),
        abroad: draft.abroad,
        km,
        meal: toNumber(draft.meal),
        lodging: toNumber(draft.lodging),
        parking: toNumber(draft.parking),
        tolls: toNumber(draft.tolls),
        daily_allowance: toNumber(draft.daily_allowance),
        vehicle_id: draft.vehicle_id ? Number(draft.vehicle_id) : null,
        client_id: draft.client_id ? Number(draft.client_id) : null,
        notes: draft.notes.trim() || null,
        origin_address: draft.origin_address.trim() || null,
        destination_address: draft.destination_address.trim() || null,
        round_trip: draft.round_trip,
      };

      let saved: Trip;
      if (trip) {
        saved = await updateTripApi(trip.id, payload);
      } else {
        saved = await createTripApi({
          ...payload,
          company_id: companyId,
          user_id: canApprove ? Number(draft.user_id) : null,
          submit: true,
          maps,
          calendar,
        });
        for (const pending of pendingFiles) {
          try {
            await uploadTripAttachmentApi(saved.id, pending.file, pending.kind);
          } catch {
            toast.error(`Allegato "${pending.file.name}" non caricato`);
          }
        }
      }
      onSaved(saved);
      toast.success(
        saved.status === "da_approvare" ? "Trasferta inviata per approvazione" : "Trasferta salvata"
      );
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Salvataggio non riuscito");
    } finally {
      setBusy("");
    }
  };

  const vehicleOptions = vehicles.map((v) => ({
    value: String(v.id),
    label: v.label,
    trailing: `${num(v.current_rate_per_km, 4)} €/km`,
  }));

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      icon={<Icon name="map-pin" className="h-5 w-5" />}
      title={isNew ? "Nuova trasferta" : "Modifica trasferta"}
      description="I dati confluiscono nel foglio condiviso con il commercialista."
      mobileFullscreen
      footer={
        <div className="flex flex-wrap items-center gap-2">
          <span className="hidden items-center gap-1.5 text-[11px] text-muted sm:inline-flex dark:text-muted-dark">
            <Icon name="refresh-cw" className="h-3.5 w-3.5" />
            {settings?.auto_sync
              ? "Una volta approvata, la riga finisce sul foglio da sola"
              : "Una volta approvata, la riga entra in coda per il foglio"}
          </span>
          <span className="flex-1" />
          <Button variant="ghost" onClick={onClose}>
            Annulla
          </Button>
          <Button variant="primary" loading={busy === "save"} onClick={save} leftIcon={<Icon name="check" className="h-4 w-4" />}>
            Salva trasferta
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        {/* 1 · Trasferta */}
        <Section step={1} icon="calendar" title="Trasferta" hint="Data, destinazione e motivo">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Data *"
              type="date"
              value={draft.trip_date}
              onChange={(e) => set("trip_date", e.target.value)}
            />
            <Input
              label="Località *"
              value={draft.location}
              placeholder="Es. Pescara"
              onChange={(e) => set("location", e.target.value)}
            />
            <div className="sm:col-span-2">
              <Input
                label="Motivazione *"
                value={draft.reason}
                placeholder="Es. Incontro cliente / shooting / fiera"
                onChange={(e) => set("reason", e.target.value)}
              />
            </div>
            {clients.length > 0 && (
              <Field label="Cliente">
                <SearchableSelect
                  menuLayer="portal"
                  value={draft.client_id}
                  onChange={(value) => set("client_id", value)}
                  options={[{ value: "", label: "Nessuno" }, ...clients]}
                  placeholder="Collega un cliente"
                />
              </Field>
            )}
            <Field label="Veicolo">
              <SearchableSelect
                menuLayer="portal"
                value={draft.vehicle_id}
                onChange={(value) => set("vehicle_id", value)}
                options={[{ value: "", label: "Nessuno" }, ...vehicleOptions]}
                placeholder="Scegli il veicolo"
              />
            </Field>
            {canApprove && people.length > 0 && isNew && (
              <Field label="Chi ha fatto la trasferta">
                <SearchableSelect
                  menuLayer="portal"
                  value={draft.user_id}
                  onChange={(value) => set("user_id", value)}
                  options={people}
                  placeholder="Collaboratore"
                />
              </Field>
            )}
            <label className="flex cursor-pointer items-center gap-2 sm:col-span-2">
              <Checkbox checked={draft.abroad} onChange={(value) => set("abroad", value)} />
              <span className="text-[12px]">
                Trasferta all'estero
                <span className="ml-1 text-muted dark:text-muted-dark">— colonna “ESTERO” del foglio</span>
              </span>
            </label>
          </div>
        </Section>

        {/* 2 · Percorso */}
        <Section step={2} icon="target" title="Percorso e chilometri" hint="Distanza calcolata da Google Maps">
          <div className="grid gap-3">
            {/* Con la partenza fissa la sede non si tocca: i km rimborsati si
                contano da lì, non da dove si trovava chi ha viaggiato. */}
            <Input
              label="Partenza"
              value={settings?.origin_locked ? settings.origin_address : draft.origin_address}
              placeholder={settings?.origin_address || "Indirizzo di partenza"}
              readOnly={settings?.origin_locked}
              disabled={settings?.origin_locked}
              hint={settings?.origin_locked ? "Sede dell'agenzia: i chilometri si calcolano sempre da qui." : undefined}
              onChange={(e) => set("origin_address", e.target.value)}
            />
            <div className="relative">
              <Input
                label="Destinazione"
                value={draft.destination_address}
                placeholder={settings?.maps_configured ? "Cerca l'indirizzo…" : "Indirizzo di destinazione"}
                onChange={(e) => {
                  set("destination_address", e.target.value);
                  setPlaceId(null);
                  askSuggestions(e.target.value);
                }}
                hint={
                  settings?.maps_configured
                    ? "I suggerimenti arrivano da Google Places; la distanza dalla Routes API."
                    : "Chiave Google Maps non configurata: inserisci i chilometri a mano."
                }
              />
              {suggestions.length > 0 && (
                <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border border-line bg-paper shadow-2 dark:border-[#2a2a2e] dark:bg-[#131316]">
                  {suggestions.map((suggestion) => (
                    <li key={suggestion.place_id}>
                      <button
                        type="button"
                        onClick={() => pickSuggestion(suggestion)}
                        className="block w-full px-3 py-2 text-left text-[12px] transition-colors hover:bg-cream dark:hover:bg-[#1c1c20]"
                      >
                        <b className="block">{suggestion.main_text ?? suggestion.description}</b>
                        {suggestion.secondary_text && (
                          <span className="text-[11px] text-muted dark:text-muted-dark">
                            {suggestion.secondary_text}
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <label className="flex cursor-pointer items-center gap-2">
                <Checkbox checked={draft.round_trip} onChange={toggleRoundTrip} />
                <span className="text-[12px]">Andata e ritorno</span>
              </label>
              <Button
                variant="secondary"
                size="sm"
                loading={busy === "route"}
                onClick={() => calcRoute()}
                leftIcon={<Icon name="target" className="h-3.5 w-3.5" />}
              >
                Calcola da Maps
              </Button>
            </div>

            {maps && (
              <div className="flex items-center gap-3 rounded-md border border-line bg-cream/60 px-3 py-2.5 dark:border-[#2a2a2e] dark:bg-[#1c1c20]">
                <Icon name="target" className="h-4 w-4 shrink-0 text-brand-magenta" />
                <div className="min-w-0 flex-1">
                  <b className="block text-[12px]">
                    {num(maps.distance_km)} km · {maps.duration_text}
                  </b>
                  <span className="block truncate text-[11px] text-muted dark:text-muted-dark">
                    {maps.origin_resolved || settings?.origin_address} → {maps.destination_resolved}
                    {draft.round_trip ? " (a/r)" : ""}
                  </span>
                </div>
                {maps.url && (
                  <a
                    href={maps.url}
                    target="_blank"
                    rel="noopener"
                    className="shrink-0 text-[11px] font-semibold text-brand-magenta hover:underline"
                  >
                    Apri su Maps
                  </a>
                )}
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-3">
              <Input
                label="Chilometri *"
                type="number"
                min="0"
                step="0.1"
                value={draft.km}
                onChange={(e) => set("km", e.target.value)}
              />
              <Input label="Quota per km" value={`${num(ratePerKm, 4)} €`} readOnly disabled />
              <Field label="Indennità chilometrica">
                <div className="flex h-[42px] items-center justify-between rounded-md border border-line bg-cream/60 px-3 dark:border-[#2a2a2e] dark:bg-[#1c1c20]">
                  <b className="text-[13px]">{euro(kmAllowance)}</b>
                  <span className="text-[10px] text-muted dark:text-muted-dark">
                    {num(km)} × {num(ratePerKm, 4)}
                  </span>
                </div>
              </Field>
            </div>
          </div>
        </Section>

        {/* 3 · Spese */}
        <Section step={3} icon="credit-card" title="Spese documentate" hint="Importi da giustificativo">
          <div className="grid gap-3 sm:grid-cols-3">
            {([
              ["meal", "Vitto €"],
              ["lodging", "Alloggio €"],
              ["parking", "Parcheggi €"],
              ["tolls", "Pedaggi €"],
              ["daily_allowance", "Ind. trasferta €"],
            ] as [keyof Draft, string][]).map(([key, label]) => (
              <Input
                key={key}
                label={label}
                type="number"
                min="0"
                step="0.01"
                value={String(draft[key])}
                onChange={(e) => set(key, e.target.value as Draft[typeof key])}
              />
            ))}
          </div>
        </Section>

        {/* 4 · Giustificativi */}
        <Section
          step={4}
          icon="paperclip"
          title="Giustificativi"
          hint="Scontrini, fatture e ricevute"
          count={attachments.filter((a) => a.kind === "giustificativo").length + pendingFiles.filter((f) => f.kind === "giustificativo").length}
        >
          <label className="flex cursor-pointer items-center gap-3 rounded-md border border-dashed border-line px-3 py-3 transition-colors hover:border-brand-magenta/50 dark:border-[#2a2a2e]">
            <input
              type="file"
              multiple
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => {
                void addFiles(e.target.files, "giustificativo");
                e.target.value = "";
              }}
            />
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-cream dark:bg-[#1c1c20]">
              {busy === "upload" ? <Spinner size="sm" /> : <Icon name="plus" className="h-4 w-4" />}
            </span>
            <span>
              <b className="block text-[12px]">Carica foto o PDF</b>
              <span className="text-[11px] text-muted dark:text-muted-dark">
                Scatta lo scontrino o allega la fattura · max 10 MB per file
              </span>
            </span>
          </label>

          {expenses > 0 && !evidenceHave.timeline && attachments.length === 0 && pendingFiles.length === 0 && (
            <div className="mt-2 flex items-center gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-[11px] text-warning">
              <Icon name="alert-triangle" className="h-3.5 w-3.5 shrink-0" />
              <span>
                Hai indicato spese per <b>{euro(expenses)}</b> senza giustificativi allegati.
              </span>
            </div>
          )}

          <AttachmentList
            attachments={attachments}
            pending={pendingFiles}
            onRemove={removeAttachment}
            onRemovePending={(index) => setPendingFiles((current) => current.filter((_, i) => i !== index))}
          />
        </Section>

        {/* 5 · Prove */}
        <Section step={5} icon="shield" title="Prove documentali" hint="Archiviate per eventuali controlli">
          <div className="flex flex-col gap-2">
            {requiredEvidence.length === 0 && (
              <p className="text-[11px] text-muted dark:text-muted-dark">
                Nessuna prova richiesta per questa azienda. Si configura nelle impostazioni.
              </p>
            )}

            {requiredEvidence.includes("maps") && (
              <EvidenceRow kind="maps" on={evidenceHave.maps}>
                <span className="text-[11px] text-muted dark:text-muted-dark">
                  {maps ? `${num(maps.distance_km)} km · ${maps.duration_text}` : "Calcola il percorso nella sezione 2"}
                </span>
              </EvidenceRow>
            )}

            {requiredEvidence.includes("calendar") && (
              <EvidenceRow kind="calendar" on={evidenceHave.calendar}>
                <div className="flex flex-1 flex-wrap items-center gap-2">
                  <span className="flex-1 text-[11px] text-muted dark:text-muted-dark">
                    {calendar ? `${calendar.title} · ${calendar.time}` : "Nessun evento collegato"}
                  </span>
                  {calendar ? (
                    <Button variant="ghost" size="sm" onClick={clearEvent}>
                      Scollega
                    </Button>
                  ) : (
                    <Button variant="secondary" size="sm" loading={busy === "events"} onClick={loadEvents}>
                      Collega
                    </Button>
                  )}
                </div>
              </EvidenceRow>
            )}

            {events !== null && (
              <div className="rounded-md border border-line p-3 dark:border-[#2a2a2e]">
                <div className="mb-2 flex items-center gap-2">
                  <Icon name="calendar" className="h-3.5 w-3.5 text-muted dark:text-muted-dark" />
                  <b className="text-[11px] uppercase tracking-wider text-muted dark:text-muted-dark">
                    Agenda di {draft.trip_date.split("-").reverse().join("/")}
                  </b>
                  <span className="flex-1" />
                  <button
                    type="button"
                    onClick={() => setEvents(null)}
                    className="text-[11px] text-muted transition-colors hover:text-ink dark:text-muted-dark dark:hover:text-white"
                  >
                    Chiudi
                  </button>
                </div>

                {events.length === 0 ? (
                  <p className="py-3 text-center text-[11px] text-muted dark:text-muted-dark">
                    Nessun appuntamento quel giorno. Se ne hai uno su un altro calendario, la prova
                    dovrà essere un'altra.
                  </p>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {events.map((event) => (
                      <EventCard
                        key={event.event_id}
                        event={event}
                        selected={calendar?.event_id === event.event_id}
                        onChoose={() => chooseEvent(event)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {requiredEvidence.includes("timeline") && (
              <EvidenceRow kind="timeline" on={evidenceHave.timeline}>
                <div className="flex flex-1 flex-wrap items-center gap-2">
                  <span className="flex-1 text-[11px] text-muted dark:text-muted-dark">
                    {evidenceHave.timeline
                      ? "Export della cronologia allegato"
                      : "Esporta la Timeline dal telefono e allegala qui"}
                  </span>
                  <label className="cursor-pointer rounded-md border border-line px-3 py-1.5 text-[11px] font-semibold transition-colors hover:bg-cream dark:border-[#2a2a2e] dark:hover:bg-[#1c1c20]">
                    <input
                      type="file"
                      className="hidden"
                      accept="application/json,.json,.kml"
                      onChange={(e) => {
                        void addFiles(e.target.files, "timeline");
                        e.target.value = "";
                      }}
                    />
                    Allega export
                  </label>
                </div>
              </EvidenceRow>
            )}

            {requiredEvidence.includes("gps") && (
              <EvidenceRow kind="gps" on={evidenceHave.gps}>
                <span className="text-[11px] text-muted dark:text-muted-dark">
                  {trip?.checkins.length
                    ? `${trip.checkins.length} check-in registrati dall'app`
                    : "I check-in si registrano dall'app mobile durante la trasferta"}
                </span>
              </EvidenceRow>
            )}
          </div>
        </Section>

        {/* Totali */}
        <div className="grid grid-cols-2 gap-3 rounded-lg border border-line bg-cream/60 p-3 sm:grid-cols-4 dark:border-[#2a2a2e] dark:bg-[#1c1c20]">
          <Total label="Indennità km" value={euro(kmAllowance)} />
          <Total label="Spese" value={euro(expenses)} />
          <Total label="Ind. trasferta" value={euro(toNumber(draft.daily_allowance))} />
          <Total label="Totale rimborso" value={euro(total)} accent />
        </div>

        <Textarea
          label="Note interne"
          rows={2}
          value={draft.notes}
          onChange={(e) => set("notes", e.target.value)}
          placeholder="Non finiscono sul foglio del commercialista"
        />
      </div>
    </Modal>
  );
}

function Section({
  step,
  icon,
  title,
  hint,
  count,
  children,
}: {
  step: number;
  icon: Parameters<typeof Icon>[0]["name"];
  title: string;
  hint: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-line dark:border-[#2a2a2e]">
      <header className="flex items-center gap-2.5 border-b border-line px-3 py-2.5 dark:border-[#2a2a2e]">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-magenta/10 text-[11px] font-bold text-brand-magenta">
          {step}
        </span>
        <Icon name={icon} className="h-4 w-4 text-muted dark:text-muted-dark" />
        <span className="flex-1">
          <b className="block text-[12px]">{title}</b>
          <span className="text-[11px] text-muted dark:text-muted-dark">{hint}</span>
        </span>
        {count != null && count > 0 && (
          <span className="rounded-pill bg-brand-magenta/10 px-2 py-[2px] text-[10px] font-bold text-brand-magenta">
            {count}
          </span>
        )}
      </header>
      <div className="p-3">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-semibold text-muted dark:text-muted-dark">{label}</span>
      {children}
    </label>
  );
}

function Total({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <span className="block text-[10px] uppercase tracking-wider text-muted dark:text-muted-dark">{label}</span>
      <b className={`text-[14px] ${accent ? "text-brand-magenta" : ""}`}>{value}</b>
    </div>
  );
}

/**
 * Un appuntamento dell'agenda come scheda: l'orario in evidenza a sinistra,
 * titolo e luogo a destra. La barra verticale è alta in proporzione alla durata,
 * così si distingue a colpo d'occhio l'impegno di mezza giornata dalla call di
 * venti minuti — è quello che si guarda per capire quale evento era la trasferta.
 */
function EventCard({
  event,
  selected,
  onChoose,
}: {
  event: CalendarEvent;
  selected: boolean;
  onChoose: () => void;
}) {
  // 30 min → barra corta, 4 ore o più → barra piena.
  const durata = event.duration_minutes ?? 0;
  const pieno = Math.min(100, Math.max(18, Math.round((durata / 240) * 100)));

  return (
    <button
      type="button"
      onClick={onChoose}
      className={`flex gap-2.5 rounded-md border p-2.5 text-left transition-colors ${
        selected
          ? "border-brand-magenta bg-brand-magenta/5"
          : "border-line hover:bg-cream dark:border-[#2a2a2e] dark:hover:bg-[#1c1c20]"
      }`}
    >
      <span className="flex w-14 shrink-0 flex-col items-end gap-1">
        {event.all_day ? (
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">
            Tutto
            <br />
            il giorno
          </span>
        ) : (
          <>
            <b className="text-[12px] tabular-nums">{event.start_time || event.time}</b>
            {event.end_time && (
              <span className="text-[10px] tabular-nums text-muted dark:text-muted-dark">
                {event.end_time}
              </span>
            )}
          </>
        )}
      </span>

      <span
        className={`w-[3px] shrink-0 self-stretch rounded-full ${
          selected ? "bg-brand-magenta" : "bg-line dark:bg-[#2a2a2e]"
        }`}
        style={{ height: event.all_day ? "100%" : `${pieno}%`, minHeight: "18px" }}
      />

      <span className="min-w-0 flex-1">
        <b className="block truncate text-[12px]">{event.title}</b>
        {event.location && (
          <span className="mt-0.5 flex items-center gap-1 text-[11px] text-muted dark:text-muted-dark">
            <Icon name="map-pin" className="h-3 w-3 shrink-0" />
            <span className="truncate">{event.location}</span>
          </span>
        )}
        {event.description && (
          <span className="mt-0.5 block truncate text-[10px] text-muted dark:text-muted-dark">
            {event.description}
          </span>
        )}
        {durata > 0 && !event.all_day && (
          <span className="mt-0.5 block text-[10px] text-muted dark:text-muted-dark">
            {durata >= 60 ? `${Math.floor(durata / 60)} h ${durata % 60 || ""}`.trim() : `${durata} min`}
          </span>
        )}
      </span>

      {selected && <Icon name="check" className="h-4 w-4 shrink-0 text-brand-magenta" />}
    </button>
  );
}

function EvidenceRow({
  kind,
  on,
  children,
}: {
  kind: keyof typeof EVIDENCE_META;
  on: boolean;
  children: React.ReactNode;
}) {
  const meta = EVIDENCE_META[kind];
  return (
    <div className="flex items-center gap-3 rounded-md border border-line px-3 py-2.5 dark:border-[#2a2a2e]">
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${
          on ? "bg-success/12 text-success" : "bg-cream text-muted dark:bg-[#1c1c20] dark:text-muted-dark"
        }`}
        title={meta.hint}
      >
        <Icon name={meta.icon} className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <b className="block text-[12px]">{meta.label}</b>
        {children}
      </div>
    </div>
  );
}

function AttachmentList({
  attachments,
  pending,
  onRemove,
  onRemovePending,
}: {
  attachments: TripAttachment[];
  pending: { file: File; kind: string }[];
  onRemove: (attachment: TripAttachment) => void;
  onRemovePending: (index: number) => void;
}) {
  if (!attachments.length && !pending.length) return null;
  return (
    <ul className="mt-2 flex flex-col gap-1.5">
      {attachments.map((attachment) => (
        <li
          key={attachment.id}
          className="flex items-center gap-2 rounded-md border border-line px-2.5 py-2 dark:border-[#2a2a2e]"
        >
          <Icon
            name={attachment.content_type === "application/pdf" ? "document-text" : "image"}
            className="h-4 w-4 shrink-0 text-muted dark:text-muted-dark"
          />
          <span className="min-w-0 flex-1">
            <b className="block truncate text-[11px]">{attachment.filename}</b>
            <span className="text-[10px] text-muted dark:text-muted-dark">
              {fileSize(attachment.size_bytes)}
              {attachment.kind === "timeline" ? " · cronologia" : ""}
              {attachment.drive_link ? " · su Drive" : ""}
            </span>
          </span>
          {attachment.download_url && (
            <a
              href={attachment.download_url}
              target="_blank"
              rel="noopener"
              title="Apri"
              className="rounded-sm p-1 text-muted transition-colors hover:text-brand-magenta dark:text-muted-dark"
            >
              <Icon name="eye" className="h-3.5 w-3.5" />
            </a>
          )}
          <button
            type="button"
            title="Rimuovi"
            onClick={() => onRemove(attachment)}
            className="rounded-sm p-1 text-muted transition-colors hover:text-danger dark:text-muted-dark"
          >
            <Icon name="x" className="h-3.5 w-3.5" />
          </button>
        </li>
      ))}
      {pending.map((item, index) => (
        <li
          key={`${item.file.name}-${index}`}
          className="flex items-center gap-2 rounded-md border border-dashed border-line px-2.5 py-2 dark:border-[#2a2a2e]"
        >
          <Icon name="clock" className="h-4 w-4 shrink-0 text-muted dark:text-muted-dark" />
          <span className="min-w-0 flex-1">
            <b className="block truncate text-[11px]">{item.file.name}</b>
            <span className="text-[10px] text-muted dark:text-muted-dark">
              {fileSize(item.file.size)} · si carica al salvataggio
            </span>
          </span>
          <button
            type="button"
            title="Rimuovi"
            onClick={() => onRemovePending(index)}
            className="rounded-sm p-1 text-muted transition-colors hover:text-danger dark:text-muted-dark"
          >
            <Icon name="x" className="h-3.5 w-3.5" />
          </button>
        </li>
      ))}
    </ul>
  );
}
