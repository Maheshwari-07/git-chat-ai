import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const IngestInput = z.object({ url: z.string().min(1) });

export type IngestResult = {
  repoId: string;
  owner: string;
  name: string;
  branch: string;
  fileCount: number;
  chunkCount: number;
};

/**
 * PHASE A — Ingestion.
 * Fetch the repo tree, filter to source files, chunk them, embed the chunks,
 * and store everything in the vector database.
 */
export const ingestRepo = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => IngestInput.parse(input))
  .handler(async ({ data }): Promise<IngestResult> => {
    const { parseRepoUrl, resolveBranch, listSourceFiles, fetchFile, chunkFile } = await import(
      "./github.server"
    );
    const { embedTexts } = await import("./embeddings.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const repo = parseRepoUrl(data.url);
    const branch = await resolveBranch(repo);
    const paths = await listSourceFiles(repo, branch);
    if (paths.length === 0) {
      throw new Error("No supported source files were found in this repository.");
    }

    // Collect chunks across all files.
    const chunks: Array<{ filePath: string; content: string }> = [];
    let fileCount = 0;
    for (const path of paths) {
      const source = await fetchFile(repo, branch, path);
      if (!source || source.trim().length === 0) continue;
      fileCount += 1;
      chunks.push(...chunkFile(path, source));
    }
    if (chunks.length === 0) throw new Error("Repository contained no readable code chunks.");

    // Upsert the repo row and reset any previous ingestion for it.
    const { data: repoRow, error: repoError } = await supabaseAdmin
      .from("repos")
      .upsert(
        {
          url: `https://github.com/${repo.owner}/${repo.name}`,
          owner: repo.owner,
          name: repo.name,
          branch,
          file_count: fileCount,
          chunk_count: chunks.length,
          status: "ready",
        },
        { onConflict: "owner,name,branch" },
      )
      .select("id")
      .single();
    if (repoError || !repoRow) throw new Error(repoError?.message ?? "Could not save repository.");

    await supabaseAdmin.from("documents").delete().eq("repo_id", repoRow.id);

    // Embed + store in batches.
    const BATCH = 80;
    for (let i = 0; i < chunks.length; i += BATCH) {
      const slice = chunks.slice(i, i + BATCH);
      const vectors = await embedTexts(slice.map((chunk) => chunk.content));
      const rows = slice.map((chunk, index) => ({
        repo_id: repoRow.id,
        file_path: chunk.filePath,
        content: chunk.content,
        embedding: JSON.stringify(vectors[index]),
      }));
      const { error: insertError } = await supabaseAdmin.from("documents").insert(rows);
      if (insertError) throw new Error(insertError.message);
    }

    return {
      repoId: repoRow.id,
      owner: repo.owner,
      name: repo.name,
      branch,
      fileCount,
      chunkCount: chunks.length,
    };
  });
