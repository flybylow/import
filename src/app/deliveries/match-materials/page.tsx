import { Suspense } from "react";
import MatchMaterialsClient from "./MatchMaterialsClient";

export default function MatchMaterialsPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto w-full min-w-0 max-w-[1024px] px-4 py-10 text-sm text-zinc-500 sm:px-6">
          Loading…
        </div>
      }
    >
      <MatchMaterialsClient />
    </Suspense>
  );
}
