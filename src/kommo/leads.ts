import { kommoRequest } from "./client.js";

export interface CreateLeadInput {
  contactId: number;
  serviceName: string;
  appointmentDate: string; // string para mostrar en el nombre
  price?: number;
}

export async function createLead(input: CreateLeadInput): Promise<number> {
  const pipelineId = Number(process.env.KOMMO_PIPELINE_ID);
  const stageId = Number(process.env.KOMMO_INITIAL_STAGE_ID);

  if (!Number.isFinite(pipelineId) || !Number.isFinite(stageId)) {
    throw new Error("KOMMO_PIPELINE_ID/KOMMO_INITIAL_STAGE_ID inválidos");
  }

  const body = [
    {
      name: `Turno: ${input.serviceName} - ${input.appointmentDate}`,
      price: input.price ?? 0,
      pipeline_id: pipelineId,
      status_id: stageId,
      _embedded: {
        contacts: [{ id: input.contactId, is_main: true }],
      },
    },
  ];

  const res = await kommoRequest<any>({ method: "POST", path: "/leads", body });
  const created = res?._embedded?.leads?.[0];
  if (!created?.id) throw new Error("Kommo: no se pudo crear el lead (respuesta inesperada)");
  return Number(created.id);
}

export async function updateLeadStage(leadId: number, stageId: number): Promise<void> {
  await kommoRequest<any>({
    method: "PATCH",
    path: `/leads/${leadId}`,
    body: { status_id: stageId },
  });
}
