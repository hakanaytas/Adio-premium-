// Hakan Aytaş CodeBug yapımıdır - İletişim: hffhakan@gmail.com
// app.js
// Kimlik doğrulama (giriş/kayıt), panel navigasyonu ve
// tüm modüllerin paylaştığı global durum (State) burada yönetilir.

const State = {
  businessId: null,
  businessName: null,
  products: [],        // aktif ürün listesi (canlı dinlenir)
  tables: [],           // aktif masa listesi (canlı dinlenir)
  pendingOrders: [],    // QR menüden gelip onay bekleyen siparişler (canlı dinlenir)
  openTableId: null,    // şu an adisyon modalında açık olan masa
  cart: [],             // açık masanın geçici sepeti (henüz kaydedilmemiş satırlar dahil)
  reportUnlocked: false, // Z raporu / ciro bölümünün şifre ile açılıp açılmadığı
  unsubProducts: null,
  unsubTables: null,
  unsubPendingOrders: null,
};

// ============ YARDIMCI FONKSİYONLAR ============
function formatCurrency(value) {
  const n = Number(value || 0);
  return n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ₺";
}

function showToast(message) {
  const box = document.getElementById("toastBox");
  box.textContent = message;
  box.classList.remove("hidden");
  clearTimeout(box._timer);
  box._timer = setTimeout(() => box.classList.add("hidden"), 2600);
}

function openModal(id) { document.getElementById(id).classList.remove("hidden"); }
function closeModal(id) { document.getElementById(id).classList.add("hidden"); }

document.querySelectorAll("[data-close-modal]").forEach((btn) => {
  btn.addEventListener("click", () => closeModal(btn.dataset.closeModal));
});
document.querySelectorAll(".modal-overlay").forEach((overlay) => {
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.classList.add("hidden");
  });
});

function elapsedSince(timestampMillis) {
  if (!timestampMillis) return "-";
  const diffMs = Date.now() - timestampMillis;
  const totalMin = Math.floor(diffMs / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h <= 0) return `${m} dk`;
  return `${h} sa ${m} dk`;
}

// Masa kartlarındaki "açılış süresi" göstergelerini her dakika tazele
setInterval(() => {
  if (typeof renderTables === "function" && State.businessId) renderTables();
}, 30000);

// ============ PANELE GEÇİŞ (dışarıdan da çağrılabilir, örn. Kaydet sonrası) ============
function goToPanel(panelId) {
  document.querySelectorAll(".sidenav-btn").forEach((b) => b.classList.remove("active"));
  const targetBtn = document.querySelector(`.sidenav-btn[data-panel="${panelId}"]`);
  if (targetBtn) targetBtn.classList.add("active");

  document.querySelectorAll(".panel").forEach((p) => p.classList.add("hidden"));
  const targetPanel = document.getElementById(panelId);
  if (targetPanel) targetPanel.classList.remove("hidden");

  if (panelId === "panelStock" && typeof renderStockList === "function") {
    renderStockList();
  }
  if (panelId === "panelReport") {
    lockReportPanel();
  }
}

function goToTablesPanel() {
  goToPanel("panelTables");
}

// ============ AUTH: TAB GEÇİŞİ ============
const tabLoginBtn = document.getElementById("tabLoginBtn");
const tabRegisterBtn = document.getElementById("tabRegisterBtn");
const loginForm = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");

tabLoginBtn.addEventListener("click", () => {
  tabLoginBtn.classList.add("active");
  tabRegisterBtn.classList.remove("active");
  loginForm.classList.remove("hidden");
  registerForm.classList.add("hidden");
});
tabRegisterBtn.addEventListener("click", () => {
  tabRegisterBtn.classList.add("active");
  tabLoginBtn.classList.remove("active");
  registerForm.classList.remove("hidden");
  loginForm.classList.add("hidden");
});

// ============ KAYIT OL ============
registerForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const errEl = document.getElementById("registerError");
  errEl.classList.add("hidden");

  const name = document.getElementById("regBusinessName").value.trim();
  const id = document.getElementById("regBusinessId").value.trim().toLowerCase().replace(/\s+/g, "_");
  const pass = document.getElementById("regPassword").value;
  const reportPass = document.getElementById("regReportPassword").value;

  if (!name || !id || !pass || !reportPass) return;

  try {
    const ref = KafeDB.businessDoc(id);
    const existing = await ref.get();
    if (existing.exists) {
      errEl.textContent = "Bu İşletme ID zaten kullanılıyor. Başka bir ID deneyin.";
      errEl.classList.remove("hidden");
      return;
    }
    await ref.set({
      name,
      password: pass, // NOT: Üretimde bu alan bir Cloud Function ile hash'lenmelidir.
      reportPassword: reportPass, // Z raporu / ciro bölümü için ayrı şifre (personel giremesin).
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    showToast("İşletme oluşturuldu, giriş yapılıyor...");
    await loginBusiness(id, name);
  } catch (err) {
    errEl.textContent = "Kayıt sırasında hata oluştu: " + err.message;
    errEl.classList.remove("hidden");
  }
});

// ============ GİRİŞ YAP ============
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const errEl = document.getElementById("loginError");
  errEl.classList.add("hidden");

  const id = document.getElementById("loginBusinessId").value.trim().toLowerCase().replace(/\s+/g, "_");
  const pass = document.getElementById("loginPassword").value;

  try {
    const snap = await KafeDB.businessDoc(id).get();
    if (!snap.exists || snap.data().password !== pass) {
      errEl.textContent = "İşletme ID veya şifre hatalı.";
      errEl.classList.remove("hidden");
      return;
    }
    await loginBusiness(id, snap.data().name);
  } catch (err) {
    errEl.textContent = "Giriş sırasında hata oluştu: " + err.message;
    errEl.classList.remove("hidden");
  }
});

async function loginBusiness(id, name) {
  State.businessId = id;
  State.businessName = name;
  localStorage.setItem("kafe_business_id", id);

  document.getElementById("businessNameLabel").textContent = name;
  document.getElementById("businessIdLabel").textContent = "ID: " + id;

  document.getElementById("authScreen").classList.add("hidden");
  document.getElementById("appScreen").classList.remove("hidden");
  document.getElementById("topBar").classList.remove("hidden");
  document.getElementById("sideNav").classList.remove("hidden");

  startProductsListener();
  startTablesListener();
  startPendingOrdersListener();
  if (typeof initQrPanel === "function") initQrPanel();
}

document.getElementById("logoutBtn").addEventListener("click", () => {
  if (State.unsubProducts) State.unsubProducts();
  if (State.unsubTables) State.unsubTables();
  if (State.unsubPendingOrders) State.unsubPendingOrders();
  localStorage.removeItem("kafe_business_id");
  location.reload();
});

// ============ PANEL NAVİGASYONU ============
document.querySelectorAll(".sidenav-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    goToPanel(btn.dataset.panel);
  });
});

// ============ CANLI DİNLEYİCİLER ============
function startProductsListener() {
  State.unsubProducts = KafeDB.productsCol(State.businessId)
    .orderBy("name")
    .onSnapshot((snap) => {
      State.products = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      if (typeof renderStockList === "function") renderStockList();
      if (typeof renderQuickAddGrid === "function") renderQuickAddGrid();
      if (typeof renderPublicMenu === "function") renderPublicMenu();
    });
}

function startTablesListener() {
  State.unsubTables = KafeDB.tablesCol(State.businessId)
    .orderBy("name")
    .onSnapshot((snap) => {
      State.tables = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      if (typeof renderTables === "function") renderTables();
      if (typeof syncOpenTableModal === "function") syncOpenTableModal();
      updateWaiterAlertBadge();
    });
}

function startPendingOrdersListener() {
  State.unsubPendingOrders = KafeDB.pendingOrdersCol(State.businessId)
    .where("status", "==", "pending")
    .onSnapshot((snap) => {
      State.pendingOrders = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      updatePendingOrdersBadge();
      if (typeof renderPendingOrdersList === "function") renderPendingOrdersList();
    });
}

function updateWaiterAlertBadge() {
  const calling = State.tables.filter((t) => t.waiterCall);
  const btn = document.getElementById("waiterAlertBtn");
  if (calling.length > 0) {
    btn.classList.remove("hidden");
    btn.textContent = `🔔 Garson Çağrısı (${calling.length})`;
  } else {
    btn.classList.add("hidden");
  }
}

function updatePendingOrdersBadge() {
  const btn = document.getElementById("pendingOrdersBtn");
  if (!btn) return;
  if (State.pendingOrders.length > 0) {
    btn.classList.remove("hidden");
    btn.textContent = `🛎️ Yeni Sipariş (${State.pendingOrders.length})`;
  } else {
    btn.classList.add("hidden");
  }
}

document.getElementById("waiterAlertBtn").addEventListener("click", () => {
  const calling = State.tables.filter((t) => t.waiterCall);
  if (calling.length && typeof openTableModal === "function") {
    openTableModal(calling[0].id);
  }
});

document.getElementById("pendingOrdersBtn").addEventListener("click", () => {
  if (typeof renderPendingOrdersList === "function") renderPendingOrdersList();
  openModal("pendingOrdersModal");
});

// ============ Z RAPORU / CİRO PANELİ ŞİFRE KİLİDİ ============
function lockReportPanel() {
  State.reportUnlocked = false;
  document.getElementById("reportPasswordGate").classList.remove("hidden");
  document.getElementById("reportContent").classList.add("hidden");
  document.getElementById("printReportBtn").classList.add("hidden");
  document.getElementById("reportPasswordInput").value = "";
  document.getElementById("reportPasswordError").classList.add("hidden");
}

document.getElementById("reportUnlockBtn").addEventListener("click", unlockReportPanel);
document.getElementById("reportPasswordInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") unlockReportPanel();
});

async function unlockReportPanel() {
  const errEl = document.getElementById("reportPasswordError");
  errEl.classList.add("hidden");
  const val = document.getElementById("reportPasswordInput").value;

  try {
    const snap = await KafeDB.businessDoc(State.businessId).get();
    const data = snap.data() || {};
    const expected = data.reportPassword || data.password; // eski işletmeler için geriye dönük uyum
    if (!val || val !== expected) {
      errEl.textContent = "Şifre yanlış. Bu bölüme sadece yetkili yönetici erişebilir.";
      errEl.classList.remove("hidden");
      return;
    }
    State.reportUnlocked = true;
    document.getElementById("reportPasswordGate").classList.add("hidden");
    document.getElementById("reportContent").classList.remove("hidden");
    document.getElementById("printReportBtn").classList.remove("hidden");
    if (typeof renderDayEndReport === "function") renderDayEndReport();
  } catch (err) {
    errEl.textContent = "Kontrol sırasında hata oluştu: " + err.message;
    errEl.classList.remove("hidden");
  }
}

// ============ GİRİŞ SAYFASI ROTASI / QR PUBLIC MENÜ KONTROLÜ ============
(function initRoute() {
  const params = new URLSearchParams(location.search);
  const menuBusinessId = params.get("menu");

  if (menuBusinessId) {
    // Herkese açık QR menü ekranı — giriş gerekmez.
    document.getElementById("authScreen").classList.add("hidden");
    document.getElementById("publicMenuScreen").classList.remove("hidden");
    if (typeof loadPublicMenu === "function") loadPublicMenu(menuBusinessId);
    return;
  }

  const savedId = localStorage.getItem("kafe_business_id");
  if (savedId) {
    KafeDB.businessDoc(savedId).get().then((snap) => {
      if (snap.exists) {
        loginBusiness(savedId, snap.data().name);
      } else {
        localStorage.removeItem("kafe_business_id");
      }
    });
  }
})();
