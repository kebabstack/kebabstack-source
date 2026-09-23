/// RSA feasibility probe for the OIDC provider — answers ONE question before
/// any of it is built: can the hub sign RS256 JWTs and generate its own
/// 2048-bit RSA key in-canister, within the instruction limits of one call?
///
/// Four calls measure, with the real bignum implementation the hub would use:
///   1. one 2048-bit modular exponentiation with a 2048-bit exponent
///      (an RS256 signature without CRT — the worst case),
///   2. one 1024-bit modular exponentiation (the CRT half / one Miller-Rabin round),
///   3. a real prime search at 512 and 1024 bits: how many candidates, how
///      many instructions, so the cost of a 2048-bit key (two 1024-bit primes)
///      can be extrapolated and split across timer ticks if needed.
/// Every number is `InternetComputer.countInstructions`, i.e. what the IC
/// charges — compare against the 40 B per-update-call limit.
import IC "mo:core/InternetComputer";
import Nat "mo:core/Nat";
import Nat64 "mo:core/Nat64";
import Nat8 "mo:core/Nat8";
import Blob "mo:core/Blob";
import List "mo:core/List";

persistent actor RsaProbe {
  transient let ic00 : actor { raw_rand : () -> async Blob } = actor "aaaaa-aa";

  // ---- bignum helpers on Motoko Nat (libtommath under the hood) ----
  func modPow(base : Nat, exp : Nat, m : Nat) : Nat {
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
  func natFromBytes(bytes : [Nat8]) : Nat {
    var n : Nat = 0;
    for (b in bytes.vals()) n := Nat.bitshiftLeft(n, 8) + Nat8.toNat(b);
    n;
  };
  // a random Nat of exactly `bits` bits (top bit set); odd if `odd`
  func randomNat(pool : [Nat8], bits : Nat, odd : Bool) : Nat {
    var n = natFromBytes(Array_sub(pool, bits / 8)); // exactly bits/8 bytes → < 2^bits
    n := natOr(n, Nat.bitshiftLeft(1, Nat.toNat32(bits - 1))); // top bit set → exactly `bits` bits
    if (odd and n % 2 == 0) n += 1;
    n;
  };
  func Array_sub(a : [Nat8], n : Nat) : [Nat8] {
    let out = List.empty<Nat8>();
    var i = 0;
    for (x in a.vals()) { if (i < n) List.add(out, x); i += 1 };
    List.toArray(out);
  };
  // Nat has no bitwise or in core: emulate for a single set bit
  func natOr(n : Nat, bit : Nat) : Nat = if (n / bit % 2 == 1) n else n + bit;

  transient let SMALL_PRIMES : [Nat] = [3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89, 97, 101, 103, 107, 109, 113, 127, 131, 137, 139, 149, 151, 157, 163, 167, 173, 179, 181, 191, 193, 197, 199, 211, 223, 227, 229, 233, 239, 241, 251];
  func sieve(n : Nat) : Bool { for (p in SMALL_PRIMES.vals()) if (n % p == 0) return false; true };
  // one Miller-Rabin round with witness a
  func mrRound(n : Nat, a : Nat) : Bool {
    var d : Nat = n - 1; var r = 0;
    while (d % 2 == 0) { d := Nat.bitshiftRight(d, 1); r += 1 };
    var x = modPow(a, d, n);
    if (x == 1 or x == n - 1) return true;
    var i = 1;
    while (i < r) { x := (x * x) % n; if (x == n - 1) return true; i += 1 };
    false;
  };
  func isProbablePrime(n : Nat, rounds : Nat, seed : Nat) : Bool {
    if (not sieve(n)) return false;
    var k = 0;
    while (k < rounds) {
      let a = 2 + (seed + k * 7919) % (n - 3);
      if (not mrRound(n, a)) return false;
      k += 1;
    };
    true;
  };

  // gather `bytes` random bytes from raw_rand (32 per call)
  func randomPool(bytes : Nat) : async [Nat8] {
    let out = List.empty<Nat8>();
    while (List.size(out) < bytes) { let r = await ic00.raw_rand(); for (b in Blob.toArray(r).vals()) List.add(out, b) };
    List.toArray(out);
  };

  // Four separate calls so that a slow bignum cannot push one call over the 40 B limit.
  // All counts are instructions as charged by the IC.

  /// one 2048-bit modpow with a 2048-bit exponent = an RS256 signature without CRT (worst case)
  public shared func bench2048() : async { instructions : Nat64 } {
    let pool = await randomPool(3 * 256);
    let m = randomNat(pool, 2048, true);
    let b = randomNat(Array_drop(pool, 256), 2048, false) % m;
    let e = randomNat(Array_drop(pool, 512), 2048, true);
    var sink : Nat = 0;
    let c = IC.countInstructions(func() { sink := modPow(b, e, m) });
    ignore sink; { instructions = c };
  };
  /// one 1024-bit modpow = one CRT half of a signature, or one Miller-Rabin round on a 1024-bit candidate
  public shared func bench1024() : async { instructions : Nat64 } {
    let pool = await randomPool(3 * 128);
    let m = randomNat(pool, 1024, true);
    let b = randomNat(Array_drop(pool, 128), 1024, false) % m;
    let e = randomNat(Array_drop(pool, 256), 1024, true);
    var sink : Nat = 0;
    let c = IC.countInstructions(func() { sink := modPow(b, e, m) });
    ignore sink; { instructions = c };
  };
  /// real prime search: sieve + 8 Miller-Rabin rounds, `bits` wide, at most `cap` odd candidates
  func primeSearch(bits : Nat, cap : Nat) : async { found : Bool; candidates : Nat; instructions : Nat64; capped : Bool } {
    let pool = await randomPool(bits / 8 + 32);
    var cand = 0; var found = false;
    var n = randomNat(pool, bits, true);
    let c = IC.countInstructions(func() {
      label search while (cand < cap) {
        cand += 1;
        if (isProbablePrime(n, 8, cand)) { found := true; break search };
        n += 2;
      };
    });
    { found; candidates = cand; instructions = c; capped = not found };
  };
  /// expect a prime within ~180 odd candidates on average
  public shared func prime512() : async { found : Bool; candidates : Nat; instructions : Nat64; capped : Bool } = async await primeSearch(512, 600);
  /// expect ~350 odd candidates on average; capped at 60 so the call stays well inside the budget —
  /// extrapolate: a 2048-bit key = two such primes
  public shared func prime1024() : async { found : Bool; candidates : Nat; instructions : Nat64; capped : Bool } = async await primeSearch(1024, 60);

  func Array_drop(a : [Nat8], n : Nat) : [Nat8] {
    let out = List.empty<Nat8>();
    var i = 0;
    for (x in a.vals()) { if (i >= n) List.add(out, x); i += 1 };
    List.toArray(out);
  };
};
