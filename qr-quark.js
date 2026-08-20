// Hakan Aytaş CodeBug yapımıdır - İletişim: hffhakan@gmail.com
// qr-quark.js
// İşletmeye özel dinamik "Quark QR Menü" bağlantısının oluşturulması ve
// müşterilerin okuttuğu QR kod ile açılan canlı (Firestore'dan anlık okunan)
// herkese açık menü ekranının render edilmesi.

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
let PublicMenuState = { businessId: null, products: [] };

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

  document.getElementById("publicMenuSearch").addEventListener("input", (e) => {
    renderPublicMenu(e.target.value);
  });
}

function renderPublicMenu(filterText) {
  const list = document.getElementById("publicMenuList");
  if (!list) return;
  list.innerHTML = "";

  const q = (filterText || document.getElementById("publicMenuSearch")?.value || "").trim().toLowerCase();
  const filtered = PublicMenuState.products.filter(
    (p) => p.name.toLowerCase().includes(q) && Number(p.stock) > 0
  );

  if (filtered.length === 0) {
    list.innerHTML = `<p class="text-white/80 text-sm text-center col-span-full">Şu anda listelenecek ürün yok.</p>`;
    return;
  }

  filtered.forEach((p) => {
    const item = document.createElement("div");
    item.className = "public-menu-item";
    item.innerHTML = `
      <div class="pcat">${escapeHtml(p.category || "")}</div>
      <div class="pname">${escapeHtml(p.name)}</div>
      <div class="pprice">${formatCurrency(p.price)}</div>
    `;
    list.appendChild(item);
  });
}
