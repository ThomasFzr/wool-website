import { describe, expect, it } from "vitest";
import { GET, POST } from "@/app/api/auth/[...nextauth]/route";

describe("/api/auth/[...nextauth]", () => {
  it("expose le même gestionnaire next-auth en GET et en POST", () => {
    expect(typeof GET).toBe("function");
    expect(POST).toBe(GET);
  });
});
