// Real password hashing for real accounts — PBKDF2 via Web Crypto (native on
// Workers, no bindings needed), with a random salt per password and enough
// iterations to be slow to brute-force. This replaces the old single
// unsalted-SHA-256 admin password from the local-only app, which was fine
// for "a light parental gate" but not for protecting real family accounts.

const ITERATIONS = 100_000;

function toHex(bytes) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function fromHex(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  return bytes;
}

async function deriveHex(password, salt) {
  const keyMaterial = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" }, keyMaterial, 256);
  return toHex(new Uint8Array(bits));
}

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hashHex = await deriveHex(password, salt);
  return `${toHex(salt)}:${hashHex}`;
}

export async function verifyPassword(password, stored) {
  const [saltHex, expectedHex] = stored.split(":");
  if (!saltHex || !expectedHex) return false;
  const actualHex = await deriveHex(password, fromHex(saltHex));
  if (actualHex.length !== expectedHex.length) return false;
  // constant-time compare
  let diff = 0;
  for (let i = 0; i < actualHex.length; i++) diff |= actualHex.charCodeAt(i) ^ expectedHex.charCodeAt(i);
  return diff === 0;
}
