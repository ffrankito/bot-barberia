import { queryOne } from "../lib/db.js";

export interface GetClientInput {
  phone: string; // E.164
}

export interface GetClientOutput {
  found: boolean;
  client?: {
    id: string;
    phone: string;
    name: string;
    notes: string;
  };
}

export async function getClient(input: GetClientInput): Promise<GetClientOutput> {
  const client = await queryOne<{ id: string; phone: string; name: string; notes: string }>(
    `SELECT id, phone, name, notes FROM clients WHERE phone = $1`,
    [input.phone]
  );

  if (!client) {
    return { found: false };
  }

  return { found: true, client };
}
