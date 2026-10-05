# scrape-ts

Typed helpers for scraping structured data out of web pages:

- **JSON / JSON-LD `<script>` tags**: return the first `application/json` or `application/ld+json` block that matches your schema.
- **Next.js App Router (RSC / Flight) payloads**: decode the inline `self.__next_f.push(...)` data and search the React tree for props that match your schema.

Validation works with any [Standard Schema](https://standardschema.dev) library, including Zod, Valibot, ArkType and Effect Schema. Requests go through `fetch` by default, and you can pass in your own implementation.

```bash
npm install scrape-ts
```

Requires Node.js 20.3+ (or any runtime with `fetch`, `AbortSignal.any` and `AbortSignal.timeout`).

## JSON / JSON-LD script tags

```ts
import { extractJsonScriptData } from "scrape-ts";
import { z } from "zod";

const video = await extractJsonScriptData("https://example.com/videos/123", {
  schema: z.object({
    "@type": z.literal("VideoObject"),
    name: z.string(),
    duration: z.string(),
  }),
});
// ^? { "@type": "VideoObject"; name: string; duration: string }
```

The function checks every `<script type="application/json">` and `<script type="application/ld+json">` block in document order and returns the first one that passes validation. It skips malformed blocks. If a block fails to parse because a string literal contains raw control characters, such as unescaped newlines in hand-written JSON-LD, it escapes them and tries again.

To get every JSON block on the page without validating any of them, use `extractJsonScripts`:

```ts
import { extractJsonScripts } from "scrape-ts";

const blocks = await extractJsonScripts("https://example.com"); // unknown[]
```

## Next.js React Server Components

```ts
import { extractNextRscProps } from "scrape-ts";
import { type } from "arktype";

const { initialData } = await extractNextRscProps("https://example.com/store/acme", {
  schema: type({ initialData: { store: { name: "string" } } }),
});
```

This decodes the page's Flight payload and does a breadth-first walk of every model chunk. It returns the props of the first React element whose `props` pass validation.

To get the props of every React element in the tree without validating any of them, use `extractAllNextRscProps`:

```ts
import { extractAllNextRscProps } from "scrape-ts";

const allProps = await extractAllNextRscProps("https://example.com"); // unknown[]
```

To get the raw decoded chunks, grouped by chunk type (`model`, `text`, `hint`, `module`, ...), use `extractNextRscData`:

```ts
import { extractNextRscData } from "scrape-ts";

const chunks = await extractNextRscData("https://example.com");
for (const chunk of chunks.model) console.log(chunk.id, chunk.value);
```

## Working with HTML you already have

Each fetching helper has a pure counterpart that takes an HTML string and makes no network request:

| Fetches a URL            | Parses HTML                                        |
| ------------------------ | -------------------------------------------------- |
| `extractJsonScriptData`  | `parseJsonScriptData(html, { schema })`            |
| `extractJsonScripts`     | `parseJsonScripts(html)`                           |
| `extractNextRscData`     | `parseNextRscData(html)`                           |
| `extractNextRscProps`    | `findNextRscProps(parseNextRscData(html), schema)` |
| `extractAllNextRscProps` | `findAllNextRscProps(parseNextRscData(html))`      |
| `fetchHtml`              | n/a                                                |

## Fetch options

All fetching helpers accept these options:

```ts
interface FetchOptions {
  /** Custom fetch implementation. Defaults to globalThis.fetch. */
  fetch?: (url: string, init?: RequestInit) => Promise<Response>;
  /** Merged over the default browser-like headers (Accept, Accept-Language, User-Agent). */
  headers?: RequestInit["headers"];
  /** Abort the request. */
  signal?: AbortSignal;
  /** Request timeout in ms, or false to disable. Default: 15000. */
  timeoutMs?: number | false;
  /** Extra RequestInit fields (method, redirect, dispatcher, ...). */
  init?: Omit<RequestInit, "headers" | "signal">;
}
```

For example, to route requests through a proxy or a retrying client:

```ts
import { extractJsonScriptData } from "scrape-ts";
import { ProxyAgent, fetch as undiciFetch } from "undici";

const dispatcher = new ProxyAgent("http://proxy:8080");

await extractJsonScriptData(url, {
  schema,
  fetch: (url, init) => undiciFetch(url, { ...init, dispatcher }) as Promise<Response>,
});
```

## Errors

Every failure throws a `ScrapeError`, which has a `code` and, where available, the `url`, the HTTP `status`, and the underlying `cause`:

| Code                   | Meaning                                                |
| ---------------------- | ------------------------------------------------------ |
| `INVALID_URL`          | The URL could not be parsed                            |
| `UNSUPPORTED_PROTOCOL` | The URL was not `http:` or `https:`                    |
| `TIMEOUT`              | The request took longer than `timeoutMs`               |
| `ABORTED`              | The caller's `signal` aborted the request              |
| `FETCH_FAILED`         | The fetch implementation threw                         |
| `HTTP_ERROR`           | The response status was not 2xx                        |
| `NOT_HTML`             | The response `content-type` was not HTML               |
| `NO_MATCH`             | No candidate matched the schema                        |
| `RSC_NOT_FOUND`        | The page has no Next.js Flight data                    |
| `SCRIPT_PARSE_FAILED`  | Flight push calls were found, but none could be parsed |
| `RSC_PARSE_FAILED`     | The Flight payload could not be decoded                |

```ts
import { isScrapeError } from "scrape-ts";

try {
  await extractJsonScriptData(url, { schema });
} catch (error) {
  if (isScrapeError(error, "HTTP_ERROR") && error.status === 404) return null;
  throw error;
}
```

## Development

```bash
vp install   # install dependencies
vp check     # format, lint, type check
vp test      # run tests
vp pack      # build to dist/
pnpm release # bump version and publish
```

## License

MIT
