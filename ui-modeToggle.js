import { state, persist, forceViewModeConsistency } from "./state.js";

/**
 * Rend le commutateur "Tous les Pals (Global)" / "Mes Pals (Sauvegarde)"
 * dans le conteneur donné, et rappelle `onChange` à chaque changement de
 * mode effectif (y compris au premier rendu).
 *
 * Le bouton "Mes Pals" est désactivé (grisé) tant qu'il n'y a AUCUNE
 * source de possession — ni sauvegarde importée, ni pointage manuel.
 *
 * ⚠️ CORRECTIF : ce bouton ne regardait auparavant que `state.pals.length`
 * (sauvegarde importée), en oubliant complètement le pointage manuel ajouté
 * plus tard — du coup il restait grisé/inutilisable pour quelqu'un qui
 * n'utilise QUE le pointage manuel (ex: import de sauvegarde bloqué par un
 * format de compression non supporté). Corrigé pour vérifier les deux
 * sources.
 */
export function renderModeToggle(container, onChange) {
  forceViewModeConsistency();

  const hasOwnershipData = state.pals.length > 0 || Object.keys(state.manualOwned).length > 0;

  container.innerHTML = `
    <div class="inline-flex rounded-full bg-black/30 border border-emerald-800 p-1 text-xs sm:text-sm">
      <button
        data-mode="global"
        class="mode-toggle-btn px-3 py-1.5 rounded-full font-semibold transition"
      >🌍 Tous les Pals (Global)</button>
      <button
        data-mode="save"
        class="mode-toggle-btn px-3 py-1.5 rounded-full font-semibold transition"
        ${hasOwnershipData ? "" : "disabled"}
        title="${hasOwnershipData ? "" : "Importez une sauvegarde, ou pointez vos Pals manuellement (onglet Collection → Tous les Pals → bouton Je l'ai)"}"
      >💾 Mes Pals (Sauvegarde)</button>
    </div>
  `;

  const buttons = container.querySelectorAll(".mode-toggle-btn");

  function applyStyles() {
    buttons.forEach((btn) => {
      const isActive = btn.dataset.mode === state.viewMode;
      btn.classList.toggle("bg-amber-400", isActive);
      btn.classList.toggle("text-[#1a1207]", isActive);
      btn.classList.toggle("text-emerald-100/60", !isActive);
      btn.classList.toggle("opacity-40", btn.disabled);
      btn.classList.toggle("cursor-not-allowed", btn.disabled);
      btn.classList.toggle("cursor-pointer", !btn.disabled);
    });
  }

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.disabled) return;
      if (state.viewMode === btn.dataset.mode) return;
      state.viewMode = btn.dataset.mode;
      persist();
      applyStyles();
      onChange(state.viewMode);
    });
  });

  applyStyles();
  onChange(state.viewMode);
}
