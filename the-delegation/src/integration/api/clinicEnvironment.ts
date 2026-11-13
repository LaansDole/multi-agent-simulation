/**
 * clinicEnvironment -- Pure reading of the DynaClinic hospital environment from the event stream.
 * No imports, no IO. The backend keeps the state in global_state['environment']
 * (functions/edge_processor/dynaclinic_environment.py, dynaclinic/devall_nodes.py) and streams only
 * text: the day-start `Environment:` line (PatientDataGenerator's input, in its node-start log), the
 * Care Team's `Resource note:` and the sweep's `staff_fatigue>=2 overrides` rule.
 * ponytail: staff_fatigue and the stock are never printed, so the tracker replays the backend's
 * bookkeeping with three mirrored constants; print both in the Environment line to drop the mirror.
 */

/** dc_uncertainty clamps to hierarchical at `staff_fatigue >= 2`; the same value sends staff on a break. */
export const FATIGUE_THRESHOLD = 2;
/** RESTOCK_EVERY_DAYS: stock returns on day 1, 5, 9, ... */
const RESTOCK_EVERY_DAYS = 4;

/** What the 3D scene shows of the environment. */
export interface ClinicState {
  /** `day` / `short`; null before the first day starts. */
  staffing: string | null;
  /** Care Team roles with no stock left (`imaging`, `pathology`, `pharmacology`). */
  depleted: string[];
}

export interface ShiftStart {
  /** From the `Day N:` prefix; null without one. */
  day: number | null;
  staffing: string;
}

const ENVIRONMENT_LINE = /^Environment:.*\bstaffing_level=(\w+)/m;
const DAY_PREFIX = /^Day (\d+):/m;
const RESOURCE_NOTE = /^Resource note: (.*)$/m;
/** `<roles> unavailable today (depleted)` and `<roles> depleted; consulted anyway (...)`, roles comma-separated. */
const DEPLETED_ROLES = /([a-z_, ]+?) (?:unavailable today \(depleted\)|depleted; consulted anyway)/g;
const FATIGUE_CLAMP = /^Rule:.*\bstaff_fatigue>=\d+ overrides/m;

/** The day-start message (`Day N: ...` + `Environment: ..., staffing_level=<level>`); null for any other text. */
export function parseShiftStart(text: string): ShiftStart | null {
  const staffing = ENVIRONMENT_LINE.exec(text)?.[1];
  if (!staffing) return null;
  const day = DAY_PREFIX.exec(text)?.[1];
  return { day: day ? Number(day) : null, staffing };
}

/** Care Team roles a dc_care_team output's `Resource note:` reports as depleted; [] without a note. */
export function parseDepleted(output: string): string[] {
  const note = RESOURCE_NOTE.exec(output)?.[1] ?? '';
  return [...note.matchAll(DEPLETED_ROLES)].flatMap((match) => match[1].split(',').map((role) => role.trim()).filter(Boolean));
}

/** True when a dc_uncertainty output says staff fatigue forced the mode. */
export function fatigueClamped(output: string): boolean {
  return FATIGUE_CLAMP.test(output);
}

/** One run's environment as seen in the stream. Feed it events in arrival order. */
export class ClinicEnvironment {
  private day: number | null = null;
  private staffing: string | null = null;
  private readonly depleted = new Set<string>();
  private fatigue = 0;
  private breakDue = false;

  /**
   * A new day: staffing changes, staff rest overnight, stock returns on restock days.
   * False when the day is already running (the same message can reach several logs).
   */
  public shiftStarted(shift: ShiftStart): boolean {
    if (shift.day !== null && shift.day === this.day) return false;
    this.day = shift.day;
    this.staffing = shift.staffing;
    this.fatigue = Math.max(0, this.fatigue - 1);
    if (shift.day !== null && (shift.day - 1) % RESTOCK_EVERY_DAYS === 0) this.depleted.clear();
    return true;
  }

  /** dc_care_team finished: a resource note names depleted roles and costs two fatigue, else one. */
  public careTeamCompleted(output: string): void {
    const roles = parseDepleted(output);
    roles.forEach((role) => this.depleted.add(role));
    this.raise(this.fatigue + (roles.length > 0 ? 2 : 1));
  }

  /** dc_uncertainty finished: its fatigue clamp proves the threshold, whatever was tracked. */
  public sweepCompleted(output: string): void {
    if (fatigueClamped(output)) this.raise(Math.max(this.fatigue, FATIGUE_THRESHOLD));
  }

  private raise(fatigue: number): void {
    if (this.fatigue < FATIGUE_THRESHOLD && fatigue >= FATIGUE_THRESHOLD) this.breakDue = true;
    this.fatigue = fatigue;
  }

  /** The consult is over: true exactly once per crossing of FATIGUE_THRESHOLD since the last call. */
  public consultEnded(): boolean {
    const due = this.breakDue;
    this.breakDue = false;
    return due;
  }

  public state(): ClinicState {
    return { staffing: this.staffing, depleted: [...this.depleted].sort() };
  }
}
