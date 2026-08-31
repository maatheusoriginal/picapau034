/**
 * Confere a cópia de segurança.
 *
 * Backup é a única funcionalidade do sistema cujo defeito só aparece no pior
 * dia possível: quando alguém já perdeu os dados. Por isso o que ele promete
 * precisa ser conferido antes, e não depois.
 *
 * Rode com: npm run check:backup
 */
import { BACKUP_COLLECTIONS, backupCount, backupFileName, backupIsDue, backupReminder, backupSummary, buildBackup, daysSinceBackup } from "../src/backup";

const json = (value: unknown) => JSON.stringify(value);
const agora = new Date("2026-08-31T14:30:00.000Z");
const dias = (n: number) => new Date(agora.getTime() - n * 86400000).toISOString();

const arquivo = buildBackup({
  products: [{ id: "PRD-001", name: "Óleo" }, { id: "PRD-002", name: "Pastilha" }],
  clients: [{ id: "CLI-001", name: "João" }],
  serviceOrders: [],
}, { createdBy: "matheus@picapau.com", workshop: "Pica Pau Motos", now: agora });

const casos: Array<[string, unknown, unknown]> = [
  // --- O que entra no arquivo ---
  ["a lista cobre as coleções da oficina", BACKUP_COLLECTIONS.length, 18],
  ["produtos estão na lista", BACKUP_COLLECTIONS.includes("products"), true],
  ["as OS também", BACKUP_COLLECTIONS.includes("serviceOrders"), true],
  ["as vendas também", BACKUP_COLLECTIONS.includes("sales"), true],
  ["e o caixa também", BACKUP_COLLECTIONS.includes("cashSessions"), true],
  // O registro de auditoria e os perfis de acesso ficam de fora de propósito:
  // são dados de segurança, não da oficina, e um arquivo baixado no celular
  // não é lugar para eles.
  ["registro de auditoria fica de fora", (BACKUP_COLLECTIONS as readonly string[]).includes("auditLogs"), false],
  ["perfis de acesso ficam de fora", (BACKUP_COLLECTIONS as readonly string[]).includes("userAccess"), false],
  ["salários ficam de fora", (BACKUP_COLLECTIONS as readonly string[]).includes("employeeCompensation"), false],

  // --- O arquivo ---
  ["carrega a versão do formato", arquivo.format, 1],
  ["diz quando foi gerado", arquivo.createdAt, agora.toISOString()],
  ["e por quem", arquivo.createdBy, "matheus@picapau.com"],
  ["conta os registros salvos", backupCount(arquivo), 3],
  ["o resumo vem do maior para o menor", json(backupSummary(arquivo).map((i) => i.collection)), json(["products", "clients"])],
  ["coleção vazia não polui o resumo", backupSummary(arquivo).some((i) => i.collection === "serviceOrders"), false],
  ["arquivo sem nada não quebra a contagem", backupCount({ data: {} }), 0],

  // --- Nome do arquivo ---
  // Data na frente, no formato que ordena sozinho na pasta.
  ["o nome começa pela data", backupFileName(agora).startsWith("backup-pica-pau-2026-08-31"), true],
  ["e termina em .json", backupFileName(agora).endsWith(".json"), true],
  ["dois backups no mesmo dia não colidem", backupFileName(new Date("2026-08-31T09:00:00Z")) !== backupFileName(new Date("2026-08-31T18:00:00Z")), true],

  // --- Quando avisar ---
  ["nunca ter feito backup é o caso mais urgente", daysSinceBackup(undefined, agora), null],
  ["e o aviso diz isso com todas as letras", backupReminder(undefined, agora).includes("ainda não baixou"), true],
  ["sem backup, está na hora", backupIsDue(undefined, agora), true],
  ["backup de hoje não incomoda ninguém", backupIsDue(dias(0), agora), false],
  ["e não mostra aviso nenhum", backupReminder(dias(0), agora), ""],
  ["um dia já pede o próximo", backupIsDue(dias(1), agora), true],
  ["o aviso fala no singular", backupReminder(dias(1), agora), "Faz um dia desde a última cópia de segurança."],
  ["cinco dias falam no plural", backupReminder(dias(5), agora), "Faz 5 dias desde a última cópia de segurança."],
  ["a contagem de dias bate", daysSinceBackup(dias(5), agora), 5],
  ["data inválida é tratada como nunca", daysSinceBackup("não é data", agora), null],
];

let falhas = 0;
for (const [nome, obtido, esperado] of casos) {
  const ok = obtido === esperado;
  if (!ok) falhas += 1;
  console.log(`${ok ? "OK  " : "FALHA"} ${nome}: obtido ${obtido}, esperado ${esperado}`);
}
console.log(falhas === 0 ? "\nA cópia de segurança leva o que precisa." : `\n${falhas} caso(s) errados.`);
process.exit(falhas === 0 ? 0 : 1);
