import { APP_NAME, VERSION } from "./index";

describe("price-pulse", () => {
  it("exports APP_NAME", () => {
    expect(APP_NAME).toBe("price-pulse");
  });

  it("exports VERSION", () => {
    expect(VERSION).toBe("0.1.0");
  });
});
