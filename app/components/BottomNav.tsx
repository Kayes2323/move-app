import Link from "next/link";

export type NavTab = "home" | "routes" | "ranks" | "profile";

const TABS: { id: NavTab; href: string; label: string; icon: React.ReactNode }[] = [
  { id: "home", href: "/", label: "Home", icon: <path d="M4 11l8-7 8 7v8a1 1 0 01-1 1h-4v-6h-6v6H5a1 1 0 01-1-1z" /> },
  {
    id: "routes",
    href: "/journey",
    label: "Journeys",
    icon: (
      <>
        <circle cx="6" cy="18" r="2" />
        <circle cx="18" cy="6" r="2" />
        <path d="M8 18h6a3 3 0 000-6h-4a3 3 0 010-6h6" />
      </>
    ),
  },
  { id: "ranks", href: "/leaderboard", label: "Ranks", icon: <path d="M3 20h18M5 20v-6h4v6M10 20V8h4v12M15 20v-9h4v9" /> },
  {
    id: "profile",
    href: "/profile",
    label: "Profile",
    icon: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21c1-4 4-6 8-6s7 2 8 6" />
      </>
    ),
  },
];

export function BottomNav({ active }: { active: NavTab }) {
  return (
    <nav className="nav" aria-label="Main">
      <div className="nav-in">
        {TABS.map((t) => (
          <Link key={t.id} href={t.href} aria-current={t.id === active ? "page" : undefined}>
            <svg className="ic" viewBox="0 0 24 24" aria-hidden="true">
              {t.icon}
            </svg>
            {t.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
