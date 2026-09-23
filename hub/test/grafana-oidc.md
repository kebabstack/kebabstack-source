# Grafana against the hub (OpenID Connect) — the real-app test

Grafana is the most common "we just want SSO" case and uses the standard
Go oauth2 library, so it exercises the provider exactly like a vendor app would.
Ten minutes, Docker only.

## 1 · Create the client in the hub

Apps → **Sign-in for other apps** → Add an app:

- Name `Grafana`, type **Server app**, signature RS256, consent once
- Redirect URI: `http://localhost:3000/login/generic_oauth`
- What it may know: groups (for the role mapping below)

Copy the client id and secret from the result box; the provider values are
`<issuer>` = the hub backend URL shown on that tab.

## 2 · Run Grafana

```bash
docker run --rm -p 3000:3000 --name grafana-oidc \
  -e GF_SERVER_ROOT_URL=http://localhost:3000 \
  -e GF_AUTH_GENERIC_OAUTH_ENABLED=true \
  -e GF_AUTH_GENERIC_OAUTH_NAME="kebab-stack hub" \
  -e GF_AUTH_GENERIC_OAUTH_CLIENT_ID=<client id> \
  -e GF_AUTH_GENERIC_OAUTH_CLIENT_SECRET=<client secret> \
  -e GF_AUTH_GENERIC_OAUTH_SCOPES="openid profile email groups" \
  -e GF_AUTH_GENERIC_OAUTH_AUTH_URL=<issuer>/oidc/authorize \
  -e GF_AUTH_GENERIC_OAUTH_TOKEN_URL=<issuer>/oidc/token \
  -e GF_AUTH_GENERIC_OAUTH_API_URL=<issuer>/oidc/userinfo \
  -e GF_AUTH_GENERIC_OAUTH_USE_PKCE=true \
  -e GF_AUTH_GENERIC_OAUTH_EMAIL_ATTRIBUTE_PATH=email \
  -e GF_AUTH_GENERIC_OAUTH_LOGIN_ATTRIBUTE_PATH=preferred_username \
  -e GF_AUTH_GENERIC_OAUTH_NAME_ATTRIBUTE_PATH=name \
  -e GF_AUTH_GENERIC_OAUTH_ROLE_ATTRIBUTE_PATH="contains(groups[*], 'IT') && 'Admin' || 'Viewer'" \
  -e GF_AUTH_GENERIC_OAUTH_ALLOW_SIGN_UP=true \
  grafana/grafana:latest
```

Open http://localhost:3000 → **Sign in with kebab-stack hub** → passkey →
consent card → Grafana. A person in the hub group `IT` lands as Admin,
everyone else as Viewer (edit the JMESPath to taste).

## 3 · What to verify

- The consent card names Grafana and lists "who you are · your groups".
- Grafana shows the person's name and e-mail; Server admin → Users shows the
  role from the group mapping.
- **Lock-out:** deactivate the person in the hub → log out of Grafana → the
  next "Sign in with kebab-stack hub" is refused with "this app is not
  available to you" and the hub journal has one DENIED line.
- **Access policy:** Apps → Connected apps → Grafana → Who may use it →
  selected group → a person outside it cannot sign in.
- Second sign-in of the same person: no consent card (consent once).

## Notes

Grafana reads claims from the userinfo endpoint (API URL); it does not verify
the id_token signature itself — the `oidc-rp.mjs` script does that part.
`GF_AUTH_GENERIC_OAUTH_USE_PKCE=true` makes Grafana send a code challenge; with
PKCE off it still works (confidential client), and the hub's downgrade
protection is untouched because Grafana then sends no verifier either.
