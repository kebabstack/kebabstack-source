import Map "mo:core/Map";
module {
 public type Audience={#workspace;#public_};
 public type ConfigInput={title:Text;description:Text;slug:Text;audience:Audience;enabled:Bool;services:[Text];retentionDays:Nat};
 public type Config=ConfigInput and {projectId:Nat;revision:Nat;generation:Nat;by:Text;at:Int};
 public type Phase={#investigating;#identified;#monitoring;#resolved;#scheduled;#maintenance};
 public type Impact={#degraded;#outage;#maintenance};
 public type Input={projectId:Nat;incidentId:Nat;title:Text;message:Text;services:[Text];phase:Phase;impact:Impact;startsAt:Int;endsAt:Int};
 public type Update={at:Int;phase:Phase;message:Text};
 public type Notice=Input and {id:Nat;revision:Nat;generation:Nat;by:Text;at:Int;updatedAt:Int;withdrawnAt:Int;updates:[Update];requestKey:Text};
 public type Check={at:Int;until:Int;by:Text};
 public type PublicNotice={id:Nat;title:Text;services:[Text];phase:Phase;impact:Impact;startsAt:Int;endsAt:Int;updatedAt:Int;updates:[Update]};
 public type Service={name:Text;state:Text;checkedAt:Int;validUntil:Int};
 public type Page={title:Text;description:Text;slug:Text;audience:Audience;checkedAt:Int;services:[Service];notices:[PublicNotice]};
 public type State={configs:Map.Map<Nat,Config>;notices:Map.Map<Nat,Notice>;checks:Map.Map<Text,Check>;var nextNotice:Nat};
 public func empty():State={configs=Map.empty();notices=Map.empty();checks=Map.empty();var nextNotice=1};
}
