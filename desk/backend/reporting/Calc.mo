import T "Types";
import Text "mo:core/Text";
import Int "mo:core/Int";
import Nat "mo:core/Nat";
import Array "mo:core/Array";
module {
  public func seconds(r : T.Record) : Nat = if (r.kind == #adjustment) 0 else Int.abs((r.endAt - r.startAt) / 1_000_000_000) - r.breakMinutes * 60;
  public func amount(seconds : Nat, rate : Nat) : Nat = (seconds * rate + 1800) / 3600;
  public func decimal(n : Int, digits : Nat) : Text {
    let scale = 10 ** digits;let value = Int.abs(n);let whole = (value / scale).toText();
    if (digits == 0) return (if (n < 0) "-" else "") # whole;
    var fraction = (value % scale).toText();while (fraction.size() < digits) fraction := "0" # fraction;
    (if (n < 0) "-" else "") # whole # "." # fraction
  };
  public func cell(raw : Text) : Text {
    let trimmed = raw.trimStart(#predicate(func c = c == ' ' or c == '\t' or c == '\r' or c == '\n'));
    let dangerous = trimmed.startsWith(#text "=") or trimmed.startsWith(#text "+") or trimmed.startsWith(#text "-") or trimmed.startsWith(#text "@") or raw.startsWith(#text "\t") or raw.startsWith(#text "\r");
    "\"" # (if (dangerous) "'" else "") # raw.replace(#text "\"", "\"\"") # "\""
  };
  public func csv(p : T.Period) : Text {
    var out = "\u{feff}batch_id,adjustment_of,period,project_id,timezone,person_id,payroll_id,name,pay_item,unit,quantity,rate,amount,currency,cost_center,approval_revision,approved_at_ms\r\n";
    for (l in p.lines.values()) {
      let adjustment = l.kind == #adjustment;
      let fields = [cell(p.batchId),if (p.adjustmentOf == 0) "" else p.adjustmentOf.toText(),cell(p.title),p.projectId.toText(),cell(p.timezone),cell(l.personId),cell(l.payrollId),cell(l.name),cell(l.code),if (adjustment) "amount" else "hours",if (adjustment) "1" else decimal((l.seconds * 1_000_000 + 1800) / 3600, 6),decimal(l.rate, l.decimals),decimal(l.amount, l.decimals),cell(l.currency),cell(l.costCenter),p.revision.toText(),(p.approvedAt / 1_000_000).toText()];
      out #= Text.join(fields.values(), ",") # "\r\n"
    };out
  };
}
