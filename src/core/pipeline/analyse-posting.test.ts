import { describe, expect, it } from "vitest";
import { z } from "zod";
import { LlmError, type LlmClient, type LlmRequest } from "../llm";
import { assembleProfile, type Profile, type SourceFile } from "../profile/profile";
import { analysePosting } from "./analyse-posting";

const sources: SourceFile[] = [
  {
    file: "personal.md",
    source: "---\nname: Jane Doe\nemail: jane@example.com\nlocation: { city: Dublin, country: Ireland }\n---\n",
  },
  { file: "summary.md", source: "---\n---\nBackend developer.\n" },
  { file: "skills.md", source: "---\n---\n## Languages\n- TypeScript\n" },
  { file: "languages.md", source: "---\nlanguages: [{ name: English, level: C1 }]\n---\n" },
  {
    file: "experience/2023-01-acme-senior-developer.md",
    source: "---\ncompany: Acme\nrole: Senior Developer\nstart: 2023-01\nend: present\n---\n- Deployed to Amazon EKS.\n",
  },
];

function profile(): Profile {
  const result = assembleProfile(sources);
  if (!result.ok) throw new Error("fixture profile is invalid");
  return result.profile;
}

const reply = {
  company: "Globex",
  role: "Backend Engineer",
  location: "Dublin, Ireland",
  language: "en",
  requirements: [
    {
      text: "TypeScript",
      importance: "must-have",
      status: "matched",
      sources: ["skills.md", "experience/2023-01-acme-senior-developer.md"],
      note: "Listed in skills and used at Acme.",
    },
    {
      text: "Kubernetes",
      importance: "nice-to-have",
      status: "partial",
      sources: ["experience/2023-01-acme-senior-developer.md"],
      note: "Amazon EKS is mentioned; Kubernetes itself is not.",
    },
    { text: "Go", importance: "must-have", status: "missing", sources: [], note: "Not in the profile." },
  ],
  keywords: ["TypeScript", "Kubernetes", "Go"],
};

/** A fake model that validates its canned reply the way the real client does. */
function fakeLlm(answer: unknown) {
  const requests: LlmRequest<unknown>[] = [];
  const llm: LlmClient = {
    model: "fake-model",
    async generate<T>(request: LlmRequest<T>): Promise<T> {
      requests.push(request as LlmRequest<unknown>);
      return request.schema.parse(answer);
    },
  };
  return { llm, requests };
}

const times = ["2026-11-09T14:00:00.000Z", "2026-11-09T14:03:20.000Z"];
const clock = () => {
  let i = 0;
  return () => new Date(times[Math.min(i++, times.length - 1)]);
};

describe("analysePosting", () => {
  it("returns job.md and analysis.md data from the model's reply", async () => {
    const { llm } = fakeLlm(reply);

    const result = await analysePosting({ llm, profile: profile(), posting: "Globex is hiring.", now: clock() });

    expect(result).toEqual({
      job: {
        source: "paste",
        fetched_at: "2026-11-09T14:00:00.000Z",
        company: "Globex",
        role: "Backend Engineer",
        language: "en",
        location: "Dublin, Ireland",
      },
      analysis: {
        generated_at: "2026-11-09T14:03:20.000Z",
        model: "fake-model",
        requirements: reply.requirements,
        keywords: reply.keywords,
      },
    });
  });

  it("omits the location when the posting has none", async () => {
    const { llm } = fakeLlm({ ...reply, location: null });

    const { job } = await analysePosting({ llm, profile: profile(), posting: "p", now: clock() });

    expect(job).not.toHaveProperty("location");
  });

  it("asks at low temperature, with the posting delimited", async () => {
    const { llm, requests } = fakeLlm(reply);

    await analysePosting({ llm, profile: profile(), posting: "Globex is hiring.", now: clock() });

    expect(requests).toHaveLength(1);
    expect(requests[0].temperature).toBeLessThanOrEqual(0.2);
    expect(requests[0].prompt).toContain("<posting>\nGlobex is hiring.\n</posting>");
    expect(requests[0].prompt).toContain('<file path="experience/2023-01-acme-senior-developer.md">');
  });

  it("only lets the model cite files that exist in the profile", async () => {
    const { llm, requests } = fakeLlm(reply);
    await analysePosting({ llm, profile: profile(), posting: "p", now: clock() });

    const jsonSchema = z.toJSONSchema(requests[0].schema) as unknown as {
      properties: { requirements: { items: { properties: { sources: { items: { enum: string[] } } } } } };
    };
    expect(jsonSchema.properties.requirements.items.properties.sources.items.enum).toEqual([
      "experience/2023-01-acme-senior-developer.md",
      "languages.md",
      "personal.md",
      "skills.md",
      "summary.md",
    ]);
  });

  it("rejects a match without sources", async () => {
    const bad = { ...reply, requirements: [{ ...reply.requirements[0], sources: [] }] };
    const { llm } = fakeLlm(bad);

    await expect(analysePosting({ llm, profile: profile(), posting: "p", now: clock() })).rejects.toMatchObject({
      kind: "invalid-output",
    });
  });

  it("rejects a gap that cites sources", async () => {
    const bad = { ...reply, requirements: [{ ...reply.requirements[2], sources: ["skills.md"] }] };
    const { llm } = fakeLlm(bad);

    await expect(analysePosting({ llm, profile: profile(), posting: "p", now: clock() })).rejects.toBeInstanceOf(
      LlmError,
    );
  });

  it("refuses an empty posting without calling the model", async () => {
    const { llm, requests } = fakeLlm(reply);

    await expect(analysePosting({ llm, profile: profile(), posting: "  \n", now: clock() })).rejects.toThrow(
      "The job posting is empty.",
    );
    expect(requests).toHaveLength(0);
  });
});
