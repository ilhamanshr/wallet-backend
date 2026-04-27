export interface AppConfig {
  port: number;
  databaseUrl: string;
  jwtSecret: string;
  jwtExpiresIn: number;
}

export function loadConfig(): AppConfig {
  const databaseUrl = process.env.DATABASE_URL;
  const jwtSecret = process.env.JWT_SECRET;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }
  if (!jwtSecret) {
    throw new Error('JWT_SECRET is required');
  }

  return {
    port: Number.parseInt(process.env.PORT ?? '3000', 10),
    databaseUrl,
    jwtSecret,
    jwtExpiresIn: Number.parseInt(process.env.JWT_EXPIRES_IN ?? '2592000', 10),
  };
}
