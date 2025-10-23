import { useState } from "react";
import { BloodyButton } from "@/components/themes/bloody";
import { Input } from "@/components/ui/input";
import { useUserStore } from "@/stores/useUserStore";

export default function TestLogin() {
  const [email, setEmail] = useState("dev@dev.dev");
  const [password, setPassword] = useState("dev");
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useUserStore();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const response = await fetch("http://localhost:8000/api/nei/v1/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          username: email,
          password: password,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        login({ token: data.access_token });
        alert("Login successful!");
      } else {
        const error = await response.json();
        alert(`Login failed: ${error.detail}`);
      }
    } catch (error) {
      alert(`Login error: ${error}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-900 to-black">
      <div className="bg-white/10 backdrop-blur-sm rounded-lg p-8 w-full max-w-md">
        <h2 className="text-2xl font-bold text-white mb-6 text-center">
          Rally Login (Test)
        </h2>
        
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-white text-sm font-medium mb-2">
              Email
            </label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full"
              required
            />
          </div>
          
          <div>
            <label className="block text-white text-sm font-medium mb-2">
              Password
            </label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full"
              required
            />
          </div>
          
          <BloodyButton
            type="submit"
            disabled={isLoading}
            className="w-full"
          >
            {isLoading ? "Logging in..." : "Login"}
          </BloodyButton>
        </form>
        
        <div className="mt-6 text-center text-white/70 text-sm">
          <p>This is a test login component.</p>
          <p>You need to be logged in to access Rally features.</p>
        </div>
      </div>
    </div>
  );
}
