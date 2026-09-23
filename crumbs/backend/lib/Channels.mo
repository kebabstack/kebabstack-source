import Text "mo:core/Text";
import Array "mo:core/Array";
import Iter "mo:core/Iter";

module {
  func host(source : Text, domains : [Text]) : Bool {
    let value = source.toLower();
    domains.values().any(func d = value == d or value.endsWith(#text("." # d)));
  };
  public func ai(source : Text) : Text {
    if (host(source,["chatgpt.com","chat.openai.com"])) return "ChatGPT";
    if (host(source,["perplexity.ai"])) return "Perplexity";
    if (host(source,["claude.ai"])) return "Claude";
    if (host(source,["gemini.google.com","bard.google.com"])) return "Gemini";
    if (host(source,["copilot.microsoft.com"])) return "Copilot";
    if (host(source,["grok.com"])) return "Grok";
    if (host(source,["you.com"])) return "You.com";
    "";
  };
  public func channel(source : Text, medium : Text) : Text {
    let m = medium.toLower();
    if (["cpc","ppc","paidsearch","paid_search"].values().any(func x = x == m)) return "Paid search";
    if (["paid_social","paidsocial"].values().any(func x = x == m)) return "Paid social";
    if (["display","banner","cpm"].values().any(func x = x == m)) return "Display";
    if (["affiliate","affiliates"].values().any(func x = x == m)) return "Affiliates";
    if (m == "email" or m == "newsletter") return "Email";
    if (ai(source) != "") return "AI assistants";
    if (m == "organic" or host(source,["google.com","google.ch","google.de","google.co.uk","bing.com","duckduckgo.com","search.yahoo.com","ecosia.org","search.brave.com","yandex.com","baidu.com"])) return "Organic search";
    if (m == "social" or host(source,["linkedin.com","facebook.com","instagram.com","twitter.com","x.com","t.co","reddit.com","youtube.com","tiktok.com","bsky.app"])) return "Organic social";
    if (source == "" and m == "") return "Direct / unknown";
    "Referral / other";
  };
  public func spam(source : Text) : Bool { host(source,["semalt.com","darodar.com","buttons-for-website.com"]) };
};
