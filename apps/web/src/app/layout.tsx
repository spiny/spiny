import "~/styles/globals.css";

import { GeistSans } from "geist/font/sans";
import { type Metadata } from "next";

export const metadata: Metadata = {
  title: "Shawi Web Demo",
  description: "Basic Web App with Next.js",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const response = await fetch("http://localhost:8000/auth/login/azure", {
    headers: {
      "Content-Type": "application/json",
    },
  });
  
  console.log(response.headers.get("content-type"));

  //const session = await response.json();
  //console.log(session);

  return (
    <html lang="en" className={`${GeistSans.variable}`}>
      <body>{children}</body>
    </html>
  );
}
