import { describe, expect, it } from "vitest";
import { isCountryName, parseTemplate } from "./template";

const valid = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="max-pages" content="1">
  <script type="text/markdown" id="rules">
- Summary: 3 lines, friendly and direct.
- Skills: one line, separated by |.
  </script>
  <style>h1 { text-align: center; }</style>
</head>
<body>
  <h1>{{name}}</h1>
  {{#each experience}}<h3>{{role}}</h3>{{/each}}
</body>
</html>`;

const parse = (html: string) => parseTemplate("ireland", "templates/ireland.html", html);

describe("parseTemplate", () => {
  it("reads the rules, the page limit and the layout", () => {
    const result = parse(valid);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.template.country).toBe("ireland");
    expect(result.template.maxPages).toBe(1);
    expect(result.template.rules).toBe("- Summary: 3 lines, friendly and direct.\n- Skills: one line, separated by |.");
    expect(result.template.layout).toContain("<h1>{{name}}</h1>");
    expect(result.template.layout).not.toContain("Summary: 3 lines");
  });

  it("has no page limit without the meta tag", () => {
    const result = parse(valid.replace('<meta name="max-pages" content="1">', ""));

    expect(result.ok && result.template.maxPages).toBeUndefined();
  });

  it("accepts attributes in any order and either quote style", () => {
    const html = valid
      .replace('<meta name="max-pages" content="1">', "<meta content='2' name='max-pages'>")
      .replace('<script type="text/markdown" id="rules">', "<script id='rules' type='text/markdown'>");

    expect(parse(html)).toMatchObject({ ok: true, template: { maxPages: 2 } });
  });

  it("requires a rules block", () => {
    const html = valid.replace(/<script[\s\S]*?<\/script>/, "");

    expect(parse(html)).toEqual({
      ok: false,
      error: {
        file: "templates/ireland.html",
        problems: ['missing the rules block: <script type="text/markdown" id="rules">…</script>'],
      },
    });
  });

  it("reports an empty or repeated rules block", () => {
    expect(parse(valid.replace(/(<script[^>]*>)[\s\S]*?(<\/script>)/, "$1 $2"))).toMatchObject({
      ok: false,
      error: { problems: ["the rules block is empty"] },
    });
    expect(parse(valid.replace("</head>", '<script type="text/markdown" id="rules">x</script></head>'))).toMatchObject({
      ok: false,
      error: { problems: ["has more than one rules block"] },
    });
  });

  it.each(["one", "0", "1.5", ""])("rejects max-pages %j", (content) => {
    const result = parse(valid.replace('content="1"', `content="${content}"`));

    expect(result).toMatchObject({
      ok: false,
      error: { problems: ['max-pages must be a whole number of pages, e.g. <meta name="max-pages" content="1">'] },
    });
  });

  it("reports Handlebars errors with the line in the file", () => {
    const result = parse(valid.replace("{{/each}}", "{{/if}}"));

    expect(result).toMatchObject({
      ok: false,
      error: { problems: [expect.stringMatching(/^invalid Handlebars: each doesn't match if - 14:/)] },
    });
  });

  it("does not treat Handlebars-looking text in the rules as part of the layout", () => {
    const html = valid.replace("- Skills:", "- Never output {{#if}} in the text.\n- Skills:");

    expect(parse(html).ok).toBe(true);
  });
});

describe("isCountryName", () => {
  it.each(["ireland", "united-kingdom"])("accepts %s", (name) => expect(isCountryName(name)).toBe(true));
  it.each(["Ireland", "../ireland", "ireland.html", "", "uk2"])("rejects %j", (name) =>
    expect(isCountryName(name)).toBe(false),
  );
});
