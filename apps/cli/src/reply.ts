import type { Paint } from "./style.ts";

const PAGINATION = `Added cursor pagination to listInvoices.
Default 20, clamp at 100, and nextCursor only when another row exists.

src/routes/invoices.ts
--- a/src/routes/invoices.ts
+++ b/src/routes/invoices.ts
@@ listInvoices @@
-  return { items: filtered };
+  const limit = Math.min(query.limit ?? 20, 100);
+  const at = query.cursor ? findIndex(filtered, query.cursor) + 1 : 0;
+  const start = Math.max(at, 0);
+  const page = filtered.slice(start, start + limit + 1);
+  const hasMore = page.length > limit;
+  const items = hasMore ? page.slice(0, limit) : page;
+  return { items, nextCursor: hasMore ? items.at(-1)?.id ?? null : null };`;

const GENERAL = `I can help with that in the workspace.

Keep the change small: one function, a test beside it, and no new dependency unless the standard library cannot do it.`;

export function mockReply(prompt: string): string {
  if (/paginat|cursor|invoice/i.test(prompt)) return PAGINATION;
  return GENERAL;
}

export function estimateTokens(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return Math.max(1, Math.ceil(trimmed.length / 4));
}

export function colorizeReply(text: string, p: Paint): string {
  if (!p.enabled) return text;
  return text
    .split("\n")
    .map((line) => {
      if (line.startsWith("+")) return p.moss(line);
      if (line.startsWith("-")) return p.clay(line);
      if (line.startsWith("@@") || line.startsWith("---") || line.startsWith("+++")) return p.sage(line);
      if (line.endsWith(".ts") || line.endsWith(".tsx")) return p.bold(p.cream(line));
      return p.cream(line);
    })
    .join("\n");
}
