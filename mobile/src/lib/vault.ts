// Each account's "vault" row in Supabase (user_vaults, supabase/002_encryption.sql):
// the scrypt settings, the locked data key, and the encrypted profile (first and last name).

import { newDataKey, newKdfParams, open, passwordKey, seal, unwrapKey, wrapKey, type KdfParams } from './crypto';
import { supabase } from './supabase';

export interface Name {
  first: string;
  last: string;
}

export const EMPTY_NAME: Name = { first: '', last: '' };

interface VaultRow {
  kdf: KdfParams;
  wrapped_key: string;
  profile: string;
}

/** The database is missing a table or column the app needs (supabase/*.sql wasn't run). */
function setupProblem(error: { code?: string }): string | null {
  return error.code === 'PGRST205' || error.code === '42P01' || error.code === '42703'
    ? "Accounts aren't fully set up yet: the database needs an update (run supabase/002_encryption.sql in Supabase)."
    : null;
}

function db() {
  if (!supabase) throw new Error("Accounts aren't set up yet.");
  return supabase;
}

async function fetchVault(userId: string): Promise<VaultRow | null> {
  const { data, error } = await db().from('user_vaults').select('kdf, wrapped_key, profile').eq('user_id', userId).maybeSingle();
  if (error) throw new Error(setupProblem(error) ?? "Couldn't reach your account. Check your connection.");
  return data as VaultRow | null;
}

/** A new vault: new data key locked with this password. Anything saved under an old key is deleted. */
async function createVault(userId: string, password: string, name: Name): Promise<{ key: Uint8Array; name: Name }> {
  const key = newDataKey();
  const kdf = newKdfParams();
  const row = { user_id: userId, kdf, wrapped_key: wrapKey(await passwordKey(password, kdf), key), profile: seal(key, name) };
  const { error } = await db().from('user_vaults').upsert({ ...row, updated_at: new Date().toISOString() });
  if (error) throw new Error("Couldn't set up your account. Please try again.");
  await db().from('saved_plans').delete().eq('user_id', userId); // locked with a key that no longer exists
  return { key, name };
}

export type Unlocked = { key: Uint8Array; name: Name; startedOver: boolean };

/**
 * Unlock the account's data key with the password, right after signing in.
 * - First sign-in: makes the vault (moving the name typed at sign-up into it).
 * - Password was reset: the old key can't be unlocked, so a new vault starts (startedOver = true).
 */
export async function unlockVault(userId: string, password: string, signUpName: Name): Promise<Unlocked> {
  const row = await fetchVault(userId);
  if (!row) return { ...(await createVault(userId, password, signUpName)), startedOver: false };
  try {
    const key = unwrapKey(await passwordKey(password, row.kdf), row.wrapped_key);
    return { key, name: readName(key, row.profile), startedOver: false };
  } catch {
    return { ...(await createVault(userId, password, signUpName)), startedOver: true };
  }
}

/** After choosing a new password from a reset email: start a new vault with the new password. */
export async function replaceVault(userId: string, password: string): Promise<Unlocked> {
  return { ...(await createVault(userId, password, EMPTY_NAME)), startedOver: true };
}

/** Read the name with a key that's already unlocked (when the app reopens). */
export async function loadName(userId: string, key: Uint8Array): Promise<Name> {
  const row = await fetchVault(userId);
  if (!row) throw new Error('No vault for this account.');
  return readName(key, row.profile);
}

export async function saveName(userId: string, key: Uint8Array, name: Name): Promise<void> {
  const { error } = await db()
    .from('user_vaults')
    .update({ profile: seal(key, name), updated_at: new Date().toISOString() })
    .eq('user_id', userId);
  if (error) throw new Error("Couldn't save your name. Check your connection.");
}

function readName(key: Uint8Array, profile: string): Name {
  if (!profile) return EMPTY_NAME;
  return { ...EMPTY_NAME, ...open<Name>(key, profile) };
}
