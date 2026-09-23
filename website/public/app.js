(() => {
  const explorer = document.querySelector("[data-explorer]");
  if (explorer) {
    const nav = explorer.querySelector(".app-tabs");
    const tabs = [...nav.querySelectorAll("a")];
    const panels = tabs.map((tab) =>
      document.getElementById(tab.hash.slice(1)),
    );
    const activate = (index, focus = false) => {
      tabs.forEach((tab, i) => {
        tab.setAttribute("aria-selected", String(i === index));
        tab.tabIndex = i === index ? 0 : -1;
        panels[i].hidden = i !== index;
      });
      if (focus) {
        tabs[index].focus({ preventScroll: true });
        tabs[index].scrollIntoView?.({ block: "nearest", inline: "nearest" });
      }
    };
    nav.setAttribute("role", "tablist");
    tabs.forEach((tab, index) => {
      tab.setAttribute("role", "tab");
      tab.setAttribute("aria-controls", panels[index].id);
      panels[index].setAttribute("role", "tabpanel");
      panels[index].setAttribute("aria-labelledby", tab.id);
      panels[index].tabIndex = 0;
      tab.addEventListener("click", (event) => {
        event.preventDefault();
        activate(index);
        history.replaceState(null, "", tab.hash);
      });
      tab.addEventListener("keydown", (event) => {
        let next;
        if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
        if (event.key === "ArrowLeft")
          next = (index - 1 + tabs.length) % tabs.length;
        if (event.key === "Home") next = 0;
        if (event.key === "End") next = tabs.length - 1;
        if (next === undefined) return;
        event.preventDefault();
        activate(next, true);
        history.replaceState(null, "", tabs[next].hash);
      });
    });
    const applyHash = (initial = false) => {
      const index = tabs.findIndex((tab) => tab.hash === location.hash);
      if (index >= 0) activate(index);
      else if (initial)
        activate(tabs.findIndex((tab) => tab.id === "tab-desk"));
    };
    applyHash(true);
    window.addEventListener("hashchange", () => applyHash());
    // Arrive with the app choices visible, rather than underneath the pinned bar.
    document
      .querySelectorAll('a[href^="#app-"]:not(.app-tab)')
      .forEach((link) => {
        link.addEventListener("click", (event) => {
          const index = tabs.findIndex((tab) => tab.hash === link.hash);
          if (index < 0) return;
          event.preventDefault();
          activate(index);
          history.pushState(null, "", link.hash);
          nav.scrollIntoView?.({ block: "start" });
          panels[index].focus({ preventScroll: true });
        });
      });
    window.addEventListener(
      "load",
      () => {
        if (tabs.some((tab) => tab.hash === location.hash))
          nav.scrollIntoView?.({ block: "start" });
      },
      { once: true },
    );
    explorer.classList.add("enhanced");
  }
  const toggle = document.querySelector(".menu-toggle");
  const menu = document.getElementById("mobile-nav");
  if (toggle && menu) {
    toggle.hidden = false;
    const close = (focus = false) => {
      toggle.setAttribute("aria-expanded", "false");
      toggle.setAttribute("aria-label", toggle.dataset.openLabel);
      menu.hidden = true;
      if (focus) toggle.focus();
    };
    toggle.addEventListener("click", () => {
      const expanded = toggle.getAttribute("aria-expanded") !== "true";
      toggle.setAttribute("aria-expanded", String(expanded));
      toggle.setAttribute(
        "aria-label",
        expanded ? toggle.dataset.closeLabel : toggle.dataset.openLabel,
      );
      menu.hidden = !expanded;
    });
    menu
      .querySelectorAll("a")
      .forEach((a) => a.addEventListener("click", () => close()));
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !menu.hidden) close(true);
    });
    const wide = window.matchMedia("(min-width: 1121px)");
    wide.addEventListener("change", (event) => {
      if (event.matches) close();
    });
  }
  // Scenes are a local, editorial walkthrough. These controls never call an app.
  document.querySelectorAll("[data-scenario]").forEach((scenario) => {
    const controls = scenario.querySelector("[data-demo-controls]");
    if (!controls) return;
    const buttons = [...controls.querySelectorAll("[data-scene]")];
    const scenes = buttons.map((button) =>
      document.getElementById(button.dataset.scene),
    );
    const show = (index) => {
      buttons.forEach((button, i) =>
        button.setAttribute("aria-pressed", String(i === index)),
      );
      scenes.forEach((scene, i) => {
        scene.hidden = i !== index;
      });
    };
    buttons.forEach((button, i) =>
      button.addEventListener("click", () => show(i)),
    );
    controls.hidden = false;
    scenario.classList.add("is-interactive");
    show(0);
  });
  const themes = [
    ...document.querySelectorAll("[data-theme-choice], #theme-choice"),
  ];
  themes.forEach((select) => {
    select.closest("label").hidden = false;
    select.value = document.documentElement.dataset.theme || "system";
    select.addEventListener("change", () => {
      const value = select.value;
      if (value === "system") delete document.documentElement.dataset.theme;
      else document.documentElement.dataset.theme = value;
      try {
        localStorage.setItem("kebabstack-appearance", value);
      } catch {}
      themes.forEach((other) => {
        other.value = value;
      });
    });
  });
  document
    .querySelectorAll(".language-switch a, .footer-language")
    .forEach((link) => {
      link.addEventListener("click", () => {
        link.hash = location.hash;
      });
    });
})();
