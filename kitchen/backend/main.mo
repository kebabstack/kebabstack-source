/// kebab-stack kitchen — the installer and updater.
///
/// One canister that cooks the others. It reads RECIPES (wasm modules +
/// frontend files + a small manifest) from its own asset canister — the
/// pantry — and, on an owner's click in the hub, creates the app's two
/// canisters, installs the code, copies the frontend (patching placeholders
/// such as the backend id and the hub URL), tells the app where the hub is,
/// registers it in the hub (lanes from the app's manifest, a bound menu
/// entry), and hands both canisters to the vault for backups. Updates run the
/// same way with a vault snapshot first. Nothing here needs a terminal.
///
/// Trust: the kitchen is a CONTROLLER of everything it installs, so it is the
/// second most privileged canister of the suite after the vault. Every action
/// is owner-only (the hub answers kitchenAuth) and journaled.
///
/// Verified on a cloud engine 2026-09-03: create_canister / install_code /
/// update_settings / stop / delete work from a canister without cycles.
/// Stable state is append-only (never remove or rename a top-level var).

import Map "mo:core/Map";
import Array "mo:core/Array";
import List "mo:core/List";
import Iter "mo:core/Iter";
import Text "mo:core/Text";
import Principal "mo:core/Principal";
import Time "mo:core/Time";
import Nat "mo:core/Nat";
import Nat8 "mo:core/Nat8";
import Nat32 "mo:core/Nat32";
import Nat64 "mo:core/Nat64";
import Blob "mo:core/Blob";
import Char "mo:core/Char";
import Error "mo:core/Error";
import Sha256 "mo:sha2/Sha256";
import Timer "mo:core/Timer";
import Runtime "mo:core/Runtime";
import IC0 "mo:core/InternetComputer";
import Json "mo:json";
import Release "lib/Release";

persistent actor Kitchen {
  // =====================================================================
  // config
  // =====================================================================
  var hubId : Text = ""; // hub BACKEND — answers kitchenAuth / kitchenConfig / kitchenConnect
  var pantryOverride : Text = ""; // normally read from PUBLIC_CANISTER_ID:frontend
  let bornAt : Int = Time.now(); // legacy stable field; retained for upgrade compatibility

  // =====================================================================
  // management canister — the subset we use (Candid record subtyping lets us
  // declare only the fields we read)
  // =====================================================================
  type EnvVar = { name : Text; value : Text };
  type Settings = {
    controllers : ?[Principal]; compute_allocation : ?Nat; memory_allocation : ?Nat; freezing_threshold : ?Nat;
    reserved_cycles_limit : ?Nat; log_visibility : ?{ #controllers; #public_ }; wasm_memory_limit : ?Nat;
    environment_variables : ?[EnvVar];
  };
  type InstallMode = { #install; #reinstall; #upgrade : ?{ skip_pre_upgrade : ?Bool; wasm_memory_persistence : ?{ #keep; #replace } } };
  type IC = actor {
    create_canister : shared { settings : ?Settings; sender_canister_version : ?Nat64 } -> async { canister_id : Principal };
    install_code : shared { mode : InstallMode; canister_id : Principal; wasm_module : Blob; arg : Blob; sender_canister_version : ?Nat64 } -> async ();
    upload_chunk : shared { canister_id : Principal; chunk : Blob } -> async { hash : Blob };
    clear_chunk_store : shared { canister_id : Principal } -> async ();
    install_chunked_code : shared { mode : InstallMode; target_canister : Principal; store_canister : ?Principal; chunk_hashes_list : [{ hash : Blob }]; wasm_module_hash : Blob; arg : Blob; sender_canister_version : ?Nat64 } -> async ();
    canister_status : shared { canister_id : Principal } -> async { status : { #running; #stopping; #stopped }; module_hash : ?Blob; settings : { controllers : [Principal] } };
    canister_info : shared { canister_id : Principal; num_requested_changes : ?Nat64 } -> async { controllers : [Principal]; module_hash : ?Blob };
    update_settings : shared { canister_id : Principal; settings : Settings; sender_canister_version : ?Nat64 } -> async ();
    start_canister : shared { canister_id : Principal } -> async ();
    raw_rand : shared () -> async Blob;
    stop_canister : shared { canister_id : Principal } -> async ();
    list_canister_snapshots : shared { canister_id : Principal } -> async [{ id : Blob; taken_at_timestamp : Nat64; total_size : Nat64 }];
    take_canister_snapshot : shared { canister_id : Principal; replace_snapshot : ?Blob; uninstall_code : ?Bool; sender_canister_version : ?Nat64 } -> async { id : Blob };
  };
  transient let ic : IC = actor "aaaaa-aa";

  // asset canister (the pantry, and every app frontend the kitchen installs)
  type Encoding = { content_encoding : Text; sha256 : ?Blob; length : Nat; modified : Int };
  type Assets = actor {
    get : shared query { key : Text; accept_encodings : [Text] } -> async { content : Blob; content_type : Text; content_encoding : Text; sha256 : ?Blob; total_length : Nat };
    get_chunk : shared query { key : Text; content_encoding : Text; index : Nat; sha256 : ?Blob } -> async { content : Blob };
    list : shared query {} -> async [{ key : Text; content_type : Text; encodings : [Encoding] }];
    store : shared { key : Text; content_type : Text; content_encoding : Text; content : Blob; sha256 : ?Blob } -> async ();
    unset_asset_content : shared { key : Text; content_encoding : Text } -> async ();
    delete_asset : shared { key : Text } -> async ();
    grant_permission : shared { to_principal : Principal; permission : { #Commit; #ManagePermissions; #Prepare } } -> async ();
  };
  type HubPing = actor { hub_ping : shared query () -> async Text };

  // hub (the subset the kitchen talks to)
  type HubAPI = actor {
    kitchenAuth : shared query (Text) -> async Bool;
    version : shared query () -> async Text; // hubs from 0.8.0 on; older ones reject the call
    kitchenConfig : shared () -> async { vaultId : Text; frontendId : Text; orgName : Text; hubId : Text };
    kitchenConnect : shared { name : Text; canisterId : Text; note : Text; tile : ?{ name : Text; url : Text; kind : Text } } -> async { ok : Bool; id : Nat; tileId : Nat; detail : Text };
    kitchenSetTileIcon : shared (Nat, Blob, Text) -> async { ok : Bool; detail : Text }; // hubs from 0.10.0 on
    kitchenResyncLanes : shared (Text) -> async { ok : Bool; added : [Text]; detail : Text }; // hubs from 0.14.0 on: grant lanes an updated app newly needs
    kitchenSetTileIconFor : shared (Text, Blob, Text) -> async { ok : Bool; detail : Text }; // hubs from 0.15.0 on: picture by backend canister id (updates, adopted apps)
  };
  type VaultAPI = actor {
    addTarget : shared (Text, Text, Text) -> async { ok : Bool; detail : Text };
    setSchedule : shared (Text, { enabled : Bool; everyHours : Nat; atHourUtc : Nat; keep : Nat }) -> async { ok : Bool; detail : Text };
    snapshot : shared (Text, Text) -> async { ok : Bool; detail : Text; id : Text };
    setHub : shared (Text) -> async { ok : Bool; detail : Text };
    setKitchen : shared (Text) -> async { ok : Bool; detail : Text };
  };
  // Every backend the kitchen hands to the vault starts with a backup a day (03:00 UTC, keep 3).
  // The vault accepts this from the kitchen only while no schedule exists — owners change it under Backups → Schedules.
  let DEFAULT_SCHEDULE = { enabled = true; everyHours = 0; atHourUtc = 3; keep = 3 };
  func seedSchedule(vault : VaultAPI, cid : Text) : async Text {
    try { let r = await vault.setSchedule(cid, DEFAULT_SCHEDULE); if (r.ok) "daily backup 03:00 UTC, keep 3" else "no default schedule (" # r.detail # ")" }
    catch (e) { "no default schedule (" # Error.message(e) # ")" };
  };
  type HubBoot = actor { bootstrapWire : shared { vaultId : Text; kitchenId : Text; claimCode : Text } -> async { ok : Bool; detail : Text } };

  // =====================================================================
  // recipes (parsed from the pantry's recipes/index.json)
  // =====================================================================
  public type Patch = Release.Patch;
  public type RecipeFile = Release.File;
  public type Recipe = {
    id : Text; name : Text; kind : Text; version : Text; description : Text; icon : Text;
    image : Text; // pantry path of a 128 px PNG for the menu ("" = none)
    backendPath : Text; backendSha : Text; backendSize : Nat;
    frontendWasm : Text; frontendSha : Text; frontendDir : Text; files : [RecipeFile]; patches : [Patch];
    releaseId : Text; sourceCommit : Text; notes : Text; format : Nat; requires : [{ id : Text; minVersion : Text }];
    post : [{ method : Text; arg : Text }];
    tileKind : Text; tileNote : Text;
  };
  transient var recipeCache : [Recipe] = [];
  transient var recipeCacheAt : Int = 0;

  // =====================================================================
  // state
  // =====================================================================
  public type Install = { recipeId : Text; version : Text; backend : Text; frontend : Text; installedAt : Int; updatedAt : Int; connectorId : Nat; tileId : Nat; adopted : Bool; state : Text }; // state: installing | ok | failed
  let installed : Map.Map<Text, Install> = Map.empty<Text, Install>();

  public type Step = { name : Text; status : Text; detail : Text }; // todo | run | ok | fail | skip
  public type Job = { id : Nat; kind : Text; recipeId : Text; version : Text; startedAt : Int; endedAt : Int; state : Text; steps : [Step]; by : Text }; // state: running | done | failed
  let jobs : Map.Map<Nat, Job> = Map.empty<Nat, Job>();
  var nextJob : Nat = 1;
  var busyJob : Nat = 0; // one job at a time — cooking is sequential on purpose
  /// a job that trapped mid-way must not block the kitchen forever: after 30 min it is declared failed
  func busy() : Bool {
    if (busyJob == 0) return false;
    if (busyJob == nextJob) return true; // reserved by a job that is still loading its recipe (no record yet) — a second caller must wait
    switch (Map.get(jobs, Nat.compare, busyJob)) {
      case (?j) { if (now() - j.startedAt > 30 * 60_000_000_000) { markInstallFailed(j.recipeId); finishJob(busyJob, false, "gave up after 30 minutes without progress"); false } else true };
      case null { busyJob := 0; false };
    };
  };
  /// an install that never finished must not stay "installing" forever — it becomes "failed" so the owner can remove the leftovers or forget it
  func markInstallFailed(recipeId : Text) {
    switch (Map.get(installed, Text.compare, recipeId)) { case (?i) { if (i.state == "installing") Map.add(installed, Text.compare, recipeId, { i with state = "failed" }) }; case null {} };
  };

  type LogRow = { at : Int; who : Text; what : Text; ok : Bool };
  let journal : Map.Map<Nat, LogRow> = Map.empty<Nat, LogRow>();
  var nextLog : Nat = 1;
  let ownerCache : Map.Map<Principal, Int> = Map.empty<Principal, Int>();

  // =====================================================================
  // helpers
  // =====================================================================
  func now() : Int = Time.now();
  func norm(t : Text) : Text = Text.trim(t, #char ' ');
  func log(who : Text, what : Text, ok : Bool) {
    Map.add(journal, Nat.compare, nextLog, { at = now(); who; what; ok }); nextLog += 1;
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
  func me() : Principal = Principal.fromActor(Kitchen);
  func pantryId<system>() : Text {
    if (pantryOverride != "") return pantryOverride;
    switch (Runtime.envVar<system>("PUBLIC_CANISTER_ID:frontend")) { case (?v) v; case null "" };
  };
  func jStr(j : Json.Json, path : Text) : Text { switch (Json.getAsText(j, path)) { case (#ok(t)) t; case (_) "" } };
  func jNat(j : Json.Json, path : Text) : Nat { switch (Json.getAsNat(j, path)) { case (#ok(n)) n; case (_) 0 } };
  func jArr(j : Json.Json, path : Text) : [Json.Json] { switch (Json.getAsArray(j, path)) { case (#ok(a)) a; case (_) [] } };
  func gatewayUrl(cid : Text) : Text = "https://" # cid # ".icp.net";

  // =====================================================================
  // auth: controller of the kitchen, or a hub owner (asked at the hub)
  // =====================================================================
  type HubAuth = actor { kitchenAuth : shared query (Text) -> async Bool };
  func isOwner(caller : Principal, fresh : Bool) : async Bool {
    if (Principal.isAnonymous(caller)) return false;
    if (Principal.isController(caller)) return true;
    if (not fresh) { switch (Map.get(ownerCache, Principal.compare, caller)) { case (?t) { if (now() >= t and now() - t < 60_000_000_000) return true }; case null {} } };
    if (hubId == "") return false;
    let expectedHub = hubId; let requestedAt = now();
    let hub : HubAuth = actor (expectedHub);
    let granted = try { await (with timeout = 30) hub.kitchenAuth(Principal.toText(caller)) } catch (_) { false };
    let ok = granted and hubId == expectedHub and now() - requestedAt < 60_000_000_000;
    if (ok) Map.add(ownerCache, Principal.compare, caller, requestedAt) else ignore ownerCache.delete(caller);
    ok;
  };

  // =====================================================================
  // config API
  // =====================================================================
  public shared ({ caller }) func setHub(id : Text) : async { ok : Bool; detail : Text } {
    if (not Principal.isController(caller)) return { ok = false; detail = "controller only (CLI)" };
    if (busy()) return { ok = false; detail = "An operation is running; wait before changing its Hub" };
    hubId := if (norm(id) == "") "" else (switch (principalSafe(id)) { case null return { ok = false; detail = "not a canister id" }; case (?p) Principal.toText(p) }); // "" unbinds (rescue)
    ownerCache.clear();
    log(Principal.toText(caller), "hub set to " # hubId, true);
    { ok = true; detail = "" };
  };
  public shared ({ caller }) func setPantry(id : Text) : async { ok : Bool; detail : Text } {
    if (not Principal.isController(caller)) return { ok = false; detail = "controller only (CLI)" };
    if (busy()) return { ok = false; detail = "An update is running; wait before changing its release source" };
    recipeCache := []; recipeCacheAt := 0;
    pantryOverride := if (norm(id) == "") "" else (switch (principalSafe(id)) { case null return { ok = false; detail = "not a canister id" }; case (?p) Principal.toText(p) });
    { ok = true; detail = "" };
  };
  transient let BUILD_VERSION : Text = "0.8.3";
  public shared func info() : async { hubId : Text; pantryId : Text; me : Text; version : Text; installed : Nat } {
    { hubId; pantryId = pantryId<system>(); me = Principal.toText(me()); version = BUILD_VERSION; installed = Map.size(installed) };
  };

  // =====================================================================
  // pantry reads
  // =====================================================================
  func pantry<system>() : Assets = actor (pantryId<system>());
  /// whole asset as one blob (follows chunks), identity encoding preferred
  func readAsset(a : Assets, key : Text) : async* ?(Blob, Text, Text) {
    let first = try { await a.get({ key; accept_encodings = ["identity", "gzip"] }) } catch (_) { return null };
    if (first.content.size() >= first.total_length) return ?(first.content, first.content_type, first.content_encoding);
    let parts = List.empty<[Nat8]>();
    List.add(parts, Blob.toArray(first.content));
    var got = first.content.size(); var idx = 1;
    while (got < first.total_length) {
      let c = try { await a.get_chunk({ key; content_encoding = first.content_encoding; index = idx; sha256 = first.sha256 }) } catch (_) { return null };
      if (c.content.size() == 0) return null;
      List.add(parts, Blob.toArray(c.content)); got += c.content.size(); idx += 1;
    };
    ?(Array.toBlob(Array.flatten<Nat8>(List.toArray(parts))), first.content_type, first.content_encoding);
  };
  func readText(a : Assets, key : Text) : async ?Text {
    switch (await* readAsset(a, key)) {
      case (?(b, _, enc)) { if (enc != "identity") return null; Text.decodeUtf8(b) };
      case null null;
    };
  };

  func parseRecipes(txt : Text) : [Recipe] {
    // mo:json 1.4 traps on \uXXXX escapes (verified with moc -r); a pantry that ships them is refused, not cooked
    if (Text.contains(txt, #text "\\u")) return [];
    let root = switch (Json.parse(txt)) { case (#ok(j)) j; case (#err(_)) return [] };
    let out = List.empty<Recipe>();
    for (r in jArr(root, "recipes").vals()) {
      let files = List.empty<RecipeFile>();
      for (f in jArr(r, "frontend.files").vals()) List.add(files, { key = jStr(f, "key"); contentType = jStr(f, "type"); sha256 = jStr(f, "sha256"); size = jNat(f, "size"); gzip = if (jStr(f, "gzip.sha256") == "") null else ?{ sha256 = jStr(f, "gzip.sha256"); size = jNat(f, "gzip.size") } });
      let patches = List.empty<Patch>();
      for (p in jArr(r, "frontend.patch").vals()) List.add(patches, { file = jStr(p, "file"); from = jStr(p, "from"); to = jStr(p, "to") });
      let post = List.empty<{ method : Text; arg : Text }>();
      for (p in jArr(r, "post").vals()) List.add(post, { method = jStr(p, "method"); arg = jStr(p, "arg") });
      let rec : Recipe = {
        id = jStr(r, "id"); name = jStr(r, "name"); kind = jStr(r, "kind"); version = jStr(r, "version"); description = jStr(r, "description"); icon = jStr(r, "icon"); image = jStr(r, "image");
        backendPath = jStr(r, "backend.path"); backendSha = jStr(r, "backend.sha256"); backendSize = jNat(r, "backend.size");
        frontendWasm = jStr(r, "frontend.wasm"); frontendSha = jStr(r, "frontend.sha256"); frontendDir = jStr(r, "frontend.dir"); files = List.toArray(files); patches = List.toArray(patches);
        releaseId = jStr(r, "releaseId"); sourceCommit = jStr(r, "sourceCommit"); notes = jStr(r, "notes"); format = jNat(root, "format");
        requires = jArr(r, "requires").map(func d = { id = jStr(d, "id"); minVersion = jStr(d, "minVersion") });
        post = List.toArray(post); tileKind = jStr(r, "tile.kind"); tileNote = jStr(r, "tile.note");
      };
      // a malformed recipe is skipped, never half-cooked
      let hasFrontend = rec.kind != "service" and rec.kind != "installer";
      let sane = rec.id != "" and rec.version != "" and rec.backendPath != "" and (not hasFrontend or (rec.frontendWasm != "" and rec.files.size() > 0))
        and Array.find<Patch>(rec.patches, func(p) = p.from == "" or p.file == "") == null;
      if (sane) List.add(out, rec);
    };
    List.toArray(out);
  };
  func loadRecipes<system>() : async [Recipe] {
    if (recipeCache.size() > 0 and now() - recipeCacheAt < 120_000_000_000) return recipeCache;
    let txt = switch (await readText(pantry<system>(), "/recipes/index.json")) { case (?t) t; case null { throw Error.reject("The release catalogue could not be read. Retry the check.") } };
    recipeCache := parseRecipes(txt); recipeCacheAt := now();
    if (recipeCache.size() == 0) { throw Error.reject("The release catalogue is empty or invalid") };
    recipeCache;
  };
  func loadReservedRecipes<system>() : async [Recipe] {
    try { await loadRecipes<system>() } catch (e) { release(); throw e };
  };
  func recipeById(rs : [Recipe], id : Text) : ?Recipe = Array.find<Recipe>(rs, func(r) = r.id == id);

  // =====================================================================
  // public: catalogue, installs, jobs
  // =====================================================================
  /// upToDate: the running backend's module hash equals the recipe's sha256 — version strings are a hint, the hash is the truth.
  /// downgrade: the pantry's recipe is OLDER than what runs (semantic version) — the kitchen never installs that; repack the pantry first.
  func semver(t : Text) : [Nat] {
    let out = List.empty<Nat>();
    for (part in Text.split(t, #char '.')) { switch (Nat.fromText(part)) { case (?n) List.add(out, n); case null List.add(out, 0) } };
    while (List.size(out) < 3) List.add(out, 0);
    List.toArray(out);
  };
  /// a < b in MAJOR.MINOR.PATCH; unknown ("" or "?") never compares
  func semverLess(a : Text, b : Text) : Bool {
    if (a == "" or b == "" or a == "?" or b == "?") return false;
    let x = semver(a); let y = semver(b);
    var i = 0;
    while (i < 3) { if (x[i] < y[i]) return true; if (x[i] > y[i]) return false; i += 1 };
    false;
  };
  /// Query the installed code; the install record can be stale after a manual upgrade.
  func runningVersionOf(kind : Text, inst : ?Install) : async Text {
    if (kind == "installer") return BUILD_VERSION;
    if (kind == "hub") { if (hubId == "") return ""; let hub : HubAPI = actor (hubId); return try { await (with timeout = 10) hub.version() } catch (_) { "" } };
    let i = switch inst { case (?i) i; case null return "" };
    if (i.backend == "") return "";
    if (kind == "service") {
      let a : actor { info : shared query () -> async { version : Text } } = actor (i.backend);
      return try { (await (with timeout = 10) a.info()).version } catch (_) { "" };
    };
    let a : actor { hub_manifest : shared query () -> async { version : Text } } = actor (i.backend);
    try { (await (with timeout = 10) a.hub_manifest()).version } catch (_) { "" };
  };
  func runningHash(cid : Text) : async Text {
    switch (principalSafe(cid)) {
      case (?p) { try { switch ((await ic.canister_info({ canister_id = p; num_requested_changes = null })).module_hash) { case (?h) hex(h); case null "" } } catch (_) { "" } };
      case null "";
    };
  };
  func packageProblem(r : Recipe) : Text {
    if (r.format != 2 or r.releaseId == "" or r.sourceCommit == "" or r.backendSha.size() != 64) return "This release source has no verified package manifest. Its publisher must publish a current release.";
    if (not Release.validKey("/" # r.backendPath) or not Release.validKey("/" # r.frontendDir)) return "Invalid release paths";
    if (r.kind != "service" and r.kind != "installer" and (r.files.size() == 0 or r.files.any(func f = f.sha256.size() != 64))) return "The release is missing frontend checksums";
    "";
  };
  func dependencyProblem(r : Recipe) : async Text {
    for (d in r.requires.values()) {
      let actual = if (d.id == "kitchen") BUILD_VERSION else if (d.id == "hub" and hubId != "") {
        let h : HubAPI = actor (hubId); try { await h.version() } catch (_) { "" };
      } else "";
      if (actual == "" or semverLess(actual, d.minVersion)) return "Requires " # d.id # " " # d.minVersion # " or later. Update that component first.";
    };
    "";
  };
  func syntheticInstall(r : Recipe, backend : Text, frontend : Text) : Install {
    { recipeId = r.id; version = ""; backend; frontend; installedAt = 0; updatedAt = 0; connectorId = 0; tileId = 0; adopted = true; state = "ok" };
  };
  func installation(r : Recipe) : async ?Install {
    if (r.kind == "installer") return ?syntheticInstall(r, Principal.toText(me()), "");
    if (r.id == "hub" or r.id == "vault") {
      if (hubId == "") return null;
      let h : HubAPI = actor (hubId);
      let cfg = try { await h.kitchenConfig() } catch (_) { return null };
      if (r.id == "hub") return ?syntheticInstall(r, hubId, cfg.frontendId);
      if (cfg.vaultId != "") return ?syntheticInstall(r, cfg.vaultId, "");
      return null;
    };
    Map.get(installed, Text.compare, r.id);
  };
  func lastReleaseJob(id : Text) : ?Job {
    var latest : ?Job = null;
    for ((_, j) in Map.entries(jobs)) if (j.recipeId == id and (j.kind == "update" or j.kind == "verify" or j.kind == "install")) {
      switch latest { case null latest := ?j; case (?old) if (j.id > old.id) latest := ?j };
    };
    latest;
  };
  func configuredValue(text : Text, marker : Text) : ?Text {
    let parts = Text.split(text, #text marker); ignore parts.next();
    let rest = parts.next() ?? { return null };
    let values = Text.split(rest, #text "\""); values.next();
  };
  func safeOrigin(url : Text) : Bool {
    url == "" or (url.startsWith(#text "https://") and not url.contains(#text "\"") and not url.contains(#text "\\") and not url.contains(#text "\n") and not url.contains(#text "\r") and not url.contains(#text " ") and not url.contains(#text "<") and not url.contains(#text "`"));
  };
  func deploymentVars(r : Recipe, inst : Install, cfg : Cfg) : async [(Text, Text)] {
    var hubUrl = gatewayUrl(cfg.frontendId); var frontendUrl = gatewayUrl(inst.frontend);
    if (inst.frontend != "") {
      let a : Release.Assets = actor (inst.frontend);
      let file = if (r.id == "hub") "/index.html" else "/app.js";
      let bytes = await* Release.read(a, file, 32_000_000);
      let text = Text.decodeUtf8(bytes) ?? { throw Error.reject("Existing deployment configuration is not readable") };
      let marker = if (r.id == "hub") "const CANONICAL_ORIGIN = \"" else "const HUB_URL = \"";
      let value = configuredValue(text, marker) ?? { throw Error.reject("Existing sign-in origin could not be identified; update cancelled") };
      if (not safeOrigin(value) or (r.id != "hub" and value == "")) throw Error.reject("Existing sign-in origin is invalid; update cancelled");
      if (r.id == "hub") frontendUrl := value else hubUrl := value;
    };
    [("backend", inst.backend), ("frontend", inst.frontend), ("hubId", hubId), ("hubUrl", hubUrl), ("frontendUrl", frontendUrl)];
  };
  func frontendMatches<system>(r : Recipe, inst : Install) : async Bool {
    if (r.kind == "service" or r.kind == "installer") return true;
    let h : HubAPI = actor (hubId); let cfg = await h.kitchenConfig();
    let vars = await deploymentVars(r, inst, cfg);
    let source : Release.Assets = actor (pantryId<system>());
    await* Release.matchesManifest(Principal.fromText(inst.frontend), source, r.frontendDir, r.files, r.patches, vars);
  };
  public type RecipeView = {
    id : Text; name : Text; kind : Text; version : Text; description : Text; icon : Text; image : Text; backendSize : Nat; files : Nat;
    installed : ?Install; runningSha : Text; upToDate : ?Bool; runningVersion : Text; downgrade : Bool;
    releaseId : Text; sourceCommit : Text; notes : Text; state : Text; detail : Text; frontendMatches : ?Bool; canUpdate : Bool;
  };
  func recipeViews<system>() : async [RecipeView] {
    ignore busy();
    let rs = await loadRecipes<system>(); let out = List.empty<RecipeView>();
    for (r in rs.values()) {
      let inst = await installation(r);
      let target = switch inst { case (?i) i.backend; case null "" };
      let sha = if (target == "") "" else await runningHash(target);
      let rv = if (r.kind == "installer") BUILD_VERSION else await runningVersionOf(r.kind, inst);
      let downgrade = semverLess(r.version, rv);
      var state = "available"; var detail = packageProblem(r); var current : ?Bool = null; var front : ?Bool = null;
      var canUpdate = detail == "";
      if (canUpdate) { detail := await dependencyProblem(r); canUpdate := detail == "" };
      switch inst {
        case null { if (r.kind != "app") { state := "unavailable"; detail := "This system component is not connected"; canUpdate := false } };
        case (?i) {
          state := "update_available";
          if (i.state == "failed") { state := "install_failed"; detail := "The previous installation did not finish"; canUpdate := false }
          else if (i.state == "installing") { state := "updating"; canUpdate := false }
          else if (sha == "" or rv == "") { state := "unavailable"; detail := "The running release could not be checked"; canUpdate := false }
          else if (downgrade) { state := "newer_installed"; detail := "The installed version is newer than the published catalogue. No downgrade is offered."; canUpdate := false }
          else if (not canUpdate) state := "blocked"
          else if (rv == r.version) {
            if (sha != r.backendSha) { state := "modified"; detail := "This version was deployed with a different build. Review before installing the published release."; current := ?false }
            else {
              try {
                let matches = await frontendMatches<system>(r, i); front := ?matches; current := ?matches;
                state := if (matches) "current" else "repair";
                detail := if (matches) "Backend and frontend match the published release" else "The backend is current, but the frontend does not match. Repair this release.";
              } catch (_) { state := "unavailable"; detail := "Frontend verification could not complete. Retry the check."; canUpdate := false };
            };
          } else current := ?false;
        };
      };
      switch (lastReleaseJob(r.id)) {
        case (?j) {
          if (j.state == "running") { state := "updating"; current := ?false; canUpdate := false; detail := "An operation is in progress" }
          else if (j.state == "failed" and j.version == r.version and state == "current") { state := "repair"; current := ?false; detail := "The previous operation did not finish. Verify or repair this release before calling it current." };
        };
        case null {};
      };
      if (r.kind == "installer") canUpdate := false;
      out.add({ id = r.id; name = r.name; kind = r.kind; version = r.version; description = r.description; icon = r.icon; image = r.image; backendSize = r.backendSize; files = r.files.size(); installed = inst; runningSha = sha; upToDate = current; runningVersion = rv; downgrade; releaseId = r.releaseId; sourceCommit = r.sourceCommit; notes = r.notes; state; detail; frontendMatches = front; canUpdate });
    };
    out.toArray();
  };
  public shared ({ caller }) func recipes() : async [RecipeView] {
    if (not (await isOwner(caller, false))) return [];
    await recipeViews<system>();
  };
  public shared ({ caller }) func checkForUpdates() : async [RecipeView] {
    if (not (await isOwner(caller, true))) return [];
    recipeCacheAt := 0;
    await recipeViews<system>();
  };
  public shared ({ caller }) func listInstalled() : async [Install] { if (not (await isOwner(caller, false))) return []; Iter.toArray(Map.values(installed)) };
  public shared ({ caller }) func listJobs() : async [Job] {
    if (not (await isOwner(caller, false))) return [];
    let all = Array.sort<Job>(Iter.toArray(Map.values(jobs)), func(a, b) = Nat.compare(b.id, a.id));
    Array.tabulate<Job>(Nat.min(20, all.size()), func i = all[i]);
  };
  /// progress polling — for the person who started the job (or a controller); canister ids of a cooking stack stay private
  public shared query ({ caller }) func job(id : Nat) : async ?Job {
    switch (Map.get(jobs, Nat.compare, id)) {
      case (?j) { if (j.by == Principal.toText(caller) or Principal.isController(caller) or (hubId != "" and (switch (ownerCache.get(caller)) { case (?t) now() >= t and now() - t < 60_000_000_000; case null false }))) ?j else null };
      case null null;
    };
  };
  public shared ({ caller }) func listJournal() : async [LogRow] {
    if (not (await isOwner(caller, false))) return [];
    let out = List.empty<LogRow>();
    for ((_, r) in Map.reverseEntries(journal)) { if (List.size(out) < 200) List.add(out, r) };
    List.toArray(out);
  };

  /// Are we a controller of the hub's canisters (→ we may update the hub)? Of the vault?
  public shared ({ caller }) func hubStatus() : async { hubId : Text; frontendId : Text; vaultId : Text; hubBackend : Bool; hubFrontend : Bool; vault : Bool; detail : Text } {
    let empty = { hubId; frontendId = ""; vaultId = ""; hubBackend = false; hubFrontend = false; vault = false; detail = "" };
    if (not (await isOwner(caller, false))) return { empty with detail = "owners only" };
    if (hubId == "") return { empty with detail = "hub not set" };
    let hub : HubAPI = actor (hubId);
    let cfg = try { await hub.kitchenConfig() } catch (e) { return { empty with detail = "hub did not answer kitchenConfig — is the kitchen registered in the hub? " # Error.message(e) } };
    func controls(cid : Text) : async Bool {
      switch (principalSafe(cid)) {
        case null false;
        case (?p) { try { let i = await ic.canister_info({ canister_id = p; num_requested_changes = null }); Array.find<Principal>(i.controllers, func(c) = c == me()) != null } catch (_) { false } };
      };
    };
    { hubId; frontendId = cfg.frontendId; vaultId = cfg.vaultId; hubBackend = await controls(hubId); hubFrontend = await controls(cfg.frontendId); vault = await controls(cfg.vaultId); detail = "" };
  };

  // =====================================================================
  // jobs — one at a time, detached via a 0-second timer, polled by the UI
  // =====================================================================
  func newJob(kind : Text, recipeId : Text, version : Text, by : Principal, stepNames : [Text]) : Nat {
    let id = nextJob; nextJob += 1;
    Map.add(jobs, Nat.compare, id, { id; kind; recipeId; version; startedAt = now(); endedAt = 0; state = "running"; by = Principal.toText(by); steps = Array.map<Text, Step>(stepNames, func(n) = { name = n; status = "todo"; detail = "" }) });
    if (nextJob > 60) ignore Map.delete(jobs, Nat.compare, nextJob - 60 : Nat);
    id;
  };
  /// reserve the kitchen for the job about to be created (before any await), release on early exit
  func reserve() : Bool { if (busy()) return false; busyJob := nextJob; true };
  func release() { busyJob := 0 };
  func setStep(jobId : Nat, name : Text, status : Text, detail : Text) {
    switch (Map.get(jobs, Nat.compare, jobId)) {
      case (?j) Map.add(jobs, Nat.compare, jobId, { j with steps = Array.map<Step, Step>(j.steps, func(s) = if (s.name == name) ({ name; status; detail }) else s) });
      case null {};
    };
  };
  func finishJob(jobId : Nat, ok : Bool, detail : Text) {
    switch (Map.get(jobs, Nat.compare, jobId)) {
      case (?j) {
        let steps = Array.map<Step, Step>(j.steps, func(s) = if (s.status == "todo" or s.status == "run") ({ s with status = "skip"; detail = (if (s.status == "run") detail else s.detail) }) else s);
        Map.add(jobs, Nat.compare, jobId, { j with state = (if (ok) "done" else "failed"); endedAt = now(); steps });
        log(j.by, j.kind # " " # j.recipeId # " " # j.version # " → " # (if (ok) "done" else "FAILED: " # detail), ok);
      };
      case null {};
    };
    if (busyJob == jobId) busyJob := 0; // a superseded job must not free the lock of a newer one
  };
  /// run one step: marks run → ok/fail, returns the value or null on failure
  /// (two flavours because an async result type must be shared — no generics here)
  func stepT(jobId : Nat, name : Text, f : () -> async Text) : async ?Text {
    setStep(jobId, name, "run", "");
    try { let v = await f(); setStep(jobId, name, "ok", v); ?v }
    catch (e) { setStep(jobId, name, "fail", Error.message(e)); null };
  };
  func stepP(jobId : Nat, name : Text, f : () -> async Principal) : async ?Principal {
    setStep(jobId, name, "run", "");
    try { let v = await f(); setStep(jobId, name, "ok", Principal.toText(v)); ?v }
    catch (e) { setStep(jobId, name, "fail", Error.message(e)); null };
  };
  type Cfg = { vaultId : Text; frontendId : Text; orgName : Text; hubId : Text };
  func stepCfg(jobId : Nat) : async ?Cfg {
    setStep(jobId, "hub config", "run", "");
    let hub : HubAPI = actor (hubId);
    try { let c = await hub.kitchenConfig(); setStep(jobId, "hub config", "ok", "vault " # (if (c.vaultId == "") "none" else c.vaultId)); ?c }
    catch (e) { setStep(jobId, "hub config", "fail", Error.message(e)); null };
  };

  // ---- shared building blocks ----
  func myControllers() : async [Principal] {
    try { (await ic.canister_info({ canister_id = me(); num_requested_changes = null })).controllers } catch (_) { [] };
  };
  func childControllers(vaultId : Text) : async [Principal] {
    let mine = await myControllers();
    if (mine.size() == 0) throw Error.reject("could not read the kitchen's own controllers — refusing to create canisters nobody but the kitchen controls");
    let ls = List.fromArray<Principal>(mine);
    List.add(ls, me());
    switch (principalSafe(vaultId)) { case (?v) { if (not List.any<Principal>(ls, func(p) = p == v)) List.add(ls, v) }; case null {} };
    List.toArray(ls);
  };
  func settingsWith(ctrls : ?[Principal], env : ?[EnvVar]) : Settings = { controllers = ctrls; compute_allocation = null; memory_allocation = null; freezing_threshold = null; reserved_cycles_limit = null; log_visibility = null; wasm_memory_limit = null; environment_variables = env };
  func createCanister(ctrls : [Principal]) : async Principal {
    (await ic.create_canister({ settings = ?settingsWith(?ctrls, null); sender_canister_version = null })).canister_id;
  };
  let CHUNK : Nat = 1_000_000;
  let DIRECT_MAX : Nat = 1_500_000; // inter-canister messages cap at 2 MB — leave room for the envelope
  /// install or upgrade a module — directly when small, through the chunk store when large
  func installModule(target : Principal, wasm : Blob, shaHex : Text, mode : InstallMode, arg : Blob) : async Text {
    if (shaHex.size() != 64 or hex(Sha256.fromIter(#sha256, wasm.values())) != Text.toLower(shaHex)) throw Error.reject("recipe module SHA-256 mismatch — install aborted");
    if (wasm.size() <= DIRECT_MAX) {
      await ic.install_code({ mode; canister_id = target; wasm_module = wasm; arg; sender_canister_version = null });
      return "direct, " # Nat.toText(wasm.size() / 1024) # " KB";
    };
    let moduleHash = switch (unhex(shaHex)) { case (?h) h; case null throw Error.reject("recipe lacks the module's sha256 (needed for a chunked install)") };
    try { await ic.clear_chunk_store({ canister_id = target }) } catch (_) {};
    let bytes = Blob.toArray(wasm);
    let hashes = List.empty<{ hash : Blob }>();
    var off = 0;
    while (off < bytes.size()) {
      let len = Nat.min(CHUNK, bytes.size() - off : Nat);
      let part = Array.toBlob(Array.tabulate<Nat8>(len, func i = bytes[off + i]));
      let r = await ic.upload_chunk({ canister_id = target; chunk = part });
      List.add(hashes, { hash = r.hash });
      off += len;
    };
    await ic.install_chunked_code({ mode; target_canister = target; store_canister = null; chunk_hashes_list = List.toArray(hashes); wasm_module_hash = moduleHash; arg; sender_canister_version = null });
    try { await ic.clear_chunk_store({ canister_id = target }) } catch (_) {};
    "chunked, " # Nat.toText(List.size(hashes)) # " chunks, " # Nat.toText(wasm.size() / 1024) # " KB";
  };
  transient let CANDID_NOARGS : Blob = "\44\49\44\4C\00\00"; // Candid `()` — an asset canister's optional init arg may be omitted

  /// placeholders are delimited — `${frontend}` can never eat `${frontendUrl}`
  func fill(t : Text, vars : [(Text, Text)]) : Text { var out = t; for ((k, v) in vars.vals()) out := Text.replace(out, #text ("${" # k # "}"), v); out };
  // Fresh installs use the same checked, atomic frontend publication as updates.
  func copyFrontend<system>(r : Recipe, target : Principal, vars : [(Text, Text)]) : async Text {
    let source : Release.Assets = actor (pantryId<system>());
    let files = await* Release.prepare(source, r.frontendDir, r.files, r.patches, vars);
    let staged = await* Release.stage(target, me(), files);
    try {
      await* Release.commit(staged); await* Release.verify(staged);
      await* Release.cleanup(staged);
      Nat.toText(files.size()) # " files verified";
    } catch (e) { await* Release.cleanup(staged); throw e };
  };
  /// console labels + the PUBLIC_CANISTER_ID:* pair icp would have injected (apps read them like the hub does)
  func setMeta(cid : Principal, project : Text, name : Text, main : Bool, baseUrl : Text, be : Principal, fe : Principal) : async () {
    let env = List.empty<EnvVar>();
    List.add(env, { name = "__META_PROJECT"; value = project }); List.add(env, { name = "__META_NAME"; value = name });
    List.add(env, { name = "PUBLIC_CANISTER_ID:backend"; value = Principal.toText(be) }); List.add(env, { name = "PUBLIC_CANISTER_ID:frontend"; value = Principal.toText(fe) });
    if (main) { List.add(env, { name = "__META_MAIN_CANISTER"; value = "true" }); List.add(env, { name = "__META_BASE_URL"; value = baseUrl }); List.add(env, { name = "__META_ICON_PATH"; value = "/favicon.svg" }) };
    await ic.update_settings({ canister_id = cid; settings = settingsWith(null, ?List.toArray(env)); sender_canister_version = null });
  };

  // =====================================================================
  // install
  // =====================================================================
  public shared ({ caller }) func install(recipeId : Text) : async { ok : Bool; jobId : Nat; detail : Text } {
    await installRelease<system>(caller, recipeId, "");
  };
  public shared ({ caller }) func applyRelease(request : { id : Text; releaseId : Text; install : Bool }) : async { ok : Bool; jobId : Nat; detail : Text } {
    if (request.releaseId == "") return { ok = false; jobId = 0; detail = "Review a published release first" };
    if (request.install) await installRelease<system>(caller, request.id, request.releaseId)
    else await updateRelease<system>(caller, request.id, request.releaseId);
  };
  func installRelease<system>(caller : Principal, recipeId : Text, expected : Text) : async { ok : Bool; jobId : Nat; detail : Text } {
    if (not (await isOwner(caller, true))) return { ok = false; jobId = 0; detail = "owners only" };
    if (hubId == "") return { ok = false; jobId = 0; detail = "the kitchen does not know its hub yet (setHub)" };
    if (not reserve()) return { ok = false; jobId = busyJob; detail = "another job is cooking — wait for it" };
    recipeCacheAt := 0;
    let r = switch (recipeById(await loadReservedRecipes<system>(), recipeId)) { case (?r) r; case null { release(); return { ok = false; jobId = 0; detail = "no such recipe" } } };
    if (expected != "" and r.releaseId != expected) { release(); return { ok = false; jobId = 0; detail = "The published release changed. Refresh and review it before continuing." } };
    let problem = packageProblem(r); if (problem != "") { release(); return { ok = false; jobId = 0; detail = problem } };
    let dependency = await dependencyProblem(r); if (dependency != "") { release(); return { ok = false; jobId = 0; detail = dependency } };
    if (r.kind != "app") { release(); return { ok = false; jobId = 0; detail = "only apps can be installed; the hub is updated, not installed" } };
    switch (Map.get(installed, Text.compare, r.id)) {
      case (?i) { if (i.state != "failed") { release(); return { ok = false; jobId = 0; detail = "already installed — use update" } } else { release(); return { ok = false; jobId = 0; detail = "a failed install left canisters behind — remove the leftovers first" } } };
      case null {};
    };
    let id = newJob("install", r.id, r.version, caller, ["read recipe", "hub config", "verify release", "create backend", "install backend", "create frontend", "install frontend", "copy frontend files", "tell the app where the hub is", "register in the hub", "picture on the menu", "console labels", "hand to the vault"]);
    busyJob := id;
    ignore Timer.setTimer<system>(#seconds 0, func() : async () { try { await runInstall<system>(id, r) } catch (e) { markInstallFailed(r.id); finishJob(id, false, "trapped: " # Error.message(e)) } });
    { ok = true; jobId = id; detail = "" };
  };

  func runInstall<system>(jobId : Nat, r : Recipe) : async () {
    setStep(jobId, "read recipe", "ok", r.name # " " # r.version # " · " # Nat.toText(r.files.size()) # " frontend files");
    let hub : HubAPI = actor (hubId);
    let cfg = switch (await stepCfg(jobId)) { case (?c) c; case null return finishJob(jobId, false, "hub config failed") };
    if (principalSafe(cfg.frontendId) == null) { setStep(jobId, "hub config", "fail", "the hub does not know its own frontend canister (PUBLIC_CANISTER_ID:frontend missing) — redeploy the hub with icp deploy"); return finishJob(jobId, false, "hub config incomplete") };
    let ctrls = try { await childControllers(cfg.vaultId) } catch (e) { setStep(jobId, "create backend", "fail", Error.message(e)); return finishJob(jobId, false, "controllers unknown") };
    let checked = await stepT(jobId, "verify release", func() : async Text {
      let source : Release.Assets = actor (pantryId<system>());
      let wasm = await* Release.read(source, "/" # r.backendPath, 48_000_000);
      let frontendWasm = await* Release.read(source, "/" # r.frontendWasm, 48_000_000);
      if (Release.hex(Release.digest(wasm)) != r.backendSha or Release.hex(Release.digest(frontendWasm)) != r.frontendSha) throw Error.reject("Release module checksum mismatch");
      ignore await* Release.prepare(source, r.frontendDir, r.files, r.patches, []);
      "Complete installation package verified";
    });
    if (checked == null) return finishJob(jobId, false, "Package verification failed before creating any services");
    var rec : Install = { recipeId = r.id; version = r.version; backend = ""; frontend = ""; installedAt = now(); updatedAt = now(); connectorId = 0; tileId = 0; adopted = false; state = "installing" };
    func fail(jobId : Nat, why : Text) { if (rec.backend != "") Map.add(installed, Text.compare, r.id, { rec with state = "failed" }); finishJob(jobId, false, why) };
    let be = switch (await stepP(jobId, "create backend", func() : async Principal = async { await createCanister(ctrls) })) { case (?p) p; case null return fail(jobId, "create backend failed") };
    rec := { rec with backend = Principal.toText(be) }; Map.add(installed, Text.compare, r.id, rec);
    // backend module
    let src = pantry<system>();
    let beOk = await stepT(jobId, "install backend", func() : async Text = async {
      let (wasm, _, _) = switch (await* readAsset(src, "/" # r.backendPath)) { case (?x) x; case null throw Error.reject("pantry has no " # r.backendPath) };
      await installModule(be, wasm, r.backendSha, #install, CANDID_NOARGS);
    });
    if (beOk == null) return fail(jobId, "install backend failed");
    // frontend
    let fe = switch (await stepP(jobId, "create frontend", func() : async Principal = async { await createCanister(ctrls) })) { case (?p) p; case null return fail(jobId, "create frontend failed") };
    rec := { rec with frontend = Principal.toText(fe) }; Map.add(installed, Text.compare, r.id, rec);
    let feOk = await stepT(jobId, "install frontend", func() : async Text = async {
      let (wasm, _, _) = switch (await* readAsset(src, "/" # r.frontendWasm)) { case (?x) x; case null throw Error.reject("pantry has no " # r.frontendWasm) };
      await installModule(fe, wasm, r.frontendSha, #install, CANDID_NOARGS);
    });
    if (feOk == null) return fail(jobId, "install frontend failed");
    let beT = Principal.toText(be); let feT = Principal.toText(fe);
    let vars : [(Text, Text)] = [("backend", beT), ("frontend", feT), ("hubId", hubId), ("hubUrl", gatewayUrl(cfg.frontendId)), ("frontendUrl", gatewayUrl(feT))];
    let cp = await stepT(jobId, "copy frontend files", func() : async Text = async { await copyFrontend<system>(r, fe, vars) });
    if (cp == null) return fail(jobId, "copy frontend files failed");
    // post-install calls on the app (setHub …) — raw calls, one Text argument, reply ignored
    let post = await stepT(jobId, "tell the app where the hub is", func() : async Text = async {
      var n = 0;
      for (p in r.post.vals()) {
        let a = fill(p.arg, vars);
        ignore await IC0.call(be, p.method, to_candid (a)); n += 1;
      };
      Nat.toText(n) # " call(s)";
    });
    if (post == null) return fail(jobId, "post-install call failed");
    // register in the hub
    setStep(jobId, "register in the hub", "run", "");
    var connectorId = 0; var tileId = 0;
    try {
      let x = await hub.kitchenConnect({ name = r.name; canisterId = beT; note = r.tileNote; tile = ?{ name = r.name; url = gatewayUrl(feT) # "/"; kind = (if (r.tileKind == "") "app" else r.tileKind) } });
      if (not x.ok) { setStep(jobId, "register in the hub", "fail", x.detail); return fail(jobId, "register in the hub failed: " # x.detail) };
      connectorId := x.id; tileId := x.tileId;
      setStep(jobId, "register in the hub", "ok", "app #" # Nat.toText(x.id) # ", menu entry #" # Nat.toText(x.tileId));
    } catch (e) { setStep(jobId, "register in the hub", "fail", Error.message(e)); return fail(jobId, "register in the hub failed") };
    // picture on the menu (best effort: older hubs have no kitchenSetTileIcon, recipes may ship none)
    if (r.image != "" and tileId != 0) {
      ignore await stepT(jobId, "picture on the menu", func() : async Text = async {
        switch (await* readAsset(pantry<system>(), "/" # r.image)) {
          case (?(img, ctype, enc)) {
            if (enc != "identity") return "picture is stored compressed — skipped";
            let mime = if (ctype == "") "image/png" else ctype;
            let x = await hub.kitchenSetTileIcon(tileId, img, mime);
            if (x.ok) "set (" # Nat.toText(img.size()) # " bytes)" else throw Error.reject("hub said: " # x.detail);
          };
          case null "picture not found in the pantry — skipped";
        };
      });
    };
    // console labels (best effort)
    ignore await stepT(jobId, "console labels", func() : async Text = async {
      let project = (if (cfg.orgName == "") "kebab-stack" else cfg.orgName) # " · " # r.name;
      await setMeta(be, project, "Backend", false, "", be, fe); await setMeta(fe, project, "Frontend", true, gatewayUrl(feT), be, fe);
      "__META_* and PUBLIC_CANISTER_ID:* set";
    });
    // vault
    ignore await stepT(jobId, "hand to the vault", func() : async Text = async {
      if (cfg.vaultId == "") return "no vault configured — skipped";
      let vault : VaultAPI = actor (cfg.vaultId);
      let a = await vault.addTarget(beT, r.name # " · backend", "app-backend");
      let b = await vault.addTarget(feT, r.name # " · frontend", "app-frontend");
      if (not a.ok or not b.ok) throw Error.reject(a.detail # " " # b.detail);
      "both canisters registered; " # (await seedSchedule(vault, beT));
    });
    Map.add(installed, Text.compare, r.id, { rec with connectorId; tileId; updatedAt = now(); state = "ok" });
    finishJob(jobId, true, "");
  };

  /// A failed install leaves two canisters behind; remove them (kitchen is a controller) and forget the record.
  type ICDel = actor { stop_canister : shared { canister_id : Principal } -> async (); delete_canister : shared { canister_id : Principal } -> async () };
  public shared ({ caller }) func removeLeftovers(recipeId : Text) : async { ok : Bool; detail : Text } {
    if (not (await isOwner(caller, true))) return { ok = false; detail = "owners only" };
    let i = switch (Map.get(installed, Text.compare, recipeId)) { case (?i) i; case null return { ok = false; detail = "nothing recorded" } };
    if (i.state != "failed" or i.adopted) return { ok = false; detail = "only the leftovers of a failed install can be removed here" };
    let icd : ICDel = actor "aaaaa-aa";
    var gone = 0; var kept = "";
    for (t in [i.backend, i.frontend].vals()) {
      if (t == "") { } else
      switch (principalSafe(t)) {
        case (?p) { try { await icd.stop_canister({ canister_id = p }); await icd.delete_canister({ canister_id = p }); gone += 1 } catch (e) { kept #= t # " (" # Error.message(e) # ") " } };
        case null {};
      };
    };
    if (kept == "") ignore Map.delete(installed, Text.compare, recipeId);
    log(Principal.toText(caller), "removed leftovers of " # recipeId # ": " # Nat.toText(gone) # " canister(s) deleted" # (if (kept != "") ", could not delete " # kept else ""), kept == "");
    { ok = kept == ""; detail = (if (kept == "") Nat.toText(gone) # " canister(s) deleted" else "could not delete " # kept # "— remove them in the Console") };
  };

  // =====================================================================
  // update (apps) — snapshot first, then upgrade keeping memory, then refresh the frontend
  // =====================================================================
  func snapshotForUpdate(cfg : Cfg, target : Text, version : Text) : async Text {
    if (cfg.vaultId == "") throw Error.reject("Connect a backup service before updating. No code was changed.");
    if (target != cfg.vaultId) {
      let vault : VaultAPI = actor (cfg.vaultId);
      let result = await vault.snapshot(target, "Before release " # version);
      if (not result.ok) throw Error.reject(result.detail);
      return result.detail;
    };
    // Vault cannot snapshot itself. Preserve existing snapshots until the platform
    // limit, then atomically replace the oldest; always restart after a failure.
    let p = Principal.fromText(target);
    let existing = await ic.list_canister_snapshots({ canister_id = p });
    var replace : ?Blob = null;
    if (existing.size() >= 10) {
      var oldest = existing[0];
      for (s in existing.values()) if (s.taken_at_timestamp < oldest.taken_at_timestamp) oldest := s;
      replace := ?oldest.id;
    };
    await ic.stop_canister({ canister_id = p });
    try {
      let result = await ic.take_canister_snapshot({ canister_id = p; replace_snapshot = replace; uninstall_code = null; sender_canister_version = null });
      await ic.start_canister({ canister_id = p });
      "Snapshot " # hex(result.id);
    } catch (e) { await ic.start_canister({ canister_id = p }); throw e };
  };
  func requireStep(jobId : Nat, name : Text, f : () -> async Text) : async () {
    switch (await stepT(jobId, name, f)) { case null throw Error.reject(name # " did not complete"); case _ {} };
  };
  func startUpdate<system>(caller : Principal, r : Recipe, inst : Install) : async { ok : Bool; jobId : Nat; detail : Text } {
    let problem = packageProblem(r);
    if (problem != "") { release(); return { ok = false; jobId = 0; detail = problem } };
    let dependency = await dependencyProblem(r);
    if (dependency != "") { release(); return { ok = false; jobId = 0; detail = dependency } };
    if (r.kind == "installer") { release(); return { ok = false; jobId = 0; detail = "Update the installer with the release CLI while no job is running" } };
    if (inst.state == "failed") { release(); return { ok = false; jobId = 0; detail = "The first installation failed. Review its leftovers before installing again." } };
    let liveVersion = await runningVersionOf(r.kind, ?inst);
    if (liveVersion == "") { release(); return { ok = false; jobId = 0; detail = "The running version is unavailable. No update was started." } };
    if (semverLess(r.version, liveVersion)) { release(); return { ok = false; jobId = 0; detail = "The installed version is newer than this release. Downgrades are blocked." } };
    let id = newJob("update", r.id, r.version, caller, ["read recipe", "hub config", "verify release", "snapshot backend", "snapshot frontend", "stage frontend", "upgrade backend", "publish frontend", "verify installation", "restore upload permissions", "done"]);
    busyJob := id;
    ignore Timer.setTimer<system>(#seconds 0, func() : async () { try { await runUpdate<system>(id, r, inst) } catch (e) { finishJob(id, false, "Update interrupted: " # Error.message(e)) } });
    { ok = true; jobId = id; detail = "" };
  };
  public shared ({ caller }) func update(recipeId : Text) : async { ok : Bool; jobId : Nat; detail : Text } {
    await updateRelease<system>(caller, recipeId, "");
  };
  func updateRelease<system>(caller : Principal, recipeId : Text, expected : Text) : async { ok : Bool; jobId : Nat; detail : Text } {
    if (not (await isOwner(caller, true))) return { ok = false; jobId = 0; detail = "owners only" };
    if (not reserve()) return { ok = false; jobId = busyJob; detail = "An operation is already running" };
    recipeCacheAt := 0;
    let r = recipeById(await loadReservedRecipes<system>(), recipeId) ?? { release(); return { ok = false; jobId = 0; detail = "Release not found" } };
    if (expected != "" and r.releaseId != expected) { release(); return { ok = false; jobId = 0; detail = "The published release changed. Refresh and review it before continuing." } };
    let inst = (await installation(r)) ?? { release(); return { ok = false; jobId = 0; detail = "Connect this installation before updating it" } };
    await startUpdate<system>(caller, r, inst);
  };
  public shared ({ caller }) func updateHub() : async { ok : Bool; jobId : Nat; detail : Text } {
    if (not (await isOwner(caller, true))) return { ok = false; jobId = 0; detail = "owners only" };
    if (not reserve()) return { ok = false; jobId = busyJob; detail = "An operation is already running" };
    let r = recipeById(await loadReservedRecipes<system>(), "hub") ?? { release(); return { ok = false; jobId = 0; detail = "No Hub release is published" } };
    let inst = (await installation(r)) ?? { release(); return { ok = false; jobId = 0; detail = "Hub configuration is unavailable" } };
    await startUpdate<system>(caller, r, inst);
  };
  func runUpdate<system>(jobId : Nat, r : Recipe, inst : Install) : async () {
    var staged : ?Release.Stage = null;
    try {
      setStep(jobId, "read recipe", "ok", r.name # " " # r.version # " · " # r.releaseId);
      let cfg = (await stepCfg(jobId)) ?? { throw Error.reject("Hub configuration is unavailable") };
      let be = principalSafe(inst.backend) ?? { throw Error.reject("Invalid backend id") };
      let fe = if (r.kind == "service") null else principalSafe(inst.frontend);
      if (r.kind != "service" and fe == null) throw Error.reject("Invalid frontend id");
      let beforeHash = await runningHash(inst.backend);
      var wasm : Blob = ""; var files : [Release.Prepared] = [];
      await requireStep(jobId, "verify release", func() : async Text {
        if (cfg.vaultId == "") throw Error.reject("A backup service is required. Connect it before updating.");
        if (beforeHash == "") throw Error.reject("The existing backend could not be verified");
        for (id in (switch fe { case (?p) [be, p]; case null [be] }).values()) {
          let status = await ic.canister_status({ canister_id = id });
          if (status.status != #running or not status.settings.controllers.any(func p = p == me())) throw Error.reject("The update service must control both running components");
        };
        let source : Release.Assets = actor (pantryId<system>());
        wasm := await* Release.read(source, "/" # r.backendPath, 48_000_000);
        if (Release.hex(Release.digest(wasm)) != r.backendSha) throw Error.reject("Backend release checksum mismatch");
        if (fe != null) {
          let vars = await deploymentVars(r, inst, cfg);
          files := await* Release.prepare(source, r.frontendDir, r.files, r.patches, vars);
        };
        let j = Map.get(jobs, Nat.compare, jobId) ?? { throw Error.reject("Job disappeared") };
        if (not (await isOwner(Principal.fromText(j.by), true))) throw Error.reject("Owner access changed before the update started");
        "Package checksums, configuration and update authority verified";
      });
      await requireStep(jobId, "snapshot backend", func() : async Text { await snapshotForUpdate(cfg, inst.backend, r.version) });
      switch fe {
        case (?p) {
          await requireStep(jobId, "snapshot frontend", func() : async Text { await snapshotForUpdate(cfg, Principal.toText(p), r.version) });
          await requireStep(jobId, "stage frontend", func() : async Text {
            let batch = await* Release.stage(p, me(), files); staged := ?batch;
            "Upload prepared; no visible files changed";
          });
        };
        case null { setStep(jobId, "snapshot frontend", "skip", "System service has no frontend"); setStep(jobId, "stage frontend", "skip", "System service has no frontend") };
      };
      await requireStep(jobId, "upgrade backend", func() : async Text {
        if (beforeHash != (await runningHash(inst.backend))) throw Error.reject("Backend changed during preparation; retry after reviewing it");
        // A repair of the matching release only needs its frontend. Do not replace
        // a working backend or run its upgrade hooks a second time.
        if (beforeHash == r.backendSha) return "Matching backend retained";
        await installModule(be, wasm, r.backendSha, #upgrade(?{ skip_pre_upgrade = null; wasm_memory_persistence = ?#keep }), CANDID_NOARGS);
      });
      switch staged {
        case (?batch) await requireStep(jobId, "publish frontend", func() : async Text { await* Release.commit(batch); "Complete frontend published atomically" });
        case null setStep(jobId, "publish frontend", "skip", "System service has no frontend");
      };
      await requireStep(jobId, "verify installation", func() : async Text {
        if ((await runningHash(inst.backend)) != r.backendSha) throw Error.reject("Backend hash does not match the release");
        if ((await runningVersionOf(r.kind, ?inst)) != r.version) throw Error.reject("Backend version does not match the release");
        switch staged { case (?batch) await* Release.verify(batch); case null {} };
        "Backend, frontend and deployment settings verified";
      });
      await requireStep(jobId, "restore upload permissions", func() : async Text {
        switch staged { case (?batch) { await* Release.cleanup(batch); staged := null }; case null {} };
        "Original upload permissions restored";
      });
      if (r.id != "hub") Map.add(installed, Text.compare, r.id, { inst with version = r.version; updatedAt = now(); state = "ok" });
      // Updating code does not silently grant additional directory or credential
      // lanes. Owners review permissions separately in the existing Hub controls.
      setStep(jobId, "done", "ok", r.name # " " # r.version # " verified"); finishJob(jobId, true, "");
    } catch (e) {
      var detail = Error.message(e);
      switch staged {
        case (?batch) {
          try { await* Release.cleanup(batch); setStep(jobId, "restore upload permissions", "ok", "Original permissions restored after the interruption") }
          catch (cleanupError) { detail #= " · " # Error.message(cleanupError); setStep(jobId, "restore upload permissions", "fail", Error.message(cleanupError)) };
        };
        case null {};
      };
      finishJob(jobId, false, detail # ". Review the failed step; no automatic data rollback was performed.");
    };
  };
  public shared ({ caller }) func verifyInstalled(recipeId : Text) : async { ok : Bool; jobId : Nat; detail : Text } {
    if (not (await isOwner(caller, true))) return { ok = false; jobId = 0; detail = "owners only" };
    if (not reserve()) return { ok = false; jobId = busyJob; detail = "An operation is already running" };
    let r = recipeById(await loadReservedRecipes<system>(), recipeId) ?? { release(); return { ok = false; jobId = 0; detail = "Release not found" } };
    let problem = packageProblem(r); if (problem != "") { release(); return { ok = false; jobId = 0; detail = problem } };
    let inst = (await installation(r)) ?? { release(); return { ok = false; jobId = 0; detail = "Installation not connected" } };
    let id = newJob("verify", r.id, r.version, caller, ["verify backend", "verify frontend", "done"]); busyJob := id;
    ignore Timer.setTimer<system>(#seconds 0, func() : async () {
      try {
        await requireStep(id, "verify backend", func() : async Text {
          if ((await runningHash(inst.backend)) != r.backendSha or (await runningVersionOf(r.kind, ?inst)) != r.version) throw Error.reject("The running backend is a different build. Review the published release before applying it.");
          "Backend matches " # r.releaseId;
        });
        await requireStep(id, "verify frontend", func() : async Text {
          if (not (await frontendMatches<system>(r, inst))) throw Error.reject("Frontend differs; use Repair release");
          "Frontend and sign-in configuration match";
        });
        if (r.kind == "app" or r.kind == "service") Map.add(installed, Text.compare, r.id, { inst with version = r.version; updatedAt = now(); state = "ok" });
        setStep(id, "done", "ok", "Installed release verified without redeploying"); finishJob(id, true, "");
      } catch (e) { finishJob(id, false, Error.message(e)) };
    });
    { ok = true; jobId = id; detail = "" };
  };
  /// The two hub-side steps every installed app gets on update and on "Re-check with the hub":
  /// the recipe's picture on the menu (never overwriting an admin's choice) and the lanes the app needs (never removing one).
  func hubSteps<system>(jobId : Nat, r : Recipe, inst : Install) : async () {
    if (r.id == "hub" or r.id == "vault") return;
    if (r.image != "") {
      ignore await stepT(jobId, "picture on the menu", func() : async Text = async {
        switch (await* readAsset(pantry<system>(), "/" # r.image)) {
          case (?(img, ctype, enc)) {
            if (enc != "identity") return "picture is stored compressed — skipped";
            let hub : HubAPI = actor (hubId);
            let x = await hub.kitchenSetTileIconFor(inst.backend, img, (if (ctype == "") "image/png" else ctype));
            if (x.ok) (if (x.detail == "") "set (" # Nat.toText(img.size()) # " bytes)" else x.detail) else throw Error.reject("hub said: " # x.detail);
          };
          case null "picture not found in the pantry — skipped";
        };
      });
    } else setStep(jobId, "picture on the menu", "skip", "the recipe ships no picture");
    ignore await stepT(jobId, "lanes the app needs", func() : async Text = async {
      let hub : HubAPI = actor (hubId);
      let x = await hub.kitchenResyncLanes(inst.backend);
      if (not x.ok) throw Error.reject("hub said: " # x.detail) else if (x.added.size() == 0) (if (x.detail == "") "nothing missing" else x.detail) else "granted: " # Text.join(x.added.vals(), ", ");
    });
  };
  /// "Re-check with the hub": the hub-side steps alone, for an app that is already up to date (picture, lanes). No code is touched.
  public shared ({ caller }) func refresh(recipeId : Text) : async { ok : Bool; jobId : Nat; detail : Text } {
    if (not (await isOwner(caller, true))) return { ok = false; jobId = 0; detail = "owners only" };
    if (hubId == "") return { ok = false; jobId = 0; detail = "the kitchen does not know its hub yet (setHub)" };
    if (not reserve()) return { ok = false; jobId = busyJob; detail = "another job is cooking — wait for it" };
    let r = switch (recipeById(await loadReservedRecipes<system>(), recipeId)) { case (?r) r; case null { release(); return { ok = false; jobId = 0; detail = "no such recipe" } } };
    let inst = switch (Map.get(installed, Text.compare, r.id)) { case (?i) i; case null { release(); return { ok = false; jobId = 0; detail = "not installed here" } } };
    if (r.id == "hub" or r.id == "vault") { release(); return { ok = false; jobId = 0; detail = "nothing to re-check for the hub or the vault" } };
    let id = newJob("refresh", r.id, r.version, caller, ["picture on the menu", "lanes the app needs", "done"]);
    busyJob := id;
    ignore Timer.setTimer<system>(#seconds 0, func() : async () {
      try { await hubSteps<system>(id, r, inst); setStep(id, "done", "ok", r.name # " re-checked with the hub"); finishJob(id, true, "") } catch (e) { finishJob(id, false, "trapped: " # Error.message(e)) };
    });
    { ok = true; jobId = id; detail = "" };
  };

  // =====================================================================
  // cook — kitchen-first bootstrap: vault + hub from recipes, wired, protected,
  // handed to the person who pressed the button via a one-time claim code
  // =====================================================================
  var cookBy : Text = ""; var cookHubUrl : Text = ""; var cookClaimCode : Text = ""; var cookJob : Nat = 0;
  public shared ({ caller }) func cook() : async { ok : Bool; jobId : Nat; detail : Text } {
    if (not Principal.isController(caller)) return { ok = false; jobId = 0; detail = "a one-time setup code is required — ask the installer" };
    await* cookInternal<system>(caller);
  };
  public shared ({ caller }) func cookWithCode(code : Text) : async { ok : Bool; jobId : Nat; detail : Text } {
    let expected = Runtime.envVar<system>("KEBAB_SETUP_CODE") ?? "";
    if (expected.size() < 32 or norm(code) != expected) return { ok = false; jobId = 0; detail = "invalid setup code — use the code provided by the installer" };
    await* cookInternal<system>(caller);
  };
  func cookInternal<system>(caller : Principal) : async* { ok : Bool; jobId : Nat; detail : Text } {
    if (Principal.isAnonymous(caller)) return { ok = false; jobId = 0; detail = "sign in first" };
    if (hubId != "") return { ok = false; jobId = 0; detail = "this kitchen already belongs to a hub" };
    if (not reserve()) return { ok = false; jobId = busyJob; detail = "another job is cooking — wait for it" };
    let rs = await loadReservedRecipes<system>();
    let hubR = switch (recipeById(rs, "hub")) { case (?r) r; case null { release(); return { ok = false; jobId = 0; detail = "the pantry has no hub recipe" } } };
    if (hubR.kind != "hub") { release(); return { ok = false; jobId = 0; detail = "the hub recipe is not of kind hub" } };
    let vaultR = switch (recipeById(rs, "vault")) { case (?v) { if (v.kind != "service") { release(); return { ok = false; jobId = 0; detail = "the vault recipe is not of kind service" } }; ?v }; case null null }; // optional but strongly recommended
    if (packageProblem(hubR) != "") { release(); return { ok = false; jobId = 0; detail = packageProblem(hubR) } };
    switch vaultR { case null { release(); return { ok = false; jobId = 0; detail = "A verified backup-service release is required" } }; case (?v) { if (packageProblem(v) != "") { release(); return { ok = false; jobId = 0; detail = packageProblem(v) } } } };
    let id = newJob("cook", "stack", hubR.version, caller, ["read recipes", "create vault", "install vault", "create hub backend", "install hub backend", "create hub frontend", "install hub frontend", "copy hub frontend files", "wire the vault", "wire the hub", "protect with the vault", "console labels", "claim code"]);
    busyJob := id; cookBy := Principal.toText(caller); cookJob := id; cookHubUrl := ""; cookClaimCode := "";
    ignore Timer.setTimer<system>(#seconds 0, func() : async () { try { await runCook<system>(id, hubR, vaultR) } catch (e) { finishJob(id, false, "trapped: " # Error.message(e)) } });
    { ok = true; jobId = id; detail = "" };
  };
  /// the result, for the person who cooked — hub URL and the one-time claim code (an update call, so the reply is certified;
  /// once the hub reports the code as used, the kitchen forgets it)
  /// Recover progress after reload without exposing another installer's job.
  public shared query ({ caller }) func myCook() : async ?Job {
    if (Principal.toText(caller) != cookBy or cookJob == 0) return null;
    jobs.get(cookJob);
  };
  type HubClaim = actor { claimNeedsCode : shared () -> async Bool };
  public shared ({ caller }) func cookResult() : async ?{ hubUrl : Text; claimCode : Text; jobId : Nat } {
    let expectedJob = cookJob;
    if (cookHubUrl == "" or Principal.toText(caller) != cookBy) return null;
    if (cookClaimCode != "" and hubId != "") {
      let hub : HubClaim = actor (hubId);
      let needs = try { await hub.claimNeedsCode() } catch (_) { true };
      if (cookJob != expectedJob or Principal.toText(caller) != cookBy) return null;
      if (not needs) cookClaimCode := "";
    };
    if (cookJob != expectedJob or Principal.toText(caller) != cookBy) return null;
    ?{ hubUrl = cookHubUrl; claimCode = cookClaimCode; jobId = cookJob };
  };
  func runCook<system>(jobId : Nat, hubR : Recipe, vaultR : ?Recipe) : async () {
    setStep(jobId, "read recipes", "ok", "hub " # hubR.version # (switch (vaultR) { case (?v) ", vault " # v.version; case null ", no vault recipe — the stack will have no backups until you add one" }));
    try {
      let source : Release.Assets = actor (pantryId<system>());
      for (r in [hubR, (vaultR ?? { throw Error.reject("Backup release missing") })].values()) {
        let wasm = await* Release.read(source, "/" # r.backendPath, 48_000_000);
        if (Release.hex(Release.digest(wasm)) != r.backendSha) throw Error.reject("Release checksum mismatch: " # r.id);
      };
      let frontendWasm = await* Release.read(source, "/" # hubR.frontendWasm, 48_000_000);
      if (Release.hex(Release.digest(frontendWasm)) != hubR.frontendSha) throw Error.reject("Frontend module checksum mismatch");
      ignore await* Release.prepare(source, hubR.frontendDir, hubR.files, hubR.patches, []);
    } catch (e) { setStep(jobId, "read recipes", "fail", Error.message(e)); return finishJob(jobId, false, "Release verification failed before creating any services") };
    let src = pantry<system>();
    let mine = await myControllers();
    if (mine.size() == 0) { setStep(jobId, "create vault", "fail", "could not read the kitchen's own controllers"); return finishJob(jobId, false, "controllers unknown") };
    let base = List.fromArray<Principal>(mine); List.add(base, me());
    // 1 · vault (controllers: deployer + kitchen)
    var vaultT = "";
    switch (vaultR) {
      case (?v) {
        let vp = switch (await stepP(jobId, "create vault", func() : async Principal = async { await createCanister(List.toArray(base)) })) { case (?p) p; case null return finishJob(jobId, false, "create vault failed") };
        vaultT := Principal.toText(vp);
        let ok = await stepT(jobId, "install vault", func() : async Text = async {
          let (wasm, _, _) = switch (await* readAsset(src, "/" # v.backendPath)) { case (?x) x; case null throw Error.reject("pantry has no " # v.backendPath) };
          await installModule(vp, wasm, v.backendSha, #install, CANDID_NOARGS);
        });
        if (ok == null) return finishJob(jobId, false, "install vault failed");
        List.add(base, vp); // the vault co-controls the hub from birth
      };
      case null { setStep(jobId, "create vault", "skip", "no vault recipe"); setStep(jobId, "install vault", "skip", "") };
    };
    let ctrls = List.toArray(base);
    // the claim code is born BEFORE the hub: planted as env var at creation, the very first message the hub handles is protected
    let code = hex(await ic.raw_rand()); // 256 bits, one-time, shown only to the cook
    func failCook(jobId : Nat, why : Text, be : Text, fe : Text) {
      if (vaultT != "") Map.add(installed, Text.compare, "vault", { recipeId = "vault"; version = "?"; backend = vaultT; frontend = ""; installedAt = now(); updatedAt = now(); connectorId = 0; tileId = 0; adopted = false; state = "failed" });
      if (be != "") Map.add(installed, Text.compare, "hub", { recipeId = "hub"; version = "?"; backend = be; frontend = fe; installedAt = now(); updatedAt = now(); connectorId = 0; tileId = 0; adopted = false; state = "failed" });
      finishJob(jobId, false, why);
    };
    // 2 · hub backend + frontend
    let be = switch (await stepP(jobId, "create hub backend", func() : async Principal = async {
      (await ic.create_canister({ settings = ?settingsWith(?ctrls, ?[{ name = "KEBAB_CLAIM_CODE"; value = code }]); sender_canister_version = null })).canister_id;
    })) { case (?p) p; case null return failCook(jobId, "create hub backend failed", "", "") };
    let beOk = await stepT(jobId, "install hub backend", func() : async Text = async {
      let (wasm, _, _) = switch (await* readAsset(src, "/" # hubR.backendPath)) { case (?x) x; case null throw Error.reject("pantry has no " # hubR.backendPath) };
      await installModule(be, wasm, hubR.backendSha, #install, CANDID_NOARGS);
    });
    if (beOk == null) return failCook(jobId, "install hub backend failed", Principal.toText(be), "");
    let fe = switch (await stepP(jobId, "create hub frontend", func() : async Principal = async { await createCanister(ctrls) })) { case (?p) p; case null return failCook(jobId, "create hub frontend failed", Principal.toText(be), "") };
    let feOk = await stepT(jobId, "install hub frontend", func() : async Text = async {
      let (wasm, _, _) = switch (await* readAsset(src, "/" # hubR.frontendWasm)) { case (?x) x; case null throw Error.reject("pantry has no " # hubR.frontendWasm) };
      await installModule(fe, wasm, hubR.frontendSha, #install, CANDID_NOARGS);
    });
    let beT = Principal.toText(be); let feT = Principal.toText(fe);
    if (feOk == null) return failCook(jobId, "install hub frontend failed", beT, feT);
    let vars : [(Text, Text)] = [("backend", beT), ("frontend", feT), ("hubId", beT), ("hubUrl", gatewayUrl(feT)), ("frontendUrl", gatewayUrl(feT))];
    let cp = await stepT(jobId, "copy hub frontend files", func() : async Text = async { await copyFrontend<system>(hubR, fe, vars) });
    if (cp == null) return failCook(jobId, "copy hub frontend files failed", beT, feT);
    // 3 · wiring
    if (vaultT != "") {
      let vault : VaultAPI = actor (vaultT);
      let w = await stepT(jobId, "wire the vault", func() : async Text = async {
        let a = await vault.setHub(beT); if (not a.ok) throw Error.reject("setHub: " # a.detail);
        let b = await vault.setKitchen(Principal.toText(me())); if (not b.ok) throw Error.reject("setKitchen: " # b.detail);
        "vault knows hub and kitchen";
      });
      if (w == null) return failCook(jobId, "wire the vault failed", beT, feT);
    } else setStep(jobId, "wire the vault", "skip", "no vault");
    let hub : HubBoot = actor (beT);
    let wh = await stepT(jobId, "wire the hub", func() : async Text = async {
      let r = await hub.bootstrapWire({ vaultId = vaultT; kitchenId = Principal.toText(me()); claimCode = code });
      if (not r.ok) throw Error.reject(r.detail);
      "hub knows vault and kitchen; claim code confirmed";
    });
    if (wh == null) return failCook(jobId, "wire the hub failed", beT, feT);
    // a superseded cook (30-min guard fired, a newer one started) must not take over
    if (cookJob != jobId or hubId != "") return finishJob(jobId, false, "superseded by a newer job");
    // COMMIT now — everything after this is best effort and must not lose the code
    hubId := beT;
    cookHubUrl := gatewayUrl(feT); cookClaimCode := code;
    Map.add(installed, Text.compare, "hub", { recipeId = "hub"; version = hubR.version; backend = beT; frontend = feT; installedAt = now(); updatedAt = now(); connectorId = 0; tileId = 0; adopted = false; state = "ok" });
    switch (vaultR) { case (?v) Map.add(installed, Text.compare, "vault", { recipeId = "vault"; version = v.version; backend = vaultT; frontend = ""; installedAt = now(); updatedAt = now(); connectorId = 0; tileId = 0; adopted = false; state = "ok" }); case null {} };
    if (vaultT != "") {
      let vault : VaultAPI = actor (vaultT);
      ignore await stepT(jobId, "protect with the vault", func() : async Text = async {
        let a = await vault.addTarget(beT, "hub · backend", "hub-backend"); let b = await vault.addTarget(feT, "hub · frontend", "hub-frontend");
        if (not a.ok or not b.ok) throw Error.reject(a.detail # " " # b.detail);
        "hub canisters registered; " # (await seedSchedule(vault, beT));
      });
    } else setStep(jobId, "protect with the vault", "skip", "no vault");
    ignore await stepT(jobId, "console labels", func() : async Text = async {
      await setMeta(be, "kebab-stack hub", "Backend", false, "", be, fe); await setMeta(fe, "kebab-stack hub", "Frontend", true, gatewayUrl(feT), be, fe);
      switch (principalSafe(vaultT)) { case (?vp) await setMeta(vp, "kebab-stack vault", "Vault", true, "", vp, vp); case null {} };
      "__META_* set";
    });
    setStep(jobId, "claim code", "ok", "ready — open your hub and claim it with the code shown on this page");
    finishJob(jobId, true, "");
  };

  /// Register canisters that were deployed by hand as an installed recipe, so
  /// the kitchen can update them from now on. Requires the kitchen to be a
  /// controller of both (add-controller once, like for the vault).
  public shared ({ caller }) func adopt(recipeId : Text, backend : Text, frontend : Text, version : Text) : async { ok : Bool; detail : Text } {
    if (not (await isOwner(caller, true))) return { ok = false; detail = "owners only" };
    let r = switch (recipeById(await loadRecipes<system>(), recipeId)) { case (?r) r; case null return { ok = false; detail = "no such recipe" } };
    if (r.kind == "hub") return { ok = false; detail = "the hub is updated from its own card, not adopted" };
    let isService = r.kind == "service";
    let b = switch (principalSafe(backend)) { case (?p) p; case null return { ok = false; detail = "backend: not a canister id" } };
    let fOpt = principalSafe(frontend);
    if (not isService and fOpt == null) return { ok = false; detail = "frontend: not a canister id" };
    if (Principal.toText(b) == hubId) return { ok = false; detail = "that is the hub backend" };
    let both = switch (fOpt) { case (?f) [b, f]; case null [b] };
    for (p in both.vals()) {
      let i = try { await ic.canister_info({ canister_id = p; num_requested_changes = null }) } catch (_) { return { ok = false; detail = "cannot read " # Principal.toText(p) } };
      if (Array.find<Principal>(i.controllers, func(c) = c == me()) == null) return { ok = false; detail = "the kitchen is not a controller of " # Principal.toText(p) # " — run: icp canister settings update " # Principal.toText(p) # " -n ic --add-controller " # Principal.toText(me()) # " -f" };
    };
    if (isService) {
      // no hub_ping on services: the running module must be the recipe's module
      let sha = await runningHash(Principal.toText(b));
      if (sha != r.backendSha) return { ok = false; detail = "that canister runs a different module than the recipe (" # sha # " vs " # r.backendSha # ") — update it by hand first, then adopt" };
    } else {
      // the backend must be what the recipe says it is — its hub_ping slug is the recipe id
      let ping : HubPing = actor (Principal.toText(b));
      let slug = try { await ping.hub_ping() } catch (_) { return { ok = false; detail = "the backend does not answer hub_ping — is this the app's backend canister?" } };
      if (Text.toLower(norm(slug)) != Text.toLower(recipeId)) return { ok = false; detail = "that backend says it is \"" # slug # "\", not \"" # recipeId # "\"" };
    };
    Map.add(installed, Text.compare, recipeId, { recipeId; version = (if (norm(version) == "") r.version else norm(version)); backend = Principal.toText(b); frontend = (if (isService) "" else (switch (fOpt) { case (?f) Principal.toText(f); case null "" })); installedAt = now(); updatedAt = now(); connectorId = 0; tileId = 0; adopted = true; state = "ok" });
    log(Principal.toText(caller), "adopted " # recipeId # " " # norm(version) # " (" # Principal.toText(b) # (switch (fOpt) { case (?f) ", " # Principal.toText(f); case null "" }) # ")", true);
    { ok = true; detail = "" };
  };
  public shared ({ caller }) func forget(recipeId : Text) : async { ok : Bool; detail : Text } {
    if (not (await isOwner(caller, true))) return { ok = false; detail = "owners only" };
    ignore Map.delete(installed, Text.compare, recipeId);
    log(Principal.toText(caller), "forgot " # recipeId # " (canisters untouched)", true);
    { ok = true; detail = "" };
  };
};
