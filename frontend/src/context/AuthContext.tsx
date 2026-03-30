import { createContext, useState, ReactNode, useEffect } from "react";

type User = {
  username: string;
  role: "qa" | "coach";
  coach_id?: string | null;
};

type AuthContextType = {
  user: User | null;
  setUser: (user: User | null) => void;
};

export const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);

  //  load from localStorage once
  useEffect(() => {
    const token = localStorage.getItem("token");
    const role = localStorage.getItem("role") as User["role"] | null;
    const username = localStorage.getItem("username");
    const coach_id = localStorage.getItem("coach_id");

    if (token && role && username) {
      setUser({ username, role, coach_id: coach_id || null });
    } else {
      setUser(null);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}
