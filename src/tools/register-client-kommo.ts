import { supabase } from "../lib/supabase.js";
import { createContact } from "../kommo/contacts.js";

export interface RegisterClientKommoInput {
  phone: string;
  name: string;
  notes?: string;
}

export interface RegisterClientKommoOutput {
  client: {
    id: string;
    phone: string;
    name: string;
    created_at: string;
    kommoContactId: number;
  };
}

/**
 * Crea el contacto en Kommo y hace dual-write en Supabase clients (sombra).
 */
export async function registerClientKommo(
  input: RegisterClientKommoInput
): Promise<RegisterClientKommoOutput> {
  const contact = await createContact(input.phone, input.name);

  const { data, error } = await supabase
    .from("clients")
    .upsert(
      {
        phone: input.phone,
        name: input.name,
        notes: input.notes ?? "",
      },
      { onConflict: "phone" }
    )
    .select("id, phone, name, created_at")
    .single();

  if (error || !data) {
    throw new Error(`Error registering shadow client: ${error?.message ?? "unknown"}`);
  }

  return {
    client: {
      id: data.id,
      phone: data.phone,
      name: data.name,
      created_at: data.created_at,
      kommoContactId: contact.id,
    },
  };
}
