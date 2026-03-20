from __future__ import annotations

from bisect import bisect_left
from dataclasses import dataclass
from typing import Iterable


TARGET_AMOUNT = 100


@dataclass(frozen=True)
class Order:
    order_id: str
    amount: int


@dataclass
class GroupResult:
    grouped_orders: list[list[Order]]
    leftover_orders: list[Order]


def optimize_order_groups(
    orders: Iterable[Order], target_amount: int = TARGET_AMOUNT
) -> GroupResult:
    """
    Greedy heuristic:
    1. Orders whose amount >= target are extracted as standalone groups.
    2. For the remaining orders, repeatedly take the current largest order as an anchor.
    3. If the group is still below target, first try to find the smallest order that can
       close the gap directly. Otherwise, add the current smallest order and continue.

    This avoids exponential enumeration while usually producing:
    - many valid groups
    - low overflow per group
    """

    standalone_groups: list[list[Order]] = []
    remaining_orders: list[Order] = []

    for order in orders:
        if order.amount >= target_amount:
            standalone_groups.append([order])
        else:
            remaining_orders.append(order)

    # Keep the candidate pool sorted in ascending amount so we can:
    # - quickly take the largest anchor from the end
    # - use binary search to find a close-the-gap order
    remaining_orders.sort(key=lambda item: (item.amount, item.order_id))

    combined_groups: list[list[Order]] = []
    leftovers: list[Order] = []

    while remaining_orders:
        current_group = [remaining_orders.pop()]
        current_total = current_group[0].amount

        while current_total < target_amount and remaining_orders:
            gap = target_amount - current_total
            amounts = [order.amount for order in remaining_orders]
            idx = bisect_left(amounts, gap)

            if idx < len(remaining_orders):
                picked = remaining_orders.pop(idx)
            else:
                picked = remaining_orders.pop(0)

            current_group.append(picked)
            current_total += picked.amount

        if current_total >= target_amount:
            combined_groups.append(sorted(current_group, key=lambda item: item.order_id))
        else:
            leftovers.extend(current_group)

    all_groups = standalone_groups + combined_groups
    all_groups.sort(
        key=lambda group: (
            sum(order.amount for order in group),
            len(group),
            ",".join(order.order_id for order in group),
        )
    )

    leftovers.sort(key=lambda item: (item.amount, item.order_id), reverse=True)
    return GroupResult(grouped_orders=all_groups, leftover_orders=leftovers)


def print_result(title: str, result: GroupResult) -> None:
    print(f"\n=== {title} ===")
    print(f"Valid group count: {len(result.grouped_orders)}")

    for index, group in enumerate(result.grouped_orders, start=1):
        total = sum(order.amount for order in group)
        overflow = total - TARGET_AMOUNT
        detail = ", ".join(f"{order.order_id}:{order.amount}" for order in group)
        print(f"Group {index:02d} | total={total} | overflow={overflow} | {detail}")

    leftover_total = sum(order.amount for order in result.leftover_orders)
    leftover_detail = ", ".join(
        f"{order.order_id}:{order.amount}" for order in result.leftover_orders
    )
    print(f"Leftover order count: {len(result.leftover_orders)}")
    print(f"Leftover total amount: {leftover_total}")
    print(f"Leftovers: {leftover_detail if leftover_detail else 'None'}")


def build_mock_orders() -> list[Order]:
    return [
        Order("ORD001", 100),
        Order("ORD002", 180),
        Order("ORD003", 99),
        Order("ORD004", 2),
        Order("ORD005", 98),
        Order("ORD006", 3),
        Order("ORD007", 76),
        Order("ORD008", 24),
        Order("ORD009", 65),
        Order("ORD010", 35),
        Order("ORD011", 51),
        Order("ORD012", 49),
        Order("ORD013", 50),
        Order("ORD014", 50),
        Order("ORD015", 7),
    ]


def build_corner_case_99_and_2() -> list[Order]:
    return [
        Order("A01", 99),
        Order("A02", 99),
        Order("A03", 99),
        Order("B01", 2),
        Order("B02", 2),
        Order("B03", 2),
    ]


def build_corner_case_50s() -> list[Order]:
    return [
        Order("C01", 50),
        Order("C02", 50),
        Order("C03", 50),
        Order("C04", 50),
    ]


def main() -> None:
    mock_orders = build_mock_orders()
    mock_result = optimize_order_groups(mock_orders)
    print_result("Mock data (15 orders)", mock_result)

    case_99_and_2 = optimize_order_groups(build_corner_case_99_and_2())
    print_result("Corner case: all 99 and 2", case_99_and_2)

    case_50s = optimize_order_groups(build_corner_case_50s())
    print_result("Corner case: 50, 50, 50, 50", case_50s)


if __name__ == "__main__":
    main()
