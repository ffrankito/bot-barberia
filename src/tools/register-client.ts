import { queryOne } from "../lib/db.js";

export interface RegisterClientInput {
  phone: string;
  name: string;
  notes?: string;
}

export interface RegisterClientOutput {
  client: {
    id: string;
    phone: string;
    name: string;
    created_at: string;
  };
}

export async function registerClient(input: RegisterClientInput): Promise<RegisterClientOutput> {
  const client = await queryOne<{ id: string; phone: string; name: string; created_at: string }>(
    `INSERT INTO clients (phone, name, notes) VALUES ($1, $2, $3)
     RETURNING id, phone, name, created_at`,
    [input.phone, input.name, input.notes ?? ""]
  );

  if (!client) {
    throw new Error("Error registering client");
  }

  return { client };
}
