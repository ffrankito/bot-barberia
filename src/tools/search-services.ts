import { query } from "../lib/db.js";

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
  const rows = input.query
    ? await query<any>(
        `SELECT id, name, description, duration_minutes, price
         FROM services
         WHERE is_active = true AND name ILIKE $1
         ORDER BY name`,
        [`%${input.query}%`]
      )
    : await query<any>(
        `SELECT id, name, description, duration_minutes, price
         FROM services
         WHERE is_active = true
         ORDER BY name`
      );

  return {
    services: rows.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      duration_minutes: s.duration_minutes,
      price: Number(s.price),
    })),
  };
}
