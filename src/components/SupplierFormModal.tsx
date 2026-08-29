import React, { useState, useEffect } from "react";
import type { SupplierConfig } from "../types";
import { saveFirestoreDoc } from "../../app/firebase/client";

interface SupplierFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: (supplier: SupplierConfig) => void;
  editingSupplier?: SupplierConfig | null;
  notify: (msg: string) => void;
  allSuppliers: SupplierConfig[];
}

export const SupplierFormModal: React.FC<SupplierFormModalProps> = ({
  isOpen,
  onClose,
  onSaved,
  editingSupplier,
  notify,
  allSuppliers,
}) => {
  const [activeTab, setActiveTab] = useState<"ident" | "contact" | "commercial" | "address" | "notes">("ident");
  const [isSaving, setIsSaving] = useState(false);

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
    setActiveTab("ident");
  }, [isOpen, editingSupplier]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      notify("Informe a Razão Social ou Nome do fornecedor.");
      setActiveTab("ident");
      return;
    }

    if (!phone.trim()) {
      notify("Informe o WhatsApp ou telefone de contato.");
      setActiveTab("contact");
      return;
    }

    setIsSaving(true);
    try {
      const supplierId = editingSupplier?.id || `SUP-${String(allSuppliers.length + 1).padStart(3, "0")}`;

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
      notify(err instanceof Error ? err.message : "Não foi possível salvar o fornecedor.");
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="dialog-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dialog-window large-dialog" style={{ maxWidth: "740px" }}>
        <div className="dialog-head">
          <div>
            <strong>{editingSupplier ? "Editar Fornecedor" : "Novo Fornecedor"}</strong>
            <span>{editingSupplier ? `${editingSupplier.name} · Contato: ${editingSupplier.phone}` : "Cadastre distribuidoras de peças, ferramentas e produtos"}</span>
          </div>
          <button className="icon-close" onClick={onClose} aria-label="Fechar modal">✕</button>
        </div>

        <div className="dialog-tabs">
          <button type="button" className={`dialog-tab ${activeTab === "ident" ? "active" : ""}`} onClick={() => setActiveTab("ident")}>
            1. Empresa
          </button>
          <button type="button" className={`dialog-tab ${activeTab === "contact" ? "active" : ""}`} onClick={() => setActiveTab("contact")}>
            2. Contato
          </button>
          <button type="button" className={`dialog-tab ${activeTab === "commercial" ? "active" : ""}`} onClick={() => setActiveTab("commercial")}>
            3. Comercial & Prazo
          </button>
          <button type="button" className={`dialog-tab ${activeTab === "address" ? "active" : ""}`} onClick={() => setActiveTab("address")}>
            4. Endereço
          </button>
          <button type="button" className={`dialog-tab ${activeTab === "notes" ? "active" : ""}`} onClick={() => setActiveTab("notes")}>
            5. Observações
          </button>
        </div>

        <form onSubmit={handleSubmit} className="dialog-body">
          {/* TAB 1: IDENTIFICAÇÃO */}
          {activeTab === "ident" && (
            <div className="form-section-stack">
              <div className="form-grid-2">
                <label className="field-group">
                  <span className="field-label">Razão Social / Nome Oficial <b className="req">*</b></span>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ex: Moto Peças Distribuidora Ltda"
                    className="dialog-input"
                    autoFocus
                  />
                </label>
                <label className="field-group">
                  <span className="field-label">Nome Fantasia / Marca</span>
                  <input
                    type="text"
                    value={tradeName}
                    onChange={(e) => setTradeName(e.target.value)}
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
                    onChange={(e) => setDocument(e.target.value)}
                    placeholder="00.000.000/0001-00"
                    className="dialog-input"
                  />
                </label>
                <label className="field-group">
                  <span className="field-label">Linhas / Categorias fornecidas</span>
                  <input
                    type="text"
                    value={categories}
                    onChange={(e) => setCategories(e.target.value)}
                    placeholder="Ex: Motores, Freios, Lubrificantes, Pneus"
                    className="dialog-input"
                  />
                </label>
              </div>
            </div>
          )}

          {/* TAB 2: CONTATO */}
          {activeTab === "contact" && (
            <div className="form-section-stack">
              <div className="form-grid-2">
                <label className="field-group">
                  <span className="field-label">WhatsApp / Telefone Principal <b className="req">*</b></span>
                  <input
                    type="text"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="(11) 98765-4321"
                    className="dialog-input bold-number"
                  />
                </label>
                <label className="field-group">
                  <span className="field-label">Telefone Secundário / Fixo</span>
                  <input
                    type="text"
                    value={phoneSecondary}
                    onChange={(e) => setPhoneSecondary(e.target.value)}
                    placeholder="(11) 3344-5566"
                    className="dialog-input"
                  />
                </label>
              </div>

              <div className="form-grid-2">
                <label className="field-group">
                  <span className="field-label">E-mail Comercial / Pedidos</span>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="pedidos@distribuidora.com.br"
                    className="dialog-input"
                  />
                </label>
                <label className="field-group">
                  <span className="field-label">Nome do Vendedor / Representante</span>
                  <input
                    type="text"
                    value={representative}
                    onChange={(e) => setRepresentative(e.target.value)}
                    placeholder="Ex: Carlos Oliveira"
                    className="dialog-input"
                  />
                </label>
              </div>
            </div>
          )}

          {/* TAB 3: COMERCIAL */}
          {activeTab === "commercial" && (
            <div className="form-section-stack">
              <div className="form-grid-3">
                <label className="field-group">
                  <span className="field-label">Prazo Médio de Entrega (dias)</span>
                  <input
                    type="number"
                    min="0"
                    value={deliveryDays}
                    onChange={(e) => setDeliveryDays(parseInt(e.target.value, 10) || 0)}
                    className="dialog-input bold-number"
                  />
                  <small className="field-hint">0 = Entrega no mesmo dia</small>
                </label>
                <label className="field-group">
                  <span className="field-label">Condição de Pagamento Padrão</span>
                  <input
                    type="text"
                    value={paymentTerms}
                    onChange={(e) => setPaymentTerms(e.target.value)}
                    placeholder="Ex: Boleto 28 dias / PIX 5% desc."
                    className="dialog-input"
                  />
                </label>
                <label className="field-group">
                  <span className="field-label">Valor de Pedido Mínimo (R$)</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={minimumOrder === 0 ? "" : minimumOrder}
                    onChange={(e) => setMinimumOrder(parseFloat(e.target.value) || 0)}
                    placeholder="0,00"
                    className="dialog-input"
                  />
                </label>
              </div>
            </div>
          )}

          {/* TAB 4: ENDEREÇO */}
          {activeTab === "address" && (
            <div className="form-section-stack">
              <label className="field-group">
                <span className="field-label">Endereço (Rua, Número e Bairro)</span>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
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
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="Ex: São Paulo"
                    className="dialog-input"
                  />
                </label>
                <label className="field-group">
                  <span className="field-label">Estado (UF)</span>
                  <input
                    type="text"
                    maxLength={2}
                    value={state}
                    onChange={(e) => setState(e.target.value.toUpperCase())}
                    placeholder="SP"
                    className="dialog-input"
                  />
                </label>
              </div>
            </div>
          )}

          {/* TAB 5: OBSERVAÇÕES */}
          {activeTab === "notes" && (
            <div className="form-section-stack">
              <label className="field-group">
                <span className="field-label">Observações e Histórico de Acordos</span>
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

          <div className="dialog-actions-row">
            <button type="button" className="outline-button" onClick={onClose} disabled={isSaving}>
              Cancelar
            </button>
            <div style={{ display: "flex", gap: "8px" }}>
              {activeTab !== "ident" && (
                <button
                  type="button"
                  className="outline-button"
                  onClick={() => {
                    const tabs: Array<"ident" | "contact" | "commercial" | "address" | "notes"> = ["ident", "contact", "commercial", "address", "notes"];
                    const currIdx = tabs.indexOf(activeTab);
                    if (currIdx > 0) setActiveTab(tabs[currIdx - 1]);
                  }}
                >
                  Anterior
                </button>
              )}
              {activeTab !== "notes" ? (
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => {
                    const tabs: Array<"ident" | "contact" | "commercial" | "address" | "notes"> = ["ident", "contact", "commercial", "address", "notes"];
                    const currIdx = tabs.indexOf(activeTab);
                    if (currIdx < tabs.length - 1) setActiveTab(tabs[currIdx + 1]);
                  }}
                >
                  Próxima etapa →
                </button>
              ) : (
                <button type="submit" className="primary-button save-action-btn" disabled={isSaving}>
                  {isSaving ? "Salvando no Firestore..." : (editingSupplier ? "Salvar Alterações" : "Cadastrar Fornecedor")}
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
