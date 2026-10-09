export interface Invoice {
  id: string;
  status: "draft" | "sent" | "paid";
  createdAt: string;
  totalCents: number;
}

const invoices: Invoice[] = [
  { id: "inv_18", status: "paid", createdAt: "2026-09-02", totalCents: 12800 },
  { id: "inv_19", status: "sent", createdAt: "2026-09-18", totalCents: 6400 },
  { id: "inv_20", status: "draft", createdAt: "2026-10-01", totalCents: 2400 },
];

export const db = {
  invoice: {
    async findMany(): Promise<Invoice[]> {
      return invoices;
    },
  },
};
