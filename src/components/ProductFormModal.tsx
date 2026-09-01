import React, { useEffect, useMemo, useState } from "react";
import type { CategoryConfig, OrderRecord, ProductRecord, SaleRecord, SettingsConfig, StockEntryRecord, SupplierConfig } from "../types";
import { defaultProductCategories, defaultSystemLists } from "../types";
import { markupFromPrice, movementTotals, priceFromMarkup, productMovements } from "../inventory";
import { saveFirestoreDoc } from "../../app/firebase/client";
import { NumberField } from "./NumberField";

interface ProductFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: (product: ProductRecord) => void;
  editingProduct?: ProductRecord | null;
  categories: CategoryConfig[];
  suppliers: SupplierConfig[];
  notify: (msg: string) => void;
  allProducts: ProductRecord[];
  /** Unidades configuradas em Configurações → Listas do sistema. */
  units?: string[];
  /** Padrões da oficina (markup sugerido, estoque mínimo, unidade e modo de preço). */
  settings?: Partial<SettingsConfig> | null;
  /** Compras, vendas e OS, para montar o histórico da peça. */
  movementSources?: {
    stockEntries?: StockEntryRecord[];
    sales?: SaleRecord[];
    orders?: OrderRecord[];
  };
}

export const ProductFormModal: React.FC<ProductFormModalProps> = ({
  isOpen,
  onClose,
  onSaved,
  editingProduct,
  categories,
  suppliers,
  notify,
  allProducts,
  units = [],
  settings = null,
  movementSources,
}) => {
  const [activeTab, setActiveTab] = useState<"ident" | "prices" | "stock" | "compat" | "extra" | "history">("ident");
  const [isSaving, setIsSaving] = useState(false);

  // Form State
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [barcode, setBarcode] = useState("");
  const [partNumber, setPartNumber] = useState("");
  const [category, setCategory] = useState("");
  const [brand, setBrand] = useState("");
  const [unit, setUnit] = useState("UN");
  const [location, setLocation] = useState("");

  const [cost, setCost] = useState<number>(0);
  const [markup, setMarkup] = useState<number>(45);
  const [price, setPrice] = useState<number>(0);

  const [stock, setStock] = useState<number>(0);
  const [minimum, setMinimum] = useState<number>(2);
  const [maximum, setMaximum] = useState<number>(20);
  const [alertLowStock, setAlertLowStock] = useState(true);

  const [compatibility, setCompatibility] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [notes, setNotes] = useState("");
  const [active, setActive] = useState(true);

  // Available product categories from Firestore or fallback
  const productCategories = categories
    .filter((c) => c.group === "Produtos" && c.active !== false)
    .map((c) => c.name);

  const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const unitOptions = units.length ? units : defaultSystemLists.units;
  const movements = useMemo(
    () => (editingProduct ? productMovements(editingProduct.id, movementSources ?? {}) : []),
    [editingProduct, movementSources],
  );
  const totals = useMemo(() => movementTotals(movements), [movements]);
  // A mesma lista padrão que a tela de estoque usa: duas listas diferentes
  // faziam o produto nascer numa categoria que o filtro do estoque não conhecia.
  const defaultCategories = productCategories.length > 0
    ? productCategories
    : defaultProductCategories.map((item) => item.name);

  // Populate form on open / editingProduct change
  useEffect(() => {
    if (!isOpen) return;

    if (editingProduct) {
      setName(editingProduct.name || "");
      setCode(editingProduct.code || "");
      setBarcode(editingProduct.barcode || "");
      setPartNumber(editingProduct.partNumber || "");
      setCategory(editingProduct.category || defaultCategories[0] || "Peças");
      setBrand(editingProduct.brand || "");
      setUnit(editingProduct.unit || settings?.defaultUnit || "UN");
      setLocation(editingProduct.location || "");

      const parsedCost = typeof editingProduct.cost === "number" ? editingProduct.cost : Number(String(editingProduct.cost).replace(/[^\d,.]/g, "").replace(",", ".")) || 0;
      const parsedPrice = typeof editingProduct.price === "number" ? editingProduct.price : Number(String(editingProduct.price).replace(/[^\d,.]/g, "").replace(",", ".")) || 0;

      setCost(parsedCost);
      setPrice(parsedPrice);

      if (parsedCost > 0 && parsedPrice > 0) {
        const calculatedMarkup = Math.round(((parsedPrice - parsedCost) / parsedCost) * 100);
        setMarkup(calculatedMarkup);
      } else {
        setMarkup(editingProduct.markup ?? settings?.suggestedMarkup ?? 45);
      }

      setStock(editingProduct.stock ?? 0);
      setMinimum(editingProduct.minimum ?? settings?.defaultMinStock ?? 2);
      setMaximum(editingProduct.maximum ?? 20);
      setAlertLowStock(editingProduct.alertLowStock !== false);
      setCompatibility(editingProduct.compatibility || "");
      setSupplierId(editingProduct.supplierId || "");
      setNotes(editingProduct.notes || "");
      setActive(editingProduct.active !== false);
    } else {
      // Auto generate next code
      const nextNum = allProducts.length + 1;
      const generatedCode = `PRD-${String(nextNum).padStart(3, "0")}`;
      
      setName("");
      setCode(generatedCode);
      setBarcode("");
      setPartNumber("");
      setCategory(defaultCategories[0] || "Peças");
      setBrand("");
      setUnit(settings?.defaultUnit || unitOptions[0] || "UN");
      setLocation("");
      setCost(0);
      setMarkup(settings?.suggestedMarkup ?? 45);
      setPrice(0);
      setStock(0);
      setMinimum(settings?.defaultMinStock ?? 2);
      setMaximum(20);
      setAlertLowStock(true);
      setCompatibility("");
      setSupplierId("");
      setNotes("");
      setActive(true);
    }
    setActiveTab("ident");
  }, [isOpen, editingProduct, allProducts.length, settings?.defaultUnit, settings?.suggestedMarkup, settings?.defaultMinStock]);

  // "markup": o preço de venda é sempre custo + margem, e o campo fica travado —
  // é a configuração que garante a margem e impede vender abaixo do custo por
  // um erro de digitação. "fixed": o preço é digitado à mão e a margem apenas
  // acompanha. Definido em Configurações → Estoque & Reposição.
  const pricingMode = settings?.pricingMode ?? "fixed";
  const priceFollowsMarkup = pricingMode === "markup";

  const handleCostChange = (newCost: number) => {
    setCost(newCost);
    if (newCost > 0) setPrice(priceFromMarkup(newCost, markup));
  };

  const handleMarkupChange = (newMarkup: number) => {
    setMarkup(newMarkup);
    if (cost > 0) setPrice(priceFromMarkup(cost, newMarkup));
  };

  const handlePriceChange = (newPrice: number) => {
    if (priceFollowsMarkup) return;
    setPrice(newPrice);
    if (cost > 0 && newPrice >= cost) setMarkup(markupFromPrice(cost, newPrice));
  };

  const applyQuickMarkup = (quickMarkup: number) => {
    handleMarkupChange(quickMarkup);
  };

  const grossProfit = price - cost;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      notify("Informe o nome do produto.");
      setActiveTab("ident");
      return;
    }

    if (price <= 0) {
      notify("Informe um preço de venda maior que zero.");
      setActiveTab("prices");
      return;
    }

    setIsSaving(true);
    try {
      const productId = editingProduct?.id || code.trim() || `PRD-${Date.now()}`;
      const supplierObj = suppliers.find((s) => s.id === supplierId);

      const productData: ProductRecord = {
        id: productId,
        code: code.trim() || productId,
        barcode: barcode.trim(),
        partNumber: partNumber.trim(),
        name: name.trim(),
        category: category.trim() || defaultCategories[0] || "Peças",
        brand: brand.trim(),
        unit: unit.trim(),
        location: location.trim(),
        cost: cost.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
        markup,
        price: price.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
        stock: Number(stock) || 0,
        minimum: Number(minimum) || 0,
        maximum: Number(maximum) || 0,
        alertLowStock,
        compatibility: compatibility.trim(),
        supplierId,
        supplierName: supplierObj ? supplierObj.name : "",
        notes: notes.trim(),
        active,
        status: Number(stock) <= Number(minimum) ? (Number(stock) === 0 ? "Esgotado" : "Estoque baixo") : "Em estoque",
      };

      // Save directly in Firestore collection "products"
      await saveFirestoreDoc("products", productId, {
        code: productData.code,
        barcode: productData.barcode,
        partNumber: productData.partNumber,
        name: productData.name,
        category: productData.category,
        brand: productData.brand,
        unit: productData.unit,
        location: productData.location,
        // Texto em reais, não o número cru: o tipo ProductRecord declara
        // cost/price como string, a tabela de estoque imprime o valor direto
        // ("R$ 45,00") e a entrada de mercadoria grava no mesmo formato.
        // Gravando número, o produto voltava do Firestore como "45".
        cost: productData.cost,
        markup: productData.markup,
        price: productData.price,
        stock: productData.stock,
        minimum: productData.minimum,
        maximum: productData.maximum,
        alertLowStock: productData.alertLowStock,
        compatibility: productData.compatibility,
        supplierId: productData.supplierId,
        supplierName: productData.supplierName,
        notes: productData.notes,
        active: productData.active,
        status: productData.status,
      });

      onSaved(productData);
      notify(editingProduct ? "Produto atualizado com sucesso!" : "Produto cadastrado com sucesso!");
      onClose();
    } catch (err: unknown) {
      console.error("Erro ao salvar produto:", err);
      notify(err instanceof Error ? err.message : "Não foi possível salvar o produto.");
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="dialog-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dialog-window large-dialog" style={{ maxWidth: "780px" }}>
        <div className="dialog-head">
          <div>
            <strong>{editingProduct ? "Editar Produto" : "Novo Produto no Estoque"}</strong>
            <span>{editingProduct ? `Código: ${editingProduct.code} · ${editingProduct.name}` : "Preencha os dados da peça ou produto para controle de estoque e venda"}</span>
          </div>
          <button className="icon-close" onClick={onClose} aria-label="Fechar modal">✕</button>
        </div>

        {/* Tab Navigation */}
        <div className="dialog-tabs">
          <button type="button" className={`dialog-tab ${activeTab === "ident" ? "active" : ""}`} onClick={() => setActiveTab("ident")}>
            1. Identificação
          </button>
          <button type="button" className={`dialog-tab ${activeTab === "prices" ? "active" : ""}`} onClick={() => setActiveTab("prices")}>
            2. Preços & Margem
          </button>
          <button type="button" className={`dialog-tab ${activeTab === "stock" ? "active" : ""}`} onClick={() => setActiveTab("stock")}>
            3. Estoque & Mínimo
          </button>
          <button type="button" className={`dialog-tab ${activeTab === "compat" ? "active" : ""}`} onClick={() => setActiveTab("compat")}>
            4. Compatibilidade
          </button>
          <button type="button" className={`dialog-tab ${activeTab === "extra" ? "active" : ""}`} onClick={() => setActiveTab("extra")}>
            5. Fornecedor & Obs
          </button>
          {/* Só faz sentido em peça já cadastrada: produto novo não tem histórico. */}
          {editingProduct ? (
            <button type="button" className={`dialog-tab ${activeTab === "history" ? "active" : ""}`} onClick={() => setActiveTab("history")}>
              6. Movimentação {movements.length ? <b>{movements.length}</b> : null}
            </button>
          ) : null}
        </div>

        <form onSubmit={handleSubmit} className="dialog-body">
          {/* TAB 1: IDENTIFICAÇÃO */}
          {activeTab === "ident" && (
            <div className="form-section-stack">
              <div className="form-grid-2">
                <label className="field-group">
                  <span className="field-label">Nome do produto / peça <b className="req">*</b></span>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ex: Óleo Yamalube 20W50 4T 1L"
                    className="dialog-input"
                    autoFocus
                  />
                </label>
                <label className="field-group">
                  <span className="field-label">Categoria do Produto <b className="req">*</b></span>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="dialog-select"
                  >
                    {defaultCategories.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="form-grid-3">
                <label className="field-group">
                  <span className="field-label">Código interno (SKU)</span>
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="Ex: PRD-001"
                    className="dialog-input"
                  />
                </label>
                <label className="field-group">
                  <span className="field-label">Código de barras (EAN)</span>
                  <input
                    type="text"
                    value={barcode}
                    onChange={(e) => setBarcode(e.target.value)}
                    placeholder="789..."
                    className="dialog-input"
                  />
                </label>
                <label className="field-group">
                  <span className="field-label">Cód. fabricante (Part Number)</span>
                  <input
                    type="text"
                    value={partNumber}
                    onChange={(e) => setPartNumber(e.target.value)}
                    placeholder="Ex: 90793-AB401"
                    className="dialog-input"
                  />
                </label>
              </div>

              <div className="form-grid-3">
                <label className="field-group">
                  <span className="field-label">Marca / Fabricante</span>
                  <input
                    type="text"
                    value={brand}
                    onChange={(e) => setBrand(e.target.value)}
                    placeholder="Ex: Yamalube, Mobil, Cobreq"
                    className="dialog-input"
                  />
                </label>
                <label className="field-group">
                  <span className="field-label">Unidade de Medida</span>
                  <select
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    className="dialog-select"
                  >
                    {/* Lista vinda de Configurações -> Listas do sistema. Antes era
                        fixa aqui e diferente da lista de Configurações, então a
                        unidade padrão escolhida pelo dono podia nem aparecer. */}
                    {unitOptions.map((option) => <option value={option} key={option}>{option}</option>)}
                  </select>
                </label>
                <label className="field-group">
                  <span className="field-label">Localização no estoque</span>
                  <input
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="Ex: Prateleira B - Gaveta 4"
                    className="dialog-input"
                  />
                </label>
              </div>
            </div>
          )}

          {/* TAB 2: PREÇOS E MARGEM */}
          {activeTab === "prices" && (
            <div className="form-section-stack">
              <div className="pricing-box">
                <div className="form-grid-3">
                  <label className="field-group">
                    <span className="field-label">Preço de Custo (R$)</span>
                    <NumberField
                      step="0.01"
                      min={0}
                      fallback={0}
                      blankValue={0}
                    value={cost}
                      onChange={(valor) => handleCostChange(valor)}
                      placeholder="0,00"
                      className="dialog-input bold-number"
                    />
                  </label>

                  <div className="field-group">
                    <span className="field-label">Margem de Lucro (%)</span>
                    <NumberField
                      step="1"
                      fallback={0}
                      value={markup}
                      onChange={(valor) => handleMarkupChange(valor)}
                      placeholder="45"
                      className="dialog-input bold-number"
                    />
                    <div className="quick-badges-row">
                      {[30, 45, 60, 100].map((m) => (
                        <button
                          key={m}
                          type="button"
                          className={`badge-btn ${markup === m ? "active" : ""}`}
                          onClick={() => applyQuickMarkup(m)}
                        >
                          +{m}%
                        </button>
                      ))}
                    </div>
                  </div>

                  <label className="field-group">
                    <span className="field-label">Preço de Venda (R$) <b className="req">*</b></span>
                    <NumberField
                      step="0.01"
                      min={0.01}
                      required
                      fallback={0}
                      blankValue={0}
                    value={price}
                      onChange={(valor) => handlePriceChange(valor)}
                      placeholder="0,00"
                      readOnly={priceFollowsMarkup}
                      className={`dialog-input bold-number highlight-price ${priceFollowsMarkup ? "is-derived" : ""}`}
                    />
                    {priceFollowsMarkup ? (
                      <small className="field-help">Calculado pelo custo e pela margem. Para digitar o preço à mão, mude o modo de precificação em Configurações.</small>
                    ) : null}
                  </label>
                </div>

                {/* Live Margin Calculation Card */}
                <div className="profit-summary-card">
                  <div className="profit-item">
                    <span>Custo:</span>
                    <strong>{cost.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</strong>
                  </div>
                  <div className="profit-item">
                    <span>Margem:</span>
                    <strong className="profit-percent">+{markup}%</strong>
                  </div>
                  <div className="profit-item">
                    <span>Lucro Bruto Unitário:</span>
                    <strong className={grossProfit >= 0 ? "profit-positive" : "profit-negative"}>
                      {grossProfit.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                    </strong>
                  </div>
                  <div className="profit-item final-price">
                    <span>Venda Balcão:</span>
                    <strong>{price.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</strong>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: ESTOQUE E REPOSIÇÃO */}
          {activeTab === "stock" && (
            <div className="form-section-stack">
              <div className="form-grid-3">
                <label className="field-group">
                  <span className="field-label">Saldo Atual em Estoque</span>
                  <NumberField
                    min={0}
                    fallback={0}
                    value={stock}
                    onChange={(valor) => setStock(valor)}
                    className="dialog-input bold-number"
                  />
                </label>
                <label className="field-group">
                  <span className="field-label">Estoque Mínimo (Alerta)</span>
                  <NumberField
                    min={0}
                    fallback={0}
                    value={minimum}
                    onChange={(valor) => setMinimum(valor)}
                    className="dialog-input bold-number"
                  />
                </label>
                <label className="field-group">
                  <span className="field-label">Estoque Máximo sugerido</span>
                  <NumberField
                    min={0}
                    fallback={0}
                    value={maximum}
                    onChange={(valor) => setMaximum(valor)}
                    className="dialog-input"
                  />
                </label>
              </div>

              <div className="toggle-row-card">
                <div>
                  <strong>Alerta de reposição ativo</strong>
                  <span>Avisar na visão geral e na lista quando o saldo estiver igual ou abaixo do estoque mínimo</span>
                </div>
                <label className="switch-toggle">
                  <input
                    type="checkbox"
                    checked={alertLowStock}
                    onChange={(e) => setAlertLowStock(e.target.checked)}
                  />
                  <span className="slider round"></span>
                </label>
              </div>
            </div>
          )}

          {/* TAB 4: COMPATIBILIDADE */}
          {activeTab === "compat" && (
            <div className="form-section-stack">
              <label className="field-group">
                <span className="field-label">Motos e Modelos Compatíveis</span>
                <textarea
                  rows={4}
                  value={compatibility}
                  onChange={(e) => setCompatibility(e.target.value)}
                  placeholder="Ex: Honda CG 125 (1999-2008), CG 150 Titan (2004-2015), Fan 160 (2016 em diante), NXR 150 Bros"
                  className="dialog-textarea"
                />
                <small className="field-hint">
                  Digite os modelos de motos para que os atendentes possam pesquisar rapidamente pela moto do cliente no balcão.
                </small>
              </label>
            </div>
          )}

          {/* TAB 5: FORNECEDOR E EXTRAS */}
          {activeTab === "extra" && (
            <div className="form-section-stack">
              <label className="field-group">
                <span className="field-label">Fornecedor Preferencial</span>
                <select
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                  className="dialog-select"
                >
                  <option value="">-- Selecione o fornecedor (opcional) --</option>
                  {suppliers.map((sup) => (
                    <option key={sup.id} value={sup.id}>
                      {sup.name} {sup.phone ? `(${sup.phone})` : ""}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field-group">
                <span className="field-label">Observações internas</span>
                <textarea
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ex: Comprado em caixa com 12 unidades. Garantia de 90 dias com o fabricante."
                  className="dialog-textarea"
                />
              </label>

              <div className="toggle-row-card">
                <div>
                  <strong>Produto Ativo para Venda</strong>
                  <span>Produtos inativos não aparecem na pesquisa rápida do PDV ou Ordens de Serviço</span>
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

          {/* TAB 6: MOVIMENTAÇÃO */}
          {activeTab === "history" && (
            <div className="form-section-stack">
              <div className="module-summary">
                <article><span>Entrou</span><strong>{totals.inboundQuantity} un.</strong><small>{money(totals.inboundValue)} em compras</small></article>
                <article><span>Saiu</span><strong>{totals.outboundQuantity} un.</strong><small>{money(totals.outboundValue)} em vendas e OS</small></article>
                <article><span>Em estoque agora</span><strong>{stock} un.</strong><small>Mínimo de {minimum} un.</small></article>
              </div>

              {movements.length ? (
                <div className="table-scroll">
                  <table>
                    <thead><tr><th>Documento</th><th>Origem</th><th>Data</th><th>Qtd.</th><th>Unitário</th><th>Total</th></tr></thead>
                    <tbody>
                      {movements.map((movement, index) => (
                        <tr key={`${movement.documentId}-${index}`}>
                          <td><strong className="order-id">{movement.documentId}</strong><span>{movement.detail}</span></td>
                          <td><span className={`status ${movement.quantity > 0 ? "green" : "blue"}`}><i/>{movement.kind}</span></td>
                          <td>{movement.date || "—"}</td>
                          <td className="mono"><strong>{movement.quantity > 0 ? `+${movement.quantity}` : movement.quantity}</strong></td>
                          <td className="mono">{money(movement.unitValue)}</td>
                          <td className="mono">{money(Math.abs(movement.total))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="empty-panel">
                  <span>Nenhuma movimentação registrada para esta peça ainda.</span>
                </div>
              )}

              <span className="settings-hint">
                As saídas por ordem de serviço aparecem quando a peça é realmente baixada do estoque — uma OS ainda em orçamento não conta.
              </span>
            </div>
          )}

          {/* Dialog Footer Actions */}
          <div className="dialog-actions-row">
            <button
              type="button"
              className="outline-button"
              onClick={onClose}
              disabled={isSaving}
            >
              Cancelar
            </button>
            <div style={{ display: "flex", gap: "8px" }}>
              {activeTab !== "ident" && activeTab !== "history" && (
                <button
                  type="button"
                  className="outline-button"
                  onClick={() => {
                    // A aba de movimentação fica fora: é leitura, não etapa do cadastro.
                    const tabs = ["ident", "prices", "stock", "compat", "extra"] as const;
                    const currIdx = tabs.indexOf(activeTab);
                    if (currIdx > 0) setActiveTab(tabs[currIdx - 1]!);
                  }}
                >
                  Anterior
                </button>
              )}
              {activeTab !== "extra" && activeTab !== "history" ? (
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => {
                    // A aba de movimentação fica fora: é leitura, não etapa do cadastro.
                    const tabs = ["ident", "prices", "stock", "compat", "extra"] as const;
                    const currIdx = tabs.indexOf(activeTab);
                    if (currIdx < tabs.length - 1) setActiveTab(tabs[currIdx + 1]!);
                  }}
                >
                  Próxima etapa →
                </button>
              ) : (
                <button
                  type="submit"
                  className="primary-button save-action-btn"
                  disabled={isSaving}
                >
                  {isSaving ? "Salvando no Firestore..." : (editingProduct ? "Salvar Alterações" : "Cadastrar Produto")}
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
