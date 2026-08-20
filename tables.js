// Hakan Aytaş CodeBug yapımıdır - İletişim: hffhakan@gmail.com
// tables.js
// Masaların listelenmesi, masa açma/kapatma, adisyon (sipariş) ekleme-çıkarma,
// kaydetme, ödeme alma, adisyon bastırma, garson çağırma ve QR'dan gelen
// siparişlerin onaylanması işlemleri.

function tsToMillis(ts) {
  if (!ts) return null;
  if (typeof ts.toMillis === "function") return ts.toMillis();
  return ts;
}

// ============ MASA GRID RENDER ============
function renderTables() {
  const grid = document.getElementById("tablesGrid");
  grid.innerHTML = "";

  if (State.tables.length === 0) {
    grid.innerHTML = `<p class="text-gray-400 text-sm col-span-full">Henüz masa eklenmedi. "+ Masa Ekle" ile başlayın.</p>`;
    return;
  }

  State.tables.forEach((t) => {
    const isOccupied = t.status === "occupied";
    const card = document.createElement("div");
    card.className = "table-card" + (isOccupied ? " occupied" : "") + (t.waiterCall ? " waiter-call" : "");
    card.innerHTML = `
      <div class="table-card-name">${escapeHtml(t.name)}</div>
      <div class="table-card-status">${isOccupied ? "🟢 Dolu" : "⚪ Boş"}</div>
      ${isOccupied ? `<div class="table-card-time">⏱ ${elapsedSince(tsToMillis(t.openedAt))}</div>` : ""}
      <div class="table-card-total">${formatCurrency(t.total || 0)}</div>
    `;
    card.addEventListener("click", () => openTableModal(t.id));
    grid.appendChild(card);
  });
}

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str ?? "";
  return d.innerHTML;
}

// ============ MASA EKLE (Tekli veya Toplu) ============
document.getElementById("addTableBtn").addEventListener("click", () => openModal("addTableModal"));

document.getElementById("addTableForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const raw = document.getElementById("newTableName").value.trim();
  if (!raw) return;

  // Sadece sayı girildiyse (örn. "10"), o adette masa otomatik oluşturulur.
  const isBulkCount = /^\d+$/.test(raw) && Number(raw) > 0;

  if (isBulkCount) {
    const count = Math.min(Number(raw), 200); // güvenlik sınırı
    const existingNumbers = State.tables
      .map((t) => {
        const m = (t.name || "").match(/^Masa (\d+)$/);
        return m ? Number(m[1]) : null;
      })
      .filter((n) => n !== null);
    const startFrom = existingNumbers.length ? Math.max(...existingNumbers) + 1 : 1;

    const batch = db.batch();
    for (let i = 0; i < count; i++) {
      const num = startFrom + i;
      const ref = KafeDB.tablesCol(State.businessId).doc();
      batch.set(ref, {
        name: `Masa ${num}`,
        status: "empty",
        openedAt: null,
        cart: [],
        total: 0,
        waiterCall: false,
      });
    }
    await batch.commit();
    showToast(`${count} masa otomatik oluşturuldu.`);
  } else {
    await KafeDB.tablesCol(State.businessId).add({
      name: raw,
      status: "empty",
      openedAt: null,
      cart: [],
      total: 0,
      waiterCall: false,
    });
    showToast("Masa eklendi.");
  }

  document.getElementById("newTableName").value = "";
  closeModal("addTableModal");
});

// ============ MASA / ADİSYON MODALI ============
function openTableModal(tableId) {
  const table = State.tables.find((t) => t.id === tableId);
  if (!table) return;

  State.openTableId = tableId;
  State.cart = JSON.parse(JSON.stringify(table.cart || []));

  document.getElementById("tableModalTitle").textContent = table.name;
  renderOrderItems();
  renderQuickAddGrid();
  document.getElementById("orderSearchInput").value = "";
  openModal("tableModal");
}

function syncOpenTableModal() {
  if (!State.openTableId) return;
  const table = State.tables.find((t) => t.id === State.openTableId);
  if (!table) {
    State.openTableId = null;
    closeModal("tableModal");
    return;
  }
  // Başka bir cihazdan gelen canlı güncellemeleri modalın açık kalan
  // sepetini bozmadan sadece toplamı/adisyon listesini tazeler.
  renderOrderItems();
}

function currentCartTotal() {
  return State.cart.reduce((sum, i) => sum + i.price * i.qty, 0);
}

function renderOrderItems() {
  const list = document.getElementById("orderItemsList");
  list.innerHTML = "";

  if (State.cart.length === 0) {
    list.innerHTML = `<p class="text-gray-400 text-sm text-center py-6">Adisyona ürün eklemek için sağdan seçim yapın.</p>`;
  } else {
    State.cart.forEach((item, idx) => {
      const row = document.createElement("div");
      row.className = "order-item-row";
      row.innerHTML = `
        <span class="flex-1">${escapeHtml(item.name)}</span>
        <div class="flex items-center gap-2">
          <button class="qty-btn" data-action="dec" data-idx="${idx}">−</button>
          <span class="w-5 text-center font-semibold">${item.qty}</span>
          <button class="qty-btn" data-action="inc" data-idx="${idx}">+</button>
          <span class="w-20 text-right font-mono">${formatCurrency(item.price * item.qty)}</span>
          <button class="qty-btn" data-action="del" data-idx="${idx}">✕</button>
        </div>
      `;
      list.appendChild(row);
    });
  }

  list.querySelectorAll("[data-action]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.idx);
      const action = btn.dataset.action;
      if (action === "inc") State.cart[idx].qty += 1;
      if (action === "dec") {
        State.cart[idx].qty -= 1;
        if (State.cart[idx].qty <= 0) State.cart.splice(idx, 1);
      }
      if (action === "del") State.cart.splice(idx, 1);
      renderOrderItems();
    });
  });

  document.getElementById("orderTotalLabel").textContent = formatCurrency(currentCartTotal());
}

// ============ HIZLI ÜRÜN EKLEME GRID ============
function renderQuickAddGrid(filterText) {
  const grid = document.getElementById("quickAddGrid");
  if (!grid) return;
  grid.innerHTML = "";

  const q = (filterText || document.getElementById("orderSearchInput")?.value || "").trim().toLowerCase();
  const filtered = State.products.filter((p) => p.name.toLowerCase().includes(q));

  if (filtered.length === 0) {
    grid.innerHTML = `<p class="text-gray-400 text-sm col-span-full">Ürün bulunamadı.</p>`;
    return;
  }

  filtered.forEach((p) => {
    // Stok takipsiz ürünlerde (örn. çay) stok 0 olsa bile sipariş engeli olmaz.
    const outOfStock = p.trackStock !== false && Number(p.stock) <= 0;
    const card = document.createElement("div");
    card.className = "quick-add-card" + (outOfStock ? " out-of-stock" : "");
    card.innerHTML = `
      <div class="qname">${escapeHtml(p.name)}</div>
      <div class="qprice">${formatCurrency(p.price)}</div>
    `;
    if (!outOfStock) {
      card.addEventListener("click", () => addProductToCart(p));
    }
    grid.appendChild(card);
  });
}

document.getElementById("orderSearchInput").addEventListener("input", (e) => {
  renderQuickAddGrid(e.target.value);
});

function addProductToCart(product) {
  const existing = State.cart.find((i) => i.productId === product.id);
  if (existing) {
    existing.qty += 1;
  } else {
    State.cart.push({ productId: product.id, name: product.name, price: Number(product.price), qty: 1 });
  }
  renderOrderItems();
}

// ============ KAYDET (kaydeder, modalı kapatır ve Masalar menüsüne döner) ============
document.getElementById("saveOrderBtn").addEventListener("click", async () => {
  if (!State.openTableId) return;
  const total = currentCartTotal();
  const table = State.tables.find((t) => t.id === State.openTableId);

  await KafeDB.tablesCol(State.businessId).doc(State.openTableId).update({
    cart: State.cart,
    total,
    status: State.cart.length > 0 ? "occupied" : "empty",
    openedAt: State.cart.length > 0 ? (table.openedAt || firebase.firestore.FieldValue.serverTimestamp()) : null,
  });

  closeModal("tableModal");
  if (typeof goToTablesPanel === "function") goToTablesPanel();
  showToast("Adisyon kaydedildi.");
});

// ============ GARSON ÇAĞIR ============
document.getElementById("callWaiterBtn").addEventListener("click", async () => {
  if (!State.openTableId) return;
  await KafeDB.tablesCol(State.businessId).doc(State.openTableId).update({ waiterCall: true });
  showToast("Garson çağrıldı.");
});

function clearWaiterCall(tableId) {
  return KafeDB.tablesCol(State.businessId).doc(tableId).update({ waiterCall: false });
}

// Modal açıkken garson çağrısı otomatik temizlenmesin diye ayrı buton yok;
// masa kartındaki bildirime tıklanıp modal açıldığında çağrı otomatik kapatılır.
const _origOpenTableModal = openTableModal;
openTableModal = function (tableId) {
  _origOpenTableModal(tableId);
  const t = State.tables.find((x) => x.id === tableId);
  if (t && t.waiterCall) clearWaiterCall(tableId);
};

// ============ ADİSYON BASTIR (YAZDIR) ============
document.getElementById("printOrderBtn").addEventListener("click", () => {
  const table = State.tables.find((t) => t.id === State.openTableId);
  const win = window.open("", "_blank", "width=380,height=600");
  const rows = State.cart
    .map((i) => `<tr><td>${escapeHtml(i.name)}</td><td style="text-align:center">${i.qty}</td><td style="text-align:right">${formatCurrency(i.price * i.qty)}</td></tr>`)
    .join("");
  win.document.write(`
    <html><head><title>Adisyon - ${escapeHtml(table?.name || "")}</title>
    <style>
      body{font-family:monospace;padding:16px;}
      h2{text-align:center;margin-bottom:4px;}
      p{text-align:center;margin:2px 0 14px;font-size:12px;color:#555;}
      table{width:100%;border-collapse:collapse;font-size:13px;}
      td{padding:4px 2px;border-bottom:1px dashed #ccc;}
      .total{font-weight:bold;font-size:16px;margin-top:12px;text-align:right;}
      .footer{margin-top:20px;text-align:center;font-size:10px;color:#999;}
    </style></head><body>
    <h2>${escapeHtml(State.businessName)}</h2>
    <p>${escapeHtml(table?.name || "")} — ${new Date().toLocaleString("tr-TR")}</p>
    <table>${rows}</table>
    <div class="total">Toplam: ${formatCurrency(currentCartTotal())}</div>
    <div class="footer">Hakan Aytaş CodeBug yapımıdır</div>
    <script>window.print()<\/script>
    </body></html>
  `);
  win.document.close();
});

// ============ ÖDEME AL ============
document.getElementById("payOrderBtn").addEventListener("click", () => {
  if (State.cart.length === 0) {
    showToast("Adisyon boş, ödeme alınamaz.");
    return;
  }
  document.getElementById("paymentTotalLabel").textContent = formatCurrency(currentCartTotal());
  openModal("paymentModal");
});

document.querySelectorAll(".payment-method-btn").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const method = btn.dataset.method;
    const table = State.tables.find((t) => t.id === State.openTableId);
    const total = currentCartTotal();

    // Stok düşümü (sadece stok takibi açık olan ürünlerde yapılır)
    for (const item of State.cart) {
      const product = State.products.find((p) => p.id === item.productId);
      if (product && product.trackStock !== false) {
        const newStock = Math.max(0, Number(product.stock) - item.qty);
        await KafeDB.productsCol(State.businessId).doc(product.id).update({ stock: newStock });
      }
    }

    // Kapanan adisyonu geçmişe (gün sonu raporu için) kaydet
    await KafeDB.ordersCol(State.businessId).add({
      tableId: State.openTableId,
      tableName: table?.name || "",
      items: State.cart,
      total,
      paymentMethod: method,
      closedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });

    // Masayı boşalt
    await KafeDB.tablesCol(State.businessId).doc(State.openTableId).update({
      cart: [],
      total: 0,
      status: "empty",
      openedAt: null,
      waiterCall: false,
    });

    closeModal("paymentModal");
    closeModal("tableModal");
    showToast(`Ödeme alındı (${method}) — ${formatCurrency(total)}`);
  });
});

// ============ QR MENÜDEN GELEN SİPARİŞLER (Onay Bekleyenler) ============
function renderPendingOrdersList() {
  const list = document.getElementById("pendingOrdersList");
  if (!list) return;
  list.innerHTML = "";

  if (State.pendingOrders.length === 0) {
    list.innerHTML = `<p class="text-gray-400 text-sm text-center py-6">Bekleyen sipariş yok.</p>`;
    return;
  }

  State.pendingOrders.forEach((o) => {
    const itemsSummary = (o.items || []).map((i) => `${i.qty}× ${escapeHtml(i.name)}`).join(", ");
    const box = document.createElement("div");
    box.className = "pending-order-card";
    box.innerHTML = `
      <div class="flex items-center justify-between">
        <span class="font-display font-bold">${escapeHtml(o.tableName || "Masa")}</span>
        <span class="font-mono font-bold">${formatCurrency(o.total)}</span>
      </div>
      <div class="text-xs text-gray-500 my-2">${itemsSummary || "-"}</div>
      <div class="flex gap-2">
        <button class="action-btn action-green flex-1" data-approve="${o.id}">✅ Onayla</button>
        <button class="action-btn action-red flex-1" data-reject="${o.id}">✕ Reddet</button>
      </div>
    `;
    list.appendChild(box);
  });

  list.querySelectorAll("[data-approve]").forEach((btn) => {
    btn.addEventListener("click", () => approvePendingOrder(btn.dataset.approve));
  });
  list.querySelectorAll("[data-reject]").forEach((btn) => {
    btn.addEventListener("click", () => rejectPendingOrder(btn.dataset.reject));
  });
}

// Onaylanan sipariş otomatik olarak ilgili masanın adisyonuna eklenir.
async function approvePendingOrder(orderId) {
  const order = State.pendingOrders.find((o) => o.id === orderId);
  if (!order) return;

  const table = State.tables.find((t) => t.id === order.tableId);
  if (!table) {
    showToast("Masa bulunamadı, sipariş reddedildi.");
    await KafeDB.pendingOrdersCol(State.businessId).doc(orderId).update({ status: "rejected" });
    return;
  }

  const newCart = JSON.parse(JSON.stringify(table.cart || []));
  (order.items || []).forEach((item) => {
    const existing = newCart.find((i) => i.productId === item.productId);
    if (existing) {
      existing.qty += item.qty;
    } else {
      newCart.push({ productId: item.productId, name: item.name, price: item.price, qty: item.qty });
    }
  });
  const newTotal = newCart.reduce((sum, i) => sum + i.price * i.qty, 0);

  await KafeDB.tablesCol(State.businessId).doc(order.tableId).update({
    cart: newCart,
    total: newTotal,
    status: "occupied",
    openedAt: table.openedAt || firebase.firestore.FieldValue.serverTimestamp(),
  });
  await KafeDB.pendingOrdersCol(State.businessId).doc(orderId).update({ status: "approved" });

  showToast(`Sipariş onaylandı ve ${order.tableName} adisyonuna eklendi.`);
}

async function rejectPendingOrder(orderId) {
  await KafeDB.pendingOrdersCol(State.businessId).doc(orderId).update({ status: "rejected" });
  showToast("Sipariş reddedildi.");
}
