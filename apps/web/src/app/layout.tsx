import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AETHER: Baguio',
  description: 'A browser-native 3D multi-agent urban simulation of Baguio City',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
