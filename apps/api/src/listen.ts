export function listenAddress(env: { HOST?: string; PORT?: string }) {
  const host = env.HOST?.trim() ?? "";
  const hostname = host.length > 0 ? host : "127.0.0.1";
  const rawPort = env.PORT?.trim() ?? "";
  if (rawPort.length === 0) {
    return { hostname, port: 3000 };
  }
  if (!/^\d+$/.test(rawPort)) {
    throw new Error("PORT must be an integer from 0 to 65535");
  }
  const port = Number(rawPort);
  if (port > 65535) {
    throw new Error("PORT must be an integer from 0 to 65535");
  }
  return { hostname, port };
}
