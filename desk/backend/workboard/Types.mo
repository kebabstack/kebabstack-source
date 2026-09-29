import Map "mo:core/Map";
import Source "mo:kebab-hub/Workboard";
module {
  public type Actor = { id : Text; role : Text };
  public type Person = { id : Text; name : Text };
  public type Scope = { #personal; #group : Text };
  public type ProjectInput = { name : Text; description : Text; scope : Scope; dueOn : Text };
  public type Project = ProjectInput and {
    id : Nat; revision : Nat; createdBy : Text; createdAt : Int; updatedAt : Int;
    archived : Bool;
  };
  public type TaskInput = {
    projectId : ?Nat; title : Text; note : Text; assignee : Text; dueOn : Text;
    column : Source.Column; waitingFor : Text;
  };
  public type Task = TaskInput and {
    id : Nat; revision : Nat; createdBy : Text; createdAt : Int; updatedAt : Int;
    archived : Bool;
  };
  public type Link = { #ticket : Nat; #sale : { cid : Nat; id : Nat } };
  public type Audit = { at : Int; by : Text; action : Text };
  public type Request = { input : Blob; id : Nat };
  public type Preferences = { projectId : ?Nat; mine : Bool; tickets : Bool; sales : Bool; completed : Bool };
  public type Filter = { projectId : ?Nat; mine : Bool; completed : Bool; search : Text; offset : Nat };
  public type Error = { #denied; #missing; #stale; #unavailable; #invalid : Text; #limit : Text };
  public type Result = { #ok : { id : Nat; revision : Nat }; #err : Error };
  public type ProjectView = Project and { canManage : Bool; openTasks : Nat; doneTasks : Nat };
  public type Subtask = { id : Nat; title : Text; done : Bool };
  public type TaskView = Task and { assigneeName : Text; projectName : Text; assigneeAvailable : Bool; subtaskCount : Nat; subtasksDone : Nat };
  public type State = {
    projects : Map.Map<Nat, Project>; tasks : Map.Map<Nat, Task>;
    links : Map.Map<Nat, [Link]>; audit : Map.Map<Text, [Audit]>;
    requests : Map.Map<Text, Request>; preferences : Map.Map<Text, Preferences>;
    var nextProject : Nat; var nextTask : Nat;
  };
}
