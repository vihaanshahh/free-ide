import assert from "node:assert/strict";
import test from "node:test";
import { AD_PLACEMENTS, fetchPlacements, resetGravityClient, setGravityClientForTests, type GravityLike } from "./ads.ts";

test("getAds runs beside the reply with stripped context and both placements", async () => {
  const previous = { MOCK_ADS: process.env.MOCK_ADS, GRAVITY_API_KEY: process.env.GRAVITY_API_KEY };
  process.env.MOCK_ADS = "0";
  process.env.GRAVITY_API_KEY = "test-key";
  let seenMessages: Array<{ role: string; content: string }> = [];
  let seenPlacements: unknown[] = [];
  let seenReq: { headers?: Record<string, string>; body?: { gravity_context?: { sessionId?: string; user?: { userId?: string }; device?: { ua?: string; ip?: string } } } } = {};
  const client: GravityLike = {
    async getAds(req, messages, placements) {
      seenReq = req as typeof seenReq;
      seenMessages = messages;
      seenPlacements = placements;
      return {
        status: 200,
        ads: [
          {
            adText: "Test creative for the chat slot.",
            title: "Gravity test",
            brandName: "Gravity",
            cta: "Learn more",
            url: "https://example.com/ad",
            favicon: "",
            brandImage: "",
            clickUrl: "https://example.com/click",
            impUrl: "https://example.com/imp",
            placement: "below_response",
            placement_id: "below_response",
          },
          {
            adText: "Sidebar test creative.",
            title: "Sidebar",
            brandName: "Gravity",
            placement: "right_response",
            placement_id: "sidebar",
          },
        ],
      };
    },
  };
  setGravityClientForTests(client);
  try {
    const result = await fetchPlacements({
      messages: [
        { role: "user", content: "Look at `sk-secretsecretsecret` in /workspace/examples/secret.ts then edit invoices." },
        { role: "assistant", content: "```ts\nconst key = 'hidden'\n```" },
      ],
      gravityContext: {
        sessionId: "sess_demo",
        user: { userId: "local-demo" },
        device: { ua: "SubspacesTest" },
      },
      headers: { "user-agent": "SubspacesTest", "x-forwarded-for": "203.0.113.8" },
    });
    assert.deepEqual(seenPlacements, [...AD_PLACEMENTS]);
    assert.equal(seenMessages.some((message) => /sk-secret|secret\.ts|const key/.test(message.content)), false);
    assert.equal(seenMessages.some((message) => message.content.includes("```")), false);
    assert.match(seenMessages.map((message) => message.content).join(" "), /edit invoices/);
    assert.equal(seenReq.body?.gravity_context?.sessionId, "sess_demo");
    assert.equal(seenReq.body?.gravity_context?.user?.userId, "local-demo");
    assert.equal(seenReq.body?.gravity_context?.device?.ua, "SubspacesTest");
    assert.equal(seenReq.headers?.["x-forwarded-for"], "203.0.113.8");
    assert.equal(result.below?.source, "gravity");
    assert.equal(result.below?.title, "Gravity test");
    assert.equal(result.sidebar?.placement_id, "sidebar");
  } finally {
    resetGravityClient();
    if (previous.MOCK_ADS === undefined) delete process.env.MOCK_ADS;
    else process.env.MOCK_ADS = previous.MOCK_ADS;
    if (previous.GRAVITY_API_KEY === undefined) delete process.env.GRAVITY_API_KEY;
    else process.env.GRAVITY_API_KEY = previous.GRAVITY_API_KEY;
  }
});

test("ads without placement fields follow the requested slot order", async () => {
  const previous = { MOCK_ADS: process.env.MOCK_ADS, GRAVITY_API_KEY: process.env.GRAVITY_API_KEY };
  process.env.MOCK_ADS = "0";
  process.env.GRAVITY_API_KEY = "test-key";
  setGravityClientForTests({
    async getAds() {
      return {
        status: 200,
        ads: [
          { adText: "Below creative.", title: "Below" },
          { adText: "Rail creative.", title: "Rail" },
        ],
      };
    },
  });
  try {
    const result = await fetchPlacements({
      messages: [{ role: "user", content: "Edit the invoice list." }],
      headers: { "user-agent": "SubspacesTest", "x-forwarded-for": "203.0.113.10" },
      gravityContext: { sessionId: "sess_slots", user: { userId: "local-demo" }, device: { ua: "SubspacesTest" } },
    });
    assert.equal(result.below?.placement_id, "below_response");
    assert.equal(result.below?.title, "Below");
    assert.equal(result.sidebar?.placement_id, "sidebar");
    assert.equal(result.sidebar?.placement, "right_response");
    assert.equal(result.sidebar?.title, "Rail");
  } finally {
    resetGravityClient();
    if (previous.MOCK_ADS === undefined) delete process.env.MOCK_ADS;
    else process.env.MOCK_ADS = previous.MOCK_ADS;
    if (previous.GRAVITY_API_KEY === undefined) delete process.env.GRAVITY_API_KEY;
    else process.env.GRAVITY_API_KEY = previous.GRAVITY_API_KEY;
  }
});

test("an empty ad array renders nothing when mock fill is off", async () => {
  const previous = process.env.MOCK_ADS;
  process.env.MOCK_ADS = "0";
  process.env.GRAVITY_API_KEY = process.env.GRAVITY_API_KEY || "test-key";
  setGravityClientForTests({
    async getAds() {
      return { ads: [], status: 204 };
    },
  });
  try {
    const result = await fetchPlacements({
      messages: [{ role: "user", content: "Hello from the editor." }],
      headers: { "user-agent": "SubspacesTest", "x-forwarded-for": "203.0.113.9" },
      gravityContext: { sessionId: "sess_empty", user: { userId: "local-demo" }, device: { ua: "SubspacesTest" } },
    });
    assert.equal(result.below, null);
    assert.equal(result.sidebar, null);
  } finally {
    resetGravityClient();
    if (previous === undefined) delete process.env.MOCK_ADS;
    else process.env.MOCK_ADS = previous;
  }
});
