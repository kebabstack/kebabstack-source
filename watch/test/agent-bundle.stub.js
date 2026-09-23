// smoke stub: fake HttpAgent/Actor that answers from a scripted backend
export const HttpAgent = { create: async () => ({}) };
export const Actor = { createActor: (idl, { canisterId }) => globalThis.__fakeBackend };
