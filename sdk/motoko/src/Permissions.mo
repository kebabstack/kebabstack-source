/// The permission vocabulary shared by the Hub and its first-party apps.
/// Assignment and precedence live in the Hub; apps accept only this protocol.
import Text "mo:core/Text";
import Nat "mo:core/Nat";
module {
  public type PersonGrant = { id : Text; role : Text };
  public type GroupGrant = { id : Nat; role : Text };
  public type Policy = { app : Text; defaultRole : Text; people : [PersonGrant]; groups : [GroupGrant] };
  public type StoredPolicy = { policy : Policy; revision : Nat; updatedAt : Int };
  public type Role = { id : Text; name : Text; can : [Text]; cannot : [Text] };
  public type LegacyGrant = { email : Text; role : Text; source : Text };
  public type Status = { app : Text; model : Nat; revision : Text; directoryAt : Int; legacy : [LegacyGrant]; legacyGroups : [{ name : Text; role : Text }] };
  public let model : Text = "1";

  public func supported(app : Text) : Bool {
    app == "assets" or app == "contracts" or app == "desk" or app == "forms" or app == "trust" or app == "watch" or app == "crumbs";
  };
  public func valid(app : Text, role : Text) : Bool {
    if (not supported(app)) return false;
    if (role == "none" or role == "admin") return true;
    if (app == "watch" or app == "crumbs") return role == "viewer";
    role == "member" or (app == "desk" and role == "agent") or (app == "trust" and role == "viewer");
  };
  public func rank(role : Text) : Nat {
    switch (role) { case "admin" 4; case "agent" 3; case "viewer" 2; case "member" 1; case _ 0 };
  };
  public func defaultRole(app : Text) : Text { if (app == "watch" or app == "crumbs") "none" else "member" };
  public func roles(app : Text) : [Role] {
    if (not supported(app)) return [];
    let none : Role = { id = "none"; name = "No access"; can = []; cannot = ["Open the app or read its protected data"] };
    let admin : Role = { id = "admin"; name = "Admin"; can = ["See and manage all app content, including other people's content", "Manage app settings"]; cannot = ["Grant app roles here — only Hub owners manage permissions", "Act as another person's identity"] };
    let member : Role = switch (app) {
      case "assets" ({ id = "member"; name = "Employee"; can = ["See assigned devices", "See and accept own offers and download own invoices"]; cannot = ["See colleagues' devices or sales", "Change inventory, invoices or settings"] });
      case "desk" ({ id = "member"; name = "Requester"; can = ["Create and follow own tickets", "Read and decide explicitly assigned pending approvals"]; cannot = ["Browse colleagues' tickets", "Manage queues or app settings"] });
      case "forms" ({ id = "member"; name = "Employee"; can = ["Create and manage own forms and submissions", "Use shared forms within their explicit viewer/editor permissions"]; cannot = ["Read unshared forms or submissions", "Manage app settings"] });
      case "contracts" ({ id = "member"; name = "Employee"; can = ["Manage own personal workspace", "Use shared teamspaces within their membership and record permissions"]; cannot = ["Read other personal or unshared team workspaces", "Manage app settings"] });
      case _ ({ id = "member"; name = "Employee"; can = ["See own devices and their check results", "Read the published check catalogue"]; cannot = ["Read colleagues' device results", "Change checks or enrolment settings"] });
    };
    if (app == "crumbs") return [none, { id = "viewer"; name = "Analyst"; can = ["Read analytics for sites shared with this person"]; cannot = ["Change sites, collection settings or API keys"] }, admin];
    if (app == "watch") return [none, { id = "viewer"; name = "Viewer"; can = ["Read ALL monitored domains, events and reports"]; cannot = ["Change monitoring, accept DNS changes or manage settings"] }, admin];
    if (app == "desk") return [none, member, { id = "agent"; name = "Agent"; can = ["Read and work on ALL tickets"]; cannot = ["Manage app settings or Hub permissions"] }, admin];
    if (app == "trust") return [none, member, { id = "viewer"; name = "Fleet viewer"; can = ["Read ALL devices and their check results"]; cannot = ["Change checks, enrolment or settings"] }, admin];
    [none, member, admin];
  };

  // Supplemental Desk reporting capabilities do not change the person's app role.
  public type ReportingGrant = { subject : { #person : Text; #group : Nat }; projectId : Nat; capabilities : [Text] };
  public type ReportingScope = { id : Nat; name : Text };
  public let reportingCapabilities : [Role] = [
    { id = "time_review"; name = "Review time"; can = ["Review confirmed readiness and actual work in selected projects"]; cannot = ["Read rates, amounts or incident content", "Approve own service records"] },
    { id = "compensation"; name = "Prepare compensation"; can = ["Set rates and payroll identifiers; prepare scoped statements and adjustments"]; cannot = ["Release a period or export without separate grants", "Read incident content"] },
    { id = "release"; name = "Release statements"; can = ["Read calculations and release reviewed periods in selected projects"]; cannot = ["Release own claims or a period prepared by oneself", "Read incident content"] },
    { id = "export"; name = "Export approved payroll"; can = ["Read and download approved statements in selected projects"]; cannot = ["Read drafts, change rates, approve time or read incident content"] }
  ];
  public func reportingValid(cap : Text) : Bool = cap == "time_review" or cap == "compensation" or cap == "release" or cap == "export";
  public func reportingHas(encoded : Text, projectId : Nat, cap : Text) : Bool {
    if (encoded.size() > 16000 or not reportingValid(cap)) return false;
    Text.contains(encoded, #text (";" # projectId.toText() # ":" # cap # ";"))
  };
};
