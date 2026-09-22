export function updateRejection(status: string, nextStatus: string): string | null {
  if (status === "completed") return "Cannot update a completed work order";
  if (!["open", "in_progress"].includes(nextStatus))
    return "Use the completion endpoint to complete a work order";
  return null;
}
