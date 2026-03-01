import { describe, expect, it, vi, beforeEach } from "vitest";
import { createChatTransport } from "./chatTransport";

describe("createChatTransport", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("deduplicates concurrent history requests", async () => {
    const agent = {
      call: vi.fn(async () => {
        throw new Error("agent unavailable");
      })
    };

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            success: true,
            history: [{ role: "assistant", content: "hello", id: "m1" }]
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" }
          }
        )
      );

    const transport = createChatTransport({
      agent,
      sessionId: "s1",
      readonlyMode: false
    });

    const [a, b] = await Promise.all([transport.getHistory(), transport.getHistory()]);
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

