import { clock, percent } from "@/lib/model/format";
import type { Pace } from "@/lib/model/pace";

export const outcome = (pace: Pace) => {
  if (pace.locked) {
    return {
      bad: true,
      note: pace.ranOut === null ? "Locked" : `Ran out ${clock(pace.ranOut)}`,
      text: `Back ${clock(pace.resetsAt)}`,
    };
  }

  const note = `Resets ${clock(pace.resetsAt)}`;

  return pace.runsOut === null
    ? { bad: false, note, text: `~${percent(pace.atReset)} at reset` }
    : { bad: true, note, text: `Runs out ${clock(pace.runsOut)}` };
};
