const BASE_URL = 'https://app.infisical.com';

async function infisicalFetch(path, options = {}) {
  const url = `${process.env.INFISICAL_SITE_URL?.trim() || BASE_URL}${path}`;
  const res = await fetch(url, options);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Infisical ${res.status}: ${body}`);
  }
  return res.json();
}

export const providerMetadata = {
  name: 'infisical',
  bootstrapEnv: [
    'INFISICAL_CLIENT_ID',
    'INFISICAL_CLIENT_SECRET',
    'INFISICAL_PROJECT_ID',
    'INFISICAL_ENVIRONMENT',
    'INFISICAL_SECRET_PATH',
  ],
};

export async function loadSecrets({ fail, requiredEnv }) {
  const clientId = requiredEnv('INFISICAL_CLIENT_ID');
  const clientSecret = requiredEnv('INFISICAL_CLIENT_SECRET');
  const projectId = requiredEnv('INFISICAL_PROJECT_ID');
  const environment = requiredEnv('INFISICAL_ENVIRONMENT');
  const secretPath = requiredEnv('INFISICAL_SECRET_PATH');

  const { accessToken } = await infisicalFetch('/api/v1/auth/universal-auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId, clientSecret }),
  });

  const data = await infisicalFetch(
    `/api/v3/secrets/raw?workspaceId=${projectId}&environment=${environment}&secretPath=${encodeURIComponent(secretPath)}&viewSecretValue=true&expandSecretReferences=true`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  const secrets = data.secrets ?? [];
  return Object.fromEntries(
    secrets
      .filter((s) => typeof s.secretKey === 'string' && s.secretValue != null)
      .map((s) => [s.secretKey, String(s.secretValue)])
  );
}
