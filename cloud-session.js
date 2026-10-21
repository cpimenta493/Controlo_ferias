/* Shared-password authentication gates every Firestore connection. */
(() => {
  'use strict';
  class Session {
    constructor({ auth, db, store, email, uid, persistence, onStatus, onReady, onDisconnect }) {
      Object.assign(this, { auth, db, store, email, uid, persistence, onStatus, onReady, onDisconnect });
      this.authorized = false;
      this.generation = 0;
      this.connecting = null;
    }

    configured() {
      return !!(this.email && this.uid && !this.uid.startsWith('CONFIGURAR_'));
    }

    disconnect() {
      this.generation++;
      this.store.db = null;
      this.onDisconnect();
    }

    async start() {
      if (!this.configured()) { this.onStatus('setup'); return; }
      try {
        await this.auth.setPersistence(this.persistence);
        this.unsubscribe = this.auth.onAuthStateChanged(user => {
          this.disconnect();
          this.authorized = !!user && user.uid === this.uid;
          if (!this.authorized) { this.onStatus(user ? 'denied' : 'locked'); return; }
          void this.connect();
        }, () => { this.disconnect(); this.authorized = false; this.onStatus('error'); });
      } catch (error) { this.onStatus('error'); }
    }

    async connect() {
      if (!this.authorized || this.auth.currentUser?.uid !== this.uid) return;
      const generation = this.generation;
      if (this.connecting?.generation === generation) return this.connecting.promise;
      const promise = (async () => {
        this.onStatus('connecting');
        try {
          const names = ['trips', 'expenses', 'plans'];
          const snapshots = await Promise.all(names.map(name => this.db.collection(name).get({ source: 'server' })));
          if (generation !== this.generation || this.auth.currentUser?.uid !== this.uid) return;
          const remote = Object.fromEntries(names.map((name, index) => [name,
            snapshots[index].docs.map(doc => ({ ...doc.data(), id: doc.id }))]));
          // Protect both sides before applying snapshots or sending the local outbox.
          this.store.backup('before-shared-sync', {
            local: { ...this.store.state, _sync: { pending: this.store.pending } }, remote
          });
          this.store.db = this.db;
          await this.onReady(snapshots);
          if (generation !== this.generation) return;
          await this.store.flush();
        } catch (error) {
          if (generation !== this.generation) return;
          this.store.db = null;
          this.onDisconnect();
          this.onStatus(error.code === 'permission-denied' ? 'denied' : 'offline');
        }
      })();
      this.connecting = { generation, promise };
      try { await promise; }
      finally { if (this.connecting?.promise === promise) this.connecting = null; }
    }

    async signIn(password) {
      if (!this.configured()) throw Error('É preciso concluir a configuração do acesso partilhado no Firebase.');
      await this.auth.signInWithEmailAndPassword(this.email, password);
    }

    async signOut() {
      this.disconnect();
      this.authorized = false;
      this.onStatus('locked');
      await this.auth.signOut();
    }
  }
  globalThis.FeriasCloud = { Session };
})();
