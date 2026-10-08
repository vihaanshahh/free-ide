import { db, type Invoice } from "../db/client.ts";

export interface InvoiceQuery {
  status?: Invoice["status"];
  limit?: number;
  cursor?: string;
}

export async function listInvoices(query: InvoiceQuery = {}) {
  const rows = await db.invoice.findMany();
  const filtered = query.status ? rows.filter((row) => row.status === query.status) : rows;
  return { items: filtered };
}

export default listInvoices;
