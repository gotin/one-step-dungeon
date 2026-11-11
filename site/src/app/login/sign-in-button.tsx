"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export function SignInButton() {
  const [pending, setPending] = useState(false);
  return (
    <button
      type="button"
      className="button"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        await authClient.signIn.social({
          provider: "github",
          callbackURL: "/admin/",
          errorCallbackURL: "/login/",
        });
      }}
    >
      {pending ? "GitHub へ移動中…" : "GitHub でログイン"}
    </button>
  );
}
