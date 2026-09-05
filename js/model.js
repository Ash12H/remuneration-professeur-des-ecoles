/**
 * Pay model: index → gross → net → net of tax, for one career step.
 *
 * Two points where a naive implementation goes wrong: the tax brackets must be
 * the current year's, and the RAFP assiette is capped at 20% of the pensionable
 * base, a cap the first four steps exceed.
 */

var Model = (function () {
  var C = REFERENCE.contributions;

  /** Yearly amount of one item at a given step, before overrides. */
  function baseAnnual(item, ctx) {
    if (item.annualByStep) {
      var amount = item.annualByStep[ctx.step];
      return typeof amount === "number" ? amount : 0;
    }
    return item.annual || 0;
  }

  /**
   * Items that actually apply, with their final yearly amount.
   * `selection` maps item id → true, or → a count for "count" items.
   */
  function resolveItems(ctx, selection, catalogue) {
    var active = catalogue.filter(function (item) {
      if (item.control !== "always" && !selection[item.id]) return false;
      if (item.requires && !selection[item.requires]) return false;
      if (item.isEligible && !item.isEligible(ctx)) return false;
      return true;
    });

    // An item may rewrite another item's amount (PEMF halves the ISAE,
    // a conseiller pédagogique loses it entirely).
    var overrides = {};
    active.forEach(function (item) {
      (item.overrides || []).forEach(function (rule) {
        overrides[rule.targetId] = rule.annual;
      });
    });

    return active.map(function (item) {
      var count = item.control === "count" ? Number(selection[item.id]) || 0 : 1;
      var annual = Object.prototype.hasOwnProperty.call(overrides, item.id)
        ? overrides[item.id]
        : baseAnnual(item, ctx);
      return {
        item: item,
        count: count,
        annual: annual * count,
        monthly: (annual * count) / 12,
        indexPoints: (item.indexPoints || 0) * count
      };
    }).filter(function (line) {
      return line.annual !== 0 || line.indexPoints !== 0;
    });
  }

  /** The bracket scale applied to one share's worth of income. */
  function scale(perShare) {
    var due = 0;
    var floor = 0;
    REFERENCE.incomeTax.brackets.forEach(function (bracket) {
      if (perShare > floor) due += (Math.min(perShare, bracket.upTo) - floor) * bracket.rate;
      floor = bracket.upTo;
    });
    return due;
  }

  /**
   * Yearly income tax, after the 10% deduction, the quotient familial with its
   * ceiling, then the décote. Order matters: the décote is tested against the
   * tax that comes out of the ceiling, and its own threshold depends on whether
   * the household is a couple, never on the number of shares.
   */
  function incomeTax(annualTaxable, household) {
    var tax = REFERENCE.incomeTax;
    var home = household || HOUSEHOLDS[0];
    var base = annualTaxable * (1 - tax.standardDeduction);

    var withShares = scale(base / home.shares) * home.shares;
    var due = withShares;
    if (home.cap > 0) {
      var withoutChildren = scale(base / home.baseShares) * home.baseShares;
      if (withoutChildren - withShares > home.cap) due = withoutChildren - home.cap;
    }

    var decote = home.couple ? tax.decote.couple : tax.decote.single;
    if (due < decote.ceiling) {
      var relief = Math.max(0, decote.amount - tax.decote.rate * due);
      due = Math.max(0, due - relief);
    }
    return due;
  }

  /** Everything about one step, in monthly euros. */
  function computeStep(gradeId, stepData, selection, options) {
    var settings = options || {};
    var catalogue = settings.catalogue || PAY_ITEMS;
    var withHealth = settings.healthInsurance !== false;
    var pointValue = settings.indexPointValue || REFERENCE.indexPointValue;
    var household = settings.household || HOUSEHOLDS[0];
    var otherIncome = settings.otherHouseholdIncome || 0;
    var ctx = { gradeId: gradeId, step: stepData.step, im: stepData.im };

    var lines = resolveItems(ctx, selection, catalogue);

    var extraPoints = lines.reduce(function (sum, line) {
      return sum + line.indexPoints;
    }, 0);
    // NBI and BI are pensionable, so they join the traitement rather than the indemnities.
    var pensionableBase = (stepData.im + extraPoints) * pointValue;
    var indemnities = lines.reduce(function (sum, line) {
      return sum + line.monthly;
    }, 0);
    var gross = pensionableBase + indemnities;

    var pension = pensionableBase * C.pension;
    // The RAFP assiette is capped at 20% of the pensionable base. Below the 5th
    // step the indemnities exceed that cap, so the cap is not cosmetic.
    var rafpBase = Math.min(indemnities, C.rafpCapRatio * pensionableBase);
    var rafp = rafpBase * C.rafp;
    var csgCrds = gross * (C.csg + C.crds);

    var netBeforeTax = gross - pension - rafp - csgCrds;
    var taxableMonthly = gross - pension - rafp - gross * C.csgDeductible;
    // The household's other salary is taxed jointly, so it enters the same base.
    var tax = incomeTax(taxableMonthly * 12 + otherIncome, household) / 12;
    var taxAlone = incomeTax(taxableMonthly * 12, HOUSEHOLDS[0]) / 12;
    var health = withHealth ? REFERENCE.healthInsurance.monthlyEmployeeShare : 0;

    var income = {};
    INCOME_SERIES.forEach(function (series) {
      income[series.id] = 0;
    });
    income.base = pensionableBase;
    lines.forEach(function (line) {
      income[line.item.series] += line.monthly;
    });

    return {
      gradeId: gradeId,
      step: stepData.step,
      im: stepData.im + extraPoints,
      lines: lines,
      income: income,
      deductions: {
        pension: pension,
        rafp: rafp,
        csgCrds: csgCrds,
        incomeTax: tax,
        health: health
      },
      gross: gross,
      netBeforeTax: netBeforeTax,
      taxAlone: taxAlone,
      taxable: taxableMonthly,
      netDisposable: netBeforeTax - tax - health,
      rafpCapped: indemnities > C.rafpCapRatio * pensionableBase
    };
  }

  /** Every step of one grade. */
  function computeGrade(gradeId, selection, options) {
    var grade = CAREER.grades.filter(function (item) {
      return item.id === gradeId;
    })[0];
    return grade.steps.map(function (stepData) {
      return computeStep(gradeId, stepData, selection, options);
    });
  }

  return {
    computeStep: computeStep,
    computeGrade: computeGrade,
    incomeTax: incomeTax
  };
})();
