from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from typing import Iterable


TARGET_AMOUNT = 100
SCALE = 100
EXACT_SOLVER_LIMIT = 18


@dataclass(frozen=True)
class Order:
    order_id: str
    amount: float


@dataclass
class GroupResult:
    grouped_orders: list[list[Order]]
    leftover_orders: list[Order]


def to_units(value: float) -> int:
    return round(float(value) * SCALE)


def optimize_order_groups(
    orders: Iterable[Order], target_amount: float = TARGET_AMOUNT
) -> GroupResult:
    normalized_orders = [
        Order(order.order_id, round(float(order.amount) * SCALE) / SCALE) for order in orders
    ]
    target_units = to_units(target_amount)

    standalone_groups: list[list[Order]] = []
    remaining_orders: list[Order] = []

    for order in normalized_orders:
        if to_units(order.amount) >= target_units:
            standalone_groups.append([order])
        else:
            remaining_orders.append(order)

    if len(remaining_orders) <= EXACT_SOLVER_LIMIT:
        grouped_result = solve_exactly(remaining_orders, target_units)
    else:
        grouped_result = solve_heuristically(remaining_orders, target_units)

    all_groups = standalone_groups + grouped_result.grouped_orders
    all_groups.sort(
        key=lambda group: (
            sum(order.amount for order in group),
            len(group),
            ",".join(order.order_id for order in group),
        )
    )

    leftovers = sorted(
        grouped_result.leftover_orders,
        key=lambda item: (item.amount, item.order_id),
        reverse=True,
    )
    return GroupResult(grouped_orders=all_groups, leftover_orders=leftovers)


def solve_exactly(orders: list[Order], target_units: int) -> GroupResult:
    units = [to_units(order.amount) for order in orders]
    full_mask = (1 << len(orders)) - 1

    @lru_cache(maxsize=None)
    def mask_sum(mask: int) -> int:
        total = 0
        index = 0
        current_mask = mask
        while current_mask:
            if current_mask & 1:
                total += units[index]
            current_mask >>= 1
            index += 1
        return total

    @lru_cache(maxsize=None)
    def search(mask: int) -> tuple[int, int, tuple[int, ...]]:
        if mask == 0:
            return 0, 0, ()

        total_units = mask_sum(mask)
        best = (0, total_units, ())
        anchor_bit = mask & -mask
        subset = mask

        while subset:
            if subset & anchor_bit:
                subset_units = mask_sum(subset)
                if subset_units >= target_units:
                    remainder_count, remainder_grouped_units, remainder_masks = search(mask ^ subset)
                    candidate = (
                        remainder_count + 1,
                        remainder_grouped_units + subset_units,
                        (subset,) + remainder_masks,
                    )

                    if is_better(candidate, best, total_units):
                        best = candidate

            subset = (subset - 1) & mask

        return best

    group_count, grouped_units, group_masks = search(full_mask)
    used_mask = 0
    groups: list[list[Order]] = []

    for group_mask in group_masks:
        used_mask |= group_mask
        groups.append(sorted(mask_to_orders(group_mask, orders), key=lambda item: item.order_id))

    leftovers = mask_to_orders(full_mask ^ used_mask, orders)
    _ = group_count, grouped_units
    return GroupResult(grouped_orders=groups, leftover_orders=leftovers)


def solve_heuristically(orders: list[Order], target_units: int) -> GroupResult:
    pool = sorted(orders, key=lambda item: (item.amount, item.order_id))
    groups: list[list[Order]] = []
    leftovers: list[Order] = []

    while pool:
        subset_indexes = find_best_subset(pool, target_units)
        if subset_indexes is None:
            leftovers.extend(pool)
            break

        chosen = set(subset_indexes)
        group = [order for index, order in enumerate(pool) if index in chosen]
        pool = [order for index, order in enumerate(pool) if index not in chosen]
        groups.append(sorted(group, key=lambda item: item.order_id))

    return GroupResult(grouped_orders=groups, leftover_orders=leftovers)


def find_best_subset(orders: list[Order], target_units: int) -> list[int] | None:
    if not orders:
        return None

    max_order_units = max(to_units(order.amount) for order in orders)
    max_sum = target_units + max_order_units
    reachable = [False] * (max_sum + 1)
    previous: list[tuple[int, int] | None] = [None] * (max_sum + 1)
    reachable[0] = True

    for index, order in enumerate(orders):
        units = to_units(order.amount)
        for current_sum in range(max_sum - units, -1, -1):
            if not reachable[current_sum] or reachable[current_sum + units]:
                continue

            reachable[current_sum + units] = True
            previous[current_sum + units] = (index, current_sum)

    best_sum = next((total for total in range(target_units, max_sum + 1) if reachable[total]), None)
    if best_sum is None:
        return None

    indexes: list[int] = []
    cursor = best_sum
    while cursor > 0:
        step = previous[cursor]
        if step is None:
            return None
        index, cursor = step
        indexes.append(index)

    return indexes


def mask_to_orders(mask: int, orders: list[Order]) -> list[Order]:
    return [orders[index] for index in range(len(orders)) if mask & (1 << index)]


def is_better(
    candidate: tuple[int, int, tuple[int, ...]],
    current: tuple[int, int, tuple[int, ...]],
    total_units: int,
) -> bool:
    candidate_count, candidate_grouped_units, _ = candidate
    current_count, current_grouped_units, _ = current

    if candidate_count != current_count:
        return candidate_count > current_count

    if candidate_grouped_units != current_grouped_units:
        return candidate_grouped_units < current_grouped_units

    candidate_leftover_units = total_units - candidate_grouped_units
    current_leftover_units = total_units - current_grouped_units
    return candidate_leftover_units > current_leftover_units


def print_result(title: str, result: GroupResult, target_amount: float = TARGET_AMOUNT) -> None:
    print(f"\n=== {title} ===")
    print(f"Valid group count: {len(result.grouped_orders)}")

    for index, group in enumerate(result.grouped_orders, start=1):
        total = sum(order.amount for order in group)
        overflow = round(total - target_amount, 2)
        detail = ", ".join(f"{order.order_id}:{order.amount}" for order in group)
        print(f"Group {index:02d} | total={total} | overflow={overflow} | {detail}")

    leftover_total = round(sum(order.amount for order in result.leftover_orders), 2)
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


def build_counter_example() -> list[Order]:
    return [
        Order("X01", 1),
        Order("X02", 2),
        Order("X03", 87),
        Order("X04", 92),
        Order("X05", 97),
    ]


def main() -> None:
    mock_result = optimize_order_groups(build_mock_orders())
    print_result("Mock data (15 orders)", mock_result)

    case_99_and_2 = optimize_order_groups(build_corner_case_99_and_2())
    print_result("Corner case: all 99 and 2", case_99_and_2)

    case_50s = optimize_order_groups(build_corner_case_50s())
    print_result("Corner case: 50, 50, 50, 50", case_50s)

    counter_example = optimize_order_groups(build_counter_example())
    print_result("Counter example: 1, 2, 87, 92, 97", counter_example)


if __name__ == "__main__":
    main()
