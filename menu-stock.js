// Hakan Aytaş CodeBug yapımıdır - İletişim: hffhakan@gmail.com
// menu-stock.js
// Ürün ekleme/düzenleme/silme, stok takibi ve şifreli Gün Sonu / Muhasebe raporu.

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
    const untracked = p.trackStock === false;
    const low = !untracked && Number(p.stock) <= 5;
    let qtyLine;
    if (untracked) {
      qtyLine = `<div class="stock-card-qty untracked">♾️ Stok Takipsiz</div>`;
    } else {
      qtyLine = `<div class="stock-card-qty ${low ? "low" : "ok"}">${low ? "⚠️" : "✅"} Stok: ${p.stock}</div>`;
    }
    const card = document.createElement("div");
    card.className = "stock-card";
    card.innerHTML = `
      <div class="stock-card-cat">${escapeHtml(p.category || "-")}</div>
      <div class="stock-card-name">${escapeHtml(p.name)}</div>
      <div class="stock-card-price">${formatCurrency(p.price)}</div>
      ${qtyLine}
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

  const noStockTrackEl = document.getElementById("productNoStockTrack");
  const stockInput = document.getElementById("productStock");

  if (product) {
    document.getElementById("productId").value = product.id;
    document.getElementById("productName").value = product.name;
    document.getElementById("productCategory").value = product.category || "";
    document.getElementById("productPrice").value = product.price;
    document.getElementById("productStock").value = product.stock;
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
    category: document.getElementById("productCategory").value.trim(),
    price: Number(document.getElementById("productPrice").value),
    stock: Number(document.getElementById("productStock").value || 0),
    trackStock: !noStockTrack, // false ise stok kontrolü yapılmaz (örn. çay)
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

// ============ GÜN SONU / MUHASEBE RAPORU (şifreli bölüm) ============
async function renderDayEndReport() {
  if (!State.reportUnlocked) return; // güvenlik: kilit açık değilse veri çekilmez
  const area = document.getElementById("reportArea");
  area.innerHTML = `<p class="text-gray-400 text-sm">Rapor hazırlanıyor...</p>`;

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
  sevenDaysAgo.setHours(0, 0, 0, 0);

  const [todaySnap, weekSnap] = await Promise.all([
    KafeDB.ordersCol(State.businessId)
      .where("closedAt", ">=", firebase.firestore.Timestamp.fromDate(startOfDay))
      .get(),
    KafeDB.ordersCol(State.businessId)
      .where("closedAt", ">=", firebase.firestore.Timestamp.fromDate(sevenDaysAgo))
      .get(),
  ]);

  const orders = todaySnap.docs.map((d) => d.data());
  const weekOrders = weekSnap.docs.map((d) => d.data());

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

  renderReportCharts(weekOrders, cashTotal, cardTotal);
}

// ============ GRAFİKLER (Günlük Ciro + Ödeme Dağılımı) ============
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
      .filter((o) => {
        const t = tsToMillis(o.closedAt);
        return t && t >= d.getTime() && t < next.getTime();
      })
      .reduce((sum, o) => sum + (o.total || 0), 0);
  });

  const revenueCtx = document.getElementById("revenueChart");
  if (revenueCtx) {
    if (_revenueChartInstance) _revenueChartInstance.destroy();
    _revenueChartInstance = new Chart(revenueCtx, {
      type: "bar",
      data: {
        labels,
        datasets: [{ label: "Günlük Ciro (₺)", data: totals, backgroundColor: "#FBBF24", borderRadius: 8 }],
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: false },
          title: { display: true, text: "Son 7 Gün Ciro" },
        },
        scales: { y: { beginAtZero: true } },
      },
    });
  }

  const pieCtx = document.getElementById("paymentPieChart");
  if (pieCtx) {
    if (_paymentPieChartInstance) _paymentPieChartInstance.destroy();
    _paymentPieChartInstance = new Chart(pieCtx, {
      type: "pie",
      data: {
        labels: ["Nakit", "Kart"],
        datasets: [{ data: [cashTotal, cardTotal], backgroundColor: ["#22C55E", "#3B82F6"] }],
      },
      options: {
        responsive: true,
        plugins: { title: { display: true, text: "Bugün Ödeme Dağılımı" } },
      },
    });
  }
}

document.getElementById("printReportBtn").addEventListener("click", () => window.print());
