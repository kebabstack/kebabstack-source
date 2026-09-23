import SHA256 "mo:sha2/Sha256";
import Blob "mo:core/Blob";
import Array "mo:core/Array";
import Text "mo:core/Text";
import Nat8 "mo:core/Nat8";
import A "Auth";
module {
  public func hmac(key : Blob, message : Text) : Text {
    let bytes=(if(key.size() > 64)SHA256.fromBlob(#sha256,key) else key).toArray();
    let inner=Array.tabulate<Nat8>(64,func i { (if(i < bytes.size())bytes[i] else 0) ^ 0x36 });
    let outer=Array.tabulate<Nat8>(64,func i { (if(i < bytes.size())bytes[i] else 0) ^ 0x5c });
    let digest=SHA256.fromBlob(#sha256,Blob.fromArray(inner.concat(message.encodeUtf8().toArray())));
    A.hex(SHA256.fromBlob(#sha256,Blob.fromArray(outer.concat(digest.toArray()))))
  }
};
