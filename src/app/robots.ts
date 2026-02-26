import type { MetadataRoute } from 'next';

const BASE_URL = process.env.NEXTAUTH_URL || 'https://admaker.io';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/admin', '/settings', '/projects'],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
