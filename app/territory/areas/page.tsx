"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Loading } from "../../components/Loading";

/** The old area map. Choosing a Territory now happens on the Territory screen itself; old links land on its picker. */
export default function AreasRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/territory?choose=1");
  }, [router]);
  return <Loading label="Opening Territory..." />;
}
