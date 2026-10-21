const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const initial = () => ({ trips: [{ id: 't', name: 'Férias', people: [] }], expenses: [], plans: [], activeTrip: 't', theme: 'light' });
const copy = x => JSON.parse(JSON.stringify(x));
function memoryStorage() {
  const values = new Map();
  return { get length() { return values.size; }, key: i => [...values.keys()][i], getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, v), removeItem: k => values.delete(k), values };
}

// The external Firestore boundary is simulated; production state and import logic run unchanged.
function database(data = {}) {
  const tables = copy({ trips: [], expenses: [], plans: [], ...data });
  const listeners = {};
  const errors = {};
  const snapshot = name => ({ metadata: { fromCache: false, hasPendingWrites: false }, docs: (tables[name] || []).map(item => ({ id: item.id, exists: true, data: () => { const { id, ...rest } = item; return copy(rest); } })) });
  const db = {
    tables, listeners, fail: false, reads: 0,
    enablePersistence: () => Promise.resolve(),
    collection(name) {
      return {
        doc: id => ({ name, id: id || `auto-${Math.random()}`, onSnapshot() {} }),
        onSnapshot(options, callback, error) { listeners[name] = typeof options === 'function' ? options : callback; errors[name] = error; return () => {}; },
        get: async () => { db.reads++; if (db.fail) throw Error('offline'); return snapshot(name); }
      };
    },
    async runTransaction(fn) {
      if (db.fail) throw Error('offline');
      const writes = [];
      const result = await fn({
        get: async ref => { const item = (tables[ref.name] || []).find(x => x.id === ref.id); return { exists: !!item, data: () => { const { id, ...rest } = item; return copy(rest); } }; },
        set: (ref, value) => writes.push({ ref, value: copy(value) }),
        delete: ref => writes.push({ ref, value: null })
      });
      if (db.beforeCommit) await db.beforeCommit();
      if (db.fail) throw Error('offline');
      for (const { ref, value } of writes) {
        tables[ref.name] ||= [];
        tables[ref.name] = tables[ref.name].filter(x => x.id !== ref.id);
        if (value !== null) tables[ref.name].push({ ...value, id: ref.id });
      }
      return result;
    },
    batch() { const writes = []; return { set: (ref, data) => writes.push({ ref, data }), commit: async () => { for (const { ref, data } of writes) { tables[ref.name] = (tables[ref.name] || []).filter(x => x.id !== ref.id); tables[ref.name].push({ id: ref.id, ...copy(data) }); } } }; },
    emit(name) { listeners[name]?.(snapshot(name)); },
    reject(name) { errors[name]?.({ code: 'permission-denied' }); }
  };
  return db;
}
function app(storage, db, { configured = true, signedIn = true, uid = 'shared-user' } = {}) {
  const handlers = {};
  const messages = [];
  let read;
  const events = {};
  let authCallback;
  const auth = {
    currentUser: signedIn ? { uid } : null,
    setPersistence: async () => {},
    onAuthStateChanged(callback) { authCallback = callback; Promise.resolve().then(() => callback(auth.currentUser)); return () => {}; },
    async signInWithEmailAndPassword(email, password) { if (password !== 'correct-secret') throw Error('auth/invalid-credential'); auth.currentUser = { uid: 'shared-user' }; authCallback(auth.currentUser); },
    async signOut() { auth.currentUser = null; authCallback?.(null); }
  };
  const authFactory = () => auth;
  authFactory.Auth = { Persistence: { LOCAL: 'local' } };
  const context = vm.createContext({ console, localStorage: storage, setTimeout, clearTimeout,
    window: { FERIAS_FIREBASE: configured ? { apiKey: 'test' } : {}, FERIAS_SHARED_AUTH: { email: 'shared@example.test', uid: 'shared-user' }, addEventListener(name, fn) { events[name] = fn; } },
    firebase: { initializeApp() {}, firestore: () => db, auth: authFactory },
    navigator: { onLine: true },
    document: { addEventListener() {}, querySelector: selector => ({ addEventListener: (event, fn) => { handlers[selector] = fn; } }) },
    confirm: () => true, toast: text => messages.push(text), refreshAll() {}, applyTheme() {}, refreshLock() {}, updatePassStatus() {},
    FileReader: class { readAsText(file) { this.result = JSON.stringify(file); read = this.onload(); } }
  });
  const moduleFile = path.join(__dirname, '../data-store.js');
  if (fs.existsSync(moduleFile)) vm.runInContext(fs.readFileSync(moduleFile, 'utf8'), context);
  const sessionFile = path.join(__dirname, '../cloud-session.js');
  if (fs.existsSync(sessionFile)) vm.runInContext(fs.readFileSync(sessionFile, 'utf8'), context);
  const source = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
  const prefix = source.slice(source.indexOf("  'use strict';"), source.indexOf('  const activeTrip ='));
  const importer = source.slice(source.indexOf("  $('#importInput').addEventListener"), source.indexOf('  function download('));
  vm.runInContext(`const $ = sel => document.querySelector(sel); ${prefix}\n${importer}\nglobalThis.api = { initCloud, get state() { return state; }, edit(fn) { fn(state); save(); } };`, context);
  return {
    get state() { return copy(context.api.state); }, messages, context, auth,
    edit: fn => context.api.edit(fn),
    init: () => context.api.initCloud(),
    online: () => events.online?.(),
    async import(data) { handlers['#importInput']({ target: { files: [data], value: 'file' } }); await read; },
    async settle() { for (let i = 0; i < 15; i++) await new Promise(resolve => setImmediate(resolve)); }
  };
}

test('offline expenses survive reconnect even when cloud already contains trips', async () => {
  const storage = memoryStorage();
  storage.setItem('ferias_gastos_v1', JSON.stringify({ ...initial(), expenses: [{ id: 'offline', tripId: 't', amount: 12 }] }));
  const db = database({ trips: initial().trips, expenses: [{ id: 'remote', tripId: 't', amount: 8 }] });
  const ui = app(storage, db);
  ui.init();
  db.emit('expenses'); db.emit('trips'); db.emit('plans');
  await ui.settle();
  assert.deepEqual(ui.state.expenses.map(x => x.id).sort(), ['offline', 'remote']);
  assert.ok(db.tables.expenses.some(x => x.id === 'offline'));
});

test('restoring a backup removes later remote records but keeps recoverable copies', async () => {
  const storage = memoryStorage();
  storage.setItem('ferias_gastos_v1', JSON.stringify(initial()));
  const db = database({ trips: initial().trips, expenses: [{ id: 'later', tripId: 't', amount: 99 }] });
  const ui = app(storage, db); ui.init();
  await ui.settle();
  await ui.import(initial());
  db.emit('expenses');
  assert.deepEqual(ui.state.expenses, []);
  assert.deepEqual(db.tables.expenses, []);
  assert.ok(db.tables.recoveries.some(x => x.collection === 'expenses' && x.recordId === 'later' && x.data.amount === 99));
  assert.ok([...storage.values.keys()].some(k => k.startsWith('ferias_gastos_v1_recovery_')));
});

test('old backups initialize plans immediately without reloading', async () => {
  const storage = memoryStorage(); storage.setItem('ferias_gastos_v1', JSON.stringify(initial()));
  const db = database();
  const ui = app(storage, db, { configured: false });
  const old = initial(); old.trips[0].name = 'Backup antigo'; delete old.plans;
  await ui.import(old);
  assert.equal(ui.state.trips[0].name, 'Backup antigo');
  assert.deepEqual(ui.state.plans, []);
  ui.edit(s => s.plans.push({ id: 'p', tripId: 't' }));
  assert.equal(ui.state.plans.length, 1);
});

test('offline queue survives closing the app and retrying a failed transaction', async () => {
  const storage = memoryStorage(); storage.setItem('ferias_gastos_v1', JSON.stringify(initial()));
  const db = database({ trips: initial().trips }); db.fail = true;
  const first = app(storage, db); first.init();
  first.edit(s => s.expenses.push({ id: 'pending', tripId: 't', amount: 27 }));
  await first.settle();
  const reopened = app(storage, db); reopened.init();
  db.emit('expenses');
  assert.equal(reopened.state.expenses[0].amount, 27);
  db.fail = false;
  reopened.online();
  reopened.edit(s => { s.theme = 'dark'; });
  await reopened.settle();
  assert.equal(db.tables.expenses[0].amount, 27);
  assert.deepEqual(JSON.parse(storage.getItem('ferias_gastos_v1'))._sync.pending, {});
});

test('conflicting local edit archives the remote version before replacement', async () => {
  const storage = memoryStorage();
  storage.setItem('ferias_gastos_v1', JSON.stringify({ ...initial(), expenses: [{ id: 'same', tripId: 't', amount: 12 }] }));
  const db = database({ trips: initial().trips, expenses: [{ id: 'same', tripId: 't', amount: 99 }] });
  const ui = app(storage, db); ui.init(); await ui.settle();
  assert.equal(db.tables.expenses[0].amount, 12);
  assert.ok(db.tables.recoveries.some(x => x.recordId === 'same' && x.data.amount === 99));
});

test('failed restore keeps local data and all remote collections unchanged', async () => {
  const storage = memoryStorage();
  const before = { ...initial(), expenses: [{ id: 'keep', tripId: 't', amount: 7 }] };
  storage.setItem('ferias_gastos_v1', JSON.stringify(before));
  const db = database({ trips: before.trips, expenses: before.expenses });
  const ui = app(storage, db); ui.init(); await ui.settle();
  db.fail = true;
  await ui.import(initial());
  assert.deepEqual(ui.state.expenses, before.expenses);
  assert.deepEqual(db.tables.expenses, before.expenses);
  assert.ok(!ui.messages.some(x => x.includes('Dados importados')));
});

test('storage quota failure blocks restore before changing live data', async () => {
  const storage = memoryStorage();
  const before = { ...initial(), expenses: [{ id: 'keep', tripId: 't', amount: 7 }] };
  storage.setItem('ferias_gastos_v1', JSON.stringify(before));
  const db = database({ trips: before.trips, expenses: before.expenses });
  const ui = app(storage, db); ui.init(); await ui.settle();
  storage.setItem = () => { throw Error('quota'); };
  await ui.import(initial());
  assert.deepEqual(ui.state.expenses, before.expenses);
  assert.deepEqual(db.tables.expenses, before.expenses);
});

test('malformed backup never replaces current local or remote records', async () => {
  const storage = memoryStorage(); storage.setItem('ferias_gastos_v1', JSON.stringify(initial()));
  const db = database({ trips: initial().trips });
  const ui = app(storage, db); ui.init(); await ui.settle();
  await ui.import({ ...initial(), plans: 'invalid' });
  assert.deepEqual(ui.state, initial());
  assert.deepEqual(db.tables.trips, initial().trips);
});

test('oversized restore refuses to partially replace remote data', async () => {
  const storage = memoryStorage(); storage.setItem('ferias_gastos_v1', JSON.stringify(initial()));
  const expenses = Array.from({ length: 201 }, (_, i) => ({ id: `e${i}`, tripId: 't', amount: i }));
  const db = database({ trips: initial().trips, expenses });
  const ui = app(storage, db); ui.init(); await ui.settle();
  await ui.import(initial());
  assert.deepEqual(db.tables.expenses, expenses);
  assert.ok(ui.messages.some(x => x.includes('demasiado grande')));
});

test('two offline tabs preserve both queues in shared local storage', async () => {
  const storage = memoryStorage(); storage.setItem('ferias_gastos_v1', JSON.stringify(initial()));
  const first = app(storage, database());
  const second = app(storage, database());
  first.edit(s => s.expenses.push({ id: 'a', tripId: 't', amount: 1 }));
  second.edit(s => s.expenses.push({ id: 'b', tripId: 't', amount: 2 }));
  const db = database({ trips: initial().trips });
  const reopened = app(storage, db); reopened.init(); await reopened.settle();
  assert.deepEqual(db.tables.expenses.map(x => x.id).sort(), ['a', 'b']);
});

test('a new device does not upload its generated default trip into an existing cloud', async () => {
  const storage = memoryStorage();
  const db = database({ trips: initial().trips });
  const ui = app(storage, db); ui.init(); db.emit('trips'); await ui.settle();
  assert.deepEqual(db.tables.trips, initial().trips);
});

test('local-only restore remains queued if cloud is enabled later', async () => {
  const storage = memoryStorage(); storage.setItem('ferias_gastos_v1', JSON.stringify(initial()));
  const db = database({ trips: initial().trips });
  const ui = app(storage, db, { configured: false });
  const backup = { ...initial(), expenses: [{ id: 'restored', tripId: 't', amount: 13 }] };
  await ui.import(backup);
  const reopened = app(storage, db); reopened.init(); db.emit('expenses'); await reopened.settle();
  assert.equal(db.tables.expenses[0]?.amount, 13);
});

test('restore transaction failure commits neither deletions nor recovery writes', async () => {
  const storage = memoryStorage(); storage.setItem('ferias_gastos_v1', JSON.stringify(initial()));
  const db = database({ trips: initial().trips, expenses: [{ id: 'keep', tripId: 't', amount: 5 }] });
  const ui = app(storage, db); ui.init(); await ui.settle(); db.emit('expenses');
  const before = copy(db.tables);
  db.beforeCommit = () => { throw Error('permission-denied'); };
  await ui.import(initial());
  assert.deepEqual(db.tables, before);
  assert.equal(ui.state.expenses[0].id, 'keep');
});

test('newer edit during an in-flight transaction remains queued and is eventually saved', async () => {
  const storage = memoryStorage(); storage.setItem('ferias_gastos_v1', JSON.stringify(initial()));
  const db = database({ trips: initial().trips });
  const ui = app(storage, db); ui.init(); await ui.settle();
  let release;
  db.beforeCommit = () => new Promise(resolve => { release = resolve; });
  ui.edit(s => s.expenses.push({ id: 'edit', tripId: 't', amount: 1 }));
  await new Promise(resolve => setImmediate(resolve));
  ui.edit(s => { s.expenses[0].amount = 2; });
  db.beforeCommit = null; release(); await ui.settle();
  assert.equal(db.tables.expenses[0].amount, 2);
});

test('cached empty snapshot cannot erase local data', async () => {
  const storage = memoryStorage();
  storage.setItem('ferias_gastos_v1', JSON.stringify({ ...initial(), expenses: [{ id: 'local', tripId: 't', amount: 8 }] }));
  const db = database({ trips: initial().trips });
  const ui = app(storage, db); ui.init(); await ui.settle();
  db.listeners.expenses({ metadata: { fromCache: true, hasPendingWrites: false }, docs: [] });
  assert.equal(ui.state.expenses[0].id, 'local');
});

test('offline deletion remains a tombstone and is not resurrected by a remote snapshot', async () => {
  const storage = memoryStorage();
  const expense = { id: 'delete', tripId: 't', amount: 10 };
  storage.setItem('ferias_gastos_v1', JSON.stringify({ ...initial(), expenses: [expense] }));
  const db = database({ trips: initial().trips, expenses: [expense] });
  const ui = app(storage, db); ui.init(); await ui.settle();
  db.fail = true;
  ui.edit(s => { s.expenses = []; }); await ui.settle();
  db.emit('expenses'); assert.deepEqual(ui.state.expenses, []);
  db.fail = false;
  ui.edit(s => { s.theme = 'dark'; }); await ui.settle();
  assert.deepEqual(db.tables.expenses, []);
  assert.ok(db.tables.recoveries.some(x => x.recordId === 'delete' && x.data.amount === 10));
});

test('recoveries remain exportable locally when the remote connection is unavailable', async () => {
  const storage = memoryStorage(); storage.setItem('ferias_gastos_v1', JSON.stringify(initial()));
  const db = database({ trips: initial().trips });
  const ui = app(storage, db); ui.init(); await ui.settle(); db.fail = true;
  const bundle = await vm.runInContext('dataStore.recoveries()', ui.context);
  assert.ok(bundle.local.length);
  assert.equal(bundle.remoteUnavailable, true);
});

test('local restore rolls back in memory if only the final primary write fails', async () => {
  const storage = memoryStorage(); storage.setItem('ferias_gastos_v1', JSON.stringify(initial()));
  const ui = app(storage, database(), { configured: false });
  const write = storage.setItem;
  storage.setItem = (key, value) => { if (key === 'ferias_gastos_v1') throw Error('quota'); write(key, value); };
  const backup = initial(); backup.trips[0].name = 'Replacement';
  await ui.import(backup);
  assert.equal(vm.runInContext('dataStore.state.trips[0].name', ui.context), 'Férias');
  assert.equal(JSON.parse(storage.getItem('ferias_gastos_v1')).trips[0].name, 'Férias');
});

module.exports = { initial, copy, memoryStorage, database, app };

test('cloud cannot read or write travel records before a shared-password sign-in', async () => {
  const storage = memoryStorage();
  storage.setItem('ferias_gastos_v1', JSON.stringify({ ...initial(), expenses: [{ id: 'private', tripId: 't', amount: 10 }] }));
  const db = database();
  const ui = app(storage, db, { signedIn: false }); ui.init(); await ui.settle();
  assert.deepEqual(db.tables.trips, []);
  assert.deepEqual(db.tables.expenses, []);
  assert.equal(db.reads, 0);
  assert.equal(ui.state.expenses[0].id, 'private');
});

test('a different authenticated account cannot synchronize the shared trips', async () => {
  const storage = memoryStorage(); storage.setItem('ferias_gastos_v1', JSON.stringify(initial()));
  const db = database();
  const ui = app(storage, db, { uid: 'unrelated-user' }); ui.init(); await ui.settle();
  assert.deepEqual(db.tables.trips, []);
  assert.equal(db.reads, 0);
});

test('correct shared password connects a second device without discarding remote-only records', async () => {
  const storage = memoryStorage(); storage.setItem('ferias_gastos_v1', JSON.stringify(initial()));
  const db = database({ trips: initial().trips, expenses: [{ id: 'remote-only', tripId: 't', amount: 41 }] });
  const ui = app(storage, db, { signedIn: false }); ui.init(); await ui.settle();
  await vm.runInContext("cloud.session.signIn('correct-secret')", ui.context); await ui.settle();
  assert.equal(ui.state.expenses[0].id, 'remote-only');
  assert.equal(db.tables.expenses[0].amount, 41);
  assert.ok(![...storage.values.values()].some(value => value.includes('correct-secret')));
  const archives = [...storage.values.entries()].filter(([key]) => key.includes('_recovery_')).map(([, value]) => JSON.parse(value));
  assert.ok(archives.some(x => x.reason === 'before-shared-sync' && x.data.remote.expenses[0].amount === 41));
});

test('wrong shared password never opens Firestore or changes local records', async () => {
  const storage = memoryStorage(); storage.setItem('ferias_gastos_v1', JSON.stringify(initial()));
  const db = database(); const ui = app(storage, db, { signedIn: false }); ui.init(); await ui.settle();
  await assert.rejects(vm.runInContext("cloud.session.signIn('wrong-password')", ui.context));
  assert.equal(db.reads, 0); assert.deepEqual(ui.state, initial());
});

test('signing out retains local data but prevents subsequent remote writes', async () => {
  const storage = memoryStorage(); storage.setItem('ferias_gastos_v1', JSON.stringify(initial()));
  const db = database({ trips: initial().trips }); const ui = app(storage, db); ui.init(); await ui.settle();
  await vm.runInContext('cloud.session.signOut()', ui.context);
  ui.edit(s => s.expenses.push({ id: 'local-after-signout', tripId: 't', amount: 2 })); await ui.settle();
  assert.equal(ui.state.expenses[0].amount, 2);
  assert.deepEqual(db.tables.expenses, []);
  assert.ok(JSON.parse(storage.getItem('ferias_gastos_v1'))._sync.pending['expenses/local-after-signout']);
});

test('failure to protect the pre-sync snapshot prevents every remote write', async () => {
  const storage = memoryStorage(); storage.setItem('ferias_gastos_v1', JSON.stringify(initial()));
  const db = database(); const ui = app(storage, db, { signedIn: false }); ui.init(); await ui.settle();
  const write = storage.setItem;
  storage.setItem = (key, value) => { if (key.includes('_recovery_')) throw Error('quota'); write(key, value); };
  await vm.runInContext("cloud.session.signIn('correct-secret')", ui.context); await ui.settle();
  assert.deepEqual(db.tables.trips, []);
  assert.deepEqual(ui.state, initial());
});

test('losing a live subscription pauses writes until a new verified connection', async () => {
  const storage = memoryStorage(); storage.setItem('ferias_gastos_v1', JSON.stringify(initial()));
  const db = database({ trips: initial().trips }); const ui = app(storage, db); ui.init(); await ui.settle();
  db.reject('trips');
  ui.edit(s => s.expenses.push({ id: 'after-denial', tripId: 't', amount: 4 })); await ui.settle();
  assert.deepEqual(db.tables.expenses, []);
  assert.equal(ui.state.expenses[0].amount, 4);
});
