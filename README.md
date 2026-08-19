# Code Navigator AI

Act as a Staff-Level Full-Stack Engineer and UI/UX Expert. 

I am building a high-impact, resume-worthy project called "RepoChat: The Codebase RAG Engine." This application allows developers to paste a public GitHub repository URL, ingest the codebase, and chat with an AI to understand how the code works, where specific logic lives, and how it is structured.

I need you to write the complete, production-ready code for this project.

=========================================

1. TECHNOLOGY STACK & CONSTRAINTS

=========================================

- Framework: Next.js (App Router)

- Language: Strictly JavaScript (ES6+). DO NOT use TypeScript.

- Styling: Tailwind CSS

- AI Models: Gemini API (Gemini text-embedding model for vectors, and Gemini 1.5 Flash/Pro for text generation).

- Database: Supabase (PostgreSQL with the `pgvector` extension).

- Deployment Target: Vercel.

=========================================

2. PRODUCT VISION & UI/UX SPECIFICATIONS

=========================================

The application must look like a premium developer tool (e.g., Vercel, Linear, or Stripe). 

- Theme: Strict Dark Mode UI. Use slate/zinc color palettes (e.g., bg-zinc-950, text-zinc-300, borders in zinc-800).

- Typography: Clean sans-serif (Inter or system UI) for standard text, and monospace for any code snippets or file paths.

- Layout: 

  - A sleek, minimalist landing view with a bold hero headline.

  - A central input field for the GitHub URL and a "Sync & Ingest" button.

  - A loading state that provides visual feedback while the repository is being processed.

  - Once synced, the UI transitions to a two-column or focused chat interface. The chat must look like a modern messaging app, distinguishing clearly between the "User Query" and the "AI Response." 

  - AI responses must render Markdown properly, especially code blocks.

=========================================

3. BACKEND ARCHITECTURE & BUSINESS LOGIC

=========================================

The application operates in two distinct phases. You must implement the logic for both:

PHASE A: INGESTION (The /api/ingest Route)

1. Fetch: Accept a GitHub URL from the frontend. Use the GitHub REST API to fetch the repository tree. 

2. Filter: Ignore non-code files (e.g., images, .git, node_modules, dist, build, .env). Only process files like .js, .jsx, .py, .md, .html, .css.

3. Chunk: Break the fetched files into logical text chunks. (Do not just split arbitrarily by character count; try to keep functions/blocks together).

4. Embed: Send these code chunks to the Gemini API to generate vector embeddings.

5. Store: Insert the raw text chunk, the file path, and the embedding vector into the Supabase database.

PHASE B: RETRIEVAL & GENERATION (The /api/chat Route)

1. Receive Query: Accept the user's natural language question from the chat UI.

2. Embed Query: Convert the user's question into a vector using the Gemini embedding API.

3. Search: Perform a semantic similarity search in Supabase using a PostgreSQL function (cosine similarity) to find the top 5 most relevant code chunks.

4. Augment Prompt: Construct a strict System Prompt for the Gemini chat model. Inject the 5 retrieved code chunks into the prompt as "Context." Instruct the model: "You are an expert developer assistant. Answer the user's question using ONLY the provided code context. Always cite the file path when explaining code."

5. Stream: Stream the Gemini response back to the frontend UI for a real-time typing effect.

=========================================

4. YOUR REQUIRED OUTPUT

=========================================

Please generate the complete project step-by-step. Provide the code in the following order:

STEP 1: Database Setup

- Provide the exact SQL commands to run in the Supabase SQL Editor to enable `pgvector`, create the `documents` table, and create the `match_documents` RPC function for similarity search.

STEP 2: Project Setup & Config

- The Next.js folder structure.

- Tailwind config and any global CSS updates for the dark mode aesthetic.

- `.env.local` example file with the required keys (Gemini API, Supabase URL, Supabase Service Key).

STEP 3: The Backend (Route Handlers)

- The Supabase client initialization.

- Code for `app/api/ingest/route.js`.

- Code for `app/api/chat/route.js`.

STEP 4: The Frontend (React Components)

- The main `app/page.js` combining the URL input and the Chat Interface.

- Provide all necessary state management (useState) to handle loading spinners, error messages, and the chat message array.

Take a deep breath and ensure the code is clean, well-commented, and ready to be deployed on Vercel.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/9eaffd90-5e57-409a-8072-4879ef3e2e95).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
