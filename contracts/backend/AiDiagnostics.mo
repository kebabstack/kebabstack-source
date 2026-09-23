import Text "mo:core/Text";
import Nat "mo:core/Nat";

/// Safe operational messages: never publish a vendor response, document text or credentials.
module {
  public func transportError(message : Text) : Text {
    let m = message.toLower();
    if (m.contains(#text "timeout") or m.contains(#text "timed out") or m.contains(#text "deadline") or m.contains(#text "sys_unknown")) return "The document request exceeded the hosting platform's HTTP time limit (AI_TIMEOUT).";
    if (m.contains(#text "size limit") or m.contains(#text "response size")) return "The AI response exceeded the hosting platform's size limit (AI_RESPONSE_SIZE).";
    if (m.contains(#text "dns") or m.contains(#text "resolve")) return "The hosting platform could not resolve the AI provider address (AI_DNS).";
    if (m.contains(#text "tls") or m.contains(#text "certificate")) return "The hosting platform could not establish a secure connection to the AI provider (AI_TLS).";
    return "The hosting platform could not complete the AI request (AI_TRANSPORT).";
  };
  public func retryableStatus(status : Nat) : Bool { status == 408 or status == 429 or status >= 500 };
  public func providerError(status : Nat, body : Text) : Text {
    if (status == 401 or status == 403) return "The AI provider rejected access. A Hub owner should check the API key and model permissions in Hub Settings → AI.";
    if (status == 429) return "The AI provider is rate-limiting requests or its quota is exhausted. Check the provider account, then retry.";
    if (status == 400 and body.toLower().contains(#text "temperature") and body.toLower().contains(#text "deprecated")) return "The AI model rejected a deprecated temperature parameter. Contracts needs the current AI compatibility update.";
    if (status == 404) return "The configured AI model or endpoint was not found. A Hub owner should check Hub Settings → AI.";
    if (status >= 500) return "The AI provider is temporarily unavailable. Retry in a few minutes.";
    "The AI provider rejected the request (HTTP " # status.toText() # "). Check the provider and model settings in the Hub.";
  };
};
