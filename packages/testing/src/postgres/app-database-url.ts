/** Use after provisioning rvu_app through the platform role bootstrap. */
export function appDatabaseUrl(databaseUrl: string, password: string): string {
  const url = new URL(databaseUrl);
  url.username = 'rvu_app';
  url.password = password;
  return url.toString();
}
