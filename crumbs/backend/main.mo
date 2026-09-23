import T "types";
import B "businessTypes";
import BusinessApi "mixins/Business";
import Map "mo:core/Map";
import AuthApi "mixins/Auth";
import AnalyticsApi "mixins/Analytics";
import NativeApi "mixins/Native";
import Principal "mo:core/Principal";
import AccessApi "mixins/Access";

persistent actor Crumbs {
  transient let BUILD_VERSION : Text = "0.6.1";
  let auth : T.AuthState;
  let db : T.Store;
  let siteAccess : Map.Map<Text, T.SiteAccess>;
  let native : T.NativeState;
  let business : B.State;
  transient let lease : T.Lease = {
    var at = 0;
    var epoch = 0;
    var pulling = false;
  };
  include AuthApi(auth, lease, db, siteAccess, BUILD_VERSION);
  include AnalyticsApi(auth, lease, db, siteAccess, cleanBusiness);
  include AccessApi(auth, lease, db, siteAccess);
  include BusinessApi(auth, lease, db, siteAccess, business);
  include NativeApi(db,native,func() : Principal { Principal.fromActor(Crumbs) });
  do { startNative<system>(); startAuth<system>(); startAnalytics<system>() };
};
