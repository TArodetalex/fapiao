(function attachOptimizer(globalScope) {
  const TARGET_AMOUNT = 100;

  function optimizeOrders(orders, targetAmount = TARGET_AMOUNT) {
    const standaloneGroups = [];
    const remainingOrders = [];

    orders.forEach((order) => {
      if (order.amount >= targetAmount) {
        standaloneGroups.push([order]);
      } else {
        remainingOrders.push(order);
      }
    });

    remainingOrders.sort((a, b) => {
      if (a.amount !== b.amount) {
        return a.amount - b.amount;
      }
      return a.id.localeCompare(b.id);
    });

    const combinedGroups = [];
    const leftovers = [];

    while (remainingOrders.length > 0) {
      const currentGroup = [remainingOrders.pop()];
      let currentTotal = currentGroup[0].amount;

      while (currentTotal < targetAmount && remainingOrders.length > 0) {
        const gap = targetAmount - currentTotal;
        let pickIndex = remainingOrders.findIndex((item) => item.amount >= gap);

        if (pickIndex === -1) {
          pickIndex = 0;
        }

        const picked = remainingOrders.splice(pickIndex, 1)[0];
        currentGroup.push(picked);
        currentTotal += picked.amount;
      }

      if (currentTotal >= targetAmount) {
        currentGroup.sort((a, b) => a.id.localeCompare(b.id));
        combinedGroups.push(currentGroup);
      } else {
        leftovers.push(...currentGroup);
      }
    }

    const groups = [...standaloneGroups, ...combinedGroups].sort((groupA, groupB) => {
      const totalA = groupA.reduce((sum, item) => sum + item.amount, 0);
      const totalB = groupB.reduce((sum, item) => sum + item.amount, 0);

      if (totalA !== totalB) {
        return totalA - totalB;
      }

      return groupA.length - groupB.length;
    });

    leftovers.sort((a, b) => b.amount - a.amount || a.id.localeCompare(b.id));

    return { groups, leftovers };
  }

  const api = {
    TARGET_AMOUNT,
    optimizeOrders,
  };

  globalScope.OrderOptimizer = api;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
