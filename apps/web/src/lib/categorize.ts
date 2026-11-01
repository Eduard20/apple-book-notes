import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { db, transaction } from "./db";

const MODEL = process.env.CATEGORIZE_MODEL ?? "claude-opus-5-5";
const BATCH_SIZE = 50;
const CONCURRENCY = 4;
/** Category names are generated in this language, whatever language the highlights are in. */
const CATEGORY_LANGUAGE = process.env.CATEGORY_LANGUAGE ?? "English";

const TaxonomySchema = z.object({
  categories: z.array(z.object({ name: z.string(), description: z.string() })),
});

const AssignmentSchema = z.object({
  assignments: z.array(z.object({ i: z.number().int(), categories: z.array(z.string()) })),
});

interface Row {
  id: string;
  text: string;
  book: string;
}

export function hasCredentials(): boolean {
  return !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

let client: Anthropic | null = null;
const anthropic = () => (client ??= new Anthropic());

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) + "…" : s);

async function ask<T extends z.ZodType>(schema: T, system: string, user: string, effort: "low" | "medium"): Promise<z.infer<T>> {
  const res = await anthropic().beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort, format: zodOutputFormat(schema) },
    system,
    messages: [{ role: "user", content: user }],
  });
  if (res.stop_reason === "refusal") throw new Error("Claude declined this batch");
  if (res.stop_reason === "max_tokens") throw new Error("Response was cut off (max_tokens)");
  if (!res.parsed_output) throw new Error("Could not parse Claude's response");
  return res.parsed_output as z.infer<T>;
}

/** Phase 1: read every highlight once and propose a taxonomy that fits *this* library. */
async function buildTaxonomy(rows: Row[]) {
  const listing = rows.map((r) => `- [${r.book}] ${clip(r.text, 400)}`).join("\n");
  const { categories } = await ask(
    TaxonomySchema,
    `You organize a reader's book highlights into a personal knowledge library.
Propose between 12 and 20 thematic categories that together cover these highlights well.
- Categories are ideas/themes (e.g. "Risk & Uncertainty", "Cognitive Biases"), not books or authors.
- Names: 1-4 words, in ${CATEGORY_LANGUAGE}, even though highlights may be in other languages.
- Each description: one sentence saying what belongs there.
- Avoid overlap; avoid a catch-all "Other"/"Miscellaneous" category.`,
    `Here are all ${rows.length} highlights, each prefixed with its book:\n\n${listing}`,
    "medium",
  );
  const d = db();
  const ins = d.prepare("INSERT INTO categories (name, description) VALUES (?, ?) ON CONFLICT(name) DO NOTHING");
  transaction(() => categories.forEach((c) => ins.run(c.name.trim(), c.description.trim())));
}

/** Phase 2: tag each highlight with 1-3 of the existing categories. */
async function assignBatch(batch: Row[], taxonomy: { id: number; name: string; description: string | null }[]) {
  const catList = taxonomy.map((c) => `- ${c.name}: ${c.description ?? ""}`).join("\n");
  const items = batch.map((r, i) => ({ i, book: r.book, text: clip(r.text, 1200) }));
  const { assignments } = await ask(
    AssignmentSchema,
    `You tag book highlights with categories from a fixed list.
Assign each highlight 1 to 3 categories, most relevant first. Use names exactly as written in the list.
Return one entry per highlight, using its "i" index.

Categories:
${catList}`,
    JSON.stringify(items),
    "low",
  );

  const byName = new Map(taxonomy.map((c) => [c.name.toLowerCase(), c.id]));
  const d = db();
  const del = d.prepare("DELETE FROM highlight_categories WHERE highlight_id = ?");
  const ins = d.prepare("INSERT OR IGNORE INTO highlight_categories (highlight_id, category_id) VALUES (?, ?)");
  const mark = d.prepare("UPDATE highlights SET categorized_at = ? WHERE id = ?");
  const now = new Date().toISOString();
  transaction(() => {
    for (const a of assignments) {
      const row = batch[a.i];
      if (!row) continue;
      const ids = a.categories.map((n) => byName.get(n.trim().toLowerCase())).filter((x): x is number => x != null);
      del.run(row.id);
      for (const id of ids.slice(0, 3)) ins.run(row.id, id);
      mark.run(now, row.id);
    }
  });
}

export interface CategorizeCallbacks {
  onStage(message: string): void;
  onProgress(done: number, total: number): void;
  onWarning(message: string): void;
}

/**
 * Categorize every highlight that hasn't been categorized yet.
 * `rebuild` wipes categories and starts over with a fresh taxonomy.
 */
export async function categorize({ rebuild = false }, cb: CategorizeCallbacks) {
  const d = db();
  if (rebuild) {
    transaction(() => {
      d.exec("DELETE FROM highlight_categories; DELETE FROM categories; UPDATE highlights SET categorized_at = NULL;");
    });
  }

  const pending = d
    .prepare(
      `SELECT h.id, h.text, COALESCE(b.custom_title, b.title) book
       FROM highlights h JOIN books b ON b.id = h.book_id
       WHERE h.removed = 0 AND h.categorized_at IS NULL
       ORDER BY b.id, h.sort_key`,
    )
    .all() as unknown as Row[];
  if (!pending.length) {
    cb.onStage("All highlights already categorized");
    return { categorized: 0 };
  }

  const hasTaxonomy = (d.prepare("SELECT count(*) n FROM categories").get() as { n: number }).n > 0;
  if (!hasTaxonomy) {
    cb.onStage(`Reading all ${pending.length} highlights to design your categories…`);
    await buildTaxonomy(pending);
  }
  const taxonomy = d.prepare("SELECT id, name, description FROM categories").all() as unknown as {
    id: number;
    name: string;
    description: string | null;
  }[];

  const batches: Row[][] = [];
  for (let i = 0; i < pending.length; i += BATCH_SIZE) batches.push(pending.slice(i, i + BATCH_SIZE));

  cb.onStage(`Sorting ${pending.length} highlights into ${taxonomy.length} categories…`);
  let done = 0;
  let failed = 0;
  cb.onProgress(0, pending.length);
  const queue = [...batches];
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      for (let batch = queue.shift(); batch; batch = queue.shift()) {
        try {
          await assignBatch(batch, taxonomy);
        } catch (e) {
          failed += batch.length;
          cb.onWarning(`A batch of ${batch.length} failed (${(e as Error).message}). Run import again to retry.`);
        }
        done += batch.length;
        cb.onProgress(done, pending.length);
      }
    }),
  );
  return { categorized: done - failed };
}
