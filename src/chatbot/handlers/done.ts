import type { ConversationContext, HandlerResult } from "../types.js";

export async function handleDone(
  ctx: ConversationContext,
  _message: string
): Promise<HandlerResult> {
  const name = ctx.clientName ?? "";
  return {
    response:
      `¡Hasta luego${name ? `, ${name}` : ""}! ` +
      `Escribime cuando necesites sacar un turno.`,
    newState: "DONE",
  };
}
