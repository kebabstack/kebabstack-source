/// Retention configuration is a side table: existing project/ticket state stays compatible.
import Text "mo:core/Text";
module {
  public type Input = { completedDays : Nat; inactiveDays : Nat; noticeUrl : Text };
  public type Policy = Input and { revision : Nat; graceUntil : Int };
  public type Hold = { until : Int; reason : Text };
  // Deliberately excludes names, addresses, content, secrets and free-text reasons.
  public type Erasure = { ticketId : Nat; projectId : Nat; createdAt : Int; deletedAt : Int; reason : Text };
  public func valid(a : Input) : Text {
    if (a.completedDays < 7 or a.completedDays > 730 or a.inactiveDays < 7 or a.inactiveDays > 730) return "Choose 7–730 days for each retention period";
    if (a.noticeUrl == "") return "";
    if (a.noticeUrl.size() > 500 or not a.noticeUrl.startsWith(#text "https://")) return "Privacy notice must be an HTTPS URL (maximum 500 characters)";
    let rest = a.noticeUrl.trimStart(#text "https://");
    if (rest == "" or rest.startsWith(#text "/") or rest.startsWith(#text "?")) return "Privacy notice needs a hostname";
    for (c in a.noticeUrl.chars()) if (c <= ' ' or c == '\\' or c == '@' or c == '<' or c == '>') return "Invalid privacy notice URL";
    "";
  };
}
