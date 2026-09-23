/// kitchen probe — answers ONE question before the kitchen is built:
/// can a canister on a cloud engine create another canister (no cycles),
/// install code into it, read its status, stop it and delete it?
///
/// Every step is attempted in order; the report lists what happened, with the
/// exact reject text where a step fails. Nothing is left behind on success
/// (the child is deleted); on failure the report names the child id so it
/// can be removed from the Console.
import Principal "mo:core/Principal";
import Text "mo:core/Text";
import Error "mo:core/Error";
import List "mo:core/List";
import Blob "mo:core/Blob";
import Nat64 "mo:core/Nat64";
import Nat "mo:core/Nat";

persistent actor Probe {
  type Settings = { controllers : ?[Principal]; compute_allocation : ?Nat; memory_allocation : ?Nat; freezing_threshold : ?Nat; reserved_cycles_limit : ?Nat; log_visibility : ?{ #controllers; #public_ }; wasm_memory_limit : ?Nat };
  type IC = actor {
    create_canister : shared { settings : ?Settings; sender_canister_version : ?Nat64 } -> async { canister_id : Principal };
    install_code : shared { mode : { #install; #reinstall; #upgrade : ?{ skip_pre_upgrade : ?Bool; wasm_memory_persistence : ?{ #keep; #replace } } }; canister_id : Principal; wasm_module : Blob; arg : Blob; sender_canister_version : ?Nat64 } -> async ();
    canister_status : shared { canister_id : Principal } -> async { status : { #running; #stopping; #stopped }; module_hash : ?Blob; cycles : Nat; settings : { controllers : [Principal] } };
    canister_info : shared { canister_id : Principal; num_requested_changes : ?Nat64 } -> async { controllers : [Principal] };
    stop_canister : shared { canister_id : Principal } -> async ();
    delete_canister : shared { canister_id : Principal } -> async ();
    update_settings : shared { canister_id : Principal; settings : Settings; sender_canister_version : ?Nat64 } -> async ();
  };
  transient let ic : IC = actor "aaaaa-aa";

  // the smallest valid wasm module: magic + version, no sections
  transient let emptyWasm : Blob = "\00\61\73\6D\01\00\00\00";

  var lastReport : Text = "";
  var lastChild : Text = "";

  func step(log : List.List<Text>, name : Text, ok : Bool, detail : Text) { List.add(log, (if (ok) "OK   " else "FAIL ") # name # (if (detail == "") "" else " — " # detail)) };

  /// controller-only (the deployer). Runs the whole cycle and returns the report.
  public shared ({ caller }) func probe() : async Text {
    assert Principal.isController(caller);
    let log = List.empty<Text>();
    let me = Principal.fromActor(Probe);
    // 0 · my own controllers → the child gets them too, so the Console/CLI can always reach it
    var myControllers : [Principal] = [];
    try { let i = await ic.canister_info({ canister_id = me; num_requested_changes = null }); myControllers := i.controllers; step(log, "canister_info(self)", true, Nat.toText(i.controllers.size()) # " controller(s)") }
    catch (e) { step(log, "canister_info(self)", false, Error.message(e)) };
    // 1 · create (no cycles attached — engine rule)
    var child : ?Principal = null;
    try {
      let ctrls = List.fromArray<Principal>(myControllers); List.add(ctrls, me);
      let r = await ic.create_canister({ settings = ?{ controllers = ?List.toArray(ctrls); compute_allocation = null; memory_allocation = null; freezing_threshold = null; reserved_cycles_limit = null; log_visibility = null; wasm_memory_limit = null }; sender_canister_version = null });
      child := ?r.canister_id; lastChild := Principal.toText(r.canister_id);
      step(log, "create_canister", true, Principal.toText(r.canister_id));
    } catch (e) { step(log, "create_canister", false, Error.message(e)) };
    switch (child) {
      case null {};
      case (?c) {
        // 2 · install the empty module
        try { await ic.install_code({ mode = #install; canister_id = c; wasm_module = emptyWasm; arg = ""; sender_canister_version = null }); step(log, "install_code(empty module)", true, "") }
        catch (e) { step(log, "install_code(empty module)", false, Error.message(e)) };
        // 3 · status
        try { let s = await ic.canister_status({ canister_id = c }); step(log, "canister_status", true, (switch (s.status) { case (#running) "running"; case (#stopping) "stopping"; case (#stopped) "stopped" }) # ", cycles " # Nat.toText(s.cycles) # ", " # Nat.toText(s.settings.controllers.size()) # " controllers") }
        catch (e) { step(log, "canister_status", false, Error.message(e)) };
        // 4 · settings update (add nobody new, just prove the call works)
        try { await ic.update_settings({ canister_id = c; settings = { controllers = null; compute_allocation = null; memory_allocation = null; freezing_threshold = null; reserved_cycles_limit = null; log_visibility = null; wasm_memory_limit = null }; sender_canister_version = null }); step(log, "update_settings", true, "") }
        catch (e) { step(log, "update_settings", false, Error.message(e)) };
        // 5 · stop + delete — leave nothing behind
        try { await ic.stop_canister({ canister_id = c }); step(log, "stop_canister", true, "") } catch (e) { step(log, "stop_canister", false, Error.message(e)) };
        try { await ic.delete_canister({ canister_id = c }); step(log, "delete_canister", true, ""); lastChild := "" } catch (e) { step(log, "delete_canister", false, Error.message(e) # " — remove " # Principal.toText(c) # " from the Console by hand") };
      };
    };
    lastReport := Text.join(List.toArray(log).vals(), "\n");
    lastReport;
  };

  public query func report() : async { report : Text; leftoverChild : Text } { { report = lastReport; leftoverChild = lastChild } };
};
