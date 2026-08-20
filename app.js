// Hakan Aytaş CodeBug yapımıdır - İletişim: hffhakan@gmail.com
// app.js
// Kimlik doğrulama (giriş/kayıt), canlı saat, panel navigasyonu ve
// tüm modüllerin paylaştığı global durum (State) burada yönetilir.

const State = {
  businessId: null,
  businessName: null,
  products: [],        // aktif ürün listesi (canlı dinlenir)
  tables: [],           // aktif masa listesi (canlı dinlenir)
  openTableId: null,    // şu an adisyon modalında açık olan masa
  cart: [],             // açık masanın geçici sepeti (henüz kaydedilmemiş satırlar dahil)
  unsubProducts: null,
  unsubTables: null,
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

// ============ CANLI SAAT ============
function tickClock() {
  const now = new Date();
  const timeStr = now.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const dateStr = now.toLocaleDateString("tr-TR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
  const timeEl = document.getElementById("clockTime");
  const dateEl = document.getElementById("clockDate");
  if (timeEl) timeEl.textContent = timeStr;
  if (dateEl) dateEl.textContent = dateStr;
}
setInterval(tickClock, 1000);
tickClock();

// Masa kartlarındaki "açılış süresi" göstergelerini her dakika tazele
setInterval(() => {
  if (typeof renderTables === "function" && State.businessId) renderTables();
}, 30000);

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

  if (!name || !id || !pass) return;

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
  if (typeof initQrPanel === "function") initQrPanel();
}

document.getElementById("logoutBtn").addEventListener("click", () => {
  if (State.unsubProducts) State.unsubProducts();
  if (State.unsubTables) State.unsubTables();
  localStorage.removeItem("kafe_business_id");
  location.reload();
});

// ============ PANEL NAVİGASYONU ============
document.querySelectorAll(".sidenav-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".sidenav-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    document.querySelectorAll(".panel").forEach((p) => p.classList.add("hidden"));
    document.getElementById(btn.dataset.panel).classList.remove("hidden");

    if (btn.dataset.panel === "panelReport" && typeof renderDayEndReport === "function") {
      renderDayEndReport();
    }
    if (btn.dataset.panel === "panelStock" && typeof renderStockList === "function") {
      renderStockList();
    }
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

document.getElementById("waiterAlertBtn").addEventListener("click", () => {
  const calling = State.tables.filter((t) => t.waiterCall);
  if (calling.length && typeof openTableModal === "function") {
    openTableModal(calling[0].id);
  }
});

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
