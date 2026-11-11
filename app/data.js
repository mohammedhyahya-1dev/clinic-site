// Data layer: Firebase (live) or localStorage (demo mode: ?demo=1)
import { firebaseConfig, EMAIL_DOMAIN } from './config.js?v=4';

const DEMO = new URLSearchParams(location.search).has('demo');
const COLS = ['patients', 'appointments', 'treatments', 'payments', 'settings'];

let api;

if (DEMO) {
  const KEY = 'clinic-demo-db';
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
  let mem = load();
  COLS.forEach(c => mem[c] = mem[c] || {});
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(mem)); } catch {} };
  const uid = () => Math.random().toString(36).slice(2, 12);
  let user = null; const listeners = [];
  api = {
    demo: true,
    onAuth(cb) { listeners.push(cb); setTimeout(() => cb(user), 0); },
    async login(u, p) { if (!u || !p) throw new Error('auth/invalid-credential'); user = { email: u + '@' + EMAIL_DOMAIN }; listeners.forEach(f => f(user)); },
    async logout() { user = null; listeners.forEach(f => f(user)); },
    async list(col, where) {
      let rows = Object.entries(mem[col]).map(([id, d]) => ({ id, ...d }));
      if (where) rows = rows.filter(r => where.every(([k, op, v]) =>
        op === '==' ? r[k] === v : op === '>=' ? r[k] >= v : op === '<=' ? r[k] <= v : true));
      return rows;
    },
    async listServer(col, where) { return this.list(col, where); },
    async get(col, id) { const d = mem[col][id]; return d ? { id, ...d } : null; },
    async add(col, data) { const id = uid(); mem[col][id] = { ...data, createdAt: Date.now() }; save(); return id; },
    async set(col, id, data) { mem[col][id] = { ...(mem[col][id] || {}), ...data, updatedAt: Date.now() }; save(); },
    async put(col, id, data) { (mem[col] ||= {})[id] = { ...data }; save(); },
    async del(col, id) { delete mem[col][id]; save(); },
  };
} else {
  const V = '10.12.2';
  const [{ initializeApp }, A, F] = await Promise.all([
    import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`),
    import(`https://www.gstatic.com/firebasejs/${V}/firebase-auth.js`),
    import(`https://www.gstatic.com/firebasejs/${V}/firebase-firestore.js`),
  ]);
  const app = initializeApp(firebaseConfig);
  const auth = A.getAuth(app);
  const db = F.initializeFirestore(app, { localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }) });
  // Fast reads: answer from the copy saved on this device straight away (if there is one),
  // then check the server; if the server has newer data, api.onStale() redraws the page.
  const sig = rows => JSON.stringify(rows.map(r => [r.id, r.updatedAt || 0, r.createdAt || 0, r.status || '']));
  const fastRead = (ref, toRows) => new Promise((resolve, reject) => {
    let first = true, firstSig = '', unsub = () => {};
    const stop = () => { try { unsub(); } catch {} };
    unsub = F.onSnapshot(ref, snap => {
      const rows = toRows(snap);
      if (first) {
        first = false; firstSig = sig([].concat(rows || []));
        resolve(rows);
        if (!snap.metadata.fromCache) setTimeout(stop, 0);
        return;
      }
      if (!snap.metadata.fromCache) {
        stop();
        if (sig([].concat(rows || [])) !== firstSig) api.onStale && api.onStale();
      }
    }, err => { stop(); if (first) { first = false; reject(err); } });
    setTimeout(stop, 30000);
  });
  api = {
    demo: false,
    onAuth(cb) { A.onAuthStateChanged(auth, cb); },
    async login(u, p) {
      const email = u.includes('@') ? u : `${u.trim().toLowerCase()}@${EMAIL_DOMAIN}`;
      await A.setPersistence(auth, A.browserLocalPersistence);
      await A.signInWithEmailAndPassword(auth, email, p);
    },
    async logout() { await A.signOut(auth); },
    async list(col, where) {
      const q = where ? F.query(F.collection(db, col), ...where.map(w => F.where(...w))) : F.collection(db, col);
      return fastRead(q, s => s.docs.map(d => ({ id: d.id, ...d.data() })));
    },
    // Always from the server (used where stale data could cause a wrong write).
    async listServer(col, where) {
      const q = where ? F.query(F.collection(db, col), ...where.map(w => F.where(...w))) : F.collection(db, col);
      const s = await F.getDocsFromServer(q);
      return s.docs.map(d => ({ id: d.id, ...d.data() }));
    },
    async get(col, id) { return fastRead(F.doc(db, col, id), s => s.exists() ? { id: s.id, ...s.data() } : null); },
    async add(col, data) { const r = await F.addDoc(F.collection(db, col), { ...data, createdAt: Date.now(), by: auth.currentUser?.email || '' }); return r.id; },
    async set(col, id, data) { await F.setDoc(F.doc(db, col, id), { ...data, updatedAt: Date.now(), by: auth.currentUser?.email || '' }, { merge: true }); },
    async put(col, id, data) { await F.setDoc(F.doc(db, col, id), data); },
    async del(col, id) { await F.deleteDoc(F.doc(db, col, id)); },
  };
}

export default api;
