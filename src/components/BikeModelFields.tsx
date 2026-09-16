/**
 * Marca → modelo → versão, em um lugar só.
 *
 * Este trio nasceu no cadastro de moto para acabar com a mesma moto entrando
 * como "CG 160 Fan", "cg160 fan" e "CG FAN 160" — quando isso acontece o
 * histórico da moto e a busca por modelo param de funcionar. Só que a OS
 * também deixa escrever a moto: a moto chega no guincho, a OS abre pela placa
 * e o modelo é acertado depois. Ali o campo continuava sendo texto livre, e a
 * bagunça voltava pela porta dos fundos.
 *
 * Por isso o trio virou peça: o cadastro e a OS usam ESTA, e não duas cópias
 * que um dia divergem. Quem chama guarda `brand` e `model` e recebe os dois de
 * volta a cada mexida — o estado da escolha (qual modelo, qual versão) é
 * derivado deles por `splitModelName`, e não copiado, que é o que evita a tela
 * mostrar uma coisa e o banco guardar outra.
 *
 * `model` é gravado como um texto só ("CG 160 Fan"): é o que a OS imprime, o
 * que o PDF do cliente mostra e o que a busca procura.
 */
import { useState } from "react";
import { emMaiusculo } from "../text-case";
import { fullModelName, modelsOf, splitModelName, versionsOf } from "../motorcycle-catalog";
import { QuickAddSelect } from "./QuickAddSelect";

export type BikeModelValue = { brand: string; model: string };

/**
 * O cadastro e o diálogo da OS usam classes de formulário diferentes. Em vez
 * de a peça saber de telas, ela recebe qual das duas roupas vestir.
 */
const ROUPA = {
  cadastro: { campo: "field-group", rotulo: "field-label", controle: "dialog-select", entrada: "dialog-input" },
  dialogo: { campo: "field", rotulo: "", controle: "", entrada: "" },
} as const;

export function BikeModelFields({ brand, model, onChange, brandOptions, onCreateBrand, estilo = "cadastro", obrigatorio = true, dica = true }: {
  brand: string;
  /** O modelo completo, como fica gravado: "CG 160 Fan". */
  model: string;
  onChange: (valor: BikeModelValue) => void;
  brandOptions: string[];
  /** Criar marca sem sair da tela. Ausente = lista simples. */
  onCreateBrand?: (nome: string) => Promise<void> | void;
  estilo?: keyof typeof ROUPA;
  obrigatorio?: boolean;
  /** A linha "Fica gravado como: ...". Atrapalha em diálogo apertado. */
  dica?: boolean;
}) {
  /*
    Só um estado vive aqui: "a pessoa escolheu Outro (digitar)".

    Ele não dá para deduzir do texto — modelo vazio com intenção de digitar e
    modelo vazio porque ninguém escolheu ainda são a mesma coisa vista de fora.
    Antes isso era deduzido, e escolher "Outro (digitar)" fazia a lista voltar
    sozinha para "Escolha o modelo" até a pessoa digitar a primeira letra.
  */
  const [digitando, setDigitando] = useState(false);

  const modelOptions = modelsOf(brand);
  // A escolha na tela sai do que está gravado, sempre. Nada é copiado para um
  // estado paralelo que depois discorda do valor real.
  const partes = splitModelName(brand, model);
  const foraDoCatalogo = modelOptions.length === 0 || digitando || (model.trim() !== "" && partes.model === "");
  const versionOptions = versionsOf(brand, partes.model);
  const roupa = ROUPA[estilo];
  const req = obrigatorio ? <b className="req"> *</b> : null;

  // Trocar de marca limpa o modelo: "CG 160" não existe na Yamaha, e deixar o
  // anterior gravaria uma moto que não existe.
  const trocarMarca = (valor: string) => { setDigitando(false); onChange({ brand: valor, model: "" }); };

  return <>
    {/* <div>, não <label>: botão dentro de label aciona o select junto. */}
    <div className={roupa.campo}>
      <span className={roupa.rotulo}>Marca{req}</span>
      {onCreateBrand ? (
        <QuickAddSelect value={brand} onChange={trocarMarca} options={brandOptions} onCreate={onCreateBrand} placeholder="Ex: BULL" createTitle="Criar uma marca sem sair do cadastro"/>
      ) : (
        <select value={brand} onChange={(e) => trocarMarca(e.target.value)} className={roupa.controle}>
          {!brandOptions.includes(brand) ? <option value={brand}>{brand || "Escolha a marca"}</option> : null}
          {brandOptions.map((nome) => <option key={nome} value={nome}>{nome}</option>)}
        </select>
      )}
    </div>

    <label className={roupa.campo}>
      <span className={roupa.rotulo}>Modelo{req}</span>
      {modelOptions.length > 0 ? (
        <select
          value={foraDoCatalogo ? "__outro__" : partes.model}
          onChange={(e) => {
            const escolhido = e.target.value;
            if (escolhido === "__outro__") { setDigitando(true); return onChange({ brand, model: "" }); }
            setDigitando(false);
            onChange({ brand, model: fullModelName(escolhido, "") });
          }}
          className={roupa.controle}
        >
          <option value="">Escolha o modelo</option>
          {modelOptions.map((nome) => <option key={nome} value={nome}>{nome}</option>)}
          {/* Marca no catálogo não cobre toda moto que entra na oficina. */}
          <option value="__outro__">Outro (digitar)</option>
        </select>
      ) : (
        <input type="text" value={model} onChange={(e) => onChange({ brand, model: emMaiusculo(e.target.value) })} placeholder="Ex: CG 160 Fan" className={roupa.entrada}/>
      )}
    </label>

    <label className={roupa.campo}>
      <span className={roupa.rotulo}>Versão</span>
      {modelOptions.length > 0 && !foraDoCatalogo && versionOptions.length > 0 ? (
        <select value={partes.version} onChange={(e) => onChange({ brand, model: fullModelName(partes.model, e.target.value) })} className={roupa.controle}>
          <option value="">Sem versão específica</option>
          {versionOptions.map((nome) => <option key={nome} value={nome}>{nome}</option>)}
        </select>
      ) : (
        <input
          type="text"
          value={foraDoCatalogo ? model : partes.version}
          onChange={(e) => {
            if (foraDoCatalogo) return onChange({ brand, model: emMaiusculo(e.target.value) });
            onChange({ brand, model: fullModelName(partes.model, emMaiusculo(e.target.value)) });
          }}
          placeholder={foraDoCatalogo ? "Ex: CG 160 Fan ESDI" : "Ex: ESDI"}
          className={roupa.entrada}
        />
      )}
      {dica ? <span className="settings-hint">{model.trim() ? `Fica gravado como: ${model.trim()}` : "Marca → modelo → versão."}</span> : null}
    </label>
  </>;
}
