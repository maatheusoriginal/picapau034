/**
 * Moto elétrica, a que não tem placa.
 *
 * O erro caro aqui não é uma tela feia: é duas motos dividindo o mesmo id no
 * banco, e portanto o mesmo histórico. Acontece de duas formas — um código
 * que por acaso tem forma de placa, e um código reaproveitado depois que a
 * moto anterior foi apagada. As duas estão cobertas abaixo.
 */
import type { MotorcycleRecord } from "../src/types";
import { isValidPlate, motorcycleIdFor, normalizePlate } from "../src/plate";
import { bikeIdLabel, electricBikeId, electricCode, isElectricBike, isElectricCode, nextElectricCode } from "../src/electric";

const moto = (extra: Partial<MotorcycleRecord>): MotorcycleRecord => ({
  id: "MOTO-ABC1D23", ownerId: "C1", plate: "ABC-1D23", model: "Honda CG 160", year: "2024", color: "PRETA", ...extra,
} as MotorcycleRecord);

const casos: Array<[string, unknown, unknown]> = [
  /* -------------------------------------------------------------------------
     O CÓDIGO NUNCA PODE PARECER UMA PLACA

     Placa brasileira é ABC-1234 ou ABC-1D23 — três letras na frente. "ELET"
     tem quatro, então nenhum código cabe nos padrões. Se um dia alguém
     encurtar o prefixo para três letras, estas linhas reprovam: seria abrir a
     porta para a moto elétrica ELE-001 e a moto de placa ELE-0001 brigarem
     pelo mesmo documento.
  ------------------------------------------------------------------------- */
  ["ELET-001 não é placa válida", isValidPlate("ELET-001"), false],
  ["ELET-999 também não", isValidPlate("ELET-999"), false],
  ["ELET-1000 também não", isValidPlate("ELET-1000"), false],
  ["e a placa de verdade continua válida", isValidPlate("ABC-1D23"), true],
  ["o id da elétrica não colide com o de placa nenhuma", electricBikeId("ELET-001") === motorcycleIdFor("ABC-1D23"), false],

  /*
    E O ID NÃO PODE SER CORTADO.

    `motorcycleIdFor` corta em 7 caracteres — bom para placa, que tem 7. Com
    ELET-1000 o corte faria "ELET100", o mesmo id de ELET-100: duas motos, um
    documento. Por isso a elétrica tem função de id própria.
  */
  ["o id da elétrica não passa pelo corte de 7", electricBikeId("ELET-1000"), "MOTO-ELET1000"],
  ["e por isso ELET-100 e ELET-1000 são motos diferentes", electricBikeId("ELET-100") === electricBikeId("ELET-1000"), false],
  ["já o corte da placa faria as duas iguais (é a armadilha)", motorcycleIdFor("ELET-100") === motorcycleIdFor("ELET-1000"), true],
  ["o id da elétrica é o do código", electricBikeId("ELET-007"), "MOTO-ELET007"],
  ["minúscula não muda o id", electricBikeId("elet-007"), "MOTO-ELET007"],

  /* -------------------------------------------------------------------------
     A FORMA DO CÓDIGO
  ------------------------------------------------------------------------- */
  ["o primeiro código", electricCode(1), "ELET-001"],
  ["com três casas", electricCode(42), "ELET-042"],
  ["e cresce sem quebrar", electricCode(1000), "ELET-1000"],
  ["número quebrado vira o primeiro, e não NaN na etiqueta", electricCode(Number.NaN), "ELET-001"],
  ["zero também", electricCode(0), "ELET-001"],
  ["negativo também", electricCode(-5), "ELET-001"],

  ["reconhece o código", isElectricCode("ELET-001"), true],
  ["com ou sem hífen", isElectricCode("ELET001"), true],
  ["minúscula também", isElectricCode("elet-001"), true],
  ["placa não é código", isElectricCode("ABC-1D23"), false],
  ["texto solto não é código", isElectricCode("ELETRICA"), false],
  ["vazio não é código", isElectricCode(""), false],

  /* -------------------------------------------------------------------------
     O PRÓXIMO CÓDIGO LIVRE

     Conta a partir do MAIOR já usado, e não da quantidade: apagar a ELET-003
     não pode fazer a próxima nascer ELET-003 e herdar o histórico da outra.
  ------------------------------------------------------------------------- */
  ["oficina sem elétrica nenhuma começa na 001", nextElectricCode([]), "ELET-001"],
  ["só motos de placa: continua na 001", nextElectricCode([moto({})]), "ELET-001"],
  ["com a 001 usada, vem a 002", nextElectricCode([moto({ plate: "ELET-001", electric: true })]), "ELET-002"],
  ["conta pelo maior, não pela quantidade", nextElectricCode([
    moto({ plate: "ELET-001", electric: true }), moto({ plate: "ELET-007", electric: true }),
  ]), "ELET-008"],
  ["apagar a do meio não reaproveita o número", nextElectricCode([
    moto({ plate: "ELET-001", electric: true }), moto({ plate: "ELET-009", electric: true }),
  ]), "ELET-010"],
  ["passa de 999 sem tropeçar", nextElectricCode([moto({ plate: "ELET-999", electric: true })]), "ELET-1000"],
  ["placa que lembra o código não atrapalha a conta", nextElectricCode([
    moto({ plate: "ABC-1234" }), moto({ plate: "ELET-002", electric: true }),
  ]), "ELET-003"],
  ["moto sem placa nem código não quebra a conta", nextElectricCode([moto({ plate: "" })]), "ELET-001"],

  /* -------------------------------------------------------------------------
     QUEM É ELÉTRICA, E COMO CHAMAR ISSO NA TELA
  ------------------------------------------------------------------------- */
  ["marcada como elétrica", isElectricBike(moto({ plate: "ELET-001", electric: true })), true],
  ["o código sozinho já denuncia, mesmo sem a marca", isElectricBike(moto({ plate: "ELET-001" })), true],
  ["moto de placa não é elétrica", isElectricBike(moto({})), false],
  ["moto nenhuma não quebra", isElectricBike(null), false],
  ["na elétrica a tela diz Código", bikeIdLabel(true), "Código"],
  ["na comum diz Placa", bikeIdLabel(false), "Placa"],
  ["sem saber, diz Placa — é o caso comum", bikeIdLabel(undefined), "Placa"],

  // A busca compara texto normalizado: o código tem de sobreviver a isso.
  ["o código normalizado continua o mesmo", normalizePlate("ELET-001"), "ELET001"],
];

let falhas = 0;
for (const [nome, obtido, esperado] of casos) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas += 1;
  console.log(`${ok ? "ok  " : "FALHA"} ${nome}${ok ? "" : ` — esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(obtido)}`}`);
}
if (falhas) { console.error(`\n${falhas} verificação(ões) de moto elétrica falharam.`); process.exit(1); }
console.log(`\n${casos.length} verificações de moto elétrica passaram.`);
