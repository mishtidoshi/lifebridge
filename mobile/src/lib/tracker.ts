import type { Progress } from './storage';
import type { Plan, PlanStep, TrackerState } from './types';

/** The step's tracker state: what the user picked, or Done if `done_if` matched, else To do. */
export function stepState(step: PlanStep, progress: Progress): TrackerState {
  return progress.tracker[step.id] ?? (step.done_at_start ? 'done' : 'todo');
}

/** "Do this next": the first step in plan order that isn't done. */
export function nextStep(plan: Plan, progress: Progress): PlanStep | undefined {
  return plan.steps.find((s) => stepState(s, progress) !== 'done');
}
