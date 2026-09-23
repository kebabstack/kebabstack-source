import Text "mo:core/Text";
import Iter "mo:core/Iter";
import List "mo:core/List";
module {
  public type Policy = { enabled : Bool; owner : Bool; spaceOwners : Bool; hubAdmins : Bool; groups : [Text]; days : [Nat] };
  public let defaultPolicy : Policy = { enabled = true; owner = true; spaceOwners = true; hubAdmins = true; groups = []; days = [90, 60, 30, 7] };
  public type VendorTerms = { url : Text; checkedAt : Int; status : Text; renewalRule : Text; noticeDays : ?Nat; noticeMonths : ?Nat; quote : Text; detail : Text };
  // Public web pages only: no credentials, queries, ports, fragments, IP literals or local hosts.
  public func publicUrl(url : Text) : Bool {
    if (url.size() > 400) return false;
    let rest = Text.stripStart(url, #text "https://") ?? (return false);
    let host = rest.split(#char '/').toArray()[0].toLower();
    if (host.size() < 4 or not host.contains(#char '.') or host.endsWith(#text ".local") or host.endsWith(#text ".internal") or host.endsWith(#text ".localhost") or host.endsWith(#text ".test") or host.endsWith(#text ".invalid") or host.endsWith(#text ".example") or host.endsWith(#text ".onion")) return false;
    if (host.chars().any(func c = not ((c >= 'a' and c <= 'z') or (c >= '0' and c <= '9') or c == '-' or c == '.'))) return false;
    for(part in host.split(#char '.')) if(part=="" or part.startsWith(#text "-") or part.endsWith(#text "-"))return false;
    let domainParts=host.split(#char '.').toArray();let suffix=domainParts[domainParts.size()-1];
    if(suffix.size() < 2 or not suffix.chars().all(func c = c >= 'a' and c <= 'z'))return false;
    if (url.contains(#char '@') or url.contains(#char '?') or url.contains(#char '#') or url.contains(#char '\\') or rest.contains(#char ':')) return false;
    if (host.chars().all(func c = (c >= '0' and c <= '9') or c == '.')) return false;
    for (c in url.chars()) if (c <= ' ' or c == '\u{7f}') return false;
    true
  };
  public func plainHtml(raw : Text) : Text {
    var html=raw;
    for (name in ["script","style"].vals()) {
      let parts=html.split(#text ("<" # name)).toArray();
      html:=parts[0];var i=1;
      while(i < parts.size()) {let ends=parts[i].split(#text ("</" # name # ">" )).toArray();var j=1;while(j < ends.size()){html #= ends[j];j+=1};i+=1}
    };
    let out = List.empty<Char>(); var tag = false;
    for (c in html.chars()) {
      if (c == '<') { tag := true; out.add(' ') }
      else if (c == '>') tag := false
      else if (not tag and out.size() < 60000) out.add(c)
    };
    Text.fromIter(out.values())
  };
}
