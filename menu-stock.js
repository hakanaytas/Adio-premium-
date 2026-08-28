// Hakan Aytaş CodeBug yapımıdır - İletişim: hffhakan@gmail.com
// menu-stock.js
// Ürün ekleme/düzenleme/silme, kategori yönetimi, stok takibi ve şifreli
// Gün Sonu / Muhasebe raporu.

// ============ STOK SEKMELERİ (Ürünler / Kategoriler) ============
document.querySelectorAll(".stock-tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".stock-tab").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    document.querySelectorAll(".stock-subpanel").forEach((p) => p.classList.add("hidden"));
    document.getElementById(btn.dataset.stockPanel).classList.remove("hidden");
  });
});

// ============ ÜRÜN LİSTESİ RENDER (Türkçe arama + kategori filtresi) ============
function renderStockList() {
  const list = document.getElementById("stockList");
  if (!list) return;
  list.innerHTML = "";

  const q = document.getElementById("stockSearchInput")?.value || "";
  const cat = document.getElementById("stockCategoryFilter")?.value || "";
  const filtered = State.products.filter((p) => {
    const matchesQ = turkishIncludes(p.name, q) || turkishIncludes(p.category, q);
    const matchesCat = !cat || p.category === cat;
    return matchesQ && matchesCat;
  });

  fillStockCategoryFilter();

  if (filtered.length === 0) {
    list.innerHTML = `<p class="text-gray-400 text-sm col-span-full">Ürün bulunamadı. "+ Ürün Ekle" ile başlayın.</p>`;
    return;
  }

  filtered.forEach((p) => {
    const untracked = p.trackStock === false;
    const low = !untracked && Number(p.stock) <= 5;
    const qtyLine = untracked
      ? `<div class="stock-card-qty untracked">♾️ Stok Takipsiz</div>`
      : `<div class="stock-card-qty ${low ? "low" : "ok"}">${low ? "⚠️" : "✅"} Stok: ${p.stock}</div>`;
    const card = document.createElement("div");
    card.className = "stock-card";
    card.innerHTML = `
      ${p.imageUrl ? `<img src="${escapeHtml(p.imageUrl)}" class="stock-card-img" onerror="this.style.display='none'">` : ""}
      <div class="stock-card-cat">${escapeHtml(p.category || "Kategorisiz")}</div>
      <div class="stock-card-name">${escapeHtml(p.name)}</div>
      <div class="stock-card-price">${formatCurrency(p.price)}</div>
      ${qtyLine}
    `;
    card.addEventListener("click", () => openProductModal(p));
    list.appendChild(card);
  });
}

function fillStockCategoryFilter() {
  const sel = document.getElementById("stockCategoryFilter");
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = `<option value="">Tüm Kategoriler</option>` +
    State.categories.map((c) => `<option value="${escapeHtml(c.name)}">${escapeHtml(c.name)}</option>`).join("");
  sel.value = current;
}

document.getElementById("stockSearchInput").addEventListener("input", () => renderStockList());
document.getElementById("stockCategoryFilter")?.addEventListener("change", () => renderStockList());

// ============ ÜRÜN MODALI (EKLE / DÜZENLE) ============
document.getElementById("addProductBtn").addEventListener("click", () => openProductModal(null));

function fillProductCategoryOptions(preserveCategory) {
  const sel = document.getElementById("productCategory");
  if (!sel) return;
  const current = preserveCategory ?? sel.value;
  let options = State.categories.map((c) => c.name);
  // Eski ürünlerde kategori listesinde olmayan bir isim varsa kaybolmaması için eklenir.
  if (current && !options.includes(current)) options = [current, ...options];

  sel.innerHTML = `<option value="">Kategori seçin...</option>` +
    options.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("");
  if (current) sel.value = current;
}

function openProductModal(product) {
  const form = document.getElementById("productForm");
  form.reset();
  document.getElementById("deleteProductBtn").classList.toggle("hidden", !product);
  fillProductCategoryOptions(product ? (product.category || "") : "");

  const noStockTrackEl = document.getElementById("productNoStockTrack");

  if (product) {
    document.getElementById("productId").value = product.id;
    document.getElementById("productName").value = product.name;
    document.getElementById("productCategory").value = product.category || "";
    document.getElementById("productPrice").value = product.price;
    document.getElementById("productStock").value = product.stock;
    document.getElementById("productImageUrl").value = product.imageUrl || "";
    document.getElementById("productDescription").value = product.description || "";
    noStockTrackEl.checked = product.trackStock === false;
  } else {
    document.getElementById("productId").value = "";
    noStockTrackEl.checked = false;
  }
  toggleStockInputState();
  openModal("productModal");
}

function toggleStockInputState() {
  const noStockTrackEl = document.getElementById("productNoStockTrack");
  const stockInput = document.getElementById("productStock");
  const disabled = noStockTrackEl.checked;
  stockInput.disabled = disabled;
  if (disabled && !stockInput.value) stockInput.value = 0;
}
document.getElementById("productNoStockTrack").addEventListener("change", toggleStockInputState);

document.getElementById("productForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = document.getElementById("productId").value;
  const noStockTrack = document.getElementById("productNoStockTrack").checked;
  const data = {
    name: document.getElementById("productName").value.trim(),
    category: document.getElementById("productCategory").value,
    price: Number(document.getElementById("productPrice").value),
    stock: Number(document.getElementById("productStock").value || 0),
    trackStock: !noStockTrack,
    imageUrl: document.getElementById("productImageUrl").value.trim(),
    description: document.getElementById("productDescription").value.trim(),
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

// ============ KATEGORİ YÖNETİMİ ============
function renderCategoryList() {
  const list = document.getElementById("categoryList");
  if (!list) return;
  list.innerHTML = "";

  if (State.categories.length === 0) {
    list.innerHTML = `<p class="text-gray-400 text-sm">Henüz kategori yok. "+ Kategori Ekle" ile başlayın.</p>`;
    return;
  }

  State.categories.forEach((c) => {
    const count = State.products.filter((p) => p.category === c.name).length;
    const row = document.createElement("div");
    row.className = "category-row";
    row.innerHTML = `
      <span class="flex-1 font-semibold">${escapeHtml(c.name)}</span>
      <span class="text-xs text-gray-400 mr-2">${count} ürün</span>
      <button class="qty-btn" data-edit-cat="${c.id}">✏️</button>
      <button class="qty-btn" data-del-cat="${c.id}">✕</button>
    `;
    list.appendChild(row);
  });

  list.querySelectorAll("[data-edit-cat]").forEach((btn) => {
    btn.addEventListener("click", () => openCategoryModal(State.categories.find((c) => c.id === btn.dataset.editCat)));
  });
  list.querySelectorAll("[data-del-cat]").forEach((btn) => {
    btn.addEventListener("click", () => deleteCategory(btn.dataset.delCat));
  });
}

document.getElementById("addCategoryBtn").addEventListener("click", () => openCategoryModal(null));

function openCategoryModal(category) {
  document.getElementById("categoryForm").reset();
  document.getElementById("categoryId").value = category ? category.id : "";
  document.getElementById("categoryName").value = category ? category.name : "";
  openModal("categoryModal");
}

document.getElementById("categoryForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = document.getElementById("categoryId").value;
  const name = document.getElementById("categoryName").value.trim();
  if (!name) return;

  if (id) {
    const old = State.categories.find((c) => c.id === id);
    await KafeDB.categoriesCol(State.businessId).doc(id).update({ name });
    if (old && old.name !== name) {
      // Kategori adı değişirse bu kategoriyi kullanan ürünler de güncellenir.
      const affected = State.products.filter((p) => p.category === old.name);
      const batch = db.batch();
      affected.forEach((p) => batch.update(KafeDB.productsCol(State.businessId).doc(p.id), { category: name }));
      if (affected.length) await batch.commit();
    }
    showToast("Kategori güncellendi.");
  } else {
    await KafeDB.categoriesCol(State.businessId).add({ name });
    showToast("Kategori eklendi.");
  }
  closeModal("categoryModal");
});

async function deleteCategory(id) {
  const cat = State.categories.find((c) => c.id === id);
  if (!cat) return;
  if (!confirm(`"${cat.name}" kategorisini silmek istediğinize emin misiniz? Bu kategorideki ürünler "Kategorisiz" olacak.`)) return;

  const affected = State.products.filter((p) => p.category === cat.name);
  const batch = db.batch();
  affected.forEach((p) => batch.update(KafeDB.productsCol(State.businessId).doc(p.id), { category: "" }));
  batch.delete(KafeDB.categoriesCol(State.businessId).doc(id));
  await batch.commit();
  showToast("Kategori silindi.");
}

// ============ GÜN SONU / MUHASEBE RAPORU (şifreli bölüm) ============
async function renderDayEndReport() {
  if (!State.reportUnlocked) return;
  const area = document.getElementById("reportArea");
  area.innerHTML = `<p class="text-gray-400 text-sm">Rapor hazırlanıyor...</p>`;

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
  sevenDaysAgo.setHours(0, 0, 0, 0);

  const [todaySnap, weekSnap] = await Promise.all([
    KafeDB.ordersCol(State.businessId).where("closedAt", ">=", firebase.firestore.Timestamp.fromDate(startOfDay)).get(),
    KafeDB.ordersCol(State.businessId).where("closedAt", ">=", firebase.firestore.Timestamp.fromDate(sevenDaysAgo)).get(),
  ]);

  const orders = todaySnap.docs.map((d) => d.data());
  const weekOrders = weekSnap.docs.map((d) => d.data());

  const totalRevenue = orders.reduce((sum, o) => sum + (o.total || 0), 0);
  const closedCount = orders.length;

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

  renderReportCharts(weekOrders, cashTotal, cardTotal);
}

let _revenueChartInstance = null;
let _paymentPieChartInstance = null;

function renderReportCharts(weekOrders, cashTotal, cardTotal) {
  if (typeof Chart === "undefined") return;

  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    d.setHours(0, 0, 0, 0);
    days.push(d);
  }
  const labels = days.map((d) => d.toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit" }));
  const totals = days.map((d) => {
    const next = new Date(d);
    next.setDate(next.getDate() + 1);
    return weekOrders
      .filter((o) => { const t = tsToMillis(o.closedAt); return t && t >= d.getTime() && t < next.getTime(); })
      .reduce((sum, o) => sum + (o.total || 0), 0);
  });

  const revenueCtx = document.getElementById("revenueChart");
  if (revenueCtx) {
    if (_revenueChartInstance) _revenueChartInstance.destroy();
    _revenueChartInstance = new Chart(revenueCtx, {
      type: "bar",
      data: { labels, datasets: [{ label: "Günlük Ciro (₺)", data: totals, backgroundColor: "#FBBF24", borderRadius: 8 }] },
      options: { responsive: true, plugins: { legend: { display: false }, title: { display: true, text: "Son 7 Gün Ciro" } }, scales: { y: { beginAtZero: true } } },
    });
  }

  const pieCtx = document.getElementById("paymentPieChart");
  if (pieCtx) {
    if (_paymentPieChartInstance) _paymentPieChartInstance.destroy();
    _paymentPieChartInstance = new Chart(pieCtx, {
      type: "pie",
      data: { labels: ["Nakit", "Kart"], datasets: [{ data: [cashTotal, cardTotal], backgroundColor: ["#22C55E", "#3B82F6"] }] },
      options: { responsive: true, plugins: { title: { display: true, text: "Bugün Ödeme Dağılımı" } } },
    });
  }
}

document.getElementById("printReportBtn").addEventListener("click", () => window.print());
