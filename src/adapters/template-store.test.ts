import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createFsTemplateStore } from "./template-store";

describe("createFsTemplateStore", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "resume-templates-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("loads and checks a template", async () => {
    await writeFile(
      path.join(dir, "ireland.html"),
      '<meta name="max-pages" content="1"><script type="text/markdown" id="rules">- One page.</script><h1>{{name}}</h1>',
    );

    expect(await createFsTemplateStore(dir).loadTemplate("ireland")).toMatchObject({
      ok: true,
      template: { country: "ireland", maxPages: 1, rules: "- One page." },
    });
  });

  it("reports a missing template instead of falling back", async () => {
    await writeFile(path.join(dir, "ireland.md"), "# Draft");

    expect(await createFsTemplateStore(dir).loadTemplate("ireland")).toEqual({
      ok: false,
      error: { file: "templates/ireland.html", problems: ["file is missing"] },
    });
  });

  it.each(["../ireland", "Ireland", "ireland.html"])("refuses the template name %j", async (country) => {
    await expect(createFsTemplateStore(dir).loadTemplate(country)).rejects.toThrow("Invalid template name");
  });
});
