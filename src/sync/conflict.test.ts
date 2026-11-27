import { describe, expect, it } from 'vitest';
import { applyPatch, mergeFieldMaps, mergeRecords } from './conflict';
import type { FieldMap, FieldState } from '../types';

const field = (value: string | number, updatedAt: number, device: string): FieldState => ({
  value,
  updatedAt,
  device,
});

describe('field-level merge', () => {
  it('preserves two edits to DIFFERENT fields of the same customer', () => {
    const base: FieldMap = {
      name: field('أحمد', 100, 'device-1'),
      phone: field('01000000000', 100, 'device-1'),
      balancePiastres: field(0, 100, 'device-1'),
    };
    // Device 2 edits the phone; device 3 edits the balance.
    const fromPhone = mergeFieldMaps(base, { phone: field('01111111111', 200, 'device-2') });
    const merged = mergeFieldMaps(fromPhone, { balancePiastres: field(50000, 300, 'device-3') });

    expect(merged.name.value).toBe('أحمد');
    expect(merged.phone.value).toBe('01111111111');
    expect(merged.balancePiastres.value).toBe(50000);
  });

  it('row-level latest-wins would have thrown an edit away — field-level does not', () => {
    const base: FieldMap = {
      phone: field('01000000000', 100, 'device-1'),
      balancePiastres: field(1000, 100, 'device-1'),
    };
    const deviceA = { phone: field('01111111111', 200, 'device-A') };
    const deviceB = { balancePiastres: field(9000, 200, 'device-B') };

    const merged = mergeFieldMaps(mergeFieldMaps(base, deviceA), deviceB);
    expect(merged.phone.value).toBe('01111111111');
    expect(merged.balancePiastres.value).toBe(9000);
  });

  it('resolves same-field conflicts by newest server timestamp', () => {
    const base: FieldMap = { note: field('أصلية', 100, 'device-1') };
    const stale = mergeFieldMaps(base, { note: field('قديمة', 50, 'device-2') });
    expect(stale.note.value).toBe('أصلية');

    const fresh = mergeFieldMaps(base, { note: field('أحدث', 200, 'device-2') });
    expect(fresh.note.value).toBe('أحدث');
  });

  it('breaks identical timestamps deterministically so both devices converge', () => {
    const base: FieldMap = { note: field('قيمة', 100, 'device-A') };
    const fromB = mergeFieldMaps(base, { note: field('من ب', 100, 'device-B') });
    const fromA = mergeFieldMaps({ note: field('من ب', 100, 'device-B') }, base);
    expect(fromB.note.device).toBe(fromA.note.device);
  });

  it('applyPatch only touches the patched fields', () => {
    const record = {
      id: 'c1',
      shopId: 's1',
      fields: { name: field('سالم', 100, 'd1'), phone: field('010', 100, 'd1') },
    };
    const patched = applyPatch(record, { phone: field('011', 200, 'd2') });
    expect(patched.fields.name.value).toBe('سالم');
    expect(patched.fields.phone.value).toBe('011');
    // original record untouched
    expect(record.fields.phone.value).toBe('010');
  });

  it('mergeRecords combines both records', () => {
    const a: { id: string; fields: FieldMap } = { id: 'c1', fields: { name: field('أ', 100, 'd1') } };
    const b: { id: string; fields: FieldMap } = { id: 'c1', fields: { phone: field('010', 200, 'd2') } };
    const merged = mergeRecords(a, b);
    expect(merged.fields.name.value).toBe('أ');
    expect(merged.fields.phone.value).toBe('010');
  });
});
