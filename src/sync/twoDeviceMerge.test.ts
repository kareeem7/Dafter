import { describe, expect, it } from 'vitest';
import { mergeFieldMaps } from './conflict';
import type { Customer, FieldState } from '../types';

/**
 * Phase 9 integration: the 90-second two-device merge demo, reproduced as
 * a test. Two phones edit DIFFERENT fields of the same customer while
 * offline. When they sync, BOTH edits must survive — this is the moment
 * that separates a portfolio piece (field-level merge) from a tutorial
 * (row-level latest-wins, which silently deletes one edit).
 */
describe('two-device merge demo', () => {
  const field = (value: string | number, updatedAt: number, device: string): FieldState => ({
    value,
    updatedAt,
    device,
  });

  it('two devices editing different fields end up with BOTH changes', () => {
    // Base state synced from the server.
    const serverVersion: Customer = {
      id: 'customer-1',
      shopId: 'shop-1',
      fields: {
        name: field('أحمد حسن', 100, 'server'),
        phone: field('01000000000', 100, 'server'),
        balancePiastres: field(0, 100, 'server'),
      },
      createdAt: 1,
    };

    // Phone A goes offline, edits the phone number.
    const phoneA: Customer = {
      ...serverVersion,
      fields: { ...serverVersion.fields, phone: field('01111111111', 200, 'phone-A') },
    };

    // Phone B goes offline, edits the balance.
    const balanceB: Customer = {
      ...serverVersion,
      fields: { ...serverVersion.fields, balancePiastres: field(25000, 300, 'phone-B') },
    };

    // They sync back to the server — the server merges field-by-field.
    const merged = mergeFieldMaps(mergeFieldMaps(serverVersion.fields, phoneA.fields), balanceB.fields);

    expect(merged.name.value).toBe('أحمد حسن'); // untouched
    expect(merged.phone.value).toBe('01111111111'); // from phone A
    expect(merged.balancePiastres.value).toBe(25000); // from phone B
  });

  it('row-level latest-wins would have thrown a change away — field-level keeps it', () => {
    const base: Customer = {
      id: 'c1',
      shopId: 's1',
      fields: { phone: field('0100', 100, 's'), balancePiastres: field(0, 100, 's') },
      createdAt: 1,
    };

    // Simulate what row-level would do: the later write replaces the whole row.
    const rowLevelFields: Record<string, FieldState> = { ...base.fields, balancePiastres: field(25000, 300, 'B') };
    const rowLevelResult = { ...base, fields: rowLevelFields };
    // The phone edit from A is GONE.
    expect(rowLevelResult.fields.phone.value).toBe('0100'); // lost!

    // Field-level keeps it.
    const fieldLevel = mergeFieldMaps(
      mergeFieldMaps(base.fields, { phone: field('0111', 200, 'A') }),
      { balancePiastres: field(25000, 300, 'B') },
    );
    expect(fieldLevel.phone.value).toBe('0111');
    expect(fieldLevel.balancePiastres.value).toBe(25000);
  });

  it('same field edited on both phones resolves to the newest server write', () => {
    const base: Customer = {
      id: 'c1',
      shopId: 's1',
      fields: { note: field('أصلية', 100, 's') },
      createdAt: 1,
    };
    const fromA = mergeFieldMaps(base.fields, { note: field('من الهاتف A', 200, 'A') });
    const fromB = mergeFieldMaps(fromA, { note: field('من الهاتف B', 300, 'B') });

    expect(fromB.note.value).toBe('من الهاتف B');
    expect(fromB.note.device).toBe('B');
  });

  it('concurrent same-field edits with identical timestamps converge deterministically', () => {
    const base: Customer = {
      id: 'c1',
      shopId: 's1',
      fields: { note: field('قيمة', 100, 's') },
      createdAt: 1,
    };
    const a = mergeFieldMaps(base.fields, { note: field('من A', 200, 'A') });
    const b = mergeFieldMaps(base.fields, { note: field('من B', 200, 'B') });
    // Merge order must not matter — both converge to the same winner.
    const ab = mergeFieldMaps(a, b);
    const ba = mergeFieldMaps(b, a);
    expect(ab.note.device).toBe(ba.note.device);
  });
});
