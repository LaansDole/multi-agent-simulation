/**
 * clinicEnvironment -- Pure reading of the DynaClinic hospital environment from the event stream.
 * No imports, no IO. The backend's seeded engine (dynaclinic/environment) steps once a day, and the day-start
 * message carries the result as one `Environment: {json}` line (inject_day_and_start_shift in
 * functions/edge_processor/dynaclinic_environment.py; it reaches the stream as PatientDataGenerator's input,
 * in its node-start log). Within a day only the Care Team's `Resource note:` reports a change.
 */

/** What the 3D scene shows of the environment. */
export interface ClinicState {
  /** `day` / `short`; null before the first day starts. */
  staffing: string | null;
  /** Care Team roles with no stock left (`imaging`, `pathology`, `pharmacology`). */
  depleted: string[];
}

/** The state a day starts with. */
export interface ShiftStart {
  /** The engine's day; null when the payload has none. */
  day: number | null;
  staffing: string;
  fatigue: number;
  /** dc_uncertainty clamps to hierarchical from here; a day starting there sends staff on a break. */
  fatigueThreshold: number;
  /** Roles whose stock is 0. */
  depleted: string[];
}

const ENVIRONMENT_LINE = /^Environment: (\{.*\})$/m;
const RESOURCE_NOTE = /^Resource note: (.*)$/m;
/** `<roles> unavailable today (depleted)` and `<roles> depleted; consulted anyway (...)`, roles comma-separated. */
const DEPLETED_ROLES = /([a-z_, ]+?) (?:unavailable today \(depleted\)|depleted; consulted anyway)/g;

/**
 * The newest day-start message among a node's input messages (oldest first); null when none is one.
 * PatientDataGenerator keeps every earlier day's message, so on day N its inputs hold days 1..N.
 */
export function parseShiftStart(messages: string[]): ShiftStart | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const line = ENVIRONMENT_LINE.exec(messages[i]);
    if (!line) continue;
    let env: Record<string, unknown>;
    try {
      env = JSON.parse(line[1]);
    } catch {
      continue;
    }
    const stock = (env.resource_availability ?? {}) as Record<string, number>;
    return {
      day: typeof env.day === 'number' ? env.day : null,
      staffing: String(env.staffing_level),
      fatigue: Number(env.staff_fatigue),
      fatigueThreshold: Number(env.fatigue_threshold),
      depleted: Object.keys(stock).filter((role) => stock[role] === 0),
    };
  }
  return null;
}

/** Care Team roles a dc_care_team output's `Resource note:` reports as depleted; [] without a note. */
export function parseDepleted(output: string): string[] {
  const note = RESOURCE_NOTE.exec(output)?.[1] ?? '';
  return [...note.matchAll(DEPLETED_ROLES)].flatMap((match) => match[1].split(',').map((role) => role.trim()).filter(Boolean));
}

/** One run's environment as seen in the stream. Feed it events in arrival order. */
export class ClinicEnvironment {
  private day: number | null = null;
  private staffing: string | null = null;
  private fatigue = 0;
  private depleted = new Set<string>();

  /**
   * A new day replaces the state with the backend's. Null when that day has already started (the
   * same message can reach several logs); otherwise `fatigued` is true when this day starts at
   * the day's fatigue threshold or above and the previous one did not: once per crossing.
   */
  public shiftStarted(shift: ShiftStart): { fatigued: boolean } | null {
    if (shift.day !== null && this.day !== null && shift.day <= this.day) return null;
    const fatigued = this.fatigue < shift.fatigueThreshold && shift.fatigue >= shift.fatigueThreshold;
    this.day = shift.day;
    this.staffing = shift.staffing;
    this.fatigue = shift.fatigue;
    this.depleted = new Set(shift.depleted);
    return { fatigued };
  }

  /** dc_care_team finished: its resource note names the roles found depleted since the day started. */
  public careTeamCompleted(output: string): void {
    parseDepleted(output).forEach((role) => this.depleted.add(role));
  }

  public state(): ClinicState {
    return { staffing: this.staffing, depleted: [...this.depleted].sort() };
  }
}
