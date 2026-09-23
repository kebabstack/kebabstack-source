import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,chmodSync} from 'node:fs';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
export class Store {
  constructor(directory,{maxPending=100000}={}) {
    mkdirSync(directory,{recursive:true,mode:0o700});chmodSync(directory,0o700);
    this.db=new DatabaseSync(join(directory,'crumbs.sqlite'));this.maxPending=maxPending;
    this.db.exec(`PRAGMA secure_delete=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS events(seq INTEGER PRIMARY KEY AUTOINCREMENT,site TEXT NOT NULL,id TEXT NOT NULL,payload TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'pending',created INTEGER NOT NULL,error TEXT NOT NULL DEFAULT '',UNIQUE(site,id));
      CREATE INDEX IF NOT EXISTS pending ON events(state,created);
      CREATE TABLE IF NOT EXISTS salts(day INTEGER PRIMARY KEY,secret BLOB NOT NULL);`);
    chmodSync(join(directory,'crumbs.sqlite'),0o600);
  }
  salt(now) {
    const day=Math.floor(now/86400);
    this.db.prepare('INSERT OR IGNORE INTO salts VALUES (?,?)').run(day,randomBytes(32));
    const removed=this.db.prepare('DELETE FROM salts WHERE day != ?').run(day);
    if(removed.changes)this.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    return this.db.prepare('SELECT secret FROM salts WHERE day=?').get(day).secret;
  }
  get(site,id){return this.db.prepare('SELECT payload,state FROM events WHERE site=? AND id=?').get(site,id);}
  put(event) {
    const old=this.get(event.site,event.id);if(old)return old.state;
    if(this.count('pending')>=this.maxPending)throw Object.assign(new Error('Collector queue is full'),{status:503});
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const r=this.db.prepare('INSERT INTO events(site,id,payload,created) VALUES (?,?,?,?)').run(event.site,event.id,'',event.at);
      event.order=Number(r.lastInsertRowid);
      this.db.prepare('UPDATE events SET payload=? WHERE seq=?').run(JSON.stringify(event),r.lastInsertRowid);
      this.db.exec('COMMIT');
    } catch(e) {this.db.exec('ROLLBACK');throw e;}
    return 'pending';
  }
  count(state){return this.db.prepare('SELECT COUNT(*) AS n FROM events WHERE state=?').get(state).n;}
  oldestPending(){return this.db.prepare("SELECT MIN(created) AS at FROM events WHERE state='pending'").get().at??null;}
  pending(limit=50){return this.db.prepare("SELECT payload FROM events WHERE state='pending' ORDER BY seq LIMIT ?").all(limit).map(x=>JSON.parse(x.payload));}
  mark(events,state,error=''){const q=this.db.prepare('UPDATE events SET state=?,error=? WHERE site=? AND id=?');this.db.exec('BEGIN IMMEDIATE');try{for(const e of events)q.run(state,error,e.site,e.id);this.db.exec('COMMIT');}catch(e){this.db.exec('ROLLBACK');throw e;}}
  maintain(now){this.salt(now);this.db.prepare("DELETE FROM events WHERE state!='pending' AND created < ?").run(now-86400);}
  close(){this.db.close();}
}
export function candidEvent(e){return {...e,at:BigInt(e.at),order:BigInt(e.order),revenueMinor:BigInt(e.revenueMinor),engagementMs:BigInt(e.engagementMs),scrollDepth:BigInt(e.scrollDepth)};}
export async function flush(store,actor) {
  const batch=store.pending();if(!batch.length)return;
  const result=await actor.ingestBatch(batch.map(candidEvent));
  if('ok'in result){store.mark(batch,'accepted');return;}
  const type=Object.keys(result.err)[0];
  if(type==='invalid'||type==='conflict'||type==='notFound') {
    // A bad record must not prevent valid records in the same batch from reaching the backend.
    for(const event of batch){const r=await actor.ingestBatch([candidEvent(event)]);if('ok'in r)store.mark([event],'accepted');else if(['invalid','conflict','notFound'].includes(Object.keys(r.err)[0]))store.mark([event],'rejected',JSON.stringify(r.err));else throw new Error('Backend delivery blocked: '+Object.keys(r.err)[0]);}
  }
  // Authorization, capacity, and transport failures remain pending for an operator/retry.
  if(!['invalid','conflict','notFound'].includes(type))throw new Error('Backend delivery blocked: '+type);
}
