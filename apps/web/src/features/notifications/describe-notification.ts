export function describeNotification(type: string): string {
  return type
    .replaceAll(/[._]/g, ' ')
    .toLowerCase()
    .replace(/^./, (c) => c.toUpperCase());
}
