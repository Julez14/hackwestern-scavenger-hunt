import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const dico = localFont({
  src: "../../public/fonts/dico/Dico.ttf",
  variable: "--font-dico",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Hack Western 13 Scavenger Hunt 🐎",
  description: "Hack Western 13 Organizer Scavenger Hunt 🐎",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${dico.variable} font-figtree`}>
        {children}
        <footer className="px-4 pb-5 text-center text-xs font-semibold text-medium">
          <p className="mx-auto max-w-sm">
            v1 by Hunter Chen • v2 by Julian Laxman •{" "}
            <a
              className="text-heavy underline decoration-dashed underline-offset-4"
              href="https://github.com/Julez14/hackwestern-scavenger-hunt"
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub
            </a>
          </p>
        </footer>
      </body>
    </html>
  );
}
