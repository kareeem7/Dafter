import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Supabase client — the network side of the offline-first architecture.
 *
 * NON-NEGOTIABLE: only the ANON (publishable) key lives here, read from env.
 * The service_role key never touches the client bundle.
 */

const url = import.meta.env.VITE_SUPABASE_URL ?? '';
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

export const isSupabaseConfigured = Boolean(url && anonKey);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

/**
 * Call the apply_mutation RPC. This is what the outbox sender invokes.
 * Throws on failure so the outbox can schedule a retry / dead-letter it.
 */
export async function applyMutation(params: {
  shopId: string;
  mutationId: string;
  type: string;
  payload: unknown;
}): Promise<void> {
  if (!supabase) {
    throw new Error('supabase not configured');
  }
  const { data, error } = await supabase.rpc('apply_mutation', {
    p_shop_id: params.shopId,
    p_mutation_id: params.mutationId,
    p_type: params.type,
    p_payload: params.payload as never,
  });
  if (error) {
    throw new Error(error.message || `rpc failed (${error.code})`);
  }
  // dedup: true means this was a retry of an already-applied mutation — still success.
  void data;
}
