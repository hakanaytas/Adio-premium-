// Hakan Aytaş CodeBug yapımıdır - İletişim: hffhakan@gmail.com
// firebase-config.js
// Firebase compat SDK (index.html içine <script> ile eklenmiştir) kullanılarak
// uygulama başlatılır ve Firestore referansı global olarak dışa açılır.

const firebaseConfig = {
  apiKey: "AIzaSyAy1FpN_NIca9pTkzb9h8bWt5klcJgIOeM",
  authDomain: "adio-f29f7.firebaseapp.com",
  projectId: "adio-f29f7",
  storageBucket: "adio-f29f7.firebasestorage.app",
  messagingSenderId: "512791618555",
  appId: "1:512791618555:web:b56a3821659739d964e15e",
  measurementId: "G-HHKGY4X8YW"
};

firebase.initializeApp(firebaseConfig);

// Diğer dosyalarda (app.js, tables.js, menu-stock.js, qr-quark.js) kullanılacak
// ortak Firestore referansı ve yardımcı koleksiyon yol fonksiyonları.
const db = firebase.firestore();

/**
 * Çoklu işletme (multi-tenant) izolasyonu:
 * Tüm veriler businesses/{business_id}/... altında tutulur.
 * Bu sayede 10 farklı işletme aynı Firestore projesinde
 * veri karışıklığı olmadan çalışabilir.
 */
const KafeDB = {
  businessDoc(businessId) {
    return db.collection("businesses").doc(businessId);
  },
  tablesCol(businessId) {
    return this.businessDoc(businessId).collection("tables");
  },
  productsCol(businessId) {
    return this.businessDoc(businessId).collection("products");
  },
  ordersCol(businessId) {
    return this.businessDoc(businessId).collection("orders");
  },
};
