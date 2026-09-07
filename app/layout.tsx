import type {Metadata} from 'next';
import './globals.css'; // Global styles

export const metadata: Metadata = {
  title: 'Transcribe CLI Dashboard',
  description: 'A batch transcription CLI powered by Gemini 3.5 Transcribe.',
  openGraph: {
    title: 'Transcribe CLI Dashboard',
    description: 'A batch transcription CLI powered by Gemini 3.5 Transcribe.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Transcribe CLI Dashboard',
    description: 'A batch transcription CLI powered by Gemini 3.5 Transcribe.',
  },
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
