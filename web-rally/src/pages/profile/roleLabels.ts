/**
 * Human labels for the identity-provider groups a user can hold. Raw group ids
 * ("rally-participant") mean nothing to a participant, and groups outside the
 * rally are irrelevant here, so anything unknown is left out.
 */
const ROLE_LABELS: Readonly<Record<string, string>> = {
  admin: "Administrador",
  "manager-rally": "Gestor",
  "rally-staff": "Staff",
  "rally-guide": "Guia",
  "rally-participant": "Participante",
};

export function roleLabels(scopes: readonly string[]): string[] {
  const labels = scopes.map((s) => ROLE_LABELS[s]).filter((l): l is string => Boolean(l));
  return [...new Set(labels)];
}
