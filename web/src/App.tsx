import { GraduationCap, LogOut, MessageSquare, Sparkles } from "lucide-react";
import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { LoginPage } from "@/pages/LoginPage";
import { ConversationsPage } from "@/pages/ConversationsPage";
import { MatriculasPage } from "@/pages/MatriculasPage";
import { Avatar, Button, Spinner } from "@/components/ui";
import { cn } from "@/lib/utils";

/**
 * Navigation. Only the sections that actually exist are listed — a link to a
 * screen that has not been rebuilt yet would be a dead end, and this app is
 * being migrated section by section.
 */
const NAV = [
  { to: "/conversaciones", label: "Conversaciones", icon: MessageSquare },
  { to: "/matriculas", label: "Matrículas", icon: GraduationCap },
];

function AppShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();

  return (
    <div className="flex h-dvh flex-col bg-background">
      <header className="flex shrink-0 items-center gap-4 border-b border-border px-4 py-3">
        <span className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary">
            <Sparkles className="h-4 w-4 text-primary-foreground" aria-hidden />
          </span>
          <span className="font-display text-lg font-bold tracking-tight">SalesOS</span>
        </span>

        <nav className="flex items-center gap-1">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  "inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive ? "bg-accent text-accent-foreground" : "hover:bg-accent/50",
                )
              }
            >
              <Icon className="h-4 w-4" aria-hidden />
              <span className="hidden sm:inline">{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          {user && (
            <span className="hidden items-center gap-2 sm:flex">
              <Avatar initials={user.initials} color={user.avatarColor} className="h-8 w-8 text-xs" />
              <span className="text-sm">
                <span className="block font-medium leading-tight">{user.name}</span>
                <span className="block text-xs leading-tight text-muted-foreground">
                  {user.role === "advisor" ? "Asesor" : "Administrador"}
                </span>
              </span>
            </span>
          )}
          <Button variant="ghost" size="icon" onClick={() => void logout()} aria-label="Cerrar sesión">
            <LogOut className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      </header>

      <main className="min-h-0 flex-1">{children}</main>
    </div>
  );
}

export function App() {
  const { user, loading } = useAuth();

  // Wait for the session probe before deciding — otherwise a signed-in user
  // sees the login screen flash on every reload.
  if (loading) {
    return (
      <div className="flex h-dvh items-center justify-center bg-background">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  if (!user) return <LoginPage />;

  return (
    <AppShell>
      <Routes>
        <Route path="/conversaciones" element={<ConversationsPage />} />
        <Route path="/matriculas" element={<MatriculasPage />} />
        <Route path="*" element={<Navigate to="/conversaciones" replace />} />
      </Routes>
    </AppShell>
  );
}
