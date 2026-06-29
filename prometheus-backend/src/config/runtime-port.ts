export function resolveRuntimePort(env: NodeJS.ProcessEnv = process.env): number {
  const rawPort = env.PORT || env.API_PORT || "3100";
  const port = Number(rawPort);
  return Number.isFinite(port) && port > 0 ? port : 3100;
}
