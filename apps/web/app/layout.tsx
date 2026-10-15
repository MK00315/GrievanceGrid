import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "GrievanceGrid | Civic complaint prototype",
  description: "Report supported civic problems and track authorised officer updates.",
};
export default function RootLayout({children}: {children: React.ReactNode}) {
  return <html lang="en"><body>{children}</body></html>;
}
