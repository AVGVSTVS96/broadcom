export const startOfDay = (at: number) => {
  const day = new Date(at);

  day.setHours(0, 0, 0, 0);

  return day.getTime();
};

export const addDays = (at: number, days: number) => {
  const day = new Date(at);

  day.setDate(day.getDate() + days);

  return day.getTime();
};

export const addHours = (dayStart: number, hours: number) => {
  const day = new Date(dayStart);

  day.setHours(hours, 0, 0, 0);

  return day.getTime();
};

export const startOfWeek = (at: number) => {
  const day = new Date(startOfDay(at));
  const sinceMonday = (day.getDay() + 6) % 7;

  return addDays(day.getTime(), -sinceMonday);
};

export const lastDays = (now: number, count: number) =>
  Array.from({ length: count }, (_, index) =>
    addDays(startOfDay(now), index - count + 1)
  );
