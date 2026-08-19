import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";

import { ChatMessage, type ChatMessageData } from "@/components/ChatMessage";
import { ingestRepo, type IngestResult } from "@/lib/repochat.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "RepoChat — The Codebase RAG Engine" },
      {
        name: "description",
        content:
          "Paste a public GitHub repo, sync it, and chat with an AI that answers from the actual source files.",
      },
      { property: "og:title", content: "RepoChat — The Codebase RAG Engine" },
      {
        property: "og:description",
        content: "Sync any public GitHub repository and ask how the code works, with file-level citations.",
      },
    ],
  }),
  component: RepoChat,
});

const SUGGESTIONS = [
  "What does this project do, at a high level?",
  "Where is the routing configured?",
  "How is state managed in this codebase?",
  "Which files handle API calls?",
];

function RepoChat() {
  const ingest = useServerFn(ingestRepo);

  // Ingestion state
  const [url, setUrl] = useState("");
  const [repo, setRepo] = useState<IngestResult | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStage, setSyncStage] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Chat state
  const [messages, setMessages] = useState<ChatMessageData[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  // Rotating feedback while the (long) ingestion runs.
  useEffect(() => {
    if (!isSyncing) return;
    const stages = [
      "Fetching repository tree…",
      "Filtering source files…",
      "Chunking code blocks…",
      "Generating embeddings…",
      "Indexing vectors…",
    ];
    let index = 0;
    setSyncStage(stages[0]!);
    const timer = setInterval(() => {
      index = Math.min(index + 1, stages.length - 1);
      setSyncStage(stages[index]!);
    }, 2600);
    return () => clearInterval(timer);
  }, [isSyncing]);

  async function handleSync(event: React.FormEvent) {
    event.preventDefault();
    if (!url.trim() || isSyncing) return;
    setError(null);
    setIsSyncing(true);
    try {
      const result = await ingest({ data: { url: url.trim() } });
      setRepo(result);
      setMessages([]);
    } catch (caught) {
      setError((caught as Error).message || "Ingestion failed. Please try another repository.");
    } finally {
      setIsSyncing(false);
    }
  }

  async function ask(question: string) {
    if (!repo || !question.trim() || isStreaming) return;
    setError(null);
    setInput("");

    const userMessage: ChatMessageData = {
      id: crypto.randomUUID(),
      role: "user",
      content: question.trim(),
    };
    const assistantId = crypto.randomUUID();
    const history = messages.map((message) => ({ role: message.role, content: message.content }));

    setMessages((prev) => [...prev, userMessage, { id: assistantId, role: "assistant", content: "" }]);
    setIsStreaming(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoId: repo.repoId, question: question.trim(), history }),
      });

      if (!response.ok || !response.body) {
        throw new Error((await response.text()) || "The assistant could not answer.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let answer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        answer += decoder.decode(value, { stream: true });
        setMessages((prev) =>
          prev.map((message) => (message.id === assistantId ? { ...message, content: answer } : message)),
        );
      }
    } catch (caught) {
      const message = (caught as Error).message;
      setError(message);
      setMessages((prev) => prev.filter((entry) => entry.id !== assistantId));
    } finally {
      setIsStreaming(false);
    }
  }

  return (
    <main className="min-h-screen">
      <header className="border-b border-border/70">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-md border border-border bg-card font-mono text-xs text-primary">
              {"</>"}
            </span>
            <span className="text-sm font-semibold tracking-tight">RepoChat</span>
            <span className="hidden font-mono text-[11px] text-muted-foreground sm:inline">
              codebase RAG engine
            </span>
          </div>
          {repo ? (
            <button
              onClick={() => {
                setRepo(null);
                setMessages([]);
                setUrl("");
              }}
              className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              Sync another repo
            </button>
          ) : null}
        </div>
      </header>

      {!repo ? (
        <section className="mx-auto flex max-w-3xl flex-col items-center px-6 pt-24 pb-16 text-center">
          <span className="mb-6 rounded-full border border-border bg-card px-3 py-1 font-mono text-[11px] text-muted-foreground">
            retrieval-augmented · vector search · streaming answers
          </span>
          <h1 className="text-gradient-hero text-5xl font-semibold tracking-tight sm:text-6xl">
            Chat with any codebase.
          </h1>
          <p className="mt-5 max-w-xl text-base text-muted-foreground">
            Paste a public GitHub repository. RepoChat ingests the source, embeds it into a vector index, and
            answers your questions with citations to the exact files.
          </p>

          <form onSubmit={handleSync} className="panel mt-10 w-full max-w-xl p-2">
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                disabled={isSyncing}
                placeholder="https://github.com/owner/repository"
                className="min-w-0 flex-1 rounded-lg bg-transparent px-4 py-3 font-mono text-sm text-foreground outline-none placeholder:text-muted-foreground/70 disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={isSyncing || !url.trim()}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSyncing ? (
                  <span className="size-4 animate-spin rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground" />
                ) : null}
                {isSyncing ? "Syncing" : "Sync & Ingest"}
              </button>
            </div>
          </form>

          {isSyncing ? (
            <p className="mt-5 font-mono text-xs text-muted-foreground">{syncStage}</p>
          ) : null}
          {error ? (
            <p className="mt-5 max-w-xl rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-left text-xs text-destructive">
              {error}
            </p>
          ) : null}

          <div className="mt-16 grid w-full gap-4 text-left sm:grid-cols-3">
            {[
              ["01 · Ingest", "Repo tree is fetched, non-code files filtered out, and code split into logical blocks."],
              ["02 · Embed", "Every chunk becomes a vector stored alongside its file path in Postgres + pgvector."],
              ["03 · Answer", "Your question retrieves the top matches and grounds a streaming AI response."],
            ].map(([title, body]) => (
              <div key={title} className="panel p-5">
                <p className="font-mono text-[11px] text-primary">{title}</p>
                <p className="mt-2 text-sm text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>
        </section>
      ) : (
        <section className="mx-auto grid max-w-6xl gap-6 px-6 py-8 lg:grid-cols-[280px_1fr]">
          <aside className="panel h-fit p-5">
            <p className="font-mono text-[11px] text-muted-foreground">REPOSITORY</p>
            <p className="mt-1 truncate font-mono text-sm text-foreground">
              {repo.owner}/{repo.name}
            </p>
            <dl className="mt-5 space-y-3 text-xs">
              {[
                ["Branch", repo.branch],
                ["Files indexed", String(repo.fileCount)],
                ["Chunks embedded", String(repo.chunkCount)],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="truncate font-mono text-foreground">{value}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-6 border-t border-border pt-4">
              <p className="font-mono text-[11px] text-muted-foreground">TRY ASKING</p>
              <div className="mt-3 space-y-2">
                {SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => ask(suggestion)}
                    disabled={isStreaming}
                    className="w-full rounded-lg border border-border px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          </aside>

          <div className="panel flex h-[calc(100vh-9rem)] flex-col">
            <div ref={scrollRef} className="flex-1 space-y-6 overflow-y-auto p-6">
              {messages.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center text-center">
                  <p className="text-lg font-medium">Ask anything about this repository</p>
                  <p className="mt-2 max-w-sm text-sm text-muted-foreground">
                    Answers are grounded in the indexed source files and cite the paths they came from.
                  </p>
                </div>
              ) : (
                messages.map((message) => <ChatMessage key={message.id} message={message} />)
              )}
            </div>

            {error ? (
              <p className="mx-6 mb-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2 text-xs text-destructive">
                {error}
              </p>
            ) : null}

            <form
              onSubmit={(event) => {
                event.preventDefault();
                void ask(input);
              }}
              className="flex items-center gap-2 border-t border-border p-4"
            >
              <input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                disabled={isStreaming}
                placeholder="How does authentication work in this repo?"
                className="min-w-0 flex-1 rounded-lg border border-border bg-background px-4 py-3 text-sm outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-primary/60 disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={isStreaming || !input.trim()}
                className="rounded-lg bg-primary px-5 py-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isStreaming ? "Thinking…" : "Send"}
              </button>
            </form>
          </div>
        </section>
      )}
    </main>
  );
}
