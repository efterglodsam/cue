import { vi } from "vitest";

// A tiny stand-in for the @supabase/supabase-js query builder, just enough
// to unit-test the branching logic in src/lib/actions/*.ts without a real
// database. Every chain method (select/eq/in/update/insert/delete/...)
// returns the same builder so any call sequence works; the builder itself
// is thenable (matching supabase-js — you can `await` a query without
// calling .single()), and .single()/.maybeSingle() resolve to the same
// canned result.
//
// Usage: queue one { data, error } per `.from(table)` call the action under
// test is expected to make, in call order. `rpc` is queued separately.

type Result<T = unknown> = { data: T | null; error: { message: string } | null };

function makeBuilder(result: Result) {
  const chainMethods = [
    "select",
    "eq",
    "in",
    "neq",
    "order",
    "limit",
    "update",
    "insert",
    "delete",
    "upsert",
  ] as const;

  const builder: Record<string, unknown> = {};
  for (const method of chainMethods) {
    builder[method] = vi.fn(() => builder);
  }
  builder.single = vi.fn(async () => result);
  builder.maybeSingle = vi.fn(async () => result);
  // Makes `await supabase.from(...).update(...).eq(...)` resolve without an
  // explicit terminal call, exactly like the real query builder.
  (builder as { then: PromiseLike<Result>["then"] }).then = (onFulfilled, onRejected) =>
    Promise.resolve(result).then(onFulfilled, onRejected);

  return builder;
}

export interface MockSupabaseConfig {
  /** Results returned by successive `.from(table)` calls, in call order. */
  from?: Record<string, Result[]>;
  /** Results returned by successive `.rpc(name)` calls, in call order. */
  rpc?: Result[];
  storageUpload?: Result;
  storagePublicUrl?: string;
}

export function mockSupabaseClient(config: MockSupabaseConfig = {}) {
  const cursors: Record<string, number> = {};
  const rpcQueue = [...(config.rpc ?? [])];

  const from = vi.fn((table: string) => {
    const queue = config.from?.[table] ?? [];
    const index = cursors[table] ?? 0;
    cursors[table] = index + 1;
    const result = queue[index] ?? { data: null, error: null };
    return makeBuilder(result);
  });

  const rpc = vi.fn(async () => rpcQueue.shift() ?? { data: null, error: null });

  const storage = {
    from: vi.fn(() => ({
      upload: vi.fn(async () => config.storageUpload ?? { data: { path: "x" }, error: null }),
      getPublicUrl: vi.fn(() => ({
        data: { publicUrl: config.storagePublicUrl ?? "https://example.test/x.jpg" },
      })),
    })),
  };

  return { from, rpc, storage, __from_call_counts: cursors };
}
