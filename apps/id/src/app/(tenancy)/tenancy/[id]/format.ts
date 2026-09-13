export function formatEventTime(value: Date): string {
  return value.toLocaleDateString("en-GB", {
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
  });
}
