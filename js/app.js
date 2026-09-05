/**
 * UI: builds the controls from the data, keeps the selection, redraws on change.
 *
 * Explanations are not printed under the controls: each one hides behind an
 * info marker, hoverable and focusable, so the panel stays scannable.
 */

(function () {
  var state = {
    gradeId: "cn",
    healthInsurance: true,
    selection: {}, // item id → true, or a count for "count" items
    situation: {
      seniorityYears: 2,
      seniorityMonths: 0,
      capital: 0,
      savingsRate: 15, // percent of the disposable net
      growthRate: 3, // percent a year, return and inflation folded together
      horizonYears: 25
    },
    categories: [
      { id: "cat-1", label: "Logement", amount: 0 },
      { id: "cat-2", label: "Alimentation", amount: 0 },
      { id: "cat-3", label: "Transport", amount: 0 }
    ]
  };

  /** Situation fields, in display order. */
  var SITUATION_FIELDS = [
    {
      key: "seniorityYears",
      label: "Ancienneté",
      unit: "ans",
      min: 0,
      max: 45,
      step: 1,
      note: "Ancienneté de carrière reconstituée, reprise des services antérieurs comprise. " +
        "C'est elle qui détermine l'échelon de départ de la projection, pas l'âge ni la date " +
        "de titularisation."
    },
    {
      key: "seniorityMonths",
      label: "Mois d'ancienneté",
      inline: true,
      unit: "mois",
      min: 0,
      max: 11,
      step: 1,
      note: "Le complément en mois. Les durées d'échelon comportent des demi-années, donc les " +
        "mois changent la date des prochains passages."
    },
    {
      key: "capital",
      label: "Capital actuel",
      unit: "€",
      min: 0,
      max: 10000000,
      step: 100,
      note: "Ce que tu as déjà de côté au démarrage de la projection, toutes enveloppes confondues."
    },
    {
      key: "savingsRate",
      label: "Taux d'épargne",
      unit: "%",
      min: 0,
      max: 100,
      step: 1,
      note: "Part du net disponible mise de côté chaque mois. Elle s'applique au net du moment, " +
        "donc l'épargne suit les passages d'échelon."
    },
    {
      key: "growthRate",
      label: "Croissance annuelle",
      unit: "%",
      min: -10,
      max: 20,
      step: 0.1,
      note: "Un seul taux, à toi de décider ce qu'il contient. Rendement d'un PEA, d'un compte " +
        "titres, d'un livret ou d'un bien, net de fiscalité si tu veux un montant dépensable, " +
        "et diminué de l'inflation si tu veux raisonner en pouvoir d'achat d'aujourd'hui."
    },
    {
      key: "horizonYears",
      label: "Horizon",
      unit: "ans",
      min: 1,
      max: 45,
      step: 1,
      note: "Durée de la projection."
    }
  ];

  var el = {
    controls: document.getElementById("controls"),
    canvas: document.getElementById("payChart"),
    legend: document.getElementById("legend"),
    situation: document.getElementById("situation"),
    projectionCanvas: document.getElementById("projectionChart"),
    projectionStats: document.getElementById("projectionStats"),
    projectionWarning: document.getElementById("projectionWarning"),
    projectionLegend: document.getElementById("projectionLegend"),
    budgetStats: document.getElementById("budgetStats"),
    budgetList: document.getElementById("budgetList"),
    saveNote: document.getElementById("saveNote")
  };

  var tipCount = 0;

  /** Typing in a number field should not rebuild two charts on every keystroke. */
  function debounce(fn, delay) {
    var timer = null;
    return function () {
      window.clearTimeout(timer);
      timer = window.setTimeout(fn, delay);
    };
  }

  /* Building the controls ------------------------------------------------- */

  function badge(item) {
    if (item.confidence === "verified") return "";
    return ' <span class="badge" title="Montant non recoupé sur source primaire">à recouper</span>';
  }

  /**
   * Info marker carrying an explanation, revealed on hover and on keyboard focus.
   * `key` gives a stable id where the markup is rebuilt on every update.
   */
  function infoMarker(text, key, direction) {
    if (!text) return "";
    var id;
    if (key) {
      id = "tip-" + key;
    } else {
      tipCount += 1;
      id = "tip-" + tipCount;
    }
    return (
      '<span class="info">' +
      '<button type="button" class="info-mark" aria-describedby="' + id +
      '" aria-label="Explication">i</button>' +
      '<span class="tip' + (direction === "up" ? " tip-up" : "") +
      '" role="tooltip" id="' + id + '">' + text + "</span>" +
      "</span>"
    );
  }

  /**
   * Flip a tooltip to the other edge when it would leave the viewport.
   * Runs on hidden elements too: visibility:hidden keeps the geometry.
   */
  function placeTooltips() {
    var tips = document.querySelectorAll(".tip");
    Array.prototype.forEach.call(tips, function (tip) {
      tip.classList.remove("tip-flip");
      var rect = tip.getBoundingClientRect();
      if (rect.right > window.innerWidth - 8) tip.classList.add("tip-flip");
    });
  }

  function optionRow(id, type, name, label, checked, note) {
    var row = document.createElement("div");
    row.className = "option";
    row.innerHTML =
      '<label class="option-label">' +
      '<input type="' + type + '" name="' + name + '" value="' + id + '"' +
      (checked ? " checked" : "") + ">" +
      "<span>" + label + "</span>" +
      "</label>" +
      infoMarker(note);
    return row;
  }

  function fieldset(legendText) {
    var box = document.createElement("fieldset");
    var legend = document.createElement("legend");
    legend.textContent = legendText;
    box.appendChild(legend);
    return box;
  }

  function buildGradeControl() {
    var box = fieldset("Grade");
    CAREER.grades.forEach(function (grade) {
      var row = optionRow(grade.id, "radio", "grade", grade.label, grade.id === state.gradeId, grade.note);
      row.querySelector("input").addEventListener("change", function () {
        state.gradeId = grade.id;
        update();
      });
      box.appendChild(row);
    });
    return box;
  }

  function buildItemControls(series) {
    var items = PAY_ITEMS.filter(function (item) {
      return item.series === series.id && item.control !== "always";
    });
    if (!items.length) return null;

    var box = fieldset(series.label);
    var groups = {};

    items.forEach(function (item) {
      if (item.control === "choice") {
        if (!groups[item.exclusiveGroup]) {
          groups[item.exclusiveGroup] = true;
          var noneLabel = (EXCLUSIVE_GROUPS[item.exclusiveGroup] || {}).noneLabel || "Aucune";
          var noneRow = optionRow("none", "radio", item.exclusiveGroup, noneLabel, true);
          noneRow.querySelector("input").addEventListener("change", function () {
            clearGroup(item.exclusiveGroup);
            update();
          });
          box.appendChild(noneRow);
        }
        var row = optionRow(item.id, "radio", item.exclusiveGroup, item.label + badge(item), false, item.note);
        row.querySelector("input").addEventListener("change", function () {
          clearGroup(item.exclusiveGroup);
          state.selection[item.id] = true;
          update();
        });
        box.appendChild(row);
      } else if (item.control === "toggle") {
        var toggle = optionRow(item.id, "checkbox", item.id, item.label + badge(item), false, item.note);
        toggle.dataset.requires = item.requires || "";
        toggle.querySelector("input").addEventListener("change", function (event) {
          state.selection[item.id] = event.target.checked;
          update();
        });
        box.appendChild(toggle);
      } else if (item.control === "count") {
        var wrap = document.createElement("div");
        wrap.className = "field";
        var head = document.createElement("div");
        head.className = "field-label";
        head.innerHTML = item.label + badge(item) + infoMarker(item.note);
        var select = document.createElement("select");
        select.id = "count-" + item.id;
        select.setAttribute("aria-label", item.label);
        for (var n = 0; n <= item.maxCount; n++) {
          var option = document.createElement("option");
          option.value = String(n);
          option.textContent =
            n === 0 ? "Aucune" : n + " " + item.unitLabel + (n > 1 ? "s" : "");
          select.appendChild(option);
        }
        select.addEventListener("change", function (event) {
          state.selection[item.id] = Number(event.target.value);
          update();
        });
        wrap.appendChild(head);
        wrap.appendChild(select);
        box.appendChild(wrap);
      }
    });
    return box;
  }

  function buildDisplayControl() {
    var box = fieldset("Affichage");
    var row = optionRow(
      "health",
      "checkbox",
      "health",
      "Complémentaire santé obligatoire",
      true,
      "Précomptée sur le bulletin de paie depuis le " + REFERENCE.healthInsurance.effectiveFrom +
        ", donc déjà déduite du net. " +
        PayChart.euroPrecise(REFERENCE.healthInsurance.monthlyEmployeeShare) +
        " à la charge de l'agent, autant payé par l'employeur. La décocher revient à " +
        "afficher la paie telle qu'elle était avant cette réforme."
    );
    row.querySelector("input").addEventListener("change", function (event) {
      state.healthInsurance = event.target.checked;
      update();
    });
    box.appendChild(row);
    return box;
  }

  function clearGroup(groupId) {
    PAY_ITEMS.forEach(function (item) {
      if (item.exclusiveGroup === groupId) delete state.selection[item.id];
    });
  }

  function buildControls() {
    el.controls.appendChild(buildGradeControl());
    INCOME_SERIES.forEach(function (series) {
      var box = buildItemControls(series);
      if (box) el.controls.appendChild(box);
    });
    el.controls.appendChild(buildDisplayControl());
  }

  /** Grey out a dependent control while its parent is off. */
  function syncDependencies() {
    var rows = el.controls.querySelectorAll(".option[data-requires]");
    Array.prototype.forEach.call(rows, function (row) {
      var requires = row.dataset.requires;
      if (!requires) return;
      var available = Boolean(state.selection[requires]);
      var input = row.querySelector("input");
      input.disabled = !available;
      row.classList.toggle("is-disabled", !available);
      if (!available && input.checked) {
        input.checked = false;
        state.selection[input.value] = false;
      }
    });
  }

  /* Rendering ------------------------------------------------------------- */

  /** Only the series that carry something, so the legend stays honest. */
  function activeSeries(rows) {
    return {
      income: INCOME_SERIES.filter(function (series) {
        return rows.some(function (row) {
          return row.income[series.id] > 0.005;
        });
      }),
      deductions: DEDUCTION_SERIES.filter(function (series) {
        return rows.some(function (row) {
          return row.deductions[series.id] > 0.005;
        });
      })
    };
  }

  function legendEntry(series, swatchStyle, swatchClass) {
    return (
      '<span class="legend-item">' +
      '<span class="swatch ' + (swatchClass || "") + '" style="' + swatchStyle + '"></span>' +
      series.label +
      infoMarker(series.note, "series-" + series.id, "up") +
      "</span>"
    );
  }

  function renderLegend(seriesUse) {
    var colors = PayChart.palette();
    var parts = [];
    seriesUse.income.forEach(function (series, index) {
      parts.push(legendEntry(series, "background:" + colors.income[index]));
    });
    seriesUse.deductions.forEach(function (series, index) {
      parts.push(legendEntry(series, "background:" + colors.deduction[index]));
    });
    parts.push(legendEntry(NET_SERIES, "background:" + colors.netLine, "is-line"));
    el.legend.innerHTML = parts.join("");
  }

  /* Situation, projection and budget ------------------------------------- */

  function buildSituation() {
    var lastLine = null;
    SITUATION_FIELDS.forEach(function (field) {
      var row = null;
      var line;
      if (field.inline && lastLine) {
        // Sits next to the field before it, sharing its label.
        line = lastLine;
      } else {
        row = document.createElement("div");
        row.className = "field";
        var head = document.createElement("div");
        head.className = "field-label";
        head.innerHTML = field.label + infoMarker(field.note, "field-" + field.key);
        row.appendChild(head);
        line = document.createElement("div");
        line.className = "field-row";
        row.appendChild(line);
        lastLine = line;
      }
      var input = document.createElement("input");
      input.type = "number";
      input.id = "situation-" + field.key;
      input.min = String(field.min);
      input.max = String(field.max);
      input.step = String(field.step);
      input.value = String(state.situation[field.key]);
      input.setAttribute("aria-label", field.label + " en " + field.unit);
      var unit = document.createElement("span");
      unit.className = "field-unit";
      unit.textContent = field.unit;
      input.addEventListener("input", function () {
        var value = Number(input.value);
        if (!isFinite(value)) return;
        state.situation[field.key] = Math.min(field.max, Math.max(field.min, value));
        scheduleUpdate();
      });
      line.appendChild(input);
      line.appendChild(unit);
      if (row) el.situation.appendChild(row);
    });
  }

  function seniorityMonths() {
    return Math.round(state.situation.seniorityYears * 12 + state.situation.seniorityMonths);
  }

  function projectionParams() {
    return {
      seniorityMonths: seniorityMonths(),
      capital: state.situation.capital,
      savingsRate: state.situation.savingsRate / 100,
      growthRate: state.situation.growthRate / 100,
      horizonYears: state.situation.horizonYears,
      selection: state.selection,
      healthInsurance: state.healthInsurance
    };
  }

  function statTile(label, value, hint, isOver) {
    return (
      '<div class="stat">' +
      '<span class="stat-label">' + label + "</span>" +
      '<span class="stat-value' + (isOver ? " is-over" : "") + '">' + value + "</span>" +
      (hint ? '<span class="stat-hint">' + hint + "</span>" : "") +
      "</div>"
    );
  }

  function renderProjection() {
    var params = projectionParams();
    var result = Projection.project(params);
    var final = result.final;
    var years = state.situation.horizonYears;

    el.projectionStats.innerHTML =
      statTile("Capital dans " + years + " ans", PayChart.euro(final.capital)) +
      statTile("Dont versements", PayChart.euro(final.contributed),
        "capital de départ compris") +
      statTile("Dont gains", PayChart.euro(final.gains),
        Math.round((final.gains / Math.max(1, final.capital)) * 100) + " % du total") +
      statTile("Épargne mensuelle", PayChart.euro(result.points[0].saved),
        "aujourd'hui, échelon " + result.points[0].step) +
      statTile("Épargne dans " + years + " ans", PayChart.euro(final.saved),
        "échelon " + final.step);

    PayChart.renderProjection(el.projectionCanvas, result, years);

    var colors = PayChart.palette();
    var keys = result.hasLoss
      ? '<span class="legend-item"><span class="swatch" style="background:' + colors.income[3] +
          '"></span>Capital</span>'
      : '<span class="legend-item"><span class="swatch" style="background:' + colors.income[0] +
          '"></span>Capital de départ et versements</span>' +
        '<span class="legend-item"><span class="swatch" style="background:' + colors.income[3] +
          '"></span>Gains cumulés</span>';

    var caveats = [
      "Classe normale uniquement, sans Pacte ni part modulable REP+, et la paie reste celle " +
        "du 11e échelon une fois la grille parcourue."
    ];
    if (result.hasLoss) {
      caveats.push(
        "Le taux de croissance étant négatif, les gains sont négatifs et le graphique montre " +
          "directement le capital, sans séparer les versements."
      );
    }
    el.projectionLegend.innerHTML =
      keys + '<span class="legend-item stat-hint">' + caveats.join(" ") + "</span>";

    // The grade selector above changes the bar chart but not the projection.
    el.projectionWarning.textContent =
      state.gradeId === "cn"
        ? ""
        : "Le grade choisi plus haut est la hors classe, mais la projection et le budget " +
          "restent calculés sur la classe normale. La promotion dépend d'un tableau " +
          "d'avancement, donc sa date ne peut pas être projetée.";
    el.projectionWarning.hidden = state.gradeId === "cn";
    return result;
  }

  function budgetFigures() {
    var current = Projection.currentPay(projectionParams());
    var net = current.pay.netDisposable;
    var saved = net * (state.situation.savingsRate / 100);
    var budget = net - saved;
    var allocated = state.categories.reduce(function (sum, category) {
      return sum + (Number(category.amount) || 0);
    }, 0);
    return {
      step: current.step,
      net: net,
      saved: saved,
      budget: budget,
      allocated: allocated,
      remaining: budget - allocated
    };
  }

  function refreshBudget() {
    var figures = budgetFigures();
    var over = figures.remaining < -0.5;

    el.budgetStats.innerHTML =
      statTile("Net disponible", PayChart.euro(figures.net), "échelon " + figures.step) +
      statTile("Épargne", PayChart.euro(figures.saved),
        state.situation.savingsRate + " % du net") +
      statTile("Budget mensuel", PayChart.euro(figures.budget), "ce qui reste à dépenser") +
      statTile(over ? "Dépassement" : "Reste à allouer",
        PayChart.euro(Math.abs(figures.remaining)),
        PayChart.euro(figures.allocated) + " déjà alloués", over);

    var widest = state.categories.reduce(function (max, category) {
      return Math.max(max, Number(category.amount) || 0);
    }, 0);
    state.categories.forEach(function (category) {
      var bar = el.budgetList.querySelector('[data-bar="' + category.id + '"] span');
      if (bar) {
        var amount = Number(category.amount) || 0;
        bar.style.width = widest > 0 ? (amount / widest) * 100 + "%" : "0%";
      }
    });
  }

  /** Rebuilt only when a row is added or removed, so typing never loses focus. */
  function renderBudgetList() {
    el.budgetList.innerHTML = "";
    if (!state.categories.length) {
      var empty = document.createElement("p");
      empty.className = "budget-empty";
      empty.textContent = "Aucune catégorie. Ajoute celles qui correspondent à tes dépenses.";
      el.budgetList.appendChild(empty);
      refreshBudget();
      return;
    }

    state.categories.forEach(function (category) {
      var row = document.createElement("div");
      row.className = "budget-row";

      var name = document.createElement("input");
      name.type = "text";
      name.value = category.label;
      name.setAttribute("aria-label", "Nom de la catégorie");
      name.addEventListener("input", function () {
        category.label = name.value;
        persist();
      });

      var amount = document.createElement("input");
      amount.type = "number";
      amount.min = "0";
      amount.step = "10";
      amount.value = String(category.amount);
      amount.setAttribute("aria-label", "Montant mensuel en euros");
      amount.addEventListener("input", function () {
        var value = Number(amount.value);
        category.amount = isFinite(value) && value >= 0 ? value : 0;
        refreshBudget();
        persist();
      });

      var bar = document.createElement("div");
      bar.className = "budget-bar";
      bar.setAttribute("data-bar", category.id);
      bar.appendChild(document.createElement("span"));

      var remove = document.createElement("button");
      remove.type = "button";
      remove.className = "icon-button";
      remove.innerHTML = "&times;";
      remove.setAttribute("aria-label", "Supprimer la catégorie " + category.label);
      remove.addEventListener("click", function () {
        state.categories = state.categories.filter(function (item) {
          return item.id !== category.id;
        });
        renderBudgetList();
        persist();
      });

      row.appendChild(name);
      row.appendChild(amount);
      row.appendChild(bar);
      row.appendChild(remove);
      el.budgetList.appendChild(row);
    });
    refreshBudget();
  }

  function addCategory() {
    state.categories.push({
      id: "cat-" + Date.now(),
      label: "Nouvelle catégorie",
      amount: 0
    });
    renderBudgetList();
    persist();
    var rows = el.budgetList.querySelectorAll(".budget-row input[type=text]");
    if (rows.length) rows[rows.length - 1].select();
  }

  /* Persistence ----------------------------------------------------------- */

  function persist() {
    var saved = Storage.save(state);
    el.saveNote.textContent = saved
      ? "Tes réglages sont enregistrés dans ce navigateur, sur cet appareil seulement. " +
        "L'export produit un fichier que tu peux garder ou reprendre ailleurs."
      : "Ce navigateur refuse l'enregistrement local, en navigation privée par exemple. " +
        "Utilise l'export pour ne rien perdre.";
  }

  function applyLoaded(data) {
    Storage.apply(state, data);
    // The field bounds guard the live inputs; an imported file bypasses them,
    // and an horizon of 900 years would loop for nothing.
    SITUATION_FIELDS.forEach(function (field) {
      var value = Number(state.situation[field.key]);
      state.situation[field.key] = isFinite(value)
        ? Math.min(field.max, Math.max(field.min, value))
        : field.min;
    });
    SITUATION_FIELDS.forEach(function (field) {
      var input = document.getElementById("situation-" + field.key);
      if (input) input.value = String(state.situation[field.key]);
    });
    syncSalaryControls();
    renderBudgetList();
    update();
  }

  /** Push the loaded selection back into the salary controls. */
  function syncSalaryControls() {
    var inputs = el.controls.querySelectorAll("input");
    Array.prototype.forEach.call(inputs, function (input) {
      if (input.name === "grade") {
        input.checked = input.value === state.gradeId;
      } else if (input.name === "health") {
        input.checked = state.healthInsurance;
      } else if (input.type === "checkbox") {
        input.checked = Boolean(state.selection[input.value]);
      } else if (input.type === "radio") {
        input.checked = input.value === "none"
          ? !PAY_ITEMS.some(function (item) {
              return item.exclusiveGroup === input.name && state.selection[item.id];
            })
          : Boolean(state.selection[input.value]);
      }
    });
    PAY_ITEMS.forEach(function (item) {
      if (item.control !== "count") return;
      var select = document.getElementById("count-" + item.id);
      if (select) select.value = String(Number(state.selection[item.id]) || 0);
    });
  }

  function bindActions() {
    document.getElementById("addCategory").addEventListener("click", addCategory);

    document.getElementById("resetSituation").addEventListener("click", function () {
      var confirmed = window.confirm(
        "Effacer la situation, le budget et les réglages enregistrés dans ce navigateur ?"
      );
      if (!confirmed) return;
      Storage.clear();
      window.location.reload();
    });

    document.getElementById("exportJson").addEventListener("click", function () {
      Storage.exportJson(state);
    });

    document.getElementById("importJson").addEventListener("change", function (event) {
      var file = event.target.files && event.target.files[0];
      if (!file) return;
      Storage.importJson(file, function (data, error) {
        if (error || !data) {
          el.saveNote.textContent = "Import impossible. " + (error || "");
          return;
        }
        applyLoaded(data);
        persist();
      });
      event.target.value = "";
    });

    document.getElementById("exportPng").addEventListener("click", function () {
      Storage.exportPng(el.projectionCanvas, "projection-epargne.png", PayChart.palette().surface);
    });
  }

  function update() {
    syncDependencies();
    var rows = Model.computeGrade(state.gradeId, state.selection, {
      healthInsurance: state.healthInsurance
    });
    var labels = rows.map(function (row) {
      return String(row.step);
    });
    var seriesUse = activeSeries(rows);
    PayChart.render(el.canvas, rows, labels, seriesUse);
    renderLegend(seriesUse);
    renderProjection();
    refreshBudget();
    placeTooltips();
    persist();
  }

  var scheduleUpdate = debounce(function () {
    update();
  }, 180);

  buildControls();
  buildSituation();
  bindActions();
  // applyLoaded rebuilds the budget list and triggers the first render.
  applyLoaded(Storage.load());

  window.addEventListener("resize", placeTooltips);

  // Chart.js reads colours once, so a theme change needs a redraw.
  if (window.matchMedia) {
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", update);
  }
})();
