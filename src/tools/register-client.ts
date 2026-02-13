import { supabase } from "../lib/supabase.js";

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
  const { data, error } = await supabase
    .from("clients")
    .insert({
      phone: input.phone,
      name: input.name,
      notes: input.notes ?? "",
    })
    .select("id, phone, name, created_at")
    .single();

  if (error) {
    throw new Error(`Error registering client: ${error.message}`);
  }

  return {
    client: {
      id: data.id,
      phone: data.phone,
      name: data.name,
      created_at: data.created_at,
    },
  };
}
