// "Deactivated sinks to the bottom, alphabetical within each group" is a rule
// the dashboard roster and the teacher manager both follow. It lives here so
// the two lists cannot drift apart, and so it is stated once.

export interface Deactivatable {
  name: string
  status?: string
}

const isDeactivated = (item: Deactivatable): boolean => item.status === 'deactivated'

// Items with no status rank alongside active ones, so a list of statusless
// records collapses to plain alphabetical order.
export const deactivatedLast = (a: Deactivatable, b: Deactivatable): number =>
  Number(isDeactivated(a)) - Number(isDeactivated(b)) || a.name.localeCompare(b.name)

export const sortDeactivatedLast = <T extends Deactivatable>(items: T[]): T[] =>
  [...items].sort(deactivatedLast)
