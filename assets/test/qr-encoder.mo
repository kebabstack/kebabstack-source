// Independent decoder harness: emit matrices from the real Motoko encoder.
// Run with the pinned moc -r --package core .mops/core@2.6.1/src test/qr-encoder.mo.
import Qr "../backend/lib/Qr";
import Debug "mo:core/Debug";
import Nat "mo:core/Nat";
for (length in [5, 100, 300, 996].values()) {
  var payload = "é"; var i = 1;
  while (i < length) { payload #= "A"; i += 1 };
  switch (Qr.encode(payload)) {
    case null { assert false };
    case (?rows) {
      Debug.print("CASE:" # length.toText());
      for (row in rows.values()) { var line = ""; for (cell in row.values()) line #= (if (cell) "1" else "0"); Debug.print(line) };
    };
  };
};
var tooLong = ""; var n = 0; while (n < 998) { tooLong #= "A"; n += 1 };
assert Qr.encode(tooLong) == null;
