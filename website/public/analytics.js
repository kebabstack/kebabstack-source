/* Public-site analytics only. Never collect development or canister-alias visits. */
(() => {
  const config = document.currentScript;
  if (!config || location.hostname !== 'kebabstack.dev' || location.protocol !== 'https:') return;
  if (navigator.globalPrivacyControl === true || navigator.doNotTrack === '1') return;
  const tracker = document.createElement('script');
  tracker.src = config.dataset.tracker;
  tracker.defer = true;
  tracker.dataset.endpoint = config.dataset.endpoint;
  tracker.dataset.site = config.dataset.site;
  tracker.dataset.outbound = 'true';
  tracker.dataset.downloads = 'true';
  // No forms, hash routes, user identifiers or custom property collection.
  document.head.appendChild(tracker);
})();
