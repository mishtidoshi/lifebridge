// End-to-end encryption for what's saved to an account. Everything is locked on the device
// before it's sent, so Supabase (and anyone with access to the database) only sees scrambled data.
//
// Two keys:
//   data key     random 32 bytes, made once per account. It locks the plan and the name.
//   password key made from the person's password with scrypt (slow on purpose, so guessing is slow).
//                It locks the data key. Only the locked data key is stored in Supabase.
// So: password → password key → unlocks data key → unlocks the plan.
// If someone resets a forgotten password, the old data key can't be unlocked anymore (by design).
//
// Cipher: XChaCha20-Poly1305 (from the audited @noble libraries). Poly1305 also detects any change
// to the scrambled data, so tampered data fails to open instead of turning into garbage.

import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { bytesToUtf8, utf8ToBytes } from '@noble/ciphers/utils.js';
import { scryptAsync } from '@noble/hashes/scrypt.js';
import { base64 } from '@scure/base';
import { getRandomBytes } from 'expo-crypto';

const VERSION = 'v1';
const NONCE_BYTES = 24; // XChaCha's long nonce is safe to pick at random every time

export interface KdfParams {
  alg: 'scrypt';
  N: number;
  r: number;
  p: number;
  salt: string; // base64
}

// N = 2^15: about a second on a phone, and very expensive to guess billions of passwords with.
const DEFAULT_KDF = { alg: 'scrypt' as const, N: 2 ** 15, r: 8, p: 1 };

export function randomBytes(n: number): Uint8Array {
  const webCrypto = (globalThis as { crypto?: Crypto }).crypto;
  if (webCrypto?.getRandomValues) return webCrypto.getRandomValues(new Uint8Array(n));
  return getRandomBytes(n); // phones (Hermes has no Web Crypto)
}

export function newDataKey(): Uint8Array {
  return randomBytes(32);
}

export function newKdfParams(): KdfParams {
  return { ...DEFAULT_KDF, salt: base64.encode(randomBytes(16)) };
}

/** The password key. Same password + same salt always gives the same key. */
export function passwordKey(password: string, kdf: KdfParams): Promise<Uint8Array> {
  return scryptAsync(utf8ToBytes(password), base64.decode(kdf.salt), { N: kdf.N, r: kdf.r, p: kdf.p, dkLen: 32 });
}

function sealBytes(key: Uint8Array, data: Uint8Array): string {
  const nonce = randomBytes(NONCE_BYTES);
  const box = xchacha20poly1305(key, nonce).encrypt(data);
  const out = new Uint8Array(nonce.length + box.length);
  out.set(nonce);
  out.set(box, nonce.length);
  return `${VERSION}.${base64.encode(out)}`;
}

function openBytes(key: Uint8Array, sealed: string): Uint8Array {
  const [version, body] = sealed.split('.');
  if (version !== VERSION || !body) throw new Error('Unknown encrypted format.');
  const raw = base64.decode(body);
  return xchacha20poly1305(key, raw.subarray(0, NONCE_BYTES)).decrypt(raw.subarray(NONCE_BYTES)); // throws if tampered or wrong key
}

/** Lock any JSON-able value. */
export function seal(key: Uint8Array, value: unknown): string {
  return sealBytes(key, utf8ToBytes(JSON.stringify(value)));
}

/** Unlock a value locked with seal(). Throws if the key is wrong or the data was changed. */
export function open<T>(key: Uint8Array, sealed: string): T {
  return JSON.parse(bytesToUtf8(openBytes(key, sealed))) as T;
}

/** Lock the data key with the password key. */
export function wrapKey(pwKey: Uint8Array, dataKey: Uint8Array): string {
  return sealBytes(pwKey, dataKey);
}

/** Unlock the data key. Throws if the password key is wrong (e.g. after a password reset). */
export function unwrapKey(pwKey: Uint8Array, wrapped: string): Uint8Array {
  return openBytes(pwKey, wrapped);
}

export const keyToText = (key: Uint8Array) => base64.encode(key);
export const keyFromText = (text: string) => base64.decode(text);
