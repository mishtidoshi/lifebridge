import Constants from 'expo-constants';
import { Platform } from 'react-native';

import type { Facts, PackDetail, PackSummary, Plan, QuestionWave, UnderstandResult } from './types';

const API_PORT = 8787; // keep in sync with `make api` in ../Makefile

// Set EXPO_PUBLIC_API_URL for a deployed server. Otherwise talk to the Python API
// on the same computer that runs `expo start` (works from a phone on the same Wi-Fi).
function defaultApiUrl(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return `${window.location.protocol}//${window.location.hostname}:${API_PORT}`;
  }
  const devHost = Constants.expoConfig?.hostUri?.split(':')[0];
  return `http://${devHost ?? 'localhost'}:${API_PORT}`;
}

export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? defaultApiUrl();

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

async function request<T>(path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError("Can't reach LifeBridge. Check your internet connection and try again.", 0);
  }
  if (!res.ok) {
    let message = `Something went wrong (${res.status}).`;
    try {
      const data = await res.json();
      if (typeof data.detail === 'string') message = data.detail;
    } catch {
      // keep the generic message
    }
    throw new ApiError(message, res.status);
  }
  return res.json() as Promise<T>;
}

/** A link that downloads one deadline as a calendar file (only the date is sent, never anything personal). */
export function calendarUrl(packId: string, deadlineId: string, date?: string): string {
  const base = `${API_URL}/api/calendar/${encodeURIComponent(packId)}/${encodeURIComponent(deadlineId)}.ics`;
  return date ? `${base}?date=${date}` : base;
}

export const api = {
  packs: () => request<PackSummary[]>('/api/packs'),
  pack: (packId: string) => request<PackDetail>(`/api/packs/${encodeURIComponent(packId)}`),
  // Without packId, the server works out the topic (rules first, then its naive Bayes model).
  understand: (text: string, packId?: string) =>
    request<UnderstandResult>('/api/understand', { text, pack_id: packId ?? null }),
  // With `previous`, the server also explains "What changed?" since the plan built from those answers.
  // The next few questions that would change the plan (engine/questions.py). `asked` = shown and skipped.
  questions: (packId: string, facts: Facts, asked: string[] = [], size = 3) =>
    request<QuestionWave>('/api/questions', { pack_id: packId, facts, asked, size }),
  plan: (packId: string, facts: Facts, previous?: { facts: Facts; done: string[] }) =>
    request<Plan>('/api/plan', {
      pack_id: packId,
      facts,
      ...(previous ? { previous_facts: previous.facts, previous_done: previous.done, done_steps: previous.done } : {}),
    }),
};
