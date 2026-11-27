/**
 * conflict.ts — field-level merge, not row-level.
 *
 * Two devices editing the same customer concurrently must END UP WITH BOTH
 * CHANGES. Row-level "latest wins" silently throws one edit away. Here every
 * field carries its own server-authoritative timestamp, and merging picks
 * the newest value per field.
 *
 * Tie-breaking is deterministic: on identical timestamps the lexicographically
 * greater device id wins, so both devices converge to the same result.
 */

import type { FieldMap, FieldState } from '../types';

/**
 * Merge two versions of the same field map.
 * For each field, keep the state with the newest `updatedAt`.
 */
export function mergeFieldMaps(base: FieldMap, incoming: FieldMap): FieldMap {
  const merged: FieldMap = { ...base };
  for (const [field, incomingState] of Object.entries(incoming)) {
    const baseState = merged[field];
    if (!baseState || isNewer(incomingState, baseState)) {
      merged[field] = incomingState;
    }
  }
  return merged;
}

function isNewer(candidate: FieldState, current: FieldState): boolean {
  if (candidate.updatedAt !== current.updatedAt) {
    return candidate.updatedAt > current.updatedAt;
  }
  return candidate.device > current.device;
}

/**
 * Merge a partial patch into a record. Fields present in the patch are
 * updated; fields absent are untouched — this is exactly what makes the
 * "phone on one phone, balance on another" case work.
 */
export function applyPatch<T extends { fields: FieldMap }>(record: T, patch: Record<string, FieldState>): T {
  const merged = mergeFieldMaps(record.fields, patch);
  return { ...record, fields: merged };
}

/**
 * Convenience: two customer records (or any field-map records) merge into
 * one, both edits preserved.
 */
export function mergeRecords<T extends { fields: FieldMap }>(a: T, b: T): T {
  return { ...a, fields: mergeFieldMaps(a.fields, b.fields) } as T;
}
