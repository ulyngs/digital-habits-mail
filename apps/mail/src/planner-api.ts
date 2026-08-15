/**
 * The planner server, from inside the mail pane.
 *
 * The pane runs inside the Planner Mac app. It has no browser session; the
 * shell holds a device token that the signed-in planner page minted, and it
 * makes the request (`planner_fetch` in src-tauri/src/planner_bridge.rs).
 * Only `/api/agent/*` paths go through.
 *
 * The public standalone app never calls this: every caller checks the
 * product flavor first, and the shell there has no such command.
 */

type Invoke = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;

function invoke(): Invoke {
  const w = window as unknown as {
    __TAURI__?: { core?: { invoke?: Invoke } };
    __TAURI_INTERNALS__?: { invoke?: Invoke };
  };
  const fn = w.__TAURI__?.core?.invoke ?? w.__TAURI_INTERNALS__?.invoke;
  if (!fn) throw new Error("Not running in the desktop app");
  return fn;
}

export type PlannerResponse = {
  status: number;
  ok: boolean;
  contentType: string;
  text: string;
  json<T = unknown>(): T;
};

/** Is the shell holding a planner session? */
export async function plannerSessionReady(): Promise<boolean> {
  try {
    return await invoke()<boolean>("planner_session_ready");
  } catch {
    return false;
  }
}

/** One request to the planner. Throws on transport failure, not on 4xx/5xx. */
export async function plannerFetch(
  path: string,
  init: { method?: "GET" | "POST" | "DELETE"; body?: unknown } = {}
): Promise<PlannerResponse> {
  const raw = await invoke()<{ status: number; content_type: string; body: string }>(
    "planner_fetch",
    {
      request: {
        path,
        method: init.method ?? "GET",
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
      },
    }
  );
  return {
    status: raw.status,
    ok: raw.status >= 200 && raw.status < 300,
    contentType: raw.content_type,
    text: raw.body,
    json<T = unknown>() {
      return JSON.parse(raw.body) as T;
    },
  };
}

/**
 * Call a planner route and unwrap `{ ok, ...data }` or `{ error }` into a
 * value or a thrown Error with the server's message.
 */
export async function plannerJson<T>(
  path: string,
  init: { method?: "GET" | "POST" | "DELETE"; body?: unknown } = {}
): Promise<T> {
  const res = await plannerFetch(path, init);
  let data: Record<string, unknown> = {};
  try {
    data = res.json<Record<string, unknown>>();
  } catch {
    throw new Error(`Planner answered ${res.status}: ${res.text.slice(0, 200)}`);
  }
  if (!res.ok || data.ok === false) {
    throw new Error(String(data.error ?? `Planner request failed (${res.status})`));
  }
  return data as T;
}
