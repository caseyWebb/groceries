// Worker entry. Serves the MCP server over Streamable HTTP via createMcpHandler
// (stateless — no Durable Objects). A fresh server is built per request, closing
// over env so tool handlers can reach the GitHub token and repo coordinates.
// A plain GET / returns a health line; everything else goes to the MCP handler
// (default route /mcp).

import { createMcpHandler } from "agents/mcp";
import type { Env } from "./env.js";
import { buildServer } from "./tools.js";

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> | Response {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/") {
      return new Response("grocery-mcp ok — MCP endpoint at POST /mcp\n", {
        headers: { "content-type": "text/plain" },
      });
    }
    const server = buildServer(env);
    return createMcpHandler(server)(request, env, ctx);
  },
};
