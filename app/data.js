// Data layer: Firebase (live) or localStorage (demo mode: ?demo=1)
import { firebaseConfig, EMAIL_DOMAIN } from './config.js?v=2';

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
    async get(col, id) { const d = mem[col][id]; return d ? { id, ...d } : null; },
    async add(col, data) { const id = uid(); mem[col][id] = { ...data, createdAt: Date.now() }; save(); return id; },
    async set(col, id, data) { mem[col][id] = { ...(mem[col][id] || {}), ...data, updatedAt: Date.now() }; save(); },
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
  const db = F.initializeFirestore(app, { localCache: F.persistentLocalCache() });
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
      const s = await F.getDocs(q);
      return s.docs.map(d => ({ id: d.id, ...d.data() }));
    },
    async get(col, id) { const s = await F.getDoc(F.doc(db, col, id)); return s.exists() ? { id: s.id, ...s.data() } : null; },
    async add(col, data) { const r = await F.addDoc(F.collection(db, col), { ...data, createdAt: Date.now(), by: auth.currentUser?.email || '' }); return r.id; },
    async set(col, id, data) { await F.setDoc(F.doc(db, col, id), { ...data, updatedAt: Date.now(), by: auth.currentUser?.email || '' }, { merge: true }); },
    async del(col, id) { await F.deleteDoc(F.doc(db, col, id)); },
  };
}

export default api;
