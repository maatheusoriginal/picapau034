import React, { useState } from "react";
import { decidirExclusao, rotuloDaAcao, textoDaDecisao, textoDoVinculo, type BaseDaOficina, type TipoDeCadastro } from "../removal";
import { deleteFirestoreDoc, saveFirestoreDoc } from "../../app/firebase/client";

/**
 * O botão de excluir de um cadastro, com a confirmação que diz o que vai
 * acontecer.
 *
 * A decisão — apagar de vez ou desativar — é de src/removal.ts, e é tomada
 * ANTES de a pessoa confirmar: a confirmação mostra em quantas OS, vendas e
 * entradas o cadastro aparece, e o botão muda de nome conforme o caso. Um
 * "Tem certeza?" genérico não serviria: a diferença entre sumir do banco e
 * ficar inativo é a diferença entre perder e não perder o histórico da oficina.
 */
export type RemovalConfig = {
  /** Tudo que o sistema tem carregado, para contar os vínculos. */
  base: BaseDaOficina;
  /** Falso para quem só consulta: o botão nem aparece. */
  podeExcluir: boolean;
  notify: (mensagem: string) => void;
  /** Chamado depois de gravar, para a tela fechar e recarregar. */
  onRemoved: () => void;
};

type Props = RemovalConfig & {
  tipo: TipoDeCadastro;
  /** A coleção no Firestore: "products", "clients", "motorcycles"... */
  colecao: string;
  id: string;
  nome: string;
};

export const RemovalButton: React.FC<Props> = ({ tipo, colecao, id, nome, base, podeExcluir, notify, onRemoved }) => {
  const [aberto, setAberto] = useState(false);
  const [gravando, setGravando] = useState(false);
  if (!podeExcluir || !id) return null;

  const decisao = decidirExclusao(tipo, id, base);

  const confirmar = async () => {
    setGravando(true);
    try {
      if (decisao.modo === "apagar") {
        await deleteFirestoreDoc(colecao, id);
        notify(`${nome || "Cadastro"} apagado.`);
      } else {
        // merge: o resto do cadastro fica intacto, só a chave de ativo muda.
        await saveFirestoreDoc(colecao, id, { active: false });
        notify(`${nome || "Cadastro"} ficou inativo. O histórico continua no lugar.`);
      }
      setAberto(false);
      onRemoved();
    } catch {
      notify("Não foi possível concluir. Tente de novo.");
    } finally {
      setGravando(false);
    }
  };

  return (
    <>
      <button type="button" className="removal-trigger" onClick={() => setAberto(true)}>Excluir</button>
      {aberto ? (
        <div className="removal-layer" role="dialog" aria-modal="true" aria-label="Confirmar exclusão">
          <div className="removal-box">
            <h3>{decisao.modo === "apagar" ? "Apagar este cadastro?" : "Este cadastro não pode ser apagado"}</h3>
            <p>{textoDaDecisao(decisao, nome)}</p>
            {decisao.vinculos.length ? (
              <ul className="removal-links">
                {decisao.vinculos.map((vinculo) => <li key={vinculo.varios}>{textoDoVinculo(vinculo)}</li>)}
              </ul>
            ) : null}
            <div className="removal-actions">
              <button type="button" className="ghost-button" disabled={gravando} onClick={() => setAberto(false)}>Cancelar</button>
              <button type="button" className={decisao.modo === "apagar" ? "danger-button" : "primary-button"} disabled={gravando} onClick={() => void confirmar()}>
                {gravando ? "Gravando..." : rotuloDaAcao(decisao)}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
};
