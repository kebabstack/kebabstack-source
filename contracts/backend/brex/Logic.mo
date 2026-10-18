import T "Types";
import Iter "mo:core/Iter";
import Json "mo:json";
import Text "mo:core/Text";
import Array "mo:core/Array";
import List "mo:core/List";
import Char "mo:core/Char";
import Nat8 "mo:core/Nat8";
import Nat32 "mo:core/Nat32";
import Nat "mo:core/Nat";
import Int "mo:core/Int";
import Blob "mo:core/Blob";
module {
  public let day : Int = 86_400_000_000_000;
  public let maxPayments : Nat = 50_000;
  public func str(j : Json.Json, path : Text) : Text { switch (Json.get(j, path)) { case (?#string(v)) v; case (_) "" } };
  public func integer(j : Json.Json, path : Text) : ?Int { switch (Json.get(j, path)) { case (?#number(#int(v))) ?v; case (_) null } };
  public func parse(body : Text) : ?Json.Json { switch (Json.parse(body)) { case (#ok(j)) ?j; case (#err(_)) null } };
  public func items(j : Json.Json) : ?[Json.Json] { switch (Json.get(j,"items")) { case (?#array(a)) ?a; case (_) null } };
  public func short(t : Text, n : Nat) : Text { Text.fromIter(t.chars().take(n)) };
  public func normalized(t : Text) : Text { Text.fromIter(Text.toLower(t).chars().filter(func c = (c >= 'a' and c <= 'z') or (c >= '0' and c <= '9'))) };
  public func encode(t : Text) : Text {
    let out = List.empty<Text>(); let digits = "0123456789ABCDEF".toArray();
    for (b in Text.encodeUtf8(t).toArray().values()) { let n = b.toNat();
      if ((n >= 65 and n <= 90) or (n >= 97 and n <= 122) or (n >= 48 and n <= 57) or n == 45 or n == 95 or n == 46 or n == 126) out.add(Char.toText(Nat32.toChar(n.toNat32())))
      else out.add("%" # Char.toText(digits[n / 16]) # Char.toText(digits[n % 16]));
    }; out.values().join("")
  };
  public func card(j : Json.Json) : ?T.Card {
    let id = str(j,"id"); if (id == "" or id.size() > 200) return null;
    ?{ id; name = short(str(j,"card_name"),120); lastFour = short(str(j,"last_four"),4); status = short(str(j,"status"),30) }
  };
  public func payment(j : Json.Json) : ?T.Payment {
    let id = str(j,"id"); let cardId = str(j,"card_id"); let date = str(j,"posted_at_date");
    let amountMinor = integer(j,"amount.amount") ?? (return null); let currency = str(j,"amount.currency"); let kind = str(j,"type");
    if (id == "" or id.size() > 200 or cardId == "" or cardId.size() > 200 or date.size() != 10 or currency.size() != 3) return null;
    if (kind != "PURCHASE" and kind != "REFUND" and kind != "CHARGEBACK") return null;
    let description = short(str(j,"description"),300); let name = str(j,"merchant.raw_descriptor");
    let merchant = short(if (name != "") name else description,200);
    ?{ id; cardId; date; amountMinor; currency; kind; description; merchant }
  };
  public func groupKey(space : Text, p : T.Payment) : Text { space # ":" # p.cardId # ":" # p.currency # ":" # encode(p.merchant) };
  public func field(c : T.Contract, name : Text) : Text { switch(c.fields.find(func f = f.name == name)) { case (?f) f.value; case null "" } };
  public func candidates(g : T.Group, contracts : [T.Contract]) : [Nat] {
    let vendor = normalized(g.merchant);
    if (vendor.size() < 3) return [];
    contracts.filter(func c = c.status != "archived" and c.status != "ended" and normalized(c.vendor) == vendor).map(func c = c.id)
  };
  public func classification(s : Text) : T.Classification { switch(s) { case("subscription") #subscription; case("oneTime") #oneTime; case("other") #other; case(_) #unknown } };
  public func question(c : T.Contract) : ?T.Field {
    let questions : [T.Field] = [
      {name="product";value="Which software or plan is this?"},
      {name="interval";value="Is this monthly, quarterly, yearly, a one-time purchase, or usage-based?"},
      {name="amountMinor";value="What is the agreed total price per billing period? Enter the amount in minor units (e.g. 1990 for 19.90), or describe it with AI."},
      {name="currency";value="Which currency is the contract priced in (e.g. CHF, EUR, USD)?"},
      {name="taxBasis";value="Does that contract price include tax (gross), exclude tax (net), or is it unknown?"},
      {name="start";value="When did the contract start? Use YYYY-MM-DD, or skip if unknown."},
      {name="renewalRule";value="Does it renew automatically, manually, never, or have no fixed expiry?"},
      {name="renewalDate";value="When is the next renewal? Use YYYY-MM-DD, or skip if unknown."},
      {name="noticeDays";value="How many days before renewal must you cancel? Skip if the notice is in months or unknown."},
      {name="seats";value="How many licenses are included?"}
    ];
    questions.find(func q = (field(c,q.name)=="" or (q.name=="taxBasis" and field(c,q.name)=="unknown")) and not (field(c,"interval")=="once" and (q.name=="renewalDate" or q.name=="noticeDays")) and not (q.name=="noticeDays" and field(c,"noticeMonths")!=""))
  };
  public let editableFields : [Text] = ["title","vendor","product","interval","amountMinor","currency","taxBasis","start","end","renewalRule","renewalDate","noticeDays","noticeMonths","seats","note"];
  public func safeField(name : Text) : Bool = editableFields.any(func f = f == name);
}
