import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock the client so we can control rpc() responses.
const rpcMock = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ rpc: rpcMock }),
}));

async function loadSupabase(configured: boolean) {
  vi.resetModules();
  if (configured) {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');
  } else {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
  }
  return import('./supabase');
}

describe('applyMutation client', () => {
  beforeEach(() => {
    rpcMock.mockReset();
  });

  it('returns without error when the RPC succeeds', async () => {
    const { applyMutation } = await loadSupabase(true);
    rpcMock.mockResolvedValue({ data: [{ ok: true, dedup: false }], error: null });
    await expect(
      applyMutation({ shopId: 's1', mutationId: 'm1', type: 'sale.create', payload: { saleId: 'x' } }),
    ).resolves.toBeUndefined();
    expect(rpcMock).toHaveBeenCalledWith('apply_mutation', {
      p_shop_id: 's1',
      p_mutation_id: 'm1',
      p_type: 'sale.create',
      p_payload: { saleId: 'x' },
    });
  });

  it('throws on RPC error so the outbox can retry / dead-letter', async () => {
    const { applyMutation } = await loadSupabase(true);
    rpcMock.mockResolvedValue({ data: null, error: { message: '422 validation failed', code: 'PGRST112' } });
    await expect(
      applyMutation({ shopId: 's1', mutationId: 'm1', type: 'sale.create', payload: {} }),
    ).rejects.toThrow('422 validation failed');
  });

  it('treats a dedup success (already applied) as success, not error', async () => {
    const { applyMutation } = await loadSupabase(true);
    rpcMock.mockResolvedValue({ data: [{ ok: true, dedup: true }], error: null });
    await expect(
      applyMutation({ shopId: 's1', mutationId: 'm1', type: 'sale.create', payload: {} }),
    ).resolves.toBeUndefined();
  });

  it('is not configured without env vars (no service_role in bundle)', async () => {
    const { isSupabaseConfigured, applyMutation } = await loadSupabase(false);
    expect(isSupabaseConfigured).toBe(false);
    await expect(
      applyMutation({ shopId: 's1', mutationId: 'm1', type: 'sale.create', payload: {} }),
    ).rejects.toThrow('supabase not configured');
  });
});
