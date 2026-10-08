"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Loading } from "../../components/Loading";

/** The old area map. Choosing a Territory now happens on the Territory page itself; old links land there. */
export default function AreasRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/territory");
  }, [router]);
  return <Loading label="Opening Territory..." />;
}
