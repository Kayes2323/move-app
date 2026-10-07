import { ROUTES } from "../../data/routes";
import JourneyDetail from "./JourneyDetail";

// Known at build time, so the page can also be exported as static files for the native app shell.
export function generateStaticParams() {
  return ROUTES.map((route) => ({ id: route.id }));
}

export default function JourneyDetailPage() {
  return <JourneyDetail />;
}
