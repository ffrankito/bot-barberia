import { supabase } from "../lib/supabase.js";
import { findContactByPhone } from "../kommo/contacts.js";

export interface GetClientKommoInput {
  phone: string; // E.164
}

export interface GetClientKommoOutput {
  found: boolean;
  client?: {
    id: string;
    phone: string;
    name: string;
    kommoContactId: number;
  };
}

/**
 * Kommo es la fuente de verdad para contactos.
 * Supabase "clients" es una tabla sombra para mantener el FK de appointments.
 */
export async function getClientKommo(input: GetClientKommoInput): Promise<GetClientKommoOutput> {
  const contact = await findContactByPhone(input.phone);
  if (!contact) return { found: false };

  const { data, error } = await supabase
    .from("clients")
    .upsert(
      {
        phone: input.phone,
        name: contact.name || "Cliente",
        notes: "",
      },
      { onConflict: "phone" }
    )
    .select("id, phone, name")
    .single();

  if (error || !data) {
    throw new Error(`Error upsert client shadow: ${error?.message ?? "unknown"}`);
  }

  return {
    found: true,
    client: {
      id: data.id,
      phone: data.phone,
      name: data.name,
      kommoContactId: contact.id,
    },
  };
}
