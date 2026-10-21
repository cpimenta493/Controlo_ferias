/* Durable local edits and recoverable Firestore replacements. No network on load. */
(() => {
  'use strict';
  const collections = ['trips', 'expenses', 'plans'];
  const copy = value => JSON.parse(JSON.stringify(value));
  const canonical = value => JSON.stringify(value, function (key, item) {
    return item && typeof item === 'object' && !Array.isArray(item)
      ? Object.keys(item).sort().reduce((result, name) => { result[name] = item[name]; return result; }, {}) : item;
  });
  const equal = (a, b) => canonical(a) === canonical(b);
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2);

  function normalize(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Backup inválido');
    const result = copy(value);
    delete result._sync; // A backup must never import another device's pending operations.
    if (result.plans === undefined) result.plans = [];
    for (const name of collections) {
      if (!Array.isArray(result[name])) throw Error(`Lista inválida: ${name}`);
      const ids = new Set();
      for (const item of result[name]) {
        if (!item || typeof item !== 'object' || typeof item.id !== 'string' ||
            !item.id || item.id.includes('/') || ids.has(item.id)) throw Error(`Identificador inválido: ${name}`);
        ids.add(item.id);
      }
    }
    if (!result.trips.length) throw Error('O backup precisa de uma viagem');
    result.trips.forEach(t => {
      if (t.people === undefined) t.people = [];
      if (!Array.isArray(t.people)) throw Error('Lista de pessoas inválida');
    });
    for (const item of [...result.expenses, ...result.plans]) {
      if (!result.trips.some(t => t.id === item.tripId)) throw Error('Viagem em falta no backup');
    }
    if (!result.trips.some(t => t.id === result.activeTrip)) result.activeTrip = result.trips[0].id;
    result.theme = result.theme === 'dark' ? 'dark' : 'light';
    return result;
  }

  class Store {
    constructor(storage, key, initial) {
      this.storage = storage;
      this.key = key;
      this.onChange = () => {};
      this.onStatus = () => {};
      this.db = null;
      this.restoring = false;
      this.inFlight = null;
      const raw = storage.getItem(key);
      const parsed = raw ? JSON.parse(raw) : initial();
      this.lastSerialized = raw;
      this.lastPending = copy(parsed._sync?.pending || {});
      this.fresh = !raw || !!parsed._sync?.fresh;
      this.state = normalize(parsed);
      this.pending = copy(parsed._sync?.pending || {});
      // Upgrade old local data before any listener can replace a collection.
      if (!parsed._sync) {
        if (raw) this.backup('before-sync-upgrade', parsed);
        if (raw) for (const name of collections) for (const item of this.state[name]) this.queue(name, item.id, item);
      }
      this.saved = copy(this.state);
      this.persist();
    }

    backup(reason, data) {
      const key = `${this.key}_recovery_${uid()}`;
      const serialized = JSON.stringify({ createdAt: new Date().toISOString(), reason, data });
      this.storage.setItem(key, serialized);
      if (this.storage.getItem(key) !== serialized) throw Error('Não foi possível verificar a cópia de recuperação');
      return key;
    }

    persist(replace = false) {
      const sharedRaw = this.storage.getItem(this.key);
      if (sharedRaw && sharedRaw !== this.lastSerialized) {
        const shared = JSON.parse(sharedRaw);
        if (replace) this.backup('other-tab-before-restore', shared);
        else {
          const incoming = shared._sync?.pending || {};
          for (const [key, op] of Object.entries(this.pending)) {
            if (!incoming[key] && op.token === this.lastPending[key]?.token) delete this.pending[key];
          }
          for (const [key, op] of Object.entries(incoming)) {
            if (!this.pending[key] || this.pending[key].token === this.lastPending[key]?.token) this.pending[key] = copy(op);
            else if (this.pending[key].token !== op.token) this.backup('other-tab-conflict', shared);
          }
          for (const name of collections) {
            const records = new Map(shared[name].map(item => [item.id, item]));
            for (const op of Object.values(this.pending)) if (op.collection === name) {
              if (op.value === null) records.delete(op.id);
              else records.set(op.id, copy(op.value));
            }
            this.state[name] = [...records.values()];
          }
        }
      }
      const serialized = JSON.stringify({ ...this.state, _sync: { pending: this.pending, fresh: this.fresh } });
      this.storage.setItem(this.key, serialized);
      if (this.storage.getItem(this.key) !== serialized) throw Error('Não foi possível guardar os dados locais');
      this.lastSerialized = serialized;
      this.lastPending = copy(this.pending);
      this.saved = copy(this.state);
    }

    queue(collection, id, value) {
      this.pending[`${collection}/${id}`] = { collection, id, value: copy(value), token: uid() };
    }

    save(state) {
      if (this.restoring) throw Error('Restauro em curso');
      if (this.fresh) {
        for (const name of collections) for (const item of state[name]) this.queue(name, item.id, item);
        this.fresh = false;
      }
      for (const name of collections) {
        const before = new Map(this.saved[name].map(item => [item.id, item]));
        const after = new Map(state[name].map(item => [item.id, item]));
        for (const [id, value] of after) if (!equal(before.get(id) || null, value)) this.queue(name, id, value);
        for (const id of before.keys()) if (!after.has(id)) this.queue(name, id, null);
      }
      this.state = state;
      this.persist(); // No remote writes until the outbox is durable.
      void this.flush();
    }

    accept(collection, snapshot) {
      // Cached and pending-write snapshots are not an authoritative replacement.
      if (this.restoring || snapshot.metadata?.fromCache || snapshot.metadata?.hasPendingWrites) return;
      if (collection === 'trips' && this.fresh) {
        this.fresh = false;
        if (!snapshot.docs.length) {
          for (const name of collections) for (const item of this.state[name]) this.queue(name, item.id, item);
          this.persist();
          void this.flush();
          return;
        }
      }
      const records = new Map(snapshot.docs.map(doc => [doc.id, { ...doc.data(), id: doc.id }]));
      for (const op of Object.values(this.pending)) if (op.collection === collection) {
        if (op.value === null) records.delete(op.id);
        else records.set(op.id, copy(op.value));
      }
      const next = [...records.values()];
      if (collection === 'trips' && !next.length) return; // Keep the last usable trip locally.
      if (equal(this.state[collection], next)) return;
      // Keep the previous state recoverable, including edits from older clients.
      this.backup('before-cloud-update', this.state);
      this.state[collection] = next;
      if (collection === 'trips' && !next.some(t => t.id === this.state.activeTrip)) {
        this.state.activeTrip = next[0]?.id || null;
      }
      this.persist();
      this.onChange(this.state);
    }

    async flush() {
      if (!this.db || this.restoring) return;
      if (this.inFlight) { this.retryRequested = true; return this.inFlight; }
      this.inFlight = (async () => {
        try {
          this.persist();
          while (!this.restoring && Object.keys(this.pending).length) {
            const [key, op] = Object.entries(this.pending)[0];
            const ref = this.db.collection(op.collection).doc(op.id);
            // A replay after a crash must never overwrite an earlier recovery copy.
            const recovery = this.db.collection('recoveries').doc(`${op.token}-${uid()}`);
            await this.db.runTransaction(async tx => {
              const doc = await tx.get(ref);
              const previous = doc.exists ? { ...doc.data(), id: op.id } : null;
              if (equal(previous, op.value)) return;
              // Preserve the server version in the SAME atomic operation as replacement.
              if (previous) tx.set(recovery, {
                reason: 'before-write', collection: op.collection, recordId: op.id,
                createdAt: new Date().toISOString(), data: previous
              });
              if (op.value === null) tx.delete(ref);
              else { const { id, ...data } = op.value; tx.set(ref, data); }
            });
            // A newer edit made during this transaction must remain queued.
            if (this.pending[key]?.token === op.token) delete this.pending[key];
            try { this.persist(); }
            catch (error) { if (!this.pending[key]) this.pending[key] = op; throw error; }
          }
          this.onStatus(Object.keys(this.pending).length ? 'pending' : 'sync');
        } catch (error) {
          this.onStatus('pending'); // Keep the outbox; retry on reconnect or next edit.
        }
      })();
      try { await this.inFlight; }
      finally {
        this.inFlight = null;
        if (this.retryRequested) { this.retryRequested = false; void this.flush(); }
      }
    }

    async restore(value) {
      const next = normalize(value);
      if (this.restoring) throw Error('Já existe um restauro em curso');
      this.restoring = true;
      let committed = false;
      let before;
      try {
        if (this.inFlight) await this.inFlight;
        before = { state: this.state, pending: copy(this.pending), fresh: this.fresh };
        this.backup('before-restore', { ...this.state, _sync: { pending: this.pending } });
        if (this.db) {
          const snapshots = await Promise.all(collections.map(name => this.db.collection(name).get({ source: 'server' })));
          const operations = [];
          collections.forEach((name, index) => {
            const target = new Map(next[name].map(item => [item.id, item]));
            const ids = new Set([...snapshots[index].docs.map(doc => doc.id), ...target.keys()]);
            for (const id of ids) operations.push({ collection: name, id, value: target.get(id) || null });
          });
          // Two writes per record (archive + replacement), plus a recovery manifest.
          // Refuse oversized restores rather than ever applying a partial restore.
          if (operations.length > 200) throw Error('Restauro demasiado grande para uma operação segura (máximo 200 registos distintos)');
          const runId = uid();
          await this.db.runTransaction(async tx => {
            const docs = await Promise.all(operations.map(op => tx.get(this.db.collection(op.collection).doc(op.id))));
            operations.forEach((op, index) => {
              const ref = this.db.collection(op.collection).doc(op.id);
              const doc = docs[index];
              if (doc.exists) tx.set(this.db.collection('recoveries').doc(`${runId}-${index}`), {
                reason: 'before-restore', runId, collection: op.collection, recordId: op.id,
                data: { ...doc.data(), id: op.id }
              });
              if (op.value === null) tx.delete(ref);
              else { const { id, ...data } = op.value; tx.set(ref, data); }
            });
            tx.set(this.db.collection('recoveries').doc(runId), { reason: 'restore-manifest', runId, createdAt: new Date().toISOString() });
          });
        }
        committed = !!this.db;
        this.pending = {};
        this.fresh = false;
        if (!this.db) for (const name of collections) {
          for (const item of next[name]) this.queue(name, item.id, item);
          for (const item of this.state[name]) if (!next[name].some(x => x.id === item.id)) this.queue(name, item.id, null);
        }
        this.state = next;
        this.persist(true);
        committed = true;
        this.onChange(this.state);
      } catch (error) {
        if (committed) {
          this.onChange(this.state);
          throw Error('Restauro concluído na nuvem; falhou a gravação local. A cópia de recuperação foi preservada. Recarrega com ligação.');
        }
        if (before) { this.state = before.state; this.pending = before.pending; this.fresh = before.fresh; }
        throw error;
      } finally {
        this.restoring = false;
        // A failed restore may have paused an existing local edit queue.
        if (!committed) void this.flush();
      }
    }

    async recoveries() {
      const local = [];
      for (let i = 0; i < this.storage.length; i++) {
        const key = this.storage.key(i);
        if (key?.startsWith(`${this.key}_recovery_`)) local.push({ key, ...JSON.parse(this.storage.getItem(key)) });
      }
      let remote = [], remoteUnavailable = false;
      if (this.db) try {
        remote = (await this.db.collection('recoveries').get({ source: 'server' })).docs.map(doc => ({ ...doc.data(), recoveryId: doc.id }));
      } catch (error) { remoteUnavailable = true; }
      return { local, remote, remoteUnavailable };
    }
  }
  globalThis.FeriasData = { Store, normalize };
})();
