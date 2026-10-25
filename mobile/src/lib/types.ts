// Shapes returned by the Python API (app.py, engine/plan.py).

export type FactValue = string | boolean | string[];

// A yes/no question answered "Not sure" (same value as engine/facts.py NOT_SURE).
export const NOT_SURE = 'not_sure';
export type Facts = Record<string, FactValue>;

export interface FactOption {
  value: string;
  label: string;
  means_unknown: boolean;
}

export interface Fact {
  id: string;
  question: string;
  type: 'enum' | 'multi' | 'bool' | 'date';
  options: FactOption[];
  ask_if_missing: boolean;
  required: boolean; // the plan isn't built until this is answered
  sensitive: boolean;
  shared: boolean; // the same question in other topics (like the state): answered once, reused
}

export interface PackSummary {
  id: string;
  title: string;
  summary: string;
  icon: string | null;
  status: 'draft' | 'verified';
}

export interface PackDetail extends PackSummary {
  cycle: { label: string; starts: string; ends: string } | null;
  example_inputs: string[];
  facts: Fact[];
}

// How the topic was picked (engine/understand.py route()).
export interface Routing {
  pack_id: string | null;
  method: 'rules' | 'model' | 'chosen' | null; // chosen = the user picked the topic first
  confidence: number; // 0–1, from the naive Bayes model
  top_words: string[]; // the words that pointed to this topic
}

export interface UnderstandResult {
  pack_id: string | null;
  facts: Facts;
  evidence: Record<string, string[]>; // fact id → the phrases it was read from
  guessed: Record<string, number>; // fact id → confidence, for answers LifeBridge's model guessed (not the rules)
  routing: Routing;
}

// engine/questions.py: the next few questions whose answer would change the plan.
export interface WaveQuestion {
  fact_id: string;
  required: boolean;
  impact: number; // how many parts of the plan the answer could change
  reason: string;
}

export interface QuestionWave {
  questions: WaveQuestion[];
  remaining: number; // more questions that still matter after these
  done: boolean; // nothing left would change the plan
}

export interface PlanStep {
  id: string;
  title: string;
  match: 'yes' | 'unknown';
  done_at_start: boolean;
  why: string[];
  unknown_facts: string[];
  depends_on: string[];
  documents: string[];
  deadlines: string[];
  where: { label: string; url?: string } | null;
  plain_explanation: string;
  source_text: string;
  source_url: string | null;
  last_verified: string | null;
  estimated_time: string | null;
  // "How this step was made" (packs/SCHEMA.md §9)
  judgment: boolean; // LifeBridge's own advice, not from an official source
  ai_drafted: boolean;
  review_status: 'draft' | 'verified';
  verified_by: string | null;
}

// "Still stuck?": where to get help (only the options that may apply to this person).
export interface PlanHelp {
  id: string;
  title: string;
  text: string;
  where: { label: string; url?: string } | null;
  prepare: string[];
  source_url: string | null;
  last_verified: string | null;
}

export type DeadlineStatus = 'upcoming' | 'soon' | 'passed' | 'needs_date';

export interface PlanDeadline {
  id: string;
  label: string;
  kind: 'hard' | 'priority' | 'varies' | 'from_letter';
  asap: boolean; // "as soon as possible": no fixed date, aid given out while money lasts
  date: string | null;
  status: DeadlineStatus;
  note: string;
  if_missed: string;
  source_url: string | null;
  last_verified: string | null;
  used_by: string[];
}

export interface PlanDocument {
  id: string;
  name: string;
  who: string;
  note: string;
  may_apply: boolean;
  used_by: string[];
}

export interface Plan {
  pack: { id: string; title: string; status: string };
  why_it_matters: { text: string; source_url: string | null; last_verified: string | null } | null;
  help: PlanHelp[];
  today: string;
  cycle_warning: string | null;
  notices: { id: string; message: string; source_url: string | null; stop_plan: boolean }[];
  stopped: boolean;
  next_step: string | null;
  steps: PlanStep[];
  documents: PlanDocument[];
  deadlines: PlanDeadline[];
  questions: { fact_id: string; question: string; settles: string[] }[];
  facts_used: Facts;
  changes: PlanChanges | null; // "What changed?" since the last plan (null for a first plan)
  ignored_facts: string[];
}

export interface PlanChange {
  step_id: string;
  title: string;
  reason: string; // one line: which answer caused it
}

// engine/changes.py
export interface PlanChanges {
  changed_facts: string[];
  added: PlanChange[];
  removed: PlanChange[];
  confirmed: PlanChange[]; // "May apply" → applies
  now_unsure: PlanChange[]; // applies → "May apply"
  moved_up: PlanChange[];
  next: { before: string | null; after: string | null; title: string | null; reason: string } | null;
  any: boolean;
}

// Tracker states are fixed by the engine, not the pack (SCHEMA.md §5).
export const TRACKER_STATES = ['todo', 'gathering', 'submitted', 'waiting', 'follow_up', 'done'] as const;
export type TrackerState = (typeof TRACKER_STATES)[number];
export const TRACKER_LABELS: Record<TrackerState, string> = {
  todo: 'To do',
  gathering: 'Gathering documents',
  submitted: 'Submitted',
  waiting: 'Waiting',
  follow_up: 'Follow-up',
  done: 'Done',
};
