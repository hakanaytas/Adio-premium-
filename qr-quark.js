// Hakan Aytaş CodeBug yapımıdır - İletişim: hffhakan@gmail.com
// qr-quark.js
// İşletmeye özel dinamik "Quark QR Menü" bağlantısının oluşturulması, müşterilerin
// okuttuğu QR kod ile açılan canlı (Firestore'dan anlık okunan) herkese açık menü
// ekranının render edilmesi ve müşterinin ürün + adet + masa seçerek sipariş
// gönderebilmesi (onay bekleyen sipariş olarak garson/yönetici ekranına düşer).

function buildPublicMenuUrl(businessId) {
  const base = location.origin + location.pathname;
  return `${base}?menu=${encodeURIComponent(businessId)}`;
}

function initQrPanel() {
  const url = buildPublicMenuUrl(State.businessId);
  document.getElementById("qrMenuLink").value = url;

  const qrImg = document.createElement("img");
  qrImg.src = "https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=" + encodeURIComponent(url);
  qrImg.alt = "Quark QR Menü";
  const box = document.getElementById("qrCodeBox");
  box.innerHTML = "";
  box.appendChild(qrImg);
}

document.getElementById("copyQrLinkBtn").addEventListener("click", () => {
  const input = document.getElementById("qrMenuLink");
  input.select();
  navigator.clipboard.writeText(input.value).then(() => showToast("Bağlantı kopyalandı."));
});

document.getElementById("openQrLinkBtn").addEventListener("click", () => {
  window.open(document.getElementById("qrMenuLink").value, "_blank");
});

// ============ HERKESE AÇIK (PUBLIC) CANLI MENÜ ============
let PublicMenuState = { businessId: null, products: [], tables: [] };
let PublicOrderState = { cart: [] };

function loadPublicMenu(businessId) {
  PublicMenuState.businessId = businessId;

  KafeDB.businessDoc(businessId).get().then((snap) => {
    if (snap.exists) {
      document.getElementById("publicMenuTitle").textContent = snap.data().name || "Kafe Menü";
    } else {
      document.getElementById("publicMenuTitle").textContent = "Menü bulunamadı";
      return;
    }
  });

  // Canlı dinleme: menüde yapılan her değişiklik anında yansır.
  KafeDB.productsCol(businessId).orderBy("category").onSnapshot((snap) => {
    PublicMenuState.products = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderPublicMenu();
  });

  // Masaların canlı listesi: müşteri sipariş verirken masasını seçebilsin diye.
  KafeDB.tablesCol(businessId).orderBy("name").onSnapshot((snap) => {
    PublicMenuState.tables = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderPublicTableOptions();
  });

  document.getElementById("publicMenuSearch").addEventListener("input", (e) => {
    renderPublicMenu(e.target.value);
  });
}

function renderPublicTableOptions() {
  const sel = document.getElementById("publicTableSelect");
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML =
    `<option value="">Masa seçin...</option>` +
    PublicMenuState.tables.map((t) => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join("");
  if (current) sel.value = current;
}

function renderPublicMenu(filterText) {
  const list = document.getElementById("publicMenuList");
  if (!list) return;
  list.innerHTML = "";

  const q = (filterText || document.getElementById("publicMenuSearch")?.value || "").trim().toLowerCase();
  // Tüm ürünler (stok takipsiz olanlar dahil) görünür; sadece gerçekten tükenmiş
  // stok takipli ürünler "Tükendi" etiketiyle görünür ama sipariş edilemez.
  const filtered = PublicMenuState.products.filter((p) => p.name.toLowerCase().includes(q));

  if (filtered.length === 0) {
    list.innerHTML = `<p class="text-white/80 text-sm text-center col-span-full">Şu anda listelenecek ürün yok.</p>`;
    return;
  }

  filtered.forEach((p) => {
    const outOfStock = p.trackStock !== false && Number(p.stock) <= 0;
    const item = document.createElement("div");
    item.className = "public-menu-item" + (outOfStock ? " sold-out" : "");
    item.innerHTML = `
      <div class="pcat">${escapeHtml(p.category || "")}</div>
      <div class="pname">${escapeHtml(p.name)}</div>
      <div class="pprice">${formatCurrency(p.price)}</div>
      ${
        outOfStock
          ? `<div class="ptag-out">Tükendi</div>`
          : `<button type="button" class="public-add-btn" data-id="${p.id}">+ Sepete Ekle</button>`
      }
    `;
    list.appendChild(item);
  });

  list.querySelectorAll(".public-add-btn").forEach((btn) => {
    btn.addEventListener("click", () => addToPublicCart(btn.dataset.id));
  });
}

// ============ MÜŞTERİ SEPETİ ============
function addToPublicCart(productId) {
  const product = PublicMenuState.products.find((p) => p.id === productId);
  if (!product) return;
  const existing = PublicOrderState.cart.find((i) => i.productId === productId);
  if (existing) {
    existing.qty += 1;
  } else {
    PublicOrderState.cart.push({ productId, name: product.name, price: Number(product.price), qty: 1 });
  }
  renderPublicCartBar();
  showToast(`${product.name} sepete eklendi.`);
}

function publicCartTotal() {
  return PublicOrderState.cart.reduce((sum, i) => sum + i.price * i.qty, 0);
}

function renderPublicCartBar() {
  const bar = document.getElementById("publicCartBar");
  if (!bar) return;
  const count = PublicOrderState.cart.reduce((sum, i) => sum + i.qty, 0);
  if (count === 0) {
    bar.classList.add("hidden");
    return;
  }
  bar.classList.remove("hidden");
  document.getElementById("publicCartCount").textContent = `${count} ürün`;
  document.getElementById("publicCartTotal").textContent = formatCurrency(publicCartTotal());
}

function renderPublicCartItems() {
  const list = document.getElementById("publicCartItemsList");
  if (!list) return;
  list.innerHTML = "";

  if (PublicOrderState.cart.length === 0) {
    list.innerHTML = `<p class="text-gray-400 text-sm text-center py-6">Sepetiniz boş.</p>`;
  } else {
    PublicOrderState.cart.forEach((item, idx) => {
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
      if (action === "inc") PublicOrderState.cart[idx].qty += 1;
      if (action === "dec") {
        PublicOrderState.cart[idx].qty -= 1;
        if (PublicOrderState.cart[idx].qty <= 0) PublicOrderState.cart.splice(idx, 1);
      }
      if (action === "del") PublicOrderState.cart.splice(idx, 1);
      renderPublicCartItems();
      renderPublicCartBar();
    });
  });

  document.getElementById("publicCartTotalLabel").textContent = formatCurrency(publicCartTotal());
}

document.getElementById("openPublicCartBtn").addEventListener("click", () => {
  renderPublicCartItems();
  document.getElementById("publicOrderError").classList.add("hidden");
  openModal("publicCartModal");
});

// ============ SİPARİŞİ GÖNDER (onay bekleyen sipariş olarak kaydedilir) ============
document.getElementById("submitPublicOrderBtn").addEventListener("click", async () => {
  const errEl = document.getElementById("publicOrderError");
  errEl.classList.add("hidden");

  const tableId = document.getElementById("publicTableSelect").value;
  if (!tableId) {
    errEl.textContent = "Lütfen masanızı seçin.";
    errEl.classList.remove("hidden");
    return;
  }
  if (PublicOrderState.cart.length === 0) {
    errEl.textContent = "Sepetiniz boş.";
    errEl.classList.remove("hidden");
    return;
  }

  const table = PublicMenuState.tables.find((t) => t.id === tableId);
  const total = publicCartTotal();
  const btn = document.getElementById("submitPublicOrderBtn");
  btn.disabled = true;

  try {
    await KafeDB.pendingOrdersCol(PublicMenuState.businessId).add({
      tableId,
      tableName: table?.name || "",
      items: PublicOrderState.cart,
      total,
      status: "pending",
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });

    PublicOrderState.cart = [];
    renderPublicCartBar();
    closeModal("publicCartModal");
    showToast("Siparişiniz gönderildi! Onaylandığında masanıza eklenecek.");
  } catch (err) {
    errEl.textContent = "Sipariş gönderilemedi: " + err.message;
    errEl.classList.remove("hidden");
  } finally {
    btn.disabled = false;
  }
});
