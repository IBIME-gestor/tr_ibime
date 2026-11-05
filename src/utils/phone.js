/**
 * Teléfonos de México.
 * Formato guardado: "+52" + 10 dígitos (p. ej. +525512345678).
 *
 * Excel convierte los números largos a notación científica
 * (525512345678 -> "5.25512E+11") y en ese texto los dígitos ya se perdieron.
 * Por eso aquí se detecta ese caso y NO se inventa un número.
 */

/** ¿El valor es un número en notación científica (dato ya dañado)? */
export function isScientificPhone(value) {
  return /^\s*\d+([.,]\d+)?\s*e\s*[+-]?\s*\d+\s*$/i.test(String(value ?? ''));
}

/**
 * Normaliza un teléfono.
 * Regresa { phone, status }:
 *   status 'ok'     -> phone = "+52XXXXXXXXXX"
 *   status 'empty'  -> sin dato
 *   status 'broken' -> notación científica: los dígitos ya no existen
 *   status 'invalid'-> no se pudo reducir a 10 dígitos (phone = texto original)
 */
export function normalizePhone(value) {
  if (value === null || value === undefined || value === '') return { phone: '', status: 'empty' };

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return { phone: '', status: 'broken' };
    value = Math.round(value).toString();
  }

  const text = String(value).trim();
  if (!text) return { phone: '', status: 'empty' };
  if (isScientificPhone(text)) return { phone: '', status: 'broken' };

  let digits = text.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.length === 13 && digits.startsWith('521')) digits = digits.slice(3); // 52 1 + 10 (formato móvil antiguo)
  else if (digits.length === 12 && digits.startsWith('52')) digits = digits.slice(2);

  if (digits.length === 10) return { phone: `+52${digits}`, status: 'ok' };
  return { phone: text, status: 'invalid' };
}
