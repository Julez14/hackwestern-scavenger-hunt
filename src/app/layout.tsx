import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

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
      <body className={inter.className}>
        {children}
        <footer style={{ textAlign: "center", padding: "1rem", fontSize: "0.875rem", color: "#666" }}>
          <p>
            v1 by Hunter Chen • v2 by Julian Laxman •{" "}
            <a href="https://github.com/Julez14/hackwestern-scavenger-hunt" target="_blank" rel="noopener noreferrer">
              GitHub
            </a>
          </p>
        </footer>
      </body>
    </html>
  );
}
