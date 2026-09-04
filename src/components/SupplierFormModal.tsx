import React, { useState, useEffect, useRef } from "react";
import type { SupplierConfig } from "../types";
import { emMaiusculo } from "../text-case";
import { saveFirestoreDoc } from "../../app/firebase/client";
import { NumberField } from "./NumberField";
import { nextSequentialId } from "../firestore-data";
import { RemovalButton, type RemovalConfig } from "./RemovalButton";

interface SupplierFormModalProps {
  /** Excluir o cadastro pelo próprio formulário. Ausente = só criar e editar. */
  removal?: RemovalConfig;
  isOpen: boolean;
  onClose: () => void;
  onSaved: (supplier: SupplierConfig) => void;
  editingSupplier?: SupplierConfig | null;
  notify: (msg: string) => void;
  allSuppliers: SupplierConfig[];
}

export const SupplierFormModal: React.FC<SupplierFormModalProps> = ({
  removal,
  isOpen,
  onClose,
  onSaved,
  editingSupplier,
  notify,
  allSuppliers,
}) => {
  const [isSaving, setIsSaving] = useState(false);
  const formularioRef = useRef<HTMLFormElement>(null);
  // O que falta preencher, dito DENTRO do formulário.
  //
  // Era um `notify` — o aviso de canto da aplicação —, que num formulário
  // aberto por cima de outro (o cadastro de cliente chamado de dentro da OS)
  // aparece atrás do modal. Quem clicava em salvar via a aba trocar sozinha e
  // nada acontecer, sem nenhuma explicação na tela.
  const [erroForm, setErroForm] = useState("");

  // Form fields
  const [name, setName] = useState("");
  const [tradeName, setTradeName] = useState("");
  const [document, setDocument] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneSecondary, setPhoneSecondary] = useState("");
  const [email, setEmail] = useState("");
  const [representative, setRepresentative] = useState("");
  const [categories, setCategories] = useState("");
  const [deliveryDays, setDeliveryDays] = useState<number>(2);
  const [paymentTerms, setPaymentTerms] = useState("Boleto 28 dias");
  const [minimumOrder, setMinimumOrder] = useState<number>(0);
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("SP");
  const [notes, setNotes] = useState("");
  const [active, setActive] = useState(true);

  useEffect(() => {
    if (!isOpen) return;

    if (editingSupplier) {
      setName(editingSupplier.name || "");
      setTradeName(editingSupplier.tradeName || "");
      setDocument(editingSupplier.document || "");
      setPhone(editingSupplier.phone || "");
      setPhoneSecondary(editingSupplier.phoneSecondary || "");
      setEmail(editingSupplier.email || "");
      setRepresentative(editingSupplier.representative || "");
      setCategories(editingSupplier.categories || "");
      setDeliveryDays(editingSupplier.deliveryDays ?? 2);
      setPaymentTerms(editingSupplier.paymentTerms || "Boleto 28 dias");
      setMinimumOrder(editingSupplier.minimumOrder ?? 0);
      setAddress(editingSupplier.address || "");
      setCity(editingSupplier.city || "");
      setState(editingSupplier.state || "SP");
      setNotes(editingSupplier.notes || "");
      setActive(editingSupplier.active !== false);
    } else {
      setName("");
      setTradeName("");
      setDocument("");
      setPhone("");
      setPhoneSecondary("");
      setEmail("");
      setRepresentative("");
      setCategories("Peças e Lubrificantes");
      setDeliveryDays(2);
      setPaymentTerms("Boleto 28 dias");
      setMinimumOrder(0);
      setAddress("");
      setCity("");
      setState("SP");
      setNotes("");
      setActive(true);
    }
    setErroForm("");
  }, [isOpen, editingSupplier]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      setErroForm("Informe a Razão Social ou Nome do fornecedor.");
      return;
    }

    if (!phone.trim()) {
      setErroForm("Informe o WhatsApp ou telefone de contato.");
      return;
    }

    setErroForm("");
    setIsSaving(true);
    try {
      const supplierId = editingSupplier?.id || nextSequentialId(allSuppliers, "SUP");

      const supplierData: SupplierConfig = {
        id: supplierId,
        name: name.trim(),
        tradeName: tradeName.trim(),
        document: document.trim(),
        phone: phone.trim(),
        phoneSecondary: phoneSecondary.trim(),
        email: email.trim(),
        representative: representative.trim(),
        categories: categories.trim(),
        deliveryDays: Number(deliveryDays) || 0,
        paymentTerms: paymentTerms.trim(),
        minimumOrder: Number(minimumOrder) || 0,
        address: address.trim(),
        city: city.trim(),
        state: state.trim(),
        notes: notes.trim(),
        active,
      };

      await saveFirestoreDoc("suppliers", supplierId, {
        name: supplierData.name,
        tradeName: supplierData.tradeName,
        document: supplierData.document,
        phone: supplierData.phone,
        phoneSecondary: supplierData.phoneSecondary,
        email: supplierData.email,
        representative: supplierData.representative,
        categories: supplierData.categories,
        deliveryDays: supplierData.deliveryDays,
        paymentTerms: supplierData.paymentTerms,
        minimumOrder: supplierData.minimumOrder,
        address: supplierData.address,
        city: supplierData.city,
        state: supplierData.state,
        notes: supplierData.notes,
        active: supplierData.active,
      });

      onSaved(supplierData);
      notify(editingSupplier ? "Fornecedor atualizado com sucesso!" : "Fornecedor cadastrado com sucesso!");
      onClose();
    } catch (err: unknown) {
      console.error("Erro ao salvar fornecedor:", err);
      setErroForm(err instanceof Error ? err.message : "Não foi possível salvar o fornecedor. Verifique a conexão e tente de novo.");
    } finally {
      setIsSaving(false);
    }
  };

  /**
   * F5 grava e Esc fecha, como no sistema que a oficina já usa e como no
   * cadastro de peça. O atalho é ligado só enquanto este formulário está
   * aberto: fechou, F5 volta a recarregar a página.
   */
  useEffect(() => {
    if (!isOpen) return;
    const noTeclado = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") { evento.preventDefault(); onClose(); return; }
      if (evento.key !== "F5") return;
      evento.preventDefault();
      formularioRef.current?.requestSubmit();
    };
    window.addEventListener("keydown", noTeclado);
    return () => window.removeEventListener("keydown", noTeclado);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="dialog-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dialog-window large-dialog" style={{ maxWidth: "740px" }}>
        <div className="dialog-head pdv-head">
          <div>
            <strong>{editingSupplier ? "Editar Fornecedor" : "Novo Fornecedor"}</strong>
            <span>{editingSupplier ? `${editingSupplier.name} · Contato: ${editingSupplier.phone}` : "Cadastre distribuidoras de peças, ferramentas e produtos"}</span>
          </div>
          <button className="icon-close" onClick={onClose} aria-label="Fechar modal">✕</button>
        </div>


        {/*
            noValidate: a conferência é nossa, não a do navegador.

            Enquanto o cadastro tinha etapas, o campo obrigatório da etapa
            seguinte nem estava na tela, então o `required` do HTML nunca
            barrava nada. Numa tela só ele barra — e o balão do navegador
            entra na frente da mensagem escrita DENTRO do formulário, que é
            justamente a que diz o que a oficina precisa ("toda pessoa
            cadastrada precisa de pelo menos uma moto vinculada").
          */}
          <form noValidate ref={formularioRef} onSubmit={handleSubmit} className="dialog-body">
          {/*
            Uma tela só, no formato do sistema de balcão: sem etapa, e com o
            rótulo à esquerda do campo. As abas viraram os títulos dos blocos.
          */}
          <div className="pdv-form">
          {erroForm ? <div className="settings-modal-error" role="alert"><b>!</b><span>{erroForm}</span></div> : null}
          {/* TAB 1: IDENTIFICAÇÃO */}
          <h4>Identificação</h4>
          {(
            <div className="form-section-stack">
              <div className="form-grid-2">
                <label className="field-group">
                  <span className="field-label">Razão social <b className="req">*</b></span>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(emMaiusculo(e.target.value))}
                    placeholder="Ex: Moto Peças Distribuidora Ltda"
                    className="dialog-input"
                    autoFocus
                  />
                </label>
                <label className="field-group">
                  <span className="field-label">Nome fantasia</span>
                  <input
                    type="text"
                    value={tradeName}
                    onChange={(e) => setTradeName(emMaiusculo(e.target.value))}
                    placeholder="Ex: MegaMoto Distribuidora"
                    className="dialog-input"
                  />
                </label>
              </div>

              <div className="form-grid-2">
                <label className="field-group">
                  <span className="field-label">CNPJ ou CPF</span>
                  <input
                    type="text"
                    value={document}
                    onChange={(e) => setDocument(emMaiusculo(e.target.value))}
                    placeholder="00.000.000/0001-00"
                    className="dialog-input"
                  />
                </label>
                <label className="field-group">
                  <span className="field-label">Categorias</span>
                  <input
                    type="text"
                    value={categories}
                    onChange={(e) => setCategories(emMaiusculo(e.target.value))}
                    placeholder="Ex: Motores, Freios, Lubrificantes, Pneus"
                    className="dialog-input"
                  />
                </label>
              </div>
            </div>
          )}

          {/* TAB 2: CONTATO */}
          <h4>Contato</h4>
          {(
            <div className="form-section-stack">
              <div className="form-grid-2">
                <label className="field-group">
                  <span className="field-label">WhatsApp <b className="req">*</b></span>
                  <input
                    type="text"
                    required
                    value={phone}
                    onChange={(e) => setPhone(emMaiusculo(e.target.value))}
                    placeholder="(11) 98765-4321"
                    className="dialog-input bold-number"
                  />
                </label>
                <label className="field-group">
                  <span className="field-label">Telefone fixo</span>
                  <input
                    type="text"
                    value={phoneSecondary}
                    onChange={(e) => setPhoneSecondary(emMaiusculo(e.target.value))}
                    placeholder="(11) 3344-5566"
                    className="dialog-input"
                  />
                </label>
              </div>

              <div className="form-grid-2">
                <label className="field-group">
                  <span className="field-label">E-mail</span>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="pedidos@distribuidora.com.br"
                    className="dialog-input"
                  />
                </label>
                <label className="field-group">
                  <span className="field-label">Representante</span>
                  <input
                    type="text"
                    value={representative}
                    onChange={(e) => setRepresentative(emMaiusculo(e.target.value))}
                    placeholder="Ex: Carlos Oliveira"
                    className="dialog-input"
                  />
                </label>
              </div>
            </div>
          )}

          {/* TAB 3: COMERCIAL */}
          <h4>Condições comerciais</h4>
          {(
            <div className="form-section-stack">
              <div className="form-grid-3">
                <label className="field-group">
                  <span className="field-label">Entrega (dias)</span>
                  <NumberField
                    min={0}
                    fallback={0}
                    value={deliveryDays}
                    onChange={(valor) => setDeliveryDays(valor)}
                    className="dialog-input bold-number"
                  />
                  <small className="field-hint">0 = Entrega no mesmo dia</small>
                </label>
                <label className="field-group">
                  <span className="field-label">Condição de pagamento</span>
                  <input
                    type="text"
                    value={paymentTerms}
                    onChange={(e) => setPaymentTerms(emMaiusculo(e.target.value))}
                    placeholder="Ex: Boleto 28 dias / PIX 5% desc."
                    className="dialog-input"
                  />
                </label>
                <label className="field-group">
                  <span className="field-label">Pedido mínimo</span>
                  <NumberField casas={2}
                    min={0}
                    step="0.01"
                    fallback={0}
                    blankValue={0}
                    value={minimumOrder}
                    onChange={(valor) => setMinimumOrder(valor)}
                    placeholder="0,00"
                    className="dialog-input"
                  />
                </label>
              </div>
            </div>
          )}

          {/* TAB 4: ENDEREÇO */}
          <h4>Endereço</h4>
          {(
            <div className="form-section-stack">
              <label className="field-group">
                <span className="field-label">Endereço</span>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(emMaiusculo(e.target.value))}
                  placeholder="Ex: Av. das Nações, 1400 - Distrito Industrial"
                  className="dialog-input"
                />
              </label>
              <div className="form-grid-2">
                <label className="field-group">
                  <span className="field-label">Cidade</span>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(emMaiusculo(e.target.value))}
                    placeholder="Ex: São Paulo"
                    className="dialog-input"
                  />
                </label>
                <label className="field-group">
                  <span className="field-label">Estado</span>
                  <input
                    type="text"
                    maxLength={2}
                    value={state}
                    onChange={(e) => setState(emMaiusculo(emMaiusculo(e.target.value)))}
                    placeholder="SP"
                    className="dialog-input"
                  />
                </label>
              </div>
            </div>
          )}

          {/* TAB 5: OBSERVAÇÕES */}
          <h4>Observações</h4>
          {(
            <div className="form-section-stack">
              <label className="field-group">
                <span className="field-label">Observações</span>
                <textarea
                  rows={4}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ex: Chamar no WhatsApp nas terças-feiras para fechar pedido com frete grátis."
                  className="dialog-textarea"
                />
              </label>

              <div className="toggle-row-card">
                <div>
                  <strong>Fornecedor Ativo</strong>
                  <span>Habilitar para compras e vínculo em produtos</span>
                </div>
                <label className="switch-toggle">
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={(e) => setActive(e.target.checked)}
                  />
                  <span className="slider round"></span>
                </label>
              </div>
            </div>
          )}
          </div>

          <div className="dialog-actions-row">
            <div>
              <button type="button" className="outline-button pdv-footer-button" onClick={onClose} disabled={isSaving}>
                <kbd>Esc</kbd>
                Cancelar
              </button>
              {editingSupplier && removal ? <RemovalButton tipo="fornecedor" colecao="suppliers" id={editingSupplier.id} nome={editingSupplier.name} {...removal}/> : null}
            </div>
            {/*
              Sem "Anterior" e "Próxima etapa": o cadastro é uma tela só, como o
              de peça. Eram esses dois que traziam o defeito antigo — o mesmo
              canto trocava de botão entre avançar e gravar, e um clique duplo
              gravava o cadastro pela metade. Sem etapa, some pela estrutura.
            */}
            <div style={{ display: "flex", gap: "8px" }}>
              <button type="submit" className="primary-button save-action-btn pdv-footer-button" disabled={isSaving}>
                <kbd>F5</kbd>
                  {isSaving ? "Salvando no Firestore..." : (editingSupplier ? "Salvar Alterações" : "Cadastrar Fornecedor")}
                </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
