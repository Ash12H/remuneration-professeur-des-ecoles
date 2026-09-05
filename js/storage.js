/**
 * Local persistence.
 *
 * The browser store keeps the page usable day to day; the JSON export makes the
 * data portable and survives a cleared cache. Every access is guarded: private
 * windows and blocked site data make localStorage throw rather than return null.
 */

var Storage = (function () {
  var KEY = "pe-budget-v1";
  var VERSION = 1;

  function save(state) {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(serialise(state)));
      return true;
    } catch (error) {
      return false;
    }
  }

  function load() {
    try {
      var raw = window.localStorage.getItem(KEY);
      if (!raw) return null;
      var data = JSON.parse(raw);
      return data && data.version === VERSION ? data : null;
    } catch (error) {
      return null;
    }
  }

  function clear() {
    try {
      window.localStorage.removeItem(KEY);
    } catch (error) {
      /* nothing to do, the store is unavailable */
    }
  }

  function serialise(state) {
    return {
      version: VERSION,
      savedAt: new Date().toISOString(),
      gradeId: state.gradeId,
      healthInsurance: state.healthInsurance,
      selection: state.selection,
      situation: state.situation,
      categories: state.categories
    };
  }

  /** Merge a loaded payload into the live state, field by field. */
  function apply(state, data) {
    if (!data) return state;
    if (typeof data.gradeId === "string") state.gradeId = data.gradeId;
    if (typeof data.healthInsurance === "boolean") state.healthInsurance = data.healthInsurance;
    if (data.selection && typeof data.selection === "object") state.selection = data.selection;
    if (data.situation && typeof data.situation === "object") {
      Object.keys(state.situation).forEach(function (key) {
        var value = Number(data.situation[key]);
        if (isFinite(value)) state.situation[key] = value;
      });
    }
    if (Array.isArray(data.categories)) {
      state.categories = data.categories
        .filter(function (item) {
          return item && typeof item.label === "string";
        })
        .map(function (item, index) {
          return {
            id: typeof item.id === "string" ? item.id : "cat-" + index,
            label: item.label,
            amount: isFinite(Number(item.amount)) ? Number(item.amount) : 0
          };
        });
    }
    return state;
  }

  function download(filename, content, type) {
    var blob = new Blob([content], { type: type });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1000);
  }

  function exportJson(state) {
    var stamp = new Date().toISOString().slice(0, 10);
    download("budget-pe-" + stamp + ".json", JSON.stringify(serialise(state), null, 2), "application/json");
  }

  function importJson(file, onLoaded) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        onLoaded(JSON.parse(String(reader.result)));
      } catch (error) {
        onLoaded(null, "Fichier illisible.");
      }
    };
    reader.onerror = function () {
      onLoaded(null, "Lecture impossible.");
    };
    reader.readAsText(file);
  }

  function exportPng(canvas, filename, background) {
    // The canvas is transparent, so it is flattened onto the chart surface first.
    var flat = document.createElement("canvas");
    flat.width = canvas.width;
    flat.height = canvas.height;
    var context = flat.getContext("2d");
    context.fillStyle = background;
    context.fillRect(0, 0, flat.width, flat.height);
    context.drawImage(canvas, 0, 0);
    flat.toBlob(function (blob) {
      var url = URL.createObjectURL(blob);
      var link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(function () {
        URL.revokeObjectURL(url);
      }, 1000);
    });
  }

  return {
    save: save,
    load: load,
    clear: clear,
    apply: apply,
    exportJson: exportJson,
    importJson: importJson,
    exportPng: exportPng
  };
})();
