// Hakan Aytaş CodeBug yapımıdır - İletişim: hffhakan@gmail.com
// admin.js
// Kullanıcı (personel) yönetimi ve sistem sıfırlama işlemleri.
// Bu panel sadece işletme sahibi / yönetici (State.role === "admin") tarafından görülebilir.

// ============ KULLANICI LİSTESİ (Türkçe canlı arama) ============
function renderUsersList() {
  const list = document.getElementById("usersList");
  if (!list) return;
  list.innerHTML = "";

  const q = document.getElementById("userSearchInput")?.value || "";
  const filtered = State.users.filter((u) => turkishIncludes(u.username, q));

  if (filtered.length === 0) {
    list.innerHTML = `<p class="text-gray-400 text-sm">Kullanıcı bulunamadı.</p>`;
    return;
  }

  filtered.forEach((u) => {
    const row = document.createElement("div");
    row.className = "user-row" + (u.active === false ? " inactive" : "");
    row.innerHTML = `
      <div class="flex-1">
        <div class="font-semibold">${escapeHtml(u.username)}</div>
        <div class="text-xs text-gray-500">${u.role === "admin" ? "Yönetici" : "Personel"} · ${u.active === false ? "Pasif" : "Aktif"}</div>
      </div>
      <button class="qty-btn" data-edit-user="${u.id}">✏️</button>
      <button class="qty-btn" data-del-user="${u.id}">✕</button>
    `;
    list.appendChild(row);
  });

  list.querySelectorAll("[data-edit-user]").forEach((btn) => {
    btn.addEventListener("click", () => openUserModal(State.users.find((u) => u.id === btn.dataset.editUser)));
  });
  list.querySelectorAll("[data-del-user]").forEach((btn) => {
    btn.addEventListener("click", () => deleteUser(btn.dataset.delUser));
  });
}

document.getElementById("userSearchInput")?.addEventListener("input", () => renderUsersList());

// ============ KULLANICI EKLE / DÜZENLE ============
document.getElementById("addUserBtn")?.addEventListener("click", () => openUserModal(null));

function openUserModal(user) {
  document.getElementById("userForm").reset();
  document.getElementById("userId").value = user ? user.id : "";
  document.getElementById("userUsername").value = user ? user.username : "";
  document.getElementById("userPassword").value = "";
  document.getElementById("userPassword").placeholder = user ? "Yeni şifre (değiştirmek için doldurun)" : "Şifre";
  document.getElementById("userRole").value = user ? (user.role || "staff") : "staff";
  document.getElementById("userActive").checked = user ? user.active !== false : true;
  openModal("userModal");
}

document.getElementById("userForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = document.getElementById("userId").value;
  const username = document.getElementById("userUsername").value.trim();
  const password = document.getElementById("userPassword").value;
  const role = document.getElementById("userRole").value;
  const active = document.getElementById("userActive").checked;
  if (!username) return;

  const duplicate = State.users.find((u) => u.username === username && u.id !== id);
  if (duplicate) { showToast("Bu kullanıcı adı zaten kullanılıyor."); return; }

  if (id) {
    const data = { username, role, active };
    if (password) data.password = password;
    await KafeDB.usersCol(State.businessId).doc(id).update(data);
    showToast("Kullanıcı güncellendi.");
  } else {
    if (!password) { showToast("Yeni kullanıcı için şifre girin."); return; }
    await KafeDB.usersCol(State.businessId).add({ username, password, role, active, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    showToast("Kullanıcı eklendi.");
  }
  closeModal("userModal");
});

async function deleteUser(id) {
  const user = State.users.find((u) => u.id === id);
  if (!user) return;
  if (!confirm(`"${user.username}" kullanıcısını silmek istediğinize emin misiniz?`)) return;
  await KafeDB.usersCol(State.businessId).doc(id).delete();
  showToast("Kullanıcı silindi.");
}

// ============ SİSTEM SIFIRLAMA (yalnızca yönetici) ============
async function deleteAllDocs(colRef) {
  const snap = await colRef.get();
  if (snap.empty) return 0;
  const batch = db.batch();
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
  return snap.size;
}

document.getElementById("resetProductsBtn")?.addEventListener("click", async () => {
  if (!confirm("Tüm ürünler ve kategoriler kalıcı olarak silinecek. Emin misiniz?")) return;
  const n1 = await deleteAllDocs(KafeDB.productsCol(State.businessId));
  const n2 = await deleteAllDocs(KafeDB.categoriesCol(State.businessId));
  showToast(`${n1} ürün ve ${n2} kategori silindi.`);
});

document.getElementById("resetTablesBtn")?.addEventListener("click", async () => {
  if (!confirm("Tüm masalar kalıcı olarak silinecek. Emin misiniz?")) return;
  const n = await deleteAllDocs(KafeDB.tablesCol(State.businessId));
  showToast(`${n} masa silindi.`);
});

document.getElementById("resetUsersBtn")?.addEventListener("click", async () => {
  if (!confirm("İşletme sahibi hariç tüm personel kullanıcıları kalıcı olarak silinecek. Emin misiniz?")) return;
  const n = await deleteAllDocs(KafeDB.usersCol(State.businessId));
  showToast(`${n} kullanıcı silindi.`);
});

document.getElementById("resetOrdersBtn")?.addEventListener("click", async () => {
  if (!confirm("Tüm sipariş geçmişi ve bekleyen siparişler (test verileri) kalıcı olarak silinecek. Emin misiniz?")) return;
  const n1 = await deleteAllDocs(KafeDB.ordersCol(State.businessId));
  const n2 = await deleteAllDocs(KafeDB.pendingOrdersCol(State.businessId));
  showToast(`${n1} adisyon geçmişi ve ${n2} bekleyen sipariş temizlendi.`);
});
