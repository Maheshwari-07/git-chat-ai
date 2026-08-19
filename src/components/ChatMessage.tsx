import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export type ChatRole = "user" | "assistant";

export type ChatMessageData = {
  id: string;
  role: ChatRole;
  content: string;
};

/** Renders a single chat bubble; assistant output is rendered as Markdown. */
export function ChatMessage({ message }: { message: ChatMessageData }) {
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-secondary px-4 py-3 text-sm text-secondary-foreground">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3">
      <div className="mt-1 flex size-7 shrink-0 items-center justify-center rounded-md border border-border bg-card font-mono text-[11px] text-primary">
        AI
      </div>
      <div className="markdown min-w-0 flex-1 text-sm leading-relaxed text-foreground/90">
        {message.content ? (
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
              ul: ({ children }) => (
                <ul className="mb-3 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>
              ),
              ol: ({ children }) => (
                <ol className="mb-3 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>
              ),
              a: ({ children, href }) => (
                <a href={href} className="text-primary underline underline-offset-4">
                  {children}
                </a>
              ),
              h1: ({ children }) => <h3 className="mb-2 text-base font-semibold">{children}</h3>,
              h2: ({ children }) => <h3 className="mb-2 text-base font-semibold">{children}</h3>,
              h3: ({ children }) => <h4 className="mb-2 text-sm font-semibold">{children}</h4>,
              code: ({ className, children }) => {
                const isBlock = Boolean(className);
                if (!isBlock) {
                  return (
                    <code className="rounded border border-border bg-secondary px-1.5 py-0.5 font-mono text-[12.5px] text-primary">
                      {children}
                    </code>
                  );
                }
                return <code className="font-mono text-[12.5px]">{children}</code>;
              },
              pre: ({ children }) => (
                <pre className="mb-3 overflow-x-auto rounded-lg border border-border bg-background/70 p-4 last:mb-0">
                  {children}
                </pre>
              ),
            }}
          >
            {message.content}
          </ReactMarkdown>
        ) : (
          <span className="inline-flex gap-1">
            <span className="size-1.5 animate-bounce rounded-full bg-primary [animation-delay:-0.2s]" />
            <span className="size-1.5 animate-bounce rounded-full bg-primary [animation-delay:-0.1s]" />
            <span className="size-1.5 animate-bounce rounded-full bg-primary" />
          </span>
        )}
      </div>
    </div>
  );
}
