// State shared by the screens of one pack's flow: describe → confirm → plan → step.
// Facts live here until the user confirms them; nothing is sent anywhere until then.
// Progress (tracker, documents, typed-in dates) is shared here too, so every screen
// sees the same values, and it's saved to this device on every change.
//
// Every plan belongs to an owner: the signed-in account, or "guest" when nobody is signed in
// (lib/storage.ts). When the owner changes (sign in, sign out, delete account), everything held
// here is forgotten and only the new owner's plan is loaded.
// While signed in, answers + progress are also saved to the account (lib/sync.ts), encrypted on
// this device first: signing in loads the account's saved plan, and every change after that is
// saved back a moment later.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { api } from './api';
import { useAuth } from './auth';
import { useSettings } from './settings';
import { clearProgress, EMPTY_PROGRESS, GUEST, loadProgress, saveProgress, type Progress } from './storage';
import { deletePlan, pullPlan, pushPlan } from './sync';
import { TOPIC_IDS } from './topics';
import type { FactValue, Facts, PackDetail, Plan, Routing } from './types';

interface FlowState {
  owner: string; // account id, or GUEST
  packs: Record<string, PackDetail>;
  facts: Record<string, Facts>; // pack id → facts being confirmed
  plans: Record<string, Plan>; // pack id → latest plan
  evidence: Record<string, Record<string, string[]>>; // pack id → fact id → phrases it was read from
  described: Record<string, Described>; // pack id → what the user typed, how the topic was picked, and model guesses
  progress: Record<string, Progress>; // pack id → saved progress (once loaded)
  sync: { status: 'off' | 'saving' | 'saved' | 'error'; message?: string }; // saving to the account
}

interface Flow extends FlowState {
  loadPack: (packId: string) => Promise<PackDetail>;
  setFacts: (
    packId: string,
    facts: Facts,
    evidence?: Record<string, string[]>,
    described?: Described,
  ) => void;
  buildPlan: (packId: string, facts: Facts) => Promise<Plan>;
  ensureProgress: (packId: string) => Promise<Progress>;
  updateProgress: (packId: string, change: (p: Progress) => Progress) => void;
  resetPack: (packId: string) => Promise<void>; // "Start over": also deletes the account's copy
  forgetOnDevice: (owner: string, packId: string) => Promise<void>; // after signing out / deleting an account
  resaveAll: (rememberSensitive: boolean) => void; // save every plan again with the new setting
  sharedAnswer: (factId: string, exceptPackId: string) => { value: FactValue; packId: string } | null;
  withShared: (pack: PackDetail, facts: Facts) => Facts; // fill shared questions from other plans
}

export interface Described {
  text: string;
  routing: Routing;
  guessed?: Record<string, number>; // fact id → confidence, for answers the model guessed
}

/**
 * What gets saved (on this device and in the account). Unless the user chose to remember them,
 * answers to sensitive questions (like immigration status) are left out, so they last only
 * until the app is closed. The plan on screen still uses them.
 */
function forStorage(pack: PackDetail | undefined, progress: Progress, rememberSensitive: boolean): Progress {
  if (rememberSensitive || !progress.facts || !pack) return progress;
  const sensitive = new Set(pack.facts.filter((f) => f.sensitive).map((f) => f.id));
  const facts = Object.fromEntries(Object.entries(progress.facts).filter(([id]) => !sensitive.has(id)));
  return { ...progress, facts };
}

const FlowContext = createContext<Flow | null>(null);

/** Everything that belongs to one owner, empty. (Pack definitions are the same for everyone.) */
const freshState = (owner: string, packs: Record<string, PackDetail> = {}): FlowState => ({
  owner,
  packs,
  facts: {},
  plans: {},
  evidence: {},
  described: {},
  progress: {},
  sync: { status: 'off' },
});

export function FlowProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading, dataKey } = useAuth();
  const { rememberSensitive } = useSettings();
  const rememberRef = useRef(rememberSensitive);
  useEffect(() => {
    rememberRef.current = rememberSensitive;
  }, [rememberSensitive]);
  const owner = user?.id ?? GUEST;
  const [state, setState] = useState<FlowState>(() => freshState(owner));
  const progressLoads = useRef<Record<string, Promise<Progress>>>({}); // "owner:pack" → loaded progress
  const pushTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const ownerRef = useRef(owner);
  const keyRef = useRef<Uint8Array | null>(dataKey); // the account's encryption key (null for guests)

  // The owner changed: drop everything that belonged to the previous one.
  if (state.owner !== owner) {
    setState((s) => freshState(owner, s.packs));
  }
  useEffect(() => {
    keyRef.current = dataKey;
  }, [dataKey]);
  useEffect(() => {
    ownerRef.current = owner;
    Object.values(pushTimers.current).forEach(clearTimeout);
    pushTimers.current = {};
  }, [owner]);

  const setSync = useCallback((sync: FlowState['sync']) => setState((s) => ({ ...s, sync })), []);

  const loadPack = useCallback(
    async (packId: string) => {
      const cached = state.packs[packId];
      if (cached) return cached;
      const pack = await api.pack(packId);
      setState((s) => ({ ...s, packs: { ...s.packs, [packId]: pack } }));
      return pack;
    },
    [state.packs],
  );

  // `evidence` and `described` come from the reader (describe path); the question form passes neither.
  const setFacts = useCallback(
    (packId: string, facts: Facts, evidence: Record<string, string[]> = {}, described?: Described) => {
      setState((s) => {
        const { [packId]: _old, ...others } = s.described;
        return {
          ...s,
          facts: { ...s.facts, [packId]: facts },
          evidence: { ...s.evidence, [packId]: evidence },
          described: described ? { ...others, [packId]: described } : others,
        };
      });
    },
    [],
  );

  /** Load the current owner's saved progress once (signed in: from the account, else from this device). */
  const ensureProgress = useCallback(
    (packId: string) => {
      const who = owner;
      progressLoads.current[`${who}:${packId}`] ??= (async () => {
        let loaded = await loadProgress(who, packId);
        const key = dataKey;
        if (who !== GUEST && key) {
          try {
            const remote = await pullPlan(who, packId, key);
            if (remote) {
              loaded = remote;
            } else {
              // A new account with no saved plan: bring over the plan made on this device before signing in.
              const guest = await loadProgress(GUEST, packId);
              if (guest.facts && !loaded.facts) {
                loaded = guest;
                await pushPlan(who, packId, guest, key);
                await clearProgress(GUEST, packId); // it lives in the account now
              }
            }
            await saveProgress(who, packId, loaded);
            if (ownerRef.current === who) setSync({ status: 'saved' });
          } catch (e) {
            if (ownerRef.current === who) setSync({ status: 'error', message: (e as Error).message });
          }
        }
        setState((s) => (s.owner !== who || s.progress[packId] ? s : { ...s, progress: { ...s.progress, [packId]: loaded } }));
        return loaded;
      })();
      return progressLoads.current[`${who}:${packId}`];
    },
    [owner, dataKey, setSync],
  );

  /** Save to the account a moment after the last change (so tapping around doesn't send many requests). */
  const schedulePush = useCallback(
    (who: string, packId: string, progress: Progress) => {
      const key = keyRef.current;
      if (who === GUEST || !key) return;
      clearTimeout(pushTimers.current[packId]);
      setSync({ status: 'saving' });
      pushTimers.current[packId] = setTimeout(() => {
        pushPlan(who, packId, progress, key).then(
          () => ownerRef.current === who && setSync({ status: 'saved' }),
          (e: Error) => ownerRef.current === who && setSync({ status: 'error', message: e.message }),
        );
      }, 800);
    },
    [setSync],
  );

  const updateProgress = useCallback(
    (packId: string, change: (p: Progress) => Progress) => {
      setState((s) => {
        const next = change(s.progress[packId] ?? EMPTY_PROGRESS);
        const stored = forStorage(s.packs[packId], next, rememberRef.current);
        saveProgress(s.owner, packId, stored);
        schedulePush(s.owner, packId, stored);
        return { ...s, progress: { ...s.progress, [packId]: next } };
      });
    },
    [schedulePush],
  );

  const buildPlan = useCallback(
    async (packId: string, facts: Facts) => {
      // Rebuilding an existing plan: send the answers it was built from (and which steps are done),
      // so the server can explain what changed. Nothing is stored on the server.
      await loadPack(packId); // so sensitive questions are known before anything is saved
      const old = state.plans[packId];
      const progress = state.progress[packId] ?? (await ensureProgress(packId)); // live tracker, not the first load
      const done = Object.entries(progress.tracker).filter(([, s]) => s === 'done').map(([id]) => id);
      const plan = await api.plan(packId, facts, old ? { facts: old.facts_used, done } : undefined);
      setState((s) => ({
        ...s,
        facts: { ...s.facts, [packId]: facts },
        plans: { ...s.plans, [packId]: plan },
      }));
      updateProgress(packId, (p) => ({ ...p, facts }));
      return plan;
    },
    [state.plans, state.progress, loadPack, ensureProgress, updateProgress],
  );

  const resetPack = useCallback(
    async (packId: string) => {
      const who = owner;
      clearTimeout(pushTimers.current[packId]);
      await clearProgress(who, packId);
      progressLoads.current[`${who}:${packId}`] = Promise.resolve(EMPTY_PROGRESS);
      setState((s) => {
        const { [packId]: _plan, ...plans } = s.plans;
        return { ...s, plans, facts: { ...s.facts, [packId]: {} }, progress: { ...s.progress, [packId]: EMPTY_PROGRESS } };
      });
      if (who !== GUEST) await deletePlan(who, packId);
    },
    [owner],
  );

  const resaveAll = useCallback((remember: boolean) => {
    rememberRef.current = remember;
    setState((s) => {
      for (const [packId, progress] of Object.entries(s.progress)) {
        if (!progress.facts) continue;
        const stored = forStorage(s.packs[packId], progress, remember);
        saveProgress(s.owner, packId, stored);
        schedulePush(s.owner, packId, stored);
      }
      return s;
    });
  }, [schedulePush]);

  /** The answer to a shared question (like the state) from another topic, this visit or a saved plan. */
  const sharedAnswer = useCallback(
    (factId: string, exceptPackId: string) => {
      const sources = [...Object.entries(state.facts), ...Object.entries(state.progress).map(([id, p]) => [id, p.facts] as const)];
      for (const [packId, facts] of sources) {
        const value = facts?.[factId];
        if (packId !== exceptPackId && value !== undefined && value !== '') return { value, packId };
      }
      return null;
    },
    [state.facts, state.progress],
  );

  /** Ask once: fill this pack's shared questions that are still blank with answers from other topics. */
  const withShared = useCallback(
    (pack: PackDetail, facts: Facts) => {
      const filled = { ...facts };
      for (const fact of pack.facts) {
        if (!fact.shared || filled[fact.id] !== undefined) continue;
        const found = sharedAnswer(fact.id, pack.id);
        const valid = found && (fact.type !== 'enum' || fact.options.some((o) => o.value === found.value));
        if (found && valid) filled[fact.id] = found.value;
      }
      return filled;
    },
    [sharedAnswer],
  );

  const forgetOnDevice = useCallback(async (who: string, packId: string) => {
    delete progressLoads.current[`${who}:${packId}`];
    await clearProgress(who, packId);
  }, []);

  // Start loading the current owner's plans (one per topic) as soon as we know who that is.
  useEffect(() => {
    if (!authLoading) TOPIC_IDS.forEach((id) => ensureProgress(id));
  }, [authLoading, ensureProgress]);

  const value = useMemo(
    () => ({
      ...state,
      loadPack,
      setFacts,
      buildPlan,
      ensureProgress,
      updateProgress,
      resetPack,
      forgetOnDevice,
      resaveAll,
      sharedAnswer,
      withShared,
    }),
    [state, loadPack, setFacts, buildPlan, ensureProgress, updateProgress, resetPack, forgetOnDevice, resaveAll, sharedAnswer, withShared],
  );
  return <FlowContext.Provider value={value}>{children}</FlowContext.Provider>;
}

export function useFlow(): Flow {
  const flow = useContext(FlowContext);
  if (!flow) throw new Error('useFlow must be used inside <FlowProvider>');
  return flow;
}

/** One pack's progress, shared by every screen and saved on each change. */
export function useProgress(packId: string) {
  const flow = useFlow();
  const { ensureProgress, updateProgress } = flow;
  useEffect(() => {
    ensureProgress(packId);
  }, [ensureProgress, packId]);
  const update = useCallback((change: (p: Progress) => Progress) => updateProgress(packId, change), [updateProgress, packId]);
  return { progress: flow.progress[packId] ?? EMPTY_PROGRESS, loaded: packId in flow.progress, update };
}

/** Drop facts with no answer, so "not answered" is never sent as a value. */
export function withoutBlanks(facts: Facts): Facts {
  return Object.fromEntries(
    Object.entries(facts).filter(([, v]) => v !== '' && v !== null && v !== undefined),
  );
}
