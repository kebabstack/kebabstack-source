/// kebab-stack vault — the pantry.
///
/// One small canister that holds no business data and does one thing: keep
/// snapshots of the hub and of every connected app, restore them, and run
/// schedules. It works because it is a CO-CONTROLLER of each protected
/// canister (only controllers may snapshot); that also makes it the most
/// privileged canister of the suite — hence: owner-only, every action
/// journaled, nothing else in here.
///
/// Why not inside the hub: a canister cannot stop itself and carry on, and a
/// hub→vault→stop(hub) chain would deadlock (stopping waits for the open
/// call). The browser therefore talks to the vault directly; the vault asks
/// the hub "is this principal an owner?" BEFORE it touches anything.
///
/// Stable state is append-only (never remove or rename a top-level var).

import Map "mo:core/Map";
import Array "mo:core/Array";
import List "mo:core/List";
import Iter "mo:core/Iter";
import Text "mo:core/Text";
import Principal "mo:core/Principal";
import Time "mo:core/Time";
import Int "mo:core/Int";
import Nat "mo:core/Nat";
import Nat8 "mo:core/Nat8";
import Nat32 "mo:core/Nat32";
import Nat64 "mo:core/Nat64";
import Blob "mo:core/Blob";
import Char "mo:core/Char";
import Timer "mo:core/Timer";

persistent actor Vault {
  // =====================================================================
  // config
  // =====================================================================
  var hubId : Text = ""; // hub BACKEND — answers vaultAuth(principal)
  var setBy : ?Principal = null;
  var kitchenId : Text = ""; // the installer canister — may add targets, seed a schedule where none exists, take pre-upgrade snapshots; nothing else
  func isKitchen(p : Principal) : Bool = kitchenId != "" and Principal.toText(p) == kitchenId;

  let H : Int = 3_600_000_000_000;

  // =====================================================================
  // management canister (subset of ic.did we need; Candid record subtyping
  // lets us declare only the fields we read)
  // =====================================================================
  type CanisterId = Principal;
  type Snapshot = { id : Blob; taken_at_timestamp : Nat64; total_size : Nat64 };
  type StatusResult = {
    status : { #running; #stopping; #stopped };
    module_hash : ?Blob;
    memory_size : Nat;
    memory_metrics : { snapshots_size : Nat; wasm_memory_size : Nat; stable_memory_size : Nat };
    settings : { controllers : [Principal] };
    cycles : Nat;
  };
  type InfoResult = { controllers : [Principal]; module_hash : ?Blob; total_num_changes : Nat64 };
  type IC = actor {
    canister_status : shared { canister_id : CanisterId } -> async StatusResult;
    canister_info : shared { canister_id : CanisterId; num_requested_changes : ?Nat64 } -> async InfoResult;
    stop_canister : shared { canister_id : CanisterId } -> async ();
    start_canister : shared { canister_id : CanisterId } -> async ();
    take_canister_snapshot : shared { canister_id : CanisterId; replace_snapshot : ?Blob; uninstall_code : ?Bool; sender_canister_version : ?Nat64 } -> async Snapshot;
    load_canister_snapshot : shared { canister_id : CanisterId; snapshot_id : Blob; sender_canister_version : ?Nat64 } -> async ();
    list_canister_snapshots : shared { canister_id : CanisterId } -> async [Snapshot];
    delete_canister_snapshot : shared { canister_id : CanisterId; snapshot_id : Blob } -> async ();
  };
  transient let ic : IC = actor "aaaaa-aa";

  // =====================================================================
  // state
  // =====================================================================
  public type Target = { canisterId : Text; name : Text; kind : Text; addedAt : Int }; // kind: hub-backend | hub-frontend | app-backend | app-frontend | custom
  let targets : Map.Map<Text, Target> = Map.empty<Text, Target>();

  public type Schedule = { enabled : Bool; everyHours : Nat; atHourUtc : Nat; keep : Nat; lastRun : Int; lastResult : Text }; // everyHours 0 = daily at atHourUtc
  let schedules : Map.Map<Text, Schedule> = Map.empty<Text, Schedule>();

  public type Note = { note : Text; by : Text; at : Int; kind : Text }; // kind: manual | scheduled | pre-restore
  let snapNotes : Map.Map<Text, Note> = Map.empty<Text, Note>(); // "<cid>:<hex snapshot id>"

  type LogRow = { at : Int; who : Text; what : Text; ok : Bool };
  let journal : Map.Map<Nat, LogRow> = Map.empty<Nat, LogRow>();
  var nextLog : Nat = 1;

  let busy : Map.Map<Text, Int> = Map.empty<Text, Int>(); // cid -> since (re-entrancy guard per target)
  let ownerCache : Map.Map<Principal, Int> = Map.empty<Principal, Int>(); // principal -> verified at

  // =====================================================================
  // helpers
  // =====================================================================
  func now() : Int = Time.now();
  func norm(t : Text) : Text = Text.trim(t, #char ' ');
  func log(who : Text, what : Text, ok : Bool) {
    Map.add(journal, Nat.compare, nextLog, { at = now(); who; what; ok });
    nextLog += 1;
    if (nextLog > 1000) ignore Map.delete(journal, Nat.compare, nextLog - 1000 : Nat);
  };
  func hex(b : Blob) : Text {
    func d(n : Nat) : Text = Char.toText(Nat32.toChar(Nat.toNat32(if (n < 10) 48 + n else 87 + n)));
    var t = "";
    for (x in Blob.toArray(b).vals()) { let n = Nat8.toNat(x); t #= d(n / 16) # d(n % 16) };
    t;
  };
  func unhex(t : Text) : ?Blob {
    let cs = Iter.toArray(t.chars());
    if (cs.size() == 0 or cs.size() % 2 != 0) return null;
    let out = List.empty<Nat8>();
    var i = 0;
    func v(c : Char) : ?Nat { if (c >= '0' and c <= '9') ?(Nat32.toNat(Char.toNat32(c)) - 48) else if (c >= 'a' and c <= 'f') ?(Nat32.toNat(Char.toNat32(c)) - 87) else if (c >= 'A' and c <= 'F') ?(Nat32.toNat(Char.toNat32(c)) - 55) else null };
    while (i + 1 < cs.size()) {
      switch (v(cs[i]), v(cs[i + 1])) { case (?a, ?b) List.add(out, Nat.toNat8(a * 16 + b)); case _ return null };
      i += 2;
    };
    ?Array.toBlob(List.toArray(out));
  };
  func principalSafe(t : Text) : ?Principal {
    let x = Text.toLower(norm(t));
    if (x.size() < 5 or x.size() > 63) return null;
    var run = 0; var groups = 0;
    for (c in x.chars()) {
      if (c == '-') { if (run == 0 or run > 5) return null; run := 0; groups += 1 }
      else if ((c >= 'a' and c <= 'z') or (c >= '2' and c <= '7')) run += 1
      else return null;
    };
    if (run == 0 or run > 5 or groups == 0) return null;
    ?Principal.fromText(x);
  };
  func lock(cid : Text) : Bool {
    switch (Map.get(busy, Text.compare, cid)) { case (?since) { if (now() - since < 40 * 60_000_000_000) return false }; case null {} }; // stale locks expire after 40 min (> worst-case stop/act/start)
    Map.add(busy, Text.compare, cid, now());
    true;
  };
  func unlock(cid : Text) { ignore Map.delete(busy, Text.compare, cid) };

  // =====================================================================
  // auth: controller of the vault, or a hub owner (asked at the hub, cached below 60 seconds)
  // =====================================================================
  type HubAuth = actor { vaultAuth : shared query (Text) -> async Bool };
  // `fresh`: state-changing calls always re-ask the hub (a demoted owner must lose the vault at once); reads may use the below-60-second cache
  func isOwner(caller : Principal, fresh : Bool) : async Bool {
    if (Principal.isAnonymous(caller)) return false;
    if (Principal.isController(caller)) return true;
    if (not fresh) { switch (Map.get(ownerCache, Principal.compare, caller)) { case (?t) { if (now() >= t and now() - t < 60_000_000_000) return true }; case null {} } };
    if (hubId == "") return false;
    let expectedHub = hubId; let requestedAt = now();
    let hub : HubAuth = actor (expectedHub);
    let granted = try { await (with timeout = 30) hub.vaultAuth(Principal.toText(caller)) } catch (_) { false };
    let ok = granted and hubId == expectedHub and now() - requestedAt < 60_000_000_000;
    if (ok) Map.add(ownerCache, Principal.compare, caller, requestedAt) else ignore ownerCache.delete(caller);
    ok;
  };

  // =====================================================================
  // config API
  // =====================================================================
  public shared ({ caller }) func setHub(id : Text) : async { ok : Bool; detail : Text } {
    if (not Principal.isController(caller)) return { ok = false; detail = "controller only (CLI)" };
    hubId := switch (principalSafe(id)) { case null return { ok = false; detail = "not a canister id" }; case (?p) Principal.toText(p) };
    ownerCache.clear();
    setBy := ?caller;
    log(Principal.toText(caller), "hub set to " # hubId, true);
    { ok = true; detail = "" };
  };
  public shared ({ caller }) func setKitchen(id : Text) : async { ok : Bool; detail : Text } {
    if (not Principal.isController(caller)) return { ok = false; detail = "controller only (CLI)" };
    kitchenId := if (norm(id) == "") "" else (switch (principalSafe(id)) { case null return { ok = false; detail = "not a canister id" }; case (?p) Principal.toText(p) });
    log(Principal.toText(caller), (if (kitchenId == "") "kitchen unset" else "kitchen set to " # kitchenId), true);
    { ok = true; detail = "" };
  };
  transient let BUILD_VERSION : Text = "0.2.2";
  public shared query func info() : async { hubId : Text; targets : Nat; version : Text; me : Text; kitchenId : Text } {
    { hubId; targets = Map.size(targets); version = BUILD_VERSION; me = Principal.toText(Principal.fromActor(Vault)); kitchenId };
  };

  // =====================================================================
  // targets
  // =====================================================================
  public shared ({ caller }) func addTarget(canisterId : Text, name : Text, kind : Text) : async { ok : Bool; detail : Text } {
    if (not isKitchen(caller) and not (await isOwner(caller, true))) return { ok = false; detail = "owners only" };
    let cid = switch (principalSafe(canisterId)) { case (?p) Principal.toText(p); case null return { ok = false; detail = "not a canister id" } };
    if (cid == Principal.toText(Principal.fromActor(Vault))) return { ok = false; detail = "the vault cannot protect itself — snapshot it from the CLI" };
    let k = if (kind == "") "custom" else kind;
    Map.add(targets, Text.compare, cid, { canisterId = cid; name = norm(name); kind = k; addedAt = (switch (Map.get(targets, Text.compare, cid)) { case (?t) t.addedAt; case null now() }) });
    log(Principal.toText(caller), "target added " # norm(name) # " (" # cid # ", " # k # ")", true);
    { ok = true; detail = "" };
  };
  public shared ({ caller }) func removeTarget(canisterId : Text) : async { ok : Bool; detail : Text } {
    if (not (await isOwner(caller, true))) return { ok = false; detail = "owners only" };
    let cid = switch (principalSafe(canisterId)) { case (?p) Principal.toText(p); case null return { ok = false; detail = "not a canister id" } };
    ignore Map.delete(targets, Text.compare, cid);
    ignore Map.delete(schedules, Text.compare, cid);
    log(Principal.toText(caller), "target removed " # cid, true);
    { ok = true; detail = "" };
  };
  public shared ({ caller }) func listTargets() : async [Target] { if (not (await isOwner(caller, false))) return []; Iter.toArray(Map.values(targets)) };

  // =====================================================================
  // status of one canister — controllers, state, snapshots (with notes)
  // =====================================================================
  public type SnapView = { id : Text; takenAt : Int; size : Nat; note : Text; by : Text; kind : Text };
  public type Status = {
    canisterId : Text; protected : Bool; state : Text; moduleHash : Text; memorySize : Nat; snapshotsSize : Nat;
    snapshots : [SnapView]; controllers : [Text]; schedule : ?Schedule; busy : Bool; detail : Text;
  };
  public shared ({ caller }) func status(canisterId : Text) : async Status {
    let empty : Status = { canisterId = norm(canisterId); protected = false; state = ""; moduleHash = ""; memorySize = 0; snapshotsSize = 0; snapshots = []; controllers = []; schedule = null; busy = false; detail = "" };
    if (not (await isOwner(caller, false))) return { empty with detail = "owners only" };
    let p = switch (principalSafe(canisterId)) { case (?p) p; case null return { empty with detail = "not a canister id" } };
    let cid = Principal.toText(p);
    let me = Principal.fromActor(Vault);
    // controllers: canister_info works for any caller canister
    let info = try { ?(await (with timeout = 30) ic.canister_info({ canister_id = p; num_requested_changes = null })) } catch (_) { null };
    let ctrls = switch (info) { case (?i) i.controllers; case null [] };
    let protected = Array.find<Principal>(ctrls, func(c) = c == me) != null;
    let sched = Map.get(schedules, Text.compare, cid);
    let isBusy = Map.containsKey(busy, Text.compare, cid);
    if (not protected) return { empty with canisterId = cid; controllers = Array.map<Principal, Text>(ctrls, Principal.toText); schedule = sched; busy = isBusy; detail = (switch (info) { case null "could not read canister info — wrong id or not reachable"; case (?_) "not protected yet: add the vault as controller" }) };
    let st = try { ?(await (with timeout = 30) ic.canister_status({ canister_id = p })) } catch (_) { null };
    let snaps = try { await (with timeout = 30) ic.list_canister_snapshots({ canister_id = p }) } catch (_) { [] };
    let views = Array.map<Snapshot, SnapView>(snaps, func(s) {
      let key = cid # ":" # hex(s.id);
      let n = Map.get(snapNotes, Text.compare, key);
      { id = hex(s.id); takenAt = Nat64.toNat(s.taken_at_timestamp); size = Nat64.toNat(s.total_size); note = (switch (n) { case (?x) x.note; case null "" }); by = (switch (n) { case (?x) x.by; case null "" }); kind = (switch (n) { case (?x) x.kind; case null "" }) };
    });
    switch (st) {
      case (?s) ({ canisterId = cid; protected = true; state = (switch (s.status) { case (#running) "running"; case (#stopping) "stopping"; case (#stopped) "stopped" }); moduleHash = (switch (s.module_hash) { case (?h) hex(h); case null "" }); memorySize = s.memory_size; snapshotsSize = s.memory_metrics.snapshots_size; snapshots = views; controllers = Array.map<Principal, Text>(ctrls, Principal.toText); schedule = sched; busy = isBusy; detail = "" });
      case null ({ empty with canisterId = cid; protected = true; snapshots = views; controllers = Array.map<Principal, Text>(ctrls, Principal.toText); schedule = sched; busy = isBusy; detail = "status unavailable" });
    };
  };

  // =====================================================================
  // snapshot · restore · delete — stop / act / start, start ALWAYS retried
  // =====================================================================
  func startAgain(p : Principal) : async Bool {
    var started = false;
    var tries = 0;
    while (not started and tries < 3) {
      tries += 1;
      try { await (with timeout = 300) ic.start_canister({ canister_id = p }); started := true } catch (_) {};
    };
    started;
  };
  func withStopped(p : Principal, act : () -> async Text) : async { ok : Bool; detail : Text } {
    // 0 · was it running? A canister someone stopped on purpose stays stopped afterwards.
    let before = try { ?(await (with timeout = 30) ic.canister_status({ canister_id = p })) } catch (_) { null };
    let wasRunning = switch (before) { case (?s) (switch (s.status) { case (#stopped) false; case _ true }); case null return { ok = false; detail = "cannot read the canister's status — nothing changed" } };
    // 1 · stop (waits for the canister's open calls, bounded)
    if (wasRunning) {
      try { await (with timeout = 300) ic.stop_canister({ canister_id = p }) } catch (_) {
        // the stop may still be pending at the platform: start_canister cancels it, so the canister is never left stopping
        let restarted = await startAgain(p);
        return { ok = false; detail = if (restarted) "stop timed out; start confirmed, snapshot/restore not attempted" else "stop timed out and restart could not be confirmed — check canister status and start it from the CLI" };
      };
    };
    // 2 · act
    var result : { ok : Bool; detail : Text } = { ok = false; detail = "" };
    try { let d = await act(); result := { ok = true; detail = d } } catch (_) { result := { ok = false; detail = "operation failed" } };
    // 3 · start — a canister must never be left stopped by us
    if (wasRunning and not (await startAgain(p))) return { ok = false; detail = result.detail # " · WARNING: canister is still stopped — start it from the CLI: icp canister start " # Principal.toText(p) # " -n ic" };
    result;
  };

  // oldest snapshot, never the one in `avoid` (a pre-restore snapshot must not evict its own restore target)
  func oldestSnapshot(snaps : [Snapshot], avoid : ?Blob) : ?Snapshot {
    var best : ?Snapshot = null;
    for (s in snaps.vals()) {
      if (?s.id == avoid) {} else { switch (best) { case null best := ?s; case (?b) { if (s.taken_at_timestamp < b.taken_at_timestamp) best := ?s } } };
    };
    best;
  };

  func hasId(snaps : [Snapshot], id : Blob) : Bool = Array.find<Snapshot>(snaps, func(s) = s.id == id) != null;
  func listSnaps(p : Principal) : async ?[Snapshot] { try { ?(await (with timeout = 30) ic.list_canister_snapshots({ canister_id = p })) } catch (_) { null } };

  // `locked`: the caller already holds the per-canister lock (restore keeps it across safety snapshot + load)
  func takeSnapshot(p : Principal, keep : Nat, note : Text, by : Text, kind : Text, avoid : ?Blob, locked : Bool) : async { ok : Bool; detail : Text; id : Text } {
    let cid = Principal.toText(p);
    if (not locked and not lock(cid)) return { ok = false; detail = "another operation is running on this canister"; id = "" };
    func done(r : { ok : Bool; detail : Text; id : Text }) : { ok : Bool; detail : Text; id : Text } { if (not locked) unlock(cid); r };
    var snaps = switch (await listSnaps(p)) { case (?x) x; case null return done({ ok = false; detail = "cannot list snapshots — is the vault a controller?"; id = "" }) };
    // retention: trim to `keep` (platform max 10) — delete extras, replace the last oldest atomically with the take
    let cap = Nat.min(Nat.max(keep, 1), 10);
    var trimmed = 0;
    while (snaps.size() > cap) {
      switch (oldestSnapshot(snaps, avoid)) {
        case (?o) {
          try { await (with timeout = 60) ic.delete_canister_snapshot({ canister_id = p; snapshot_id = o.id }) } catch (_) { return done({ ok = false; detail = "could not delete an old snapshot — retention aborted; check snapshots before retrying"; id = "" }) };
          ignore Map.delete(snapNotes, Text.compare, cid # ":" # hex(o.id));
          snaps := Array.filter<Snapshot>(snaps, func(s) = s.id != o.id); trimmed += 1;
        };
        case null return done({ ok = false; detail = "all slots are taken and none may be replaced — delete one first"; id = "" });
      };
    };
    let replace : ?Blob = if (snaps.size() >= cap) { switch (oldestSnapshot(snaps, avoid)) { case (?o) ?o.id; case null return done({ ok = false; detail = "all slots are taken and none may be replaced — delete one first"; id = "" }) } } else null;
    var newId = "";
    let r0 = await withStopped(p, func() : async Text {
      let s = await (with timeout = 300) ic.take_canister_snapshot({ canister_id = p; replace_snapshot = replace; uninstall_code = null; sender_canister_version = null });
      newId := hex(s.id);
      "snapshot " # newId # " (" # Nat.toText(Nat64.toNat(s.total_size) / 1024) # " KB)";
    });
    // a timed-out take may still have happened: look for a snapshot we did not know before
    var r = r0;
    if (not r0.ok and newId == "") {
      switch (await listSnaps(p)) {
        case (?after) { for (s in after.vals()) if (not hasId(snaps, s.id)) { newId := hex(s.id); r := { ok = false; detail = "snapshot " # newId # " exists, but the operation did not finish cleanly: " # r0.detail # " — check canister status before retrying" } } };
        case null {};
      };
    };
    if (newId != "") {
      switch (replace) { case (?old) ignore Map.delete(snapNotes, Text.compare, cid # ":" # hex(old)); case null {} };
      Map.add(snapNotes, Text.compare, cid # ":" # newId, { note = norm(note); by; at = now(); kind });
    };
    let extra = (if (replace != null) " · replaced the oldest (keep " # Nat.toText(cap) # ")" else "") # (if (trimmed > 0) " · trimmed " # Nat.toText(trimmed) else "");
    log(by, "snapshot " # (if (kind == "scheduled") "(scheduled) " else "") # cid # " → " # r.detail # extra, r.ok);
    done({ ok = r.ok; detail = r.detail # (if (r.ok) extra else ""); id = newId });
  };

  public shared ({ caller }) func snapshot(canisterId : Text, note : Text) : async { ok : Bool; detail : Text; id : Text } {
    if (not isKitchen(caller) and not (await isOwner(caller, true))) return { ok = false; detail = "owners only"; id = "" };
    let p = switch (principalSafe(canisterId)) { case (?p) p; case null return { ok = false; detail = "not a canister id"; id = "" } };
    let keep = switch (Map.get(schedules, Text.compare, Principal.toText(p))) { case (?s) s.keep; case null 5 };
    await takeSnapshot(p, keep, note, Principal.toText(caller), "manual", null, false);
  };

  public shared ({ caller }) func restore(canisterId : Text, snapshotId : Text, safetySnapshot : Bool) : async { ok : Bool; detail : Text } {
    if (not (await isOwner(caller, true))) return { ok = false; detail = "owners only" };
    let p = switch (principalSafe(canisterId)) { case (?p) p; case null return { ok = false; detail = "not a canister id" } };
    let sid = switch (unhex(snapshotId)) { case (?b) b; case null return { ok = false; detail = "bad snapshot id" } };
    let cid = Principal.toText(p);
    if (not lock(cid)) return { ok = false; detail = "another operation is running on this canister" };
    // the target must exist BEFORE anything is evicted
    switch (await listSnaps(p)) {
      case (?snaps) { if (not hasId(snaps, sid)) { unlock(cid); return { ok = false; detail = "no such snapshot on this canister" } } };
      case null { unlock(cid); return { ok = false; detail = "cannot list snapshots — is the vault a controller?" } };
    };
    // optional: keep a way back — snapshot the current state first (never evicting the target)
    if (safetySnapshot) {
      let s = await takeSnapshot(p, 10, "before restore to " # snapshotId, Principal.toText(caller), "pre-restore", ?sid, true);
      if (not s.ok) { unlock(cid); return { ok = false; detail = "safety snapshot failed, restore aborted: " # s.detail } };
    };
    let r0 = await withStopped(p, func() : async Text {
      await (with timeout = 300) ic.load_canister_snapshot({ canister_id = p; snapshot_id = sid; sender_canister_version = null });
      "restored to " # snapshotId;
    });
    unlock(cid);
    let r : { ok : Bool; detail : Text } = if (r0.ok or Text.contains(r0.detail, #text "nothing changed") or Text.contains(r0.detail, #text "status")) r0 else ({ ok = false; detail = r0.detail # " · the platform gave no reply in time — the restore MAY have happened; compare the canister's state before trusting either" });
    log(Principal.toText(caller), "restore " # cid # " → " # r.detail, r.ok);
    r;
  };

  public shared ({ caller }) func deleteSnapshot(canisterId : Text, snapshotId : Text) : async { ok : Bool; detail : Text } {
    if (not (await isOwner(caller, true))) return { ok = false; detail = "owners only" };
    let p = switch (principalSafe(canisterId)) { case (?p) p; case null return { ok = false; detail = "not a canister id" } };
    let sid = switch (unhex(snapshotId)) { case (?b) b; case null return { ok = false; detail = "bad snapshot id" } };
    let cid = Principal.toText(p);
    if (not lock(cid)) return { ok = false; detail = "another operation is running on this canister" };
    var ok = true;
    try { await (with timeout = 60) ic.delete_canister_snapshot({ canister_id = p; snapshot_id = sid }) } catch (_) {
      // slow reply? believe the platform, not the error
      ok := switch (await listSnaps(p)) { case (?after) not hasId(after, sid); case null false };
    };
    unlock(cid);
    if (not ok) return { ok = false; detail = "delete failed" };
    ignore Map.delete(snapNotes, Text.compare, cid # ":" # hex(sid));
    log(Principal.toText(caller), "deleted snapshot " # hex(sid) # " of " # cid, true);
    { ok = true; detail = "" };
  };

  // =====================================================================
  // schedules — checked every 10 minutes
  // =====================================================================
  public shared ({ caller }) func setSchedule(canisterId : Text, s : { enabled : Bool; everyHours : Nat; atHourUtc : Nat; keep : Nat }) : async { ok : Bool; detail : Text } {
    let cid = switch (principalSafe(canisterId)) { case (?p) Principal.toText(p); case null return { ok = false; detail = "not a canister id" } };
    if (isKitchen(caller)) {
      // the kitchen seeds a default right after it registers a target — never over an owner's choice
      if (Map.containsKey(schedules, Text.compare, cid)) return { ok = false; detail = "a schedule exists; only owners change it" };
      if (not Map.containsKey(targets, Text.compare, cid)) return { ok = false; detail = "not a protected service" };
    } else if (not (await isOwner(caller, true))) return { ok = false; detail = "owners only" };
    if (s.atHourUtc > 23) return { ok = false; detail = "hour must be 0-23 (UTC)" };
    if (s.everyHours > 24 * 30) return { ok = false; detail = "interval too large (max 720 h)" };
    if (s.keep < 1 or s.keep > 10) return { ok = false; detail = "keep 1-10 snapshots (platform limit is 10)" };
    let prev = Map.get(schedules, Text.compare, cid);
    Map.add(schedules, Text.compare, cid, { enabled = s.enabled; everyHours = s.everyHours; atHourUtc = s.atHourUtc; keep = s.keep; lastRun = (switch (prev) { case (?x) x.lastRun; case null 0 }); lastResult = (switch (prev) { case (?x) x.lastResult; case null "" }) });
    log(Principal.toText(caller), "schedule for " # cid # ": " # (if (s.enabled) (if (s.everyHours > 0) "every " # Nat.toText(s.everyHours) # " h" else "daily " # Nat.toText(s.atHourUtc) # ":00 UTC") # ", keep " # Nat.toText(s.keep) else "off"), true);
    { ok = true; detail = "" };
  };
  public shared ({ caller }) func listSchedules() : async [(Text, Schedule)] { if (not (await isOwner(caller, false))) return []; Iter.toArray(Map.entries(schedules)) };

  func due(s : Schedule, t : Int) : Bool {
    if (not s.enabled) return false;
    if (s.everyHours > 0) return t - s.lastRun >= s.everyHours * H;
    // daily at hour: the current UTC hour matches and the last run is older than 20 h
    let hourNow = ((t / H) % 24);
    hourNow == s.atHourUtc and t - s.lastRun > 20 * H;
  };
  var schedBusy : Int = 0; // 0 = idle, else started-at (self-expiring guard against overlapping ticks)
  func runSchedules() : async () {
    if (schedBusy != 0 and now() - schedBusy < 60 * 60_000_000_000) return;
    schedBusy := now();
    let t = now();
    let dueIds = List.empty<Text>();
    for ((cid, s) in Map.entries(schedules)) if (due(s, t)) List.add(dueIds, cid);
    for (cid in List.toArray(dueIds).vals()) {
      switch (principalSafe(cid), Map.get(schedules, Text.compare, cid)) {
        case (?p, ?s) {
          // claim the run first, so a second tick never takes the same snapshot twice
          Map.add(schedules, Text.compare, cid, { s with lastRun = now(); lastResult = "running…" });
          let r = await takeSnapshot(p, s.keep, "scheduled", "vault", "scheduled", null, false);
          // re-read: the schedule may have been edited or removed meanwhile — never resurrect it
          switch (Map.get(schedules, Text.compare, cid)) {
            case (?cur) Map.add(schedules, Text.compare, cid, { cur with lastResult = (if (r.ok) "ok · " # r.detail else "FAILED · " # r.detail) });
            case null {};
          };
        };
        case _ {};
      };
    };
    schedBusy := 0;
  };
  transient let _tick = Timer.recurringTimer<system>(#seconds 600, runSchedules);

  // =====================================================================
  // journal
  // =====================================================================
  public shared ({ caller }) func listJournal() : async [LogRow] {
    if (not (await isOwner(caller, false))) return [];
    let out = List.empty<LogRow>();
    for ((_, r) in Map.reverseEntries(journal)) { if (List.size(out) < 200) List.add(out, r) };
    List.toArray(out);
  };
};
