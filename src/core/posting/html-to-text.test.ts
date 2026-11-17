import { describe, expect, it } from "vitest";
import { htmlToText } from "./html-to-text";

const PAGE = `<!doctype html>
<html>
  <head>
    <title>Backend Engineer at Globex</title>
    <style>body { color: red; }</style>
    <script>window.tracking = "on";</script>
  </head>
  <body>
    <header><a href="/">Globex careers</a></header>
    <nav><ul><li>All jobs</li></ul></nav>
    <main>
      <h1>Backend   Engineer</h1>
      <p>Globex is hiring in
         <strong>Dublin</strong>.</p>
      <ul>
        <li>TypeScript &amp; Node.js</li>
        <li>PostgreSQL</li>
      </ul>
      <aside>Similar jobs</aside>
      <form><input name="email"><button>Apply</button></form>
      <svg><text>logo</text></svg>
      <noscript>Enable JavaScript</noscript>
      <div>Salary: €70,000<br>Hybrid</div>
    </main>
    <footer>© Globex</footer>
  </body>
</html>`;

describe("htmlToText", () => {
  it("keeps the readable text of the main area, one line per block", () => {
    expect(htmlToText(PAGE)).toBe(
      ["Backend Engineer", "Globex is hiring in Dublin.", "- TypeScript & Node.js", "- PostgreSQL", "Salary: €70,000", "Hybrid"].join("\n"),
    );
  });

  it("drops scripts, styles, navigation, header, footer and the other boilerplate when there is no main area", () => {
    const text = htmlToText(PAGE.replace("<main>", "<div>").replace("</main>", "</div>"));

    expect(text.split("\n")[0]).toBe("Backend Engineer");
    for (const gone of ["tracking", "color", "careers", "All jobs", "Similar", "Apply", "logo", "JavaScript", "©"]) {
      expect(text).not.toContain(gone);
    }
  });

  it("prefers main, then article, then the body", () => {
    expect(htmlToText("<body><p>Around</p><article><p>In the article</p></article><main><p>In main</p></main></body>")).toBe("In main");
    expect(htmlToText("<body><p>Around</p><article><p>In the article</p></article></body>")).toBe("In the article");
    expect(htmlToText("<p>No body tag</p><p>at all</p>")).toBe("No body tag\nat all");
  });

  it("is empty for a page without text", () => {
    expect(htmlToText("")).toBe("");
    expect(htmlToText("<html><head><title>Job</title></head><body><script>render()</script><div id='root'> </div></body></html>")).toBe("");
  });

  describe("on LinkedIn", () => {
    const LINKEDIN = `<html><head><title>Globex hiring Backend Engineer in Dublin | LinkedIn</title></head><body>
      <main>
        <section class="description__text"><div class="show-more-less-html__markup">
          <p>We build payment systems.</p><ul><li>TypeScript</li></ul>
        </div></section>
        <section><h2>Similar jobs</h2><ul><li>Frontend Engineer at Initech</li></ul></section>
      </main></body></html>`;

    it("takes the description from its known element, under the page's title", () => {
      expect(htmlToText(LINKEDIN, { linkedIn: true })).toBe(
        "Globex hiring Backend Engineer in Dublin | LinkedIn\nWe build payment systems.\n- TypeScript",
      );
    });

    it("falls back to the general rules when the element is missing or empty", () => {
      const without = LINKEDIN.replace("show-more-less-html__markup", "something-else");
      expect(htmlToText(without, { linkedIn: true })).toContain("Similar jobs");
      expect(htmlToText("<main><div class='show-more-less-html__markup'></div><p>Sign in</p></main>", { linkedIn: true })).toBe("Sign in");
    });

    it("reads the whole main area of the same page from another site", () => {
      expect(htmlToText(LINKEDIN)).toContain("Frontend Engineer at Initech");
    });
  });
});
