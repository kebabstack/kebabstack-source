import Map "mo:core/Map";
import K "mo:kebab-hub/Knowledge";
module {
  public type User = { id : Text; email : Text; displayName : Text; role : Text };
  public type Content = { title : Text; document : Text };
  public type Version = { article : Nat; revision : Nat; title : Text; document : Text; plain : Text; publishedBy : Text; publishedAt : Int; proposal : Nat };
  public type Proposal = { id : Nat; article : ?Nat; baseRevision : Nat; revision : Nat; title : Text; document : Text; plain : Text; source : K.Evidence; desk : Nat; createdBy : Text; updatedBy : Text; createdAt : Int; updatedAt : Int; state : Text; publishedArticle : ?Nat };
  public type Input = { article : ?Nat; desk : Nat; ticket : Nat; requestId : Text };
  // Keep Proposal's deployed stable representation. Only entries explicitly in
  // manualProposals are source-free; legacy Desk drafts never gain that privilege.
  public type ProposalView = { id : Nat; article : ?Nat; baseRevision : Nat; revision : Nat; title : Text; document : Text; plain : Text; source : ?K.Evidence; desk : Nat; createdBy : Text; updatedBy : Text; createdAt : Int; updatedAt : Int; state : Text; publishedArticle : ?Nat };
  public type Password = { salt : Blob; verifier : Blob };
  public type ShareInput = { article : Nat; revision : Nat; name : Text; days : ?Nat; password : ?Password; requestId : Text };
  public type Share = { id : Nat; article : Nat; revision : Nat; name : Text; days : ?Nat; password : ?Password; createdBy : Text; createdAt : Int; expiresAt : ?Int; revokedAt : ?Int };
  public type ShareView = { id : Nat; article : Nat; revision : Nat; name : Text; passwordProtected : Bool; createdAt : Int; expiresAt : ?Int; revokedAt : ?Int; code : Text };
  public type ShareState = { links : Map.Map<Nat, Share>; byArticle : Map.Map<Nat, [Nat]>; byHash : Map.Map<Blob, Nat>; requests : Map.Map<Text, Nat>; failures : Map.Map<Nat, { since : Int; count : Nat }>; var next : Nat };
  public type Outcome = { #ok : Nat; #err : Text };
  public type State = { articles : Map.Map<Nat, Version>; versions : Map.Map<Nat, [Version]>; proposals : Map.Map<Nat, Proposal>; requests : Map.Map<Text, Nat>; var nextArticle : Nat; var nextProposal : Nat };
};
