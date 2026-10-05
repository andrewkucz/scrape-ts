import { load } from "cheerio";
import { ScrapeError } from "./errors.ts";
import { type FetchOptions, fetchHtml } from "./fetch-html.ts";
import { type StandardSchemaV1, validate } from "./standard-schema.ts";

const JSON_SCRIPT_SELECTOR = 'script[type="application/json"], script[type="application/ld+json"]';

export interface ParseJsonScriptDataOptions<TSchema extends StandardSchemaV1> {
  /** Any Standard Schema (Zod, Valibot, ArkType, ...). The first script that validates is returned. */
  schema: TSchema;
  /** Used in error messages. */
  url?: string;
}

export interface ExtractJsonScriptDataOptions<TSchema extends StandardSchemaV1>
  extends FetchOptions, Omit<ParseJsonScriptDataOptions<TSchema>, "url"> {}

/**
 * Fetches a page and returns the first `application/json` or
 * `application/ld+json` script block that satisfies `schema`.
 */
export async function extractJsonScriptData<TSchema extends StandardSchemaV1>(
  url: string | URL,
  options: ExtractJsonScriptDataOptions<TSchema>,
): Promise<StandardSchemaV1.InferOutput<TSchema>> {
  const { schema, ...fetchOptions } = options;
  const page = await fetchHtml(url, fetchOptions);

  return parseJsonScriptData(page.html, { schema, url: page.url });
}

/**
 * Returns the first `application/json` or `application/ld+json` script block in
 * `html` (in document order) that satisfies `schema`. Malformed JSON blocks are
 * skipped.
 */
export async function parseJsonScriptData<TSchema extends StandardSchemaV1>(
  html: string,
  options: ParseJsonScriptDataOptions<TSchema>,
): Promise<StandardSchemaV1.InferOutput<TSchema>> {
  const { schema, url } = options;
  const scripts = readJsonScripts(html);

  for (const json of scripts) {
    let data: unknown;

    try {
      data = parseJsonScript(json);
    } catch {
      // A malformed JSON block should not prevent checking the others.
      continue;
    }

    const result = await validate(schema, data);
    if (result.success) {
      return result.value;
    }
  }

  const location = url ? ` for ${url}` : "";
  throw new ScrapeError(
    `No JSON script data matched the provided schema${location} (${scripts.length} candidate script(s) checked)`,
    "NO_MATCH",
    { url },
  );
}

/**
 * Fetches a page and returns the parsed contents of every `application/json`
 * and `application/ld+json` script block, unvalidated, in document order.
 */
export async function extractJsonScripts(
  url: string | URL,
  options: FetchOptions = {},
): Promise<unknown[]> {
  const page = await fetchHtml(url, options);
  return parseJsonScripts(page.html);
}

/**
 * Returns the parsed contents of every `application/json` and
 * `application/ld+json` script block in `html`, unvalidated, in document order.
 * Malformed blocks are skipped.
 */
export function parseJsonScripts(html: string): unknown[] {
  const results: unknown[] = [];

  for (const json of readJsonScripts(html)) {
    try {
      results.push(parseJsonScript(json));
    } catch {
      // Skip malformed blocks.
    }
  }

  return results;
}

function readJsonScripts(html: string): string[] {
  const $ = load(html);
  const scripts: string[] = [];

  $(JSON_SCRIPT_SELECTOR).each((_, element) => {
    const json = $(element).html();

    if (json?.trim()) {
      scripts.push(json);
    }
  });

  return scripts;
}

/**
 * Parses JSON, retrying with raw control characters inside string literals
 * escaped — a common defect in hand-rolled JSON-LD.
 */
export function parseJsonScript(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch (cause) {
    try {
      return JSON.parse(escapeControlCharactersInStrings(json));
    } catch {
      throw cause;
    }
  }
}

function escapeControlCharactersInStrings(json: string): string {
  let result = "";
  let insideString = false;
  let escaped = false;

  for (const character of json) {
    if (!insideString) {
      result += character;
      if (character === '"') {
        insideString = true;
      }
      continue;
    }

    if (escaped) {
      result += character;
      escaped = false;
      continue;
    }

    if (character === "\\") {
      result += character;
      escaped = true;
      continue;
    }

    if (character === '"') {
      result += character;
      insideString = false;
      continue;
    }

    const codePoint = character.codePointAt(0);
    result +=
      codePoint !== undefined && codePoint <= 0x1f
        ? `\\u${codePoint.toString(16).padStart(4, "0")}`
        : character;
  }

  return result;
}
