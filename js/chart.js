/**
 * Chart rendering.
 *
 * One stacked column per career step: income above the zero line, payroll
 * deductions below it, and the disposable net drawn as a line on the same scale.
 * The line is drawn by a plugin rather than a second axis, because a second
 * y-scale would be a dual-axis chart.
 */

var PayChart = (function () {
  var instance = null;

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function palette() {
    return {
      surface: cssVar("--surface-1"),
      grid: cssVar("--gridline"),
      axis: cssVar("--axis"),
      muted: cssVar("--text-muted"),
      secondary: cssVar("--text-secondary"),
      primary: cssVar("--text-primary"),
      netLine: cssVar("--net-line"),
      income: [1, 2, 3, 4, 5].map(function (n) {
        return cssVar("--income-" + n);
      }),
      deduction: [1, 2, 3, 4, 5].map(function (n) {
        return cssVar("--deduction-" + n);
      })
    };
  }

  function euro(value) {
    return Math.round(value).toLocaleString("fr-FR") + " €";
  }

  /** Two decimals, for the few figures that are quoted exactly. */
  function euroPrecise(value) {
    return value.toLocaleString("fr-FR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }) + " €";
  }

  /** For each column, which dataset carries the top and the bottom of the stack. */
  function stackEnds(datasets, count) {
    var top = [];
    var bottom = [];
    for (var i = 0; i < count; i++) {
      top[i] = -1;
      bottom[i] = -1;
      datasets.forEach(function (dataset, index) {
        var value = dataset.data[i];
        if (value > 0) top[i] = index;
        if (value < 0) bottom[i] = index;
      });
    }
    return { top: top, bottom: bottom };
  }

  var netLinePlugin = {
    id: "netLine",
    afterDatasetsDraw: function (chart, args, options) {
      var values = options.values || [];
      if (!values.length) return;
      var ctx = chart.ctx;
      var xScale = chart.scales.x;
      var yScale = chart.scales.y;
      var points = values.map(function (value, index) {
        return { x: xScale.getPixelForValue(index), y: yScale.getPixelForValue(value) };
      });

      ctx.save();
      ctx.strokeStyle = options.color;
      ctx.lineWidth = 2;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.beginPath();
      points.forEach(function (point, index) {
        if (index === 0) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
      });
      ctx.stroke();

      // 2px surface ring so the markers stay legible over the fills.
      points.forEach(function (point) {
        ctx.beginPath();
        ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = options.color;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = options.surface;
        ctx.stroke();
      });
      ctx.restore();
    }
  };

  /**
   * @param canvas    target canvas element
   * @param rows      output of Model.computeGrade
   * @param labels    column labels
   * @param seriesUse which series to show, income first then deductions
   */
  function render(canvas, rows, labels, seriesUse) {
    var colors = palette();
    var netValues = rows.map(function (row) {
      return row.netDisposable;
    });

    var datasets = [];
    seriesUse.income.forEach(function (series, position) {
      datasets.push({
        label: series.label,
        data: rows.map(function (row) {
          return row.income[series.id];
        }),
        backgroundColor: colors.income[position],
        stack: "pay"
      });
    });
    seriesUse.deductions.forEach(function (series, position) {
      datasets.push({
        label: series.label,
        data: rows.map(function (row) {
          return -row.deductions[series.id];
        }),
        backgroundColor: colors.deduction[position],
        stack: "pay"
      });
    });

    var ends = stackEnds(datasets, rows.length);

    datasets.forEach(function (dataset, index) {
      // A 2px surface gap separates touching segments: 1px drawn on each side
      // of the shared edge, in the surface colour, never a contrasting stroke.
      dataset.borderColor = colors.surface;
      dataset.borderWidth = { top: 1, bottom: 1, left: 0, right: 0 };
      dataset.borderSkipped = false;
      dataset.maxBarThickness = 24;
      dataset.borderRadius = function (context) {
        var flat = { topLeft: 0, topRight: 0, bottomLeft: 0, bottomRight: 0 };
        if (ends.top[context.dataIndex] === index) {
          return { topLeft: 4, topRight: 4, bottomLeft: 0, bottomRight: 0 };
        }
        if (ends.bottom[context.dataIndex] === index) {
          return { topLeft: 0, topRight: 0, bottomLeft: 4, bottomRight: 4 };
        }
        return flat;
      };
    });

    if (instance) instance.destroy();
    instance = new Chart(canvas.getContext("2d"), {
      type: "bar",
      data: { labels: labels, datasets: datasets },
      plugins: [netLinePlugin],
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        layout: { padding: { top: 8 } },
        scales: {
          x: {
            stacked: true,
            grid: { display: false },
            border: { color: colors.axis },
            ticks: { color: colors.muted },
            title: {
              display: true,
              text: "Échelon",
              color: colors.muted,
              font: { size: 12 }
            }
          },
          y: {
            stacked: true,
            grid: { color: colors.grid, lineWidth: 1, drawTicks: false },
            border: { display: false },
            ticks: {
              color: colors.muted,
              padding: 8,
              callback: function (value) {
                return value.toLocaleString("fr-FR");
              }
            },
            title: {
              display: true,
              text: "€ par mois",
              color: colors.muted,
              font: { size: 12 }
            }
          }
        },
        plugins: {
          legend: { display: false },
          netLine: { values: netValues, color: colors.netLine, surface: colors.surface },
          tooltip: {
            backgroundColor: colors.primary,
            titleColor: colors.surface,
            bodyColor: colors.surface,
            padding: 10,
            cornerRadius: 6,
            displayColors: true,
            boxWidth: 10,
            boxHeight: 10,
            boxPadding: 4,
            filter: function (item) {
              return Math.abs(item.raw) >= 0.5;
            },
            callbacks: {
              label: function (item) {
                return " " + item.dataset.label + "  " + euro(item.raw);
              },
              footer: function (items) {
                if (!items.length) return "";
                var row = rows[items[0].dataIndex];
                return [
                  "Brut  " + euro(row.gross),
                  "Net avant impôt  " + euro(row.netBeforeTax),
                  "Net disponible  " + euro(row.netDisposable)
                ].join("\n");
              }
            }
          }
        }
      }
    });
    return instance;
  }

  var projectionInstance = null;

  /** Compact euro for axis ticks and stat tiles: 12 400 € → 12,4 k€. */
  function euroCompact(value) {
    if (Math.abs(value) >= 1000000) {
      return (value / 1000000).toLocaleString("fr-FR", { maximumFractionDigits: 2 }) + " M€";
    }
    if (Math.abs(value) >= 1000) {
      return Math.round(value / 1000).toLocaleString("fr-FR") + " k€";
    }
    return Math.round(value).toLocaleString("fr-FR") + " €";
  }

  /** Tick spacing in months, so the axis carries a handful of round years. */
  function yearStep(horizonYears) {
    if (horizonYears <= 6) return 1;
    if (horizonYears <= 12) return 2;
    if (horizonYears <= 30) return 5;
    return 10;
  }

  /**
   * Capital over time, as a stacked area: what was paid in, and what the growth
   * rate added on top. The two together are the capital.
   */
  function renderProjection(canvas, projection, horizonYears) {
    var colors = palette();
    var points = projection.points;
    var step = yearStep(horizonYears) * 12;

    var datasets = projection.hasLoss
      ? [
          {
            label: "Capital",
            data: points.map(function (point) {
              return point.capital;
            }),
            backgroundColor: colors.income[0],
            borderColor: colors.income[3],
            borderWidth: 2,
            fill: "origin",
            pointRadius: 0,
            pointHoverRadius: 0,
            tension: 0
          }
        ]
      : [
          {
            label: "Capital de départ et versements",
            data: points.map(function (point) {
              return point.contributed;
            }),
            backgroundColor: colors.income[0],
            borderColor: colors.income[0],
            borderWidth: 0,
            fill: "origin",
            pointRadius: 0,
            pointHoverRadius: 0,
            tension: 0
          },
          {
            label: "Gains cumulés",
            data: points.map(function (point) {
              return point.gains;
            }),
            backgroundColor: colors.income[3],
            borderColor: colors.income[3],
            borderWidth: 0,
            fill: "-1",
            pointRadius: 0,
            pointHoverRadius: 0,
            tension: 0
          }
        ];

    if (projectionInstance) projectionInstance.destroy();
    projectionInstance = new Chart(canvas.getContext("2d"), {
      type: "line",
      data: {
        labels: points.map(function (point) {
          return point.month;
        }),
        datasets: datasets
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        scales: {
          x: {
            stacked: true,
            grid: { display: false },
            border: { color: colors.axis },
            ticks: {
              color: colors.muted,
              autoSkip: false,
              maxRotation: 0,
              callback: function (value, index) {
                return index % step === 0 ? index / 12 : "";
              }
            },
            title: {
              display: true,
              text: "Années à partir d'aujourd'hui",
              color: colors.muted,
              font: { size: 12 }
            }
          },
          y: {
            stacked: !projection.hasLoss,
            grid: { color: colors.grid, lineWidth: 1, drawTicks: false },
            border: { display: false },
            ticks: {
              color: colors.muted,
              padding: 8,
              callback: function (value) {
                return euroCompact(value);
              }
            }
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: colors.primary,
            titleColor: colors.surface,
            bodyColor: colors.surface,
            padding: 10,
            cornerRadius: 6,
            boxWidth: 10,
            boxHeight: 10,
            boxPadding: 4,
            callbacks: {
              title: function (items) {
                var point = points[items[0].dataIndex];
                var years = Math.floor(point.month / 12);
                var months = point.month % 12;
                return (
                  "Dans " + years + " an" + (years > 1 ? "s" : "") +
                  (months ? " et " + months + " mois" : "") +
                  "  ·  échelon " + point.step
                );
              },
              label: function (item) {
                return " " + item.dataset.label + "  " + euro(item.raw);
              },
              footer: function (items) {
                var point = points[items[0].dataIndex];
                return [
                  "Capital  " + euro(point.capital),
                  "Épargne du mois  " + euro(point.saved)
                ].join("\n");
              }
            }
          }
        }
      }
    });
    return projectionInstance;
  }

  return {
    render: render,
    renderProjection: renderProjection,
    palette: palette,
    euro: euro,
    euroPrecise: euroPrecise,
    euroCompact: euroCompact
  };
})();
