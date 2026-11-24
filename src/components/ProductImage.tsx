import { CATEGORY_IMAGES } from '../utils/format';

interface ProductImageProps {
  src: string;
  alt: string;
  category: string;
  className?: string;
}

export function ProductImage({ alt, category, className = 'w-full h-full object-cover' }: ProductImageProps) {
  return (
    <img
      src={CATEGORY_IMAGES[category] || CATEGORY_IMAGES.Outros}
      alt={alt}
      className={className}
      loading="lazy"
    />
  );
}
