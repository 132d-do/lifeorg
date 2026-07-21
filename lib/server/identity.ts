export type Identity = {
  userId: string;
  displayName: string;
  source: "sites" | "session";
};

export type IdentityRuntime = {
  deployment: "production" | "preview" | "local";
  sessionSecret?: string;
};

const cookieName = "lifeorg_session";

export class IdentityError extends Error {
  readonly status = 401;
  constructor() { super("Authentication required"); }
}

function decodeName(request: Request, fallback: string) {
  const encoded = request.headers.get("oai-authenticated-user-full-name");
  if (!encoded) return fallback;
  try { return decodeURIComponent(encoded); } catch { return fallback; }
}

function base64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function fromBase64Url(value: string) {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function signature(payload: string, secret: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return base64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload))));
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return mismatch === 0;
}

export async function createLocalSessionCookie(
  identity: Pick<Identity, "userId" | "displayName">,
  secret: string,
  options: { secure?: boolean } = {},
) {
  if (secret.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters");
  const payload = base64Url(new TextEncoder().encode(JSON.stringify({ ...identity, expiresAt: Date.now() + 30 * 86400000 })));
  const signed = `${payload}.${await signature(payload, secret)}`;
  return `${cookieName}=${signed}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${options.secure ? "; Secure" : ""}`;
}

function cookieValue(request: Request) {
  const cookie = request.headers.get("cookie") ?? "";
  return cookie.split(";").map((item) => item.trim()).find((item) => item.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
}

async function readSession(request: Request, secret?: string): Promise<Identity | null> {
  const signed = cookieValue(request);
  if (!signed || !secret) return null;
  const separator = signed.lastIndexOf(".");
  if (separator < 1) return null;
  const payload = signed.slice(0, separator);
  const supplied = signed.slice(separator + 1);
  if (!constantTimeEqual(supplied, await signature(payload, secret))) return null;
  try {
    const parsed = JSON.parse(new TextDecoder().decode(fromBase64Url(payload))) as { userId?: unknown; displayName?: unknown; expiresAt?: unknown };
    if (typeof parsed.userId !== "string" || !parsed.userId.startsWith("local:") || typeof parsed.displayName !== "string" || typeof parsed.expiresAt !== "number" || parsed.expiresAt < Date.now()) return null;
    return { userId: parsed.userId, displayName: parsed.displayName, source: "session" };
  } catch { return null; }
}

export async function resolveIdentity(request: Request, runtime: IdentityRuntime): Promise<Identity> {
  if (runtime.deployment === "production") {
    const email = request.headers.get("oai-authenticated-user-email")?.trim().toLowerCase();
    if (!email) throw new IdentityError();
    return { userId: `chatgpt:${email}`, displayName: decodeName(request, email), source: "sites" };
  }
  const session = await readSession(request, runtime.sessionSecret);
  if (!session) throw new IdentityError();
  return session;
}

export function identityRuntime(runtime: Record<string, string | undefined>): IdentityRuntime {
  const requested = runtime.LIFEORG_DEPLOYMENT;
  const deployment = requested === "local" || requested === "preview" || requested === "production"
    ? requested
    : "production";
  return { deployment, sessionSecret: runtime.SESSION_SECRET };
}
