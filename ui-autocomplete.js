/**
 * Autocomplétion personnalisée pour remplacer <input list="..."> +
 * <datalist> : le rendu natif d'un datalist est entièrement contrôlé par le
 * navigateur (impossible à styler proprement), et se comporte mal sur
 * mobile (positionnement, taille, thème clair imposé). Ce composant est un
 * simple menu déroulant en HTML/CSS classique, complètement sous contrôle.
 *
 * Usage :
 *   attachAutocomplete({
 *     inputEl: document.getElementById("target-search"),
 *     dropdownEl: document.getElementById("target-search-dropdown"),
 *     getOptions: () => allPalNames,       // tableau de chaînes, recalculé à chaque frappe
 *     onSelect: (value) => { ... },        // appelé quand une option est choisie
 *   });
 */
export function attachAutocomplete({ inputEl, dropdownEl, getOptions, onSelect }) {
  let currentMatches = [];
  let activeIndex = -1;
  const MAX_RESULTS = 40;

  function updateMatches() {
    const query = inputEl.value.trim().toLowerCase();
    const all = getOptions() || [];
    const filtered = query
      ? all.filter(name => name.toLowerCase().includes(query)).slice(0, MAX_RESULTS)
      : all.slice(0, MAX_RESULTS);
    render(filtered);
  }

  function render(matches) {
    currentMatches = matches;
    activeIndex = -1;

    if (!matches.length) {
      close();
      return;
    }

    dropdownEl.innerHTML = matches
      .map((opt, i) => `<button type="button" data-index="${i}" class="autocomplete-item">${escapeHtml(opt)}</button>`)
      .join("");
    dropdownEl.classList.remove("hidden");

    dropdownEl.querySelectorAll(".autocomplete-item").forEach(btn => {
      // "mousedown"/"touchstart" (pas "click") pour s'exécuter AVANT le
      // "blur" de l'input qui, sinon, fermerait le menu en premier.
      btn.addEventListener("mousedown", e => {
        e.preventDefault();
        select(matches[Number(btn.dataset.index)]);
      });
    });
  }

  function highlightActive() {
    dropdownEl.querySelectorAll(".autocomplete-item").forEach((el, i) => {
      el.classList.toggle("autocomplete-item-active", i === activeIndex);
      if (i === activeIndex) el.scrollIntoView({ block: "nearest" });
    });
  }

  function select(value) {
    inputEl.value = value;
    close();
    if (onSelect) onSelect(value);
  }

  function close() {
    dropdownEl.classList.add("hidden");
    dropdownEl.innerHTML = "";
    currentMatches = [];
    activeIndex = -1;
  }

  inputEl.addEventListener("input", updateMatches);
  inputEl.addEventListener("focus", updateMatches);
  inputEl.addEventListener("blur", () => setTimeout(close, 120));

  inputEl.addEventListener("keydown", e => {
    if (dropdownEl.classList.contains("hidden")) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      activeIndex = Math.min(activeIndex + 1, currentMatches.length - 1);
      highlightActive();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      activeIndex = Math.max(activeIndex - 1, 0);
      highlightActive();
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      select(currentMatches[activeIndex]);
    } else if (e.key === "Escape") {
      close();
    }
  });

  document.addEventListener("click", e => {
    if (e.target !== inputEl && !dropdownEl.contains(e.target)) close();
  });
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}
