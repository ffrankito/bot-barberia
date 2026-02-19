import type { KommoContact } from "../chatbot/types.js";
import { kommoRequest } from "./client.js";

type KommoContactApi = {
  id: number;
  name: string;
  custom_fields_values?: Array<{
    field_code?: string;
    values?: Array<{ value?: string }>;
  }>;
};

function extractPhone(c: KommoContactApi): string {
  const phoneField = (c.custom_fields_values ?? []).find((f) => f.field_code === "PHONE");
  const value = phoneField?.values?.[0]?.value;
  return value ? String(value) : "";
}

export async function findContactByPhone(phone: string): Promise<KommoContact | null> {
  const res = await kommoRequest<any>({
    method: "GET",
    path: "/contacts",
    query: { query: phone },
  });

  const contacts: KommoContactApi[] = res?._embedded?.contacts ?? [];
  if (!contacts.length) return null;

  // Prefer exact phone match if possible
  const exact = contacts.find((c) => extractPhone(c) === phone) ?? contacts[0];
  return {
    id: exact.id,
    name: exact.name,
    phone: extractPhone(exact) || phone,
  };
}

export async function createContact(phone: string, name: string): Promise<KommoContact> {
  const body = [
    {
      name,
      custom_fields_values: [
        {
          field_code: "PHONE",
          values: [{ value: phone, enum_code: "MOB" }],
        },
      ],
    },
  ];

  const res = await kommoRequest<any>({
    method: "POST",
    path: "/contacts",
    body,
  });

  const created: KommoContactApi | undefined = res?._embedded?.contacts?.[0];
  if (!created) {
    throw new Error("Kommo: no se pudo crear el contacto (respuesta inesperada)");
  }

  return { id: created.id, name: created.name, phone };
}

export async function updateContact(contactId: number, name: string): Promise<void> {
  await kommoRequest<any>({
    method: "PATCH",
    path: `/contacts/${contactId}`,
    body: { name },
  });
}
