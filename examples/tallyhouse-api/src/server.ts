import customers from "./routes/customers.ts";
import invoices from "./routes/invoices.ts";
import payments from "./routes/payments.ts";

export const routes = {
  "/invoices": invoices,
  "/customers": customers,
  "/payments": payments,
};
