import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';
import { cn } from '@/lib/utils';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'VR Point Shooter',
  description: 'Simple VR shooter web game',
  // Add viewport meta tags for better mobile/VR experience
  viewport: 'width=device-width, initial-scale=1, user-scalable=no, minimum-scale=1, maximum-scale=1, shrink-to-fit=no',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full w-full dark">
      <body
        className={cn(
          geistSans.variable,
          geistMono.variable,
          'antialiased h-full w-full overflow-hidden' // Ensure body takes full height and hides overflow
        )}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
