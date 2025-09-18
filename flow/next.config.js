/** @type {import('next').NextConfig} */
const nextConfig = {
  i18n: {
    locales: ['it', 'en'],
    defaultLocale: 'it',
    localeDetection: true,
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'ALLOW-FROM https://*.teams.microsoft.com',
          }
        ],
      },
    ];
  },
};

module.exports = nextConfig;