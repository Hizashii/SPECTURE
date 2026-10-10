export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export const formatTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
