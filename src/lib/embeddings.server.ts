/**
 * Lovable AI Gateway embeddings (server-only).
 * Uses Gemini embeddings (3072 dims) to match the `vector(3072)` column.
 */

const EMBEDDING_MODEL = "google/gemini-embedding-001";
const MAX_BATCH = 100;

async function embedBatch(inputs: string[], apiKey: string): Promise<number[][]> {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: inputs }),
  });

  if (!res.ok) {
    const body = await res.text();
    if (res.status === 429) throw new Error("AI rate limit reached. Please retry in a moment.");
    if (res.status === 402) throw new Error("AI credits exhausted. Add credits to keep ingesting.");
    throw new Error(`Embedding request failed [${res.status}]: ${body}`);
  }

  const data = (await res.json()) as {
    data: Array<{ index: number; embedding: number[] }>;
  };
  return data.data.sort((a, b) => a.index - b.index).map((row) => row.embedding);
}

/** Embeds any number of texts, batching within provider limits. */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("Missing LOVABLE_API_KEY");

  const vectors: number[][] = [];
  for (let i = 0; i < texts.length; i += MAX_BATCH) {
    vectors.push(...(await embedBatch(texts.slice(i, i + MAX_BATCH), apiKey)));
  }
  return vectors;
}

/** Embeds a single query string. */
export async function embedQuery(text: string): Promise<number[]> {
  const [vector] = await embedTexts([text]);
  return vector;
}
