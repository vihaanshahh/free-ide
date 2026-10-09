export function listPayments() {
  return { items: [] as Array<{ id: string; invoiceId: string }> };
}

export default listPayments;
