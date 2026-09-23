/// Bounded, read-only support context. Never include documents, secrets or message bodies.
import Iter "mo:core/Iter";
import Array "mo:core/Array";
import Nat "mo:core/Nat";
import Text "mo:core/Text";
import Time "mo:core/Time";
module {
  public type Item = { id : Text; kind : Text; title : Text; detail : Text; status : Text; path : Text; historical : Bool };
  public type Context = { state : { #ready; #denied; #unavailable }; items : [Item]; total : Nat; checkedAt : Int };
  public type Source = { cid : Nat; app : Text; name : Text; url : Text };
  public type Event = { seq : Nat; personId : Text; name : Text; email : Text; at : Int; kind : { #deactivated; #reactivated }; source : Text; effectiveActive : Bool };
  public type Batch = { events : [Event]; cursor : Nat; gap : Bool };
  public func denied() : Context { { state = #denied; items = []; total = 0; checkedAt = Time.now() } };
  public func unavailable() : Context { { state = #unavailable; items = []; total = 0; checkedAt = Time.now() } };
  public func brief(t : Text, limit : Nat) : Text { Text.fromIter(t.chars().take(limit)) };
  public func ready(items : [Item]) : Context {
    let sorted = items.filter(func x = not x.historical).concat(items.filter(func x = x.historical));
    { state = #ready; items = Array.tabulate<Item>(Nat.min(100, sorted.size()), func i = { sorted[i] with title = brief(sorted[i].title, 180); detail = brief(sorted[i].detail, 250) }); total = items.size(); checkedAt = Time.now() };
  };
};
