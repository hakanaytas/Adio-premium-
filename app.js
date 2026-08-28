// Hakan Aytaş CodeBug yapımıdır - İletişim: hffhakan@gmail.com
// app.js
// Kimlik doğrulama (giriş/kayıt, rol bazlı erişim), panel navigasyonu, genel arama
// ve tüm modüllerin paylaştığı global durum (State) burada yönetilir.

const State = {
  businessId: null,
  businessName: null,
  role: "admin",        // "admin" (işletme sahibi/yönetici) | "staff" (personel)
  username: null,        // personel girişinde kullanıcı adı, sahip girişinde null
  products: [],
  categories: [],
  tables: [],
  users: [],
  pendingOrders: [],
  openTableId: null,
  cart: [],
  reportUnlocked: false,
  unsubProducts: null,
  unsubTables: null,
  unsubPendingOrders: null,
  unsubCategories: null,
  unsubUsers: null,
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

// Türkçe karakterlere duyarlı, büyük/küçük harf duyarsız arama.
function turkishNormalize(str) {
  return (str ?? "")
    .toString()
    .replace(/İ/g, "i")
    .replace(/I/g, "ı")
    .toLocaleLowerCase("tr-TR");
}
function turkishIncludes(haystack, needle) {
  if (!needle) return true;
  return turkishNormalize(haystack).includes(turkishNormalize(needle));
}

// Masa kartlarındaki "açılış süresi" göstergelerini her dakika tazele
setInterval(() => {
  if (typeof renderTables === "function" && State.businessId) renderTables();
}, 30000);

// ============ PANELE GEÇİŞ ============
function goToPanel(panelId) {
  if (panelId === "panelUsers" && State.role !== "admin") {
    showToast("Bu bölüme sadece yönetici erişebilir.");
    return;
  }

  document.querySelectorAll(".sidenav-btn").forEach((b) => b.classList.remove("active"));
  const targetBtn = document.querySelector(`.sidenav-btn[data-panel="${panelId}"]`);
  if (targetBtn) targetBtn.classList.add("active");

  document.querySelectorAll(".panel").forEach((p) => p.classList.add("hidden"));
  const targetPanel = document.getElementById(panelId);
  if (targetPanel) targetPanel.classList.remove("hidden");

  if (panelId === "panelStock" && typeof renderStockList === "function") renderStockList();
  if (panelId === "panelStock" && typeof renderCategoryList === "function") renderCategoryList();
  if (panelId === "panelTables" && typeof renderTables === "function") renderTables();
  if (panelId === "panelUsers" && typeof renderUsersList === "function") renderUsersList();
  if (panelId === "panelReport") lockReportPanel();

  closeGlobalSearchResults();
}
function goToTablesPanel() { goToPanel("panelTables"); }

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

// ============ KAYIT OL (işletme sahibi / yönetici hesabı) ============
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
      reportPassword: reportPass,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    showToast("İşletme oluşturuldu, giriş yapılıyor...");
    await loginBusiness(id, name, "admin", null);
  } catch (err) {
    errEl.textContent = "Kayıt sırasında hata oluştu: " + err.message;
    errEl.classList.remove("hidden");
  }
});

// ============ GİRİŞ YAP (işletme sahibi veya personel) ============
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const errEl = document.getElementById("loginError");
  errEl.classList.add("hidden");

  const id = document.getElementById("loginBusinessId").value.trim().toLowerCase().replace(/\s+/g, "_");
  const username = document.getElementById("loginUsername").value.trim();
  const pass = document.getElementById("loginPassword").value;

  try {
    const snap = await KafeDB.businessDoc(id).get();
    if (!snap.exists) {
      errEl.textContent = "İşletme ID veya şifre hatalı.";
      errEl.classList.remove("hidden");
      return;
    }
    const business = snap.data();

    if (!username) {
      // İşletme sahibi (yönetici) girişi
      if (business.password !== pass) {
        errEl.textContent = "İşletme ID veya şifre hatalı.";
        errEl.classList.remove("hidden");
        return;
      }
      await loginBusiness(id, business.name, "admin", null);
      return;
    }

    // Personel girişi: kullanıcı adı + şifre users koleksiyonunda aranır.
    const userSnap = await KafeDB.usersCol(id).where("username", "==", username).limit(1).get();
    if (userSnap.empty) {
      errEl.textContent = "Kullanıcı adı veya şifre hatalı.";
      errEl.classList.remove("hidden");
      return;
    }
    const userDoc = userSnap.docs[0];
    const user = userDoc.data();
    if (user.password !== pass) {
      errEl.textContent = "Kullanıcı adı veya şifre hatalı.";
      errEl.classList.remove("hidden");
      return;
    }
    if (user.active === false) {
      errEl.textContent = "Bu kullanıcı pasif durumda. Yöneticinize başvurun.";
      errEl.classList.remove("hidden");
      return;
    }
    await loginBusiness(id, business.name, user.role || "staff", username);
  } catch (err) {
    errEl.textContent = "Giriş sırasında hata oluştu: " + err.message;
    errEl.classList.remove("hidden");
  }
});

async function loginBusiness(id, name, role, username) {
  State.businessId = id;
  State.businessName = name;
  State.role = role || "admin";
  State.username = username || null;
  localStorage.setItem("kafe_business_id", id);
  localStorage.setItem("kafe_username", username || "");

  document.getElementById("businessNameLabel").textContent = name;
  document.getElementById("businessIdLabel").textContent =
    State.username ? `${State.username} (Personel)` : "ID: " + id;

  document.getElementById("authScreen").classList.add("hidden");
  document.getElementById("appScreen").classList.remove("hidden");
  document.getElementById("topBar").classList.remove("hidden");
  document.getElementById("sideNav").classList.remove("hidden");

  document.querySelector('.sidenav-btn[data-panel="panelUsers"]').classList.toggle("hidden", State.role !== "admin");

  startProductsListener();
  startCategoriesListener();
  startTablesListener();
  startPendingOrdersListener();
  if (State.role === "admin") startUsersListener();
  if (typeof initQrPanel === "function") initQrPanel();
}

document.getElementById("logoutBtn").addEventListener("click", () => {
  if (State.unsubProducts) State.unsubProducts();
  if (State.unsubTables) State.unsubTables();
  if (State.unsubPendingOrders) State.unsubPendingOrders();
  if (State.unsubCategories) State.unsubCategories();
  if (State.unsubUsers) State.unsubUsers();
  localStorage.removeItem("kafe_business_id");
  localStorage.removeItem("kafe_username");
  location.reload();
});

// ============ PANEL NAVİGASYONU ============
document.querySelectorAll(".sidenav-btn").forEach((btn) => {
  btn.addEventListener("click", () => goToPanel(btn.dataset.panel));
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

function startCategoriesListener() {
  State.unsubCategories = KafeDB.categoriesCol(State.businessId)
    .orderBy("name")
    .onSnapshot((snap) => {
      State.categories = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      if (typeof renderCategoryList === "function") renderCategoryList();
      if (typeof fillProductCategoryOptions === "function") fillProductCategoryOptions();
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

function startUsersListener() {
  State.unsubUsers = KafeDB.usersCol(State.businessId)
    .orderBy("username")
    .onSnapshot((snap) => {
      State.users = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      if (typeof renderUsersList === "function") renderUsersList();
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
  if (calling.length && typeof openTableModal === "function") openTableModal(calling[0].id);
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
    const expected = data.reportPassword || data.password;
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

// ============ GENEL ARAMA (Google benzeri hızlı arama) ============
const globalSearchInput = document.getElementById("globalSearchInput");
const globalSearchResults = document.getElementById("globalSearchResults");

function closeGlobalSearchResults() {
  globalSearchResults.classList.add("hidden");
  globalSearchResults.innerHTML = "";
}

function runGlobalSearch(query) {
  const q = query.trim();
  if (!q) { closeGlobalSearchResults(); return; }

  const productResults = State.products
    .filter((p) => turkishIncludes(p.name, q) || turkishIncludes(p.category, q))
    .slice(0, 5)
    .map((p) => ({ type: "Ürün", icon: "📦", label: p.name, sub: `${p.category || "Kategorisiz"} · ${formatCurrency(p.price)}`, action: () => { goToPanel("panelStock"); openProductModal(p); } }));

  const tableResults = State.tables
    .filter((t) => turkishIncludes(t.name, q) || turkishIncludes(t.section, q))
    .slice(0, 5)
    .map((t) => ({ type: "Masa", icon: "🍽️", label: t.name, sub: t.section || "Bölümsüz", action: () => { goToPanel("panelTables"); openTableModal(t.id); } }));

  const userResults = State.role === "admin"
    ? State.users
        .filter((u) => turkishIncludes(u.username, q))
        .slice(0, 5)
        .map((u) => ({ type: "Kullanıcı", icon: "👤", label: u.username, sub: u.role === "admin" ? "Yönetici" : "Personel", action: () => { goToPanel("panelUsers"); if (typeof openUserModal === "function") openUserModal(u); } }))
    : [];

  const results = [...productResults, ...tableResults, ...userResults];

  if (results.length === 0) {
    globalSearchResults.innerHTML = `<div class="gsearch-empty">Sonuç bulunamadı.</div>`;
  } else {
    globalSearchResults.innerHTML = results
      .map((r, idx) => `
        <div class="gsearch-item" data-idx="${idx}">
          <span class="gsearch-icon">${r.icon}</span>
          <div class="gsearch-text">
            <div class="gsearch-label">${escapeHtml(r.label)}</div>
            <div class="gsearch-sub">${r.type} · ${escapeHtml(r.sub)}</div>
          </div>
        </div>
      `)
      .join("");
    globalSearchResults.querySelectorAll(".gsearch-item").forEach((el) => {
      el.addEventListener("click", () => {
        results[Number(el.dataset.idx)].action();
        globalSearchInput.value = "";
        closeGlobalSearchResults();
      });
    });
  }
  globalSearchResults.classList.remove("hidden");
}

if (globalSearchInput) {
  globalSearchInput.addEventListener("input", (e) => runGlobalSearch(e.target.value));
  globalSearchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") runGlobalSearch(e.target.value);
    if (e.key === "Escape") { globalSearchInput.value = ""; closeGlobalSearchResults(); }
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".gsearch-wrap")) closeGlobalSearchResults();
  });
}

// ============ GİRİŞ SAYFASI ROTASI / QR PUBLIC MENÜ KONTROLÜ ============
(function initRoute() {
  const params = new URLSearchParams(location.search);
  const menuBusinessId = params.get("menu");

  if (menuBusinessId) {
    document.getElementById("authScreen").classList.add("hidden");
    document.getElementById("publicMenuScreen").classList.remove("hidden");
    if (typeof loadPublicMenu === "function") loadPublicMenu(menuBusinessId);
    return;
  }

  const savedId = localStorage.getItem("kafe_business_id");
  if (savedId) {
    const savedUsername = localStorage.getItem("kafe_username") || "";
    KafeDB.businessDoc(savedId).get().then(async (snap) => {
      if (!snap.exists) { localStorage.removeItem("kafe_business_id"); return; }
      if (!savedUsername) {
        loginBusiness(savedId, snap.data().name, "admin", null);
      } else {
        const userSnap = await KafeDB.usersCol(savedId).where("username", "==", savedUsername).limit(1).get();
        if (!userSnap.empty && userSnap.docs[0].data().active !== false) {
          loginBusiness(savedId, snap.data().name, userSnap.docs[0].data().role || "staff", savedUsername);
        } else {
          localStorage.removeItem("kafe_business_id");
          localStorage.removeItem("kafe_username");
        }
      }
    });
  }
})();
