/** Voyage AI embeddings (voyage-code-3, 1024-dim) over the REST API via fetch. */
import type { EmbeddingProvider } from "../types.ts";

const ENDPOINT = "https://api.voyageai.com/v1/embeddings";

export class VoyageEmbeddingProvider implements EmbeddingProvider {
  readonly model = "voyage-code-3";
  readonly dimensions = 1024;
  #key: string;

  constructor(apiKey?: string) {
    const key = apiKey ?? process.env.VOYAGE_API_KEY;
    if (!key) throw new Error("VOYAGE_API_KEY not set");
    this.#key = key;
  }

  async embedQuery(text: string): Promise<number[]> {
    const [v] = await this.#embed([text], "query");
    return v;
  }

  async embedDocuments(texts: string[], batchSize = 64): Promise<number[][]> {
    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += batchSize) {
      out.push(...(await this.#embed(texts.slice(i, i + batchSize), "document")));
    }
    return out;
  }

  async #embed(input: string[], inputType: "query" | "document"): Promise<number[][]> {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${this.#key}` },
      body: JSON.stringify({ input, model: this.model, input_type: inputType, output_dimension: this.dimensions }),
    });
    if (!res.ok) throw new Error(`Voyage embed failed: ${res.status} ${await res.text()}`);
    const json = (await res.json()) as { data: Array<{ embedding: number[] }> };
    return json.data.map((d) => d.embedding);
  }
}
