/**
 * Cópia de segurança dos dados da oficina.
 *
 * O Firestore no plano gratuito não faz backup nenhum: se alguém apagar os
 * produtos ou o histórico de OS, não existe de onde recuperar. O backup
 * automático do próprio Firebase exige o plano Blaze, e enviar para o Google
 * Drive por um servidor é impossível numa conta pessoal — conta de serviço não
 * tem cota de armazenamento e não pode ser dona de arquivo.
 *
 * Sobra o que dá para fazer bem: um arquivo que a pessoa baixa e guarda. E,
 * como o problema de verdade é esquecer, o sistema avisa quando está na hora.
 *
 * Funções puras: quem lê o Firestore e baixa o arquivo é a tela.
 */

/** Coleções que compõem a oficina. A ordem é a de importância para reconstruir. */
export const BACKUP_COLLECTIONS = [
  "products", "clients", "motorcycles", "serviceOrders", "sales",
  "stockEntries", "accounts", "expenses", "movements", "cashSessions",
  "suppliers", "categories", "partners", "quickServices",
  "paymentMachines", "paymentMethods", "employees", "users",
] as const;

export type BackupFile = {
  /** Versão do formato, para um dia saber ler um arquivo antigo. */
  format: 1;
  /** ISO 8601 de quando foi gerado. */
  createdAt: string;
  createdBy: string;
  workshop: string;
  /** Cada coleção com todos os seus documentos. */
  data: Record<string, Array<Record<string, unknown>>>;
};

export function buildBackup(
  data: Record<string, Array<Record<string, unknown>>>,
  options: { createdBy?: string; workshop?: string; now?: Date } = {},
): BackupFile {
  const now = options.now ?? new Date();
  return {
    format: 1,
    createdAt: now.toISOString(),
    createdBy: options.createdBy ?? "",
    workshop: options.workshop ?? "Pica Pau Motos",
    data,
  };
}

/**
 * Nome do arquivo com a data na frente, no formato que ordena sozinho.
 *
 * "2026-08-31" e não "31-08-2026": assim a pasta de backups fica em ordem
 * cronológica sem ninguém precisar ordenar nada.
 */
export function backupFileName(now: Date = new Date()): string {
  const iso = now.toISOString().slice(0, 10);
  const hora = now.toTimeString().slice(0, 5).replace(":", "h");
  return `backup-pica-pau-${iso}-${hora}.json`;
}

/** Quantos registros o arquivo carrega, para a tela dizer o que foi salvo. */
export function backupCount(file: Pick<BackupFile, "data">): number {
  return Object.values(file.data).reduce((total, docs) => total + docs.length, 0);
}

/** Resumo por coleção, da maior para a menor — é o que prova que veio tudo. */
export function backupSummary(file: Pick<BackupFile, "data">): Array<{ collection: string; count: number }> {
  return Object.entries(file.data)
    .map(([collection, docs]) => ({ collection, count: docs.length }))
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count);
}

/**
 * Faz quantos dias desde o último backup?
 *
 * Sem backup nenhum devolve null — que a tela trata como "nunca", e é mais
 * urgente que qualquer número.
 */
export function daysSinceBackup(lastAt: string | undefined, now: Date = new Date()): number | null {
  if (!lastAt) return null;
  const last = new Date(lastAt);
  if (Number.isNaN(last.getTime())) return null;
  return Math.floor((now.getTime() - last.getTime()) / 86400000);
}

/**
 * Está na hora de avisar?
 *
 * Um dia é o intervalo certo para uma oficina: um dia de vendas, OS e caixa
 * perdido já dói o suficiente para valer o incômodo do aviso.
 */
export function backupIsDue(lastAt: string | undefined, now: Date = new Date()): boolean {
  const dias = daysSinceBackup(lastAt, now);
  return dias === null || dias >= 1;
}

/** O que o aviso diz, de acordo com há quanto tempo foi. */
export function backupReminder(lastAt: string | undefined, now: Date = new Date()): string {
  const dias = daysSinceBackup(lastAt, now);
  if (dias === null) return "Você ainda não baixou nenhuma cópia de segurança.";
  if (dias === 0) return "";
  if (dias === 1) return "Faz um dia desde a última cópia de segurança.";
  return `Faz ${dias} dias desde a última cópia de segurança.`;
}
