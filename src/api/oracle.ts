import { authFetch, API_BASE } from "./auth";

/** Un record restituito da un tool: le card che l'utente vede accanto alla risposta. */
export interface OraclePayload {
  tipo: string;
  records: Record<string, unknown>[];
  totale: number;
  filtri_applicati: Record<string, unknown>;
  /** Come disegnare gli stessi record. Null = non c'è niente da confrontare. */
  grafico: import("../features/oracle/OracleChart").GraficoSpec | null;
}

export interface OracleConversation {
  id: number;
  title: string | null;
  created_at: string;
  updated_at: string;
}

export interface OracleMessage {
  id: number;
  role: "user" | "assistant";
  content: string;
  payloads: OraclePayload[] | null;
  created_at: string;
}

export interface OracleConversationDetail extends OracleConversation {
  messages: OracleMessage[];
}

/** Riepilogo di fine risposta: serve alla barra di stato sotto il messaggio. */
export interface OracleModel {
  slug: string;
  provider: string;
  model_name: string;
  predefinito: boolean;
}

export async function listOracleModelsApi(): Promise<OracleModel[]> {
  const res = await authFetch(`${API_BASE}/api/v1/oracle/models`);
  if (!res.ok) return [];
  return res.json();
}

export interface OracleDone {
  testo: string;
  iterazioni: number;
  token: { input: number; output: number; cache: number };
  /** Id citati dal modello che nessuno strumento ha restituito: vanno mostrati, non nascosti. */
  citazioni_sospette: string[];
  interrotto_da: string;
  /** Provider e modello che hanno risposto: con più modelli collegati, serve saperlo dopo. */
  modello: string;
}

export interface OracleHandlers {
  onConversation?: (id: number) => void;
  onThinking?: (text: string) => void;
  onText?: (chunk: string) => void;
  onToolStarted?: (tool: string, args: Record<string, unknown>) => void;
  onToolResult?: (tool: string, payload: OraclePayload) => void;
  onDone?: (done: OracleDone) => void;
  onError?: (message: string) => void;
}

/**
 * Invia una domanda e consuma la risposta in streaming.
 *
 * Non usa `EventSource`: la domanda va in POST e `EventSource` sa fare solo GET.
 * Legge quindi il corpo a flusso e spezza gli eventi SSE a mano — sono poche righe
 * e permettono di mostrare il testo mentre arriva invece che tutto alla fine.
 */
export async function askOracleApi(
  domanda: string,
  conversationId: number | null,
  handlers: OracleHandlers,
  signal?: AbortSignal,
  profileSlug?: string | null
): Promise<void> {
  const res = await authFetch(`${API_BASE}/api/v1/oracle/ask`, {
    method: "POST",
    body: JSON.stringify({
      domanda,
      conversation_id: conversationId,
      profile_slug: profileSlug || null,
    }),
    signal,
  });

  if (!res.ok || !res.body) {
    let detail = "L'Oracolo non è raggiungibile";
    try {
      detail = (await res.json())?.detail ?? detail;
    } catch {
      /* corpo non JSON: resta il messaggio generico */
    }
    handlers.onError?.(detail);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const consuma = (blocco: string) => {
    let evento = "message";
    const dati: string[] = [];
    for (const riga of blocco.split("\n")) {
      if (riga.startsWith("event: ")) evento = riga.slice(7).trim();
      else if (riga.startsWith("data: ")) dati.push(riga.slice(6));
    }
    if (!dati.length) return;
    const payload = JSON.parse(dati.join("\n"));

    switch (evento) {
      case "conversation":
        handlers.onConversation?.(payload.conversation_id);
        break;
      case "thinking":
        handlers.onThinking?.(payload.text);
        break;
      case "text":
        handlers.onText?.(payload.text);
        break;
      case "tool_started":
        handlers.onToolStarted?.(payload.tool, payload.payload ?? {});
        break;
      case "tool_result":
        handlers.onToolResult?.(payload.tool, payload.payload);
        break;
      case "done":
        handlers.onDone?.(payload as OracleDone);
        break;
      case "error":
        handlers.onError?.(payload.messaggio);
        break;
    }
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    // Gli eventi SSE sono separati da una riga vuota; l'ultimo pezzo può essere
    // parziale e resta nel buffer fino al chunk successivo.
    let taglio = buffer.indexOf("\n\n");
    while (taglio !== -1) {
      consuma(buffer.slice(0, taglio));
      buffer = buffer.slice(taglio + 2);
      taglio = buffer.indexOf("\n\n");
    }
  }
  if (buffer.trim()) consuma(buffer);
}

export async function listOracleConversationsApi(): Promise<OracleConversation[]> {
  const res = await authFetch(`${API_BASE}/api/v1/oracle/conversations`);
  if (!res.ok) throw new Error("Impossibile recuperare le conversazioni");
  return res.json();
}

export async function getOracleConversationApi(id: number): Promise<OracleConversationDetail> {
  const res = await authFetch(`${API_BASE}/api/v1/oracle/conversations/${id}`);
  if (!res.ok) throw new Error("Conversazione non trovata");
  return res.json();
}

export async function deleteOracleConversationApi(id: number): Promise<void> {
  const res = await authFetch(`${API_BASE}/api/v1/oracle/conversations/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Impossibile eliminare la conversazione");
}

export interface OracleAction {
  id: number;
  action: string;
  state: "pending" | "confirmed" | "cancelled" | "failed" | "expired";
  riepilogo: string;
  dettagli: Record<string, string>;
  result_ref: string | null;
  error: string | null;
  expires_at: string;
  decided_at: string | null;
}

/**
 * Conferma o annulla una proposta.
 *
 * Si manda solo l'id: i parametri stanno sul server, congelati al momento della
 * proposta. Da qui non si può cambiare cosa verrà fatto — è il punto del meccanismo.
 */
async function decideOracleAction(id: number, scelta: "confirm" | "cancel"): Promise<OracleAction> {
  const res = await authFetch(`${API_BASE}/api/v1/oracle/actions/${id}/${scelta}`, {
    method: "POST",
  });
  if (!res.ok) {
    let detail = scelta === "confirm" ? "Non è stato possibile eseguire l'azione" : "Non è stato possibile annullare";
    try {
      detail = (await res.json())?.detail ?? detail;
    } catch {
      /* corpo non JSON */
    }
    throw new Error(detail);
  }
  return res.json();
}

export const confirmOracleActionApi = (id: number) => decideOracleAction(id, "confirm");
export const cancelOracleActionApi = (id: number) => decideOracleAction(id, "cancel");
