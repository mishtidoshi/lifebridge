// Saving a plan to the signed-in person's account (the saved_plans table).
// The plan (answers + progress) is encrypted on this device before it's sent; Supabase only
// stores the scrambled `payload` (see lib/crypto.ts).

import { open, seal } from './crypto';
import type { Progress } from './storage';
import { supabase } from './supabase';

export async function pullPlan(userId: string, packId: string, key: Uint8Array): Promise<Progress | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('saved_plans')
    .select('payload')
    .eq('user_id', userId)
    .eq('pack_id', packId)
    .maybeSingle();
  if (error) throw new Error("Couldn't load your saved plan. Check your connection.");
  if (!data?.payload) return null;
  let plan: Partial<Progress>;
  try {
    plan = open<Partial<Progress>>(key, data.payload);
  } catch {
    throw new Error("Your saved plan couldn't be unlocked on this device. Try signing out and back in.");
  }
  return { facts: plan.facts ?? null, tracker: plan.tracker ?? {}, documents: plan.documents ?? {}, dates: plan.dates ?? {} };
}

export async function pushPlan(userId: string, packId: string, progress: Progress, key: Uint8Array): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from('saved_plans').upsert({
    user_id: userId,
    pack_id: packId,
    payload: seal(key, progress),
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error("Couldn't save to your account. Your progress is still saved on this device.");
}

export async function deletePlan(userId: string, packId: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from('saved_plans').delete().eq('user_id', userId).eq('pack_id', packId);
  if (error) throw new Error("Couldn't delete your saved plan. Check your connection.");
}
