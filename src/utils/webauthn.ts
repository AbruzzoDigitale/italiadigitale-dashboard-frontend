// Ponte tra l'API WebAuthn del browser (ArrayBuffer) e il backend py_webauthn
// (JSON con campi base64url). Conversioni manuali per compatibilità ampia
// (parseCreationOptionsFromJSON/toJSON non sono ancora ovunque).

export function passkeysSupported(): boolean {
  return typeof window !== "undefined" && !!window.PublicKeyCredential;
}

function b64urlToBuf(value: string): ArrayBuffer {
  const b64 = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4);
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

function bufToB64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/* eslint-disable @typescript-eslint/no-explicit-any */

/** navigator.credentials.create con le opzioni JSON del backend → risposta JSON-ready. */
export async function createPasskeyCredential(options: any): Promise<Record<string, unknown>> {
  const publicKey: any = {
    ...options,
    challenge: b64urlToBuf(options.challenge),
    user: { ...options.user, id: b64urlToBuf(options.user.id) },
    excludeCredentials: (options.excludeCredentials ?? []).map((c: any) => ({
      ...c,
      id: b64urlToBuf(c.id),
    })),
  };
  const cred = (await navigator.credentials.create({ publicKey })) as PublicKeyCredential | null;
  if (!cred) throw new Error("Registrazione passkey annullata.");
  const resp = cred.response as AuthenticatorAttestationResponse;
  return {
    id: cred.id,
    rawId: bufToB64url(cred.rawId),
    type: cred.type,
    authenticatorAttachment: (cred as any).authenticatorAttachment ?? null,
    clientExtensionResults: cred.getClientExtensionResults(),
    response: {
      attestationObject: bufToB64url(resp.attestationObject),
      clientDataJSON: bufToB64url(resp.clientDataJSON),
      transports: typeof resp.getTransports === "function" ? resp.getTransports() : [],
    },
  };
}

/** navigator.credentials.get con le opzioni JSON del backend → assertion JSON-ready. */
export async function getPasskeyAssertion(options: any): Promise<Record<string, unknown>> {
  const publicKey: any = {
    ...options,
    challenge: b64urlToBuf(options.challenge),
    allowCredentials: (options.allowCredentials ?? []).map((c: any) => ({
      ...c,
      id: b64urlToBuf(c.id),
    })),
  };
  const cred = (await navigator.credentials.get({ publicKey })) as PublicKeyCredential | null;
  if (!cred) throw new Error("Accesso con passkey annullato.");
  const resp = cred.response as AuthenticatorAssertionResponse;
  return {
    id: cred.id,
    rawId: bufToB64url(cred.rawId),
    type: cred.type,
    authenticatorAttachment: (cred as any).authenticatorAttachment ?? null,
    clientExtensionResults: cred.getClientExtensionResults(),
    response: {
      authenticatorData: bufToB64url(resp.authenticatorData),
      clientDataJSON: bufToB64url(resp.clientDataJSON),
      signature: bufToB64url(resp.signature),
      userHandle: resp.userHandle ? bufToB64url(resp.userHandle) : null,
    },
  };
}
