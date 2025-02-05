export function exitWithError(error: unknown): never {
  console.error(String(error));
  process.exit(1);
}
