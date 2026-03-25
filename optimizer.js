(function attachOptimizer(globalScope) {
  const TARGET_AMOUNT = 100;
  const SCALE = 100;
  const EXACT_SOLVER_LIMIT = 18;

  function toUnits(value) {
    return Math.round(Number(value) * SCALE);
  }

  function toAmount(units) {
    return units / SCALE;
  }

  function cloneOrders(orders) {
    return orders.map((order) => ({
      id: order.id,
      amount: Math.round(Number(order.amount) * SCALE) / SCALE,
    }));
  }

  function optimizeOrders(orders, targetAmount = TARGET_AMOUNT) {
    const normalizedOrders = cloneOrders(orders);
    const targetUnits = toUnits(targetAmount);

    const standaloneGroups = [];
    const remainingOrders = [];

    normalizedOrders.forEach((order) => {
      if (toUnits(order.amount) >= targetUnits) {
        standaloneGroups.push([order]);
      } else {
        remainingOrders.push(order);
      }
    });

    let groupedRemainders;

    if (remainingOrders.length <= EXACT_SOLVER_LIMIT) {
      groupedRemainders = solveExactly(remainingOrders, targetUnits);
    } else {
      groupedRemainders = solveHeuristically(remainingOrders, targetUnits);
    }

    const groups = [...standaloneGroups, ...groupedRemainders.groups].sort((groupA, groupB) => {
      const totalA = sumGroup(groupA);
      const totalB = sumGroup(groupB);

      if (totalA !== totalB) {
        return totalA - totalB;
      }

      return groupA.length - groupB.length;
    });

    const leftovers = [...groupedRemainders.leftovers].sort(
      (a, b) => b.amount - a.amount || a.id.localeCompare(b.id)
    );

    return { groups, leftovers };
  }

  function solveExactly(orders, targetUnits) {
    const units = orders.map((order) => toUnits(order.amount));
    const size = orders.length;
    const fullMask = (1 << size) - 1;
    const sumCache = new Map([[0, 0]]);
    const memo = new Map();

    function getMaskSum(mask) {
      if (sumCache.has(mask)) {
        return sumCache.get(mask);
      }

      const lowestBit = mask & -mask;
      const index = Math.log2(lowestBit);
      const value = getMaskSum(mask ^ lowestBit) + units[index];
      sumCache.set(mask, value);
      return value;
    }

    function betterResult(candidate, current) {
      if (!current) {
        return true;
      }

      if (candidate.groupCount !== current.groupCount) {
        return candidate.groupCount > current.groupCount;
      }

      if (candidate.groupedUnits !== current.groupedUnits) {
        return candidate.groupedUnits < current.groupedUnits;
      }

      return candidate.leftoverUnits > current.leftoverUnits;
    }

    function search(mask) {
      if (mask === 0) {
        return {
          groupCount: 0,
          groupedUnits: 0,
          leftoverUnits: 0,
          groupMasks: [],
        };
      }

      if (memo.has(mask)) {
        return memo.get(mask);
      }

      const totalUnits = getMaskSum(mask);
      let best = {
        groupCount: 0,
        groupedUnits: 0,
        leftoverUnits: totalUnits,
        groupMasks: [],
      };

      const anchorBit = mask & -mask;
      let subset = mask;

      while (subset > 0) {
        if ((subset & anchorBit) !== 0) {
          const subsetUnits = getMaskSum(subset);

          if (subsetUnits >= targetUnits) {
            const remainder = search(mask ^ subset);
            const candidate = {
              groupCount: remainder.groupCount + 1,
              groupedUnits: remainder.groupedUnits + subsetUnits,
              leftoverUnits: remainder.leftoverUnits,
              groupMasks: [subset, ...remainder.groupMasks],
            };

            if (betterResult(candidate, best)) {
              best = candidate;
            }
          }
        }

        subset = (subset - 1) & mask;
      }

      memo.set(mask, best);
      return best;
    }

    const best = search(fullMask);
    const usedMask = best.groupMasks.reduce((mask, groupMask) => mask | groupMask, 0);
    const groups = best.groupMasks.map((groupMask) =>
      maskToOrders(groupMask, orders).sort((a, b) => a.id.localeCompare(b.id))
    );
    const leftovers = maskToOrders(fullMask ^ usedMask, orders);

    return { groups, leftovers };
  }

  function solveHeuristically(orders, targetUnits) {
    const pool = [...orders].sort((a, b) => toUnits(a.amount) - toUnits(b.amount));
    const groups = [];
    const leftovers = [];

    while (pool.length > 0) {
      const subsetIndexes = findBestSubset(pool, targetUnits);

      if (!subsetIndexes) {
        leftovers.push(...pool);
        break;
      }

      const subsetIndexSet = new Set(subsetIndexes);
      const group = [];
      const nextPool = [];

      pool.forEach((order, index) => {
        if (subsetIndexSet.has(index)) {
          group.push(order);
        } else {
          nextPool.push(order);
        }
      });

      group.sort((a, b) => a.id.localeCompare(b.id));
      groups.push(group);
      pool.splice(0, pool.length, ...nextPool);
    }

    return { groups, leftovers };
  }

  function findBestSubset(orders, targetUnits) {
    if (!orders.length) {
      return null;
    }

    const maxOrderUnits = Math.max(...orders.map((order) => toUnits(order.amount)));
    const maxSum = targetUnits + maxOrderUnits;
    const reachable = Array(maxSum + 1).fill(false);
    const previous = Array(maxSum + 1).fill(null);

    reachable[0] = true;

    orders.forEach((order, index) => {
      const units = toUnits(order.amount);

      for (let sum = maxSum - units; sum >= 0; sum -= 1) {
        if (!reachable[sum] || reachable[sum + units]) {
          continue;
        }

        reachable[sum + units] = true;
        previous[sum + units] = { index, prevSum: sum };
      }
    });

    let bestSum = -1;

    for (let sum = targetUnits; sum <= maxSum; sum += 1) {
      if (reachable[sum]) {
        bestSum = sum;
        break;
      }
    }

    if (bestSum === -1) {
      return null;
    }

    const indexes = [];
    let cursor = bestSum;

    while (cursor > 0) {
      const step = previous[cursor];

      if (!step) {
        return null;
      }

      indexes.push(step.index);
      cursor = step.prevSum;
    }

    return indexes;
  }

  function maskToOrders(mask, orders) {
    const selected = [];

    for (let index = 0; index < orders.length; index += 1) {
      if ((mask & (1 << index)) !== 0) {
        selected.push(orders[index]);
      }
    }

    return selected;
  }

  function sumGroup(group) {
    return group.reduce((sum, order) => sum + order.amount, 0);
  }

  const api = {
    TARGET_AMOUNT,
    optimizeOrders,
    toAmount,
    toUnits,
  };

  globalScope.OrderOptimizer = api;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
