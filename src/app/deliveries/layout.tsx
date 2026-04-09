import type { ReactNode } from "react";

/** Default until the client page sets a tab-specific title (Bestek, Leveringsbon, PID). */
export const metadata = {
  title: "Deliveries",
};

export default function DeliveriesLayout({ children }: { children: ReactNode }) {
  return children;
}
