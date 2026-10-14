"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function SignInRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/signup?next=%2Fdashboard");
  }, [router]);

  return null;
}
