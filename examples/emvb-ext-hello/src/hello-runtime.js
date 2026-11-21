// emvb-ext-hello runtime (W-1086): a self-contained script, no import or export. EmVB loads it
// only on pages that show a Greeting. It marks each card ready and, unless the visitor asked for
// reduced motion, starts the one-time wave.
(() => {
  const reduce = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
  for (const card of document.querySelectorAll(".hello-card")) {
    if (card.dataset.helloReady !== undefined) continue;
    card.dataset.helloReady = "";
    if (reduce) continue;
    for (const title of card.querySelectorAll(".hello-wave")) title.dataset.helloWave = "on";
  }
})();
