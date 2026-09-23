// A release changes visible frontend content in one asset-canister batch.
// This module owns no persistent state; deployment jobs remain in the installer.
import Array "mo:core/Array";
import Blob "mo:core/Blob";
import Char "mo:core/Char";
import Error "mo:core/Error";
import List "mo:core/List";
import Nat "mo:core/Nat";
import Nat8 "mo:core/Nat8";
import Nat64 "mo:core/Nat64";
import Principal "mo:core/Principal";
import Text "mo:core/Text";
import Sha256 "mo:sha2/Sha256";

module {
  public type File = { key : Text; contentType : Text; sha256 : Text; size : Nat; gzip : ?{ sha256 : Text; size : Nat } };
  public type Patch = { file : Text; from : Text; to : Text };
  public type Encoding = { content_encoding : Text; sha256 : ?Blob; length : Nat; modified : Int };
  public type Asset = { key : Text; content_type : Text; encodings : [Encoding]; max_age : ?Nat64; headers : ?[(Text, Text)]; allow_raw_access : ?Bool; is_aliased : ?Bool };
  public type Permission = { #Prepare; #Commit; #ManagePermissions };
  public type Operation = {
    #CreateAsset : { key : Text; content_type : Text; max_age : ?Nat64; headers : ?[(Text, Text)]; enable_aliasing : ?Bool; allow_raw_access : ?Bool };
    #SetAssetContent : { key : Text; content_encoding : Text; chunk_ids : [Nat]; last_chunk : ?Blob; sha256 : ?Blob };
    #UnsetAssetContent : { key : Text; content_encoding : Text };
  };
  public type Assets = actor {
    get : shared query { key : Text; accept_encodings : [Text] } -> async { content : Blob; content_type : Text; content_encoding : Text; sha256 : ?Blob; total_length : Nat };
    get_chunk : shared query { key : Text; content_encoding : Text; index : Nat; sha256 : ?Blob } -> async { content : Blob };
    list : shared query { start : ?Nat; length : ?Nat } -> async [Asset];
    create_batch : shared {} -> async { batch_id : Nat };
    create_chunk : shared { batch_id : Nat; content : Blob } -> async { chunk_id : Nat };
    commit_batch : shared { batch_id : Nat; operations : [Operation] } -> async ();
    delete_batch : shared { batch_id : Nat } -> async ();
    grant_permission : shared { to_principal : Principal; permission : Permission } -> async ();
    revoke_permission : shared { of_principal : Principal; permission : Permission } -> async ();
    list_permitted : shared { permission : Permission } -> async [Principal];
  };
  public type Prepared = { key : Text; contentType : Text; content : Blob; hash : Blob; gzip : ?{ content : Blob; hash : Blob } };
  public type Stage = { batch : Nat; target : Principal; uploader : Principal; added : [Permission]; before : [Asset]; operations : [Operation]; files : [Prepared] };
  public func digest(b : Blob) : Blob = Sha256.fromIter(#sha256, b.values());
  public func hex(b : Blob) : Text {
    let digits = "0123456789abcdef".toArray();
    var t = "";
    for (n in b.values()) { t #= digits[Nat8.toNat(n / 16)].toText() # digits[Nat8.toNat(n % 16)].toText() };
    t;
  };
  public func validKey(k : Text) : Bool {
    k.startsWith(#text "/") and not k.contains(#text "..") and not k.contains(#text "?") and not k.contains(#text "#") and not k.contains(#text "\\") and not k.contains(#text "\n")
  };
  public func fill(t : Text, vars : [(Text, Text)]) : Text {
    var result = t;
    for ((key, value) in vars.values()) result := result.replace(#text ("${" # key # "}"), value);
    result;
  };
  public func patched(file : Text, input : Blob, patches : [Patch], vars : [(Text, Text)]) : Blob {
    var output = input;
    for (p in patches.values()) {
      if (p.file == file) {
        let raw = Text.decodeUtf8(output) ?? { return "" };
        output := Text.encodeUtf8(raw.replace(#text (p.from), fill(p.to, vars)));
      };
    };
    output;
  };
  // Keep payloads local: ordinary async replies are limited to 2 MiB.
  public func read(source : Assets, key : Text, limit : Nat) : async* Blob {
    let first = await source.get({ key; accept_encodings = ["identity"] });
    if (first.content_encoding != "identity" or first.total_length > limit) throw Error.reject("Unsupported encoding or oversized release file: " # key);
    let chunks = List.empty<Blob>(); chunks.add(first.content);
    var bytes = first.content.size(); var index = 1;
    while (bytes < first.total_length) {
      let next = (await source.get_chunk({ key; content_encoding = "identity"; index; sha256 = first.sha256 })).content;
      if (next.size() == 0 or bytes + next.size() > first.total_length) throw Error.reject("Incomplete release file: " # key);
      chunks.add(next); bytes += next.size(); index += 1;
    };
    if (bytes != first.total_length) throw Error.reject("Release length mismatch: " # key);
    Array.toBlob(Array.flatten<Nat8>(chunks.toArray().map(func b = Blob.toArray(b))));
  };
  func inventory(dst : Assets) : async* [Asset] {
    let assets = List.empty<Asset>(); var previous : ?Text = null;
    loop {
      // The asset canister caps each list response at 100 entries, including
      // calls without a length. An omitted page can hide existing files.
      let page = await dst.list({ start = ?assets.size(); length = ?100 });
      for (a in page.values()) {
        switch previous { case (?key) { if (Text.compare(a.key, key) != #greater) throw Error.reject("Asset inventory changed during pagination; retry the check") }; case null {} };
        assets.add(a); previous := ?a.key;
      };
      if (page.size() < 100) return assets.toArray();
      if (assets.size() >= 10_000) throw Error.reject("Frontend inventory exceeds the supported size");
    };
  };
  public func prepare(source : Assets, dir : Text, files : [File], patches : [Patch], vars : [(Text, Text)]) : async* [Prepared] {
    if (files.size() == 0 or files.size() > 512) throw Error.reject("Release has no verified frontend file manifest");
    let result = List.empty<Prepared>(); var total = 0;
    for (f in files.values()) {
      if (not validKey(f.key) or f.sha256.size() != 64 or f.size > 32_000_000 or result.any(func x = x.key == f.key)) throw Error.reject("Invalid release file manifest: " # f.key);
      total += f.size; if (total > 128_000_000) throw Error.reject("Release frontend exceeds the supported size");
      let original = await* read(source, "/" # dir # f.key, 32_000_000);
      if (original.size() != f.size or hex(digest(original)) != f.sha256) throw Error.reject("Release file checksum mismatch: " # f.key);
      for (p in patches.values()) if (p.file == f.key) {
        let raw = Text.decodeUtf8(original) ?? { throw Error.reject("Cannot configure non-text release file: " # f.key) };
        if (p.from == "" or not raw.contains(#text (p.from))) throw Error.reject("Release configuration placeholder is missing: " # f.key);
      };
      let content = patched(f.key, original, patches, vars);
      let gzip = switch (f.gzip) {
        case null null;
        case (?g) {
          total += g.size; if (total > 128_000_000) throw Error.reject("Release frontend exceeds the supported size");
          if (patches.any(func p = p.file == f.key)) throw Error.reject("Compressed deployment templates are not supported: " # f.key);
          let bytes = await* read(source, "/" # dir # ".gzip" # f.key, 32_000_000);
          if (bytes.size() != g.size or hex(digest(bytes)) != g.sha256) throw Error.reject("Compressed release checksum mismatch: " # f.key);
          ?{ content = bytes; hash = digest(bytes) };
        };
      };
      result.add({ key = f.key; contentType = f.contentType; content; hash = digest(content); gzip });
    };
    result.toArray();
  };
  func restorePermissions(dst : Assets, uploader : Principal, added : [Permission]) : async* () {
    var errors = "";
    for (permission in added.values()) {
      try { await dst.revoke_permission({ of_principal = uploader; permission }) }
      catch (e) { errors #= "Could not remove temporary upload permission: " # Error.message(e) # " " };
    };
    if (errors != "") throw Error.reject(errors);
  };
  public func stage(target : Principal, uploader : Principal, files : [Prepared]) : async* Stage {
    let dst : Assets = actor (target.toText());
    let before = await* inventory(dst);
    let added = List.empty<Permission>(); var batch : ?Nat = null;
    try {
      for (permission in [#Prepare, #Commit].values()) {
        let current = await dst.list_permitted({ permission });
        if (not current.any(func p = p == uploader)) {
          await dst.grant_permission({ to_principal = uploader; permission }); added.add(permission);
        };
      };
      let id = (await dst.create_batch({})).batch_id; batch := ?id;
      let operations = List.empty<Operation>();
      for (f in files.values()) {
        switch (before.find(func a = a.key == f.key)) {
          case null operations.add(#CreateAsset({ key = f.key; content_type = f.contentType; max_age = ?(0 : Nat64); headers = null; enable_aliasing = null; allow_raw_access = ?false }));
          case (?old) {
            if (old.content_type != f.contentType) throw Error.reject("Content type changed for " # f.key # "; explicit migration is required");
            for (encoding in old.encodings.values()) if (encoding.content_encoding != "identity" and not (encoding.content_encoding == "gzip" and f.gzip != null)) operations.add(#UnsetAssetContent({ key = f.key; content_encoding = encoding.content_encoding }));
          };
        };
        let representations = List.fromArray<(Text, Blob, Blob)>([("identity", f.content, f.hash)]);
        switch (f.gzip) { case (?g) representations.add(("gzip", g.content, g.hash)); case null {} };
        for ((encoding, content, hash) in representations.values()) {
          let bytes = Blob.toArray(content); let chunks = List.empty<Nat>(); var offset = 0;
          while (offset < bytes.size()) {
            let size = Nat.min(1_000_000, bytes.size() - offset);
            let chunk = Array.toBlob(Array.tabulate<Nat8>(size, func i = bytes[offset + i]));
            chunks.add((await dst.create_chunk({ batch_id = id; content = chunk })).chunk_id); offset += size;
          };
          operations.add(#SetAssetContent({ key = f.key; content_encoding = encoding; chunk_ids = chunks.toArray(); last_chunk = if (bytes.size() == 0) ?("" : Blob) else null; sha256 = ?hash }));
        };
      };
      { batch = id; target; uploader; added = added.toArray(); before; operations = operations.toArray(); files };
    } catch (e) {
      switch batch { case (?id) { try { await dst.delete_batch({ batch_id = id }) } catch (_) {} }; case null {} };
      await* restorePermissions(dst, uploader, added.toArray());
      throw e;
    };
  };
  public func commit(s : Stage) : async* () {
    let dst : Assets = actor (s.target.toText());
    let current = await* inventory(dst);
    if (current != s.before) throw Error.reject("Frontend changed during the update; no staged files were published. Recheck before retrying.");
    await dst.commit_batch({ batch_id = s.batch; operations = s.operations });
  };
  public func cleanup(s : Stage) : async* () {
    let dst : Assets = actor (s.target.toText());
    // A successful commit already removed its batch. No visible content is changed.
    try { await dst.delete_batch({ batch_id = s.batch }) } catch (_) {};
    await* restorePermissions(dst, s.uploader, s.added);
  };
  public func matches(target : Principal, files : [Prepared]) : async* Bool {
    let dst : Assets = actor (target.toText());
    let actual = await* inventory(dst);
    for (f in files.values()) {
      let a = actual.find(func x = x.key == f.key) ?? { return false };
      if (a.content_type != f.contentType or a.encodings.size() != (if (f.gzip == null) 1 else 2)) return false;
      let e = a.encodings.find(func e = e.content_encoding == "identity") ?? { return false };
      if (e.sha256 != ?f.hash or e.length != f.content.size()) return false;
      switch (f.gzip) { case null {}; case (?g) {
        let compressed = a.encodings.find(func e = e.content_encoding == "gzip") ?? { return false };
        if (compressed.sha256 != ?g.hash or compressed.length != g.content.size()) return false;
      } };
    };
    true;
  };
  // Status checks read the installed hash inventory, not every application file.
  // Only deployment-specific files need the published template to derive a hash.
  public func matchesManifest(target : Principal, source : Assets, dir : Text, files : [File], patches : [Patch], vars : [(Text, Text)]) : async* Bool {
    let dst : Assets = actor (target.toText());
    let actual = await* inventory(dst);
    for (f in files.values()) {
      let a = actual.find(func x = x.key == f.key) ?? { return false };
      var expected = f.sha256; var length = f.size;
      if (patches.any(func p = p.file == f.key)) {
        let prepared = await* prepare(source, dir, [f], patches, vars);
        expected := hex(prepared[0].hash); length := prepared[0].content.size();
      };
      if (a.content_type != f.contentType or a.encodings.size() != (if (f.gzip == null) 1 else 2)) return false;
      let e = a.encodings.find(func e = e.content_encoding == "identity") ?? { return false };
      let hash = e.sha256 ?? { return false };
      if (hex(hash) != expected or e.length != length) return false;
      switch (f.gzip) { case null {}; case (?g) {
        let compressed = a.encodings.find(func e = e.content_encoding == "gzip") ?? { return false };
        let compressedHash = compressed.sha256 ?? { return false };
        if (hex(compressedHash) != g.sha256 or compressed.length != g.size) return false;
      } };
    };
    true;
  };
  // The asset canister regenerates this platform-owned discovery cookie when
  // HTML content changes. All application headers (including other cookies)
  // remain part of the deployment contract.
  func applicationHeaders(headers : ?[(Text, Text)]) : [(Text, Text)] {
    (headers ?? []).filter(func (name, value) = not (Text.toLower(name) == "set-cookie" and value.startsWith(#text "ic_env=")));
  };
  public func verify(s : Stage) : async* () {
    if (not (await* matches(s.target, s.files))) throw Error.reject("Published frontend does not match this release");
    let dst : Assets = actor (s.target.toText());
    let actual = await* inventory(dst);
    for (old in s.before.values()) {
      let a = actual.find(func x = x.key == old.key) ?? { throw Error.reject("Existing deployment asset disappeared: " # old.key) };
      if (applicationHeaders(a.headers) != applicationHeaders(old.headers) or a.max_age != old.max_age or a.allow_raw_access != old.allow_raw_access or a.is_aliased != old.is_aliased) throw Error.reject("Deployment asset settings changed: " # old.key);
    };
  };
}
