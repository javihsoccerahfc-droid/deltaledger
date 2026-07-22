/** A simple, honest time-of-day greeting -- not cute, just accurate, for the homepage header. */
export function getTimeAwareGreeting(now: Date = new Date()): string {
  const hour = now.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}
