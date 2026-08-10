/**
 * Where a block sits on the timeline.
 *
 * Appointments overlap more often than the exclusion constraint suggests:
 * cancelled and no-show rows do not hold their slot (§7), so a re-booking sits
 * exactly on top of the appointment it replaced. Both have to be visible — the
 * cancelled one is the answer to "but I booked at four".
 */

export interface Slot {
    startMinutes: number;
    endMinutes: number;
}

export interface Placement {
    /** 0-based column within its cluster of overlapping blocks. */
    lane: number;
    /** How many columns that cluster needs. */
    lanes: number;
}

/**
 * Greedy lane assignment, per cluster of blocks that touch.
 *
 * A cluster is a run of blocks connected by overlap; its width is shared only
 * within itself, so one double-booked hour does not narrow the whole day.
 * Zero-length and back-to-back blocks do not overlap: an appointment ending at
 * 14:00 and one starting at 14:00 are consecutive, which is exactly how the
 * `tstzrange` on the server reads them.
 */
export function assignLanes<T extends Slot>(items: readonly T[]): Placement[] {
    const order = items
        .map((item, index) => ({ index, item }))
        .sort((a, b) => a.item.startMinutes - b.item.startMinutes || a.item.endMinutes - b.item.endMinutes);

    const placements: Placement[] = items.map(() => ({ lane: 0, lanes: 1 }));

    let cluster: number[] = [];
    let clusterEnd = Number.NEGATIVE_INFINITY;
    let laneEnds: number[] = [];

    const closeCluster = () => {
        const lanes = Math.max(laneEnds.length, 1);
        for (const index of cluster) {
            const placement = placements[index];
            if (placement) placement.lanes = lanes;
        }
        cluster = [];
        laneEnds = [];
        clusterEnd = Number.NEGATIVE_INFINITY;
    };

    for (const { index, item } of order) {
        if (item.startMinutes >= clusterEnd) closeCluster();

        let lane = laneEnds.findIndex((end) => end <= item.startMinutes);
        if (lane === -1) {
            lane = laneEnds.length;
            laneEnds.push(item.endMinutes);
        } else {
            laneEnds[lane] = item.endMinutes;
        }

        const placement = placements[index];
        if (placement) placement.lane = lane;
        cluster.push(index);
        clusterEnd = Math.max(clusterEnd, item.endMinutes);
    }
    closeCluster();

    return placements;
}
