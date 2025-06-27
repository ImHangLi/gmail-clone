"use client";

import { Button } from "./ui/button";
import { signOut } from "~/lib/auth-client";
import { LogOut } from "lucide-react";
import { toast } from "sonner";

export function SignOutButton() {
  const handleSignOut = async () => {
    await signOut();
    toast.success("Signed out successfully");
    window.location.href = "/login";
  };

  return (
    <Button
      variant="outline"
      size="icon"
      onClick={handleSignOut}
      title="Sign out"
    >
      <LogOut className="h-4 w-4 stroke-red-500" />
    </Button>
  );
}
