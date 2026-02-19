import { supabase } from "../lib/supabase.js";

export interface SearchServicesInput {
  query?: string;
}

export interface ServiceItem {
  id: string;
  name: string;
  description: string;
  duration_minutes: number;
  price: number;
}

export interface SearchServicesOutput {
  services: ServiceItem[];
}

export async function searchServices(input: SearchServicesInput): Promise<SearchServicesOutput> {
  let query = supabase
    .from("services")
    .select("id, name, description, duration_minutes, price")
    .eq("is_active", true)
    .order("name");

  if (input.query) {
    query = query.ilike("name", `%${input.query}%`);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Error searching services: ${error.message}`);
  }

  return {
    services: (data ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      duration_minutes: s.duration_minutes,
      price: Number(s.price),
    })),
  };
}
