// Hakan Aytaş CodeBug yapımıdır - İletişim: hffhakan@gmail.com
// menu-stock.js
// Ürün ekleme/düzenleme/silme, stok takibi ve Gün Sonu Yüzey Raporu.

// ============ STOK LİSTESİ RENDER ============
function renderStockList(filterText) {
  const list = document.getElementById("stockList");
  if (!list) return;
  list.innerHTML = "";

  const q = (filterText ?? document.getElementById("stockSearchInput")?.value ?? "").trim().toLowerCase();
  const filtered = State.products.filter((p) => p.name.toLowerCase().includes(q));

  if (filtered.length === 0) {
    list.innerHTML = `<p class="text-gray-400 text-sm col-span-full">Ürün bulunamadı. "+ Ürün Ekle" ile başlayın.</p>`;
    return;
  }

  filtered.forEach((p) => {
    const low = Number(p.stock) <= 5;
    const card = document.createElement("div");
    card.className = "stock-card";
    card.innerHTML = `
      <div class="stock-card-cat">${escapeHtml(p.category || "-")}</div>
      <div class="stock-card-name">${escapeHtml(p.name)}</div>
      <div class="stock-card-price">${formatCurrency(p.price)}</div>
      <div class="stock-card-qty ${low ? "low" : "ok"}">${low ? "⚠️" : "✅"} Stok: ${p.stock}</div>
    `;
    card.addEventListener("click", () => openProductModal(p));
    list.appendChild(card);
  });
}

document.getElementById("stockSearchInput").addEventListener("input", (e) => renderStockList(e.target.value));

// ============ ÜRÜN MODALI (EKLE / DÜZENLE) ============
document.getElementById("addProductBtn").addEventListener("click", () => openProductModal(null));

function openProductModal(product) {
  const form = document.getElementById("productForm");
  form.reset();
  document.getElementById("deleteProductBtn").classList.toggle("hidden", !product);

  if (product) {
    document.getElementById("productId").value = product.id;
    document.getElementById("productName").value = product.name;
    document.getElementById("productCategory").value = product.category || "";
    document.getElementById("productPrice").value = product.price;
    document.getElementById("productStock").value = product.stock;
  } else {
    document.getElementById("productId").value = "";
  }
  openModal("productModal");
}

document.getElementById("productForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = document.getElementById("productId").value;
  const data = {
    name: document.getElementById("productName").value.trim(),
    category: document.getElementById("productCategory").value.trim(),
    price: Number(document.getElementById("productPrice").value),
    stock: Number(document.getElementById("productStock").value),
  };

  if (id) {
    await KafeDB.productsCol(State.businessId).doc(id).update(data);
    showToast("Ürün güncellendi.");
  } else {
    await KafeDB.productsCol(State.businessId).add(data);
    showToast("Ürün eklendi.");
  }
  closeModal("productModal");
});

document.getElementById("deleteProductBtn").addEventListener("click", async () => {
  const id = document.getElementById("productId").value;
  if (!id) return;
  if (!confirm("Bu ürünü silmek istediğinize emin misiniz?")) return;
  await KafeDB.productsCol(State.businessId).doc(id).delete();
  closeModal("productModal");
  showToast("Ürün silindi.");
});

// ============ GÜN SONU YÜZEY RAPORU ============
async function renderDayEndReport() {
  const area = document.getElementById("reportArea");
  area.innerHTML = `<p class="text-gray-400 text-sm">Rapor hazırlanıyor...</p>`;

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const snap = await KafeDB.ordersCol(State.businessId)
    .where("closedAt", ">=", firebase.firestore.Timestamp.fromDate(startOfDay))
    .get();

  const orders = snap.docs.map((d) => d.data());
  const totalRevenue = orders.reduce((sum, o) => sum + (o.total || 0), 0);
  const closedCount = orders.length;

  // Tahmini muhasebe/gider kesintisi: %18 KDV benzeri gider payı öngörüsü
  const estimatedExpenseRate = 0.18;
  const estimatedExpense = totalRevenue * estimatedExpenseRate;
  const netEstimate = totalRevenue - estimatedExpense;

  const cashTotal = orders.filter((o) => o.paymentMethod === "Nakit").reduce((s, o) => s + o.total, 0);
  const cardTotal = orders.filter((o) => o.paymentMethod === "Kart").reduce((s, o) => s + o.total, 0);

  area.innerHTML = `
    <div class="mb-4">
      <h3 class="font-display font-bold text-lg">${escapeHtml(State.businessName)}</h3>
      <p class="text-xs text-gray-500">${new Date().toLocaleDateString("tr-TR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}</p>
    </div>
    <div class="report-row"><span class="report-label">Toplam Kasa Cirosu</span><span class="report-value">${formatCurrency(totalRevenue)}</span></div>
    <div class="report-row"><span class="report-label">Kapatılan Adisyon Sayısı</span><span class="report-value">${closedCount}</span></div>
    <div class="report-row"><span class="report-label">Nakit Tahsilat</span><span class="report-value">${formatCurrency(cashTotal)}</span></div>
    <div class="report-row"><span class="report-label">Kart Tahsilat</span><span class="report-value">${formatCurrency(cardTotal)}</span></div>
    <div class="report-row"><span class="report-label">Tahmini Muhasebe/Gider Kesintisi (%18)</span><span class="report-value">${formatCurrency(estimatedExpense)}</span></div>
    <div class="report-row"><span class="report-label font-bold text-gray-800">Tahmini Net Kazanç</span><span class="report-value">${formatCurrency(netEstimate)}</span></div>
    <p class="text-[11px] text-gray-400 mt-4">Bu rapor tahminidir; kesin muhasebe kayıtları için mali müşavirinize danışın. — Hakan Aytaş CodeBug yapımıdır</p>
  `;
}

document.getElementById("printReportBtn").addEventListener("click", () => window.print());
