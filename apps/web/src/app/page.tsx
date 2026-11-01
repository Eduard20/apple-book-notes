import { Suspense } from "react";
import Link from "next/link";
import { getStats, listBooks, listCategories, listColors, listHighlights } from "@/lib/queries";
import { parseFilters } from "@/lib/filters";
import { COLOR_SWATCH, type HighlightColor } from "@/lib/types";
import { ImportButton } from "@/components/ImportButton";
import { SearchBox } from "@/components/SearchBox";
import { FavoriteButton } from "@/components/FavoriteButton";
import { BookTitleEditor } from "@/components/BookTitleEditor";

type SP = Record<string, string | string[] | undefined>;
const PAGE_SIZE = 50;

/** Build a URL from the current params, applying a patch (undefined = remove). */
function href(sp: SP, patch: Record<string, string | undefined>) {
  const next = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (typeof v === "string" && k !== "offset") next.set(k, v);
  for (const [k, v] of Object.entries(patch)) (v === undefined ? next.delete(k) : next.set(k, v));
  const s = next.toString();
  return s ? `/?${s}` : "/";
}

export default function Page({ searchParams }: PageProps<"/">) {
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-8">
      <Suspense fallback={<Header.Skeleton />}>
        <Header />
      </Suspense>
      <Suspense fallback={<p className="text-sm text-neutral-500">Loading…</p>}>
        <Body searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Header() {
  const s = await getStats();
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Book Notes</h1>
        <p className="mt-1 text-sm text-neutral-500">
          {s.highlights} highlights · {s.books} books · {s.categories} categories
          {s.uncategorized > 0 && s.highlights > 0 && ` · ${s.uncategorized} uncategorized`}
          {s.lastImportAt && ` · imported ${new Date(s.lastImportAt).toLocaleString()}`}
        </p>
        {process.env.ABN_LAN_ADDRESS && (
          <p className="mt-1 text-xs text-neutral-400">
            iPhone sync address: <code className="rounded bg-neutral-200/70 px-1.5 py-0.5 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">{process.env.ABN_LAN_ADDRESS}</code>
          </p>
        )}
      </div>
      <ImportButton hasCategories={s.categories > 0} />
    </header>
  );
}
Header.Skeleton = function HeaderSkeleton() {
  return <div className="h-14" />;
};

async function Body({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const filters = parseFilters(sp);
  const offset = filters.offset ?? 0;
  const [stats, books, categories, colorCounts, { total, items }] = await Promise.all([
    getStats(),
    listBooks(),
    listCategories(),
    listColors(),
    listHighlights({ ...filters, limit: PAGE_SIZE, offset }),
  ]);

  if (stats.highlights === 0) {
    return (
      <div className="rounded-xl border border-dashed border-neutral-300 p-16 text-center dark:border-neutral-700">
        <p className="text-lg font-medium">No highlights yet</p>
        <p className="mt-1 text-sm text-neutral-500">
          Click <b>Import from Apple Books</b> to pull in all your highlights and sort them into categories.
        </p>
      </div>
    );
  }

  const activeBook = books.find((b) => b.id === filters.bookId);
  const activeCategory = categories.find((c) => c.id === filters.categoryId);
  
  return (
    <div className="grid grid-cols-1 gap-8 md:grid-cols-[260px_1fr]">
      <aside className="flex flex-col gap-6 text-sm md:sticky md:top-6 md:max-h-[calc(100vh-3rem)] md:overflow-y-auto">
        <Section title="Library">
          <NavLink href={href(sp, { favorite: undefined, uncategorized: undefined, category: undefined, book: undefined, color: undefined })} active={!filters.favorite && !filters.uncategorized && !filters.categoryId && !filters.bookId && !filters.color} count={stats.highlights}>
            All highlights
          </NavLink>
          <NavLink href={href(sp, { favorite: filters.favorite ? undefined : "1" })} active={!!filters.favorite} count={stats.favorites}>
            ★ Favorites
          </NavLink>
          {stats.uncategorized > 0 && (
            <NavLink href={href(sp, { uncategorized: filters.uncategorized ? undefined : "1" })} active={!!filters.uncategorized} count={stats.uncategorized}>
              Uncategorized
            </NavLink>
          )}
        </Section>

        {categories.length > 0 && (
          <Section title="Categories">
            {categories.map((c) => (
              <NavLink
                key={c.id}
                href={href(sp, { category: filters.categoryId === c.id ? undefined : String(c.id) })}
                active={filters.categoryId === c.id}
                count={c.highlightCount}
                title={c.description ?? undefined}
              >
                {c.name}
              </NavLink>
            ))}
          </Section>
        )}

        <Section title="Colors">
          <div className="flex flex-wrap gap-2 px-2">
            {Object.entries(colorCounts).map(([color, n]) => (
              <Link
                key={color}
                href={href(sp, { color: filters.color === color ? undefined : color })}
                title={`${color} (${n})`}
                className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${filters.color === color ? "border-neutral-900 dark:border-white" : "border-transparent hover:border-neutral-300"}`}
              >
                <span className="h-3 w-3 rounded-full" style={{ background: COLOR_SWATCH[color as HighlightColor] }} />
                {n}
              </Link>
            ))}
          </div>
        </Section>

        <Section title="Books">
          {books.map((b) => (
            <NavLink key={b.id} href={href(sp, { book: filters.bookId === b.id ? undefined : b.id })} active={filters.bookId === b.id} count={b.highlightCount}>
              <span className={b.inLibrary ? "" : "italic text-neutral-400"}>{b.title}</span>
            </NavLink>
          ))}
        </Section>
      </aside>

      <main className="flex min-w-0 flex-col gap-4">
        <SearchBox />

        <div className="flex flex-wrap items-center justify-between gap-2">
          {activeBook ? (
            <BookTitleEditor key={activeBook.id} id={activeBook.id} title={activeBook.title} author={activeBook.author} />
          ) : activeCategory ? (
            <div>
              <h2 className="text-xl font-semibold">{activeCategory.name}</h2>
              {activeCategory.description && <p className="text-sm text-neutral-500">{activeCategory.description}</p>}
            </div>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-3 text-xs text-neutral-500">
            <span>{total} results</span>
            {(["book", "newest", "oldest"] as const).map((s) => (
              <Link key={s} href={href(sp, { sort: s === "book" ? undefined : s })} className={filters.sort === s ? "font-semibold text-neutral-900 dark:text-white" : "hover:text-neutral-800"}>
                {s === "book" ? "by book" : s}
              </Link>
            ))}
          </div>
        </div>

        <ul className="flex flex-col gap-3">
          {items.map((h) => (
            <li key={h.id} className="rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
              <div className="flex gap-4">
                <span className="mt-1 w-1 shrink-0 self-stretch rounded-full" style={{ background: COLOR_SWATCH[h.color] }} />
                <div className="min-w-0 flex-1">
                  <p className="whitespace-pre-line leading-relaxed">{h.text}</p>
                  {h.note && <p className="mt-2 rounded bg-neutral-100 px-3 py-2 text-sm dark:bg-neutral-800">📝 {h.note}</p>}
                  <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500">
                    <Link href={href(sp, { book: h.book.id })} className="font-medium hover:text-neutral-900 dark:hover:text-white">
                      {h.book.title}
                    </Link>
                    {h.book.author && <span>{h.book.author}</span>}
                    {h.chapter && <span>· {h.chapter}</span>}
                    {h.createdAt && <span>· {new Date(h.createdAt).toLocaleDateString()}</span>}
                    {h.categories.map((c) => (
                      <Link key={c.id} href={href(sp, { category: String(c.id) })} className="rounded-full bg-neutral-100 px-2 py-0.5 text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300">
                        {c.name}
                      </Link>
                    ))}
                  </div>
                </div>
                <FavoriteButton id={h.id} favorite={h.favorite} />
              </div>
            </li>
          ))}
        </ul>

        {total > PAGE_SIZE && (
          <nav className="flex items-center justify-center gap-4 text-sm">
            {offset > 0 && <Link href={href(sp, { offset: String(Math.max(0, offset - PAGE_SIZE)) })}>← Prev</Link>}
            <span className="text-neutral-500">
              {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}
            </span>
            {offset + PAGE_SIZE < total && <Link href={href(sp, { offset: String(offset + PAGE_SIZE) })}>Next →</Link>}
          </nav>
        )}
      </main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <h3 className="mb-1 px-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">{title}</h3>
      {children}
    </div>
  );
}

function NavLink({ href, active, count, title, children }: { href: string; active: boolean; count: number; title?: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      title={title}
      className={`flex items-center justify-between gap-2 rounded-md px-2 py-1.5 ${active ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900" : "hover:bg-neutral-200/60 dark:hover:bg-neutral-800"}`}
    >
      <span className="truncate">{children}</span>
      <span className={`shrink-0 text-xs ${active ? "opacity-70" : "text-neutral-400"}`}>{count}</span>
    </Link>
  );
}
