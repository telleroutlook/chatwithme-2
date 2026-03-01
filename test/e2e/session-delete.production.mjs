const baseUrl = process.env.E2E_BASE_URL || "https://chatwithme2mcp.lintao-mailbox.workers.dev";
const sessionId = `e2e-delete-${Date.now()}`;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function request(path, init) {
  const response = await fetch(`${baseUrl}${path}`, init);
  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Expected JSON for ${path}, got: ${text.slice(0, 120)}`);
  }
  return { response, json };
}

async function run() {
  const chat = await request("/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionId, message: "Session delete smoke" })
  });
  assert(chat.response.ok, "chat endpoint failed");
  assert(chat.json.success === true, "chat success false");

  const del = await request(`/api/chat/session?sessionId=${encodeURIComponent(sessionId)}`, {
    method: "DELETE"
  });
  assert(del.response.ok, "delete session endpoint failed");
  assert(del.json.success === true, "delete session success false");
  assert(
    del.json.destroyed === true || del.json.pendingDestroy === true,
    "delete session response missing destroyed state"
  );

  const history = await request(`/api/chat/history?sessionId=${encodeURIComponent(sessionId)}`);
  assert(history.response.ok, "history endpoint failed after delete");
  assert(history.json.success === true, "history success false after delete");
  assert(Array.isArray(history.json.history), "history payload malformed");
  assert(history.json.history.length === 0, "history expected to be empty after delete");

  console.log(JSON.stringify({ success: true, baseUrl, sessionId }, null, 2));
}

run().catch((error) => {
  console.error("Session delete smoke failed:", error.message);
  process.exit(1);
});
