import Image from "next/image";

export function BrandLogo({ size = 32 }: { size?: number }) {
  return <Image src="/sentinel.png" alt="" width={size} height={size} sizes={`${size}px`} className="brand-logo" />;
}
