import * as v from "valibot";
import { describe, expect, test } from "vite-plus/test";
import { z } from "zod";
import {
  extractNextRscData,
  extractNextRscProps,
  findNextRscProps,
  parseNextRscData,
} from "../src/index.ts";
import { htmlResponse, mockFetch, nextFlightHtml } from "./helpers.ts";

const payload = [
  '1:{"meta":"value"}',
  '0:["$","div",null,{"className":"root","children":[["$","header",null,{"title":"Hi"}],["$","section",null,{"initialData":{"store":{"name":"Acme"},"handle":"acme"},"children":"content"}]]}]',
  "",
].join("\n");

const html = nextFlightHtml(payload);

describe("parseNextRscData", () => {
  test("decodes model chunks grouped by type", () => {
    const chunks = parseNextRscData(html);

    expect(chunks.model).toHaveLength(2);
    expect(chunks.model.find((chunk) => chunk.id === "1")?.value).toEqual({ meta: "value" });
  });

  test("throws RSC_NOT_FOUND when the page has no flight data", () => {
    expect(() => parseNextRscData("<html><script>var x = 1</script></html>")).toThrow(
      expect.objectContaining({ code: "RSC_NOT_FOUND" }),
    );
  });

  test("throws SCRIPT_PARSE_FAILED when push calls are malformed", () => {
    expect(() => parseNextRscData("<script>self.__next_f.push([1, notJson])</script>")).toThrow(
      expect.objectContaining({ code: "SCRIPT_PARSE_FAILED" }),
    );
  });
});

describe.each([
  ["zod", z.object({ initialData: z.object({ store: z.object({ name: z.string() }) }) })],
  ["valibot", v.object({ initialData: v.object({ store: v.object({ name: v.string() }) }) })],
])("prop search with %s", (_name, schema) => {
  test("findNextRscProps locates nested element props", async () => {
    const result = await findNextRscProps(parseNextRscData(html), schema);
    expect(result?.value.initialData.store.name).toBe("Acme");
  });

  test("extractNextRscProps fetches and searches", async () => {
    const { fetch } = mockFetch(() => htmlResponse(html));
    const props = await extractNextRscProps("https://example.com/acme", { fetch, schema });
    expect(props.initialData.store.name).toBe("Acme");
  });
});

test("findNextRscProps returns undefined when nothing matches", async () => {
  const result = await findNextRscProps(parseNextRscData(html), z.object({ nope: z.string() }));
  expect(result).toBeUndefined();
});

test("extractNextRscProps throws NO_MATCH when nothing matches", async () => {
  const { fetch } = mockFetch(() => htmlResponse(html));
  await expect(
    extractNextRscProps("https://example.com", { fetch, schema: z.object({ nope: z.string() }) }),
  ).rejects.toMatchObject({ code: "NO_MATCH" });
});

test("extractNextRscData fetches and decodes", async () => {
  const { fetch } = mockFetch(() => htmlResponse(html));
  const chunks = await extractNextRscData("https://example.com", { fetch });
  expect(chunks.model).toHaveLength(2);
});
