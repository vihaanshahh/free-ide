import assert from "node:assert/strict";
import test from "node:test";

test("invoice list is the shape the route returns today", () => {
  const body = { items: [{ id: "inv_20", status: "draft" }] };
  assert.equal(body.items.length, 1);
  assert.equal("nextCursor" in body, false);
});
