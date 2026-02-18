import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import App from "./App";

describe("App", () => {
  test("renders project title", () => {
    const html = renderToStaticMarkup(<App />);

    expect(html).toContain("Link Credit");
    expect(html).toContain("AI-powered privacy credit scoring");
  });
});
