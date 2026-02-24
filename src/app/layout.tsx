import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Ad Video Creator',
  description: 'Create scroll-stopping video ads with timed text overlays',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
