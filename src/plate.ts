/**
 * Placa de moto: como se escreve, como se compara e o que é válido.
 *
 * Estava dentro do app/page.tsx e não dava para reaproveitar. O cadastro de
 * cliente precisa das mesmas regras: uma placa gravada "ABC1D23" e outra
 * "abc-1d23" são a mesma moto, e comparar o texto cru cadastraria a moto duas
 * vezes.
 */

/** Só letras e números, em maiúsculas — a forma de comparar duas placas. */
export function normalizePlate(value: string): string {
  return (value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7);
}

/** Como a placa aparece na tela: ABC-1D23. */
export function formatPlate(value: string): string {
  const normalized = normalizePlate(value);
  return normalized.length > 3 ? `${normalized.slice(0, 3)}-${normalized.slice(3)}` : normalized;
}

/** Duas placas são a mesma moto? */
export function samePlate(a: string, b: string): boolean {
  const um = normalizePlate(a);
  return um.length > 0 && um === normalizePlate(b);
}

/**
 * A placa está completa e num dos dois padrões brasileiros?
 *
 * Antigo: três letras e quatro números (ABC-1234).
 * Mercosul: três letras, um número, uma letra e dois números (ABC-1D23).
 */
export function isValidPlate(value: string): boolean {
  const normalized = normalizePlate(value);
  if (normalized.length !== 7) return false;
  return /^[A-Z]{3}\d{4}$/.test(normalized) || /^[A-Z]{3}\d[A-Z]\d{2}$/.test(normalized);
}

/** O que dizer embaixo do campo enquanto se digita. */
export function platePattern(value: string): string {
  const normalized = normalizePlate(value);
  if (normalized.length < 7) return "Digite os 7 caracteres";
  if (!isValidPlate(normalized)) return "Placa fora dos padrões brasileiros";
  return /[A-Z]/.test(normalized[4] ?? "") ? "Padrão Mercosul" : "Padrão antigo";
}

/** O id da moto a partir da placa — o mesmo em qualquer tela que cadastre. */
export function motorcycleIdFor(plate: string): string {
  return `MOTO-${normalizePlate(plate)}`;
}
