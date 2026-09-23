import Rsa "../backend/Rsa";
import Nat "mo:core/Nat";
import Nat8 "mo:core/Nat8";
import Nat64 "mo:core/Nat64";
import Array "mo:core/Array";
import Debug "mo:core/Debug";
import Sha256 "mo:sha2@0/Sha256";
import Blob "mo:core/Blob";
import Text "mo:core/Text";

// deterministic pseudo-randomness for the test (xorshift64*)
var st : Nat64 = 0x9E3779B97F4A7C15;
func rndBytes(n : Nat) : [Nat8] {
  Array.tabulate<Nat8>(n, func(_) { st ^= st >> 12; st ^= st << 25; st ^= st >> 27; Nat8.fromNat(Nat64.toNat((st *% 0x2545F4914F6CDD1D) >> 56)) });
};
// bignum sanity
assert Rsa.modPow(4, 13, 497) == 445;
assert Rsa.modInverse(3, 11) == 4;
assert Rsa.modInverse(17, 3120) == 2753; // classic textbook
assert Rsa.gcd(48, 18) == 6;
assert Rsa.toBytes(0x0102, 4) == [0, 0, 1, 2];
assert Rsa.fromBytes([1, 0]) == 256;
assert Rsa.mrRound(104729, 2) and not Rsa.mrRound(561, 7);
// key generation, small (bits per prime given by arg)
func genKey(bits : Nat) : Rsa.Key {
  var g = Rsa.newGen(bits); var steps = 0;
  while (not g.done) { g := Rsa.step(g, rndBytes(bits / 8 + 32), 40); steps += 1; assert steps < 10000 };
  Debug.print("bits=" # Nat.toText(bits) # " steps=" # Nat.toText(steps) # " tried=" # Nat.toText(g.tried));
  switch (Rsa.finish(g, "test", 0)) { case (?k) k; case null { assert false; loop {} } };
};
let k256 = genKey(256); // 512-bit modulus: smallest that fits EMSA (k ≥ 62 bytes)
assert Rsa.keyBytes(k256) == 64;
let msg = Text.encodeUtf8("eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIxIn0");
let h = Blob.toArray(Sha256.fromIter(#sha256, msg.vals()));
let sig = Rsa.signDigest(k256, h);
assert sig.size() == 64;
assert not Rsa.verifyDigest(k256.n, k256.e, h, sig); // production verification refuses weak keys
let h2 = Array.tabulate<Nat8>(32, func(i) = if (i == 0) h[0] ^ 1 else h[i]);
assert not Rsa.verifyDigest(k256.n, k256.e, h2, sig);
// textbook check: s^e mod n == EM
assert Rsa.modPow(Rsa.fromBytes(sig), k256.e, k256.n) == Rsa.fromBytes(Rsa.emsaEncode(h, 64));
// full-size key → print JWK parts + signature for an external (node) verification
let k = genKey(1024);
assert Rsa.keyBytes(k) == 256;
let sigFull = Rsa.signDigest(k, h);
assert Rsa.verifyDigest(k.n, k.e, h, sigFull);
assert not Rsa.verifyDigest(k.n, k.e, h2, sigFull);
assert not Rsa.verifyDigest(k.n, 3, h, sigFull);
assert not Rsa.verifyDigest(k.n, k.e, [], sigFull);
assert not Rsa.verifyDigest(k.n, k.e, h, Rsa.toBytes(k.n, 256));
func hex(a : [Nat8]) : Text { var t = ""; for (b in a.vals()) { let v = Nat8.toNat(b); let d = "0123456789abcdef"; let cs = Text.toArray(d); t #= Text.fromChar(cs[v / 16]) # Text.fromChar(cs[v % 16]) }; t };
Debug.print("N=" # hex(Rsa.toBytes(k.n, 256)));
Debug.print("SIG=" # hex(sigFull));
Debug.print("OK");
