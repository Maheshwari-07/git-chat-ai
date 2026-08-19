import { createFileRoute } from "@tanstack/react-router";

import { embedQuery } from "@/lib/embeddings.server";

type ChatBody = {
  repoId?: string;
  question?: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
};

const CHAT_MODEL = "google/gemini-3.7-flash";

/**
 * PHASE B — Retrieval + Generation.
 * Embeds the question, runs a cosine-similarity search over the repo's code
 * chunks, augments a strict system prompt, and streams the answer back.
 */
export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json()) as ChatBody;
        const question = body.question?.trim();
        const repoId = body.repoId;
        if (!question || !repoId) {
          return new Response("repoId and question are required", { status: 400 });
        }

        const apiKey = process.env["LOVABLE_API_KEY"];
        if (!apiKey) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // 1. Embed the user's question.
        let queryEmbedding: number[];
        try {
          queryEmbedding = await embedQuery(question);
        } catch (error) {
          return new Response((error as Error).message, { status: 502 });
        }

        // 2. Semantic search for the 5 most relevant chunks.
        const { data: matches, error } = await supabaseAdmin.rpc("match_documents", {
          query_embedding: JSON.stringify(queryEmbedding) as unknown as string,
          match_repo_id: repoId,
          match_count: 5,
        });
        if (error) return new Response(`Search failed: ${error.message}`, { status: 500 });

        const context = (matches ?? [])
          .map(
            (match: { file_path: string; content: string }, index: number) =>
              `--- CONTEXT ${index + 1} | ${match.file_path} ---\n${match.content}`,
          )
          .join("\n\n");

        const systemPrompt = [
          "You are an expert developer assistant embedded in a codebase exploration tool.",
          "Answer the user's question using ONLY the provided code context.",
          "Always cite the file path (in backticks) when explaining code.",
          "If the context does not contain the answer, say so plainly and suggest which part of the repo to inspect next.",
          "Use concise Markdown with fenced code blocks for snippets.",
          "",
          "CODE CONTEXT:",
          context || "(no matching code chunks found)",
        ].join("\n");

        // 3. Stream the answer from the model.
        const upstream = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: CHAT_MODEL,
            stream: true,
            messages: [
              { role: "system", content: systemPrompt },
              ...(body.history ?? []).slice(-6),
              { role: "user", content: question },
            ],
          }),
        });

        if (!upstream.ok || !upstream.body) {
          const text = await upstream.text();
          const message =
            upstream.status === 429
              ? "Rate limit reached. Please try again shortly."
              : upstream.status === 402
                ? "AI credits exhausted. Add credits to continue."
                : `AI request failed [${upstream.status}]: ${text}`;
          return new Response(message, { status: upstream.status });
        }

        // Convert the SSE stream into plain text deltas for the UI.
        const decoder = new TextDecoder();
        const encoder = new TextEncoder();
        let buffer = "";

        const stream = new TransformStream<Uint8Array, Uint8Array>({
          transform(chunk, controller) {
            buffer += decoder.decode(chunk, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";
            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed.startsWith("data:")) continue;
              const payload = trimmed.slice(5).trim();
              if (payload === "[DONE]") continue;
              try {
                const json = JSON.parse(payload) as {
                  choices?: Array<{ delta?: { content?: string } }>;
                };
                const text = json.choices?.[0]?.delta?.content;
                if (text) controller.enqueue(encoder.encode(text));
              } catch {
                // Ignore keep-alive / partial frames.
              }
            }
          },
        });

        return new Response(upstream.body.pipeThrough(stream), {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-cache",
          },
        });
      },
    },
  },
});
