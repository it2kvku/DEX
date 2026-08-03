import Image from "next/image";
import whale from "../../public/brand/whale.png";

/**
 * Logo thương hiệu: cá voi hồng. Ảnh nền trong suốt (tỉ lệ ~1.4:1) nên chỉ
 * cần chỉ định chiều cao, chiều rộng tự suy ra. `priority` cho các chỗ hiện
 * ngay trong viewport đầu (navbar) để tránh nhấp nháy khi tải.
 */
export function BrandLogo({
  height = 28,
  priority = false,
  className,
}: {
  height?: number;
  priority?: boolean;
  className?: string;
}) {
  const width = Math.round((height * whale.width) / whale.height);

  return (
    <Image
      src={whale}
      alt="Web3 Wallet"
      width={width}
      height={height}
      priority={priority}
      className={className}
    />
  );
}
