import { Agent } from "agents";

/**
 * Base agent class with common functionality
 * Similar to PlaygroundAgent in the agents example
 */
export class BaseAgent<T = unknown> extends Agent<Env, T> {
  onStart() {
    this.mcp.configureOAuthCallback({
      customHandler: (result) => {
        if (result.authSuccess) {
          return new Response("<script>window.close();</script>", {
            headers: { "content-type": "text/html" },
            status: 200
          });
        }
        const error = result.authError || "Unknown error";
        return new Response(`Authentication Failed: ${error}`, {
          headers: { "content-type": "text/plain" },
          status: 400
        });
      }
    });
  }
}
