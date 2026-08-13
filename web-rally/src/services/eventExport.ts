import { useUserStore } from "@/stores/useUserStore";

/**
 * Download an event's results as an .xlsx workbook.
 *
 * The results export is a binary endpoint, which the generated fetch client
 * does not model cleanly. We call it directly with the staff token (admin-only
 * route) and stream the response into a browser download, mirroring the raw
 * fetch used for team-token refresh.
 */
export async function downloadEventResults(eventId: number, eventName: string): Promise<void> {
  const token = useUserStore.getState().token;
  if (!token) {
    throw new Error("Sessão de administrador necessária");
  }

  // Relative path — see client.ts's refreshTeamToken for why config.BASE_URL
  // (a bare "http://localhost" with no port) is wrong here.
  const response = await fetch(`/api/rally/v1/events/${eventId}/export`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error(`Falha ao exportar resultados (${response.status})`);
  }

  const blob = await response.blob();
  const safeName =
    eventName
      .replace(/[^\p{L}\p{N}_-]/gu, "_")
      .replace(/_{2,}/g, "_")
      .replace(/^_|_$/g, "") || "evento";
  triggerDownload(blob, `${safeName}_resultados.xlsx`);
}

/**
 * Download an event's final report as a .pdf — ranking, per-checkpoint
 * detail, captured photos, event stats. Same binary-download rationale as
 * `downloadEventResults` above.
 */
export async function downloadEventReport(eventId: number, eventName: string): Promise<void> {
  const token = useUserStore.getState().token;
  if (!token) {
    throw new Error("Sessão de administrador necessária");
  }

  const response = await fetch(`/api/rally/v1/events/${eventId}/report`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error(`Falha ao gerar relatório (${response.status})`);
  }

  const blob = await response.blob();
  const safeName =
    eventName
      .replace(/[^\p{L}\p{N}_-]/gu, "_")
      .replace(/_{2,}/g, "_")
      .replace(/^_|_$/g, "") || "evento";
  triggerDownload(blob, `${safeName}_relatorio.pdf`);
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
