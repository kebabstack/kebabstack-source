// Bounded UTF-8 byte-mode QR encoder, ECC M, versions 1–25.
// Algorithm adapted from the vendored qrcode-generator; see Qr-NOTICE.txt.
import Array "mo:core/Array";
import Blob "mo:core/Blob";
import VarArray "mo:core/VarArray";
import List "mo:core/List";
import Text "mo:core/Text";
import Nat "mo:core/Nat";
import Nat8 "mo:core/Nat8";
import Int "mo:core/Int";
import Tables "QrTables";

module {
  func xor(a : Nat, b : Nat) : Nat { var x = a; var y = b; var p = 1; var r = 0; while (x > 0 or y > 0) { if (x % 2 != y % 2) r += p; x /= 2; y /= 2; p *= 2 }; r };
  func mul(a : Nat, b : Nat) : Nat { var x = a; var y = b; var r = 0; while (y > 0) { if (y % 2 == 1) r := xor(r, x); y /= 2; x *= 2; if (x >= 256) x := xor(x, 285) }; r };
  func bit(n : Nat, i : Nat) : Bool = (n / (2 ** i)) % 2 == 1;
  func bch(n : Nat, polynomial : Nat, shift : Nat) : Nat {
    func digits(a : Nat) : Nat { var x = a; var k = 0; while (x > 0) { k += 1; x /= 2 }; k };
    var d = n * (2 ** shift); let pd = digits(polynomial);
    while (digits(d) >= pd) { d := xor(d, polynomial * (2 ** Int.abs(digits(d) - pd))) };
    n * (2 ** shift) + d;
  };
  public func encode(payload : Text) : ?[[Bool]] {
    let input = Text.encodeUtf8(payload).toArray();
    if (input.size() > 997) return null;
    var version = 1; var capacity = 0;
    label choose while (version <= 25) {
      let t = Tables.blocks[version - 1]; capacity := 0; var j = 0;
      while (j < t.size()) { capacity += t[j] * t[j + 2]; j += 3 };
      if (4 + (if (version < 10) 8 else 16) + input.size() * 8 <= capacity * 8) break choose;
      version += 1;
    };
    if (version > 25) return null;
    let bits = List.empty<Bool>();
    func append(n : Nat, width : Nat) { var i = width; while (i > 0) { i -= 1; bits.add(bit(n, i)) } };
    append(4, 4); append(input.size(), if (version < 10) 8 else 16);
    for (byte in input.values()) append(byte.toNat(), 8);
    append(0, Nat.min(4, Int.abs(capacity * 8 - bits.size())));
    while (bits.size() % 8 != 0) bits.add(false);
    let data = List.empty<Nat>(); var p = 0;
    while (p < bits.size()) { var n = 0; var k = 0; while (k < 8) { n := n * 2 + (if (bits.at(p + k)) 1 else 0); k += 1 }; data.add(n); p += 8 };
    var pad = true; while (data.size() < capacity) { data.add(if (pad) 236 else 17); pad := not pad };
    let dc = List.empty<[Nat]>(); let ec = List.empty<[Nat]>();
    let spec = Tables.blocks[version - 1]; var idx = 0; var offset = 0; var maxData = 0; var eccCount = 0;
    while (idx < spec.size()) {
      var block = 0; let count = spec[idx]; let total = spec[idx + 1]; let size = spec[idx + 2];
      eccCount := Int.abs(total - size); maxData := Nat.max(maxData, size);
      // Generator polynomial product (x + alpha^i).
      var gen : [Nat] = [1]; var root = 1; var g = 0;
      while (g < eccCount) { let next = VarArray.repeat<Nat>(0, gen.size() + 1); var k = 0; while (k < gen.size()) { next[k] := xor(next[k], gen[k]); next[k + 1] := xor(next[k + 1], mul(gen[k], root)); k += 1 }; gen := next.toArray(); root := mul(root, 2); g += 1 };
      while (block < count) {
        let bytes = Array.tabulate<Nat>(size, func i = data.at(offset + i)); offset += size;
        let work = VarArray.repeat<Nat>(0, total); var k = 0; while (k < size) { work[k] := bytes[k]; k += 1 };
        k := 0; while (k < size) { let factor = work[k]; var j = 0; while (j < gen.size()) { work[k + j] := xor(work[k + j], mul(gen[j], factor)); j += 1 }; k += 1 };
        dc.add(bytes); ec.add(Array.tabulate<Nat>(eccCount, func i = work[size + i])); block += 1;
      };
      idx += 3;
    };
    let code = List.empty<Nat>(); var i = 0;
    while (i < maxData) { for (b in dc.values()) if (i < b.size()) code.add(b[i]); i += 1 };
    i := 0; while (i < eccCount) { for (b in ec.values()) code.add(b[i]); i += 1 };
    let n = version * 4 + 17;
    let cells = Array.tabulate<[var ?Bool]>(n, func _ = VarArray.repeat<?Bool>(null, n));
    func finder(row : Int, col : Int) { var dy = -1; while (dy <= 7) { var dx = -1; while (dx <= 7) { let y = row + dy; let x = col + dx; if (y >= 0 and x >= 0 and y < n and x < n) cells[Int.abs(y)][Int.abs(x)] := ?((dy >= 0 and dy <= 6 and (dx == 0 or dx == 6)) or (dx >= 0 and dx <= 6 and (dy == 0 or dy == 6)) or (dy >= 2 and dy <= 4 and dx >= 2 and dx <= 4)); dx += 1 }; dy += 1 } };
    finder(0, 0); finder(n - 7, 0); finder(0, n - 7);
    for (y in Tables.alignment[version - 1].values()) for (x in Tables.alignment[version - 1].values()) {
      if (cells[y][x] == null) { var dy = -2; while (dy <= 2) { var dx = -2; while (dx <= 2) { cells[Int.abs(y + dy)][Int.abs(x + dx)] := ?(Int.abs(dy) == 2 or Int.abs(dx) == 2 or (dy == 0 and dx == 0)); dx += 1 }; dy += 1 } };
    };
    i := 8; while (i < n - 8) { if (cells[i][6] == null) cells[i][6] := ?(i % 2 == 0); if (cells[6][i] == null) cells[6][i] := ?(i % 2 == 0); i += 1 };
    // M has format selector 00. Mask 0 is (row + column) mod 2 = 0.
    let format = xor(bch(0, 1335, 10), 21522);
    i := 0; while (i < 15) {
      let value = ?bit(format, i);
      cells[if (i < 6) i else if (i < 8) i + 1 else n - 15 + i][8] := value;
      cells[8][if (i < 8) n - i - 1 else if (i < 9) 15 - i else 14 - i] := value;
      i += 1;
    };
    cells[n - 8][8] := ?true;
    if (version >= 7) { let vbits = bch(version, 7973, 12); i := 0; while (i < 18) { let v = ?bit(vbits, i); cells[i / 3][i % 3 + n - 11] := v; cells[i % 3 + n - 11][i / 3] := v; i += 1 } };
    var row : Int = n - 1; var direction : Int = -1; var col : Int = n - 1; var dataBit = 0;
    while (col > 0) {
      if (col == 6) col -= 1;
      label stripe loop {
        var c = 0; while (c < 2) {
          let x = Int.abs(col - c); let y = Int.abs(row);
          if (cells[y][x] == null) { let dark = if (dataBit / 8 < code.size()) bit(code.at(dataBit / 8), 7 - dataBit % 8) else false; cells[y][x] := ?(dark != ((y + x) % 2 == 0)); dataBit += 1 };
          c += 1;
        };
        row += direction;
        if (row < 0 or row >= n) { row -= direction; direction := -direction; break stripe };
      };
      col -= 2;
    };
    ?Array.tabulate<[Bool]>(n, func y = Array.tabulate<Bool>(n, func x = cells[y][x] ?? false));
  };
};
