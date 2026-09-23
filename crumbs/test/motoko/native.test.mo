import Hash "../../backend/lib/NativeHash";
import H "../../backend/lib/HttpUtil";
import Array "mo:core/Array";
import Nat8 "mo:core/Nat8";
import Text "mo:core/Text";

// RFC 4231 SHA-256 vectors cover a short key and prehashing keys over 64 bytes.
assert Hash.hmac(Array.repeat<Nat8>(0x0b,20).toBlob(),"Hi There") == "b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7";
assert Hash.hmac("Jefe".encodeUtf8(),"what do ya want for nothing?") == "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843";
assert Hash.hmac(Array.repeat<Nat8>(0xaa,131).toBlob(),"Test Using Larger Than Block-Size Key - Hash Key First") == "60e431591ee0b67f0d8a26aacbf5b77f8e0bc6213728c5140546040f0ee37f54";
assert H.parse("{\"value\":\"\\ud800\"}") != null;
assert H.parse("[[[[[[[[[[[[[[[[[0]]]]]]]]]]]]]]]]]") == null;
assert H.path("/customer/alice%40example.test/123456") == ?"/customer/:email/:id";
assert H.path("/%ZZ") == null;
