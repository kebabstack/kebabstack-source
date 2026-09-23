// Appearance preference only; no identifier, analytics or cross-site storage.
try {
  const theme = localStorage.getItem("kebabstack-appearance");
  if (theme === "light" || theme === "dark")
    document.documentElement.dataset.theme = theme;
} catch {
  /* System colour scheme remains available without storage. */
}
