import type { Metadata } from "next";
import TrailerWorkbench from "./components/TrailerWorkbench";

// The engineering engine is loaded into a browser worker after hydration, so
// the application shell can be exported as a static GitHub Pages document.
export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Trailer Stability | SPMT Engineering Workbench",
  description:
    "Standalone SPMT arrangement search, trailer stability, axle loading, support settling and spine-beam verification.",
  other: {
    "codex-preview": "development",
  },
};

export default function Home() {
  return <TrailerWorkbench />;
}
