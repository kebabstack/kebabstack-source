#!/bin/bash
# Trust managed deployment @@REVISION@@. Run as root through MDM, or sudo.
# Install/migrate contains an enrolment secret. Do not enable shell tracing.
# Updates: deploy a newly approved installer. No self-updater or remote shell.
set -euo pipefail
export PATH=/usr/bin:/bin:/usr/sbin:/sbin
umask 077
ACTION='@@ACTION@@'
HOST='@@HOST@@'
VERSION='@@VERSION@@'
SECRET='@@SECRET@@'
QUIET='@@QUIET@@'
MIGRATE='@@MIGRATE@@'
OS='@@OS@@'
fail() { printf 'Trust: %s\n' "$*" >&2; exit 1; }
note() { printf 'Trust: %s\n' "$*"; }
[ "$(id -u)" = 0 ] || fail 'Run as root (MDM), or use sudo.'
case "$OS:$(uname -s)" in macos:Darwin|linux:Linux) ;; *) fail 'This download is for a different operating system.';; esac
if [ "$OS" = macos ]; then
  ROOT='/Library/Application Support/KebabStackTrust'
  SERVICE='/Library/LaunchDaemons/org.kebabstack.trust.osqueryd.plist'
  LOCK='/var/run/kebabstack-trust.lock'
  URL='@@MAC_URL@@'; SHA='@@MAC_SHA@@'
  SOURCE='osqueryd'
  CERTS='/etc/ssl/cert.pem'
else
  ROOT='/var/lib/kebabstack-trust'
  SERVICE='/etc/systemd/system/kebabstack-trust.service'
  LOCK='/run/kebabstack-trust.lock'
  command -v systemctl >/dev/null || fail 'Linux requires systemd. This script does not support OpenRC, containers or WSL.'
  case "$(uname -m)" in
    x86_64) URL='@@LINUX_X64_URL@@'; SHA='@@LINUX_X64_SHA@@';;
    aarch64|arm64) URL='@@LINUX_ARM_URL@@'; SHA='@@LINUX_ARM_SHA@@';;
    *) fail 'Supported Linux architectures: x86_64 and arm64.';;
  esac
  SOURCE='opt/osquery/bin/osqueryd'
  if [ -f /etc/ssl/certs/ca-certificates.crt ]; then CERTS='/etc/ssl/certs/ca-certificates.crt'; elif [ -f /etc/pki/tls/certs/ca-bundle.crt ]; then CERTS='/etc/pki/tls/certs/ca-bundle.crt'; else fail 'Install the distribution ca-certificates package first.'; fi
fi
# Reject redirected paths before reading credentials or writing privileged files.
for p in "$ROOT" "$(dirname "$ROOT")" "$SERVICE" "$LOCK"; do [ ! -L "$p" ] || fail "Refusing symlink: $p"; done
TMP=''
LOCKED=0
cleanup() { [ -z "$TMP" ] || rm -rf "$TMP"; if [ "$LOCKED" = 1 ]; then rmdir "$LOCK" 2>/dev/null || true; fi; }
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
# Audits are read-only: no lock or temp files, no network, no credentials printed.
owned() { [ -f "$ROOT/owner" ] && [ ! -L "$ROOT/owner" ] && [ "$(cat "$ROOT/owner")" = "kebabstack-trust-v2:$HOST" ]; }
legacy_present() { [ -e /usr/local/bin/ks-trust-update ] || [ -e /Library/LaunchDaemons/org.kebabstack.trust.update.plist ] || [ -e /etc/cron.d/ks-trust-update ]; }
running() {
  if [ "$OS" = macos ]; then launchctl print system/org.kebabstack.trust.osqueryd 2>/dev/null | grep -Eq '^[[:space:]]*pid = [0-9]';
  else systemctl is-active --quiet kebabstack-trust.service; fi
}
service_owned() { [ -f "$SERVICE" ] && [ ! -L "$SERVICE" ] && grep -qF "$ROOT/bin/osqueryd" "$SERVICE" && grep -qF "$ROOT/osquery.flags" "$SERVICE"; }
profiles_ready() {
  [ "$OS" = macos ] || return 0
  # A profile ID check is a prerequisite, not a guarantee of notification behaviour.
  profiles show -type configuration -output stdout-xml > "$TMP/profiles.plist" 2>/dev/null || fail 'Could not read installed MDM profiles.'
  grep -qF '<string>org.kebabstack.trust.background</string>' "$TMP/profiles.plist" || fail 'Deploy Trust Background Items.mobileconfig first; wait for MDM to report it installed.'
  if [ "$QUIET" = true ]; then
    grep -qF '<string>org.kebabstack.trust.notifications</string>' "$TMP/profiles.plist" || fail 'Quiet rollout needs Trust Quiet Notifications.mobileconfig installed first. It affects all background-item notifications.'
  fi
}
case "$ACTION" in
  audit)
    owned || fail 'No Trust v2 installation for this server. Run preflight; legacy devices need migration.'
    service_owned || fail 'Trust service configuration is missing or unexpected.'
    [ -x "$ROOT/bin/osqueryd" ] && [ -f "$ROOT/osquery.flags" ] && [ -s "$ROOT/enroll.secret" ] || fail 'Trust files are incomplete. Redeploy the installer.'
    legacy_present && fail 'A legacy Trust updater remains. Complete migration before rollout.'
    running || fail 'Trust service is not running. Review launchd/systemd logs and redeploy.'
    note 'Local service is running. This does not prove enrolment: confirm fresh checks and the person in Trust.'
    exit 0;;
  audit-removed)
    [ ! -e "$ROOT" ] && [ ! -e "$SERVICE" ] || fail 'Trust files remain. Run the matching uninstaller.'
    ! running || fail 'Trust service is still running.'
    ! legacy_present || fail 'Legacy Trust components remain; use the migration guide.'
    note 'Local Trust v2 files and service are absent. Record this result in Trust with the MDM job reference.'
    exit 0;;
esac
mkdir "$LOCK" 2>/dev/null || fail 'Another deployment is running (or a previous run was interrupted). Check the MDM job before removing the empty lock directory.'
LOCKED=1
TMP=$(mktemp -d /private/tmp/ks-trust.XXXXXXXX 2>/dev/null || mktemp -d /tmp/ks-trust.XXXXXXXX)
chmod 700 "$TMP"
if [ "$ACTION" = uninstall ]; then
  if [ ! -e "$ROOT" ] && [ ! -e "$SERVICE" ]; then
    ! legacy_present || fail 'Legacy Trust installation detected. Use the migration guide before removal.'
    note 'Already absent.'; exit 0
  fi
  owned || fail 'Ownership marker does not match this Trust server. Nothing removed.'
  [ ! -e "$SERVICE" ] || service_owned || fail 'Unexpected service definition. Nothing removed.'
  ! legacy_present || fail 'Legacy updater still present. Complete migration first.'
  if [ "$OS" = macos ]; then
    if launchctl print system/org.kebabstack.trust.osqueryd >/dev/null 2>&1; then launchctl bootout system/org.kebabstack.trust.osqueryd || fail 'Could not stop Trust.'; fi
    ! launchctl print system/org.kebabstack.trust.osqueryd >/dev/null 2>&1 || fail 'Trust service still registered.'
  else
    systemctl disable --now kebabstack-trust.service
    ! running || fail 'Trust service still running.'
  fi
  rm -f "$SERVICE"
  rm -rf "$ROOT"
  if [ "$OS" = linux ]; then systemctl daemon-reload; fi
  note 'Trust v2 removed. Generic osquery installations were left in place. Run the removal audit and record its result in Trust.'
  exit 0
fi
case "$ACTION" in install|preflight) ;; *) fail 'Unknown action.';; esac
profiles_ready
if [ -e "$ROOT" ]; then
  owned || fail 'Installation directory belongs to another deployment. Nothing overwritten.'
  # Recursive symlinks could redirect later writes or cleanup. Refuse instead of repairing.
  [ -z "$(find "$ROOT" -type l -print -quit)" ] || fail 'Unexpected symlink inside Trust installation.'
  [ ! -e "$SERVICE" ] || service_owned || fail 'Another service uses the Trust service name.'
fi
LEGACY=0
if legacy_present || { [ -e "$SERVICE" ] && ! service_owned; }; then
  [ "$MIGRATE" = 1 ] || fail 'Legacy installation detected. Use the explicit migration download after reviewing the migration guide.'
  for p in /etc/osquery /etc/osquery/osquery.flags /etc/osquery/enroll.secret /usr/local/bin/ks-trust-update; do [ ! -L "$p" ] || fail 'Legacy path is a symlink; manual review required.'; done
  grep -qxF -- "--tls_hostname=$HOST" /etc/osquery/osquery.flags || fail 'Legacy agent belongs to another server. Nothing changed.'
  grep -qF "HOST=\"$HOST\"" /usr/local/bin/ks-trust-update || fail 'Cannot establish ownership of the legacy updater.'
  if [ "$OS" = macos ]; then
    [ ! -e /Library/LaunchDaemons/io.osquery.agent.plist ] || fail 'Generic osquery service present. Resolve ownership before migration.'
    grep -qF '<string>--flagfile=/etc/osquery/osquery.flags</string>' "$SERVICE" || fail 'Unexpected legacy service definition.'
    grep -qF '<string>/usr/local/bin/ks-trust-update</string>' /Library/LaunchDaemons/org.kebabstack.trust.update.plist || fail 'Unexpected updater definition.'
  else
    systemctl cat osqueryd > "$TMP/legacy.service"
    grep -qF 'osquery' "$TMP/legacy.service" || fail 'Unknown legacy Linux service.'
    grep -qF '/usr/local/bin/ks-trust-update' /etc/cron.d/ks-trust-update || fail 'Unknown legacy cron job.'
  fi
  LEGACY=1
fi
if [ "$ACTION" = preflight ]; then
  note 'Prerequisites passed. Downloads, service start and enrolment still need the pilot installation.'; exit 0
fi
[ -n "$SECRET" ] || fail 'Installer has no enrolment secret. Download a new installer from Trust.'
# Download into a root-private directory. Digest comes from the reviewed release manifest.
curl --proto '=https' --proto-redir '=https' --tlsv1.2 -fLsS --connect-timeout 15 --max-time 300 --retry 2 "$URL" -o "$TMP/agent.tgz"
if [ "$OS" = macos ]; then GOT=$(shasum -a 256 "$TMP/agent.tgz" | awk '{print $1}'); else GOT=$(sha256sum "$TMP/agent.tgz" | awk '{print $1}'); fi
[ "$GOT" = "$SHA" ] || fail 'Package SHA-256 mismatch. Current installation is unchanged.'
mkdir "$TMP/unpack"
# Extract only the expected regular binary from the hash-verified vendor archive.
tar -xzf "$TMP/agent.tgz" -C "$TMP/unpack" "$SOURCE"
BIN="$TMP/unpack/$SOURCE"
[ -f "$BIN" ] && [ ! -L "$BIN" ] || fail 'Expected osquery executable is missing.'
chmod 755 "$BIN"
if [ "$OS" = macos ]; then codesign --verify --strict -R='anchor apple generic and certificate leaf[subject.OU] = "3522FA9PXF"' "$BIN" || fail 'osquery publisher signature rejected.'; fi
"$BIN" --version | grep -qF "$VERSION" || fail 'Downloaded binary cannot run or has the wrong version.'
# Verify TLS reachability before stopping an existing agent. No credential in URL/output.
curl --proto '=https' --proto-redir '=https' --tlsv1.2 -fLsS --connect-timeout 15 --max-time 30 "https://$HOST/agent/health" -o "$TMP/health"
grep -qxF 'trust-agent-v2' "$TMP/health" || fail 'This Trust backend does not support the managed installer yet.'
if [ "$LEGACY" = 1 ]; then
  if [ "$OS" = macos ]; then
    for label in org.kebabstack.trust.update org.kebabstack.trust.osqueryd; do
      if launchctl print "system/$label" >/dev/null 2>&1; then launchctl bootout "system/$label" || fail 'Could not stop legacy Trust service.'; fi
    done
    rm -f /Library/LaunchDaemons/org.kebabstack.trust.update.plist
  else
    systemctl disable --now osqueryd
    rm -f /etc/cron.d/ks-trust-update
  fi
  # Retain generic binaries and databases: their ownership is not exclusive to Trust.
  rm -f /usr/local/bin/ks-trust-update /etc/osquery/osquery.flags /etc/osquery/enroll.secret
elif [ -e "$SERVICE" ]; then
  if [ "$OS" = macos ]; then
    if launchctl print system/org.kebabstack.trust.osqueryd >/dev/null 2>&1; then launchctl bootout system/org.kebabstack.trust.osqueryd; fi
  else systemctl stop kebabstack-trust.service; fi
fi
mkdir -p "$ROOT/bin" "$ROOT/db" "$ROOT/log"
chmod 700 "$ROOT" "$ROOT/db" "$ROOT/log"
printf '%s\n' "kebabstack-trust-v2:$HOST" > "$ROOT/owner"
install -m 755 "$BIN" "$ROOT/bin/osqueryd.new"
mv -f "$ROOT/bin/osqueryd.new" "$ROOT/bin/osqueryd"
printf '%s' "$SECRET" > "$ROOT/enroll.secret.new"
chmod 600 "$ROOT/enroll.secret.new"
mv -f "$ROOT/enroll.secret.new" "$ROOT/enroll.secret"
cat > "$ROOT/osquery.flags.new" <<FLAGS
@@FLAGS@@
--tls_server_certs=$CERTS
--enroll_secret_path=$ROOT/enroll.secret
--database_path=$ROOT/db
--logger_path=$ROOT/log
--pidfile=$ROOT/osquery.pid
FLAGS
chmod 600 "$ROOT/osquery.flags.new"
mv -f "$ROOT/osquery.flags.new" "$ROOT/osquery.flags"
if [ "$OS" = macos ]; then
  cat > "$TMP/service" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict><key>Label</key><string>org.kebabstack.trust.osqueryd</string><key>ProgramArguments</key><array><string>$ROOT/bin/osqueryd</string><string>--flagfile=$ROOT/osquery.flags</string></array><key>RunAtLoad</key><true/><key>KeepAlive</key><true/></dict></plist>
PLIST
  plutil -lint "$TMP/service" >/dev/null
  install -o root -g wheel -m 644 "$TMP/service" "$SERVICE"
  launchctl enable system/org.kebabstack.trust.osqueryd
  launchctl bootstrap system "$SERVICE"
else
  cat > "$TMP/service" <<UNIT
[Unit]
Description=KebabStack Trust device checks
After=network-online.target
Wants=network-online.target
[Service]
ExecStart=$ROOT/bin/osqueryd --flagfile=$ROOT/osquery.flags
Restart=on-failure
RestartSec=5
[Install]
WantedBy=multi-user.target
UNIT
  install -o root -g root -m 644 "$TMP/service" "$SERVICE"
  systemctl daemon-reload
  systemctl enable --now kebabstack-trust.service
fi
for attempt in 1 2 3 4 5; do if running; then note "osquery $VERSION service started. Verify enrolment and fresh checks in Trust before expanding the rollout."; exit 0; fi; sleep 2; done
fail 'Service did not stay running. Inspect MDM output and launchd/systemd logs; rerun the installer after fixing the error.'
