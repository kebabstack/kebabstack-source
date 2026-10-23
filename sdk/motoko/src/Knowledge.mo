/// Minimal, versioned Desk evidence for a human-reviewed documentation proposal.
module {
  public type Evidence = { ticketId : Nat; key : Text; title : Text; summary : Text; revision : Nat; confirmed : Bool; confirmedBy : Text; confirmedAt : Int; backend : Text; url : Text };
  public type Result = { #ok : Evidence; #err : Text };
  public type Target = { cid : Nat; name : Text; url : Text; desk : Nat };
  public type Broker = actor {
    hub_knowledgeEvidence : shared (Text, Nat, Nat) -> async Result;
    hub_knowledgeTargets : shared query Text -> async [Target];
  };
};
