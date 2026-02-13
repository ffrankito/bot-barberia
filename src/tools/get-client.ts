import { supabase } from "../lib/supabase.js";

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
  const { data, error } = await supabase
    .from("clients")
    .select("id, phone, name, notes")
    .eq("phone", input.phone)
    .maybeSingle();

  if (error) {
    throw new Error(`Error fetching client: ${error.message}`);
  }

  if (!data) {
    return { found: false };
  }

  return {
    found: true,
    client: {
      id: data.id,
      phone: data.phone,
      name: data.name,
      notes: data.notes,
    },
  };
}
