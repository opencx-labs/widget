// Cloudflare Worker entry. Routes configured via `run_worker_first` in wrangler.jsonc:
// /api/*, /openapi.json and /health hit this Worker; everything else is served as the SPA.
import app from "./api.ts";
import type { Env } from "./env.ts";
import { buildOpenApi } from "./openapi.ts";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/openapi.json") {
      return Response.json(buildOpenApi(url.origin), {
        headers: { "access-control-allow-origin": "*", "cache-control": "no-store" },
      });
    }

    if (url.pathname === "/health" || url.pathname.startsWith("/api")) {
      return app.fetch(request, env, ctx);
    }

    // Fallback (shouldn't be hit given run_worker_first, but keeps the Worker correct standalone).
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
