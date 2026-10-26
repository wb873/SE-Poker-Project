// Run with: npx jest util/PasswordUtil.test.js
// Pure unit tests: no database needed.
const PasswordUtil = require("./PasswordUtil");

describe("validate", () => {
  test("accepts a password of acceptable length", () => {
    expect(PasswordUtil.validate("secret123")).toBeNull();
  });

  test("rejects a missing password", () => {
    expect(PasswordUtil.validate(undefined)).toBe("A password is required.");
    expect(PasswordUtil.validate("")).toBe("A password is required.");
  });

  test("rejects a non-string password", () => {
    expect(PasswordUtil.validate(12345678)).toBe("A password is required.");
  });

  test("rejects a password that is too short", () => {
    expect(PasswordUtil.validate("short")).toBe("Password must be at least 8 characters.");
  });

  test("rejects a password that is too long", () => {
    const tooLong = "a".repeat(PasswordUtil.MAX_LENGTH + 1);
    expect(PasswordUtil.validate(tooLong)).toBe("Password must be 128 characters or fewer.");
  });
});

describe("hash", () => {
  test("returns a salt and hash joined by a colon", () => {
    const [salt, hash] = PasswordUtil.hash("secret123").split(":");
    expect(salt).toMatch(/^[0-9a-f]{32}$/);
    expect(hash).toMatch(/^[0-9a-f]{128}$/);
  });

  test("never stores the password itself", () => {
    expect(PasswordUtil.hash("secret123")).not.toContain("secret123");
  });

  test("produces a different hash each time for the same password", () => {
    expect(PasswordUtil.hash("secret123")).not.toBe(PasswordUtil.hash("secret123"));
  });
});

describe("verify", () => {
  test("accepts the correct password", () => {
    const stored = PasswordUtil.hash("secret123");
    expect(PasswordUtil.verify("secret123", stored)).toBe(true);
  });

  test("rejects an incorrect password", () => {
    const stored = PasswordUtil.hash("secret123");
    expect(PasswordUtil.verify("secret124", stored)).toBe(false);
  });

  test("rejects two different passwords that hash separately", () => {
    const stored = PasswordUtil.hash("secret123");
    expect(PasswordUtil.verify("", stored)).toBe(false);
  });

  test("returns false for a malformed stored value rather than throwing", () => {
    expect(PasswordUtil.verify("secret123", "")).toBe(false);
    expect(PasswordUtil.verify("secret123", "nocolon")).toBe(false);
    expect(PasswordUtil.verify("secret123", "salt:nothex")).toBe(false);
    expect(PasswordUtil.verify("secret123", undefined)).toBe(false);
  });

  test("rejects a stored hash of the wrong length", () => {
    expect(PasswordUtil.verify("secret123", "abcd:0011")).toBe(false);
  });
});
