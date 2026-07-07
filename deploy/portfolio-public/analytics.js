(function () {
  const script = document.currentScript;
  const endpoint = script?.dataset.endpoint || "";
  const siteId = script?.dataset.siteId || "portfolio";
  const respectPrivacy =
    navigator.doNotTrack === "1" ||
    navigator.globalPrivacyControl === true ||
    window.localStorage.getItem("portfolio_analytics_disabled") === "true";

  function storeLocal(eventName) {
    const key = "portfolio_local_events";
    const events = JSON.parse(window.localStorage.getItem(key) || "[]");
    events.push({ event: eventName, at: new Date().toISOString(), path: location.pathname });
    window.localStorage.setItem(key, JSON.stringify(events.slice(-50)));
  }

  function send(eventName, data = {}) {
    storeLocal(eventName);
    if (!endpoint || respectPrivacy) return;

    const payload = {
      siteId,
      event: eventName,
      path: location.pathname,
      target: data.target || "",
      value: data.value || "",
      at: new Date().toISOString()
    };

    const body = JSON.stringify(payload);
    if (navigator.sendBeacon) {
      navigator.sendBeacon(endpoint, new Blob([body], { type: "application/json" }));
      return;
    }

    fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      keepalive: true
    }).catch(() => {});
  }

  send("page_view");

  document.addEventListener("click", (event) => {
    const tracked = event.target.closest("[data-track]");
    if (!tracked) return;
    send("interaction", { target: tracked.dataset.track });
  });

  window.addEventListener("portfolio:event", (event) => {
    send(event.detail.name, {
      target: event.detail.signal || event.detail.filter || "",
      value: event.detail.value || ""
    });
  });
})();
