import manifest from "../data/route-images.json";

type Variant = { src: string; width: number; height: number; bytes: number };
const MANIFEST = manifest as Record<string, { original: string; variants: Variant[] }>;

/**
 * A route photo that cannot move the page or block it: the box has its final size (aspect ratio) before the file arrives, the file
 * is the right width for the screen (WebP, 720 / 1280 px instead of the 2-3 MB originals), it is cached for a year (the file name
 * carries a content hash), and one that fails or is slow just leaves the placeholder colour behind.
 */
export function RouteImage({ routeId, fallbackSrc, sizes, priority = false, style }: { routeId: string; fallbackSrc: string; sizes: string; priority?: boolean; style?: React.CSSProperties }) {
  const entry = MANIFEST[routeId];
  const variants = entry?.variants ?? [];
  const biggest = variants[variants.length - 1];
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={biggest ? variants[0].src : fallbackSrc}
      srcSet={variants.length ? variants.map((v) => `${v.src} ${v.width}w`).join(", ") : undefined}
      sizes={variants.length ? sizes : undefined}
      width={variants[0]?.width}
      height={variants[0]?.height}
      alt=""
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      {...(priority ? { fetchPriority: "high" as const } : {})}
      onError={(e) => {
        e.currentTarget.style.visibility = "hidden";
      }}
      style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", ...style }}
    />
  );
}
