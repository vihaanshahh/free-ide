const customers = [
  { id: "cus_ada", name: "Ada North" },
  { id: "cus_lin", name: "Lin Park" },
];

export function listCustomers() {
  return { items: customers };
}

export default listCustomers;
