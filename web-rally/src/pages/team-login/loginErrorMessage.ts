const INVALID_CODE_MESSAGE = "Código de acesso inválido. Confirma o código e tenta outra vez.";
const RATE_LIMITED_MESSAGE = "Demasiadas tentativas. Espera um pouco e tenta outra vez.";
const GENERIC_LOGIN_MESSAGE = "Não foi possível entrar. Verifica a ligação e tenta outra vez.";

/**
 * The API answers a bad code with an English `detail` ("Invalid access code"),
 * which used to be shown verbatim. Map what we recognise to Portuguese and
 * never surface raw server text to a team.
 */
export function loginErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (/invalid access code/i.test(message)) return INVALID_CODE_MESSAGE;
  if (/too many requests/i.test(message)) return RATE_LIMITED_MESSAGE;
  return GENERIC_LOGIN_MESSAGE;
}
