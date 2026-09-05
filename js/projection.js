/**
 * Career and capital projection.
 *
 * Deliberately narrower than the pay chart above it:
 *   - classe normale only, no hors classe (promotion is not automatic, so it
 *     cannot be projected without inventing a date)
 *   - after the 11th step the pay stays flat, which understates a real career
 *   - Pacte and REP+ variable share are excluded, they are neither durable nor
 *     guaranteed, and projecting them would overstate the savings
 *   - one growth rate covers return and inflation together, the user decides
 *     what it means
 */

var Projection = (function () {
  var PROJECTED_GRADE = "cn";

  /** Pay items left out of the projection because they are not durable. */
  var EXCLUDED_ITEMS = ["pacte", "repPlusVariable"];

  function grade() {
    return CAREER.grades.filter(function (item) {
      return item.id === PROJECTED_GRADE;
    })[0];
  }

  /**
   * Career step reached after `months` of seniority.
   * Durations carry half-years, so everything is counted in months.
   */
  function stepAtMonths(months) {
    var steps = grade().steps;
    var elapsed = 0;
    for (var i = 0; i < steps.length; i++) {
      if (steps[i].years === null) return steps[i];
      elapsed += Math.round(steps[i].years * 12);
      if (months < elapsed) return steps[i];
    }
    return steps[steps.length - 1];
  }

  /** Month at which each step starts, for the step markers on the chart. */
  function stepBoundaries(fromMonths, horizonMonths) {
    var marks = [];
    var previous = null;
    for (var m = 0; m <= horizonMonths; m++) {
      var step = stepAtMonths(fromMonths + m).step;
      if (previous !== null && step !== previous) marks.push({ month: m, step: step });
      previous = step;
    }
    return marks;
  }

  function projectionSelection(selection) {
    var kept = {};
    Object.keys(selection || {}).forEach(function (id) {
      if (EXCLUDED_ITEMS.indexOf(id) === -1) kept[id] = selection[id];
    });
    return kept;
  }

  /**
   * Monthly capital path.
   *
   * @param params.seniorityMonths seniority already served when the projection starts
   * @param params.capital         capital held today
   * @param params.savingsRate     share of the disposable net that is saved, 0..1
   * @param params.growthRate      annual growth, net of whatever the user chooses to net out
   * @param params.horizonYears    length of the projection
   */
  function project(params) {
    var horizonMonths = Math.round(params.horizonYears * 12);
    var monthlyRate = Math.pow(1 + params.growthRate, 1 / 12) - 1;
    var selection = projectionSelection(params.selection);
    var payCache = {};

    var capital = params.capital;
    var contributed = params.capital; // capital plus everything paid in since
    var points = [];

    for (var m = 0; m <= horizonMonths; m++) {
      var stepData = stepAtMonths(params.seniorityMonths + m);
      if (!payCache[stepData.step]) {
        payCache[stepData.step] = Model.computeStep(PROJECTED_GRADE, stepData, selection, {
          healthInsurance: params.healthInsurance
        });
      }
      var pay = payCache[stepData.step];
      var saved = pay.netDisposable * params.savingsRate;

      if (m > 0) {
        capital = capital * (1 + monthlyRate) + saved;
        contributed += saved;
      }

      points.push({
        month: m,
        step: stepData.step,
        net: pay.netDisposable,
        saved: saved,
        contributed: contributed,
        gains: capital - contributed,
        capital: capital
      });
    }

    return {
      points: points,
      marks: stepBoundaries(params.seniorityMonths, horizonMonths),
      final: points[points.length - 1],
      // A negative growth rate makes the gains negative, which a stacked area
      // cannot draw honestly. The chart falls back to a single capital area.
      hasLoss: points.some(function (point) {
        return point.gains < 0;
      })
    };
  }

  /** Disposable net and monthly savings at the seniority given, for the budget. */
  function currentPay(params) {
    var stepData = stepAtMonths(params.seniorityMonths);
    var pay = Model.computeStep(PROJECTED_GRADE, stepData, projectionSelection(params.selection), {
      healthInsurance: params.healthInsurance
    });
    return { step: stepData.step, pay: pay };
  }

  return {
    stepAtMonths: stepAtMonths,
    project: project,
    currentPay: currentPay,
    excludedItems: EXCLUDED_ITEMS
  };
})();
