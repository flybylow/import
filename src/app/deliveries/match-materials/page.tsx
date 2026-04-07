import { Suspense } from "react";
import { appContentWidthClass } from "@/lib/app-page-layout";
import MatchMaterialsClient from "./MatchMaterialsClient";

export default function MatchMaterialsPage() {
  return (
    <Suspense
      fallback={
        <div className={`${appContentWidthClass} py-10 text-sm text-zinc-500`}>
          Loading…
        </div>
      }
    >
      <MatchMaterialsClient />
    </Suspense>
  );
}
