/**
 * Select an embedding provider from config + environment.
 *
 * Order: the configured preference wins if its key is present; otherwise fall
 * back by key presence (Voyage → Gemini); else `null` (digest-only). Never
 * throws — a missing provider means semantic recall is skipped, not a crash.
 */
import type { EmbeddingProvider, MemoryConfig } from "../types.ts";
import { VoyageEmbeddingProvider } from "./voyage.ts";
import { GeminiEmbeddingProvider } from "./gemini.ts";

export function getEmbedder(cfg: MemoryConfig): EmbeddingProvider | null {
  const hasVoyage = !!process.env.VOYAGE_API_KEY;
  const hasGemini = !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);

  const order: Array<"voyage" | "gemini"> =
    cfg.embeddings === "gemini"
      ? ["gemini", "voyage"]
      : cfg.embeddings === "voyage"
        ? ["voyage", "gemini"]
        : []; // "none" → no embeddings

  for (const choice of order) {
    try {
      if (choice === "voyage" && hasVoyage) return new VoyageEmbeddingProvider();
      if (choice === "gemini" && hasGemini) return new GeminiEmbeddingProvider();
    } catch {
      // missing key / construction error → try the next
    }
  }
  return null;
}
