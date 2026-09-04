import React, { useEffect, useMemo, useRef, useState } from "react";
import type { CategoryConfig, OrderRecord, ProductRecord, SaleRecord, SettingsConfig, StockEntryRecord, SupplierConfig } from "../types";
import { emMaiusculo } from "../text-case";
import { QuickAddSelect } from "./QuickAddSelect";
import { marginOnPrice, maxDiscountPercent, priceWarning } from "../pricing";
import { defaultProductCategories, defaultSystemLists } from "../types";
import { markupFromPrice, movementTotals, priceFromMarkup, productMovements } from "../inventory";
import { nextSequentialId } from "../firestore-data";
import { isInternalEan13, isValidEan13, uniqueInternalEan13 } from "../barcode";
import { saveFirestoreDoc } from "../../app/firebase/client";
import { NumberField } from "./NumberField";
import { RemovalButton, type RemovalConfig } from "./RemovalButton";

interface ProductFormModalProps {
  /** Excluir a peça pelo próprio formulário. Ausente = só criar e editar. */
  removal?: RemovalConfig;
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
  partBrands?: string[];
  /**
   * Criar categoria e marca sem sair do cadastro.
   *
   * Sem isso, descobrir que a categoria da peça não existe obrigava a fechar o
   * formulário, ir em Configurações, criar, voltar e digitar tudo de novo. Na
   * prática ninguém faz: joga em "Peças" e segue, e o filtro do estoque para
   * de significar alguma coisa.
   */
  onCreateCategory?: (nome: string) => Promise<void> | void;
  onCreatePartBrand?: (nome: string) => Promise<void> | void;
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
  removal,
  isOpen,
  onClose,
  onSaved,
  editingProduct,
  categories,
  suppliers,
  notify,
  allProducts,
  units = [],
  partBrands = [],
  onCreateCategory,
  onCreatePartBrand,
  settings = null,
  movementSources,
}) => {
  const [activeTab, setActiveTab] = useState<"dados" | "history">("dados");
  const [isSaving, setIsSaving] = useState(false);
  const formularioRef = useRef<HTMLFormElement>(null);
  // O que falta preencher, dito dentro do formulário. Era um aviso de canto
  // que aparecia atrás do modal.
  const [erro, setErro] = useState("");

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
  const brandOptions = partBrands.length ? partBrands : defaultSystemLists.partBrands;
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
      // O código sai do maior número já emitido, e não da quantidade de peças:
      // contar a lista faz a próxima peça reaproveitar o código de uma peça
      // apagada e sobrescrever o cadastro dela.
      const generatedCode = nextSequentialId(allProducts, "PRD");
      
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
    setActiveTab("dados");
  }, [isOpen, editingProduct, allProducts.length, settings?.defaultUnit, settings?.suggestedMarkup, settings?.defaultMinStock]);

  /**
   * F5 grava e Esc fecha, como no sistema que a oficina já usa.
   *
   * O atalho está escrito no botão, então precisa funcionar de verdade — um
   * rótulo "F5" que não faz nada é pior que não ter rótulo. F5 é o refresh do
   * navegador, e por isso o atalho é ligado SÓ enquanto este formulário está
   * aberto: fechou o cadastro, F5 volta a recarregar a página. Quem quiser
   * recarregar com o cadastro aberto ainda tem Ctrl+R.
   *
   * O hook fica aqui em cima, antes de qualquer return: hook depois de return
   * é o que já derrubou a tela duas vezes neste projeto.
   */
  useEffect(() => {
    if (!isOpen) return;
    const noTeclado = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") { evento.preventDefault(); onClose(); return; }
      if (evento.key !== "F5") return;
      evento.preventDefault();
      // Dispara o mesmo submit do botão, para passar pela conferência dos
      // campos obrigatórios em vez de gravar por fora dela.
      formularioRef.current?.requestSubmit();
    };
    window.addEventListener("keydown", noTeclado);
    return () => window.removeEventListener("keydown", noTeclado);
  }, [isOpen, onClose]);

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

    // Enter dentro de um campo dispara este submit. Com o cadastro numa tela
    // só isso é o que se espera — mas os dois campos obrigatórios são
    // conferidos antes de qualquer gravação, senão a peça entrava pela metade
    // e a tela sumia, como se tivesse dado erro.

    if (!name.trim()) {
      setErro("Informe o nome da peça antes de cadastrar.");
      setActiveTab("dados");
      return;
    }

    if (price <= 0) {
      setErro("Informe um preço de venda maior que zero.");
      setActiveTab("dados");
      return;
    }
    setErro("");

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
      setErro(err instanceof Error ? err.message : "Não foi possível salvar a peça. Verifique a conexão e tente de novo.");
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="dialog-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      {/* Mais largo que os outros formulários: são a régua de campos, as três
          colunas de números e o painel de parâmetros lado a lado. */}
      <div className="dialog-window large-dialog" style={{ width: "min(940px, 100%)", maxWidth: "940px" }}>
        {/* Barra de título de uma linha só, como a da referência: o nome da
            peça já está no primeiro campo, repeti-lo aqui gastava uma linha. */}
        <div className="dialog-head pdv-head">
          <div>
            <strong>{editingProduct ? "Cadastro de peça" : "Nova peça no estoque"}</strong>
            {editingProduct ? <span>{editingProduct.code}</span> : null}
          </div>
          <button className="icon-close" onClick={onClose} aria-label="Fechar modal">✕</button>
        </div>

        {/*
          Uma aba de dados, e não cinco etapas.

          O cadastro pedia "Próxima etapa" quatro vezes para uma peça que se
          cadastra em vinte segundos, e três dos quatro cliques só serviam para
          chegar no campo seguinte. A referência que a oficina usa todo dia
          (White PDV) põe tudo numa aba só, com o rótulo à esquerda do campo —
          e é o que cabe aqui também. A movimentação continua em aba própria:
          é leitura, não etapa do cadastro.
        */}
        <div className="dialog-tabs">
          <button type="button" className={`dialog-tab ${activeTab === "dados" ? "active" : ""}`} onClick={() => setActiveTab("dados")}>
            Dados da peça
          </button>
          {editingProduct ? (
            <button type="button" className={`dialog-tab ${activeTab === "history" ? "active" : ""}`} onClick={() => setActiveTab("history")}>
              Movimentação {movements.length ? <b>{movements.length}</b> : null}
            </button>
          ) : null}
        </div>

        <form ref={formularioRef} onSubmit={handleSubmit} className="dialog-body">
          {erro ? <div className="settings-modal-error" role="alert"><b>!</b><span>{erro}</span></div> : null}

          {activeTab === "dados" && (
            <div className="pdv-body">
              <div className="pdv-form">
                <div className="pdv-row">
                  <span className="pdv-label">Descrição <b className="req">*</b></span>
                  <input type="text" required value={name} onChange={(e) => setName(emMaiusculo(e.target.value))}
                    placeholder="EX: OLEO YAMALUBE 20W50 4T 1L" className="dialog-input" autoFocus/>
                </div>

                <div className="pdv-row pair">
                  <span className="pdv-label">Código</span>
                  <input type="text" value={code} onChange={(e) => setCode(emMaiusculo(e.target.value))} placeholder="PRD-001" className="dialog-input"/>
                  <span className="pdv-label">Referência</span>
                  <input type="text" value={partNumber} onChange={(e) => setPartNumber(emMaiusculo(e.target.value))} placeholder="90793-AB401" className="dialog-input"/>
                </div>

                <div className="pdv-row">
                  <span className="pdv-label">Cód. de barras</span>
                  {/*
                    Nem toda peça vem com código de fábrica — adesivo, parafuso
                    avulso, peça usada. Sem código, a leitora não serve e a
                    venda volta a ser digitada à mão, que é onde o erro entra.
                    O gerado começa com 2, faixa que o padrão GS1 reserva para
                    código de circulação restrita: vale dentro da oficina e não
                    conflita com produto de fabricante nenhum.
                  */}
                  <div className="input-with-action">
                    <input type="text" value={barcode} onChange={(e) => setBarcode(emMaiusculo(e.target.value))} placeholder="789..." className="dialog-input"/>
                    <button type="button" className="input-action-button" title="Gerar um código interno para peça sem código de fábrica"
                      onClick={() => {
                        const codigo = uniqueInternalEan13(allProducts.map((peca) => peca.barcode ?? ""));
                        if (!codigo) return setErro("Não foi possível gerar um código livre. Tente de novo.");
                        setErro("");
                        setBarcode(codigo);
                      }}>Gerar</button>
                  </div>
                  <span className="pdv-hint">
                    {barcode && isInternalEan13(barcode)
                      ? "Código interno da oficina. Imprima a etiqueta e cole na peça."
                      : barcode && !isValidEan13(barcode)
                        ? "Este código não passa na conferência do EAN-13. Confira a digitação ou gere um interno."
                        : "Peça sem código de fábrica? Use Gerar."}
                  </span>
                </div>

                {/*
                  <div>, não <label>: um <button> dentro de <label> faz o clique
                  no "+" acionar TAMBÉM o controle do label (o próprio select).
                */}
                <div className="pdv-row">
                  <span className="pdv-label">Grupo <b className="req">*</b></span>
                  {onCreateCategory ? (
                    <QuickAddSelect value={category} onChange={setCategory} options={defaultCategories} onCreate={onCreateCategory}
                      placeholder="Ex: FILTROS" createTitle="Criar uma categoria sem sair do cadastro"/>
                  ) : (
                    <select value={category} onChange={(e) => setCategory(e.target.value)} className="dialog-select">
                      {defaultCategories.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
                    </select>
                  )}
                </div>

                <div className="pdv-row">
                  <span className="pdv-label">Marca</span>
                  {/*
                    Só dava para digitar, e cada pessoa escrevia de um jeito
                    ("Motul", "MOTUL", "motul 5100"): o filtro por marca no
                    estoque não juntava nada.
                  */}
                  {onCreatePartBrand ? (
                    <QuickAddSelect value={brand.trim()} onChange={setBrand} options={brandOptions} onCreate={onCreatePartBrand}
                      emptyLabel="Sem marca definida" placeholder="Ex: COBREQ" createTitle="Criar uma marca sem sair do cadastro"/>
                  ) : (
                    <select value={brand === "" || brandOptions.includes(brand) ? brand : "__outra__"}
                      onChange={(e) => setBrand(e.target.value === "__outra__" ? " " : e.target.value)} className="dialog-input">
                      <option value="">Sem marca definida</option>
                      {brandOptions.map((nome) => <option key={nome} value={nome}>{nome}</option>)}
                    </select>
                  )}
                </div>

                <div className="pdv-row pair">
                  <span className="pdv-label">Unidade</span>
                  {/* Lista vinda de Configurações → Listas do sistema. */}
                  <select value={unit} onChange={(e) => setUnit(e.target.value)} className="dialog-select">
                    {unitOptions.map((option) => <option value={option} key={option}>{option}</option>)}
                  </select>
                  <span className="pdv-label">Localização</span>
                  <input type="text" value={location} onChange={(e) => setLocation(emMaiusculo(e.target.value))} placeholder="PRATELEIRA B4" className="dialog-input"/>
                </div>

                <div className="pdv-row">
                  <span className="pdv-label">Fornecedor</span>
                  <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="dialog-select">
                    <option value="">Sem fornecedor preferencial</option>
                    {suppliers.map((sup) => <option key={sup.id} value={sup.id}>{sup.name}{sup.phone ? ` (${sup.phone})` : ""}</option>)}
                  </select>
                </div>

                <div className="pdv-row tall">
                  <span className="pdv-label">Motos compatíveis</span>
                  <textarea rows={2} value={compatibility} onChange={(e) => setCompatibility(e.target.value)}
                    placeholder="Ex: CG 125 (1999-2008), CG 150 TITAN, FAN 160" className="dialog-textarea"/>
                  <span className="pdv-hint">É por aqui que o balcão acha a peça pela moto do cliente.</span>
                </div>

                <div className="pdv-row tall">
                  <span className="pdv-label">Observações</span>
                  <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)}
                    placeholder="Ex: caixa com 12 unidades, garantia de 90 dias" className="dialog-textarea"/>
                </div>

                {/* Os números, em três colunas como na referência: o que se
                    paga, o que se tem, e o que sai da conta. */}
                <div className="pdv-numbers">
                  <section>
                    <h4>Preço</h4>
                    <label className="pdv-num">
                      <span>Preço compra</span>
                      <NumberField step="0.01" min={0} fallback={0} blankValue={0} value={cost} onChange={handleCostChange} placeholder="0,00"/>
                    </label>
                    <label className="pdv-num">
                      <span>Margem s/ custo (%)</span>
                      <NumberField step="1" fallback={0} value={markup} onChange={handleMarkupChange} placeholder="45"/>
                    </label>
                    <label className="pdv-num">
                      <span>Preço venda <b className="req">*</b></span>
                      <NumberField step="0.01" min={0.01} required fallback={0} blankValue={0} value={price} onChange={handlePriceChange}
                        placeholder="0,00" readOnly={priceFollowsMarkup}/>
                    </label>
                    {priceFollowsMarkup ? <span className="pdv-hint">Sai do custo com a margem. Para digitar à mão, mude o modo de preço em Configurações.</span> : null}
                  </section>

                  <section>
                    <h4>Estoque</h4>
                    <label className="pdv-num">
                      <span>Estoque atual</span>
                      <NumberField min={0} fallback={0} value={stock} onChange={setStock}/>
                    </label>
                    <label className="pdv-num">
                      <span>Estoque mínimo</span>
                      <NumberField min={0} fallback={0} value={minimum} onChange={setMinimum}/>
                    </label>
                    <label className="pdv-num">
                      <span>Estoque máximo</span>
                      <NumberField min={0} fallback={0} value={maximum} onChange={setMaximum}/>
                    </label>
                  </section>

                  <section>
                    <h4>Resultado</h4>
                    {/*
                      Duas margens, de propósito. O campo "+60%" é margem sobre
                      o CUSTO: custo 25 vira preço 40. Sobre a VENDA isso é
                      37,5% — e é a porcentagem sobre a venda que se compara com
                      a do cartão e com a do concorrente. Ver só o número maior
                      faz a oficina achar que ganha mais do que ganha.
                    */}
                    <div className="pdv-num readonly">
                      <span>Margem s/ venda</span>
                      <b>{marginOnPrice(cost, price).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</b>
                    </div>
                    <div className="pdv-num readonly">
                      <span>Lucro por un.</span>
                      <b className={grossProfit >= 0 ? "bom" : "ruim"}>{money(grossProfit)}</b>
                    </div>
                    {/*
                      O PDV deixa descontar. Sem saber o piso, o desconto "de
                      bom moço" vende abaixo do que se pagou ao fornecedor.
                    */}
                    <div className="pdv-num readonly">
                      <span>Desconto máximo</span>
                      <b>{maxDiscountPercent(cost, price).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</b>
                    </div>
                    <div className="pdv-num readonly">
                      <span>Piso sem prejuízo</span>
                      <b>{money(cost)}</b>
                    </div>
                  </section>
                </div>

                {priceWarning(cost, price) ? (
                  <div className="price-warning" role="alert"><b>!</b><span>{priceWarning(cost, price)}</span></div>
                ) : null}
              </div>

              {/* O "Parâmetros" da referência: as marcações que valem para a
                  peça inteira, fora da régua de campos. */}
              <aside className="pdv-side">
                <div className="pdv-params">
                  <h4>Parâmetros</h4>
                  <label>
                    <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)}/>
                    <span>Ativo<small>Peça inativa some da busca do PDV e da OS</small></span>
                  </label>
                  <label>
                    <input type="checkbox" checked={alertLowStock} onChange={(e) => setAlertLowStock(e.target.checked)}/>
                    <span>Alerta de reposição<small>Avisa quando o saldo chega no mínimo</small></span>
                  </label>
                </div>
                <div className="pdv-params">
                  <h4>Margem rápida</h4>
                  <div className="pdv-quick-markup">
                    {[30, 45, 60, 100].map((m) => (
                      <button key={m} type="button" className={`badge-btn ${markup === m ? "active" : ""}`} onClick={() => applyQuickMarkup(m)}>+{m}%</button>
                    ))}
                  </div>
                </div>
                {editingProduct ? (
                  <div className="pdv-params">
                    <h4>Movimentação</h4>
                    <label style={{ cursor: "default" }}><span>Entrou<small>{totals.inboundQuantity} un. · {money(totals.inboundValue)}</small></span></label>
                    <label style={{ cursor: "default" }}><span>Saiu<small>{totals.outboundQuantity} un. · {money(totals.outboundValue)}</small></span></label>
                  </div>
                ) : null}
              </aside>
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
            <div>
              <button
                type="button"
                className="outline-button pdv-footer-button"
                onClick={onClose}
                disabled={isSaving}
              >
                <kbd>Esc</kbd>
                Cancelar
              </button>
              {editingProduct && removal ? <RemovalButton tipo="produto" colecao="products" id={editingProduct.id} nome={editingProduct.name} {...removal}/> : null}
            </div>
            {/*
              Sem "Anterior" e "Próxima etapa": não há mais etapa nenhuma.

              Esses dois botões existiam por causa do assistente de cinco
              passos, e traziam junto o defeito que eles evitavam — o mesmo
              canto trocava de botão entre "Próxima etapa" e "Cadastrar", então
              um clique duplo avançava e gravava a peça pela metade. Com uma
              tela só o problema deixa de existir.

              O atalho no rótulo é o do sistema que a oficina já usa: F5 grava,
              Esc fecha. Os dois são ligados de verdade, e só enquanto este
              formulário está aberto.
            */}
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                type="submit"
                className="primary-button save-action-btn pdv-footer-button"
                disabled={isSaving}
              >
                <kbd>F5</kbd>
                {isSaving ? "Salvando no Firestore..." : (editingProduct ? "Salvar Alterações" : "Cadastrar Produto")}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
