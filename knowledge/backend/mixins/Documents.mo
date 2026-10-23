import List "mo:core/List";
import Map "mo:core/Map";
import T "../types";
import D "../lib/Document";
import K "mo:kebab-hub/Knowledge";
import Nat "mo:core/Nat";
import Text "mo:core/Text";
import Char "mo:core/Char";
import Time "mo:core/Time";
import Iter "mo:core/Iter";
import Array "mo:core/Array";

mixin (state : T.State, manualProposals : Map.Map<Nat, Bool>, user : Text -> ?T.User, evidence : (Text, Nat, Nat) -> async K.Result) {
  func author(u : T.User) : Bool = u.role == "author" or reviewer(u);
  func reviewer(u : T.User) : Bool = u.role == "reviewer" or u.role == "admin";
  func edit(u : T.User, p : T.Proposal) : Bool = author(u) and (p.createdBy == u.id or reviewer(u));
  func manual(id : Nat) : Bool = manualProposals.get(id) == ?true;
  func view(p : T.Proposal) : T.ProposalView = { p with source = if (manual(p.id)) null else ?p.source };
  func base(id : ?Nat) : Nat = switch (id) { case null 0; case (?id) switch (state.articles.get(id)) { case (?a) a.revision; case null 0 } };
  func sameSource(a : K.Evidence, b : K.Evidence) : Bool = b.confirmed and a.backend == b.backend and a.ticketId == b.ticketId and a.revision == b.revision and a.summary == b.summary and a.confirmedAt == b.confirmedAt;
  public shared query func articles(tok : Text, search : Text, after : Nat) : async { rows : [{ article : Nat; title : Text; revision : Nat; publishedAt : Int }]; next : ?Nat } {
    if (user(tok) == null) return { rows = []; next = null };
    if (search.size() > 200) return { rows = []; next = null };
    let rows = List.empty<{ article : Nat; title : Text; revision : Nat; publishedAt : Int }>();
    let term = Text.toLower(search); var scanned = 0; var cursor = after;
    for (a in state.articles.values()) if (a.article > after) {
      if (scanned == 30) return { rows = rows.toArray(); next = ?cursor };
      scanned += 1; cursor := a.article;
      if (term == "" or Text.contains(Text.toLower(a.title # " " # a.plain), #text(term))) rows.add({ article = a.article; title = a.title; revision = a.revision; publishedAt = a.publishedAt });
    };
    { rows = rows.toArray(); next = null }
  };
  public shared query func article(tok : Text, id : Nat) : async ?T.Version {
    if (user(tok) == null) return null; state.articles.get(id)
  };
  public shared query func history(tok : Text, id : Nat) : async [{ revision : Nat; title : Text; publishedAt : Int; publishedBy : Text }] {
    if (user(tok) == null) return []; (state.versions.get(id) ?? []).map(func v = { revision = v.revision; title = v.title; publishedAt = v.publishedAt; publishedBy = v.publishedBy })
  };
  public shared query func articleVersion(tok : Text, id : Nat, revision : Nat) : async ?T.Version {
    if (user(tok) == null) return null; (state.versions.get(id) ?? []).find(func v = v.revision == revision)
  };
  // Draft titles/body can originate in Desk. List only opaque references until
  // opening the item rechecks the current person's source access at the Hub.
  public shared query func proposals(tok : Text, after : Nat) : async [{ id : Nat; state : Text; updatedAt : Int; own : Bool; manual : Bool }] {
    let u = user(tok) ?? (return []); if (not author(u)) return [];
    state.proposals.values().filter(func p = p.id > after and edit(u, p) and p.state == "draft").take(30).map(func p = { id = p.id; state = p.state; updatedAt = p.updatedAt; own = p.createdBy == u.id; manual = manual(p.id) }).toArray()
  };
  public shared func source(tok : Text, desk : Nat, ticket : Nat) : async K.Result {
    let u = user(tok) ?? (return #err("Sign in again")); if (not author(u)) return #err("Author access required");
    await evidence(tok, desk, ticket)
  };
  public shared func createProposal(tok : Text, input : T.Input) : async T.Outcome {
    let u = user(tok) ?? (return #err("Sign in again")); if (not author(u)) return #err("Author access required");
    if (input.requestId.size() < 16 or input.requestId.size() > 100) return #err("Invalid request identifier");
    let key = u.id # ":" # input.requestId;
    switch (state.requests.get(key)) { case (?id) { let prior = state.proposals.get(id) ?? (return #err("Stored request unavailable")); if (prior.desk != input.desk or prior.source.ticketId != input.ticket or prior.article != input.article) return #err("Request identifier was already used for another proposal"); return #ok(id) }; case null {} };
    if (state.proposals.size() >= 10000) return #err("The 10,000 proposal pilot limit has been reached");
    let revision = base(input.article);
    if (input.article != null and revision == 0) return #err("Article unavailable");
    let src = switch (await evidence(tok, input.desk, input.ticket)) { case (#ok s) s; case (#err e) return #err(e) };
    if (user(tok) != ?u or base(input.article) != revision) return #err("Access or article changed. Reload first.");
    switch (state.requests.get(key)) { case (?id) { let prior = state.proposals.get(id) ?? (return #err("Stored request unavailable")); if (prior.desk != input.desk or prior.source.ticketId != input.ticket or prior.article != input.article) return #err("Request identifier was already used for another proposal"); return #ok(id) }; case null {} };
    if (state.proposals.size() >= 10000 or not src.confirmed) return #err("Confirm the current solution in Desk first");
    let content : T.Content = switch (input.article) { case (?id) { let a = state.articles.get(id) ?? (return #err("Article unavailable")); ({ title = a.title; document = a.document }) }; case null ({ title = src.title; document = D.fromText(src.summary) }) };
    let plain = D.valid(content.document) ?? (return #err("Source is too large for a document"));
    let id = state.nextProposal; state.nextProposal += 1;
    state.proposals.add(id, { id; article = input.article; baseRevision = revision; revision = 1; title = content.title; document = content.document; plain; source = src; desk = input.desk; createdBy = u.id; updatedBy = u.id; createdAt = Time.now(); updatedAt = Time.now(); state = "draft"; publishedArticle = null });
    state.requests.add(key, id); #ok(id)
  };
  public shared func createManualProposal(tok : Text, article : ?Nat, requestId : Text) : async T.Outcome {
    let u = user(tok) ?? (return #err("Sign in again")); if (not author(u)) return #err("Author access required");
    if (requestId.size() < 16 or requestId.size() > 100) return #err("Invalid request identifier");
    let key = "manual:" # u.id # ":" # requestId;
    switch (state.requests.get(key)) { case (?id) { let p = state.proposals.get(id) ?? (return #err("Proposal unavailable")); if (p.article != article) return #err("Request identifier was already used for another proposal"); return #ok(id) }; case null {} };
    if (state.proposals.size() >= 10000) return #err("The 10,000 proposal pilot limit has been reached");
    let revision = base(article); if (article != null and revision == 0) return #err("Article unavailable");
    let content : T.Content = switch (article) { case (?a) { let v = state.articles.get(a) ?? (return #err("Article unavailable")); { title = v.title; document = v.document } }; case null { { title = ""; document = "{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\"}]}" } } };
    let id = state.nextProposal; state.nextProposal += 1;
    // Legacy storage requires a source record. The explicit side-map is the only
    // source-free authority; API views return null, never this internal sentinel.
    let source : K.Evidence = { ticketId = 0; key = ""; title = ""; summary = ""; revision = 0; confirmed = false; confirmedBy = ""; confirmedAt = 0; backend = ""; url = "" };
    state.proposals.add(id, { id; article; baseRevision = revision; revision = 1; title = content.title; document = content.document; plain = D.valid(content.document) ?? ""; source; desk = 0; createdBy = u.id; updatedBy = u.id; createdAt = Time.now(); updatedAt = Time.now(); state = "draft"; publishedArticle = null });
    manualProposals.add(id, true); state.requests.add(key, id); #ok(id)
  };
  public shared func proposal(tok : Text, id : Nat) : async { #ok : { proposal : T.ProposalView; currentSource : ?K.Evidence; base : ?T.Version }; #err : Text } {
    let u = user(tok) ?? (return #err("Sign in again"));
    let p = state.proposals.get(id) ?? (return #err("Proposal unavailable"));
    if (not edit(u, p)) return #err("Author or reviewer access required");
    if (manual(id)) return #ok({ proposal = view(p); currentSource = null; base = switch (p.article) { case (?a) state.articles.get(a); case null null } });
    let src = switch (await evidence(tok, p.desk, p.source.ticketId)) { case (#ok s) s; case (#err e) return #err(e) };
    if (user(tok) != ?u or state.proposals.get(id) != ?p or src.backend != p.source.backend) return #err("Proposal, access or source changed. Reload.");
    #ok({ proposal = view(p); currentSource = ?src; base = switch (p.article) { case (?a) state.articles.get(a); case null null } })
  };
  public shared func saveProposal(tok : Text, id : Nat, revision : Nat, content : T.Content) : async T.Outcome {
    let u = user(tok) ?? (return #err("Sign in again"));
    let p = state.proposals.get(id) ?? (return #err("Proposal unavailable"));
    if (not edit(u, p)) return #err("Author or reviewer access required");
    if (p.state != "draft" or p.revision != revision) return #err("This proposal changed. Reload before saving.");
    let title = Text.trim(content.title, #predicate(Char.isWhitespace));
    if (title.size() < 3 or title.size() > 180) return #err("Use a title between 3 and 180 characters");
    let plain = D.valid(content.document) ?? (return #err("Unsupported or oversized document. Maximum 50,000 text characters and 2,000 nodes."));
    if (not manual(id)) {
    let src = switch (await evidence(tok, p.desk, p.source.ticketId)) { case (#ok s) s; case (#err e) return #err(e) };
    if (user(tok) != ?u or state.proposals.get(id) != ?p or src.backend != p.source.backend) return #err("Proposal, access or source changed. Reload.");
    };
    state.proposals.add(id, { p with title; document = content.document; plain; revision = p.revision + 1; updatedBy = u.id; updatedAt = Time.now() });
    #ok(p.revision + 1)
  };
  public shared func discardProposal(tok : Text, id : Nat, revision : Nat) : async T.Outcome {
    let u = user(tok) ?? (return #err("Sign in again")); let p = state.proposals.get(id) ?? (return #err("Proposal unavailable"));
    if (not edit(u, p) or p.state != "draft" or p.revision != revision) return #err("No permission or proposal changed");
    state.proposals.add(id, { p with state = "discarded"; revision = p.revision + 1; updatedBy = u.id; updatedAt = Time.now() }); #ok(id)
  };
  public shared func publishProposal(tok : Text, id : Nat, revision : Nat) : async T.Outcome {
    let u = user(tok) ?? (return #err("Sign in again")); if (not reviewer(u)) return #err("Reviewer access required");
    let p = state.proposals.get(id) ?? (return #err("Proposal unavailable"));
    if (p.state == "published" and p.revision == revision + 1) return #ok(p.publishedArticle ?? 0);
    if (p.state != "draft" or p.revision != revision or base(p.article) != p.baseRevision) return #err("Article or proposal changed. Start a new proposal from the current article.");
    if (not manual(id)) {
    let src = switch (await evidence(tok, p.desk, p.source.ticketId)) { case (#ok s) s; case (#err e) return #err(e) };
    if (user(tok) != ?u or state.proposals.get(id) != ?p or base(p.article) != p.baseRevision) return #err("Article, proposal or access changed. Reload.");
    if (not sameSource(p.source, src)) return #err("The Desk solution changed or the ticket reopened. Start a proposal from the current confirmed solution.");
    };
    if ((D.valid(p.document) ?? "").size() == 0) return #err("Write some content before publishing");
    if (p.title.size() < 3 or p.title.size() > 180) return #err("Save a title between 3 and 180 characters before publishing");
    switch (p.article) { case (?a) { let current = state.articles.get(a) ?? (return #err("Article unavailable")); if (current.title == p.title and current.document == p.document) return #err("The proposal has no changes to publish. Edit it or discard it.") }; case null {} };
    if (p.article == null and state.articles.size() >= 1000) return #err("The 1,000-article pilot limit has been reached");
    let article = switch (p.article) { case (?a) a; case null { let a = state.nextArticle; state.nextArticle += 1; a } };
    let previous = state.versions.get(article) ?? [];
    if (previous.size() >= 100) return #err("This article reached the 100-version pilot limit");
    let v : T.Version = { article; revision = p.baseRevision + 1; title = p.title; document = p.document; plain = p.plain; publishedBy = u.id; publishedAt = Time.now(); proposal = id };
    state.articles.add(article, v); state.versions.add(article, previous.concat([v]));
    state.proposals.add(id, { p with state = "published"; revision = p.revision + 1; publishedArticle = ?article; updatedBy = u.id; updatedAt = Time.now() });
    #ok(article)
  };
};
