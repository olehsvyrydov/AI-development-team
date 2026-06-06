/**
 * Google Gemini embeddings (gemini-embedding-001) over the REST API via fetch.
 *
 * Requested at outputDimensionality=1024 so it is dimension-compatible with
 * Voyage (voyage-code-3 = 1024), letting one vector DB serve either provider.
 */
import type { EmbeddingProvider } from "../types.ts";

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

export class GeminiEmbeddingProvider implements EmbeddingProvider {
  readonly model = "gemini-embedding-001";
  readonly dimensions = 1024;
  #key: string;

  constructor(apiKey?: string) {
    const key = apiKey ?? process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
    if (!key) throw new Error("GEMINI_API_KEY / GOOGLE_API_KEY not set");
    this.#key = key;
  }

  embedQuery(text: string): Promise<number[]> {
    return this.#embedOne(text, "RETRIEVAL_QUERY");
  }

  async embedDocuments(texts: string[], batchSize = 100): Promise<number[][]> {
    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += batchSize) {
      out.push(...(await this.#embedBatch(texts.slice(i, i + batchSize))));
    }
    return out;
  }

  async #embedOne(text: string, taskType: string): Promise<number[]> {
    // C1a: pass the key via header, never the URL query string (URLs leak to logs/proxies).
    const res = await fetch(`${BASE}/${this.model}:embedContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": this.#key },
      body: JSON.stringify({
        model: `models/${this.model}`,
        content: { parts: [{ text }] },
        taskType,
        outputDimensionality: this.dimensions,
      }),
    });
    if (!res.ok) throw new Error(`Gemini embed failed: ${res.status} ${await res.text()}`);
    const json = (await res.json()) as { embedding: { values: number[] } };
    return normalize(json.embedding.values);
  }

  async #embedBatch(texts: string[]): Promise<number[][]> {
    const res = await fetch(`${BASE}/${this.model}:batchEmbedContents`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": this.#key },
      body: JSON.stringify({
        requests: texts.map((text) => ({
          model: `models/${this.model}`,
          content: { parts: [{ text }] },
          taskType: "RETRIEVAL_DOCUMENT",
          outputDimensionality: this.dimensions,
        })),
      }),
    });
    if (!res.ok) throw new Error(`Gemini batch embed failed: ${res.status} ${await res.text()}`);
    const json = (await res.json()) as { embeddings: Array<{ values: number[] }> };
    return json.embeddings.map((e) => normalize(e.values));
  }
}

/**
 * gemini-embedding-001 vectors requested below 3072 dims are NOT pre-normalized;
 * cosine search expects unit vectors, so L2-normalize as the docs recommend.
 */
function normalize(v: number[]): number[] {
  let sum = 0;
  for (const x of v) sum += x * x;
  const norm = Math.sqrt(sum);
  return norm > 0 ? v.map((x) => x / norm) : v;
}
