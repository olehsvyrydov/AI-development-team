"""Voyage AI embedding provider for AI Team Memory."""

import os


class VoyageEmbeddingProvider:
    """Wraps voyageai client for voyage-code-3 embeddings."""

    MODEL = "voyage-code-3"
    DIMENSIONS = 1024

    def __init__(self, api_key: str | None = None):
        import voyageai

        self._client = voyageai.Client(
            api_key=api_key or os.environ.get("VOYAGE_API_KEY")
        )

    def embed_query(self, text: str) -> list[float]:
        """Embed a single query string."""
        result = self._client.embed([text], model=self.MODEL, input_type="query")
        return result.embeddings[0]

    def embed_documents(self, texts: list[str], batch_size: int = 64) -> list[list[float]]:
        """Embed multiple documents in batches."""
        all_embeddings = []
        for i in range(0, len(texts), batch_size):
            batch = texts[i:i + batch_size]
            result = self._client.embed(batch, model=self.MODEL, input_type="document")
            all_embeddings.extend(result.embeddings)
        return all_embeddings
