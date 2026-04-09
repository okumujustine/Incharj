import { InfisicalSDK } from '@infisical/sdk';

function secretEntriesToEnv(secrets, fail) {
  const entries = Array.isArray(secrets)
    ? secrets
    : Array.isArray(secrets?.secrets)
      ? secrets.secrets
      : null;

  if (!entries) {
    fail('unexpected secret response shape from Infisical');
  }

  return Object.fromEntries(
    entries
      .map((secret) => [secret?.secretKey, secret?.secretValue])
      .filter(([key, value]) => typeof key === 'string' && value !== undefined && value !== null)
      .map(([key, value]) => [key, String(value)])
  );
}

export const providerMetadata = {
  bootstrapEnv: [
    'INFISICAL_CLIENT_ID',
    'INFISICAL_CLIENT_SECRET',
    'INFISICAL_PROJECT_ID',
    'INFISICAL_ENVIRONMENT',
    'INFISICAL_SECRET_PATH',
    'INFISICAL_SITE_URL (optional)',
  ],
  name: 'infisical',
};

export async function loadSecrets({ fail, requiredEnv }) {
  const clientId = requiredEnv('INFISICAL_CLIENT_ID');
  const clientSecret = requiredEnv('INFISICAL_CLIENT_SECRET');
  const projectId = requiredEnv('INFISICAL_PROJECT_ID');
  const environment = requiredEnv('INFISICAL_ENVIRONMENT');
  const secretPath = requiredEnv('INFISICAL_SECRET_PATH');
  const siteUrl = process.env.INFISICAL_SITE_URL?.trim();

  const client = new InfisicalSDK(siteUrl ? { siteUrl } : {});

  await client.auth().universalAuth.login({
    clientId,
    clientSecret,
  });

  const secrets = await client.secrets().listSecretsWithImports({
    environment,
    expandSecretReferences: true,
    projectId,
    recursive: true,
    secretPath,
    viewSecretValue: true,
  });

  return secretEntriesToEnv(secrets, fail);
}
