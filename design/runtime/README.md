# One runtime design source

`design/tokens.json` supplies the semantic values. `hub/dist/tokens.css` is the
canonical generated runtime sheet. `hub/dist/components.css` supplies workspace
controls; application layouts remain in their modules. Both sheets are distributed
together to all official frontend sources, including Kitchen. The shared client
and sign-in mark use the exact geometry in `design/brand/registry.json`.

Run `npm run runtime:sync` after editing, then `npm run runtime:check`. The release
packer rejects drift. App templates load components after app styles and opt in
with `body.ks-workspace`. Print output and game rendering retain scoped styles;
the game account and app menu still use the shared SDK. No external font request,
new login service, data migration or permission grant is involved.

A new app uses these sources, the registered product mark and shared sign-in.
Document component states and keyboard behavior before adding a new pattern.
