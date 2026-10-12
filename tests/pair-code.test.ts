import assert from "node:assert/strict";
import test from "node:test";
import { issuedPairCode, visiblePairCode } from "../apps/web/src/pair-code.js";

test("pair code disappears at its 120 second deadline", () => {
  const code = issuedPairCode({ pairCode: "123456", expiresIn: 120 }, "room-one", 1000);
  assert.equal(visiblePairCode(code, "room-one", 120999), "123456");
  assert.equal(visiblePairCode(code, "room-one", 121000), "");
  assert.equal(visiblePairCode(code, "room-one", 121001), "");
});

test("a new room never displays the previous room's code", () => {
  const code = issuedPairCode({ pairCode: "123456", expiresIn: 120 }, "room-one", 1000);
  assert.equal(visiblePairCode(code, "room-two", 2000), "");
  assert.equal(visiblePairCode(null, "room-one", 2000), "");
});

test("uses server lifetime and preserves leading zeros", () => {
  const code = issuedPairCode({ pairCode: "000012", expiresIn: 30 }, "room-one", 1000);
  assert.equal(visiblePairCode(code, "room-one", 30999), "000012");
  assert.equal(visiblePairCode(code, "room-one", 31000), "");
});

test("invalid or expired replies cannot display a code", () => {
  for (const reply of [null, {}, { pairCode: "123", expiresIn: 120 }, { pairCode: "123456", expiresIn: 0 }, { pairCode: "123456", expiresIn: Infinity }]) {
    assert.equal(issuedPairCode(reply, "room-one", 1000), null);
  }
});
