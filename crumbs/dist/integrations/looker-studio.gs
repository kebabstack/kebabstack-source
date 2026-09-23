/** Crumbs community connector. Deploy in your own Google Apps Script project. */
// Set once to your verified collection API origin before deployment.
var CRUMBS_API_ORIGIN = "https://YOUR-BACKEND.icp.net";
var cc = DataStudioApp.createCommunityConnector();
function getAuthType() { return cc.newAuthTypeResponse().setAuthType(cc.AuthType.KEY).build(); }
function setCredentials(request) {
  var key = String(request.key || '').trim();
  if (!/^[a-f0-9]{64}$/.test(key)) return {errorCode:'INVALID_CREDENTIALS'};
  PropertiesService.getUserProperties().setProperty('crumbsKey',key);
  return {errorCode:'NONE'};
}
function resetAuth() { PropertiesService.getUserProperties().deleteProperty('crumbsKey'); }
function isAuthValid() { return !!PropertiesService.getUserProperties().getProperty('crumbsKey'); }
function isAdminUser() { return false; }
function getConfig() {
  var config=cc.getConfig();
  config.newInfo().setId('notice').setText('Use a website-scoped read key. This sends aggregate reports to Google. Daily visitor estimates are not unique people across days. No raw events are exported.');
  config.newInfo().setId('origin').setText('Collection API: '+CRUMBS_API_ORIGIN);
  config.newTextInput().setId('site').setName('Website ID');
  config.setDateRangeRequired(true);
  return config.build();
}
function fields() {
  var f=cc.getFields(),t=cc.FieldType,a=cc.AggregationType;
  f.newDimension().setId('date').setName('Date (UTC)').setType(t.YEAR_MONTH_DAY);
  [['visitors','Daily visitor estimates'],['visits','Visits'],['pageviews','Pageviews'],['events','Custom events'],['bounces','Bounces'],['durationSeconds','Visit duration (seconds)'],['engagementMs','Active time (milliseconds)'],['scrollDepthSum','Scroll depth sum'],['scrollSamples','Scroll samples']].forEach(function(item){f.newMetric().setId(item[0]).setName(item[1]).setType(t.NUMBER).setAggregation(a.SUM);});
  return f;
}
function getSchema() { return {schema:fields().build()}; }
function getData(request) {
  var config=request.configParams||{},origin=CRUMBS_API_ORIGIN.replace(/\/$/,''),site=String(config.site||'');
  if(!/^https:\/\/[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i.test(origin)||!/^[-_a-zA-Z0-9]{1,80}$/.test(site))cc.newUserError().setText('Enter a valid HTTPS API origin and website ID.').throwException();
  var from=Date.parse(request.dateRange.startDate+'T00:00:00Z')/1000,until=Date.parse(request.dateRange.endDate+'T00:00:00Z')/1000+86400;
  if(!isFinite(from)||!isFinite(until)||until<=from||until-from>1827*86400)cc.newUserError().setText('Select a valid date range of at most five years.').throwException();
  var rows=[];
  // Query at most one UTC month per request; a capacity error is never converted to a zero.
  for(var start=from;start<until;){
    var end=Math.min(until,start+28*86400);
    var response=UrlFetchApp.fetch(origin+'/api/v1/query',{method:'post',contentType:'application/json',followRedirects:false,headers:{Authorization:'Bearer '+PropertiesService.getUserProperties().getProperty('crumbsKey')},payload:JSON.stringify({site:site,from:start,until:end,dimension:'day',filters:[],limit:1000}),muteHttpExceptions:true});
    if(response.getResponseCode()!==200)cc.newUserError().setText('Crumbs could not return this report. Check key expiry, website access and the report capacity limit. HTTP '+response.getResponseCode()).throwException();
    var data=JSON.parse(response.getContentText());if(data.truncated)cc.newUserError().setText('Crumbs returned a truncated report. Reduce the date range.').throwException();
    rows=rows.concat(data.rows);start=end;
  }
  var requested=fields().forIds(request.fields.map(function(f){return f.name;}));
  var byDay={};rows.forEach(function(row){byDay[Number(row.value)]=row;});
  var complete=[];for(var at=from;at<until;at+=86400)complete.push(byDay[at]||{value:String(at),metrics:{}});
  return {schema:requested.build(),rows:complete.map(function(row){return {values:requested.asArray().map(function(field){var id=field.getId();return id==='date'?Utilities.formatDate(new Date(Number(row.value)*1000),'UTC','yyyyMMdd'):Number(row.metrics[id]||0);})};}),filtersApplied:false};
}
