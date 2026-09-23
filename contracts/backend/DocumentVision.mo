import Array "mo:core/Array";
import Blob "mo:core/Blob";
import Nat8 "mo:core/Nat8";
import Text "mo:core/Text";

/// Original files go to the configured provider, never to a public document URL.
module {
  public func supported(mime : Text) : Bool = mime == "application/pdf" or mime == "image/png" or mime == "image/jpeg" or mime == "image/webp" or mime == "image/gif";
  public func base64(bytes : Blob) : Text {
    let a = Blob.toArray(bytes);
    let alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/".toArray();
    Text.fromIter(Array.tabulate<Char>((a.size() + 2) / 3 * 4, func i {
      let p = i / 4 * 3;
      let x = Nat8.toNat(a[p]);
      let y = if (p + 1 < a.size()) Nat8.toNat(a[p + 1]) else 0;
      let z = if (p + 2 < a.size()) Nat8.toNat(a[p + 2]) else 0;
      switch (i % 4) {
        case (0) alphabet[x / 4];
        case (1) alphabet[(x % 4) * 16 + y / 16];
        case (2) { if (p + 1 < a.size()) alphabet[(y % 16) * 4 + z / 64] else '=' };
        case (_) { if (p + 2 < a.size()) alphabet[z % 64] else '=' };
      };
    }).vals());
  };
}
