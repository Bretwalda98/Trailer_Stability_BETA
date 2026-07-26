import type { Metadata } from "next";
import TrailerWorkbench from "./components/TrailerWorkbench";

export const metadata: Metadata = {
  title: "Trailer Stability | Native Engineering Suite",
  description:
    "Standalone trailer stability, axle loading, support settling, spine-beam and optimisation application.",
  other: {
    "codex-preview": "development",
  },
};

export default function Home() {
  return <TrailerWorkbench />;
}
