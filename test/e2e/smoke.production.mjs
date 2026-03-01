const baseUrl = process.env.E2E_BASE_URL || "https://chatwithme2mcp.lintao-mailbox.workers.dev";
const sessionId = `e2e-smoke-${Date.now()}`;

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
  const home = await fetch(baseUrl);
  assert(home.ok, `Home not reachable: ${home.status}`);

  const historyBefore = await request(`/api/chat/history?sessionId=${encodeURIComponent(sessionId)}`);
  assert(historyBefore.response.ok, "history endpoint failed");
  assert(historyBefore.json.success === true, "history success false");

  const chat = await request("/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionId, message: "E2E smoke" })
  });
  assert(chat.response.ok, "chat endpoint failed");
  assert(chat.json.success === true, "chat success false");
  assert(typeof chat.json.response === "string" && chat.json.response.length > 0, "chat response empty");

  const badEdit = await request("/api/chat/edit", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionId })
  });
  assert(badEdit.response.status === 400, `bad edit expected 400 got ${badEdit.response.status}`);

  const clear = await request(`/api/chat/history?sessionId=${encodeURIComponent(sessionId)}`, {
    method: "DELETE"
  });
  assert(clear.response.ok, "clear history failed");
  assert(clear.json.success === true, "clear history success false");

  console.log(JSON.stringify({ success: true, baseUrl, sessionId }, null, 2));
}

run().catch((error) => {
  console.error("E2E smoke failed:", error.message);
  process.exit(1);
});
