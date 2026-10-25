import type { DeadlineStatus } from './types';

const SOON_DAYS = 14; // same rule as engine/plan.py
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const d = new Date(`${value}T00:00:00`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(value);
}

function daysBetween(from: string, to: string): number {
  const ms = new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime();
  return Math.round(ms / 86_400_000);
}

/** Status for a date the user typed in (the server computes it for pack dates). */
export function statusFor(date: string | null, today: string): DeadlineStatus {
  if (!date) return 'needs_date';
  const days = daysBetween(today, date);
  if (days < 0) return 'passed';
  if (days <= SOON_DAYS) return 'soon';
  return 'upcoming';
}

export function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function daysAway(date: string, today: string): string {
  const days = daysBetween(today, date);
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days > 0) return `In ${days} days`;
  return `${-days} days ago`;
}
