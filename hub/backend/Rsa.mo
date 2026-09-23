/// RSA for the OIDC provider: RS256 (RSASSA-PKCS1-v1_5 with SHA-256) signing
/// and 2048-bit key generation, on Motoko's Nat (libtommath). No external
/// library signs RSA in Motoko today, so this module does — and nothing else.
///
/// Measured on a cloud engine (hub/probe-rsa, 2026-09-03): one CRT signature
/// ≈ 0.7 B instructions; a 1024-bit prime costs ≈ 25 B on average, so key
/// generation is RESUMABLE — `step` tests a bounded number of candidates per
/// call and the hub drives it from a timer until `done`.
///
/// All state types are plain data (Nat, [Nat8], Bool, Text) so they can live
/// in stable variables.
import Nat "mo:core/Nat";
import Nat8 "mo:core/Nat8";
import Int "mo:core/Int";
import Array "mo:core/Array";
import VarArray "mo:core/VarArray";
import List "mo:core/List";
import Text "mo:core/Text";
import Blob "mo:core/Blob";
import Sha256 "mo:sha2/Sha256";

module {
  // ------------------------------------------------------------------ types
  public type Key = {
    n : Nat; e : Nat; d : Nat;
    p : Nat; q : Nat; dp : Nat; dq : Nat; qinv : Nat; // CRT
    kid : Text; createdAt : Int;
  };
  /// resumable generation of two `bits`-bit primes
  public type Gen = {
    bits : Nat;        // per prime (1024 for RSA-2048)
    found : [Nat];     // 0, 1 or 2 primes
    cur : Nat;         // current odd candidate, 0 = start a new one from fresh randomness
    tried : Nat;       // candidates tested so far (all primes)
    done : Bool;
  };
  public let E : Nat = 65537;

  // ---------------------------------------------------------------- bignum
  public func modPow(base : Nat, exp : Nat, m : Nat) : Nat {
    var result : Nat = 1;
    var b = base % m;
    var e = exp;
    while (e > 0) {
      if (e % 2 == 1) result := (result * b) % m;
      e := Nat.bitshiftRight(e, 1);
      b := (b * b) % m;
    };
    result;
  };
  /// a^-1 mod m (extended Euclid); traps if not invertible — callers check gcd first
  public func modInverse(a : Nat, m : Nat) : Nat {
    var old_r : Int = a; var r : Int = m;
    var old_s : Int = 1; var s : Int = 0;
    while (r != 0) {
      let q = old_r / r;
      let tr = old_r - q * r; old_r := r; r := tr;
      let ts = old_s - q * s; old_s := s; s := ts;
    };
    assert old_r == 1;
    let v = old_s % m; // Int % keeps the sign of the dividend
    Int.abs(if (v < 0) v + m else v);
  };
  public func gcd(a : Nat, b : Nat) : Nat { var x = a; var y = b; while (y != 0) { let t = x % y; x := y; y := t }; x };
  public func fromBytes(bytes : [Nat8]) : Nat {
    var n : Nat = 0;
    for (b in bytes.vals()) n := Nat.bitshiftLeft(n, 8) + Nat8.toNat(b);
    n;
  };
  /// big-endian, exactly `len` bytes (left-padded with zeros; traps if it does not fit)
  public func toBytes(n : Nat, len : Nat) : [Nat8] {
    let buf = VarArray.repeat<Nat8>(0, len);
    var x = n; var i = len;
    while (x > 0) { assert i > 0; i -= 1; buf[i] := Nat.toNat8(x % 256); x := Nat.bitshiftRight(x, 8) };
    VarArray.toArray(buf);
  };
  func bitLen(n : Nat) : Nat { var x = n; var c = 0; while (x > 0) { x := Nat.bitshiftRight(x, 1); c += 1 }; c };
  // set a single power-of-two bit
  func setBit(n : Nat, bit : Nat) : Nat = if (n / bit % 2 == 1) n else n + bit;

  // ------------------------------------------------------------- primality
  let SMALL_PRIMES : [Nat] = [3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89, 97, 101, 103, 107, 109, 113, 127, 131, 137, 139, 149, 151, 157, 163, 167, 173, 179, 181, 191, 193, 197, 199, 211, 223, 227, 229, 233, 239, 241, 251, 257, 263, 269, 271, 277, 281, 283, 293, 307, 311, 313, 317, 331, 337, 347, 349, 353, 359, 367, 373, 379, 383, 389, 397, 401, 409, 419, 421, 431, 433, 439, 443, 449, 457, 461, 463, 467, 479, 487, 491, 499, 503, 509, 521, 523, 541, 547, 557, 563, 569, 571, 577, 587, 593, 599, 601, 607, 613, 617, 619, 631, 641, 643, 647, 653, 659, 661, 673, 677, 683, 691, 701, 709, 719, 727, 733, 739, 743, 751, 757, 761, 769, 773, 787, 797, 809, 811, 821, 823, 827, 829, 839, 853, 857, 859, 863, 877, 881, 883, 887, 907, 911, 919, 929, 937, 941, 947, 953, 967, 971, 977, 983, 991, 997];
  func sieve(n : Nat) : Bool { for (p in SMALL_PRIMES.vals()) { if (n == p) return true; if (n % p == 0) return false }; true };
  /// one Miller-Rabin round with witness a (2 ≤ a ≤ n-2)
  public func mrRound(n : Nat, a : Nat) : Bool {
    var d : Nat = n - 1; var r = 0;
    while (d % 2 == 0) { d := Nat.bitshiftRight(d, 1); r += 1 };
    var x = modPow(a, d, n);
    if (x == 1 or x == n - 1) return true;
    var i = 1;
    while (i < r) { x := (x * x) % n; if (x == n - 1) return true; i += 1 };
    false;
  };
  /// sieve, then `rounds` Miller-Rabin rounds, each witness hashed from `rnd` and the round index
  /// (the candidate itself is random; the witnesses must be independent of each other, which a hash gives)
  public func isProbablePrime(n : Nat, rounds : Nat, rnd : [Nat8]) : Bool {
    if (n < 4) return n == 2 or n == 3;
    if (n % 2 == 0) return false;
    if (not sieve(n)) return false;
    var k = 0;
    while (k < rounds) {
      // each witness from its own hash: sha256(rnd ‖ k) — independent, not an arithmetic progression of one seed
      let a = 2 + fromBytes(Blob.toArray(Sha256.fromIter(#sha256, Array.concat<Nat8>(rnd, [Nat.toNat8(k % 256), Nat.toNat8(k / 256 % 256)]).vals()))) % (n - 3);
      if (not mrRound(n, a)) return false;
      k += 1;
    };
    true;
  };

  // --------------------------------------------------------- key generation
  public func newGen(bits : Nat) : Gen = { bits; found = []; cur = 0; tried = 0; done = false };

  /// Test at most `maxCandidates` odd candidates. `rnd` must hold at least
  /// bits/8 + 32 fresh random bytes (used to start a candidate and as MR witnesses).
  /// Returns the advanced state; the caller persists it and calls again until `done`.
  public func step(g : Gen, rnd : [Nat8], maxCandidates : Nat) : Gen {
    if (g.done) return g;
    let need = g.bits / 8;
    assert rnd.size() >= need + 32;
    let witnessBytes = Array.sliceToArray<Nat8>(rnd, need, need + 32);
    var cur = g.cur;
    if (cur == 0) {
      // fresh candidate: exactly `bits` bits with the TOP TWO bits set (so p·q has 2·bits bits), odd
      cur := fromBytes(Array.sliceToArray<Nat8>(rnd, 0, need));
      cur := setBit(cur, Nat.bitshiftLeft(1, Nat.toNat32(g.bits - 1)));
      cur := setBit(cur, Nat.bitshiftLeft(1, Nat.toNat32(g.bits - 2)));
      if (cur % 2 == 0) cur += 1;
    };
    var found = g.found; var tried = g.tried; var i = 0; var done = false;
    label scan while (i < maxCandidates) {
      i += 1; tried += 1;
      if (isProbablePrime(cur, 8, witnessBytes) and (cur - 1) % E != 0 and not contains(found, cur)) {
        found := Array.concat(found, [cur]);
        if (found.size() == 2) { done := true; cur := 0; break scan };
        cur := 0; break scan; // next prime starts from fresh randomness
      };
      cur += 2;
      if (bitLen(cur) > g.bits) { cur := 0; break scan }; // ran off the top — restart from randomness
    };
    { bits = g.bits; found; cur; tried; done };
  };
  func contains(a : [Nat], x : Nat) : Bool { for (v in a.vals()) if (v == x) return true; false };

  /// Turn two primes into a full key. Fails (null) if the primes do not yield a usable key.
  public func finish(g : Gen, kid : Text, createdAt : Int) : ?Key {
    if (not g.done or g.found.size() != 2) return null;
    let p = g.found[0]; let q = g.found[1];
    if (p == q) return null;
    let n = p * q;
    if (bitLen(n) != 2 * g.bits) return null;
    let phi = (p - 1) * (q - 1);
    if (gcd(E, phi) != 1) return null;
    let d = modInverse(E, phi);
    ?{ n; e = E; d; p; q; dp = d % (p - 1); dq = d % (q - 1); qinv = modInverse(q, p); kid; createdAt };
  };

  // ------------------------------------------------------------ RS256 sign
  /// DigestInfo prefix for SHA-256 (RFC 8017 § 9.2 note 1)
  let SHA256_PREFIX : [Nat8] = [0x30, 0x31, 0x30, 0x0d, 0x06, 0x09, 0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x01, 0x05, 0x00, 0x04, 0x20];

  /// EMSA-PKCS1-v1_5 encoding of a SHA-256 digest to k bytes: 00 01 FF..FF 00 DigestInfo
  public func emsaEncode(hash32 : [Nat8], k : Nat) : [Nat8] {
    assert hash32.size() == 32;
    let tLen = SHA256_PREFIX.size() + 32; // 51
    assert k >= tLen + 11;
    let psLen : Nat = k - tLen - 3;
    let out = List.empty<Nat8>();
    List.add(out, 0x00 : Nat8); List.add(out, 0x01 : Nat8);
    var i = 0; while (i < psLen) { List.add(out, 0xff : Nat8); i += 1 };
    List.add(out, 0x00 : Nat8);
    for (b in SHA256_PREFIX.vals()) List.add(out, b);
    for (b in hash32.vals()) List.add(out, b);
    List.toArray(out);
  };
  /// modulus length in bytes (256 for RSA-2048)
  public func keyBytes(key : Key) : Nat = (bitLen(key.n) + 7) / 8;

  /// RS256 signature over an already-computed SHA-256 digest, via CRT. Returns k bytes.
  public func signDigest(key : Key, hash32 : [Nat8]) : [Nat8] {
    let k = keyBytes(key);
    let m = fromBytes(emsaEncode(hash32, k));
    let m1 = modPow(m, key.dp, key.p);
    let m2 = modPow(m, key.dq, key.q);
    // h = qinv · (m1 − m2) mod p, computed without negatives
    let diff = (m1 + key.p - (m2 % key.p)) % key.p;
    let h = (key.qinv * diff) % key.p;
    let s = m2 + h * key.q;
    toBytes(s, k);
  };
  /// verification (used by tests and by the self-check after key generation)
  public func verifyDigest(n : Nat, e : Nat, hash32 : [Nat8], sig : [Nat8]) : Bool {
    let bits = bitLen(n);
    if (bits < 2048 or bits > 4096 or e != E or hash32.size() != 32) return false;
    let k = (bits + 7) / 8;
    if (sig.size() != k or fromBytes(sig) >= n) return false;
    let m = modPow(fromBytes(sig), e, n);
    Array.equal<Nat8>(toBytes(m, k), emsaEncode(hash32, k), Nat8.equal);
  };
};
